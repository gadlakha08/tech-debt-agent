---
name: techdebt-implement
description: Implement a tech-debt Jira ticket from its latest plan, after a drift check, and open a PR. Use when the user runs /techdebt-implement <KEY>.
---

<!-- Part 2, D2-2. -->
1. Load the ticket, attachments and latest `[techdebt-plan vN]` comment (generate the plan as in techdebt-ask if missing).
2. Drift check: `git diff --stat <scannedSHA>..HEAD -- <evidence files>`. If anything changed, stop and ask.
3. Branch `td/<KEY>-<slug>`.
4. Follow the plan step by step, running tests and lint after each step.
5. `gh pr create` with the key in the title and a ticket link in the body.
6. Transition the ticket to In Progress, then In Review.
