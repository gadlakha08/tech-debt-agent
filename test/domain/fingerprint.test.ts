import { describe, expect, it } from "vitest";
import { fingerprint, normaliseSymbolPath } from "../../src/domain/fingerprint.js";

describe("fingerprint", () => {
  it("is 10 hex chars and ignores line numbers", () => {
    const a = fingerprint({ category: "code", rule: "complexity", symbolPath: "src/a.ts#build:42" });
    const b = fingerprint({ category: "code", rule: "complexity", symbolPath: "src/a.ts#build:97" });
    expect(a).toMatch(/^[0-9a-f]{10}$/);
    expect(a).toBe(b);
  });

  it("changes when the rule changes", () => {
    const base = { category: "code" as const, symbolPath: "src/a.ts#build" };
    expect(fingerprint({ ...base, rule: "complexity" })).not.toBe(fingerprint({ ...base, rule: "max-depth" }));
  });

  it("normalises separators and case", () => {
    expect(normaliseSymbolPath("Src\\A.ts#L10-L20")).toBe("src/a.ts");
  });
});
