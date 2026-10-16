---
name: jira-autonomous
description: Pipeline-only fork of jira-issues with the confirmation gate removed. Loaded only by the tech-debt-agent ticketer. Never publish or install globally.
---

<!-- Part 2, D2-1: copy ~/.agents/skills/jira-issues here, keep all commands/wiki markup/references,
remove "Explicit confirmation gate" and "Ask before writes", then add the rules below. -->

## Rules
- The saved Repo Profile is the user's confirmation.
- Always use `--instance techdebt-bot`.
- Always JQL-search `labels = td-fp-<fp>` before creating.
