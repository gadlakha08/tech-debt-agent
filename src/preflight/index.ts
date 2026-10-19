import type { Fallbacks, RepoProfile } from "../domain/schemas.js";
import type { CheckResult } from "./checks.js";
import { environmentChecks } from "./checks.js";
import type { Stack } from "../domain/schemas.js";
import { askChoice } from "./prompt.js";

export interface PreflightResult {
  ok: boolean;
  fallbacks: Fallbacks;
  report: CheckResult[];
}

/** Runs before model calls. Live Jira is intentionally blocked until its adapter is implemented. */
export async function preflight(
  _profile: RepoProfile,
  opts: { interactive: boolean; stack: Stack; dryRun: boolean },
): Promise<PreflightResult> {
  while (true) {
    const report = await environmentChecks(opts.stack, { dryRun: opts.dryRun });
    for (const check of report) console.log(`${check.ok ? "✓" : check.blocking ? "✗" : "!"} ${check.name}: ${check.detail}`);
    const fallbacks: Fallbacks = { noAttach: false, noEpicLink: false, noComments: false };
    const blocked = report.some((check) => check.blocking && !check.ok);
    if (!blocked) return { ok: true, fallbacks, report };
    if (!opts.interactive || await askChoice(true) === "quit") return { ok: false, fallbacks, report };
  }
}
