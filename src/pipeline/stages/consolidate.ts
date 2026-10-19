import { fingerprint } from "../../domain/fingerprint.js";
import type { DebtItem, EvidenceBundle, Finding } from "../../domain/schemas.js";

/** Merges Findings sharing a Fingerprint into one Debt Item, unioning their evidence. */
export function consolidate(findings: Finding[]): DebtItem[] {
  const groups = new Map<string, {
    category: EvidenceBundle["category"];
    rule: string;
    symbolPath: string;
    title: string;
    description: string;
    evidence: Map<string, EvidenceBundle>;
    findings: Map<string, Finding>;
  }>();

  for (const finding of findings) {
    // A Finding may contain evidence from more than one symbol. Split it so each
    // Debt Item has one stable identity and its own coherent evidence set.
    const byFingerprint = new Map<string, EvidenceBundle[]>();
    for (const bundle of finding.evidence) {
      const fp = fingerprint(bundle);
      const bundles = byFingerprint.get(fp) ?? [];
      bundles.push(bundle);
      byFingerprint.set(fp, bundles);
    }

    for (const [fp, bundles] of byFingerprint) {
      const first = bundles[0];
      if (!first) continue;
      let group = groups.get(fp);
      if (!group) {
        group = {
          category: first.category,
          rule: first.rule,
          symbolPath: first.symbolPath,
          title: finding.title,
          description: finding.description,
          evidence: new Map(),
          findings: new Map(),
        };
        groups.set(fp, group);
      }

      for (const bundle of bundles) group.evidence.set(stableJson(bundle), bundle);
      const narrowedFinding: Finding = { ...finding, evidence: bundles };
      group.findings.set(stableJson(narrowedFinding), narrowedFinding);
    }
  }

  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([fp, group]) => {
      const evidence = [...group.evidence.values()];
      const files = [...new Set(evidence.flatMap((bundle) => bundle.files))].sort();
      return {
        fingerprint: fp,
        category: group.category,
        rule: group.rule,
        symbolPath: group.symbolPath,
        title: group.title,
        description: group.description,
        findings: [...group.findings.values()],
        files,
      };
    });
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? String(value);
}
