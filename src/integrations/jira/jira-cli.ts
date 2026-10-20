import { existsSync } from "node:fs";
import { join } from "node:path";
import { JIRA_BOT } from "../../domain/schemas.js";
import { packageRoot } from "../../paths.js";
import { commandExists, run } from "../../shell.js";

/** Subcommands the pipeline may run; anything else is refused. */
export const ALLOWED_SUBCOMMANDS = ["search", "create", "update", "comment", "epics link", "whoami"] as const;

const SKILL_SHIM = join(packageRoot(), "skills", "jira-autonomous", "scripts", "jira-cli");

/** DEBTDOCTOR_JIRA_CLI, else `jira-cli` on PATH, else the jira-autonomous skill's own shim. */
export async function jiraCliBinary(): Promise<string | undefined> {
  if (process.env.DEBTDOCTOR_JIRA_CLI) return process.env.DEBTDOCTOR_JIRA_CLI;
  if (await commandExists("jira-cli")) return "jira-cli";
  return existsSync(SKILL_SHIM) ? SKILL_SHIM : undefined;
}

export function assertAllowed(args: string[]): void {
  if (args.some((a) => a === "--instance" || a.startsWith("--instance="))) throw new Error("jira-cli: --instance is fixed by the pipeline");
  const head = args.slice(0, 2).join(" ");
  const ok = ALLOWED_SUBCOMMANDS.some((cmd) => head === cmd || head.startsWith(`${cmd} `) || args[0] === cmd);
  if (!ok) throw new Error(`jira-cli subcommand not allowed: ${args.slice(0, 2).join(" ")}`);
}

/** jira-cli prints JSON on stdout but its nix shim may prefix noise (which can itself contain brackets); take the first start that parses. */
function parseJson(stdout: string): unknown {
  for (const m of stdout.matchAll(/[{[]/g)) {
    try {
      return JSON.parse(stdout.slice(m.index));
    } catch {
      // noise, try the next bracket
    }
  }
  throw new Error(`jira-cli returned no JSON: ${stdout.slice(0, 200)}`);
}

/** Runs `jira-cli --instance techdebt-bot --format json <args>` after checking the allow-list. There is no way to pick another instance. */
export async function runJiraCli(args: string[]): Promise<unknown> {
  assertAllowed(args);
  const bin = await jiraCliBinary();
  if (!bin) throw new Error("jira-cli not found: install it, or set DEBTDOCTOR_JIRA_CLI");
  const res = await run(bin, ["--instance", JIRA_BOT, "--format", "json", ...args], { timeoutMs: 180_000, env: credentialEnv() });
  if (res.exitCode !== 0) throw new Error(`jira-cli ${args[0]} failed (${res.exitCode}): ${res.stderr.trim().slice(-500)}`);
  return parseJson(res.stdout);
}

/**
 * The .env Jira credentials as jira-cli's per-instance env vars, so jira-cli needs no `config` of its own.
 * Without DEBTDOCTOR_JIRA_BASE_URL and DEBTDOCTOR_JIRA_TOKEN, jira-cli falls back to its saved techdebt-bot instance.
 */
function credentialEnv(): Record<string, string> | undefined {
  const { DEBTDOCTOR_JIRA_BASE_URL: url, DEBTDOCTOR_JIRA_TOKEN: token, DEBTDOCTOR_JIRA_EMAIL: email } = process.env;
  if (!url || !token) return undefined;
  const prefix = `JIRA_${JIRA_BOT.toUpperCase()}`;
  const cloud = /\.atlassian\.net$/i.test(new URL(url).hostname);
  return {
    [`${prefix}_URL`]: url,
    [`${prefix}_API_TOKEN`]: token,
    [`${prefix}_CLOUD`]: String(cloud),
    // Cloud and Server basic auth log in as email/username:token; a Server PAT needs no username.
    ...(email ? { [`${prefix}_USERNAME`]: email, ...(cloud ? {} : { [`${prefix}_AUTH`]: "basic" }) } : { [`${prefix}_AUTH`]: "pat" }),
  };
}

/**
 * A command the ticketer agent wrote, as the skill shows it (`scripts/jira-cli --instance techdebt-bot --format toon search ...`),
 * reduced to the subcommand and its flags. The pipeline adds the instance and format itself; any other instance is refused.
 */
export function agentArgs(args: string[]): string[] {
  const rest = [...args];
  if (rest[0] && /(^|\/)jira-cli$/.test(rest[0])) rest.shift();
  for (;;) {
    const flag = rest[0]?.split("=")[0];
    if (flag !== "--instance" && flag !== "--format" && flag !== "--toon-max-items") break;
    const value = rest[0]!.includes("=") ? rest.shift()!.split("=")[1] : (rest.shift(), rest.shift());
    if (flag === "--instance" && value !== JIRA_BOT) throw new Error(`jira-cli: only --instance ${JIRA_BOT} may be used`);
  }
  return rest;
}
