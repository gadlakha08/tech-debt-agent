import type { Classification, EvidenceBundle, ScanContext } from "../../domain/schemas.js";
import type { UsageMeter } from "../../integrations/llm/usage.js";

/** One nano call per bundle, 8 in parallel. Security issues and bugs → Defect, never Finding. */
export async function classify(_ctx: ScanContext, _bundles: EvidenceBundle[], _usage: UsageMeter): Promise<Classification[]> {
  throw new Error("not implemented: classify (Part 1, D1-2)");
}
