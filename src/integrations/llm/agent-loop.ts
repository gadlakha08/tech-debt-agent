import { z } from "zod";
import { chat, type ChatMessage, type ToolSpec } from "./circuit-client.js";
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
export async function runAgent<T extends z.ZodType>(opts: RunAgentOptions<T>): Promise<z.infer<T>> {
  const maxSteps = opts.maxSteps ?? 8;
  const resultName = "submit_result";
  if (opts.tools?.some((tool) => tool.name === resultName)) throw new Error(`Tool name "${resultName}" is reserved.`);

  const { parameters, wrapped } = resultParameters(opts.outputSchema);
  const resultTool: ToolSpec = {
    type: "function",
    function: { name: resultName, description: "Return the final result in the required schema.", parameters },
  };
  const tools: ToolSpec[] = [
    ...(opts.tools ?? []).map((tool) => ({
      type: "function" as const,
      function: { name: tool.name, description: tool.description, parameters: tool.parameters },
    })),
    resultTool,
  ];
  const messages: ChatMessage[] = [
    { role: "system", content: opts.system },
    { role: "user", content: opts.user },
  ];
  let validationRetries = 0;
  let lastValidationError = "";

  for (let step = 0; step < maxSteps; step += 1) {
    const response = await chat({ stage: opts.stage, messages, tools, toolChoice: "auto" }, opts.usage);
    const calls = response.message.tool_calls ?? [];

    if (calls.length) {
      messages.push(response.message);
      for (const call of calls) {
        if (call.function.name === resultName) {
          const parsed = parseResult(call.function.arguments, opts.outputSchema, wrapped);
          if (parsed.success) return parsed.data;
          lastValidationError = parsed.error;
          if (validationRetries >= 1) throw new Error(`${opts.stage}: agent returned invalid output after one retry: ${lastValidationError}`);
          validationRetries += 1;
          messages.push({ role: "tool", tool_call_id: call.id, content: `Schema validation failed: ${lastValidationError}. Call ${resultName} again with a corrected object.` });
          continue;
        }

        const tool = opts.tools?.find((candidate) => candidate.name === call.function.name);
        if (!tool) {
          messages.push({ role: "tool", tool_call_id: call.id, content: `Unknown tool: ${call.function.name}` });
          continue;
        }

        let result: string;
        try {
          result = await tool.run(parseArguments(call.function.arguments));
        } catch (error) {
          result = `Tool failed: ${error instanceof Error ? error.message : String(error)}`;
        }
        messages.push({ role: "tool", tool_call_id: call.id, content: result });
      }
      continue;
    }

    if (response.message.content !== null) {
      const parsed = parseResult(response.message.content, opts.outputSchema);
      if (parsed.success) return parsed.data;
      lastValidationError = parsed.error;
      if (validationRetries >= 1) throw new Error(`${opts.stage}: agent returned invalid output after one retry: ${lastValidationError}`);
      validationRetries += 1;
      messages.push(response.message, {
        role: "user",
        content: `Your previous response failed schema validation: ${lastValidationError}. Return a corrected result using the ${resultName} tool.`,
      });
      continue;
    }

    messages.push(response.message, { role: "user", content: `No result was returned. Call the ${resultName} tool with your final answer.` });
  }

  throw new Error(`${opts.stage}: agent exceeded its ${maxSteps}-step limit${lastValidationError ? `; last schema error: ${lastValidationError}` : ""}.`);
}

/**
 * Function parameters must be a top-level object schema, so a union (e.g. Classification) is sent as { result: <schema> }.
 * $defs stay at the top so their #/$defs refs still resolve.
 */
function resultParameters(schema: z.ZodType): { parameters: Record<string, unknown>; wrapped: boolean } {
  const { $schema: _, $defs, ...json } = constToEnum(z.toJSONSchema(schema)) as Record<string, unknown>;
  if (json.type === "object") return { parameters: { ...json, ...($defs ? { $defs } : {}) }, wrapped: false };
  return {
    parameters: { type: "object", properties: { result: json }, required: ["result"], additionalProperties: false, ...($defs ? { $defs } : {}) },
    wrapped: true,
  };
}

/** Gemini ignores JSON Schema `const` (z.literal); a one-value `enum` means the same and every model honours it. */
function constToEnum(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(constToEnum);
  if (!node || typeof node !== "object") return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === "const") out.enum = [value];
    else out[key] = constToEnum(value);
  }
  return out;
}

function parseArguments(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new Error("Tool arguments were not valid JSON.");
  }
}

function parseResult<T extends z.ZodType>(value: string, schema: T, wrapped = false): { success: true; data: z.infer<T> } | { success: false; error: string } {
  try {
    const parsed = JSON.parse(stripCodeFence(value)) as unknown;
    const raw = wrapped && parsed && typeof parsed === "object" && "result" in parsed ? (parsed as { result: unknown }).result : parsed;
    const result = schema.safeParse(raw);
    return result.success ? { success: true, data: result.data } : { success: false, error: result.error.message };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function stripCodeFence(value: string): string {
  const match = value.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match?.[1] ?? value;
}
