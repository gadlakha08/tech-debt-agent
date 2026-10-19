import { z } from "zod";
import pLimit from "p-limit";
import type { DebtItem, ScanContext } from "../../domain/schemas.js";
import { percentileScore, severityFromScore, totalScore } from "../../domain/rubric.js";
import { runAgent } from "../../integrations/llm/agent-loop.js";
import type { UsageMeter } from "../../integrations/llm/usage.js";
import { renderPrompt } from "../../prompts.js";
import type { StageHooks } from "../progress.js";

/** Reach/Churn from domain/rubric.ts; one nano call per item for Impact and Risk. */
export async function score(
  ctx: ScanContext,
  items: DebtItem[],
  churn: Record<string, number>,
  usage: UsageMeter,
  hooks: StageHooks = {},
): Promise<DebtItem[]> {
  if (items.length === 0) return [];

  const reachValues = items.map((item) => Math.max(0, ...item.findings.flatMap((finding) =>
    finding.evidence.map((bundle) => bundle.metrics.fanIn ?? 0))));
  const churnValues = items.map((item) => {
    const counts = item.files.map((file) => churn[file] ?? 0);
    return counts.length ? counts.reduce((sum, count) => sum + count, 0) / counts.length : 0;
  });
  const limit = pLimit(8);
  const impactRiskSchema = z.object({
    impact: z.number().int().min(1).max(5),
    risk: z.number().int().min(1).max(5),
    justifications: z.object({ impact: z.string().min(1), risk: z.string().min(1) }),
  });

  return Promise.all(items.map((item, index) => limit(async () => {
    const modelScores = await runAgent({
      stage: "score",
      system: renderPrompt("score-impact-risk.md", { stackSummary: ctx.stackSummary }),
      user: JSON.stringify({
        title: item.title,
        description: item.description,
        category: item.category,
        rule: item.rule,
        symbolPath: item.symbolPath,
        files: item.files,
        evidence: item.findings.flatMap((finding) => finding.evidence).map((bundle) => ({
          rule: bundle.rule,
          symbolPath: bundle.symbolPath,
          metrics: bundle.metrics,
          snippet: bundle.snippet.slice(0, 12_000),
        })),
        // with no line count (dependencies, platform, config) there is no estimate to anchor on
      }),
      outputSchema: impactRiskSchema,
      usage,
    });

    const scores = {
      impact: modelScores.impact,
      reach: percentileScore(reachValues[index] ?? 0, reachValues),
      churn: percentileScore(churnValues[index] ?? 0, churnValues),
      risk: modelScores.risk,
      justifications: modelScores.justifications,
    };
    const scoreTotal = totalScore(scores);
    return {
      ...item,
      scores,
      score: scoreTotal,
      severity: severityFromScore(scoreTotal),
    };
  }).finally(() => hooks.tick?.(item.title))));
}
