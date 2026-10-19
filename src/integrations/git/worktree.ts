import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { execa } from "execa";

export interface Checkout {
  worktree: string;
  sha: string;
  defaultBranch: string;
}

/** Temp worktree of origin/main or origin/master; never touches the user's working copy. */
export async function checkout(repoPath: string): Promise<Checkout> {
  const rootResult = await execa("git", ["rev-parse", "--show-toplevel"], { cwd: repoPath });
  const repoRoot = rootResult.stdout.trim();
  const defaultRef = await execa("git", ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"], { cwd: repoRoot, reject: false });
  let defaultBranch = defaultRef.exitCode === 0 ? defaultRef.stdout.trim().replace(/^origin\//, "") : "";

  if (!defaultBranch) {
    const remoteBranches = await execa("git", ["for-each-ref", "--format=%(refname:short)", "refs/remotes/origin"], { cwd: repoRoot });
    const branches = new Set(remoteBranches.stdout.split(/\r?\n/).map((line) => line.trim()));
    defaultBranch = branches.has("origin/main") ? "main" : branches.has("origin/master") ? "master" : "";
  }
  if (!defaultBranch) throw new Error("Could not determine origin/main or origin/master. Set origin/HEAD or fetch the default branch first.");

  const remoteRef = `origin/${defaultBranch}`;
  const exists = await execa("git", ["show-ref", "--verify", "--quiet", `refs/remotes/${remoteRef}`], { cwd: repoRoot, reject: false });
  if (exists.exitCode !== 0) throw new Error(`Remote branch ${remoteRef} is unavailable. Fetch the repository before scanning.`);

  const worktree = await mkdtemp(join(tmpdir(), "techdebt-scan-"));
  try {
    await rm(worktree, { recursive: true, force: true });
    await execa("git", ["worktree", "add", "--detach", worktree, remoteRef], { cwd: repoRoot });
    const shaResult = await execa("git", ["rev-parse", "HEAD"], { cwd: worktree });
    return { worktree, sha: shaResult.stdout.trim(), defaultBranch };
  } catch (error) {
    await rm(worktree, { recursive: true, force: true });
    throw error;
  }
}

export async function removeWorktree(repoPath: string, worktree: string): Promise<void> {
  const repoRoot = (await execa("git", ["rev-parse", "--show-toplevel"], { cwd: repoPath })).stdout.trim();
  const resolvedWorktree = resolve(worktree);
  if (dirname(resolvedWorktree) !== resolve(tmpdir()) || !basename(resolvedWorktree).startsWith("techdebt-scan-")) {
    throw new Error("Refusing to remove a worktree outside the tech-debt temporary directory.");
  }
  await execa("git", ["worktree", "remove", "--force", worktree], { cwd: repoRoot, reject: false });
  await rm(worktree, { recursive: true, force: true });
  await execa("git", ["worktree", "prune"], { cwd: repoRoot });
}
