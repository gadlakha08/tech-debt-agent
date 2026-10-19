import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

export type PreflightChoice = "recheck" | "fallback" | "quit";

/** `[r]` re-check / `[i]` use the fallback / `[q]` quit. Blocking gaps offer only r and q. */
export async function askChoice(blocking: boolean): Promise<PreflightChoice> {
  if (!stdin.isTTY || !stdout.isTTY) return "quit";
  const prompt = createInterface({ input: stdin, output: stdout });
  try {
    const options = blocking ? "[r] re-check / [q] quit" : "[r] re-check / [i] use fallback / [q] quit";
    while (true) {
      const answer = (await prompt.question(`Preflight has unresolved checks (${options}): `)).trim().toLowerCase();
      if (answer === "r") return "recheck";
      if (!blocking && answer === "i") return "fallback";
      if (answer === "q" || answer === "") return "quit";
    }
  } finally {
    prompt.close();
  }
}
