import type { EvidenceBundle, Stack } from "../domain/schemas.js";
import type { Thresholds } from "./config/index.js";

/** What every analyzer gets: the worktree, its file list (repo-relative), and the thresholds. */
export interface AnalyzerContext {
  worktree: string;
  stack: Stack;
  files: string[];
  thresholds: Thresholds;
  warn: (message: string) => void;
}

export type Analyzer = (ctx: AnalyzerContext) => Promise<EvidenceBundle[]>;

/**
 * An import-graph analyzer also yields, per shipped file, the shipped files that depend on it (tests excluded).
 * runAnalyzers turns the count into fanIn on every bundle; the Dossier lists the files themselves.
 */
export type GraphAnalyzer = (ctx: AnalyzerContext) => Promise<{ bundles: EvidenceBundle[]; dependents: Map<string, string[]> }>;
