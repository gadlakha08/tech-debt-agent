import type { EvidenceBundle } from "../../domain/schemas.js";
import { run } from "../../shell.js";
import type { Thresholds } from "../config/index.js";
import { capLines, major } from "../common/files.js";
import type { Analyzer, AnalyzerContext } from "../context.js";
import { parentOf, poms, property, type Pom } from "./poms.js";
import { TOOLS } from "../tools.js";

const PRERELEASE = String.raw`(?i).*[.-](alpha|beta|rc|cr|m\d+|milestone|preview|snapshot|ea)[.-]?\d*.*`;

interface Update {
  coordinate: string;
  current: string;
  latest: string;
  module: string;
}

/** Parses `versions:display-dependency-updates` output, including lines the plugin wraps when a coordinate is long. */
export function parseDependencyUpdates(output: string): Update[] {
  const lines = output.split("\n").map((l) => l.replace(/^\[(INFO|WARNING)\]\s?/, ""));
  const updates: Update[] = [];
  let module = "";
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    const building = /^-+<\s*([\w.-]+):([\w.-]+)\s*>-+$/.exec(l.trim());
    if (building) module = building[2]!;
    const one = /^\s+([\w.-]+:[\w.-]+)\s*\.*\s+(\S+)\s+->\s+(\S+)\s*$/.exec(l);
    if (one) {
      updates.push({ coordinate: one[1]!, current: one[2]!, latest: one[3]!, module });
      continue;
    }
    const head = /^\s+([\w.-]+:[\w.-]+)\s*\.*\s*$/.exec(l);
    const tail = head && /^\s+(\S+)\s+->\s+(\S+)\s*$/.exec(lines[i + 1] ?? "");
    if (head && tail) {
      updates.push({ coordinate: head[1]!, current: tail[1]!, latest: tail[2]!, module });
      i++;
    }
  }
  return updates;
}

/** Spring Boot 2.x and Java below 17 are past open-source support; read straight from the poms, no network. */
function eolChecks(all: Pom[], t: Thresholds["dependencies"]): EvidenceBundle[] {
  const out: EvidenceBundle[] = [];
  const boot = all.flatMap((p) => {
    const parent = parentOf(p.xml);
    const bom = /<groupId>org\.springframework\.boot<\/groupId>\s*<artifactId>spring-boot-(?:starter-parent|dependencies)<\/artifactId>\s*<version>([^<]+)<\/version>/.exec(p.xml)?.[1];
    const version = parent?.artifactId === "spring-boot-starter-parent" ? parent.version : bom;
    return version && major(version) < t.eolSpringBootBelow ? [{ file: p.file, version }] : [];
  });
  if (boot.length)
    out.push({
      category: "dependencies",
      rule: "eol-platform",
      symbolPath: "org.springframework.boot:spring-boot-starter-parent",
      files: boot.map((b) => b.file),
      metrics: { value: major(boot[0]!.version), threshold: t.eolSpringBootBelow },
      snippet: boot.map((b) => `${b.file}: Spring Boot ${b.version} (2.x is end of open-source support; 3.x needs Java 17 and jakarta.*)`).join("\n"),
      stack: "java",
    });

  const java = all.flatMap((p) => {
    const v = ["java.version", "maven.compiler.release", "maven.compiler.source", "maven.compiler.target"].map((k) => property(p.xml, k)).find(Boolean);
    const n = v ? Number(v.replace(/^1\./, "")) : NaN;
    return n < t.eolJavaBelow ? [{ file: p.file, v: v! }] : [];
  });
  if (java.length)
    out.push({
      category: "dependencies",
      rule: "eol-platform",
      symbolPath: "java.version",
      files: java.map((j) => j.file),
      metrics: { value: Number(java[0]!.v.replace(/^1\./, "")), threshold: t.eolJavaBelow },
      snippet: java.map((j) => `${j.file}: Java ${j.v} (below ${t.eolJavaBelow})`).join("\n"),
      stack: "java",
    });
  return out;
}

async function outdated(ctx: AnalyzerContext, all: Pom[]): Promise<EvidenceBundle[]> {
  const res = await run(
    TOOLS.mvn.command(),
    ["-B", "versions:display-dependency-updates", "-DprocessDependencyManagementTransitive=false", "-Dversions.outputLineWidth=200", `-Dmaven.version.ignore=${PRERELEASE}`],
    { cwd: ctx.worktree, timeoutMs: 240_000 },
  );
  if (res.exitCode !== 0 || !res.stdout.includes("BUILD SUCCESS")) {
    const why = (res.stdout.split("\n").find((l) => l.startsWith("[ERROR]")) ?? res.stderr.split("\n")[0] ?? "").slice(0, 200);
    ctx.warn(`mvn versions:display-dependency-updates failed (${why}); using pom.xml EOL checks only`);
    return [];
  }
  const pomFor = new Map(all.map((p) => [p.artifactId, p.file]));
  const byCoord = new Map<string, Update & { files: Set<string> }>();
  for (const u of parseDependencyUpdates(res.stdout)) {
    // calendar versions (org.json 20240303) have no major to be behind on
    if (major(u.current) >= 1000) continue;
    if (!(major(u.latest) - major(u.current) >= ctx.thresholds.dependencies.majorsBehind)) continue;
    const e = byCoord.get(u.coordinate) ?? { ...u, files: new Set<string>() };
    e.files.add(pomFor.get(u.module) ?? "pom.xml");
    byCoord.set(u.coordinate, e);
  }
  // one platform upgrade (all Spring Boot starters 3 -> 4) is one Debt Item, not ten
  const groups = new Map<string, (Update & { files: Set<string> })[]>();
  for (const u of byCoord.values()) {
    const key = `${u.coordinate.split(":")[0]}\0${major(u.current)}\0${major(u.latest)}`;
    groups.set(key, [...(groups.get(key) ?? []), u]);
  }
  return [...groups.values()].map((us): EvidenceBundle => {
    const files = [...new Set(us.flatMap((u) => [...u.files]))].sort();
    const first = us[0]!;
    return {
      category: "dependencies",
      rule: "outdated-major",
      symbolPath: us.length === 1 ? first.coordinate : `${first.coordinate.split(":")[0]}:*`,
      files,
      metrics: { value: major(first.latest) - major(first.current), threshold: ctx.thresholds.dependencies.majorsBehind },
      snippet: capLines([...us.map((u) => `${u.coordinate}: ${u.current} -> ${u.latest}`), `used in: ${files.join(", ")}`].join("\n")),
      stack: "java",
    };
  });
}

/** End-of-life Spring Boot and Java, read from the poms; needs no tool. */
export const javaPlatformEol: Analyzer = async (ctx) => eolChecks(await poms(ctx), ctx.thresholds.dependencies);

/** Dependencies a major version or more behind, via mvn versions:display-dependency-updates. */
export const mavenOutdated: Analyzer = async (ctx) => {
  const all = await poms(ctx);
  return all.length ? outdated(ctx, all) : [];
};
