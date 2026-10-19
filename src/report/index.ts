import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { DebtItem, Defect } from "../domain/schemas.js";
import type { UsageMeter } from "../integrations/llm/usage.js";
import { costUsd, type ModelPrice } from "../integrations/llm/pricing.js";
import { renderMarkdown } from "./render-md.js";

export interface ScanReport {
  repo: string;
  sha: string;
  cut: DebtItem[];
  belowCut: DebtItem[];
  defects: Defect[];
  includeDefects: boolean;
  usage: UsageMeter;
  /** CircuIT deployment the Scan ran on. */
  model?: string;
  /** From MODEL_PRICES; undefined when the model is not listed, so cost is unknown. */
  price?: ModelPrice;
}

/** Writes report.md + report.json into ctx.runDir. */
export async function writeReport(runDir: string, report: ScanReport): Promise<{ mdPath: string; jsonPath: string }> {
  await mkdir(runDir, { recursive: true });
  const mdPath = join(runDir, "report.md");
  const jsonPath = join(runDir, "report.json");
  const byStage = report.usage.byStage();
  const totals = Object.values(byStage).reduce((sum, stage) => ({
    promptTokens: sum.promptTokens + stage.promptTokens,
    completionTokens: sum.completionTokens + stage.completionTokens,
  }), { promptTokens: 0, completionTokens: 0 });
  const json = {
    repo: report.repo,
    sha: report.sha,
    cut: report.cut,
    belowCut: report.belowCut,
    defectCount: report.defects.length,
    ...(report.includeDefects ? { defects: report.defects } : {}),
    usage: { byStage, totals },
    model: report.model ?? null,
    costUsd: report.price ? costUsd(totals, report.price) : null,
  };
  await Promise.all([
    writeFile(mdPath, renderMarkdown(report), "utf8"),
    writeFile(jsonPath, `${JSON.stringify(json, null, 2)}\n`, "utf8"),
  ]);
  return { mdPath, jsonPath };
}
