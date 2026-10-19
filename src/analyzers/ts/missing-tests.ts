import { basename, dirname } from "node:path";
import type { EvidenceBundle } from "../../domain/schemas.js";
import { capLines, isMainCode, isTestFile, readText } from "../common/files.js";
import type { Analyzer } from "../context.js";

// wiring, types and config rarely get their own test, so they are not counted as untested
const NOT_TESTABLE = /(^|\/)(index|main|polyfills|setupTests|vite-env|environment[\w.-]*|types?)\.[cm]?[jt]sx?$|\.(config|types?|constants?|module|routes?|stories|styles?|model|d)\.[cm]?[jt]sx?$/;
const stem = (f: string) => basename(f).replace(/\.(test|spec|e2e-spec)?\.?[cm]?[jt]sx?$/, "");

/** Source files with no *.test.* / *.spec.* of the same name anywhere, grouped per directory. Coverage reports are not read. */
export const tsMissingTests: Analyzer = async (ctx) => {
  if (!ctx.thresholds.testing.requireTestFile) return [];
  const tested = new Set(ctx.files.filter(isTestFile).map(stem));
  const untested = ctx.files.filter((f) => isMainCode(f, "ts") && f.includes("/") && !NOT_TESTABLE.test(f) && !tested.has(stem(f)));
  const byDir = new Map<string, string[]>();
  for (const f of untested) byDir.set(dirname(f), [...(byDir.get(dirname(f)) ?? []), f]);
  return Promise.all([...byDir].map(
    async ([dir, files]): Promise<EvidenceBundle> => ({
      category: "testing",
      rule: "missing-tests",
      symbolPath: dir,
      files,
      metrics: { value: files.length, loc: (await Promise.all(files.map((f) => readText(ctx.worktree, f)))).reduce((n, src) => n + src.split("\n").length, 0) },
      snippet: capLines(`Files with no matching test:\n${files.map((f) => `- ${basename(f)}`).join("\n")}`),
      stack: "ts",
    }),
  ));
};
