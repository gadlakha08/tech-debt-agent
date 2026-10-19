import { existsSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { EvidenceBundle } from "../../domain/schemas.js";
import { run } from "../../shell.js";
import { major } from "../common/files.js";
import type { Analyzer } from "../context.js";
import { TOOLS } from "../tools.js";

const Outdated = z.record(
  z.string(),
  z.object({ current: z.string().optional(), wanted: z.string().optional(), latest: z.string().optional() }).loose(),
);

/** `npm outdated --json` at the repo root; without node_modules, "wanted" (the newest version the range allows) stands in for current. Deprecations are not checked. */
export const npmOutdated: Analyzer = async (ctx) => {
  if (!existsSync(join(ctx.worktree, "package.json"))) return [];
  // exit code 1 just means "something is outdated"
  const res = await run(TOOLS.npm.command(), ["outdated", "--json", "--all=false"], { cwd: ctx.worktree, timeoutMs: 180_000 });
  if (res.exitCode !== 0 && res.exitCode !== 1) throw new Error(`npm outdated exited ${res.exitCode}: ${res.stderr.slice(-300)}`);
  if (!res.stdout.trim()) return [];
  const parsed = Outdated.parse(JSON.parse(res.stdout));
  const out: EvidenceBundle[] = [];
  for (const [name, info] of Object.entries(parsed).sort(([a], [b]) => a.localeCompare(b))) {
    const current = info.current ?? info.wanted;
    const behind = major(info.latest) - major(current);
    if (!(behind >= ctx.thresholds.dependencies.majorsBehind)) continue;
    out.push({
      category: "dependencies",
      rule: "outdated-major",
      symbolPath: name,
      files: ["package.json"],
      metrics: { value: behind, threshold: ctx.thresholds.dependencies.majorsBehind },
      snippet: `${name}: ${current ?? "?"}${info.current ? "" : " (declared range; not installed)"} -> ${info.latest}`,
      stack: "ts",
    });
  }
  return out;
};
