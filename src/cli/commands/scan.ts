import type { Command } from "commander";
import { runScan } from "../../pipeline/run-scan.js";

export function registerScan(program: Command): void {
  program
    .command("scan")
    .description("Scan one repo, rank its debt, and ticket the Cut")
    .argument("<repoPath>", "local clone of the repo")
    .option("--dry-run", "no Jira calls; write the Scan Report only", false)
    .option("--uncap", "ticket every High and Medium, no cap of 15", false)
    .option("--max <n>", "cap the Cut at n", (v) => Number.parseInt(v, 10))
    .option("--include-defects", "list Defects in the Scan Report", false)
    .action(async (repoPath: string, o: { dryRun: boolean; uncap: boolean; max?: number; includeDefects: boolean }) => {
      await runScan({ repoPath, ...o });
    });
}
