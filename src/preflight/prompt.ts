export type PreflightChoice = "recheck" | "fallback" | "quit";

/** `[r]` re-check / `[i]` use the fallback / `[q]` quit. Blocking gaps offer only r and q. */
export async function askChoice(_blocking: boolean): Promise<PreflightChoice> {
  throw new Error("not implemented: askChoice (Person B, D1-3)");
}
