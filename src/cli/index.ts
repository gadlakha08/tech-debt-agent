#!/usr/bin/env node
import { existsSync } from "node:fs";
import { join } from "node:path";
import { Command } from "commander";
import { registerDoctor } from "./commands/doctor.js";
import { registerScan } from "./commands/scan.js";
import { registerSetup } from "./commands/setup.js";
import { packageRoot } from "../paths.js";

// Settings come from the repo's .env; a variable already set in the shell wins.
const envFile = join(packageRoot(), ".env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

const program = new Command().name("dd").description("Find, rank and ticket tech debt in one repo").version("0.1.0");

registerScan(program);
registerSetup(program);
registerDoctor(program);

try {
  await program.parseAsync();
} catch (err) {
  console.error(`✖ ${err instanceof Error ? err.message : String(err)}`);
  if (process.env.DEBTDOCTOR_DEBUG && err instanceof Error) console.error(err.stack);
  process.exitCode = 1;
}
