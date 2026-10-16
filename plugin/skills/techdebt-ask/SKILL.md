---
name: techdebt-ask
description: Answer questions about a tech-debt Jira ticket using its Dossier and the current code. Generates design options and an implementation plan if the ticket has none. Use when the user runs /techdebt-ask <KEY>.
---

<!-- Part 2, D2-1/D2-2. Plain SKILL.md, no runtime-specific tools (Claude Code and Codex). -->
1. Fetch the ticket with the user's own `jira-issues` skill and download `context.md` and `impact.md`.
2. Read the current code at the cited paths.
3. If there is no `[techdebt-plan` comment, generate Design options (≥2, trade-offs, recommendation) and an Implementation plan (Steps, Tests, Rollback, Acceptance criteria). Post as `[techdebt-plan v1]` only after the user confirms.
4. Answer from the ticket, attachments, plan and current code.
