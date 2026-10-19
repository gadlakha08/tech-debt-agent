import { existsSync } from "node:fs";
import { join } from "node:path";
import madgeApi from "madge";
import type { EvidenceBundle } from "../../domain/schemas.js";
import { capLines, isMainCode, isTestFile, symbolFor } from "../common/files.js";
import type { GraphAnalyzer } from "../context.js";

const MADGE_TIMEOUT_MS = 180_000;

/** madge's module graph: circular imports, plus the shipped modules importing each file (tests don't add reach). */
export const madge: GraphAnalyzer = async (ctx) => {
  const sources = ctx.files.filter((f) => isMainCode(f, "ts") || (isTestFile(f) && /\.[cm]?[jt]sx?$/.test(f)));
  if (sources.length === 0) return { bundles: [], dependents: new Map() };
  const tsConfig = join(ctx.worktree, "tsconfig.json");
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`madge timed out after ${MADGE_TIMEOUT_MS / 1000}s`)), MADGE_TIMEOUT_MS);
  });
  const graphing = madgeApi(sources.map((f) => join(ctx.worktree, f)), {
    baseDir: ctx.worktree,
    fileExtensions: ["ts", "tsx", "js", "jsx", "mjs", "cjs"],
    ...(existsSync(tsConfig) ? { tsConfig } : {}),
    detectiveOptions: { ts: { skipTypeImports: true }, tsx: { skipTypeImports: true } },
  });
  const res = await Promise.race([graphing, timeout]).finally(() => clearTimeout(timer));

  const graph = res.obj();
  const users = new Map<string, Set<string>>(Object.keys(graph).filter((f) => !isTestFile(f)).map((f) => [f, new Set()]));
  for (const [from, deps] of Object.entries(graph)) {
    if (isTestFile(from)) continue;
    for (const d of new Set(deps)) if (d !== from) users.set(d, (users.get(d) ?? new Set()).add(from));
  }
  const dependents = new Map([...users].map(([file, by]) => [file, [...by].sort()]));

  if (!ctx.thresholds.architecture.reportCircular) return { bundles: [], dependents };
  const seen = new Set<string>();
  const bundles: EvidenceBundle[] = [];
  for (const cycle of res.circular()) {
    const files = [...new Set(cycle)].sort();
    const key = files.join("\0");
    if (seen.has(key) || files.some(isTestFile)) continue;
    seen.add(key);
    bundles.push({
      category: "architecture",
      rule: "circular-import",
      symbolPath: files.map((f) => symbolFor(f, "ts")).join(" <-> "),
      files,
      metrics: { value: files.length },
      snippet: capLines(`Import cycle:\n${[...cycle, cycle[0]].join(" -> ")}`),
      stack: "ts",
    });
  }
  return { bundles, dependents };
};
