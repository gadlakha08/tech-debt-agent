import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { loadThresholds } from "../analyzers/config/index.js";
import { runAnalyzers } from "../analyzers/index.js";
import { stackSummary } from "../analyzers/stack.js";
import type { EvidenceBundle, ScanContext } from "../domain/schemas.js";
import { churn } from "../integrations/git/churn.js";
import type { StageHooks } from "./progress.js";

export interface EvidenceScan {
  evidence: EvidenceBundle[];
  /** Per shipped file, the shipped files that depend on it (from the import graph; empty if it failed). */
  dependents: Record<string, string[]>;
  /** Every file in the worktree the analyzers saw (repo-relative). */
  files: string[];
  churn: Record<string, number>;
  churnDays: number;
  stackSummary: string;
  warnings: string[];
}

/** Deterministic stage: analyzers, churn and the stack summary over the worktree; saves evidence.json in the run dir. */
export async function scanEvidence(ctx: Pick<ScanContext, "worktree" | "stack" | "build" | "runDir" | "sha">, hooks: StageHooks = {}): Promise<EvidenceScan> {
  const thresholds = await loadThresholds();
  const warnings: string[] = [];
  const onWarning = (m: string) => {
    warnings.push(m);
    (hooks.warn ?? ((w: string) => console.warn(`! ${w}`)))(m);
  };
  const [analyzed, fileChurn, summary] = await Promise.all([
    runAnalyzers(ctx, { thresholds, onWarning, onAnalyzerDone: hooks.tick }),
    churn(ctx, thresholds.churn.sinceDays).catch((err: unknown) => {
      onWarning(`churn unavailable, scoring without it: ${err instanceof Error ? err.message : String(err)}`);
      return {};
    }),
    stackSummary(ctx.worktree),
  ]);
  const dependents = Object.fromEntries(analyzed.dependents);
  const result = { evidence: analyzed.bundles, dependents, churn: fileChurn, churnDays: thresholds.churn.sinceDays, stackSummary: summary, warnings };
  await writeFile(join(ctx.runDir, "evidence.json"), `${JSON.stringify({ sha: ctx.sha, stack: ctx.stack, ...result }, null, 2)}\n`);
  return { ...result, files: analyzed.files };
}
