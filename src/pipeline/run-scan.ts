export interface ScanOptions {
  repoPath: string;
  dryRun: boolean;
  uncap: boolean;
  max?: number;
  includeDefects: boolean;
}

/**
 * Stages: 0 preflight → 1 checkout → 2 knowledge → 3 analyzers → 4 classify → 5 consolidate
 * → 6 score → 7 cut → 8 dossier → 9 ticket → 10 report. --dry-run stops before Jira.
 */
export async function runScan(_opts: ScanOptions): Promise<void> {
  throw new Error("not implemented: runScan (Part 1)");
}
