import { join } from "node:path";
import { z } from "zod";
import { type DebtItem, type Dossier, extraJiraLabels, JiraCreateJson, JiraSearchJson, type ScanContext } from "../../domain/schemas.js";
import { assertBotIdentity, type JiraClient, type JiraIssue } from "../../integrations/jira/index.js";
import { agentArgs } from "../../integrations/jira/jira-cli.js";
import { type AgentTool, runAgent } from "../../integrations/llm/agent-loop.js";
import type { UsageMeter } from "../../integrations/llm/usage.js";
import { renderPrompt, skillText } from "../../prompts.js";
import type { StageHooks } from "../progress.js";

export function labelsFor(item: DebtItem, repo: string): string[] {
  return ["tech-debt", `td-sev-${(item.severity ?? "Low").toLowerCase()}`, `td-cat-${item.category}`, `td-fp-${item.fingerprint}`, `td-repo-${slug(repo)}`, ...extraJiraLabels()];
}

const TicketerResult = z.object({ action: z.enum(["created", "existing"]), key: z.string().min(1) });
type TicketerResult = z.infer<typeof TicketerResult>;

/**
 * The ticketer agent runs the jira-autonomous skill as techdebt-bot: the Epic once, then one run per Debt Item
 * (dedup on td-fp, create or comment, priority + labels, Epic link). Code checks the bot identity first,
 * guards every command the agent sends, verifies the td-fp label landed, and attaches the Dossier over REST.
 */
