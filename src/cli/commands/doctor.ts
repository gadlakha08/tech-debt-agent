import type { Command } from "commander";
import { detectRepo } from "../../profile/stack.js";
import type { RepoProfile } from "../../domain/schemas.js";
import { preflight as runPreflight, type PreflightOptions, type PreflightResult } from "../../preflight/index.js";
import { loadProfile, repoName } from "../../profile/index.js";

export interface DoctorDeps {
  preflight: (profile: RepoProfile, opts: PreflightOptions) => Promise<PreflightResult>;
  print: (line: string) => void;
}

/** Preflight for one clone: detect its language and build tool, then check only the tools its analyzers need. */
export const preflightRepo = (deps: DoctorDeps, profile: RepoProfile, repoPath: string) =>
  deps.preflight(profile, { interactive: true, repo: detectRepo(repoPath), repoPath });

/** Preflight on its own, against the saved Repo Profile. */
export async function doctor(repoPath: string, deps: DoctorDeps): Promise<{ ok: boolean }> {
  const profile = await loadProfile(repoName(repoPath));
  if (!profile) {
    deps.print(`No Repo Profile for ${repoName(repoPath)}. Run: dd setup ${repoPath}`);
    return { ok: false };
  }
  const res = await preflightRepo(deps, profile, repoPath);
  deps.print(res.ok ? "\nReady to scan." : "\nNot ready: fix the ✖ items above.");
  return { ok: res.ok };
}

export function registerDoctor(program: Command): void {
  program
    .command("doctor")
    .description("Run preflight on its own: environment and Jira permissions")
    .argument("<repoPath>", "local clone of the repo")
    .action(async (repoPath: string) => {
      const res = await doctor(repoPath, { preflight: runPreflight, print: (l) => console.log(l) });
      process.exitCode = res.ok ? 0 : 1;
    });
}
