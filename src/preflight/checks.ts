import { requiredTools, toolAvailable } from "../analyzers/index.js";
import { type Fallbacks, JIRA_BOT, type RepoKind } from "../domain/schemas.js";
import { defaultBranch } from "../integrations/git/worktree.js";
import { assertBotIdentity, createJiraClient, type JiraPermissions } from "../integrations/jira/index.js";
import { CIRCUIT_CHAT_ENV } from "../integrations/llm/circuit-client.js";
import { circuitModel, modelPrice } from "../integrations/llm/pricing.js";
import { getCircuitToken } from "../integrations/llm/circuit-token.js";
import { commandExists } from "../shell.js";

export interface CheckResult {
  name: string;
  ok: boolean;
  blocking: boolean;
  detail: string;
}

/** Missing permission → block, or the fallback the pipeline applies instead. */
export const PERMISSION_EFFECT: Record<keyof JiraPermissions, "block" | keyof Fallbacks> = {
  BROWSE_PROJECTS: "block",
  CREATE_ISSUES: "block",
  ADD_COMMENTS: "noComments",
  EDIT_ISSUES: "noEpicLink",
  CREATE_ATTACHMENTS: "noAttach",
};

export function evaluatePermissions(perms: JiraPermissions): { missing: (keyof JiraPermissions)[]; blocked: boolean; fallbacks: Fallbacks } {
  const missing = (Object.keys(PERMISSION_EFFECT) as (keyof JiraPermissions)[]).filter((p) => !perms[p]);
  const fallbacks: Fallbacks = { noAttach: false, noEpicLink: false, noComments: false };
  let blocked = false;
  for (const p of missing) {
    const effect = PERMISSION_EFFECT[p];
    if (effect === "block") blocked = true;
    else fallbacks[effect] = true;
  }
  return { missing, blocked, fallbacks };
}

async function check(name: string, blocking: boolean, fn: () => Promise<string>): Promise<CheckResult> {
  try {
    return { name, ok: true, blocking, detail: await fn() };
  } catch (err) {
    return { name, ok: false, blocking, detail: (err as Error).message };
  }
}

const tool = (name: string, blocking: boolean, why: string) =>
  check(`${name} installed`, blocking, async () => {
    if (!(await commandExists(name))) throw new Error(`not on PATH (${why})`);
    return "ok";
  });

/** One check per tool this repo's analyzers need; a missing one is a warning, since only its analyzers are skipped. */
const analyzerTools = (repo: RepoKind) =>
  requiredTools(repo).map(({ tool, install, finds }) =>
    check(`${tool} (${finds.join("; ")})`, false, async () => {
      if (!(await toolAvailable(tool))) throw new Error(`not installed, so these checks are skipped. Install: ${install}`);
      return "ok";
    }),
  );

/** CircuIT token, Jira identity, git, then only the tools this repo's analyzers need, and the default branch. */
export async function environmentChecks(opts: { repo: RepoKind; repoPath?: string; dryRun?: boolean }): Promise<CheckResult[]> {
  const checks: Promise<CheckResult>[] = [
    check("CircuIT token", true, async () => ((await getCircuitToken()) ? "ok" : "empty token")),
    check("CircuIT chat config", true, async () => {
      const missing = CIRCUIT_CHAT_ENV.filter((name) => !process.env[name]);
      if (missing.length) throw new Error(`missing ${missing.join(", ")}`);
      return "ok";
    }),
    check("Model price", false, async () => {
      const model = circuitModel();
      const price = modelPrice(model);
      if (!price) throw new Error(`no price for ${model ?? "(unset)"} in MODEL_PRICES; cost will show as unknown`);
      return `${model}: $${price.input} in / $${price.output} out per 1M tokens`;
    }),
    tool("git", true, "needed for checkout"),
    tool("python3", false, "stack summary via scan.py"),
  ];
  if (!opts.dryRun)
    checks.push(
      check(`Jira identity (${JIRA_BOT})`, true, async () => {
        await assertBotIdentity(createJiraClient());
        return `jira-cli and DEBTDOCTOR_JIRA_TOKEN both act as ${JIRA_BOT}`;
      }),
    );
  checks.push(...analyzerTools(opts.repo));
  if (opts.repoPath) {
    const repoPath = opts.repoPath;
    checks.push(check("default branch", true, async () => `origin/${await defaultBranch(repoPath)}`));
  }
  return Promise.all(checks);
}
