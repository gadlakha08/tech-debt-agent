import type { ScanReport } from "./index.js";
import { costUsd } from "../integrations/llm/pricing.js";

export function renderMarkdown(report: ScanReport): string {
  const usage = report.usage.byStage();
  const totals = Object.values(usage).reduce((sum, stage) => ({
    promptTokens: sum.promptTokens + stage.promptTokens,
    completionTokens: sum.completionTokens + stage.completionTokens,
  }), { promptTokens: 0, completionTokens: 0 });
  const lines = [
    `# Tech Debt Scan: ${report.repo}`,
    "",
    `Scanned commit: \`${report.sha}\``,
    "",
    `## Cut (${report.cut.length})`,
    "",
    ...renderItems(report.cut),
    "",
    `## Below the Cut (${report.belowCut.length})`,
    "",
    ...renderItems(report.belowCut),
    "",
    `## Suppressed: Won't Fix (${report.suppressed.length})`,
    "",
    ...(report.suppressed.length
      ? report.suppressed.map((item) => `- \`${item.ticketKey}\` · \`${item.fingerprint}\` · ${escapeCell(item.summary)}`)
      : ["No suppressed tickets."]),
    "",
    `## Defects (${report.defects.length})`,
  ];
  if (report.includeDefects && report.defects.length) {
    lines.push("", ...report.defects.map((defect) => `- **${defect.kind}** — ${escapeCell(defect.description)} (${defect.evidence.files.join(", ")})`));
  } else {
    lines.push("", "Defects are counted here and are not included in the debt Cut.");
  }

  lines.push("", "## Model usage", "", `Model: \`${report.model ?? "unknown"}\``, "", "| Stage | Input tokens | Output tokens |", "|---|---:|---:|");
  for (const [stage, counts] of Object.entries(usage).sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`| ${escapeCell(stage)} | ${counts.promptTokens} | ${counts.completionTokens} |`);
  }
  lines.push(`| **Total** | **${totals.promptTokens}** | **${totals.completionTokens}** |`);
  lines.push("", report.price ? `Estimated model cost: **$${costUsd(totals, report.price).toFixed(4)}**` : `Estimated model cost: unknown (no price for \`${report.model ?? "unknown"}\` in MODEL_PRICES)`);
  lines.push("");
  return lines.join("\n");
}

function renderItems(items: ScanReport["cut"]): string[] {
  if (items.length === 0) return ["No items."];
  return [
    "| Severity | Score | Category | Debt item | Fingerprint | Ticket |",
    "|---|---:|---|---|---|---|---|",
    ...items.map((item) => {
      const ticket = item.ticketKey ? `\`${item.ticketKey}\`` : "—";
      return `| ${item.severity ?? "Unscored"} | ${item.score ?? "—"} | ${item.category} | ${escapeCell(item.title)} | \`${item.fingerprint}\` | ${ticket} |`;
    }),
  ];
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}
