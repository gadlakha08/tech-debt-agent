import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { runAnalyzers, detectStack } from "../analyzers/index.js";
import type { EvidenceBundle } from "../domain/schemas.js";
import { churn } from "../integrations/git/churn.js";
import { checkout, removeWorktree } from "../integrations/git/worktree.js";

export interface EvidenceScanResult {
  repo: string;
  defaultBranch: string;
  sha: string;
  stack: "ts" | "java";
  evidence: EvidenceBundle[];
  churn: Record<string, number>;
  outputPath: string;
}

/** Run the deterministic baseline analyzers on a clean temporary checkout and save evidence outside the repo. */
export async function scanEvidence(repoPath: string): Promise<EvidenceScanResult> {
  const checkedOut = await checkout(repoPath);
  try {
    const stack = await detectStack(checkedOut.worktree);
    const [evidence, fileChurn] = await Promise.all([
      runAnalyzers({ worktree: checkedOut.worktree, stack }),
      churn({ worktree: checkedOut.worktree }),
    ]);
    const repo = basename(repoPath.replace(/\/+$/, "")) || "repository";
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const outputDir = join(homedir(), ".techdebt", "evidence", safeSegment(repo), timestamp);
    await mkdir(outputDir, { recursive: true });
    const outputPath = join(outputDir, "evidence.json");
    await writeFile(outputPath, `${JSON.stringify({
      repo,
      defaultBranch: checkedOut.defaultBranch,
      sha: checkedOut.sha,
      stack,
      generatedAt: new Date().toISOString(),
      evidence,
      churn: fileChurn,
    }, null, 2)}\n`, "utf8");
    return { repo, defaultBranch: checkedOut.defaultBranch, sha: checkedOut.sha, stack, evidence, churn: fileChurn, outputPath };
  } finally {
    await removeWorktree(repoPath, checkedOut.worktree);
  }
}

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100) || "repository";
}
