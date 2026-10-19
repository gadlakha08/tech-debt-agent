import type { JiraPermissions } from "../integrations/jira/index.js";
import type { Fallbacks } from "../domain/schemas.js";

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
  const missing = (Object.keys(perms) as (keyof JiraPermissions)[]).filter((p) => !perms[p]);
  const fallbacks: Fallbacks = { noAttach: false, noEpicLink: false, noComments: false };
  let blocked = false;
  for (const p of missing) {
    const effect = PERMISSION_EFFECT[p];
    if (effect === "block") blocked = true;
    else fallbacks[effect] = true;
  }
  return { missing, blocked, fallbacks };
}

/** Checks the credentials and local prerequisites needed before starting model calls. */
export async function environmentChecks(stack: "ts" | "java", options: { dryRun: boolean }): Promise<CheckResult[]> {
  const checks: CheckResult[] = [];
  const circuitVars = [
    "CIRCUIT_LLM_TOKEN_URL", "CIRCUIT_LLM_CLIENT_ID", "CIRCUIT_LLM_CLIENT_SECRET",
    "CIRCUIT_LLM_CHAT_URL", "CIRCUIT_LLM_APP_KEY", "CIRCUIT_LLM_DEPLOYMENT",
  ];
  const missingCircuit = circuitVars.filter((name) => !process.env[name]);
  checks.push({
    name: "CircuIT configuration",
    ok: missingCircuit.length === 0,
    blocking: true,
    detail: missingCircuit.length ? `Missing environment variables: ${missingCircuit.join(", ")}` : "Required CircuIT settings are present.",
  });

  if (!options.dryRun) checks.push({
    name: "Jira integration",
    ok: false,
    blocking: true,
    detail: "Live Jira client is not implemented yet; use --dry-run until the Jira adapter is ready.",
  });

  checks.push({
    name: `${stack} source stack`,
    ok: true,
    blocking: false,
    detail: `Detected ${stack}; its baseline analyzers will run.`,
  });
  return checks;
}
