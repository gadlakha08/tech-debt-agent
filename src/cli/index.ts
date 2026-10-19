#!/usr/bin/env node
import { Command } from "commander";
import { registerDoctor } from "./commands/doctor.js";
import { registerScan } from "./commands/scan.js";
import { registerSetup } from "./commands/setup.js";

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
