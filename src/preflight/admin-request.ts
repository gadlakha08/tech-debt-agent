import { JIRA_BOT } from "../domain/schemas.js";
import type { JiraPermissions } from "../integrations/jira/index.js";

const LABEL: Record<keyof JiraPermissions, string> = {
  BROWSE_PROJECTS: "Browse Projects",
  CREATE_ISSUES: "Create Issues",
  ADD_COMMENTS: "Add Comments",
  EDIT_ISSUES: "Edit Issues",
  CREATE_ATTACHMENTS: "Create Attachments",
};

/** Text the user forwards to a Jira admin. We print it and copy it to the clipboard; we never send it. */
export function adminRequest(projectKey: string, missing: (keyof JiraPermissions)[], user = JIRA_BOT): string {
  return `Please add user ${user} to the Developers role in project ${projectKey} (needs: ${missing.map((m) => LABEL[m]).join(", ")}).`;
}
