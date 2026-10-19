import type { Analyzer } from "../index.js";
import { countLoc, firstLines, listSourceFiles, makeEvidence, readSource } from "../common/files.js";

export const missingTests: Analyzer = async (ctx) => {
  const files = await listSourceFiles(ctx.worktree, [".java"]);
  const sources = files.filter((file) => file.includes("/src/main/java/") || file.startsWith("src/main/java/"));
  const tests = new Set(files.filter((file) => file.includes("/src/test/java/") || file.startsWith("src/test/java/")));
  const testNames = new Set([...tests].map((file) => file.split("/").pop()!.replace(/Tests?\.java$/i, "")));
  const bundles = [];
  for (const file of sources) {
    const className = file.split("/").pop()!.replace(/\.java$/i, "");
    if (testNames.has(className)) continue;
    const text = await readSource(ctx.worktree, file);
    bundles.push(makeEvidence({
      category: "testing", rule: "missing-test-file", symbolPath: file, files: [file],
      metrics: { value: 0, threshold: 1, loc: countLoc(text) },
      snippet: firstLines(text, 30), stack: "java",
    }));
  }
  return bundles.slice(0, 250);
};
