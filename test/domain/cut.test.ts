import { describe, expect, it } from "vitest";
import { cut } from "../../src/domain/cut.js";
import type { DebtItem, Severity } from "../../src/domain/schemas.js";

const item = (n: number, severity: Severity, score: number): DebtItem => ({
  fingerprint: String(n).padStart(10, "0"),
  category: "code",
  rule: "complexity",
  symbolPath: `src/f${n}.ts`,
  title: `item ${n}`,
  description: "",
  findings: [],
  files: [],
  loc: 10,
  severity,
  score,
  effort: "S",
});

describe("cut", () => {
  it("tops up 1 Medium with Low items to the floor of 10", () => {
    const items = [item(0, "Medium", 10), ...Array.from({ length: 14 }, (_, i) => item(i + 1, "Low", 5))];
    const { cut: c, belowCut } = cut(items);
    expect(c).toHaveLength(10);
    expect(c[0]?.severity).toBe("Medium");
    expect(belowCut).toHaveLength(5);
  });

  it("caps at 15 unless uncapped", () => {
    const items = Array.from({ length: 20 }, (_, i) => item(i, "High", 16));
    expect(cut(items).cut).toHaveLength(15);
    expect(cut(items, { uncap: true }).cut).toHaveLength(20);
  });

  it("returns everything when fewer than the floor exist", () => {
    expect(cut([item(1, "Low", 4), item(2, "Low", 5)]).cut.map((i) => i.score)).toEqual([5, 4]);
  });
});
