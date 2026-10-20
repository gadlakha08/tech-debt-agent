import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { describeRepo, detectRepo } from "../profile/stack.js";
import { cut } from "../domain/cut.js";
import type { Classification, DebtItem, Defect, Finding, ScanContext } from "../domain/schemas.js";
import { checkout, removeWorktree } from "../integrations/git/worktree.js";
import { createJiraClient } from "../integrations/jira/index.js";
import { circuitModel, costUsd, modelPrice } from "../integrations/llm/pricing.js";
import { UsageMeter } from "../integrations/llm/usage.js";
import { preflight } from "../preflight/index.js";
import { loadProfile, reportsDir, reportsDirProblem, repoName } from "../profile/index.js";
import { writeReport } from "../report/index.js";
import { relatedTestsFinder } from "../analyzers/common/related-tests.js";
import { analyzerCount } from "../analyzers/index.js";
import { scanEvidence } from "./evidence-scan.js";
import { hooks, type Progress, silent } from "./progress.js";
import { classify } from "./stages/classify.js";
import { consolidate } from "./stages/consolidate.js";
import { buildDossiers } from "./stages/dossier.js";
import { score } from "./stages/score.js";
import { ticket } from "./stages/ticket.js";
import { reconcileTickets, type SuppressedTicket } from "./stages/reconcile.js";

export interface ScanOptions {
  repoPath: string;
  dryRun: boolean;
  uncap: boolean;
  max?: number;
  includeDefects: boolean;
}

