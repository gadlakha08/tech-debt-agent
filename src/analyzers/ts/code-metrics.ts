import type { Analyzer } from "../index.js";
import { isTestPath, listSourceFiles, readSource } from "../common/files.js";
import { codeMetricEvidence } from "../common/source-metrics.js";

/** Lightweight TypeScript size and complexity heuristics for the hackathon baseline. */
export const codeMetrics: Analyzer = async (ctx) => {
  const files = (await listSourceFiles(ctx.worktree, [".ts", ".tsx", ".js", ".jsx"])).filter((file) => !isTestPath(file));
  const evidence = [];
  for (const file of files) evidence.push(...codeMetricEvidence(file, await readSource(ctx.worktree, file), "ts"));
  return evidence;
};
