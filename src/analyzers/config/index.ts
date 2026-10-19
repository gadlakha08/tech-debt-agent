import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import { packageRoot } from "../../paths.js";

const n = z.number().int().nonnegative();

export const Thresholds = z.object({
  code: z.object({
    complexity: n,
    maxDepth: n,
    maxLinesPerFunction: n,
    maxLinesPerFile: n,
    duplicationMinTokens: n,
    duplicationMinLines: n,
    todoMinPerFile: n,
  }),
  architecture: z.object({ reportCircular: z.boolean() }),
  dependencies: z.object({ majorsBehind: n, eolSpringBootBelow: n, eolJavaBelow: n }),
  testing: z.object({ requireTestFile: z.boolean() }),
  ops: z.object({ hardcodedUrls: z.boolean(), secretLiterals: z.boolean(), requireActuator: z.array(z.string()) }),
  churn: z.object({ sinceDays: n }),
});
export type Thresholds = z.infer<typeof Thresholds>;

export const thresholdsPath = () => join(packageRoot(), "src/analyzers/config/thresholds.yaml");

export async function loadThresholds(path = thresholdsPath()): Promise<Thresholds> {
  const parsed = Thresholds.safeParse(parse(await readFile(path, "utf8")));
  if (!parsed.success) throw new Error(`Invalid thresholds ${path}: ${z.prettifyError(parsed.error)}`);
  return parsed.data;
}
