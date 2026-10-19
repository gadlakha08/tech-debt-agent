import type { Analyzer } from "../index.js";
import { isTestPath, listSourceFiles, makeEvidence, readSource } from "./files.js";

export const hardcodedUrls: Analyzer = async (ctx) => {
  const extensions = ctx.stack === "ts" ? [".ts", ".tsx", ".js", ".jsx"] : [".java"];
  const files = (await listSourceFiles(ctx.worktree, extensions)).filter((file) => !isTestPath(file));
  const bundles = [];
  for (const file of files) {
    const text = await readSource(ctx.worktree, file);
    const urls: string[] = [];
    const secrets: string[] = [];
    for (const [index, rawLine] of text.split(/\r?\n/).entries()) {
      const line = rawLine.trim();
      if (/^(\/\/|\*|\*\/|#)/.test(line)) continue;
      if (/https?:\/\/|\blocalhost(?::\d+)?\b/i.test(line)) urls.push(`${index + 1}: ${sanitize(line)}`);
      const secretMatch = line.match(/\b(api[_-]?key|client[_-]?secret|password|access[_-]?token)\b\s*[:=]\s*(["'`])([^"'`]{8,})\2/i);
      if (secretMatch) secrets.push(`${index + 1}: ${sanitize(line)}`);
    }
    if (urls.length) bundles.push(makeEvidence({
      category: "ops", rule: "hardcoded-url", symbolPath: file, files: [file],
      metrics: { value: urls.length, threshold: 1 }, snippet: urls.join("\n"), stack: ctx.stack,
    }));
    if (secrets.length) bundles.push(makeEvidence({
      category: "ops", rule: "secret-literal", symbolPath: file, files: [file],
      metrics: { value: secrets.length, threshold: 1 }, snippet: secrets.join("\n"), stack: ctx.stack,
    }));
  }
  return bundles;
};

function sanitize(line: string): string {
  return line
    .replace(/(https?:\/\/)[^/\s:@]+:[^/\s@]+@/gi, "$1[REDACTED]@")
    .replace(/\b(api[_-]?key|client[_-]?secret|password|access[_-]?token)\b(\s*[:=]\s*)(["'`])([^"'`]{8,})\3/gi, "$1$2$3[REDACTED]$3");
}
