import { existsSync, statSync } from "node:fs";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { parse, stringify } from "yaml";
import { RepoProfile, sharedJiraProject } from "../domain/schemas.js";
import { debtdoctorHome, isInside } from "../paths.js";

export const profilePath = (repo: string) => join(debtdoctorHome(), "profiles", `${repo}.yaml`);

export const defaultReportsDir = (repo: string) => join(debtdoctorHome(), "runs", repo);

/** Where this repo's Scan Reports go: the profile's reportsDir, else ~/.debtdoctor/runs/<repo>. */
export const reportsDir = (profile: RepoProfile) => profile.reportsDir ?? defaultReportsDir(profile.repo);

/** Why dir can't hold Scan Reports for the clone at repoPath, or undefined if it can. Reports never go inside the scanned repo. */
export function reportsDirProblem(dir: string, repoPath: string): string | undefined {
  if (isInside(dir, repoPath)) return "must be outside the repo being scanned";
  if (existsSync(dir) && !statSync(dir).isDirectory()) return "exists and is not a folder";
  return undefined;
}

export function defaultProfile(repo: string, projectKey: string): RepoProfile {
  return RepoProfile.parse({
    repo,
    jira: { projectKey, epicName: `${repo}-tech-debts` },
  });
}

/** The saved Repo Profile. With DEBTDOCTOR_JIRA_PROJECT set, its project wins and a repo with no profile gets the defaults. */
export async function loadProfile(repo: string): Promise<RepoProfile | undefined> {
  const path = profilePath(repo);
  const shared = sharedJiraProject();
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return shared ? defaultProfile(repo, shared) : undefined;
    throw err;
  }
  const result = RepoProfile.safeParse(parse(text));
  if (!result.success) throw new Error(`Invalid Repo Profile ${path}: ${result.error.message}`);
  return shared ? { ...result.data, jira: { ...result.data.jira, projectKey: shared } } : result.data;
}

export async function saveProfile(profile: RepoProfile): Promise<string> {
  const path = profilePath(profile.repo);
  await mkdir(dirname(path), { recursive: true });
  // owner-only: the profile names the Jira project and bot instance
  await writeFile(path, stringify(RepoProfile.parse(profile)), { mode: 0o600 });
  await chmod(path, 0o600); // writeFile's mode only applies when the file is created
  return path;
}

/** The Repo Profile name for a clone: its directory name. scan, setup and doctor all use this. */
export const repoName = (repoPath: string) => basename(resolve(repoPath));
