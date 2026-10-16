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

/** CircuIT token, jira-cli whoami, required tools on PATH, default branch checkout. */
export async function environmentChecks(_stack: "ts" | "java"): Promise<CheckResult[]> {
  throw new Error("not implemented: environmentChecks (Part 2, D1-3)");
}
