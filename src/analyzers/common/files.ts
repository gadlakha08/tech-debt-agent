import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import type { DebtCategory, EvidenceBundle, Stack } from "../../domain/schemas.js";

export const EXCLUDE_DIRS = new Set([
  ".git", "node_modules", "target", "build", "dist", "out", "coverage", ".idea", ".vscode",
  ".gradle", ".mvn", ".next", ".angular", ".cache", "vendor", "generated", "generated-sources",
]);

export const SNIPPET_MAX_LINES = 150;

export const CODE_EXTS: Record<Stack, RegExp> = {
  java: /\.(java|kt|groovy)$/,
  ts: /\.(ts|tsx|js|jsx|mjs|cjs)$/,
};
export const CONFIG_EXTS = /\.(properties|ya?ml|json|env|conf|xml)$/;

/** All files under root (repo-relative, forward slashes), skipping build output and vendored dirs. */
export async function listFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!EXCLUDE_DIRS.has(entry.name)) await walk(join(dir, entry.name));
      } else if (entry.isFile()) {
        out.push(relative(root, join(dir, entry.name)).split(sep).join("/"));
      }
    }
  }
  await walk(root);
  return out.sort();
}

export function isTestFile(path: string): boolean {
  if (/\.(test|spec|e2e-spec)\.[cm]?[jt]sx?$/.test(path) || /(Test|Tests|IT|TestCase)\.(java|kt|groovy)$/.test(path)) return true;
  // test runner setup
  if (/(^|\/)(jest|vitest|karma|playwright|cypress)\.(setup|config)[\w.-]*$|(^|\/)setupTests\./.test(path)) return true;
  // whole test modules (e.g. integration-test/src/main/java)
  if (/(^|\/)(integration-tests?|e2e|__tests__|__mocks__)\//.test(path)) return true;
  // under src/main a directory named "test" is a package, not a test tree
  if (/(^|\/)src\/main\//.test(path)) return false;
  return /(^|\/)(src\/test|src\/it|test|tests)\//.test(path);
}

export const isTypeDeclaration = (path: string) => /\.d\.ts$/.test(path);

/** Build tooling (webpack.config.js, vite.config.ts, .github/ workflows) is not shipped code. */
export const isTooling = (path: string) => /\.config\.[cm]?[jt]s$|(^|\/)\.(github|gitlab|circleci|husky)\//.test(path);

/** Code that ships: matches the stack's extensions and is not a test or declaration file. */
export const isMainCode = (path: string, stack: Stack) =>
  CODE_EXTS[stack].test(path) && !isTestFile(path) && !isTypeDeclaration(path) && !isTooling(path) && !/\.min\.js$/.test(path);

export const readText = (root: string, path: string) => readFile(join(root, path), "utf8");

/**
 * 1-based last line of the brace block that opens on or after `line` (a method or function declaration), or undefined
 * when no block opens within a few lines (an arrow function without braces). Braces in strings and comments are counted too.
 */
export function blockEnd(lines: string[], line: number): number | undefined {
  let depth = 0;
  let opened = false;
  for (let i = line - 1; i < lines.length; i++) {
    for (const ch of lines[i]!) {
      if (ch === "{") (depth++, (opened = true));
      else if (ch === "}") depth--;
    }
    if (opened && depth <= 0) return i + 1;
    if (!opened && i - line >= 10) return undefined;
  }
  return undefined;
}

export function capLines(text: string, max = SNIPPET_MAX_LINES): string {
  const lines = text.split("\n");
  return lines.length <= max ? text : [...lines.slice(0, max - 1), `… (${lines.length - max + 1} more lines)`].join("\n");
}

/** Java: "<module>:com.acme.Foo" (module omitted at the root); TS: the path without extension. Never line numbers. */
export function symbolFor(path: string, stack: Stack): string {
  if (stack === "java") {
    const m = /^(?:(.*)\/)?src\/(?:main|test)\/(?:java|kotlin|groovy)\/(.+)\.(?:java|kt|groovy)$/.exec(path);
    if (m) return `${m[1] ? `${m[1]}:` : ""}${m[2]!.replaceAll("/", ".")}`;
  }
  return path.replace(/\.[^./]+$/, "");
}

/** "<module>:" prefix for a Java source path, or "" at the root. */
export const javaModulePrefix = (path: string) => {
  const m = /^(.*)\/src\/(?:main|test)\//.exec(path);
  return m ? `${m[1]}:` : "";
};

/**
 * One bundle per file listing its matching lines (`render` returns the text to show, or undefined to skip the line).
 * Files with fewer than `min` matches are dropped.
 */
export async function lineScan(
  ctx: { worktree: string; stack: Stack },
  files: string[],
  bundle: { category: DebtCategory; rule: string; min?: number },
  render: (line: string, file: string) => string | undefined,
): Promise<EvidenceBundle[]> {
  const out: EvidenceBundle[] = [];
  for (const file of files) {
    const lines = (await readText(ctx.worktree, file)).split("\n");
    const hits = lines.flatMap((l, i) => {
      const r = render(l, file);
      return r === undefined ? [] : [`${i + 1}: ${r.trim()}`];
    });
    if (hits.length === 0 || hits.length < (bundle.min ?? 1)) continue;
    out.push({
      category: bundle.category,
      rule: bundle.rule,
      symbolPath: symbolFor(file, ctx.stack),
      files: [file],
      // the flagged lines, not the size of the file they sit in
      metrics: { value: hits.length, loc: hits.length },
      snippet: capLines(hits.join("\n")),
      stack: ctx.stack,
    });
  }
  return out;
}

/** Leading major version number ("^17.0.2" → 17, "v2" → 2); NaN when there is none. */
export const major = (v: string | undefined) => Number(/^\D*(\d+)/.exec(v ?? "")?.[1] ?? NaN);

