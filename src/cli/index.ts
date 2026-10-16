#!/usr/bin/env node
import { Command } from "commander";
import { registerDoctor } from "./commands/doctor.js";
import { registerScan } from "./commands/scan.js";
import { registerSetup } from "./commands/setup.js";

const program = new Command().name("techdebt").description("Find, rank and ticket tech debt in one repo").version("0.1.0");

registerScan(program);
registerSetup(program);
registerDoctor(program);

await program.parseAsync();
