import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { withTempDir } from "../paths.js";
import { run } from "../shell.js";

const SCAN_PY = join(homedir(), ".agents/skills/acquire-codebase-knowledge/scripts/scan.py");
const SUMMARY_MAX_CHARS = 12_000;

/** Knowledge Snapshot input: acquire-codebase-knowledge's scan.py run inside the worktree, truncated for the prompt. */
export async function stackSummary(worktree: string, scanPy = SCAN_PY): Promise<string> {
  if (!existsSync(scanPy)) return `(scan.py not found at ${scanPy}; no stack summary)`;
  return withTempDir("scan", async (tmp) => {
    const out = join(tmp, "scan.txt");
    const res = await run("python3", [scanPy, "--output", out], { cwd: worktree, timeoutMs: 120_000 });
    if (res.exitCode !== 0) return `(scan.py failed: ${res.stderr.split("\n").slice(-3).join(" ").slice(0, 300)})`;
    const text = await readFile(out, "utf8");
    return text.length > SUMMARY_MAX_CHARS ? `${text.slice(0, SUMMARY_MAX_CHARS)}\n… (truncated)` : text;
  });
}
