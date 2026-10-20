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
  /** Gemini's thought_signature rides here; it must be sent back unchanged with the call or the next turn is refused. */
  extra_content?: unknown;
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

/** Chat settings every LLM call needs; preflight checks them before the Scan starts. */
export const CIRCUIT_CHAT_ENV = ["CIRCUIT_LLM_CHAT_URL", "CIRCUIT_LLM_DEPLOYMENT", "CIRCUIT_LLM_APP_KEY"] as const;

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

  let response: Response;
  for (let attempt = 1; ; attempt++) {
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          "api-key": token,
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      // network drop (VPN, DNS, reset): same backoff as a 5xx
      if (attempt >= MAX_ATTEMPTS) throw new Error(`CircuIT unreachable at stage "${req.stage}" after ${attempt} attempts: ${(err as Error).message}`);
      await sleep(Math.min(60_000, 1000 * 2 ** attempt + Math.random() * 1000));
      continue;
    }
    if (!RETRYABLE.has(response.status) || attempt >= MAX_ATTEMPTS) break;
    await sleep(retryDelayMs(response, await response.text().catch(() => ""), attempt));
  }
  if (!response.ok) {
    // only error.message: the gateway echoes the request's `user` field (the appkey) in its error body
    const text = await response.text().catch(() => "");
    let detail: string;
    try {
      detail = String((JSON.parse(text) as { error?: { message?: unknown } }).error?.message ?? "");
    } catch {
      detail = text.includes("appkey") ? "" : text.replace(/\s+/g, " ");
    }
    detail = detail.slice(0, 500);
    throw new Error(`CircuIT chat request failed (${response.status}) at stage "${req.stage}": ${detail || "no response body"}`);
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

const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 6;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Retry-After (s), retry-after-ms, or the gateway's "retry after N milliseconds"; else exponential backoff. Jittered, capped at 60 s. */
function retryDelayMs(response: Response, text: string, attempt: number): number {
  const header = Number(response.headers.get("retry-after-ms") ?? Number(response.headers.get("retry-after")) * 1000);
  const fromText = Number(/retry after ([\d.]+) milliseconds/i.exec(text)?.[1]);
  const base = Number.isFinite(header) && header > 0 ? header : Number.isFinite(fromText) && fromText > 0 ? fromText : 1000 * 2 ** attempt;
  return Math.min(60_000, base + Math.random() * 1000);
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
    return [{ id: call.id, type: "function", function: { name: fnRecord.name, arguments: args }, ...(call.extra_content !== undefined ? { extra_content: call.extra_content } : {}) }];
  });
}

function nonNegativeInteger(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}
