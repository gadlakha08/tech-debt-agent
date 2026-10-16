# AGENTS.md

Conventions for humans and coding agents working in this repo. Vocabulary is in [`CONTEXT.md`](CONTEXT.md); decisions in [`docs/adr/`](docs/adr); the hackathon split in [`docs/plan/`](docs/plan).

## Layers and the dependency rule
- `src/domain/`: pure. Zod schemas and ranking math (fingerprint, rubric, cut). **No I/O, no imports from other layers.**
- `src/integrations/` (llm, jira, git), `src/analyzers/`, `src/preflight/`, `src/profile/`: may import only `domain`.
- `src/pipeline/`, `src/report/`: orchestrate the layers above.
- `src/cli/`: thin commander wiring; calls `pipeline`, `preflight`, `profile`.

## Ownership (hackathon)
- **Person A:** `integrations/llm`, `pipeline/`, `report/`, `prompts/`, `templates/`, `cli/commands/scan.ts`.
- **Person B:** `analyzers/`, `integrations/jira`, `integrations/git`, `preflight/`, `profile/`, `skills/`, `plugin/`, `fixtures/`, `cli/commands/{setup,doctor}.ts`.
- **Shared:** `src/domain/schemas.ts` and `src/cli/index.ts`. Ping your partner before changing them.

## Code
- TypeScript, ESM (`"type": "module"`, NodeNext). Relative imports end in `.js`.
- Validate every LLM output and every external JSON with the Zod schema from `domain/schemas.ts`.
- Prompts live in `prompts/*.md`, document skeletons in `templates/`. No large prompt strings in `.ts` files.
- Analyzer thresholds live only in `src/analyzers/config/thresholds.yaml`.
- Tests: Vitest in `test/`, mirroring `src/`. `domain/` must stay fully unit-tested.
- Before pushing: `npm run typecheck && npm test`.

## Hard rules
- **Never write into the scanned repo.** Work in the temp worktree; outputs go to `~/.techdebt/`.
- **Never print or log secrets** (CircuIT token/secret, Jira PAT). `.env` is gitignored; `.env.example` holds names only.
- All LLM calls go through the CircuIT gateway (`integrations/llm`), never directly to OpenAI. Never send `temperature`.
- All Jira calls use `--instance techdebt-bot`. JQL-dedup on `td-fp-<fp>` before every create.
- The preflight admin request is **printed and copied only**, never sent.
- `skills/jira-autonomous/` is pipeline-only and never published or installed globally. Only `plugin/` is published.
