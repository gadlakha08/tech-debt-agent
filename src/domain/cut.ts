import type { DebtItem, Effort, Severity } from "./schemas.js";

const SEVERITY_RANK: Record<Severity, number> = { High: 0, Medium: 1, Low: 2 };
const EFFORT_RANK: Record<Effort, number> = { S: 0, M: 1, L: 2, XL: 3 };

export interface CutOptions {
  floor?: number;
  cap?: number;
  uncap?: boolean;
}

/** Sort: Severity, then score, then smaller Effort. */
export function rank(items: DebtItem[]): DebtItem[] {
  return [...items].sort(
    (a, b) =>
      SEVERITY_RANK[a.severity ?? "Low"] - SEVERITY_RANK[b.severity ?? "Low"] ||
      (b.score ?? 0) - (a.score ?? 0) ||
      EFFORT_RANK[a.effort ?? "XL"] - EFFORT_RANK[b.effort ?? "XL"],
  );
}

/** Every High and Medium, topped up with Low to `floor`, capped at `cap` unless uncapped. */
export function cut(items: DebtItem[], { floor = 10, cap = 15, uncap = false }: CutOptions = {}) {
  const ranked = rank(items);
  const highMedium = ranked.filter((i) => i.severity !== "Low");
  const size = Math.max(highMedium.length, Math.min(floor, ranked.length));
  const limit = uncap ? size : Math.min(size, cap);
  return { cut: ranked.slice(0, limit), belowCut: ranked.slice(limit) };
}
