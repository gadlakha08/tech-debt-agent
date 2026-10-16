import { describe, expect, it } from "vitest";
import evidence from "../../fixtures/evidence-admin-mfe.json" with { type: "json" };
import { EvidenceBundle } from "../../src/domain/schemas.js";

describe("fixtures", () => {
  it("evidence fixture matches the EvidenceBundle schema", () => {
    expect(() => EvidenceBundle.array().parse(evidence)).not.toThrow();
  });
});
