import type { z } from "zod";
import type { UsageMeter } from "./usage.js";

export interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
  run(args: unknown): Promise<string>;
}

export interface RunAgentOptions<T extends z.ZodType> {
  stage: string;
  system: string;
  user: string;
  tools?: AgentTool[];
  outputSchema: T;
  maxSteps?: number; // default 8
  usage: UsageMeter;
}

/** Tool-calling loop on CircuIT chat completions. Zod-validates the final output, retrying once with the error. */
export async function runAgent<T extends z.ZodType>(_opts: RunAgentOptions<T>): Promise<z.infer<T>> {
  throw new Error("not implemented: runAgent (Part 1, D1-1)");
}
