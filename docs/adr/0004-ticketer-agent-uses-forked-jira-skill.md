# Ticketer is an agent using a forked, gate-free Jira skill

Tickets are created by an agent stage that loads a fork of the `jira-issues` skill. The fork is identical to the original except that the human confirmation gate is removed. The saved Repo Profile stands in for the user's confirmation. The fork ships inside this project's plugin and is loaded only by the ticketer stage. The original `jira-issues` skill stays untouched for interactive use, including first-Scan Repo Profile setup and the plugin skills.

## Considered Options

- **Deterministic TypeScript calling the Jira REST API**: rejected in favour of reusing the existing skill and jira-cli, keeping one Jira integration across interactive and autonomous use.
- **Overriding the gate via system prompt while loading the original skill**: rejected because the skill states the gate is mandatory, and prompt-level overrides of a skill's own rules are unreliable.
