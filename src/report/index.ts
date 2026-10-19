import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { DebtItem, Defect } from "../domain/schemas.js";
import type { RepoProfile } from "../domain/schemas.js";
import type { UsageMeter } from "../integrations/llm/usage.js";
import { costUsd } from "./cost.js";
import { renderMarkdown } from "./render-md.js";

export interface ScanReport {
  repo: string;
  sha: string;
  cut: DebtItem[];
  belowCut: DebtItem[];
  defects: Defect[];
  includeDefects: boolean;
  usage: UsageMeter;
  pricePer1MTokens?: RepoProfile["pricePer1MTokens"];
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
    ...(report.pricePer1MTokens ? { costUsd: costUsd(totals, report.pricePer1MTokens) } : {}),
  };
  await Promise.all([
    writeFile(mdPath, renderMarkdown(report), "utf8"),
    writeFile(jsonPath, `${JSON.stringify(json, null, 2)}\n`, "utf8"),
  ]);
  return { mdPath, jsonPath };
}
