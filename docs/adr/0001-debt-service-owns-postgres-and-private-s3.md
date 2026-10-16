# Debt Service owns a Postgres index and private S3 Dossier store

Dossiers and Debt Items live outside the scanned repositories, so target repos are never flooded with generated docs. A small Debt Service API is the only component with access to Postgres (Debt Items, Fingerprints, Rubric sub-scores, Scan history, Repo Profiles, Jira key mapping) and a versioned private S3 bucket (Dossier markdown). The CLI, Claude Code plugin skills, and the future Webex bot are thin clients of that API. Postgres, not Jira labels, is the source of truth for Fingerprint dedup; labels are a mirror for humans.

## Considered Options

- **Dossiers committed into each target repo**: rejected because it floods repos with docs.
- **A central Git repo of Dossiers**: needs zero infrastructure, but was rejected in favour of a store that is queryable from day one.
- **Confluence**: rejected because the markdown→XHTML round trip degrades Amendments, and Confluence has no attachment support.
- **A CDN in front of S3**: rejected because a Dossier is a map of a codebase's weaknesses and must not be edge-cached or reachable by URL. Agents fetch small documents, so a CDN brings no latency benefit.
- **Clients talking to S3 and the DB directly**: rejected because it would put AWS credentials on every developer laptop and in the bot.
