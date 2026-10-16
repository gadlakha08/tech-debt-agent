import type { DebtItem, ScanContext } from "../../domain/schemas.js";
import type { UsageMeter } from "../../integrations/llm/usage.js";

/** Reach/Churn/Effort from domain/rubric.ts; one nano call per item for Impact and Risk. */
export async function score(
  _ctx: ScanContext,
  _items: DebtItem[],
  _churn: Record<string, number>,
  _usage: UsageMeter,
): Promise<DebtItem[]> {
  throw new Error("not implemented: score (Person A, D1-3)");
}
