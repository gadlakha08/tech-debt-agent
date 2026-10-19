import { basename } from "node:path";
import type { Stack } from "../../domain/schemas.js";
import { CODE_EXTS, isTestFile, readText } from "./files.js";

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const stem = (file: string) => basename(file).replace(/\.(test|spec|e2e-spec)?\.?[cm]?[jt]sx?$|\.(java|kt|groovy)$/, "");
const javaTested = (file: string) => /^(?:Test)?(\w+?)(?:Tests?|IT|TestCase)?\.(?:java|kt|groovy)$/.exec(basename(file))?.[1];

/**
 * Finds the test files that exercise a set of source files. Java: a test that imports the class, or sits in its package and
 * is named after or mentions it. TS: a test named after the module (foo.spec.ts) or importing it. Test sources are read once.
 */
export function relatedTestsFinder(worktree: string, stack: Stack, files: string[]): (targets: string[]) => Promise<string[]> {
  const tests = files.filter((f) => isTestFile(f) && CODE_EXTS[stack].test(f));
  let sources: Promise<Map<string, string>> | undefined;
  const load = () =>
    (sources ??= Promise.all(tests.map(async (f) => [f, await readText(worktree, f).catch(() => "")] as const)).then((all) => new Map(all)));

  return async (targets) => {
    const sources = targets.filter((t) => CODE_EXTS[stack].test(t) && !isTestFile(t));
    if (sources.length === 0) return [];
    const text = await load();
    if (stack === "java") {
      // class names repeat across modules (Constants, Utils), so a test must import the class, or see it (same package, wildcard import) and use it
      const classes = sources.flatMap((t) => {
        const fqcn = /src\/main\/(?:java|kotlin|groovy)\/(.+)\.(?:java|kt|groovy)$/.exec(t)?.[1]?.replaceAll("/", ".");
        return fqcn ? [{ pkg: fqcn.split(".").slice(0, -1).join("."), name: fqcn.split(".").pop()!, fqcn }] : [];
      });
      return tests.filter((t) => {
        const src = text.get(t) ?? "";
        const pkg = /^\s*package\s+([\w.]+)\s*;/m.exec(src)?.[1] ?? "";
        return classes.some((c) => {
          if (new RegExp(`^\\s*import\\s+(?:static\\s+)?${escape(c.fqcn)}\\b`, "m").test(src)) return true;
          const visible = pkg === c.pkg || new RegExp(`^\\s*import\\s+${escape(c.pkg)}\\.\\*`, "m").test(src);
          return visible && (javaTested(t) === c.name || new RegExp(`\\b${escape(c.name)}\\b`).test(src));
        });
      });
    }
    const names = [...new Set(sources.map(stem))].filter((n) => n && n !== "index");
    if (names.length === 0) return [];
    const byName = new Set(names);
    const imports = new RegExp(`(?:from\\s+|require\\(\\s*|import\\(\\s*)['"][^'"]*\\b(?:${names.map(escape).join("|")})(?:\\.[cm]?[jt]sx?)?['"]`);
    return tests.filter((t) => byName.has(stem(t)) || imports.test(text.get(t) ?? ""));
  };
}
