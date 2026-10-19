import { JIRA_BOT, JiraCreateJson, JiraSearchJson, JiraUserJson } from "../../domain/schemas.js";
import { runJiraCli } from "./jira-cli.js";
import * as rest from "./jira-rest.js";

export interface JiraIssue {
  key: string;
  summary: string;
  labels: string[];
}

export interface CreateIssueInput {
  projectKey: string;
  issueType: string;
  summary: string;
  descriptionWiki: string;
  priority: string; // instance-specific name, from RepoProfile.jira.priorities
  labels: string[];
}

export interface JiraPermissions {
  BROWSE_PROJECTS: boolean;
  CREATE_ISSUES: boolean;
  ADD_COMMENTS: boolean;
  EDIT_ISSUES: boolean;
  CREATE_ATTACHMENTS: boolean;
}

/** Everything the pipeline does in Jira. Real impl: jira-cli (--instance techdebt-bot) + REST for permissions/attachments. */
export interface JiraClient {
  search(jql: string): Promise<JiraIssue[]>;
  create(input: CreateIssueInput): Promise<JiraIssue>;
  update(key: string, fields: Partial<Pick<CreateIssueInput, "summary" | "descriptionWiki" | "labels">>): Promise<void>;
  comment(key: string, bodyWiki: string): Promise<void>;
  epicLink(epicKey: string, issueKeys: string[]): Promise<void>;
  attach(key: string, filePath: string): Promise<void>;
  /** The issue's current labels, read directly (not through search). */
  labels(key: string): Promise<string[]>;
  myPermissions(projectKey: string): Promise<JiraPermissions>;
  /** One allow-listed jira-cli command as techdebt-bot: the ticketer agent's only way into Jira. */
  cli(args: string[]): Promise<unknown>;
  /** Who each credential acts as: the jira-cli instance's user and the REST token's user. */
  identity(): Promise<{ cli: string; rest: string }>;
}

/** Throws unless both jira-cli and the REST token act as techdebt-bot. Run before any Jira write. */
export async function assertBotIdentity(jira: Pick<JiraClient, "identity">): Promise<void> {
  const { cli, rest } = await jira.identity();
  const wrong = [cli !== JIRA_BOT && `jira-cli --instance ${JIRA_BOT} is logged in as "${cli}"`, rest !== JIRA_BOT && `DEBTDOCTOR_JIRA_TOKEN belongs to "${rest}"`].filter(Boolean);
  if (wrong.length) throw new Error(`Jira writes must be made as ${JIRA_BOT} only: ${wrong.join("; ")}`);
}

/** Real client: jira-cli (--instance techdebt-bot) for issue operations, REST for permissions and attachments. */
export function createJiraClient(): JiraClient {
  const cli = runJiraCli;
  return {
    async search(jql) {
      const { issues } = JiraSearchJson.parse(await cli(["search", "--jql", jql, "--limit", "50", "--fields", "summary,labels"]));
      return issues.map((i) => ({ key: i.key, summary: i.summary ?? i.fields?.summary ?? "", labels: i.labels ?? i.fields?.labels ?? [] }));
    },
    async create(input) {
      const { key } = JiraCreateJson.parse(
        await cli(["create", "--project", input.projectKey, "--type", input.issueType, "--summary", input.summary, "--description", input.descriptionWiki]),
      );
      try {
        await cli(["update", key, "--priority", input.priority, "--field", `labels=${JSON.stringify(input.labels)}`]);
      } catch (err) {
        // The issue exists but is unlabelled, so dedup would miss it; make that loud.
        throw new Error(`Created ${key} but could not set priority/labels: ${(err as Error).message}`);
      }
      return { key, summary: input.summary, labels: input.labels };
    },
    async update(key, fields) {
      const args = ["update", key];
      if (fields.summary) args.push("--summary", fields.summary);
      if (fields.descriptionWiki) args.push("--description", fields.descriptionWiki);
      if (fields.labels) args.push("--field", `labels=${JSON.stringify(fields.labels)}`);
      if (args.length > 2) await cli(args);
    },
    async comment(key, bodyWiki) {
      await cli(["comment", key, "--body", bodyWiki]);
    },
    async epicLink(epicKey, issueKeys) {
      for (const k of issueKeys) await cli(["epics", "link", "--issue", k, "--epic", epicKey]);
    },
    attach: rest.attach,
    labels: rest.labels,
    myPermissions: rest.myPermissions,
    cli,
    async identity() {
      const [me, token] = await Promise.all([cli(["whoami"]), rest.myself()]);
      return { cli: JiraUserJson.parse(me).name, rest: token };
    },
  };
}
