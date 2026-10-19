---
name: jira-autonomous
description: Pipeline-only fork of jira-issues with the confirmation gate removed. Loaded only by the DebtDoctor ticketer. Never publish or install globally.
---

> Forked from `~/.agents/skills/jira-issues` on 2026-10-19. Differences: no confirmation gate or "ask before writes" (the Repo Profile is the confirmation), always `--instance techdebt-bot`, mandatory `td-fp-*` dedup, and a command allow-list. The global `jira-issues` skill is unchanged; never copy this file over it.

## Rules
- The saved Repo Profile is the user's confirmation.
- Always use `--instance techdebt-bot`.
- Always JQL-search `labels = td-fp-<fp>` before creating.


Progressive disclosure: keep responses short, expand only on request.

## Command Rules

- Always place global flags before the subcommand: `jira-cli --instance <name> --format json whoami`, not `jira-cli whoami --format json`.
- Treat wrapper startup issues separately from Jira command outcome. A transient `nix` cache/lock message during shim startup is not by itself a failed Jira operation if the underlying command is still running or eventually returns valid output.
- When startup noise appears but the command continues, poll or wait for the actual Jira result instead of bailing early.
- Always use wiki markup for descriptions and comments (both Server/DC and Cloud).

## Output Policy (Agent-First)

- Default mode is `toon` for search/list-style reads; use explicit flags for agent commands: `--format toon --toon-max-items 12`.
- Do not force `--format toon` on `whoami`; use plain `jira-cli whoami` for auth checks, and `--format json` only when parsing the response.
- Use `--format json` when piping to `jq` or consuming full payloads.
- Use `--format text` only for human-facing terminal sessions.
- Use `--toon-max-items <N>` to cap TOON list payload size (default: `12`).
- Avoid `view` by default; run it only when the user explicitly asks for full issue details.

## Environment

```bash
scripts/jira-cli <command>
```

The shim handles nix shell startup automatically. No nix shell command needed.
All `scripts/` paths are relative to this skill's installation directory.
On Windows (Git Bash / MSYS / Cygwin), the shim auto-detects the shell and re-execs itself through WSL transparently; invoke it the same way as on Linux and macOS.
Wrapper stderr may include transient `nix` startup noise before `jira-cli` is ready; only treat it as fatal if the command exits non-zero without a valid response.

**Credentials**:
- Run `jira-cli config` to configure instance metadata and token auth.
- Tokens/secrets are stored in secure backend (`pass`/Keychain), not plaintext config files.
- Existing users can migrate legacy file-based secrets with `jira-cli config --migrate`.
- PAT is the default flow; OAuth is optional for Jira Cloud via `jira-cli config --oauth`.
- Browser-assisted token setup is enabled by default (`--open-token-page`).

## Instance Selection

**Always** pass `--instance techdebt-bot` (the generic bot user). Never use the default instance: that is the developer's own account.

```bash
scripts/jira-cli --instance techdebt-bot --format json search --jql "project = PROJ AND labels = td-fp-0123456789"
```

## Autonomous Protocol (Issue Creation)

This fork has **no confirmation gate**. The user confirmed once, when they ran `dd setup` and saved the Repo Profile (`~/.debtdoctor/profiles/<repo>.yaml`); that profile is the confirmation for every ticket the pipeline creates. Do not ask before writes.

1. **Read-only checks first**
- `scripts/jira-cli --instance techdebt-bot --format json whoami` (preflight already ran it; re-run only if a write fails with 401/403).

2. **Dedup before every create (mandatory)**
- Search `labels = td-fp-<fingerprint>` in the profile's project. If an issue exists, update or comment on it instead of creating a duplicate.
- If the matching issue is resolved as Won't Fix, the fingerprint is suppressed: do nothing.

3. **Create and verify**
- Create with supported `jira-cli create` flags only: `--project`, `--summary`, `--type`, `--description`. Project and type come from the Repo Profile.
- Then `update <KEY> --priority <profile.jira.priorities[Severity]> --field labels=[...]` with `tech-debt`, `td-sev-<severity>`, `td-cat-<category>`, `td-fp-<fingerprint>`, `td-repo-<repo>`. A ticket without its `td-fp-*` label breaks dedup, so treat a failed update as a failed create.
- `epics link --issue <KEY> --epic <EPIC>` unless the Scan runs with the `noEpicLink` fallback.
- Return the key.

## Allowed Commands

Only `search`, `create`, `update`, `comment`, `epics link`, `whoami`. Never `transition`, `assign`, `bulk-update`, `issues delete`, `batch *`, `config`, or anything not on this list, even though the references below document them.

## Workflow

1. Read-only first (`search`, `whoami`)
2. Dedup on `td-fp-<fingerprint>`
3. Execute minimal changes from the allowed list
4. Verify outcome

## Core Commands

The only commands this pipeline uses (see Allowed Commands):
- `search --jql "query" [--limit N] [--fields summary,labels]` - Dedup lookups (`labels = "td-fp-<fp>"`, Won't Fix suppression, Epic by summary)
- `create --project KEY --summary "..." --type TYPE --description "..."` - Create the Ticket or Epic
- `update <KEY> [--summary "..."] [--description "..."] [--priority NAME] [--field labels=[...]]` - Set priority and the full label list right after create
- `comment <KEY> --body "..."` - "Seen again" note on an already-ticketed Fingerprint
- `epics link --issue <KEY> --epic <EPIC-KEY>` - Link the Ticket to the repo's Epic
- `whoami` - Preflight identity check

## JQL Quick Reference

```bash
# By project and status
scripts/jira-cli --format toon --toon-max-items 12 search --jql "project = PROJ AND status = Open"

# Assigned to me
scripts/jira-cli --format toon --toon-max-items 12 search --jql "assignee = currentUser()"

# Recent activity
scripts/jira-cli --format toon --toon-max-items 12 search --jql "updated >= -7d ORDER BY priority DESC"

# Complex queries
scripts/jira-cli --format toon --toon-max-items 12 search --jql "project = PROJ AND (priority = High OR labels = urgent)"
```

## Field Resolution

Custom field IDs are resolved via a layered cache:

1. **Hardcoded baseline** — Sprint, Epic Link, Epic Name, Team(s) built in
2. **Disk cache** — `~/.config/jira-confluence-cli/jira-field-cache-<instance>.json`
3. **Auto-discovery** — on first use of an unknown field name, queries the Jira API and saves the result

**Automatic setup** — `whoami` checks whether the cache file exists. If absent, it fetches all fields and builds the cache transparently (reported in the whoami payload as `field_cache: built (N fields)`). Subsequent `whoami` calls are instant — just a `Path.exists()` check.

**Manual rebuild** (after new custom fields are added to the instance):
```bash
jira-cli fields cache-build
```

**Inspect / debug**:
```bash
jira-cli fields cache-show             # all cached fields
jira-cli fields cache-show "team"      # filter by name
jira-cli fields resolve "Sprint"       # look up a specific field
jira-cli fields resolve "My Custom"    # auto-discovers + caches if not known
```
