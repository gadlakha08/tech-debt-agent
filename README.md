# DebtDoctor

Scans one repository for technical debt, ranks it with a Rubric, and turns the Cut into Jira tickets, each with a four-file Dossier (`context.md`, `impact.md`, `design-options.md`, `implementation-plan.md`). Developers then use the `techdebt-*` plugin skills to ask about, plan and implement a ticket.

Deterministic analyzers produce evidence; gpt-5-nano (via the CircuIT gateway) classifies, scores Impact/Risk, writes the Dossier and drives ticketing.

## Prerequisites
- Node 20+, `git`, `python3` (stack summary)
- Java repos: `pmd` 7 (`brew install pmd`) and `mvn`
- `jira-cli` shim (in `skills/jira-autonomous/scripts/`, needs nix and the VPN) with a `techdebt-bot` instance
- Jira access as the generic `techdebt-bot` user only: the `techdebt-bot` jira-cli instance and `DEBTDOCTOR_JIRA_TOKEN` must both be that user's. Preflight blocks the Scan if either belongs to anyone else, and the instance cannot be changed.
- An interactive terminal: preflight asks before falling back or quitting. With stdin piped it prompts on `/dev/tty`; with no terminal at all it stops. Set `DEBTDOCTOR_DEBUG=1` for stack traces on errors. Scans show a live spinner, counter and elapsed time per step (plain start/end lines when output is piped).

## Quick start
```bash
npm install
cp .env.example .env          # fill in CircuIT + Jira values; never commit .env
npm run dev -- doctor <repoPath>  # environment + Jira permission check
npm run dev -- setup <repoPath>   # create the Repo Profile (Jira, Defects, where Scan Reports go; relative folders start from ~)
npm run dev -- scan <path-to-clone> --dry-run
```

## Install as a command
git fetch never prompts during a Scan. If your SSH key has a passphrase, load it once with `ssh-add --apple-use-keychain ~/.ssh/id_ed25519`, otherwise the Scan uses your local `origin/<branch>` and warns.

```bash
npm run build && npm link     # puts `dd` and `debtdoctor` on PATH
debtdoctor doctor <repoPath>
```
macOS ships `/bin/dd`, and `/bin` usually comes before npm's bin folder in PATH, so a bare `dd` may run the system tool. Use `debtdoctor`, or add `alias dd=debtdoctor` to your shell rc (aliases only apply to your interactive shell, so scripts that use the real `dd` are unaffected).

## Scripts
| Command | What it does |
|---|---|
| `npm run dev -- <cmd>` | Run the CLI from source |
| `npm run build` | Compile to `dist/` (bins: `dd`, `debtdoctor`) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest (no tests yet) |
| `npx tsx scripts/dump-evidence.ts <repoPath>` | Run only the analyzers on a temp worktree; writes gitignored `fixtures/local/<repo>.json` |
| `npx tsx scripts/fake-ticket.ts <KEY> [--epic <EPIC>]` | Create one hand-made test ticket (real Jira write) |

## Analyzer thresholds
`src/analyzers/config/thresholds.yaml` is the only threshold config. The ESLint flat config and PMD ruleset are generated from it at run time.

## Layout
See the layout and dependency rule in [`AGENTS.md`](AGENTS.md).

## Structured output (CircuIT)
_TBD after `scripts/probe-circuit.ts`: whether `json_schema` is accepted or forced tool calls are used._
