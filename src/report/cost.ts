import type { RepoProfile } from "../domain/schemas.js";

export function costUsd(
  tokens: { promptTokens: number; completionTokens: number },
  price: RepoProfile["pricePer1MTokens"],
): number {
  return (tokens.promptTokens * price.input + tokens.completionTokens * price.output) / 1_000_000;
}
