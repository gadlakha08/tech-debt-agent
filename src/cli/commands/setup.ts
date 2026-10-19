import { accessSync, constants, existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import type { Command } from "commander";
import { JIRA_PROJECT_KEY, RepoProfile } from "../../domain/schemas.js";
import { circuitModel, modelPrice } from "../../integrations/llm/pricing.js";
import { expandPath, nearestExisting, tildePath } from "../../paths.js";
import { preflight as runPreflight, type PreflightResult } from "../../preflight/index.js";
import { type Ask, type Choose, type Confirm, ask, choose, confirm } from "../../preflight/prompt.js";
import { defaultProfile, defaultReportsDir, loadProfile, reportsDir, reportsDirProblem, repoName, saveProfile } from "../../profile/index.js";
import { bold, dim, heading, rows } from "../ui.js";
import { type DoctorDeps, preflightRepo } from "./doctor.js";

export interface SetupDeps extends DoctorDeps {
  ask: Ask;
  confirm: Confirm;
  choose: Choose;
}

/** Asks for the Repo Profile (existing values are the defaults), shows a summary, saves it after a yes, then runs preflight. */
export async function setupProfile(repoPath: string, deps: SetupDeps): Promise<PreflightResult> {
  const repo = repoName(repoPath);
  const existing = await loadProfile(repo);
  deps.print(`${bold("DebtDoctor setup")} ${dim(`· ${repo}`)}`);
  deps.print(dim(existing ? "Editing the saved Repo Profile; press Enter to keep a value." : "No Repo Profile yet; press Enter to take a default."));

  deps.print(heading("Jira"));
  const projectKey = (
    await deps.ask("Project key", { default: existing?.jira.projectKey, validate: (v) => JIRA_PROJECT_KEY.test(v.trim().toUpperCase()) || "letters and digits, e.g. PROJ" })
  ).toUpperCase();
  const base = existing ?? defaultProfile(repo, projectKey);
  const epicName = await deps.ask("Epic name", { default: base.jira.epicName });
  const issueType = await deps.ask("Issue type", { default: base.jira.issueType });

  deps.print(heading("Scan Report"));
  const includeDefects = await deps.confirm("List Defects (bugs, security) in the report?", base.includeDefects);
  const reports = await askReportsDir(deps, repo, reportsDir(base), resolve(repoPath));

  const profile = RepoProfile.parse({
    ...base,
    jira: { ...base.jira, projectKey, epicName, issueType },
    includeDefects,
    reportsDir: reports === defaultReportsDir(repo) ? undefined : reports,
  });
  const model = circuitModel();
  const price = modelPrice(model);
  deps.print(heading("Summary"));
  for (const line of rows([
    ["Jira project", projectKey],
    ["Epic", epicName],
    ["Issue type", issueType],
    ["Defects", includeDefects ? "listed in the report" : "counted only"],
    ["Scan Reports", `${tildePath(reports)}${existsSync(reports) ? "" : dim(" (will be created)")}`],
    ["Model", model ? `${model}${price ? dim(` · $${price.input} in / $${price.output} out per 1M tokens`) : dim(" · no price listed")}` : "CIRCUIT_LLM_DEPLOYMENT is not set"],
  ]))
    deps.print(line);
  deps.print("");
  if (!(await deps.confirm("Save this profile?", true))) {
    deps.print("Nothing saved.");
    return { ok: false, fallbacks: { noAttach: false, noEpicLink: false, noComments: false }, report: [] };
  }

  await mkdir(reports, { recursive: true });
  const path = await saveProfile(profile);
  deps.print(`✔ Saved ${tildePath(path)} ${dim("(edit jira.priorities there if your Jira uses other priority names)")}`);

  deps.print(heading("Preflight"));
  const res = await preflightRepo(deps, profile, repoPath);
  deps.print(res.ok ? `\nReady. Next: ${bold(`dd scan ${repoPath} --dry-run`)}` : `\nNot ready yet: fix the ✖ items above, then run ${bold(`dd doctor ${repoPath}`)}`);
  return res;
}

/** DebtDoctor's own folder, the folder already in the profile, or one the user types (relative to ~). Returns an absolute path. */
async function askReportsDir(deps: SetupDeps, repo: string, current: string, repoPath: string): Promise<string> {
  const home = defaultReportsDir(repo);
  for (;;) {
    const where = await deps.choose(
      "Where should Scan Reports go?",
      [
        { name: `DebtDoctor folder  ${dim(tildePath(home))}`, value: "home" },
        ...(current !== home ? [{ name: `Keep current  ${dim(tildePath(current))}`, value: "current" as const }] : []),
        { name: "Another folder…", value: "custom", description: "Type a path; relative paths start from your home folder (~)." },
      ],
      current !== home ? "current" : "home",
    );
    if (where === "home") return home;
    if (where === "current") return current;

    const typed = await deps.ask("Folder (relative to ~)", {
      validate: (v) => {
        if (!v.trim()) return "enter a folder, e.g. reports/debt";
        const dir = expandPath(v);
        const parent = nearestExisting(dir);
        return reportsDirProblem(dir, repoPath) ?? (writable(parent) || `${tildePath(parent)} is not writable`);
      },
      transformer: (v, { isFinal }) => (isFinal ? tildePath(expandPath(v)) : v),
    });
    const dir = expandPath(typed);
    if (existsSync(dir) || (await deps.confirm(`${tildePath(dir)} does not exist yet. Create it when the profile is saved?`, true))) return dir;
  }
}

function writable(dir: string): boolean {
  try {
    accessSync(dir, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

export function registerSetup(program: Command): void {
  program
    .command("setup")
    .description("Create or edit the Repo Profile interactively, then run preflight")
    .argument("<repoPath>", "local clone of the repo")
    .action(async (repoPath: string) => {
      const res = await setupProfile(repoPath, { ask, confirm, choose, preflight: runPreflight, print: (l) => console.log(l) });
      process.exitCode = res.ok ? 0 : 1;
    });
}
