import clipboard from "clipboardy";
import type { Fallbacks, RepoKind, RepoProfile } from "../domain/schemas.js";
import type { JiraPermissions } from "../integrations/jira/index.js";
import { issueTypes, myPermissions } from "../integrations/jira/jira-rest.js";
import { adminRequest } from "./admin-request.js";
import { type CheckResult, environmentChecks, evaluatePermissions } from "./checks.js";
import { askChoice, type PreflightChoice } from "./prompt.js";
import { describeRepo } from "../profile/stack.js";

export interface PreflightResult {
  ok: boolean;
  fallbacks: Fallbacks;
  report: CheckResult[];
}

export interface PreflightOptions {
  interactive: true; // headless mode is post-hackathon
  /** Detected before preflight: only this repo's analyzer tools are checked. */
  repo: RepoKind;
  repoPath?: string;
  dryRun?: boolean; // no Jira calls: skip whoami and the permission check
}

export interface PreflightDeps {
  environment: () => Promise<CheckResult[]>;
  permissions: (projectKey: string) => Promise<JiraPermissions>;
  /** The project's issue type names; omitted, the issue type check is skipped. */
  issueTypes?: (projectKey: string) => Promise<string[]>;
  ask: (blocking: boolean) => Promise<PreflightChoice>;
  copy: (text: string) => Promise<void>;
  print: (line: string) => void;
}

export const defaultDeps = (profile: RepoProfile, opts: PreflightOptions): PreflightDeps => ({
  environment: () => environmentChecks(opts),
  permissions: myPermissions,
  issueTypes,
  ask: askChoice,
  copy: (t) => clipboard.write(t),
  print: (l) => console.log(l),
});

const NONE: Fallbacks = { noAttach: false, noEpicLink: false, noComments: false };

/** Runs before any nano call. Interactive only for the hackathon; headless mode is post-hackathon. */
export async function preflight(profile: RepoProfile, opts: PreflightOptions, deps: PreflightDeps = defaultDeps(profile, opts)): Promise<PreflightResult> {
  const { projectKey } = profile.jira;
  deps.print(`Repo: ${describeRepo(opts.repo)}`);
  for (;;) {
    const report = await deps.environment();
    let fallbacks = NONE;
    let missing: (keyof JiraPermissions)[] = [];
    if (opts.dryRun) report.push({ name: `Jira permissions (${projectKey})`, ok: true, blocking: false, detail: "skipped (--dry-run)" });
    else
      try {
        const evaluated = evaluatePermissions(await deps.permissions(projectKey));
        ({ fallbacks, missing } = evaluated);
        report.push({
          name: `Jira permissions (${projectKey})`,
          ok: missing.length === 0,
          blocking: evaluated.blocked,
          detail: missing.length ? `missing ${missing.join(", ")}` : "ok",
        });
      } catch (err) {
        report.push({ name: `Jira permissions (${projectKey})`, ok: false, blocking: true, detail: (err as Error).message });
      }
    if (!opts.dryRun && deps.issueTypes) {
      // the ticketer may only create these types, so a name the project lacks fails every ticket
      const wanted = [profile.jira.issueType, "Epic"];
      const name = `Jira issue types (${wanted.join(", ")})`;
      try {
        const types = await deps.issueTypes(projectKey);
        const absent = wanted.filter((t) => !types.includes(t));
        report.push({ name, ok: absent.length === 0, blocking: true, detail: absent.length ? `${projectKey} has no ${absent.join(", ")}; it offers ${types.join(", ")}. Fix issueType with dd setup` : "ok" });
      } catch (err) {
        report.push({ name, ok: false, blocking: true, detail: (err as Error).message });
      }
    }

    for (const r of report) deps.print(`${r.ok ? "✔" : r.blocking ? "✖" : "!"} ${r.name}: ${r.detail}`);
    if (missing.length) {
      const msg = adminRequest(projectKey, missing);
      deps.print(`\nAsk a Jira admin:\n  ${msg}`);
      try {
        await deps.copy(msg);
        deps.print("(copied to clipboard; nothing was sent)");
      } catch {
        deps.print("(could not copy to clipboard; nothing was sent)");
      }
    }

    const blocking = report.some((r) => !r.ok && r.blocking);
    if (!blocking && missing.length === 0) return { ok: true, fallbacks, report };
    if (!blocking) {
      const using = (Object.keys(fallbacks) as (keyof Fallbacks)[]).filter((k) => fallbacks[k]);
      deps.print(`Fallbacks available: ${using.join(", ")}`);
    }

    let choice = await deps.ask(blocking);
    while (choice === "fallback" && blocking) {
      deps.print("A blocking check failed; there is no fallback for it.");
      choice = await deps.ask(blocking);
    }
    if (choice === "quit") return { ok: false, fallbacks, report };
    if (choice === "fallback") return { ok: true, fallbacks, report };
  }
}
