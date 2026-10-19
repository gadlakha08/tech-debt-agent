import type { RubricScores, Severity } from "./schemas.js";

/** Maps a value's percentile within `all` onto 1–5. */
export function percentileScore(value: number, all: number[]): number {
  if (all.length === 0) return 1;
  const below = all.filter((v) => v < value).length;
  const pct = below / all.length;
  return Math.min(5, Math.floor(pct * 5) + 1);
}

export function totalScore(s: Pick<RubricScores, "impact" | "reach" | "churn" | "risk">): number {
  return s.impact + s.reach + s.churn + s.risk;
}

export function severityFromScore(score: number): Severity {
  if (score >= 15) return "High";
  if (score >= 9) return "Medium";
  return "Low";
}
