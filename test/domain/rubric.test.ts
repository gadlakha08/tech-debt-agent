import { describe, expect, it } from "vitest";
import { effortFromLoc, percentileScore, severityFromScore } from "../../src/domain/rubric.js";

describe("rubric", () => {
  it("bands Severity at 15 and 9", () => {
    expect(severityFromScore(15)).toBe("High");
    expect(severityFromScore(14)).toBe("Medium");
    expect(severityFromScore(9)).toBe("Medium");
    expect(severityFromScore(8)).toBe("Low");
  });

  it("maps LOC to Effort", () => {
    expect([49, 50, 299, 300, 999, 1000].map(effortFromLoc)).toEqual(["S", "M", "M", "L", "L", "XL"]);
  });

  it("maps percentiles onto 1–5", () => {
    const all = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(percentileScore(1, all)).toBe(1);
    expect(percentileScore(10, all)).toBe(5);
  });
});
