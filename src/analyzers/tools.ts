import { existsSync } from "node:fs";
import { join } from "node:path";
import { packageRoot } from "../paths.js";
import { commandExists } from "../shell.js";

export type ToolName = "jscpd" | "pmd" | "mvn" | "npm";

export interface Tool {
  /** The command to run: a name on PATH, or an absolute path (bundled tools, DEBTDOCTOR_* overrides). */
  command: () => string;
  install: string;
}

/** External programs analyzers run. Analyzers that need none (ESLint, madge, the greps) are libraries or plain file reads. */
export const TOOLS: Record<ToolName, Tool> = {
  jscpd: { command: () => join(packageRoot(), "node_modules/.bin/jscpd"), install: "run npm install in the DebtDoctor folder" },
  pmd: { command: () => process.env.DEBTDOCTOR_PMD ?? "pmd", install: "brew install pmd, or set DEBTDOCTOR_PMD to its path" },
  mvn: { command: () => process.env.DEBTDOCTOR_MVN ?? "mvn", install: "brew install maven, or set DEBTDOCTOR_MVN to its path" },
  npm: { command: () => process.env.DEBTDOCTOR_NPM ?? "npm", install: "install Node.js, or set DEBTDOCTOR_NPM to its path" },
};

export async function toolAvailable(name: ToolName): Promise<boolean> {
  const command = TOOLS[name].command();
  return command.includes("/") ? existsSync(command) : commandExists(command);
}
