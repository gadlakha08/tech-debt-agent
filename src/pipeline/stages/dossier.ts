import type { DebtItem, Dossier, ScanContext } from "../../domain/schemas.js";
import type { UsageMeter } from "../../integrations/llm/usage.js";

export const CONTEXT_HEADINGS = ["What", "Where", "Evidence", "Why it is debt", "Scanned Commit"] as const;
export const IMPACT_HEADINGS = ["Rubric scores", "Severity", "Effort", "Who / what is affected", "Risk of leaving it"] as const;

/** Fills templates/dossier/*.md per Debt Item in the Cut; regenerates once if a heading is missing. */
export async function buildDossiers(_ctx: ScanContext, _cut: DebtItem[], _usage: UsageMeter): Promise<Dossier[]> {
  throw new Error("not implemented: buildDossiers (Part 1, D2-1)");
}
