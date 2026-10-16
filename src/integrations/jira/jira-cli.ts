/** Subcommands the pipeline may run; anything else is refused. */
export const ALLOWED_SUBCOMMANDS = ["search", "create", "update", "comment", "epics link", "whoami"] as const;

/** Runs `jira-cli --instance techdebt-bot --format json <args>` after checking the allow-list. */
export async function runJiraCli(_args: string[], _instance = "techdebt-bot"): Promise<unknown> {
  throw new Error("not implemented: runJiraCli (Person B, D1-1)");
}
