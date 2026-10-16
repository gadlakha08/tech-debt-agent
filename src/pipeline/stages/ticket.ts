import type { DebtItem, Dossier, ScanContext, Severity } from "../../domain/schemas.js";
import type { JiraClient } from "../../integrations/jira/index.js";
import type { UsageMeter } from "../../integrations/llm/usage.js";

export const PRIORITY: Record<Severity, "Major" | "Minor" | "Trivial"> = { High: "Major", Medium: "Minor", Low: "Trivial" };

export function labelsFor(item: DebtItem, repo: string): string[] {
  return ["tech-debt", `td-sev-${(item.severity ?? "Low").toLowerCase()}`, `td-cat-${item.category}`, `td-fp-${item.fingerprint}`, `td-repo-${repo}`];
}

/** Ensures the Epic, dedups by td-fp label, creates or comments, then attaches the Dossier (in code, not the agent). */
export async function ticket(
  _ctx: ScanContext,
  _cut: DebtItem[],
  _dossiers: Dossier[],
  _jira: JiraClient,
  _usage: UsageMeter,
): Promise<DebtItem[]> {
  throw new Error("not implemented: ticket (Person A, D2-2)");
}
