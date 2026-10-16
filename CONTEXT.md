# Tech Debt Agent

Discovers technical debt in a single repository, ranks it, and turns the most important items into Jira tickets backed by a Dossier that developers can question and implement from.

## Language

### Discovery

**Scan**:
One end-to-end run of the agent against exactly one repository, from knowledge acquisition through ticketing.
_Avoid_: Job, audit, sweep

**Agent Runtime**:
The AI coding agent (Claude or Codex) that a whole Scan runs on, chosen once per Scan and recorded in the Scan Report.
_Avoid_: Provider, backend, model

**Repo Profile**:
The per-repository settings captured on the first Scan (Jira project, epic strategy, issue type, labels, Defect default) that make later Scans run without a human.
_Avoid_: Repo config, settings

**Scanned Commit**:
The commit SHA on the repository's default branch (`main` or `master`) that a Scan analysed; every Dossier is pinned to it.
_Avoid_: Snapshot, version

**Knowledge Snapshot**:
The codebase documentation produced at the start of a Scan and stored with it, never written into the scanned repository.
_Avoid_: Codebase docs, onboarding docs

**Scan Budget**:
The token and dollar ceiling for one Scan; a Scan that reaches it finishes its current stage and is marked partial.
_Avoid_: Limit, quota

**Finding**:
A single raw observation of possible debt reported by one scanner, with evidence; unscored and possibly duplicated.
_Avoid_: Issue, hit, result

**Debt Category**:
One of the five kinds of debt in scope: code, architecture, dependencies, testing, ops/config.
_Avoid_: Type, kind

**Debt Item**:
One or more Findings merged into a single scored unit of technical debt with a Severity and a Fingerprint.
_Avoid_: Tech debt (as a countable noun), concern, finding

**Defect**:
A security vulnerability or bug noticed during a Scan; explicitly not debt, reported separately and never ticketed as a Debt Item.
_Avoid_: Security debt, bug debt

### Ranking

**Rubric**:
The written scoring criteria (Impact, Reach, Churn, Risk scored 1–5, plus Effort) applied to every Debt Item.
_Avoid_: Scoring model, heuristics

**Severity**:
The High / Medium / Low band a Debt Item falls into from its Rubric score; Effort never affects it.
_Avoid_: Priority (that is a Jira field), criticality

**Cut**:
The set of Debt Items selected for ticketing in a Scan: every High and Medium, topped up to a floor of 10 and capped at 15 unless the user uncaps it.
_Avoid_: Top 10, shortlist

**Fingerprint**:
A stable identity for a Debt Item that survives across Scans, used to detect debt that is already ticketed.
_Avoid_: Hash, ID

**Suppressed Fingerprint**:
A Fingerprint whose Ticket was closed as Won't Fix; later Scans never re-ticket it and list it as suppressed in the Scan Report.
_Avoid_: Ignored, muted, whitelisted

### Artifacts

**Dossier**:
The document bundle for one Debt Item in the Cut: context, impact analysis, design options, and implementation plan.
_Avoid_: Context docs, ticket docs, report

**Ticket**:
The Jira issue representing one Debt Item, linked to its Dossier.
_Avoid_: Story, issue (when meaning the Jira artifact)

**Scan Report**:
The summary of a Scan: the Cut, the Debt Items below the Cut, and the Defect count.
_Avoid_: Output, summary

### Acting on debt

**Amendment**:
A recorded change to a Dossier's implementation plan, produced by grilling or Q&A with the user's explicit confirmation.
_Avoid_: Edit, update

**Drift**:
A mismatch between the code as a Dossier describes it and the code as it is now.
_Avoid_: Staleness, divergence
