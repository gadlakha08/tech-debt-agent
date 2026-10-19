import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { JiraIssueLabelsJson, JiraMyPermissionsJson, JiraUserJson } from "../../domain/schemas.js";
import type { JiraPermissions } from "./index.js";

const PERMISSIONS = ["BROWSE_PROJECTS", "CREATE_ISSUES", "ADD_COMMENTS", "EDIT_ISSUES", "CREATE_ATTACHMENTS"] as const;

function config() {
  const baseUrl = process.env.DEBTDOCTOR_JIRA_BASE_URL?.replace(/\/+$/, "");
  const token = process.env.DEBTDOCTOR_JIRA_TOKEN;
  if (!baseUrl) throw new Error("DEBTDOCTOR_JIRA_BASE_URL is not set");
  if (!token) throw new Error("DEBTDOCTOR_JIRA_TOKEN is not set");
  return { baseUrl, headers: { authorization: `Bearer ${token}`, accept: "application/json" } };
}

async function check(res: Response, what: string): Promise<Response> {
  if (!res.ok) throw new Error(`Jira ${what} failed: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
  return res;
}

/** GET /rest/api/2/mypermissions?projectKey=…&permissions=BROWSE_PROJECTS,CREATE_ISSUES,ADD_COMMENTS,EDIT_ISSUES,CREATE_ATTACHMENTS */
export async function myPermissions(projectKey: string): Promise<JiraPermissions> {
  const { baseUrl, headers } = config();
  const url = `${baseUrl}/rest/api/2/mypermissions?projectKey=${encodeURIComponent(projectKey)}&permissions=${PERMISSIONS.join(",")}`;
  const res = await check(await fetch(url, { headers }), "mypermissions");
  const { permissions } = JiraMyPermissionsJson.parse(await res.json());
  const has = (p: (typeof PERMISSIONS)[number]) => permissions[p]?.havePermission === true;
  return { BROWSE_PROJECTS: has("BROWSE_PROJECTS"), CREATE_ISSUES: has("CREATE_ISSUES"), ADD_COMMENTS: has("ADD_COMMENTS"), EDIT_ISSUES: has("EDIT_ISSUES"), CREATE_ATTACHMENTS: has("CREATE_ATTACHMENTS") };
}

/** GET /rest/api/2/myself: the Jira username DEBTDOCTOR_JIRA_TOKEN belongs to. */
export async function myself(): Promise<string> {
  const { baseUrl, headers } = config();
  const res = await check(await fetch(`${baseUrl}/rest/api/2/myself`, { headers }), "myself");
  return JiraUserJson.parse(await res.json()).name;
}

/** GET /rest/api/2/issue/{key}?fields=labels: reads the issue itself, so it doesn't wait on the search index. */
export async function labels(key: string): Promise<string[]> {
  const { baseUrl, headers } = config();
  const res = await check(await fetch(`${baseUrl}/rest/api/2/issue/${encodeURIComponent(key)}?fields=labels`, { headers }), `labels of ${key}`);
  return JiraIssueLabelsJson.parse(await res.json()).fields.labels;
}

/** POST /rest/api/2/issue/{key}/attachments with X-Atlassian-Token: no-check */
export async function attach(key: string, filePath: string): Promise<void> {
  const { baseUrl, headers } = config();
  const form = new FormData();
  form.append("file", new Blob([await readFile(filePath)], { type: "text/markdown" }), basename(filePath));
  const res = await fetch(`${baseUrl}/rest/api/2/issue/${encodeURIComponent(key)}/attachments`, {
    method: "POST",
    headers: { ...headers, "x-atlassian-token": "no-check" },
    body: form,
  });
  await check(res, `attach to ${key}`);
}
