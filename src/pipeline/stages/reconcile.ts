import type { DebtItem, ScanContext } from "../../domain/schemas.js";
import type { JiraClient, JiraIssue } from "../../integrations/jira/index.js";

const MISSING_LABEL = "td-missing";

export interface SuppressedTicket {
  fingerprint: string;
  ticketKey: string;
  summary: string;
}

export interface ReconciliationResult {
  activeItems: DebtItem[];
  suppressed: SuppressedTicket[];
  disappeared: number;
  reappeared: number;
}

/** Suppress Won't Fix issues and notify Jira when a previously ticketed item disappears or returns. */
export async function reconcileTickets(ctx: ScanContext, items: DebtItem[], jira: JiraClient): Promise<ReconciliationResult> {
  const repoLabel = `td-repo-${slug(ctx.repo)}`;
  const jql = `project = ${ctx.profile.jira.projectKey} AND labels = "tech-debt" AND labels = "${repoLabel}"`;
  const issues = await jira.search(jql);
  const current = new Map(items.map((item) => [item.fingerprint, item]));
  const suppressed: SuppressedTicket[] = [];
  const suppressedFingerprints = new Set<string>();
  let disappeared = 0;
  let reappeared = 0;

  for (const issue of issues) {
    const fingerprint = issue.labels.map(fingerprintFromLabel).find((value): value is string => value !== undefined);
    if (!fingerprint) continue;

    if (isWontFix(issue)) {
      suppressedFingerprints.add(fingerprint);
      suppressed.push({ fingerprint, ticketKey: issue.key, summary: issue.summary });
      continue;
    }

    const wasMissing = issue.labels.includes(MISSING_LABEL);
    const isCurrent = current.has(fingerprint);
    if (!isCurrent && !wasMissing) {
      disappeared += 1;
      if (!ctx.fallbacks.noComments) await jira.comment(issue.key, `This debt item was not detected in the scan of ${ctx.sha}. The ticket was left open for review.`);
      await updateMissingLabel(jira, issue, true, ctx.fallbacks.noEpicLink);
    } else if (isCurrent && wasMissing) {
      reappeared += 1;
      if (!ctx.fallbacks.noComments) await jira.comment(issue.key, `This debt item was detected again in scan ${ctx.sha}.`);
      await updateMissingLabel(jira, issue, false, ctx.fallbacks.noEpicLink);
    }
  }

  return {
    activeItems: items.filter((item) => !suppressedFingerprints.has(item.fingerprint)),
    suppressed: suppressed.sort((a, b) => a.fingerprint.localeCompare(b.fingerprint)),
    disappeared,
    reappeared,
  };
}

function fingerprintFromLabel(label: string): string | undefined {
  const match = /^td-fp-([a-f0-9]{10})$/i.exec(label);
  return match?.[1]?.toLowerCase();
}

function isWontFix(issue: JiraIssue): boolean {
  return [issue.resolution, issue.status].some((value) => value !== undefined && normalize(value) === "wont fix");
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

async function updateMissingLabel(jira: JiraClient, issue: JiraIssue, missing: boolean, canEdit: boolean): Promise<void> {
  if (!canEdit) return;
  const labels = new Set(issue.labels);
  if (missing) labels.add(MISSING_LABEL);
  else labels.delete(MISSING_LABEL);
  const next = [...labels];
  if (next.length !== issue.labels.length || next.some((label) => !issue.labels.includes(label))) {
    await jira.update(issue.key, { labels: next });
  }
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "repo";
}
