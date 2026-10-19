# AGENTS.md

Conventions for humans and coding agents working in this repo. Vocabulary is in [`CONTEXT.md`](CONTEXT.md); decisions in [`docs/adr/`](docs/adr).

## Layers and the dependency rule
- `src/domain/`: pure. Zod schemas and ranking math (fingerprint, rubric, cut). **No I/O, no imports from other layers.**
- `src/integrations/` (llm, jira, git), `src/analyzers/`, `src/profile/`: may import only `domain`.
- `src/preflight/`: may also import `integrations`, because its job is to probe them (CircuIT token, `whoami`, `myPermissions`).
- `src/shell.ts` (subprocess runner), `src/paths.ts` (`~/.debtdoctor`, package root) and `src/prompts.ts` (loads `prompts/`) are leaf utilities any layer except `domain` may import.
- `src/pipeline/`, `src/report/`: orchestrate the layers above.
- `src/cli/`: thin commander wiring; calls `pipeline`, `preflight`, `profile`.

## Ownership (hackathon)
- **Part 1:** `integrations/llm`, `pipeline/`, `report/`, `prompts/`, `cli/commands/scan.ts`.
- **Part 2:** `analyzers/`, `integrations/jira`, `integrations/git`, `preflight/`, `profile/`, `skills/`, `plugin/`, `fixtures/`, `cli/commands/{setup,doctor}.ts`.
- **Shared:** `src/domain/schemas.ts` and `src/cli/index.ts`. Ping your partner before changing them.

## Code
- TypeScript, ESM (`"type": "module"`, NodeNext). Relative imports end in `.js`.
- Validate every LLM output and every external JSON with the Zod schema from `domain/schemas.ts`.
- Prompts, Dossier skeletons and the Jira description live in `prompts/` and are loaded with `renderPrompt()`. No prompt or document text in `.ts` files.
- Analyzer thresholds live only in `src/analyzers/config/thresholds.yaml`.
- Tests: none for now; they will be reintroduced later (Vitest in `test/`, mirroring `src/`).
- Before pushing: `npm run typecheck && npm test`.

## Hard rules
- **Never write into the scanned repo.** Work in the temp worktree; outputs go to `~/.debtdoctor/` (Scan Reports to the profile's `reportsDir` if set, which must be outside the scanned repo).
- **Never print or log secrets** (CircuIT token/secret, Jira PAT). `.env` is gitignored; `.env.example` holds names only.
- All LLM calls go through the CircuIT gateway (`integrations/llm`), never directly to OpenAI. Never send `temperature`.
- All Jira calls use `--instance techdebt-bot`. JQL-dedup on `td-fp-<fp>` before every create.
- The preflight admin request is **printed and copied only**, never sent.
- `skills/jira-autonomous/` is pipeline-only and never published or installed globally. Only `plugin/` is published.
