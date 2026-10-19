---
name: techdebt-grill-implement
description: Grill the user on edge cases for a tech-debt Jira ticket before implementing it, record the amended plan as a new [techdebt-plan vN+1] comment, then implement. Use when the user runs /techdebt-grill-implement <KEY>, or when techdebt-implement found drift and the user wants to re-plan.
---

Works in Claude Code and Codex: plain instructions, no runtime-specific tools. Jira access goes through the user's own `jira-issues` skill.

## 1. Load
Everything `techdebt-implement` loads (ticket, Fingerprint, Scanned Commit, `context.md`, `impact.md`, latest `[techdebt-plan vN]`), then run its drift check and keep the result: drift is the first thing to grill on.

## 2. Find the facts yourself
Before asking anything, look up what the code can tell you: callers of the symbols the plan touches (search the repo), config and feature flags that reference them, public APIs or serialised formats they expose, and the tests that cover them today. Never ask the user for a fact you can find.

## 3. Grill in rounds
Ask only about decisions, in numbered rounds. Each question gets your recommended answer. Ask every question whose prerequisites are settled in the same round; hold questions that depend on an open answer for a later round. Cover at least:
- **Drift**: anything that changed since the Scanned Commit and whether the plan still holds
- **Callers**: who breaks, and whether to change them in this PR or behind a shim
- **Config and runtime**: environment-specific values, flags, migrations, deploy order
- **Backwards compatibility**: APIs, events, persisted data, other services
- **Tests**: what proves it works, what is missing today, what to run
- **Scope**: what this ticket will not fix

Stop when no open questions remain, then show the amended plan in the same shape as `techdebt-ask` step 3, with a short "Changed from vN" list at the top.

## 4. Record the Amendment
After the user explicitly confirms, post the amended plan as a comment starting with `[techdebt-plan v<N+1>]` (wiki markup, via `jira-issues`). Never edit earlier plan comments or the attachments.

## 5. Implement
Hand off to `techdebt-implement` from its step 3 (Branch), using the new plan version. The drift check is already done; do not repeat it unless the user asks.
