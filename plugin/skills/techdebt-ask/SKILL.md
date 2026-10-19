---
name: techdebt-ask
description: Answer questions about a tech-debt Jira ticket created by the tech-debt agent, using its Dossier (context.md, impact.md) and the current code. Generates design options and an implementation plan if the ticket has none. Use when the user runs /techdebt-ask <KEY> or asks about a ticket labelled tech-debt.
---

Works in Claude Code and Codex: plain instructions, no runtime-specific tools. Jira access goes through the user's own `jira-issues` skill (their account, their confirmation rules). Never use the `techdebt-bot` instance from here.

## 1. Load the ticket
- `jira-cli --format json view <KEY> --full`. Check the labels include `tech-debt`; if not, say this skill only covers tech-debt tickets and stop.
- From the description, read the **Fingerprint** and **Scanned Commit** lines and the evidence list.
- Download `context.md` and `impact.md`: take the attachment IDs from the view payload, then `jira-cli attachments download <ID> --filename <tmpdir>/<name>`. Use a temp directory, never the repo.
- Find the latest comment starting with `[techdebt-plan v` (highest N). That is the current plan.

## 2. Read the code as it is now
- Open every file the evidence and `context.md` cite, in the user's checkout.
- If the checkout is not on the default branch, or `git log -1 --format=%H` differs from the Scanned Commit, run `git diff --stat <scannedSHA>..HEAD -- <cited files>`. Mention any drift up front: the Dossier describes the code at the Scanned Commit.

## 3. If there is no plan, draft one
Write two sections and show them to the user:

**Design options**: at least 2. For each: what changes, trade-offs (risk, effort, blast radius), and what it does not fix. End with a recommendation and why.

**Implementation plan** for the recommended option:
- *Steps*: small, ordered, each leaving the build green
- *Tests*: which to add, which existing ones to run (`npm test` / `mvn test`, plus the narrowest command for the touched module)
- *Rollback*: how to undo safely
- *Acceptance criteria*: checkable statements

Post it as a comment only after the user explicitly confirms, starting the body with `[techdebt-plan v1]` (wiki markup, via `jira-issues`). If they want changes, revise and ask again.

## 4. Answer questions
Answer from the ticket, the two attachments, the plan and the current code, in that order of trust for "what the agent saw", and the current code for "what is true now". Cite file paths. When the answer depends on something none of them cover, say so instead of guessing. Typical questions: why is this High, what breaks if we ignore it, who calls this, how big is the change.

## Rules
- Read-only on the repo. No edits, no branches; hand off to `/techdebt-implement <KEY>` or `/techdebt-grill-implement <KEY>` for changes.
- The only Jira write is the `[techdebt-plan v1]` comment, and only after confirmation.
