import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import pLimit from "p-limit";
import { z } from "zod";
import type { DebtItem, Dossier, ScanContext } from "../../domain/schemas.js";
import { runAgent } from "../../integrations/llm/agent-loop.js";
import type { UsageMeter } from "../../integrations/llm/usage.js";

export const CONTEXT_HEADINGS = ["What", "Where", "Evidence", "Why it is debt", "Scanned Commit"] as const;
export const IMPACT_HEADINGS = ["Rubric scores", "Severity", "Effort", "Who / what is affected", "Risk of leaving it"] as const;

/** Fills templates/dossier/*.md per Debt Item in the Cut; regenerates once if a heading is missing. */
export async function buildDossiers(ctx: ScanContext, cut: DebtItem[], usage: UsageMeter): Promise<Dossier[]> {
  const limit = pLimit(8);
  return Promise.all(cut.map((item) => limit(async () => {
    const outputSchema = z.object({ contextMd: z.string().min(1), impactMd: z.string().min(1) });
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
      effort: item.effort,
      scannedCommit: ctx.sha,
      defaultBranch: ctx.defaultBranch,
      stackSummary: ctx.stackSummary,
    });
    let generated = await generateDossier(outputSchema, usage, source);
    const missing = missingRequiredHeadings(generated);
    if (missing.length) {
      generated = await generateDossier(outputSchema, usage, source, `Repair the Markdown. These required headings are missing: ${missing.join(", ")}. Keep the content evidence-based and include every required heading.`);
      const remaining = missingRequiredHeadings(generated);
      if (remaining.length) throw new Error(`Dossier ${item.fingerprint} is missing required headings: ${remaining.join(", ")}`);
    }

    const dossier: Dossier = { fingerprint: item.fingerprint, ...generated };
    const itemDir = join(ctx.runDir, item.fingerprint);
    await mkdir(itemDir, { recursive: true });
    await Promise.all([
      writeFile(join(itemDir, "context.md"), dossier.contextMd, "utf8"),
      writeFile(join(itemDir, "impact.md"), dossier.impactMd, "utf8"),
    ]);
    return dossier;
  })));
}

async function generateDossier(
  outputSchema: z.ZodObject<{ contextMd: z.ZodString; impactMd: z.ZodString }>,
  usage: UsageMeter,
  source: string,
  repairInstruction?: string,
): Promise<{ contextMd: string; impactMd: string }> {
  return runAgent({
    stage: "dossier",
    system: [
      "Write two concise, accurate Markdown documents for a technical-debt item.",
      `context.md must contain these headings: ${CONTEXT_HEADINGS.join(", ")}.`,
      `impact.md must contain these headings: ${IMPACT_HEADINGS.join(", ")}.`,
      "Use evidence and rubric values supplied in the input. Do not invent causes, callers, or impacts.",
      "Return the complete Markdown in contextMd and impactMd, including heading markers.",
      repairInstruction ?? "",
    ].filter(Boolean).join("\n"),
    user: source,
    outputSchema,
    usage,
  });
}

function missingRequiredHeadings(dossier: { contextMd: string; impactMd: string }): string[] {
  const required = [
    ...CONTEXT_HEADINGS.map((heading) => ({ document: "context.md", heading, content: dossier.contextMd })),
    ...IMPACT_HEADINGS.map((heading) => ({ document: "impact.md", heading, content: dossier.impactMd })),
  ];
  return required
    .filter(({ heading, content }) => !new RegExp(`^#{1,6}\\s+${escapeRegExp(heading)}\\s*$`, "im").test(content))
    .map(({ document, heading }) => `${document}: ${heading}`);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
