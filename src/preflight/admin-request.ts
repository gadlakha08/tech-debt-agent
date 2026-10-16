/** Text the user forwards to a Jira admin. We print it and copy it to the clipboard; we never send it. */
export function adminRequest(projectKey: string, missing: string[], user = "techdebt-bot"): string {
  return `Please add user ${user} to the Developers role in project ${projectKey} (needs: ${missing.join(", ")}).`;
}
