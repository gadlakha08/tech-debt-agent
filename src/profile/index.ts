import { homedir } from "node:os";
import { join } from "node:path";
import type { RepoProfile } from "../domain/schemas.js";

export const profilePath = (repo: string) => join(homedir(), ".techdebt", "profiles", `${repo}.yaml`);

export async function loadProfile(_repo: string): Promise<RepoProfile | undefined> {
  throw new Error("not implemented: loadProfile (Person B, D2-1)");
}

export async function saveProfile(_profile: RepoProfile): Promise<void> {
  throw new Error("not implemented: saveProfile (Person B, D2-1)");
}
