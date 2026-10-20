---
name: techdebt-implement
description: Implement a tech-debt Jira ticket created by the tech-debt agent from its implementation-plan Dossier and latest [techdebt-plan vN] comment, after a drift check, and open a PR. Use when the user runs /techdebt-implement <KEY>.
---

Works in Claude Code and Codex: plain instructions, no runtime-specific tools. Jira access goes through the user's own `jira-issues` skill. Run inside the user's clone of the ticket's repo.

## 1. Load
- Do step 1 of `techdebt-ask`: ticket, Fingerprint, Scanned Commit, all four Dossier attachments (`context.md`, `impact.md`, `design-options.md`, `implementation-plan.md`), latest `[techdebt-plan vN]` comment.
- Use the Dossier's recommended option and implementation plan as the starting proposal. A later `[techdebt-plan vN]` comment takes precedence.
- No plan comment: show the Dossier plan and any needed refinements as in `techdebt-ask` step 3, get confirmation, post it as `[techdebt-plan v1]`, then continue.

## 2. Drift check (stop on drift)
- `git fetch origin` and compare against the default branch.
- `git diff --stat <scannedSHA>..origin/<default> -- <every file in the evidence and context.md>`.
- If anything changed: show the diff stat, summarise what moved, and **stop and ask** whether to continue, re-plan (`/techdebt-grill-implement <KEY>`), or abandon. Do not continue silently.

## 3. Branch
- Require a clean working tree (`git status --porcelain` empty); otherwise ask the user to stash or commit.
- `git switch -c td/<KEY>-<short-slug> origin/<default>`.

## 4. Work through the plan
- One plan step at a time. After each step run the repo's own checks: detect them (`package.json` scripts `test`/`lint`/`typecheck`; `mvn -q test` or the module's narrower `-pl <module>`; Gradle `./gradlew test`).
- Add the tests the plan lists. A step is done when its checks pass.
- If a step turns out wrong or impossible, stop and ask: propose the change to the plan. Do not improvise a different design.
- Commit per step with messages `<KEY>: <step>`.

## 5. Pull request
- Push the branch and run `gh pr create` with the title `<KEY>: <ticket summary>` and a body containing: the ticket link, the plan version implemented, what changed per step, tests run, and the acceptance criteria as a checklist.
- Give the user the PR URL.

## 6. Jira
- With the user's confirmation (via `jira-issues`): transition the ticket to **In Progress** when step 4 starts and to **In Review** when the PR is open, and comment with the PR link. If a transition name does not exist in this workflow, list the available transitions and ask.

## Rules
- Never push to the default branch, never force-push, never merge the PR.
- Never edit the Dossier attachments; plan changes are new `[techdebt-plan vN+1]` comments (an Amendment), made through `/techdebt-grill-implement`.
