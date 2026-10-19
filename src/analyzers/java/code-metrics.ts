import type { Analyzer } from "../index.js";
import { isTestPath, listSourceFiles, readSource } from "../common/files.js";
import { codeMetricEvidence } from "../common/source-metrics.js";

/** Lightweight Java size and complexity heuristics; PMD integration remains a later upgrade. */
export const codeMetrics: Analyzer = async (ctx) => {
  const files = (await listSourceFiles(ctx.worktree, [".java"])).filter((file) => !isTestPath(file));
  const evidence = [];
  for (const file of files) evidence.push(...codeMetricEvidence(file, await readSource(ctx.worktree, file), "java"));
  return evidence;
};
