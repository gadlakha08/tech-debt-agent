import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import pLimit from "p-limit";
import { z } from "zod";
import type { DebtItem, Dossier, ScanContext } from "../../domain/schemas.js";
import { runAgent } from "../../integrations/llm/agent-loop.js";
import type { UsageMeter } from "../../integrations/llm/usage.js";
import { renderPrompt, requiredHeadings } from "../../prompts.js";
import type { StageHooks } from "../progress.js";

const CONTEXT = "dossier-context.md";
const IMPACT = "dossier-impact.md";
const DESIGN_OPTIONS = "dossier-design-options.md";
const IMPLEMENTATION_PLAN = "dossier-implementation-plan.md";
/** Dependents passed to the model; the appended section lists more. */
const MODEL_DEPENDENTS = 25;
const LISTED = 50;

/** What the Scan knows about the code around a Debt Item, from the analyzers rather than the model. */
export interface DossierFacts {
  /** Per shipped file, the shipped files that import it. */
  dependents: Record<string, string[]>;
  /** The test files that name or import any of the given files. */
  relatedTests: (files: string[]) => Promise<string[]>;
  churn: Record<string, number>;
  churnDays: number;
}

/**
 * Fills four Dossier documents per Debt Item in the Cut; regenerates once if a heading is missing.
 * impact.md then gets the Dependents, Tests and Recent changes sections from facts, written by code so the model can't drop or alter them.
 */
export async function buildDossiers(ctx: ScanContext, cut: DebtItem[], facts: DossierFacts, usage: UsageMeter, hooks: StageHooks = {}): Promise<Dossier[]> {
  const limit = pLimit(8);
  return Promise.all(cut.map((item) => limit(async () => {
    const own = new Set(item.files);
    const dependents = [...new Set(item.files.flatMap((file) => facts.dependents[file] ?? []))].filter((file) => !own.has(file)).sort();
    const graphed = item.files.some((file) => file in facts.dependents);
    const tests = await facts.relatedTests(item.files);
    const recentCommits = Object.fromEntries(item.files.map((file) => [file, facts.churn[file] ?? 0]));
    const evidence = item.findings.flatMap((finding) => finding.evidence).map((bundle) => ({
      rule: bundle.rule,
      symbolPath: bundle.symbolPath,
      files: bundle.files,
      metrics: bundle.metrics,
      snippet: bundle.snippet.split(/\r?\n/).slice(0, 150).join("\n"),
    }));
    const source = JSON.stringify({
      title: item.title,
      description: item.description,
      category: item.category,
      rule: item.rule,
      symbolPath: item.symbolPath,
      files: item.files,
      evidence,
      scores: item.scores,
      score: item.score,
      severity: item.severity,
      dependentCount: graphed ? dependents.length : "unknown (no import-graph data for these files)",
      dependents: dependents.slice(0, MODEL_DEPENDENTS),
      relatedTests: tests.slice(0, MODEL_DEPENDENTS),
      recentCommits: { days: facts.churnDays, perFile: recentCommits },
      scannedCommit: ctx.sha,
      defaultBranch: ctx.defaultBranch,
      stackSummary: ctx.stackSummary,
    });
    const [contextMd, impactMd, designOptionsMd, implementationPlanMd] = await Promise.all([
      writeDocument(CONTEXT, "context.md", skeleton(CONTEXT, ctx, item), source, usage, item),
      writeDocument(IMPACT, "impact.md", skeleton(IMPACT, ctx, item), source, usage, item).then(
        (markdown) => `${markdown.trimEnd()}\n\n${factSections(item, graphed ? dependents : undefined, tests, recentCommits, facts.churnDays)}`,
      ),
      writeDocument(DESIGN_OPTIONS, "design-options.md", skeleton(DESIGN_OPTIONS, ctx, item), source, usage, item),
      writeDocument(IMPLEMENTATION_PLAN, "implementation-plan.md", skeleton(IMPLEMENTATION_PLAN, ctx, item), source, usage, item),
    ]);

    const dossier: Dossier = { fingerprint: item.fingerprint, contextMd, impactMd, designOptionsMd, implementationPlanMd };
    const itemDir = join(ctx.runDir, item.fingerprint);
    await mkdir(itemDir, { recursive: true });
    await Promise.all([
      writeFile(join(itemDir, "context.md"), dossier.contextMd, "utf8"),
      writeFile(join(itemDir, "impact.md"), dossier.impactMd, "utf8"),
      writeFile(join(itemDir, "design-options.md"), dossier.designOptionsMd, "utf8"),
      writeFile(join(itemDir, "implementation-plan.md"), dossier.implementationPlanMd, "utf8"),
    ]);
    return dossier;
  }).finally(() => hooks.tick?.(item.title))));
}

