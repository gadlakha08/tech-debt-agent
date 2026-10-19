import { readFile, readdir } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import type { DebtCategory, EvidenceBundle, Stack } from "../../domain/schemas.js";

const IGNORED_DIRS = new Set([
  ".git", ".idea", ".next", ".nuxt", ".turbo", ".venv", "build", "coverage", "dist",
  "generated", "node_modules", "out", "target", "vendor",
]);

export async function listSourceFiles(root: string, extensions: string[]): Promise<string[]> {
  const absoluteRoot = resolve(root);
  const found: string[] = [];
  async function visit(directory: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) await visit(resolve(directory, entry.name));
      } else if (entry.isFile() && extensions.some((ext) => entry.name.toLowerCase().endsWith(ext))) {
        found.push(relative(absoluteRoot, resolve(directory, entry.name)).split(sep).join("/"));
      }
    }
  }
  await visit(absoluteRoot);
  return found;
}

export async function readSource(root: string, path: string): Promise<string> {
  return readFile(resolve(root, path), "utf8");
}

export function makeEvidence(input: {
  category: DebtCategory;
  rule: string;
  symbolPath: string;
  files: string[];
  metrics?: EvidenceBundle["metrics"];
  snippet: string;
  stack: Stack;
}): EvidenceBundle {
  return {
    category: input.category,
    rule: input.rule,
    symbolPath: input.symbolPath,
    files: [...new Set(input.files)].sort(),
    metrics: input.metrics ?? {},
    snippet: firstLines(input.snippet, 150),
    stack: input.stack,
  };
}

export function firstLines(text: string, maxLines = 150): string {
  return text.split(/\r?\n/).slice(0, maxLines).join("\n");
}

export function countLoc(text: string): number {
  return text.split(/\r?\n/).filter((line) => line.trim().length > 0).length;
}

export function isTestPath(path: string): boolean {
  return /(^|\/)(test|tests|__tests__)(\/|$)|\.(spec|test)\.[^.]+$/i.test(path);
}
