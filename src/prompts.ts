import { readFileSync } from "node:fs";
import { join } from "node:path";
import { packageRoot } from "./paths.js";

const cache = new Map<string, string>();

/** prompts/<file> without its leading <!-- --> note, read once. */
export function promptText(file: string): string {
  let text = cache.get(file);
  if (text === undefined) {
    text = readFileSync(join(packageRoot(), "prompts", file), "utf8").replace(/^<!--[\s\S]*?-->\s*\n/, "").trimEnd();
    cache.set(file, text);
  }
  return text;
}

/** prompts/<file> with every {{name}} replaced; a placeholder with no value is an error, not a silent blank. */
export function renderPrompt(file: string, vars: Record<string, string | number>): string {
  return promptText(file).replace(/\{\{(\w+)\}\}/g, (_, name: string) => {
    const value = vars[name];
    if (value === undefined) throw new Error(`prompts/${file}: no value for {{${name}}}`);
    return String(value);
  });
}

/** The "## " headings of a skeleton: the sections the model must keep. */
export const requiredHeadings = (file: string) => [...promptText(file).matchAll(/^## (.+)$/gm)].map((m) => m[1]!.trim());

/** skills/<name>/SKILL.md without its frontmatter: the system prompt for an agent that runs that skill. */
export function skillText(name: string): string {
  return readFileSync(join(packageRoot(), "skills", name, "SKILL.md"), "utf8").replace(/^---\n[\s\S]*?\n---\n/, "").trim();
}
