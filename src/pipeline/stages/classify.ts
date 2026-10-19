import pLimit from "p-limit";
import { Classification } from "../../domain/schemas.js";
import type { EvidenceBundle, ScanContext } from "../../domain/schemas.js";
import { runAgent } from "../../integrations/llm/agent-loop.js";
import type { UsageMeter } from "../../integrations/llm/usage.js";

/** One nano call per bundle, 8 in parallel. Security issues and bugs → Defect, never Finding. */
export async function classify(ctx: ScanContext, bundles: EvidenceBundle[], usage: UsageMeter): Promise<Classification[]> {
  const limit = pLimit(8);
  return Promise.all(bundles.map((bundle) => limit(() => runAgent({
    stage: "classify",
    system: [
      `Classify one static-analysis observation from a ${bundle.stack} repository.`,
      `Repository context: ${ctx.stackSummary}`,
      "Return exactly one classification:",
      "- finding: maintainability debt in code, architecture, dependencies, testing, or ops.",
      "- defect: a security vulnerability or a bug. Bugs and security issues are never technical debt findings.",
      "- discard: noise, generated code, or evidence too weak to justify action.",
      "For a finding, include this evidence bundle in the finding.evidence array. For a defect, include it as defect.evidence.",
      "Do not invent facts that are absent from the evidence.",
    ].join("\n"),
    user: JSON.stringify({ ...bundle, snippet: firstLines(bundle.snippet, 150) }),
    outputSchema: Classification,
    usage,
  }))));
}

function firstLines(text: string, maxLines: number): string {
  return text.split(/\r?\n/).slice(0, maxLines).join("\n");
}
