// Runs the analyzers on a real repo (in a temp worktree of its default branch) and writes the bundles
// to fixtures/local/<repo>.json. fixtures/local/ is gitignored: real evidence contains company source code.
//   npx tsx scripts/dump-evidence.ts <repoPath>
import { mkdir, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { runAnalyzers } from "../src/analyzers/index.js";
import { describeRepo, detectRepo } from "../src/profile/stack.js";
import { checkout, removeWorktree } from "../src/integrations/git/worktree.js";
import { packageRoot } from "../src/paths.js";

const repoPath = resolve(process.argv[2] ?? "");
if (!process.argv[2]) {
  console.error("usage: tsx scripts/dump-evidence.ts <repoPath>");
  process.exit(2);
}

const co = await checkout(repoPath);
try {
  const repo = detectRepo(co.worktree);
  const { stack } = repo;
  console.error(`${basename(repoPath)}: ${describeRepo(repo)}, ${co.defaultBranch}@${co.sha.slice(0, 10)}${co.fetched ? "" : " (fetch failed, using local origin ref)"}`);
  const started = Date.now();
  const { bundles } = await runAnalyzers({ worktree: co.worktree, ...repo }, { onWarning: (w) => console.error(`! ${w}`) });
  const dir = join(packageRoot(), "fixtures/local");
  await mkdir(dir, { recursive: true });
  const out = join(dir, `${basename(repoPath)}.json`);
  await writeFile(out, `${JSON.stringify(bundles, null, 2)}\n`);
  const counts = new Map<string, number>();
  for (const b of bundles) counts.set(`${b.category}/${b.rule}`, (counts.get(`${b.category}/${b.rule}`) ?? 0) + 1);
  const byRule = [...counts].map(([k, n]) => `${k}: ${n}`);
  console.error(`${bundles.length} bundles in ${((Date.now() - started) / 1000).toFixed(0)}s → ${out}\n  ${byRule.sort().join("\n  ")}`);
} finally {
  await removeWorktree(repoPath, co.worktree);
}
