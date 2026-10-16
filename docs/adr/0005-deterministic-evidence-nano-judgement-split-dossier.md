# Deterministic evidence, nano judgement, and a split Dossier

Because the pipeline only has gpt-5-nano, the model never searches the codebase for debt. Deterministic analyzers (ESLint, PMD, jscpd, madge, dependency and test checks) produce small Evidence Bundles; nano only classifies each one (Finding, Defect or discard) and picks Impact and Risk from anchored 1–5 descriptions. Reach, Churn and Effort are computed in code.

The Dossier is split by who can write it well. At scan time nano writes only the Lite Dossier (`context.md`, `impact.md`) from fixed templates with required headings. Design options and the implementation plan are written by the first plugin skill run on the developer's own stronger model, and recorded on the Ticket as a `[techdebt-plan vN]` comment. Later Amendments add new versions.

## Considered Options

- **Agentic search by nano (fan-out subagents reading the repo)**: rejected. Too weak for open-ended exploration across ~76k LOC; results would be noisy, slow and not repeatable.
- **nano writes the full Dossier at scan time**: rejected. Design options and plans from nano would be shallow, and they go stale before anyone picks up the Ticket.
- **Purely deterministic scoring, no LLM**: rejected. Impact and Risk need judgement, and classification is what filters analyzer noise.

## Consequences

- Scans are cheap and mostly repeatable; Fingerprints come from analyzer rules and symbol paths, not model output.
- Debt that no analyzer detects is not found. New debt kinds mean new analyzers.
- A Ticket has no plan until someone runs a plugin skill on it.
