import type { Command } from "commander";

export function registerDoctor(program: Command): void {
  program
    .command("doctor")
    .description("Run preflight on its own: environment and Jira permissions")
    .argument("<repo>", "repo name")
    .action(async () => {
      throw new Error("not implemented: doctor (Person B, D1-3)");
    });
}
