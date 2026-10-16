import type { DebtItem, Defect } from "../domain/schemas.js";
import type { UsageMeter } from "../integrations/llm/usage.js";

export interface ScanReport {
  repo: string;
  sha: string;
  cut: DebtItem[];
  belowCut: DebtItem[];
  defects: Defect[];
  includeDefects: boolean;
  usage: UsageMeter;
}

/** Writes report.md + report.json into ctx.runDir. */
export async function writeReport(_runDir: string, _report: ScanReport): Promise<{ mdPath: string; jsonPath: string }> {
  throw new Error("not implemented: writeReport (Part 1, D1-3)");
}
