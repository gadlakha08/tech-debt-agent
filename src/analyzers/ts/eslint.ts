import { relative } from "node:path";
import { ESLint, type Linter } from "eslint";
import tseslint from "typescript-eslint";
import type { EvidenceBundle } from "../../domain/schemas.js";
import type { Thresholds } from "../config/index.js";
import { blockEnd, capLines, isMainCode, symbolFor } from "../common/files.js";
import type { Analyzer } from "../context.js";

const RULES = {
  complexity: { bundleRule: "complexity", threshold: (t) => t.complexity },
  "max-depth": { bundleRule: "deep-nesting", threshold: (t) => t.maxDepth },
  "max-lines-per-function": { bundleRule: "long-function", threshold: (t) => t.maxLinesPerFunction },
  "max-lines": { bundleRule: "large-file", threshold: (t) => t.maxLinesPerFile },
} satisfies Record<string, { bundleRule: string; threshold: (t: Thresholds["code"]) => number }>;
type RuleId = keyof typeof RULES;

/** Project-independent flat config built from thresholds.yaml; the repo's own ESLint config and inline directives are ignored. */
export function eslintConfig(t: Thresholds["code"]): Linter.Config[] {
  return [
    {
      files: ["**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}"],
      languageOptions: { parser: tseslint.parser as Linter.Parser, parserOptions: { ecmaFeatures: { jsx: true } } },
      linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: "off" },
      rules: {
        complexity: ["warn", t.complexity],
        "max-depth": ["warn", t.maxDepth],
        "max-lines-per-function": ["warn", { max: t.maxLinesPerFunction, skipBlankLines: true, skipComments: true }],
        "max-lines": ["warn", { max: t.maxLinesPerFile, skipBlankLines: true, skipComments: true }],
      },
    },
  ];
}

const KEYWORDS = new Set(["if", "for", "while", "switch", "catch", "return", "else", "do", "try", "with", "function"]);
const DECL = /function\s*\*?\s*([A-Za-z_$][\w$]*)|(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\(|function|[A-Za-z_$][\w$]*\s*=>)|^\s*(?:(?:public|private|protected|static|async|get|set)\s+)*([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*(?::[^{]+)?\{/;

/** The function enclosing a 1-based line: the nearest declaration above it whose block is still open there, and its line. */
function enclosingFunction(lines: string[], line: number): { name: string; line: number } | undefined {
  let balance = 0; // closing minus opening braces seen walking upwards; < 0 means we are inside that line's block
  for (let i = line - 1; i >= 0; i--) {
    const l = lines[i]!;
    balance += (l.match(/\}/g) ?? []).length - (l.match(/\{/g) ?? []).length;
    const m = DECL.exec(l);
    const name = m?.[1] ?? m?.[2] ?? m?.[3];
    if (name && !KEYWORDS.has(name) && balance < 0) return { name, line: i + 1 };
  }
  return undefined;
}

const NAMED = /'([^']+)'/;
const VALUE = /\((\d+)\)|of (\d+)/;

export const eslint: Analyzer = async (ctx) => {
  const files = ctx.files.filter((f) => isMainCode(f, "ts"));
  if (files.length === 0) return [];
  const linter = new ESLint({
    cwd: ctx.worktree,
    overrideConfigFile: true,
    overrideConfig: eslintConfig(ctx.thresholds.code),
    errorOnUnmatchedPattern: false,
    warnIgnored: false,
  });
  const results = await linter.lintFiles(files);
  const bySymbol = new Map<string, EvidenceBundle>();
  for (const r of results) {
    const file = relative(ctx.worktree, r.filePath);
    const lines = (r.source ?? "").split("\n");
    for (const m of r.messages) {
      if (m.fatal) {
        ctx.warn(`eslint could not parse ${file}: ${m.message.slice(0, 120)}`);
        continue;
      }
      const spec = RULES[m.ruleId as RuleId];
      if (!spec) continue;
      const fileSym = symbolFor(file, "ts");
      const fileLevel = m.ruleId === "max-lines";
      // complexity and max-lines-per-function report on the function itself; max-depth on a statement inside it
      const enclosing = fileLevel ? undefined : enclosingFunction(lines, m.line);
      const fn = fileLevel ? undefined : (NAMED.exec(m.message)?.[1] ?? enclosing?.name ?? "<anonymous>");
      const symbolPath = fn ? `${fileSym}#${fn}` : fileSym;
      const key = `${spec.bundleRule}\0${symbolPath}`;
      const valueMatch = VALUE.exec(m.message);
      const value = valueMatch ? Number(valueMatch[1] ?? valueMatch[2]) : undefined;
      // a function rule's size and excerpt are the function; the file-size rule's are the file
      const start = m.ruleId === "max-depth" ? (enclosing?.line ?? m.line) : m.line;
      const end = blockEnd(lines, start) ?? m.endLine ?? Math.min(lines.length, start + 40);
      const excerpt = fileLevel ? lines.slice(0, 40) : lines.slice(start - 1, end);
      const prev = bySymbol.get(key);
      // several anonymous callbacks in one function collapse into one bundle; keep the worst
      if (prev && (prev.metrics.value ?? 0) >= (value ?? 0)) continue;
      bySymbol.set(key, {
        category: "code",
        rule: spec.bundleRule,
        symbolPath,
        files: [file],
        metrics: { value, threshold: spec.threshold(ctx.thresholds.code), loc: fileLevel ? lines.length : end - start + 1 },
        snippet: capLines(`${m.ruleId}: ${m.message}\n\n${excerpt.join("\n")}`),
        stack: "ts",
      });
    }
  }
  return [...bySymbol.values()];
};
