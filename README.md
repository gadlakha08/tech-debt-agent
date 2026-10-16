# tech-debt-agent

Scans one repository for technical debt, ranks it with a Rubric, and turns the Cut into Jira tickets, each with a Lite Dossier (`context.md`, `impact.md`). Developers then use the `techdebt-*` plugin skills to ask about, plan and implement a ticket.

Deterministic analyzers produce evidence; gpt-5-nano (via the CircuIT gateway) classifies, scores Impact/Risk, writes the Dossier and drives ticketing.

## Quick start
```bash
npm install
cp .env.example .env          # fill in CircuIT + Jira values; never commit .env
npm run dev -- doctor <repo>  # environment + Jira permission check
npm run dev -- setup <repo>   # create the Repo Profile
npm run dev -- scan <path-to-clone> --dry-run
```

## Scripts
| Command | What it does |
|---|---|
| `npm run dev -- <cmd>` | Run the CLI from source |
| `npm run build` | Compile to `dist/` (bin: `techdebt`) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest |

## Layout
See the layout and dependency rule in [`docs/plan/hackathon-plan.md`](docs/plan/hackathon-plan.md#repo-layout) and [`AGENTS.md`](AGENTS.md).

## Structured output (CircuIT)
_TBD after `scripts/probe-circuit.ts`: whether `json_schema` is accepted or forced tool calls are used._
