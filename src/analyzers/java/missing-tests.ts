import { basename } from "node:path";
import type { EvidenceBundle } from "../../domain/schemas.js";
import { capLines, isTestFile } from "../common/files.js";
import type { Analyzer } from "../context.js";
import { javaSources } from "./sources.js";

const testedName = (file: string) => /^(?:Test)?(\w+?)(?:Tests?|IT|TestCase)?\.(?:java|kt|groovy)$/.exec(basename(file))?.[1];

/** Classes in src/main with no *Test / *Tests / *IT anywhere in the repo, grouped per package. JaCoCo is not read. */
export const javaMissingTests: Analyzer = async (ctx) => {
  if (!ctx.thresholds.testing.requireTestFile) return [];
  const tested = new Set(ctx.files.filter(isTestFile).map(testedName).filter((n): n is string => !!n));
  const untested = (await javaSources(ctx)).filter((s) => s.kind === "class" && !tested.has(s.name));

  const byPkg = new Map<string, typeof untested>();
  for (const s of untested) {
    const key = `${s.module}${s.pkg}`;
    byPkg.set(key, [...(byPkg.get(key) ?? []), s]);
  }
  return [...byPkg].map(
    ([pkg, classes]): EvidenceBundle => ({
      category: "testing",
      rule: "missing-tests",
      symbolPath: pkg,
      files: classes.map((c) => c.file),
      metrics: { value: classes.length, loc: classes.reduce((n, c) => n + c.body.split("\n").length, 0) },
      snippet: capLines(`Classes with no matching test:\n${classes.map((c) => `- ${c.name}`).join("\n")}`),
      stack: "java",
    }),
  );
};
