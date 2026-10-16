export interface Checkout {
  worktree: string;
  sha: string;
  defaultBranch: string;
}

/** Temp worktree of origin/main or origin/master; never touches the user's working copy. */
export async function checkout(_repoPath: string): Promise<Checkout> {
  throw new Error("not implemented: checkout (Person B, D1-1)");
}

export async function removeWorktree(_repoPath: string, _worktree: string): Promise<void> {
  throw new Error("not implemented: removeWorktree (Person B, D1-1)");
}