export async function ticket(
  ctx: ScanContext,
  cut: DebtItem[],
  dossiers: Dossier[],
  jira: JiraClient,
  usage: UsageMeter,
  hooks: StageHooks = {},
): Promise<DebtItem[]> {
  if (cut.length === 0) return [];
  const dossierByFingerprint = new Map(dossiers.map((dossier) => [dossier.fingerprint, dossier]));
  const missingDossiers = cut.filter((item) => !dossierByFingerprint.has(item.fingerprint));
  if (missingDossiers.length) throw new Error(`Missing Dossier for fingerprints: ${missingDossiers.map((item) => item.fingerprint).join(", ")}`);

  // every Jira write below is made as techdebt-bot, never as anyone else
  await assertBotIdentity(jira);
  const skill = skillText("jira-autonomous");
  const { projectKey, issueType, epicName, priorities } = ctx.profile.jira;

  // Fingerprints don't include the repo, so in a project shared by many repos dedup must match the repo label too.
  const repoLabel = `td-repo-${slug(ctx.repo)}`;
  const epicDescription = `Tech debt tracked for repository ${ctx.repo}.`;
  const epicKey = ctx.fallbacks.noEpicLink
    ? null
    : (
        await runTicketer(jira, usage, `${skill}\n\n${renderPrompt("ticketer-epic.md", {})}`, {
          isDedup: (jql) => /issuetype\s*=\s*"?epic/i.test(jql),
          matches: (issue) => issue.summary === epicName,
          projectKey,
          issueType: "Epic",
          summary: epicName,
          description: epicDescription,
          epicKey: null,
          allowComment: false,
          input: {
            projectKey,
            epicName,
            descriptionWiki: epicDescription,
            priority: priorities.Medium,
            labels: ["tech-debt", repoLabel, ...extraJiraLabels()],
          },
        })
      ).key;

  const ticketed: DebtItem[] = [];
  for (const item of cut) {
    const fingerprintLabel = `td-fp-${item.fingerprint}`;
    const dossier = dossierByFingerprint.get(item.fingerprint)!;
    const allowComment = !ctx.fallbacks.noComments;
    const summary = `[Tech Debt] ${item.title}`;
    const descriptionWiki = ticketDescription(ctx, item, dossier, ctx.fallbacks.noAttach);
    const result = await runTicketer(jira, usage, `${skill}\n\n${renderPrompt("ticketer.md", {})}`, {
      isDedup: (jql) => jql.includes(fingerprintLabel) && jql.includes(repoLabel),
      matches: (issue) => issue.labels.includes(fingerprintLabel) && issue.labels.includes(repoLabel),
      projectKey,
      issueType,
      summary,
      description: descriptionWiki,
      epicKey,
      allowComment,
      input: {
        projectKey,
        issueType,
        fingerprint: item.fingerprint,
        repoLabel,
        summary,
        descriptionWiki,
        priority: priorities[item.severity ?? "Low"],
        labels: labelsFor(item, ctx.repo),
        epicKey,
        allowComment,
        commentWiki: `Seen again in tech-debt scan ${ctx.sha}. Fingerprint: ${item.fingerprint}.`,
      },
    });

    if (result.action === "created") {
      if (!(await jira.labels(result.key)).includes(fingerprintLabel))
        throw new Error(`Ticket ${result.key} was created without its ${fingerprintLabel} label, so the next Scan's dedup would miss it`);
      if (!ctx.fallbacks.noAttach) {
        try {
          await jira.attach(result.key, join(ctx.runDir, item.fingerprint, "context.md"));
          await jira.attach(result.key, join(ctx.runDir, item.fingerprint, "impact.md"));
          await jira.attach(result.key, join(ctx.runDir, item.fingerprint, "design-options.md"));
          await jira.attach(result.key, join(ctx.runDir, item.fingerprint, "implementation-plan.md"));
        } catch (error) {
          // Attachments are optional only when preflight reported the noAttach fallback.
          throw new Error(`Ticket ${result.key} was created, but its Dossier could not be attached: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
    ticketed.push({ ...item, ticketKey: result.key });
    hooks.tick?.(`${result.key} ${result.action}`);
  }
  return ticketed;
}

interface TicketerRun {
  /** Is this jql the dedup search the agent must run before it may create? */
  isDedup: (jql: string) => boolean;
  /** Is this dedup hit the issue we're looking for (so creating would be a duplicate)? */
  matches: (issue: JiraIssue) => boolean;
  projectKey: string;
  issueType: string;
  /** Sent as --summary/--description on create whatever the agent passed, so the ticket text is the pipeline's. */
  summary: string;
  description: string;
  epicKey: string | null;
  allowComment: boolean;
  input: Record<string, unknown>;
}

/** One agent run with a jira_cli tool that only lets it touch the issues this run found or created. */
async function runTicketer(jira: JiraClient, usage: UsageMeter, system: string, run: TicketerRun): Promise<TicketerResult> {
  const found = new Set<string>();
  let searched = false;
  let created: string | undefined;

  const tool: AgentTool = {
    name: "jira_cli",
    description: "Run one jira-cli command as techdebt-bot. Pass the arguments after `jira-cli` as an array of strings.",
    parameters: { type: "object", properties: { args: { type: "array", items: { type: "string" } } }, required: ["args"] },
    async run(raw) {
      let args = agentArgs(z.object({ args: z.array(z.string()).min(1) }).parse(raw).args);
      const [cmd, target] = args;
      const deny = (why: string): never => {
        throw new Error(`refused: ${why}`);
      };
      if (cmd === "create") {
        if (!searched) deny("run the dedup search first");
        if (found.size) deny(`${[...found].join(", ")} already exists; do not create a duplicate`);
        if (created) deny(`already created ${created}; create at most one issue`);
        if (flag(args, "--project") !== run.projectKey) deny(`--project must be ${run.projectKey}`);
        if (flag(args, "--type") !== run.issueType) deny(`--type must be ${run.issueType}`);
        args = withFlag(withFlag(args, "--summary", run.summary), "--description", run.description);
      } else if (cmd === "update") {
        if (!created || target !== created) deny("update only the issue this run created");
      } else if (cmd === "comment") {
        if (!run.allowComment) deny("comments are disabled for this Scan");
        if (!target || !found.has(target)) deny("comment only on the issue the dedup search found");
      } else if (cmd === "epics") {
        if (!created || !run.epicKey || flag(args, "--issue") !== created || flag(args, "--epic") !== run.epicKey)
          deny(`link only the issue this run created to ${run.epicKey ?? "no Epic"}`);
      }

      const out = await jira.cli(args);
      if (cmd === "search" && run.isDedup(flag(args, "--jql") ?? "")) {
        searched = true;
        for (const i of JiraSearchJson.parse(out).issues) {
          const issue = { key: i.key, summary: i.summary ?? i.fields?.summary ?? "", labels: i.labels ?? i.fields?.labels ?? [] };
          if (run.matches(issue)) found.add(issue.key);
        }
      }
      if (cmd === "create") created = JiraCreateJson.parse(out).key;
      return JSON.stringify(out).slice(0, 6_000);
    },
  };

  const result = await runAgent({ stage: "ticket", system, user: JSON.stringify(run.input), tools: [tool], outputSchema: TicketerResult, maxSteps: 12, usage });
  if (result.action === "created" && result.key !== created) throw new Error(`Ticketer reported creating ${result.key}, but it created ${created ?? "nothing"}`);
  if (result.action === "existing" && !found.has(result.key)) throw new Error(`Ticketer reported ${result.key} as existing, but its dedup search did not return it`);
  return result;
}

function flag(args: string[], name: string): string | undefined {
  const i = args.findIndex((a) => a === name || a.startsWith(`${name}=`));
  if (i < 0) return undefined;
  return args[i]!.includes("=") ? args[i]!.slice(name.length + 1) : args[i + 1];
}

/** args with every `name` flag removed and `name value` appended. */
function withFlag(args: string[], name: string, value: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === name) i++;
    else if (!args[i]!.startsWith(`${name}=`)) out.push(args[i]!);
  }
  return [...out, name, value];
}

/** prompts/jira-description.wiki; with the noAttach fallback the Dossier is inlined instead of attached. */
function ticketDescription(ctx: ScanContext, item: DebtItem, dossier: Dossier, inlineDossier: boolean): string {
  const evidence = item.findings.flatMap((finding) => finding.evidence).map((bundle) =>
    `* ${bundle.rule} — ${bundle.symbolPath}: ${wiki(bundle.snippet.slice(0, 2_000))}`,
  ).join("\n");
  const scores = item.scores;
  return renderPrompt("jira-description.wiki", {
    summary: wiki(item.description),
    severity: item.severity ?? "Low",
    impact: scores?.impact ?? "—",
    reach: scores?.reach ?? "—",
    churn: scores?.churn ?? "—",
    risk: scores?.risk ?? "—",
    evidence: evidence || "No evidence text supplied.",
    fingerprint: item.fingerprint,
    sha: ctx.sha,
    dossier: inlineDossier
      ? [
          ["Context dossier", dossier.contextMd],
          ["Impact dossier", dossier.impactMd],
          ["Design options", dossier.designOptionsMd],
          ["Implementation plan", dossier.implementationPlanMd],
        ].map(([heading, content]) => `\nh2. ${heading}\n${wiki(content ?? "")}`).join("\n")
      : "",
  });
}

function wiki(value: string): string {
  return value.replace(/\r?\n/g, "\\\\");
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "repo";
}
