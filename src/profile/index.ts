import { homedir } from "node:os";
import { join } from "node:path";
import { RepoProfile, type RepoProfile as RepoProfileType } from "../domain/schemas.js";
import { parse, stringify } from "yaml";
import { mkdir, readFile, writeFile } from "node:fs/promises";

export const profilePath = (repo: string) => join(homedir(), ".techdebt", "profiles", `${repo}.yaml`);

export async function loadProfile(repo: string): Promise<RepoProfileType | undefined> {
  try {
    const contents = await readFile(profilePath(repo), "utf8");
    return RepoProfile.parse(parse(contents));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

export async function saveProfile(profile: RepoProfileType): Promise<void> {
  const path = profilePath(profile.repo);
  await mkdir(join(homedir(), ".techdebt", "profiles"), { recursive: true });
  await writeFile(path, stringify(profile), { encoding: "utf8", mode: 0o600 });
}
