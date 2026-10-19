import { execa } from "execa";

export interface ChurnContext {
  worktree: string;
}

/** `git log --since=180.days --name-only --pretty=format:` → commits per file. */
export async function churn(ctx: ChurnContext): Promise<Record<string, number>> {
  const since = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();
  const result = await execa("git", ["log", `--since=${since}`, "--name-only", "--pretty=format:"], { cwd: ctx.worktree });
  const counts: Record<string, number> = {};
  for (const raw of result.stdout.split(/\r?\n/)) {
    const file = raw.trim().replace(/\\/g, "/");
    if (!file) continue;
    counts[file] = (counts[file] ?? 0) + 1;
  }
  return counts;
}
