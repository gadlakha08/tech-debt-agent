import { EvidenceBundle, type Stack, type EvidenceBundle as EvidenceBundleType } from "../domain/schemas.js";
import { listSourceFiles } from "./common/files.js";
import { hardcodedUrls } from "./common/hardcoded-urls.js";
import { todoGrep } from "./common/todo-grep.js";
import { codeMetrics as javaCodeMetrics } from "./java/code-metrics.js";
import { missingTests as javaMissingTests } from "./java/missing-tests.js";
import { codeMetrics as tsCodeMetrics } from "./ts/code-metrics.js";
import { missingTests as tsMissingTests } from "./ts/missing-tests.js";

export interface AnalyzerContext {
  worktree: string;
  stack: Stack;
}

export type Analyzer = (ctx: AnalyzerContext) => Promise<EvidenceBundle[]>;

/** Runs the small baseline analyzer set: code metrics, TODOs, hardcoded values, and test-file coverage. */
export async function detectStack(worktree: string): Promise<Stack> {
  const [typescript, java] = await Promise.all([
    listSourceFiles(worktree, [".ts", ".tsx", ".js", ".jsx"]),
    listSourceFiles(worktree, [".java"]),
  ]);
  if (typescript.length === 0 && java.length === 0) throw new Error("Could not detect TypeScript or Java source files in the scanned repository.");
  return java.length > typescript.length ? "java" : "ts";
}

export async function runAnalyzers(ctx: AnalyzerContext): Promise<EvidenceBundleType[]> {
  const language: Analyzer[] = ctx.stack === "ts"
    ? [tsCodeMetrics, tsMissingTests]
    : [javaCodeMetrics, javaMissingTests];
  const evidence = (await Promise.all([todoGrep, hardcodedUrls, ...language].map((analyzer) => analyzer(ctx)))).flat();
  return EvidenceBundle.array().parse(evidence);
}
