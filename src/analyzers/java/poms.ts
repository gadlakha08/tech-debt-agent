import type { AnalyzerContext } from "../context.js";
import { readText } from "../common/files.js";

export interface Pom {
  file: string;
  artifactId: string;
  xml: string;
}

const tag = (xml: string, name: string) => new RegExp(`<${name}>\\s*([^<]+?)\\s*</${name}>`).exec(xml)?.[1];

/** Every pom.xml in the worktree, with its own artifactId (not the parent's). */
export async function poms(ctx: AnalyzerContext): Promise<Pom[]> {
  return Promise.all(
    ctx.files
      .filter((f) => f === "pom.xml" || f.endsWith("/pom.xml"))
      .map(async (file) => {
        const xml = (await readText(ctx.worktree, file)).replace(/<!--[\s\S]*?-->/g, "");
        const own = xml.replace(/<parent>[\s\S]*?<\/parent>/, "").replace(/<(dependencies|dependencyManagement|build|profiles)>[\s\S]*$/, "");
        return { file, artifactId: tag(own, "artifactId") ?? file, xml };
      }),
  );
}

export const parentOf = (xml: string) => {
  const p = /<parent>([\s\S]*?)<\/parent>/.exec(xml)?.[1];
  return p ? { groupId: tag(p, "groupId"), artifactId: tag(p, "artifactId"), version: tag(p, "version") } : undefined;
};

export const property = (xml: string, name: string) => tag(/<properties>([\s\S]*?)<\/properties>/.exec(xml)?.[1] ?? "", name.replaceAll(".", "\\."));
