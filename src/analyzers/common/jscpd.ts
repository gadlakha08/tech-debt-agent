import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { EvidenceBundle } from "../../domain/schemas.js";
import { run } from "../../shell.js";
import { packageRoot, withTempDir } from "../../paths.js";
import type { Analyzer } from "../context.js";
import { capLines, EXCLUDE_DIRS, isTestFile, symbolFor } from "./files.js";
import { TOOLS } from "../tools.js";

const Report = z.object({
  duplicates: z.array(
    z.object({
      lines: z.number(),
      fragment: z.string().default(""),
      firstFile: z.object({ name: z.string(), start: z.number(), end: z.number() }),
      secondFile: z.object({ name: z.string(), start: z.number(), end: z.number() }),
    }),
  ),
});

const FORMATS = { java: "java,kotlin", ts: "typescript,javascript,tsx,jsx" } as const;
const IGNORE = [...[...EXCLUDE_DIRS].map((d) => `**/${d}/**`), "**/*.min.js", "**/*.d.ts"].join(",");

/** Copy-paste clones via jscpd, one bundle per pair of files (clones inside one file pair are summed). */
export const jscpd: Analyzer = (ctx) =>
  withTempDir("jscpd", async (out) => {
    const res = await run(
      TOOLS.jscpd.command(),
      [
        ".",
        "--reporters", "json",
        "--output", out,
        "--silent",
        "--min-tokens", String(ctx.thresholds.code.duplicationMinTokens),
        "--min-lines", String(ctx.thresholds.code.duplicationMinLines),
        "--format", FORMATS[ctx.stack],
        "--ignore", IGNORE,
      ],
      { cwd: ctx.worktree, timeoutMs: 300_000 },
    );
    if (res.exitCode !== 0) throw new Error(`jscpd exited ${res.exitCode}: ${res.stderr.slice(-300)}`);
    const report = Report.parse(JSON.parse(await readFile(join(out, "jscpd-report.json"), "utf8")));

    const pairs = new Map<string, { files: [string, string]; loc: number; clones: number; fragment: string }>();
    for (const d of report.duplicates) {
      const a = d.firstFile.name.replace(/^\.\//, "");
      const b = d.secondFile.name.replace(/^\.\//, "");
      if (isTestFile(a) || isTestFile(b)) continue;
      const files = [a, b].sort() as [string, string];
      const key = files.join("\0");
      const p = pairs.get(key) ?? { files, loc: 0, clones: 0, fragment: "" };
      p.loc += d.lines;
      p.clones += 1;
      if (!p.fragment) p.fragment = `${a}:${d.firstFile.start}-${d.firstFile.end} ≈ ${b}:${d.secondFile.start}-${d.secondFile.end}\n${d.fragment}`;
      pairs.set(key, p);
    }
    return [...pairs.values()].map(
      (p): EvidenceBundle => ({
        category: "code",
        rule: "duplication",
        symbolPath: p.files.map((f) => symbolFor(f, ctx.stack)).join(" ~ "),
        files: p.files[0] === p.files[1] ? [p.files[0]] : p.files,
        metrics: { loc: p.loc, value: p.clones, threshold: ctx.thresholds.code.duplicationMinLines },
        snippet: capLines(p.fragment),
        stack: ctx.stack,
      }),
    );
  });