const Markdown = z.object({ markdown: z.string().min(1) });

/** One document per call (asking for both at once let the model drop one); regenerates once if a heading is missing. */
async function writeDocument(file: string, document: string, filled: string, source: string, usage: UsageMeter, item: DebtItem): Promise<string> {
  const system = renderPrompt("dossier.md", { document, skeleton: filled });
  const generate = async (prompt: string) => (await runAgent({ stage: "dossier", system: prompt, user: source, outputSchema: Markdown, usage })).markdown;
  let markdown = await generate(system);
  let missing = missingHeadings(file, markdown);
  if (missing.length) {
    markdown = await generate(`${system}\n\n${renderPrompt("dossier-repair.md", { document, missing: missing.join(", ") })}`);
    missing = missingHeadings(file, markdown);
    if (missing.length) throw new Error(`Dossier ${item.fingerprint} ${document} is missing required headings: ${missing.join(", ")}`);
  }
  return markdown;
}

/** A skeleton with the facts code already knows filled in; the model writes the prose. */
function skeleton(file: string, ctx: ScanContext, item: DebtItem): string {
  const s = item.scores;
  return renderPrompt(file, {
    title: item.title,
    sha: ctx.sha,
    defaultBranch: ctx.defaultBranch,
    impact: s?.impact ?? "—",
    reach: s?.reach ?? "—",
    churn: s?.churn ?? "—",
    risk: s?.risk ?? "—",
    score: item.score ?? "—",
    severity: item.severity ?? "Low",
  });
}

/** The appended impact.md sections: who imports the code, which tests touch it, how often it changed. undefined dependents = no graph data. */
export function factSections(item: DebtItem, dependents: string[] | undefined, tests: string[], commits: Record<string, number>, days: number): string {
  const subject = item.files.length === 1 ? `\`${item.files[0]}\`` : `these ${item.files.length} files`;
  const list = (files: string[]) =>
    [...files.slice(0, LISTED).map((file) => `- \`${file}\``), ...(files.length > LISTED ? [`- … and ${files.length - LISTED} more`] : [])].join("\n");
  const dependentsText =
    dependents === undefined
      ? "The import graph has no data for this code (it failed, or the files are not shipped source)."
      : dependents.length
        ? `Shipped files that import ${subject} at the Scanned Commit (tests excluded):\n${list(dependents)}`
        : `No other shipped file imports ${subject}.`;
  const testsText = tests.length
    ? `Test files that are named after or import ${subject}:\n${list(tests)}`
    : `No test file is named after or imports ${subject}. Add tests that pin today's behaviour before changing it.`;
  const changes = Object.entries(commits)
    .sort(([, a], [, b]) => b - a)
    .slice(0, LISTED)
    .map(([file, n]) => `- \`${file}\`: ${n} commit${n === 1 ? "" : "s"}`)
    .join("\n");
  return [
    `## Dependents (${dependents?.length ?? "unknown"})`,
    dependentsText,
    "",
    `## Tests (${tests.length})`,
    testsText,
    "",
    "## Recent changes",
    `Commits touching the affected files in the last ${days} days:`,
    changes || "- none",
    "",
  ].join("\n");
}

/** A heading counts when it starts with the required text, so `## Option 1: Extract a service` or `## **Option 1**` is fine (but not `## Option 10`). */
function missingHeadings(file: string, markdown: string): string[] {
  return requiredHeadings(file).filter((heading) => !new RegExp(`^#{1,6}\\s+\\**${escapeRegExp(heading)}(?!\\w)`, "im").test(markdown));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
