import { basename } from "node:path";
import type { AnalyzerContext } from "../context.js";
import { isTestFile, javaModulePrefix, readText } from "../common/files.js";

export interface JavaSource {
  file: string;
  module: string; // "<module>:" or ""
  pkg: string;
  name: string; // top-level type name (= file name)
  fqcn: string;
  kind: "class" | "interface" | "enum" | "record" | "annotation" | "unknown";
  imports: string[]; // raw import targets, static imports included
  body: string; // source without comments and string literals, for simple-name lookups
}

const stripCommentsAndStrings = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/.*$/gm, " ")
    .replace(/"""[\s\S]*?"""/g, '""')
    .replace(/"(?:\\.|[^"\\\n])*"/g, '""');

/** Parses every shipped .java file once; cached per worktree because three analyzers need it. */
const cache = new WeakMap<AnalyzerContext, Promise<JavaSource[]>>();

export function javaSources(ctx: AnalyzerContext): Promise<JavaSource[]> {
  let p = cache.get(ctx);
  if (!p) {
    p = Promise.all(
      ctx.files
        .filter((f) => f.endsWith(".java") && /(^|\/)src\/main\/java\//.test(f) && !isTestFile(f) && !f.endsWith("package-info.java") && !f.endsWith("module-info.java"))
        .map(async (file): Promise<JavaSource> => {
          const body = stripCommentsAndStrings(await readText(ctx.worktree, file));
          const pkg = /^\s*package\s+([\w.]+)\s*;/m.exec(body)?.[1] ?? "";
          const name = basename(file, ".java");
          const imports = [...body.matchAll(/^\s*import\s+(?:static\s+)?([\w.]+(?:\.\*)?)\s*;/gm)].map((m) => m[1]!);
          const decl = new RegExp(String.raw`(?<![\w@])(@interface|class|interface|enum|record)\s+${name}\b`).exec(body)?.[1];
          const kind = decl === "@interface" ? "annotation" : ((decl ?? "unknown") as JavaSource["kind"]);
          return { file, module: javaModulePrefix(file), pkg, name, fqcn: pkg ? `${pkg}.${name}` : name, kind, imports, body };
        }),
    );
    cache.set(ctx, p);
  }
  return p;
}
