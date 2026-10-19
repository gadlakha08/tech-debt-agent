import type { Analyzer } from "../index.js";
import { countLoc, isTestPath, listSourceFiles, makeEvidence, readSource } from "./files.js";

export const todoGrep: Analyzer = async (ctx) => {
  const extensions = ctx.stack === "ts" ? [".ts", ".tsx", ".js", ".jsx"] : [".java"];
  const files = (await listSourceFiles(ctx.worktree, extensions)).filter((file) => !isTestPath(file));
  const bundles = [];
  for (const file of files) {
    const text = await readSource(ctx.worktree, file);
    const matches = text.split(/\r?\n/).flatMap((line, index) => {
      const match = line.match(/\b(TODO|FIXME|HACK)\b/i);
      return match ? [`${index + 1}: ${line.trim()}`] : [];
    });
    if (matches.length === 0) continue;
    bundles.push(makeEvidence({
      category: "code",
      rule: "todo-comments",
      symbolPath: file,
      files: [file],
      metrics: { value: matches.length, threshold: 1, loc: countLoc(text) },
      snippet: matches.join("\n"),
      stack: ctx.stack,
    }));
  }
  return bundles;
};
