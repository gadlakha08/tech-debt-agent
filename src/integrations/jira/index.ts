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
  priority: "Major" | "Minor" | "Trivial";
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
  myPermissions(projectKey: string): Promise<JiraPermissions>;
}

/** In-memory fake so Person A can build the ticketer before the real client lands. */
export function createFakeJiraClient(): JiraClient & { issues: Map<string, JiraIssue & { comments: string[] }> } {
  const issues = new Map<string, JiraIssue & { comments: string[] }>();
  let seq = 0;
  return {
    issues,
    async search(jql) {
      const label = /labels\s*=\s*"?([\w-]+)"?/.exec(jql)?.[1];
      return [...issues.values()].filter((i) => !label || i.labels.includes(label));
    },
    async create(input) {
      const issue = { key: `${input.projectKey}-${++seq}`, summary: input.summary, labels: input.labels, comments: [] };
      issues.set(issue.key, issue);
      return issue;
    },
    async update(key, fields) {
      const i = issues.get(key);
      if (i && fields.summary) i.summary = fields.summary;
      if (i && fields.labels) i.labels = fields.labels;
    },
    async comment(key, body) {
      issues.get(key)?.comments.push(body);
    },
    async epicLink() {},
    async attach() {},
    async myPermissions() {
      return { BROWSE_PROJECTS: true, CREATE_ISSUES: true, ADD_COMMENTS: true, EDIT_ISSUES: true, CREATE_ATTACHMENTS: true };
    },
  };
}