/** One Scan: temp worktree → preflight → evidence → classify → consolidate → score → Cut → Dossiers → tickets → report. */
export async function runScan(opts: ScanOptions, progress: Progress = silent): Promise<void> {
  if (opts.max !== undefined && (!Number.isInteger(opts.max) || opts.max < 1)) throw new Error("--max must be a positive integer.");
  const repo = repoName(opts.repoPath);
  const profile = await loadProfile(repo);
  if (!profile) throw new Error(`No Repo Profile for ${repo}. Run: dd setup ${opts.repoPath}`);
  const reports = reportsDir(profile);
  const problem = reportsDirProblem(reports, resolve(opts.repoPath));
  if (problem) throw new Error(`Scan Report folder ${reports} ${problem}. Run: dd setup ${opts.repoPath}`);

  progress.start("Checking out the default branch");
  const co = await checkout(opts.repoPath).catch((err: unknown) => {
    progress.fail();
    throw err;
  });
  if (!co.fetched) progress.warn(`git fetch failed (no network, or an SSH key that needs ssh-add); scanning the local origin/${co.defaultBranch}`);
  progress.done(`origin/${co.defaultBranch} @ ${co.sha.slice(0, 10)}`);
  try {
    const repoKind = detectRepo(co.worktree);
    const { stack } = repoKind;
    progress.log("\nPreflight");
    const check = await preflight(profile, { interactive: true, repo: repoKind, dryRun: opts.dryRun });
    if (!check.ok) throw new Error("Preflight did not pass; scan stopped before calling the LLM.");
    progress.log("");

    const runDir = join(reports, new Date().toISOString().replace(/[:.]/g, "-"));
    await mkdir(runDir, { recursive: true });
    const scanned = await step(progress, `Running ${describeRepo(repoKind)} analyzers`, analyzerCount(repoKind),
      () => scanEvidence({ worktree: co.worktree, ...repoKind, runDir, sha: co.sha }, hooks(progress)),
      (r) => `${r.evidence.length} evidence bundles${r.warnings.length ? `, ${r.warnings.length} warning${r.warnings.length === 1 ? "" : "s"}` : ""}`);
    const ctx: ScanContext = {
      repo,
      repoPath: opts.repoPath,
      worktree: co.worktree,
      defaultBranch: co.defaultBranch,
      sha: co.sha,
      stack,
      build: repoKind.build,
      stackSummary: scanned.stackSummary,
      runDir,
      profile,
      fallbacks: check.fallbacks,
      dryRun: opts.dryRun,
    };

    const usage = new UsageMeter();
    const model = circuitModel();
    if (!modelPrice(model)) progress.warn(`no price for model ${model ?? "(unset)"}; the Scan Report will show cost as unknown`);
    const classifications = await step(progress, `Classifying evidence with ${model ?? "the model"}`, scanned.evidence.length,
      () => classify(ctx, scanned.evidence, usage, hooks(progress)),
      (all) => {
        const count = (type: Classification["type"]) => all.filter((entry) => entry.type === type).length;
        return `${count("finding")} findings, ${count("defect")} defects, ${count("discard")} discarded`;
      });
    const findings = classifications.flatMap((entry): Finding[] => (entry.type === "finding" ? [entry.finding] : []));
    const defects = classifications.flatMap((entry): Defect[] => (entry.type === "defect" ? [entry.defect] : []));
    const items = consolidate(findings);
    const jira = opts.dryRun ? undefined : createJiraClient();
    let activeItems = items;
    let suppressed: SuppressedTicket[] = [];
    if (jira) {
      const reconciled = await step(progress, "Reconciling existing Jira debt", items.length,
        () => reconcileTickets(ctx, items, jira),
        (result) => `${result.suppressed.length} Won't Fix suppressed · ${result.disappeared} disappeared · ${result.reappeared} returned`);
      activeItems = reconciled.activeItems;
      suppressed = reconciled.suppressed;
    }
    const relatedTests = relatedTestsFinder(co.worktree, stack, scanned.files);
    const scored = await step(progress, "Scoring Debt Items", activeItems.length,
      () => score(ctx, activeItems, scanned.churn, usage, hooks(progress)),
      (all) => `${all.length} items: ${severityCounts(all)}`);
    const selected = cut(scored, { floor: 10, cap: opts.max ?? 15, uncap: opts.uncap });
    progress.log(`  Cut: ${selected.cut.length} of ${scored.length} (${severityCounts(selected.cut)})`);
    const dossiers = await step(progress, "Writing Dossiers", selected.cut.length,
      () => buildDossiers(ctx, selected.cut, { ...scanned, relatedTests }, usage, hooks(progress)),
      (all) => `${all.length} × context.md + impact.md + design-options.md + implementation-plan.md`);
    let cutItems = selected.cut;
    if (opts.dryRun) progress.log("  Jira ticketing skipped (--dry-run)");
    else
      cutItems = await step(progress, "Ticketing in Jira as techdebt-bot", selected.cut.length,
        () => ticket(ctx, selected.cut, dossiers, jira!, usage, hooks(progress)),
        (all) => all.map((item) => item.ticketKey).join(", "));

    const report = await writeReport(runDir, {
      repo,
      sha: co.sha,
      cut: cutItems,
      belowCut: selected.belowCut,
      suppressed,
      defects,
      includeDefects: opts.includeDefects || profile.includeDefects,
      usage,
      model,
      price: modelPrice(model),
    });
    const totals = Object.values(usage.byStage()).reduce((sum, s) => ({ in: sum.in + s.promptTokens, out: sum.out + s.completionTokens }), { in: 0, out: 0 });
    const price = modelPrice(model);
    const cost = price ? `$${costUsd({ promptTokens: totals.in, completionTokens: totals.out }, price).toFixed(4)}` : "cost unknown";
    progress.log(`\nScan report: ${report.mdPath}`);
    progress.log(`Tokens: ${totals.in.toLocaleString()} in / ${totals.out.toLocaleString()} out · ${cost}`);
  } finally {
    await removeWorktree(opts.repoPath, co.worktree);
  }
}

/** Runs one counted step: start, the work, then done with its summary (or fail, and the error goes up). */
async function step<T>(progress: Progress, title: string, total: number, work: () => Promise<T>, summary: (result: T) => string): Promise<T> {
  progress.start(title, total || undefined);
  try {
    const result = await work();
    progress.done(summary(result));
    return result;
  } catch (err) {
    progress.fail();
    throw err;
  }
}

function severityCounts(items: DebtItem[]): string {
  const by = (severity: string) => items.filter((item) => (item.severity ?? "Low") === severity).length;
  return `High ${by("High")} · Medium ${by("Medium")} · Low ${by("Low")}`;
}
