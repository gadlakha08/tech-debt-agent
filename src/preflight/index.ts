import type { Fallbacks, RepoProfile } from "../domain/schemas.js";
import type { CheckResult } from "./checks.js";

export interface PreflightResult {
  ok: boolean;
  fallbacks: Fallbacks;
  report: CheckResult[];
}

/** Runs before any nano call. Interactive only for the hackathon; headless mode is post-hackathon. */
export async function preflight(_profile: RepoProfile, _opts: { interactive: true }): Promise<PreflightResult> {
  throw new Error("not implemented: preflight (Part 2, D1-3)");
}
