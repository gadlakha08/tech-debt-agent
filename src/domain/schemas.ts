import { z } from "zod";

// Shared contract between Part 1 and Part 2. Ping your partner before changing it.

export const DebtCategory = z.enum(["code", "architecture", "dependencies", "testing", "ops"]);
export type DebtCategory = z.infer<typeof DebtCategory>;

export const Stack = z.enum(["ts", "java"]);
export type Stack = z.infer<typeof Stack>;

export const Severity = z.enum(["High", "Medium", "Low"]);
export type Severity = z.infer<typeof Severity>;

export const Effort = z.enum(["S", "M", "L", "XL"]);
export type Effort = z.infer<typeof Effort>;

/** Deterministic analyzer output (Part 2). */
export const EvidenceBundle = z.object({
  category: DebtCategory,
  rule: z.string(), // e.g. "complexity", "god-class", "outdated-major", "circular-import"
  symbolPath: z.string(), // module/package + class/function; never line numbers
  files: z.array(z.string()).min(1),
  metrics: z.object({
    fanIn: z.number().optional(),
    loc: z.number().optional(),
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
  loc: z.number().int().nonnegative(),
  scores: RubricScores.optional(),
  score: z.number().int().optional(), // impact + reach + churn + risk
  severity: Severity.optional(),
  effort: Effort.optional(),
  ticketKey: z.string().optional(),
});
export type DebtItem = z.infer<typeof DebtItem>;

/** Lite Dossier: the two markdown files attached to the Ticket. */
export const Dossier = z.object({
  fingerprint: z.string().length(10),
  contextMd: z.string(),
  impactMd: z.string(),
});
export type Dossier = z.infer<typeof Dossier>;

export const RepoProfile = z.object({
  repo: z.string(),
  jira: z.object({
    projectKey: z.string(),
    epicName: z.string(), // default "<repo>-tech-debts"
    issueType: z.string().default("Task"),
    instance: z.string().default("techdebt-bot"),
  }),
  includeDefects: z.boolean().default(false),
  pricePer1MTokens: z.object({ input: z.number(), output: z.number() }),
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
  stackSummary: z.string(), // from acquire-codebase-knowledge scan.py
  runDir: z.string(), // ~/.techdebt/runs/<repo>/<ts>
  profile: RepoProfile,
  fallbacks: Fallbacks,
  dryRun: z.boolean(),
});
export type ScanContext = z.infer<typeof ScanContext>;
