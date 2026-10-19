import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { run, runOrThrow } from "../../shell.js";

export interface Checkout {
  worktree: string;
  sha: string;
  defaultBranch: string;
}

// BatchMode stops ssh asking for a key passphrase mid-Scan; without a loaded key the fetch fails and the local ref is used
const NO_PROMPT = { GIT_TERMINAL_PROMPT: "0", GIT_SSH_COMMAND: process.env.GIT_SSH_COMMAND ?? "ssh -o BatchMode=yes" };
const PREFIX = "debtdoctor-wt-";

async function hasRef(repoPath: string, ref: string): Promise<boolean> {
  return (await run("git", ["-C", repoPath, "rev-parse", "--verify", "--quiet", ref])).exitCode === 0;
}

/** origin/HEAD if set, else main, else master. */
export async function defaultBranch(repoPath: string): Promise<string> {
  const head = await run("git", ["-C", repoPath, "symbolic-ref", "--short", "refs/remotes/origin/HEAD"]);
  if (head.exitCode === 0 && head.stdout.startsWith("origin/")) return head.stdout.slice("origin/".length);
  for (const b of ["main", "master"]) if (await hasRef(repoPath, `refs/remotes/origin/${b}`)) return b;
  throw new Error(`${repoPath}: no origin/HEAD, origin/main or origin/master`);
}

/**
 * Temp worktree of origin/main or origin/master; never touches the user's working copy.
 * Fetches first (best effort, never prompts); if the fetch fails the local origin/<branch> ref is used.
 */
export async function checkout(repoPath: string): Promise<Checkout & { fetched: boolean }> {
  const branch = await defaultBranch(repoPath);
  const fetch = await run("git", ["-C", repoPath, "fetch", "--quiet", "origin", branch], { env: NO_PROMPT, timeoutMs: 120_000 });
  const worktree = await mkdtemp(join(tmpdir(), PREFIX));
  try {
    await runOrThrow("git", ["-C", repoPath, "worktree", "add", "--quiet", "--detach", worktree, `origin/${branch}`]);
  } catch (err) {
    await rm(worktree, { recursive: true, force: true });
    throw err;
  }
  const sha = await runOrThrow("git", ["-C", worktree, "rev-parse", "HEAD"]);
  return { worktree, sha, defaultBranch: branch, fetched: fetch.exitCode === 0 };
}

/** Removes a worktree made by checkout(); refuses any other path so a bad argument can never delete real work. */
export async function removeWorktree(repoPath: string, worktree: string): Promise<void> {
  const path = resolve(worktree);
  if (dirname(path) !== resolve(tmpdir()) || !basename(path).startsWith(PREFIX))
    throw new Error(`Refusing to remove ${worktree}: not a tech-debt temp worktree`);
  await run("git", ["-C", repoPath, "worktree", "remove", "--force", path]);
  await rm(path, { recursive: true, force: true });
  await run("git", ["-C", repoPath, "worktree", "prune"]);
}
