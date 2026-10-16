import type { JiraPermissions } from "./index.js";

/** GET /rest/api/2/mypermissions?projectKey=…&permissions=BROWSE_PROJECTS,CREATE_ISSUES,ADD_COMMENTS,EDIT_ISSUES,CREATE_ATTACHMENTS */
export async function myPermissions(_projectKey: string): Promise<JiraPermissions> {
  throw new Error("not implemented: myPermissions (Part 2, D1-1)");
}

/** POST /rest/api/2/issue/{key}/attachments with X-Atlassian-Token: no-check */
export async function attach(_key: string, _filePath: string): Promise<void> {
  throw new Error("not implemented: attach (Part 2, D1-1)");
}
