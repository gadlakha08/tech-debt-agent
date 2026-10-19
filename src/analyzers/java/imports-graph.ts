import type { EvidenceBundle } from "../../domain/schemas.js";
import { capLines } from "../common/files.js";
import type { GraphAnalyzer } from "../context.js";
import { javaSources, type JavaSource } from "./sources.js";

/** Class-level dependency edges from import lines, wildcard imports and same-package references. */
export function classEdges(sources: JavaSource[]): Map<string, Set<string>> {
  const byFqcn = new Map(sources.map((s) => [s.fqcn, s]));
  const byPkg = new Map<string, JavaSource[]>();
  for (const s of sources) byPkg.set(s.pkg, [...(byPkg.get(s.pkg) ?? []), s]);
  const mentions = (s: JavaSource, name: string) => new RegExp(String.raw`\b${name}\b`).test(s.body);

  const edges = new Map<string, Set<string>>();
  for (const s of sources) {
    const deps = new Set<string>();
    for (const imp of s.imports) {
      if (imp.endsWith(".*")) {
        const base = imp.slice(0, -2);
        if (byFqcn.has(base)) deps.add(base); // import static a.B.*
        for (const t of byPkg.get(base) ?? []) if (mentions(s, t.name)) deps.add(t.fqcn);
      } else {
        // a.b.C, a.b.C.Inner, or a static member a.b.C.method: take the longest known prefix
        const parts = imp.split(".");
        for (let i = parts.length; i > 0; i--) {
          const candidate = parts.slice(0, i).join(".");
          if (byFqcn.has(candidate)) {
            deps.add(candidate);
            break;
          }
        }
      }
    }
    for (const t of byPkg.get(s.pkg) ?? []) if (t !== s && mentions(s, t.name)) deps.add(t.fqcn);
    deps.delete(s.fqcn);
    edges.set(s.fqcn, deps);
  }
  return edges;
}

/** Tarjan's strongly connected components; returns only components with more than one node. */
export function cycles(graph: Map<string, Set<string>>): string[][] {
  let index = 0;
  const idx = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const out: string[][] = [];
  const strong = (v: string) => {
    idx.set(v, index);
    low.set(v, index++);
    stack.push(v);
    onStack.add(v);
    for (const w of graph.get(v) ?? []) {
      if (!idx.has(w)) {
        strong(w);
        low.set(v, Math.min(low.get(v)!, low.get(w)!));
      } else if (onStack.has(w)) low.set(v, Math.min(low.get(v)!, idx.get(w)!));
    }
    if (low.get(v) === idx.get(v)) {
      const scc: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        scc.push(w);
      } while (w !== v);
      if (scc.length > 1) out.push(scc.sort());
    }
  };
  for (const v of graph.keys()) if (!idx.has(v)) strong(v);
  return out;
}

/** Package cycles plus, per class file, the other class files that depend on it. */
export const javaImportGraph: GraphAnalyzer = async (ctx) => {
  const sources = await javaSources(ctx);
  const bySym = new Map(sources.map((s) => [s.fqcn, s]));
  const edges = classEdges(sources);

  const users = new Map<string, Set<string>>(sources.map((s) => [s.file, new Set()]));
  for (const [from, deps] of edges) for (const d of deps) users.get(bySym.get(d)!.file)!.add(bySym.get(from)!.file);
  const dependents = new Map([...users].map(([file, by]) => [file, [...by].sort()]));

  if (!ctx.thresholds.architecture.reportCircular) return { bundles: [], dependents };

  const pkgOf = (fqcn: string) => bySym.get(fqcn)!.pkg;
  const pkgGraph = new Map<string, Set<string>>();
  for (const [from, deps] of edges) {
    const p = pkgGraph.get(pkgOf(from)) ?? new Set<string>();
    for (const d of deps) if (pkgOf(d) !== pkgOf(from)) p.add(pkgOf(d));
    pkgGraph.set(pkgOf(from), p);
  }

  const bundles = cycles(pkgGraph).map((pkgs): EvidenceBundle => {
    const inCycle = new Set(pkgs);
    const crossing = [...edges].flatMap(([from, deps]) =>
      [...deps].filter((d) => inCycle.has(pkgOf(from)) && inCycle.has(pkgOf(d)) && pkgOf(d) !== pkgOf(from)).map((d) => [from, d] as const),
    );
    const files = [...new Set(crossing.flatMap(([a, b]) => [bySym.get(a)!.file, bySym.get(b)!.file]))].sort();
    return {
      category: "architecture",
      rule: "package-cycle",
      symbolPath: pkgs.join(" <-> "),
      files,
      metrics: { value: pkgs.length, loc: crossing.length },
      snippet: capLines([`Packages in cycle: ${pkgs.join(", ")}`, ...crossing.map(([a, b]) => `${a} -> ${b}`)].join("\n")),
      stack: "java",
    };
  });
  return { bundles, dependents };
};
