import { parse } from "yaml";
import { readText } from "../common/files.js";
import type { Analyzer } from "../context.js";
import { poms } from "./poms.js";

function flatten(obj: unknown, prefix = "", out = new Map<string, string>()): Map<string, string> {
  if (obj && typeof obj === "object" && !Array.isArray(obj)) {
    for (const [k, v] of Object.entries(obj)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  } else if (prefix) out.set(prefix, Array.isArray(obj) ? obj.join(",") : String(obj));
  return out;
}

const EXPOSURE = "management.endpoints.web.exposure.include";

/** Spring Boot apps need actuator, with the endpoints in thresholds.ops.requireActuator exposed over HTTP. */
export const actuator: Analyzer = async (ctx) => {
  const required = ctx.thresholds.ops.requireActuator;
  if (required.length === 0) return [];
  const all = await poms(ctx);
  if (!all.some((p) => p.xml.includes("org.springframework.boot"))) return [];
  const rootPom = all.find((p) => p.file === "pom.xml")?.file ?? all[0]!.file;

  if (!all.some((p) => p.xml.includes("<artifactId>spring-boot-starter-actuator</artifactId>")))
    return [
      {
        category: "ops",
        rule: "missing-actuator",
        symbolPath: "spring-boot-starter-actuator",
        files: [rootPom],
        metrics: {},
        snippet: `Spring Boot is used but no pom.xml depends on spring-boot-starter-actuator, so ${required.join("/")} endpoints are unavailable.`,
        stack: "java",
      },
    ];

  const configs = ctx.files.filter((f) => /src\/main\/resources\/(application|bootstrap)[\w-]*\.(properties|ya?ml)$/.test(f));
  const exposed = new Set<string>();
  for (const file of configs) {
    const text = await readText(ctx.worktree, file);
    const values = file.endsWith(".properties")
      ? [/^\s*management\.endpoints\.web\.exposure\.include\s*[=:]\s*(.*)$/m.exec(text)?.[1]]
      : text.split(/^---$/m).map((doc) => {
          try {
            return flatten(parse(doc)).get(EXPOSURE);
          } catch {
            return undefined;
          }
        });
    for (const v of values) for (const e of (v ?? "").split(",")) if (e.trim()) exposed.add(e.trim().replace(/^["']|["']$/g, ""));
  }
  if (exposed.size === 0) exposed.add("health"); // Spring Boot's default web exposure
  if (exposed.has("*")) return [];
  const missing = required.filter((e) => !exposed.has(e));
  if (missing.length === 0) return [];
  return [
    {
      category: "ops",
      rule: "actuator-exposure",
      symbolPath: EXPOSURE,
      files: configs.length ? configs : [rootPom],
      metrics: { value: missing.length },
      snippet: `${EXPOSURE} exposes [${[...exposed].join(", ")}]; missing: ${missing.join(", ")}`,
      stack: "java",
    },
  ];
};
