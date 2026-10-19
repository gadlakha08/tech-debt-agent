import type { ScanReport } from "./index.js";
import { costUsd } from "./cost.js";

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
    `## Defects (${report.defects.length})`,
  ];
  if (report.includeDefects && report.defects.length) {
    lines.push("", ...report.defects.map((defect) => `- **${defect.kind}** — ${escapeCell(defect.description)} (${defect.evidence.files.join(", ")})`));
  } else {
    lines.push("", "Defects are counted here and are not included in the debt Cut.");
  }

  lines.push("", "## Model usage", "", "| Stage | Input tokens | Output tokens |", "|---|---:|---:|");
  for (const [stage, counts] of Object.entries(usage).sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`| ${escapeCell(stage)} | ${counts.promptTokens} | ${counts.completionTokens} |`);
  }
  lines.push(`| **Total** | **${totals.promptTokens}** | **${totals.completionTokens}** |`);
  if (report.pricePer1MTokens) lines.push("", `Estimated model cost: **$${costUsd(totals, report.pricePer1MTokens).toFixed(4)}**`);
  lines.push("");
  return lines.join("\n");
}

function renderItems(items: ScanReport["cut"]): string[] {
  if (items.length === 0) return ["No items."];
  return [
    "| Severity | Score | Effort | Category | Debt item | Fingerprint | Ticket |",
    "|---|---:|---|---|---|---|---|",
    ...items.map((item) => {
      const ticket = item.ticketKey ? `\`${item.ticketKey}\`` : "—";
      return `| ${item.severity ?? "Unscored"} | ${item.score ?? "—"} | ${item.effort ?? "—"} | ${item.category} | ${escapeCell(item.title)} | \`${item.fingerprint}\` | ${ticket} |`;
    }),
  ];
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}
