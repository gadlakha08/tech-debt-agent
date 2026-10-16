import { createHash } from "node:crypto";
import type { EvidenceBundle } from "./schemas.js";

/** Strips line/column suffixes and normalises separators so the Fingerprint survives edits. */
export function normaliseSymbolPath(symbolPath: string): string {
  return symbolPath
    .replace(/\\/g, "/")
    .replace(/(:\d+)+$/, "")
    .replace(/#L\d+(-L?\d+)?$/, "")
    .trim()
    .toLowerCase();
}

export function fingerprint(b: Pick<EvidenceBundle, "category" | "rule" | "symbolPath">): string {
  const key = `${b.category}|${b.rule}|${normaliseSymbolPath(b.symbolPath)}`;
  return createHash("sha1").update(key).digest("hex").slice(0, 10);
}
