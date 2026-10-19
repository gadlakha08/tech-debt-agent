import type { Analyzer } from "../index.js";
import { countLoc, firstLines, listSourceFiles, makeEvidence, readSource } from "../common/files.js";

export const missingTests: Analyzer = async (ctx) => {
  const files = await listSourceFiles(ctx.worktree, [".ts", ".tsx", ".js", ".jsx"]);
  const tests = files.filter((file) => /\.(spec|test)\.[^.]+$/i.test(file) || /(^|\/)__tests__\//i.test(file));
  const sources = files.filter((file) => !file.endsWith(".d.ts") && !/(^|\/)(__tests__|test|tests)\//i.test(file) && !/\.(spec|test)\.[^.]+$/i.test(file));
  const testStems = tests.map((file) => file.replace(/\.(spec|test)\.[^.]+$/i, "").replace(/(^|\/)__tests__\//i, "$1"));
  const bundles = [];
  for (const file of sources) {
    const stem = file.replace(/\.[^.]+$/, "");
    const base = stem.split("/").pop() ?? stem;
    const hasTest = testStems.some((test) => test === stem || test.endsWith(`/${base}`) || stem.endsWith(`/${test}`));
    if (hasTest) continue;
    const text = await readSource(ctx.worktree, file);
    bundles.push(makeEvidence({
      category: "testing", rule: "missing-test-file", symbolPath: file, files: [file],
      metrics: { value: 0, threshold: 1, loc: countLoc(text) },
      snippet: firstLines(text, 30), stack: "ts",
    }));
  }
  return bundles.slice(0, 250);
};
