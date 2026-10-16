import type { EvidenceBundle, ScanContext } from "../domain/schemas.js";

export type Analyzer = (ctx: ScanContext) => Promise<EvidenceBundle[]>;

/** Runs every analyzer for ctx.stack (plus common ones) and concatenates their bundles. */
export async function runAnalyzers(_ctx: ScanContext): Promise<EvidenceBundle[]> {
  throw new Error("not implemented: runAnalyzers (Part 2, D1-2)");
}
