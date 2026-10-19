import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** ~/.debtdoctor, overridable with DEBTDOCTOR_HOME (tests, CI). */
export const debtdoctorHome = () => process.env.DEBTDOCTOR_HOME ?? join(homedir(), ".debtdoctor");

/**
 * A user-typed folder as an absolute path. Relative paths and `~` start from the home directory, never the cwd.
 * Surrounding quotes and stray trailing `,` / `;` (easy to type at a prompt) are dropped.
 */
export function expandPath(typed: string): string {
  const path = typed.trim().replace(/^(["'])(.*)\1$/, "$2").replace(/[,;\s]+$/, "");
  if (path === "~" || path.startsWith("~/")) return resolve(homedir(), `.${path.slice(1)}`);
  return resolve(homedir(), path);
}

/** The closest folder that already exists at or above path. */
export function nearestExisting(path: string): string {
  let dir = resolve(path);
  while (!existsSync(dir) && dirname(dir) !== dir) dir = dirname(dir);
  return dir;
}

/** path with the home directory shown as `~`, for prompts and messages. */
export const tildePath = (path: string) => (isInside(path, homedir()) ? join("~", relative(homedir(), path)) : path);

/** Is path the same as dir, or somewhere under it? */
export function isInside(path: string, dir: string): boolean {
  const rel = relative(resolve(dir), resolve(path));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

/** The DebtDoctor package root, whether running from src/ (tsx) or dist/. */
export function packageRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  while (!existsSync(join(dir, "package.json"))) {
    const parent = dirname(dir);
    if (parent === dir) throw new Error("debtdoctor package.json not found");
    dir = parent;
  }
  return dir;
}

/** Runs fn with a fresh temp directory and always removes it afterwards. */
export async function withTempDir<T>(prefix: string, fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), `debtdoctor-${prefix}-`));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
