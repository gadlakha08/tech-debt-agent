import { existsSync } from "node:fs";
import { join } from "node:path";
import type { BuildTool, RepoKind, Stack } from "../domain/schemas.js";

// first match wins: Java beats TS in mixed repos (a frontend bundled into a service)
const MARKERS: { file: string; stack: Stack; build: BuildTool }[] = [
  { file: "pom.xml", stack: "java", build: "maven" },
  { file: "build.gradle", stack: "java", build: "gradle" },
  { file: "build.gradle.kts", stack: "java", build: "gradle" },
  { file: "pnpm-lock.yaml", stack: "ts", build: "pnpm" },
  { file: "yarn.lock", stack: "ts", build: "yarn" },
  { file: "package.json", stack: "ts", build: "npm" },
];

const LANGUAGE: Record<Stack, string> = { java: "Java", ts: "TypeScript / JavaScript" };
const BUILD: Record<BuildTool, string> = { maven: "Maven", gradle: "Gradle", npm: "npm", yarn: "Yarn", pnpm: "pnpm" };

/** The repo's language and build tool, from the build file at its root. */
export function detectRepo(dir: string): RepoKind {
  const hit = MARKERS.find((m) => existsSync(join(dir, m.file)) && (m.stack === "java" || existsSync(join(dir, "package.json"))));
  if (!hit) throw new Error(`Cannot tell the language of ${dir}: no pom.xml, build.gradle or package.json at the root`);
  return { stack: hit.stack, build: hit.build, marker: hit.file };
}


/** "Java · Maven (pom.xml)" */
export const describeRepo = (repo: RepoKind) => `${LANGUAGE[repo.stack]} · ${BUILD[repo.build]} (${repo.marker})`;
