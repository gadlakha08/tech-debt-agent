import type { ScanContext } from "../../domain/schemas.js";

/** `git log --since=180.days --name-only --pretty=format:` → commits per file. */
export async function churn(_ctx: ScanContext): Promise<Record<string, number>> {
  throw new Error("not implemented: churn (Part 2, D1-1)");
}
