import type { UsageMeter } from "./usage.js";

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
export async function chat(_req: ChatRequest, _usage: UsageMeter): Promise<ChatResponse> {
  throw new Error("not implemented: chat (Part 1, D1-1)");
}
