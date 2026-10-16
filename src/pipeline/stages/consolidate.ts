import type { DebtItem, Finding } from "../../domain/schemas.js";

/** Merges Findings sharing a Fingerprint into one Debt Item, unioning their evidence. */
export function consolidate(_findings: Finding[]): DebtItem[] {
  throw new Error("not implemented: consolidate (Person A, D1-2)");
}
