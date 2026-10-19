import { join } from "node:path";
import type { DebtItem, Dossier, ScanContext, Severity } from "../../domain/schemas.js";
import type { JiraClient } from "../../integrations/jira/index.js";
import type { UsageMeter } from "../../integrations/llm/usage.js";

export const PRIORITY: Record<Severity, "Major" | "Minor" | "Trivial"> = { High: "Major", Medium: "Minor", Low: "Trivial" };

export function labelsFor(item: DebtItem, repo: string): string[] {
  return ["tech-debt", `td-sev-${(item.severity ?? "Low").toLowerCase()}`, `td-cat-${item.category}`, `td-fp-${item.fingerprint}`, `td-repo-${slug(repo)}`];
}

/** Ensures the Epic, dedups by td-fp label, creates or comments, then attaches the Dossier (in code, not the agent). */
export async function ticket(
  ctx: ScanContext,
  cut: DebtItem[],
  dossiers: Dossier[],
  jira: JiraClient,
  _usage: UsageMeter,
): Promise<DebtItem[]> {
  if (cut.length === 0) return [];
  const dossierByFingerprint = new Map(dossiers.map((dossier) => [dossier.fingerprint, dossier]));
  const missingDossiers = cut.filter((item) => !dossierByFingerprint.has(item.fingerprint));
  if (missingDossiers.length) throw new Error(`Missing Dossier for fingerprints: ${missingDossiers.map((item) => item.fingerprint).join(", ")}`);

  const epic = await findOrCreateEpic(ctx, jira);
  const ticketed: DebtItem[] = [];
  for (const item of cut) {
    const labels = labelsFor(item, ctx.repo);
    const fingerprintLabel = `td-fp-${item.fingerprint}`;
    const existing = (await jira.search(`project = ${ctx.profile.jira.projectKey} AND labels = "${fingerprintLabel}"`))
      .find((issue) => issue.labels.includes(fingerprintLabel));
    if (existing) {
      if (!ctx.fallbacks.noComments) {
        await jira.comment(existing.key, `Seen again in tech-debt scan ${ctx.sha}. Fingerprint: ${item.fingerprint}.`);
      }
      ticketed.push({ ...item, ticketKey: existing.key });
      continue;
    }

    const dossier = dossierByFingerprint.get(item.fingerprint)!;
    const descriptionWiki = await ticketDescription(ctx, item, dossier, ctx.fallbacks.noAttach);
    const created = await jira.create({
      projectKey: ctx.profile.jira.projectKey,
      issueType: ctx.profile.jira.issueType,
      summary: `[Tech Debt] ${item.title}`,
      descriptionWiki,
      priority: PRIORITY[item.severity ?? "Low"],
      labels,
    });
    if (!ctx.fallbacks.noEpicLink) await jira.epicLink(epic.key, [created.key]);
    if (!ctx.fallbacks.noAttach) {
      try {
        await jira.attach(created.key, join(ctx.runDir, item.fingerprint, "context.md"));
        await jira.attach(created.key, join(ctx.runDir, item.fingerprint, "impact.md"));
      } catch (error) {
        // Attachments are optional when the permission check reported a fallback;
        // an unexpected attachment failure is surfaced instead of losing the dossier.
        throw new Error(`Ticket ${created.key} was created, but its Dossier could not be attached: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    ticketed.push({ ...item, ticketKey: created.key });
  }
  return ticketed;
}

async function findOrCreateEpic(ctx: ScanContext, jira: JiraClient): Promise<{ key: string; summary: string }> {
  const name = ctx.profile.jira.epicName;
  const escaped = name.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const found = (await jira.search(`project = ${ctx.profile.jira.projectKey} AND issuetype = Epic AND summary = "${escaped}"`))
    .find((issue) => issue.summary === name);
  if (found) return { key: found.key, summary: found.summary };
  const created = await jira.create({
    projectKey: ctx.profile.jira.projectKey,
    issueType: "Epic",
    summary: name,
    descriptionWiki: `Technical debt tracked for repository ${ctx.repo}.`,
    priority: "Major",
    labels: ["tech-debt", `td-repo-${slug(ctx.repo)}`],
  });
  return { key: created.key, summary: created.summary };
}

async function ticketDescription(ctx: ScanContext, item: DebtItem, dossier: Dossier, inlineDossier: boolean): Promise<string> {
  const evidence = item.findings.flatMap((finding) => finding.evidence).map((bundle) =>
    `* ${bundle.rule} — ${bundle.symbolPath}: ${wiki(bundle.snippet.slice(0, 2_000))}`,
  ).join("\n");
  const scores = item.scores;
  const sections = [
    "h2. Summary", wiki(item.description),
    "h2. Severity", `*${item.severity ?? "Low"}* (Impact ${scores?.impact ?? "—"}, Reach ${scores?.reach ?? "—"}, Churn ${scores?.churn ?? "—"}, Risk ${scores?.risk ?? "—"}); Effort ${item.effort ?? "—"}`,
    "h2. Evidence", evidence || "No evidence text supplied.",
    "h2. Fingerprint and scan", `Fingerprint: ${item.fingerprint}\\nScanned commit: ${ctx.sha}`,
    "Run /techdebt-ask <KEY> to explore this ticket.",
  ];
  if (inlineDossier) sections.push("h2. Context dossier", wiki(dossier.contextMd), "h2. Impact dossier", wiki(dossier.impactMd));
  return sections.join("\n\n");
}

function wiki(value: string): string {
  return value.replace(/\r?\n/g, "\\\\");
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "repo";
}
