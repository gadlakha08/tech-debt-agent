import { firstLines, makeEvidence } from "./files.js";
import type { EvidenceBundle, Stack } from "../../domain/schemas.js";

interface FunctionRegion {
  name: string;
  body: string;
}

export function codeMetricEvidence(file: string, text: string, stack: Stack): EvidenceBundle[] {
  const lines = text.split(/\r?\n/);
  const evidence: EvidenceBundle[] = [];
  const regions = findFunctionRegions(text);

  for (const region of regions) {
    const bodyLines = region.body.split(/\r?\n/);
    const complexity = (region.body.match(/\b(if|for|while|case|catch)\b|\?|&&|\|\|/g) ?? []).length + 1;
    if (complexity > 10) evidence.push(makeEvidence({
      category: "code", rule: "complexity", symbolPath: `${file}#${region.name}`, files: [file],
      metrics: { value: complexity, threshold: 10, loc: bodyLines.length },
      snippet: `${region.name}: estimated cyclomatic complexity ${complexity}\n${firstLines(region.body, 60)}`, stack,
    }));

    if (bodyLines.length > 50) evidence.push(makeEvidence({
      category: "code", rule: "long-function", symbolPath: `${file}#${region.name}`, files: [file],
      metrics: { value: bodyLines.length, threshold: 50, loc: bodyLines.length },
      snippet: `${region.name}: ${bodyLines.length} lines\n${firstLines(region.body, 60)}`, stack,
    }));

    const depth = maxBraceDepth(region.body);
    if (depth > 3) evidence.push(makeEvidence({
      category: "code", rule: "max-depth", symbolPath: `${file}#${region.name}`, files: [file],
      metrics: { value: depth, threshold: 3, loc: bodyLines.length },
      snippet: `${region.name}: nested block depth ${depth}\n${firstLines(region.body, 60)}`, stack,
    }));
  }

  if (lines.length > 500) evidence.push(makeEvidence({
    category: "code", rule: "long-file", symbolPath: file, files: [file],
    metrics: { value: lines.length, threshold: 500, loc: lines.length },
    snippet: `${file}: ${lines.length} lines\n${firstLines(text, 60)}`, stack,
  }));
  return evidence;
}

function findFunctionRegions(text: string): FunctionRegion[] {
  const patterns = [
    /\bfunction\s*([\w$]+)?\s*\([^)]*\)[^{;]*\{/g,
    /\b(?:const|let|var)\s+([\w$]+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[\w$]+)\s*=>\s*\{/g,
    /^\s*(?:(?:public|private|protected|static|async|final|synchronized|override|export|default|abstract)\s+)*(?:[\w$<>\[\],.?]+\s+)?([\w$]+)\s*\([^;{}]*\)\s*(?::[^{}]+)?\{/gm,
  ];
  const candidates: Array<{ name: string; brace: number }> = [];
  const ignored = new Set(["if", "for", "while", "switch", "catch", "with", "constructor", "return"]);
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const full = match[0];
      const name = match[1] ?? "anonymous";
      if (ignored.has(name)) continue;
      const brace = match.index! + full.lastIndexOf("{");
      if (candidates.some((candidate) => candidate.brace === brace)) continue;
      candidates.push({ name, brace });
    }
  }

  return candidates
    .map((candidate) => {
      const end = matchingBrace(text, candidate.brace);
      if (end < 0) return undefined;
      return { name: candidate.name, body: text.slice(candidate.brace + 1, end) };
    })
    .filter((region): region is FunctionRegion => region !== undefined);
}

function matchingBrace(text: string, start: number): number {
  let depth = 0;
  let quote = "";
  let lineComment = false;
  let blockComment = false;
  for (let i = start; i < text.length; i += 1) {
    const char = text[i]!;
    const next = text[i + 1];
    if (lineComment) { if (char === "\n") lineComment = false; continue; }
    if (blockComment) { if (char === "*" && next === "/") { blockComment = false; i += 1; } continue; }
    if (quote) {
      if (char === "\\") { i += 1; continue; }
      if (char === quote) quote = "";
      continue;
    }
    if (char === "/" && next === "/") { lineComment = true; i += 1; continue; }
    if (char === "/" && next === "*") { blockComment = true; i += 1; continue; }
    if (char === "\"" || char === "'" || char === "`") { quote = char; continue; }
    if (char === "{") depth += 1;
    if (char === "}" && --depth === 0) return i;
  }
  return -1;
}

function maxBraceDepth(text: string): number {
  let depth = 0;
  let maximum = 0;
  for (const char of text) {
    if (char === "{") { depth += 1; maximum = Math.max(maximum, depth); }
    if (char === "}") depth = Math.max(0, depth - 1);
  }
  return maximum;
}
