import type { UsageMeter } from "./usage.js";
import { getCircuitToken } from "./circuit-token.js";

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ToolSpec {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface ChatRequest {
  stage: string; // tags usage for the Scan Report
  messages: ChatMessage[];
  tools?: ToolSpec[];
  toolChoice?: "auto" | { type: "function"; function: { name: string } };
  responseFormat?: { type: "json_schema"; json_schema: { name: string; schema: Record<string, unknown>; strict?: boolean } };
}

export interface ChatResponse {
  message: ChatMessage;
  finishReason: string;
}

/**
 * POST {CIRCUIT_LLM_CHAT_URL}/openai/deployments/{CIRCUIT_LLM_DEPLOYMENT}/chat/completions
 * Header `api-key: <token>` (no Bearer). Body `user: JSON.stringify({ appkey })`. Never send `temperature`.
 */
export async function chat(req: ChatRequest, usage: UsageMeter): Promise<ChatResponse> {
  const chatUrl = requiredEnv("CIRCUIT_LLM_CHAT_URL").replace(/\/+$/, "");
  const deployment = encodeURIComponent(requiredEnv("CIRCUIT_LLM_DEPLOYMENT"));
  const appkey = requiredEnv("CIRCUIT_LLM_APP_KEY");
  const token = await getCircuitToken();
  const endpoint = `${chatUrl}/openai/deployments/${deployment}/chat/completions`;
  const body: Record<string, unknown> = {
    messages: req.messages,
    user: JSON.stringify({ appkey }),
  };
  if (req.tools?.length) body.tools = req.tools;
  if (req.toolChoice) body.tool_choice = req.toolChoice;
  if (req.responseFormat) body.response_format = req.responseFormat;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "api-key": token,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`CircuIT chat request failed (${response.status} ${response.statusText}) at stage "${req.stage}".`);
  }

  const payload: unknown = await response.json();
  const choice = getFirstChoice(payload);
  const rawMessage = choice.message;
  if (!rawMessage || typeof rawMessage !== "object") throw new Error("CircuIT chat response did not contain a message.");
  const msg = rawMessage as Record<string, unknown>;
  const content = typeof msg.content === "string" ? msg.content : null;
  const toolCalls = normalizeToolCalls(msg.tool_calls);
  const message: ChatMessage = { role: "assistant", content };
  if (toolCalls.length) message.tool_calls = toolCalls;

  const rawUsage = (payload as { usage?: unknown }).usage;
  if (rawUsage && typeof rawUsage === "object") {
    const u = rawUsage as { prompt_tokens?: unknown; completion_tokens?: unknown };
    usage.add({
      stage: req.stage,
      promptTokens: nonNegativeInteger(u.prompt_tokens),
      completionTokens: nonNegativeInteger(u.completion_tokens),
    });
  }

  return {
    message,
    finishReason: typeof choice.finish_reason === "string" ? choice.finish_reason : "unknown",
  };
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}.`);
  return value;
}

function getFirstChoice(payload: unknown): { message: unknown; finish_reason?: unknown } {
  if (!payload || typeof payload !== "object") throw new Error("CircuIT chat response was not an object.");
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) throw new Error("CircuIT chat response did not contain choices.");
  return choices[0] as { message: unknown; finish_reason?: unknown };
}

function normalizeToolCalls(value: unknown): ToolCall[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): ToolCall[] => {
    if (!entry || typeof entry !== "object") return [];
    const call = entry as Record<string, unknown>;
    const fn = call.function;
    if (!fn || typeof fn !== "object") return [];
    const fnRecord = fn as Record<string, unknown>;
    if (typeof call.id !== "string" || typeof fnRecord.name !== "string") return [];
    const args = typeof fnRecord.arguments === "string" ? fnRecord.arguments : JSON.stringify(fnRecord.arguments ?? {});
    return [{ id: call.id, type: "function", function: { name: fnRecord.name, arguments: args } }];
  });
}

function nonNegativeInteger(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}
