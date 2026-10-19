import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { cut } from "../domain/cut.js";
import type { Defect, Finding, ScanContext } from "../domain/schemas.js";
import { UsageMeter } from "../integrations/llm/usage.js";
import { preflight } from "../preflight/index.js";
import { loadProfile } from "../profile/index.js";
import { writeReport } from "../report/index.js";
import { scanEvidence } from "./evidence-scan.js";
import { classify } from "./stages/classify.js";
import { consolidate } from "./stages/consolidate.js";
import { buildDossiers } from "./stages/dossier.js";
import { score } from "./stages/score.js";

export interface ScanOptions {
  repoPath: string;
  dryRun: boolean;
  uncap: boolean;
  max?: number;
  includeDefects: boolean;
}

/**
 * Evidence is collected from a clean worktree first; then preflight gates all model calls.
 * The codebase knowledge-map stage and live Jira adapter are not wired yet.
 */
export async function runScan(opts: ScanOptions): Promise<void> {
  if (opts.max !== undefined && (!Number.isInteger(opts.max) || opts.max < 1)) throw new Error("--max must be a positive integer.");
  const repo = basename(opts.repoPath.replace(/\/+$/, "")) || "repository";
  const profile = await loadProfile(repo);
  if (!profile) throw new Error(`No profile found for ${repo}. Create ~/.techdebt/profiles/${repo}.yaml before scanning.`);

  const scanned = await scanEvidence(opts.repoPath);
  const check = await preflight(profile, { interactive: true, stack: scanned.stack, dryRun: opts.dryRun });
  if (!check.ok) throw new Error("Preflight did not pass; scan stopped before calling the LLM.");

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const runDir = join(homedir(), ".techdebt", "runs", repo, timestamp);
  await mkdir(runDir, { recursive: true });
  const usage = new UsageMeter();
  const stackSummary = `${scanned.stack} repository scanned at ${scanned.defaultBranch} ${scanned.sha}. The current baseline analyzers produced ${scanned.evidence.length} evidence bundles across ${new Set(scanned.evidence.flatMap((item) => item.files)).size} files. Classification must use the supplied evidence; no full-repository knowledge map is available yet.`;
  const ctx: ScanContext = {
    repo,
    repoPath: opts.repoPath,
    worktree: "",
    defaultBranch: scanned.defaultBranch,
    sha: scanned.sha,
    stack: scanned.stack,
    stackSummary,
    runDir,
    profile,
    fallbacks: check.fallbacks,
    dryRun: opts.dryRun,
  };

  const classifications = await classify(ctx, scanned.evidence, usage);
  const findings = classifications.flatMap((entry): Finding[] => entry.type === "finding" ? [entry.finding] : []);
  const defects = classifications.flatMap((entry): Defect[] => entry.type === "defect" ? [entry.defect] : []);
  const items = consolidate(findings);
  const scored = await score(ctx, items, scanned.churn, usage);
  const selected = cut(scored, { floor: 10, cap: opts.max ?? 15, uncap: opts.uncap });
  await buildDossiers(ctx, selected.cut, usage);

  if (!opts.dryRun) {
    throw new Error("Live Jira is not ready: the Jira client adapter is still unimplemented. No Jira changes were made.");
  }
  const report = await writeReport(runDir, {
    repo,
    sha: scanned.sha,
    cut: selected.cut,
    belowCut: selected.belowCut,
    defects,
    includeDefects: opts.includeDefects,
    usage,
    pricePer1MTokens: profile.pricePer1MTokens,
  });
  console.log(`Scan report: ${report.mdPath}`);
  console.log(`Evidence: ${scanned.outputPath}`);
  console.log(`Classified ${scanned.evidence.length} evidence bundles into ${items.length} debt items and ${defects.length} defects.`);
}
