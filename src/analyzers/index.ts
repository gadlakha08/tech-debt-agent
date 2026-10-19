import { type BuildTool, EvidenceBundle, type RepoKind, type ScanContext } from "../domain/schemas.js";
import { listFiles } from "./common/files.js";
import { hardcodedUrls, secretLiterals } from "./common/hardcoded-urls.js";
import { jscpd } from "./common/jscpd.js";
import { todoGrep } from "./common/todo-grep.js";
import { loadThresholds, type Thresholds } from "./config/index.js";
import type { Analyzer, AnalyzerContext, GraphAnalyzer } from "./context.js";
import { actuator } from "./java/actuator.js";
import { javaImportGraph } from "./java/imports-graph.js";
import { javaPlatformEol, mavenOutdated } from "./java/maven-deps.js";
import { javaMissingTests } from "./java/missing-tests.js";
import { pmd } from "./java/pmd.js";
import { TOOLS, type ToolName, toolAvailable } from "./tools.js";
import { eslint } from "./ts/eslint.js";
import { madge } from "./ts/madge.js";
import { tsMissingTests } from "./ts/missing-tests.js";
import { npmOutdated } from "./ts/npm-outdated.js";

export type { Analyzer, AnalyzerContext, GraphAnalyzer } from "./context.js";
export { TOOLS, type ToolName, toolAvailable } from "./tools.js";

interface Registered {
  run: Analyzer;
  /** What it finds, shown when its tool is missing. */
  finds: string;
  /** External program it runs; without it the analyzer is skipped. */
  tool?: ToolName;
  /** Only for these build tools (default: every build of its stack). */
  builds?: BuildTool[];
}

const COMMON: Record<string, Registered> = {
  todoGrep: { run: todoGrep, finds: "TODO / FIXME comments" },
  hardcodedUrls: { run: hardcodedUrls, finds: "hard-coded URLs" },
  secretLiterals: { run: secretLiterals, finds: "secret-looking literals" },
  jscpd: { run: jscpd, finds: "duplicated code", tool: "jscpd" },
};
const BY_STACK: Record<RepoKind["stack"], { analyzers: Record<string, Registered>; graph: GraphAnalyzer }> = {
  java: {
    analyzers: {
      pmd: { run: pmd, finds: "complex methods, long methods, god classes", tool: "pmd" },
      javaPlatformEol: { run: javaPlatformEol, finds: "end-of-life Spring Boot / Java", builds: ["maven"] },
      mavenOutdated: { run: mavenOutdated, finds: "outdated Maven dependencies", tool: "mvn", builds: ["maven"] },
      javaMissingTests: { run: javaMissingTests, finds: "classes without tests" },
      actuator: { run: actuator, finds: "missing Spring Boot actuator endpoints", builds: ["maven"] },
    },
    graph: javaImportGraph,
  },
  ts: {
    analyzers: {
      eslint: { run: eslint, finds: "complex, long and deeply nested functions" },
      npmOutdated: { run: npmOutdated, finds: "outdated npm packages", tool: "npm" },
      tsMissingTests: { run: tsMissingTests, finds: "modules without tests" },
    },
    graph: madge,
  },
};

/** The analyzers that apply to a repo: the common ones plus its stack's, minus those for another build tool. */
function applicable(repo: Pick<RepoKind, "stack" | "build">): [string, Registered][] {
  return Object.entries({ ...COMMON, ...BY_STACK[repo.stack].analyzers }).filter(([, a]) => !a.builds || a.builds.includes(repo.build));
}

/** The external tools this repo's analyzers need, each with what is lost without it. Preflight checks exactly these. */
export function requiredTools(repo: Pick<RepoKind, "stack" | "build">): { tool: ToolName; install: string; finds: string[] }[] {
  const byTool = new Map<ToolName, string[]>();
  for (const [, a] of applicable(repo)) if (a.tool) byTool.set(a.tool, [...(byTool.get(a.tool) ?? []), a.finds]);
  return [...byTool].map(([tool, finds]) => ({ tool, install: TOOLS[tool].install, finds }));
}

export interface RunAnalyzersOptions {
  /** One analyzer failing (tool missing, network down) is a warning, never a failed Scan. */
  onWarning?: (message: string) => void;
  /** Called as each analyzer (and the import graph) finishes or is skipped, with its name. */
  onAnalyzerDone?: (name: string) => void;
  thresholds?: Thresholds;
}

/** How many units runAnalyzers reports through onAnalyzerDone for a repo: its analyzers plus the import graph. */
export const analyzerCount = (repo: Pick<RepoKind, "stack" | "build">) => applicable(repo).length + 1;

/**
 * Runs the analyzers that apply to the repo (skipping, with a warning, any whose tool is missing): validated bundles
 * with fan-in filled in, the import graph's dependents per file, and every file the analyzers looked at.
 */
export async function runAnalyzers(
  scan: Pick<ScanContext, "worktree"> & Pick<RepoKind, "stack" | "build">,
  opts: RunAnalyzersOptions = {},
): Promise<{ bundles: EvidenceBundle[]; dependents: Map<string, string[]>; files: string[] }> {
  const warn = opts.onWarning ?? ((m: string) => console.warn(`! ${m}`));
  const ctx: AnalyzerContext = {
    worktree: scan.worktree,
    stack: scan.stack,
    files: await listFiles(scan.worktree),
    thresholds: opts.thresholds ?? (await loadThresholds()),
    warn,
  };
  const { graph } = BY_STACK[scan.stack];
  const missing = new Set<ToolName>();
  for (const { tool } of requiredTools(scan)) if (!(await toolAvailable(tool))) missing.add(tool);
  const named = applicable(scan).map(([name, { run, tool, finds }]): [string, Analyzer] => [
    name,
    tool && missing.has(tool)
      ? async () => {
          warn(`${name} skipped: ${tool} is not installed, so no ${finds} (${TOOLS[tool].install})`);
          return [];
        }
      : run,
  ]);

  const done = <T>(name: string, p: Promise<T>) => p.finally(() => opts.onAnalyzerDone?.(name));
  const [graphResult, ...results] = await Promise.allSettled([done(graph.name || "import graph", graph(ctx)), ...named.map(([name, a]) => done(name, a(ctx)))]);
  const bundles: EvidenceBundle[] = [];
  let dependents = new Map<string, string[]>();
  if (graphResult!.status === "fulfilled") {
    bundles.push(...graphResult!.value.bundles);
    dependents = graphResult!.value.dependents;
  } else warn(`${graph.name || "import graph"} failed: ${reason(graphResult!.reason)}`);
  results.forEach((r, i) => {
    if (r.status === "fulfilled") bundles.push(...r.value);
    else warn(`${named[i]![0]} failed: ${reason(r.reason)}`);
  });

  const valid = bundles.flatMap((b) => {
    const known = b.files.map((f) => dependents.get(f)?.length).filter((n): n is number => n !== undefined);
    const withFanIn = b.metrics.fanIn === undefined && known.length ? { ...b, metrics: { ...b.metrics, fanIn: Math.max(...known) } } : b;
    const parsed = EvidenceBundle.safeParse(withFanIn);
    if (parsed.success) return [parsed.data];
    warn(`dropped invalid bundle ${b.rule} ${b.symbolPath}: ${parsed.error.issues[0]?.message}`);
    return [];
  });
  return { bundles: valid, dependents, files: ctx.files };
}

const reason = (e: unknown) => (e instanceof Error ? e.message : String(e)).split("\n")[0]!.slice(0, 300);
