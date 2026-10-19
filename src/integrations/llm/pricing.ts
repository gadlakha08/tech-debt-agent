/** USD per 1M tokens. */
export interface ModelPrice {
  input: number;
  output: number;
}

/**
 * List prices per CircuIT deployment (CIRCUIT_LLM_DEPLOYMENT), maintained by us, not by users.
 * Adding a model: add its deployment name here; a Scan on an unlisted model reports cost as unknown.
 */
export const MODEL_PRICES: Record<string, ModelPrice> = {
  "gpt-5-nano": { input: 0.05, output: 0.4 },
};

/** The deployment every chat call goes to. */
export const circuitModel = (): string | undefined => process.env.CIRCUIT_LLM_DEPLOYMENT || undefined;

export const modelPrice = (model: string | undefined): ModelPrice | undefined => (model ? MODEL_PRICES[model] : undefined);

export function costUsd(tokens: { promptTokens: number; completionTokens: number }, price: ModelPrice): number {
  return (tokens.promptTokens * price.input + tokens.completionTokens * price.output) / 1_000_000;
}
