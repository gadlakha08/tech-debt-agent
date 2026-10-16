import type { Command } from "commander";

export function registerSetup(program: Command): void {
  program
    .command("setup")
    .description("Create the Repo Profile interactively and run preflight")
    .argument("<repo>", "repo name")
    .action(async () => {
      throw new Error("not implemented: setup (Part 2, D2-1)");
    });
}
