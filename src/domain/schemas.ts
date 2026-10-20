import { z } from "zod";

// Shared contract between Part 1 and Part 2. Ping your partner before changing it.

export const DebtCategory = z.enum(["code", "architecture", "dependencies", "testing", "ops"]);
export type DebtCategory = z.infer<typeof DebtCategory>;

export const Stack = z.enum(["ts", "java"]);
export type Stack = z.infer<typeof Stack>;
export const BuildTool = z.enum(["maven", "gradle", "npm", "yarn", "pnpm"]);
export type BuildTool = z.infer<typeof BuildTool>;
/** What a repo is, read from the build file at its root: decides which analyzers run and which tools preflight checks. */
export interface RepoKind {
  stack: Stack;
  build: BuildTool;
  marker: string; // the file that decided it, e.g. "pom.xml"
}

export const Severity = z.enum(["High", "Medium", "Low"]);
export type Severity = z.infer<typeof Severity>;


/** Deterministic analyzer output (Part 2). */
export const EvidenceBundle = z.object({
  category: DebtCategory,
  rule: z.string(), // e.g. "complexity", "god-class", "outdated-major", "circular-import"
  symbolPath: z.string(), // module/package + class/function; never line numbers
  files: z.array(z.string()).min(1),
  metrics: z.object({
    fanIn: z.number().optional(),
    loc: z.number().optional(), // lines of the flagged code: the method/function, else the file or the duplicated block
    value: z.number().optional(),
    threshold: z.number().optional(),
  }),
  snippet: z.string(), // ≤150 lines: tool output or code excerpt
  stack: Stack,
});
export type EvidenceBundle = z.infer<typeof EvidenceBundle>;

/** nano classification of one EvidenceBundle (Part 1). */
export const Finding = z.object({
  title: z.string(),
  description: z.string(),
  evidence: z.array(EvidenceBundle).min(1),
});
export type Finding = z.infer<typeof Finding>;

export const Defect = z.object({
  kind: z.enum(["security", "bug"]),
  description: z.string(),
  evidence: EvidenceBundle,
});
export type Defect = z.infer<typeof Defect>;

export const Classification = z.discriminatedUnion("type", [
  z.object({ type: z.literal("finding"), finding: Finding }),
  z.object({ type: z.literal("defect"), defect: Defect }),
  z.object({ type: z.literal("discard"), reason: z.string() }),
]);
export type Classification = z.infer<typeof Classification>;

const Score = z.number().int().min(1).max(5);

export const RubricScores = z.object({
  impact: Score,
  reach: Score,
  churn: Score,
  risk: Score,
  justifications: z.object({ impact: z.string(), risk: z.string() }),
});
export type RubricScores = z.infer<typeof RubricScores>;

export const DebtItem = z.object({
  fingerprint: z.string().length(10),
  category: DebtCategory,
  rule: z.string(),
  symbolPath: z.string(),
  title: z.string(),
  description: z.string(),
  findings: z.array(Finding).min(1),
  files: z.array(z.string()),
  scores: RubricScores.optional(),
  score: z.number().int().optional(), // impact + reach + churn + risk
  severity: Severity.optional(),
  ticketKey: z.string().optional(),
});
export type DebtItem = z.infer<typeof DebtItem>;

/** Four-file Dossier attached to the Ticket. */
export const Dossier = z.object({
  fingerprint: z.string().length(10),
  contextMd: z.string(),
  impactMd: z.string(),
  designOptionsMd: z.string(),
  implementationPlanMd: z.string(),
});
export type Dossier = z.infer<typeof Dossier>;

/** Jira project keys, e.g. PROJ or PROJ_SC. */
export const JIRA_PROJECT_KEY = /^[A-Z][A-Z0-9_]+$/;
/** The generic Jira user every pipeline write is made as: its jira-cli instance name and its Jira username. Not configurable. */
export const JIRA_BOT = "techdebt-bot";

export const RepoProfile = z.object({
  repo: z.string(),
  jira: z.object({
    projectKey: z.string(),
    epicName: z.string(), // default "<repo>-tech-debts"
    issueType: z.string().default("Task"),
    // Jira priority names differ per instance (Cisco DC uses "2-High" etc., not Major/Minor/Trivial)
    priorities: z
      .object({ High: z.string(), Medium: z.string(), Low: z.string() })
      .default({ High: "2-High", Medium: "3-Medium", Low: "4-Low" }),
  }),
  includeDefects: z.boolean().default(false),
  // absolute folder for this repo's Scan Reports; unset means ~/.debtdoctor/runs/<repo>
  reportsDir: z.string().optional(),
});
export type RepoProfile = z.infer<typeof RepoProfile>;

export const Fallbacks = z.object({
  noAttach: z.boolean(),
  noEpicLink: z.boolean(),
  noComments: z.boolean(),
});
export type Fallbacks = z.infer<typeof Fallbacks>;

/** Everything a stage needs about the Scan in progress. */
export const ScanContext = z.object({
  repo: z.string(),
  repoPath: z.string(), // the user's clone, never written to
  worktree: z.string(), // temp worktree of the default branch
  defaultBranch: z.string(),
  sha: z.string(), // Scanned Commit
  stack: Stack,
  build: BuildTool,
  stackSummary: z.string(), // from acquire-codebase-knowledge scan.py
  runDir: z.string(), // ~/.debtdoctor/runs/<repo>/<ts>
  profile: RepoProfile,
  fallbacks: Fallbacks,
  dryRun: z.boolean(),
});
export type ScanContext = z.infer<typeof ScanContext>;

/** jira-cli --json output: issues carry summary/labels either at the top level or under fields. Payloads may be wrapped in { data }. */
const JiraIssueJson = z.object({
  key: z.string(),
  summary: z.string().optional(),
  labels: z.array(z.string()).optional(),
  status: z.object({ name: z.string() }).optional(),
  resolution: z.object({ name: z.string() }).nullable().optional(),
  fields: z.object({
    summary: z.string().optional(),
    labels: z.array(z.string()).optional(),
    status: z.object({ name: z.string() }).optional(),
    resolution: z.object({ name: z.string() }).nullable().optional(),
  }).optional(),
});
const unwrap = (p: unknown) => (p && typeof p === "object" && "data" in p ? (p as { data: unknown }).data : p);
const wrapped = <T extends z.ZodType>(t: T) => z.preprocess(unwrap, t);
export const JiraSearchJson = wrapped(z.object({ issues: z.array(JiraIssueJson) }));
export const JiraCreateJson = wrapped(z.object({ key: z.string().min(1) }));
/** GET /rest/api/2/issue/{key}?fields=labels */
export const JiraIssueLabelsJson = z.object({ fields: z.object({ labels: z.array(z.string()).default([]) }) });
/** `jira-cli whoami` and GET /rest/api/2/myself */
export const JiraUserJson = wrapped(z.object({ name: z.string().min(1) }));

/** GET /rest/api/2/mypermissions */
export const JiraMyPermissionsJson = z.object({
  permissions: z.record(z.string(), z.object({ havePermission: z.boolean().optional() })).default({}),
});
