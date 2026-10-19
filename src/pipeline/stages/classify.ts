import pLimit from "p-limit";
import { z } from "zod";
import type { Classification, EvidenceBundle, ScanContext } from "../../domain/schemas.js";
import { runAgent } from "../../integrations/llm/agent-loop.js";
import type { UsageMeter } from "../../integrations/llm/usage.js";
import { renderPrompt } from "../../prompts.js";
import type { StageHooks } from "../progress.js";

/** What the model returns: its verdict only. Code attaches the bundle, so the model can't alter (and re-fingerprint) the evidence. */
const Verdict = z.discriminatedUnion("type", [
  z.object({ type: z.literal("finding"), title: z.string().min(1), description: z.string().min(1) }),
  z.object({ type: z.literal("defect"), kind: z.enum(["security", "bug"]), description: z.string().min(1) }),
  z.object({ type: z.literal("discard"), reason: z.string() }),
]);

function withEvidence(verdict: z.infer<typeof Verdict>, bundle: EvidenceBundle): Classification {
  if (verdict.type === "finding") return { type: "finding", finding: { title: verdict.title, description: verdict.description, evidence: [bundle] } };
  if (verdict.type === "defect") return { type: "defect", defect: { kind: verdict.kind, description: verdict.description, evidence: bundle } };
  return verdict;
}

/** One nano call per bundle, 8 in parallel. Security issues and bugs → Defect, never Finding. A bundle the model can't classify is discarded with a warning. */
export async function classify(ctx: ScanContext, bundles: EvidenceBundle[], usage: UsageMeter, hooks: StageHooks = {}): Promise<Classification[]> {
  const warn = hooks.warn ?? ((m: string) => console.warn(`! ${m}`));
  const limit = pLimit(8);
  let failed = 0;
  let lastError = "";
  const results = await Promise.all(bundles.map((bundle) => limit(() => runAgent({
    stage: "classify",
    system: renderPrompt("classify.md", { stack: bundle.stack, stackSummary: ctx.stackSummary }),
    user: JSON.stringify({ ...bundle, snippet: firstLines(bundle.snippet, 150) }),
    outputSchema: Verdict,
    usage,
  }).then((verdict) => withEvidence(verdict, bundle)).catch((err: unknown): Classification => {
    failed++;
    lastError = err instanceof Error ? err.message : String(err);
    const reason = `classify failed for ${bundle.rule} ${bundle.symbolPath}: ${err instanceof Error ? err.message : String(err)}`;
    warn(reason.slice(0, 300));
    return { type: "discard", reason };
  }).finally(() => hooks.tick?.(`${bundle.rule} ${bundle.symbolPath}`)))));
  // a few odd bundles are fine to drop; many failures means CircuIT is down and the report would be meaningless
  if (failed > bundles.length / 4) throw new Error(`classify failed for ${failed} of ${bundles.length} bundles; last error: ${lastError}`);
  return results;
}

function firstLines(text: string, maxLines: number): string {
  return text.split(/\r?\n/).slice(0, maxLines).join("\n");
}
