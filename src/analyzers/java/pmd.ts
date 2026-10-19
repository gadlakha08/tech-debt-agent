import { readFile, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { z } from "zod";
import type { EvidenceBundle } from "../../domain/schemas.js";
import { withTempDir } from "../../paths.js";
import { run } from "../../shell.js";
import type { Thresholds } from "../config/index.js";
import { blockEnd, capLines, isTestFile, readText, symbolFor } from "../common/files.js";
import type { Analyzer } from "../context.js";
import { TOOLS } from "../tools.js";

const Report = z.object({
  files: z.array(
    z.object({
      filename: z.string(),
      violations: z.array(z.object({ beginline: z.number(), description: z.string(), rule: z.string() })),
    }),
  ),
  processingErrors: z.array(z.object({ filename: z.string(), message: z.string() })).default([]),
});

/** Generated from thresholds.yaml so there is one place to tune noise. PMD 7 dropped ExcessiveMethodLength; NcssCount covers it. */
export function pmdRuleset(t: Thresholds["code"]): string {
  return `<?xml version="1.0"?>
<ruleset name="debtdoctor" xmlns="http://pmd.sourceforge.net/ruleset/2.0.0">
  <description>DebtDoctor, generated from thresholds.yaml</description>
  <rule ref="category/java/design.xml/CyclomaticComplexity">
    <properties>
      <property name="methodReportLevel" value="${t.complexity + 1}"/>
      <property name="classReportLevel" value="99999"/>
    </properties>
  </rule>
  <rule ref="category/java/design.xml/GodClass"/>
  <rule ref="category/java/design.xml/NcssCount">
    <properties>
      <property name="methodReportLevel" value="${t.maxLinesPerFunction + 1}"/>
      <property name="classReportLevel" value="${t.maxLinesPerFile + 1}"/>
    </properties>
  </rule>
</ruleset>
`;
}


const NAMED = /The (method|constructor|class|enum|interface|record) '([^'(]+)(?:\([^']*\))?' has (?:a|an)(?: total)? (cyclomatic complexity|NCSS line count) of (\d+)/;

// PMD rule (":method" when the violation names a method or constructor) → bundle rule and its threshold
const RULES: Record<string, { bundleRule: string; threshold?: (t: Thresholds["code"]) => number }> = {
  GodClass: { bundleRule: "god-class" },
  CyclomaticComplexity: { bundleRule: "complexity", threshold: (t) => t.complexity },
  "NcssCount:method": { bundleRule: "long-method", threshold: (t) => t.maxLinesPerFunction },
  NcssCount: { bundleRule: "large-class", threshold: (t) => t.maxLinesPerFile },
};

/** CyclomaticComplexity, GodClass and NcssCount over every src/main/java tree. Exit code 4 means "violations found". */
export const pmd: Analyzer = async (ctx) => {
  const roots = [...new Set(ctx.files.flatMap((f) => (/^(.*?)src\/main\/java\//.exec(f) && !isTestFile(f) ? [`${/^(.*?)src\/main\/java\//.exec(f)![1]}src/main/java`] : [])))];
  if (roots.length === 0) return [];
  return withTempDir("pmd", async (tmp) => {
    const ruleset = join(tmp, "ruleset.xml");
    const report = join(tmp, "pmd.json");
    await writeFile(ruleset, pmdRuleset(ctx.thresholds.code));
    const res = await run(
      TOOLS.pmd.command(),
      ["check", "-d", roots.join(","), "-R", ruleset, "-f", "json", "--no-progress", "--no-cache", "-r", report],
      { cwd: ctx.worktree, timeoutMs: 600_000 },
    );
    if (res.exitCode !== 0 && res.exitCode !== 4) throw new Error(`pmd exited ${res.exitCode}: ${res.stderr.slice(-300)}`);
    const parsed = Report.parse(JSON.parse(await readFile(report, "utf8")));
    if (parsed.processingErrors.length) ctx.warn(`pmd could not parse ${parsed.processingErrors.length} file(s)`);

    const out: EvidenceBundle[] = [];
    for (const f of parsed.files) {
      const file = (f.filename.startsWith("/") ? relative(ctx.worktree, f.filename) : f.filename).split(sep).join("/");
      const lines = (await readText(ctx.worktree, file)).split("\n");
      const classSym = symbolFor(file, "java");
      for (const v of f.violations) {
        const m = NAMED.exec(v.description);
        const isMethod = m?.[1] === "method" || m?.[1] === "constructor";
        const value = m ? Number(m[4]) : undefined;
        const spec = RULES[`${v.rule}${isMethod ? ":method" : ""}`] ?? RULES[v.rule];
        if (!spec) continue;
        const { bundleRule: rule } = spec;
        const threshold = spec.threshold?.(ctx.thresholds.code);
        const symbolPath = isMethod ? `${classSym}#${m![2]}` : classSym;
        // a method rule's size and excerpt are the method (declaration to matching brace); a class rule's are the file
        const end = isMethod ? (blockEnd(lines, v.beginline) ?? Math.min(lines.length, v.beginline + 40)) : lines.length;
        const body = isMethod ? lines.slice(v.beginline - 1, end) : lines.slice(0, 60);
        out.push({
          category: "code",
          rule,
          symbolPath,
          files: [file],
          metrics: { value, threshold, loc: isMethod ? end - v.beginline + 1 : lines.length },
          snippet: capLines(`${v.rule}: ${v.description}\n\n${body.join("\n")}`),
          stack: "java",
        });
      }
    }
    return out;
  });
};
