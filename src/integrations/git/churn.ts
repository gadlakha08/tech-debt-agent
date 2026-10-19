import type { ScanContext } from "../../domain/schemas.js";
import { runOrThrow } from "../../shell.js";

/** `git log --since=<days>.days --name-only --pretty=format:` → commits per file (paths relative to the repo root). */
export async function churn(ctx: Pick<ScanContext, "worktree">, sinceDays: number): Promise<Record<string, number>> {
  const out = await runOrThrow("git", ["-C", ctx.worktree, "log", `--since=${sinceDays}.days`, "--name-only", "--pretty=format:", "--no-renames"]);
  const counts: Record<string, number> = {};
  for (const line of out.split("\n")) {
    const file = line.trim();
    if (file) counts[file] = (counts[file] ?? 0) + 1;
  }
  return counts;
}
