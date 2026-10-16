# Hackathon Plan: Tech Debt Agent (2 days)

Vocabulary follows [`CONTEXT.md`](../../CONTEXT.md). Target-architecture decisions live in [`docs/adr/`](../adr/). This plan deliberately deviates from them where noted (see *Deviations*).

## Goal and demo story

> "Point the agent at a repo. A few minutes later the Jira Epic holds 10–15 ranked tech-debt tickets, each with `context.md` and `impact.md` attached. A developer runs `/techdebt-ask` on one ticket and asks why it matters, then runs `/techdebt-implement` and gets a PR."

Success = that story works end to end, live, on `cspe-sc-feature-service`.

## Constraints

- **2 days.**
- **LLM**: CircuIT gateway, **gpt-5-nano only**, Chat Completions. Cisco code never leaves CircuIT.
- **Store**: **Jira is the store.** There is no DB and no MCP server. Run artifacts live in local files under `~/.techdebt/`, never inside the scanned repo.
- **Plugin skills** (`ask`, `implement`, `grill-implement`) run in each user's own Claude Code or Codex, on their own model and credentials.
- **Jira**: project `<JIRA-KEY>`, written to by a **generic service user**. It gets its own jira-cli instance (`--instance techdebt-bot`) and its PAT in env `TECHDEBT_JIRA_TOKEN` for REST attachment upload. All tickets for a repo go into one Epic named **`<repo>-tech-debts`**.

## Architecture (hackathon)

```
techdebt scan <repo>
  │
  ├─ 0. Preflight    CircuIT, jira-cli, tools, Jira permissions → block | fallback | go [code]
  ├─ 1. Checkout     clean worktree of origin/main|master → Scanned Commit SHA
  ├─ 2. Knowledge    acquire-codebase-knowledge/scripts/scan.py → stack facts (no nano)
  ├─ 3. Analyzers    deterministic tools per Debt Category → evidence bundles      [code]
  ├─ 4. Classify     nano: evidence bundle → Finding | Defect | discard (Zod)       [nano]
  ├─ 5. Consolidate  group Findings by Fingerprint → Debt Items                     [code]
  ├─ 6. Rubric       Reach/Churn/Effort in code; Impact/Risk by nano → Severity     [code+nano]
  ├─ 7. Cut          all High+Medium, floor 10, cap 15 (--uncap / --max N)          [code]
  ├─ 8. Lite Dossier nano writes context.md + impact.md from fixed templates        [nano]
  ├─ 9. Ticketer     nano agent + forked jira-autonomous skill (dedup by JQL)       [nano]
  │                  + attachment upload via Jira REST                              [code]
  └─10. Scan Report  ~/.techdebt/runs/<repo>/<ts>/report.{md,json}, tokens + cost  [code]

User side (their own model):
  /techdebt-ask KEY            reads ticket + attachments + current code; generates plan if missing
  /techdebt-implement KEY      plan → branch → code → tests → PR → Jira transition
  /techdebt-grill-implement KEY  grills on edge cases → amended plan comment → implement
```

## Repo layout

Single TypeScript package for speed, layered so the two people rarely touch the same folder. Conventions are in [`AGENTS.md`](../../AGENTS.md).

```
tech-debt-agent/
├── CONTEXT.md  AGENTS.md  README.md
├── package.json  tsconfig.json  .env.example
├── docs/adr/  docs/plan/
├── src/
│   ├── cli/                       (shared) commander entry; each person registers only their own commands
│   │   ├── index.ts
│   │   └── commands/              scan.ts (A), setup.ts (B), doctor.ts (B)
│   ├── domain/                    (shared, pure: no I/O) Zod schemas + ranking math
│   │   ├── schemas.ts             EvidenceBundle, Finding, Defect, DebtItem, RubricScores, Dossier, RepoProfile, ScanContext
│   │   ├── fingerprint.ts         sha1(category|rule|symbolPath).slice(0,10)
│   │   ├── rubric.ts              Reach / Churn / Effort, Severity bands
│   │   └── cut.ts                 High + Medium, floor 10, cap 15
│   ├── pipeline/                  (A) stage orchestration
│   │   ├── run-scan.ts            stages 0–10
│   │   └── stages/                classify, consolidate, score (nano Impact/Risk), dossier, ticket
│   ├── analyzers/                 (B) deterministic evidence → EvidenceBundle[]
│   │   ├── index.ts               runAnalyzers(ctx), dispatch by stack
│   │   ├── common/                jscpd, todo-grep, hardcoded-urls
│   │   ├── ts/                    eslint, madge, npm-outdated, missing-tests
│   │   ├── java/                  pmd, imports-graph, maven-deps, missing-tests, actuator
│   │   └── config/                thresholds.yaml, eslint.config.mjs, pmd-ruleset.xml
│   ├── integrations/              adapters to the outside world
│   │   ├── llm/                   (A) circuit-token, circuit-client, agent-loop, usage
│   │   ├── jira/                  (B) jira-cli, jira-rest, index.ts (JiraClient interface + in-memory fake)
│   │   └── git/                   (B) worktree, churn
│   ├── preflight/                 (B) checks, admin-request (print + copy), interactive prompt
│   ├── profile/                   (B) Repo Profile (~/.techdebt/profiles/<repo>.yaml)
│   └── report/                    (A) Scan Report md/json + cost
├── prompts/                       (A) nano prompts as .md: classify, score-impact-risk, dossier-*, ticketer
├── templates/                     (A) dossier/context.md, dossier/impact.md, jira/description.wiki
├── skills/jira-autonomous/        (B) forked jira-issues, confirmation gate removed (pipeline only, never published)
├── plugin/                        (B) published via ai-essentials
│   ├── .claude-plugin/plugin.json
│   └── skills/                    techdebt-ask, techdebt-implement, techdebt-grill-implement
├── fixtures/                      evidence + debt-item + ticket JSON so both people can work offline from each other
├── test/                          Vitest: domain/ (pure), analyzers/ (against samples)
└── scripts/                       probe-circuit.ts, fake-ticket.ts
```

**Dependency rule:** `domain` imports nothing. `integrations`, `analyzers`, `preflight`, `profile` import only `domain`. `pipeline` and `report` import those. `cli` imports `pipeline`, `preflight`, `profile`.

Deps: `commander`, `zod` (v4, built-in JSON Schema), `execa`, `p-limit`, `yaml`, `clipboardy`, `jscpd`, `madge`, `eslint`. Dev: `typescript`, `tsx`, `vitest`. The CircuIT client uses plain `fetch` (custom `api-key` header + appkey in the body), so no `openai` SDK.

## Component specs

### CircuIT client (`src/integrations/llm/circuit-client.ts`)
- OAuth client-credentials POST to `id.cisco.com` token URL. Cache the token and refresh it 120 s before expiry (same pattern as `CircuitTokenService` in `cspe-sc-self-service`).
- `POST https://chat-ai.cisco.com/openai/deployments/gpt-5-nano/chat/completions`, with header `api-key: <token>` and body `user: {"appkey": ...}`.
- Env: `CIRCUIT_LLM_CLIENT_ID`, `CIRCUIT_LLM_CLIENT_SECRET`, `CIRCUIT_LLM_APP_KEY`, `CIRCUIT_LLM_TOKEN_URL`, `CIRCUIT_LLM_CHAT_URL`, `CIRCUIT_LLM_DEPLOYMENT`.
- **Don't send `temperature`.** gpt-5 family models may reject it.
- Prefer `response_format: json_schema`. If the gateway rejects it, fall back to a single forced tool call whose parameters are the schema.
- Record `usage.prompt_tokens` and `usage.completion_tokens` per call, tagged by stage, for the Scan Report.

### Agent loop (`src/integrations/llm/agent-loop.ts`)
Plain chat-completions tool loop: max 8 steps, Zod-validated final output, one retry when validation fails. Tools are in-process functions: `read_file`, `grep`, `list_files`, `run_jira_cli` (ticketer only, with an allow-list of subcommands).

### Analyzers (`src/analyzers/`)
Each analyzer emits `EvidenceBundle { category, rule, symbolPath, files[], metrics, snippet }`.

| Category | TS (`admin-mfe`) | Java (`feature-service`) |
|---|---|---|
| Code | ESLint `complexity>10`, `max-depth>3`, `max-lines-per-function>50`, `max-lines>500`; `jscpd`; TODO/FIXME/HACK | PMD quickstart subset (CyclomaticComplexity, GodClass, ExcessiveMethodLength, NcssCount); `jscpd`; TODO/FIXME/HACK |
| Architecture | `madge --circular --json`; fan-in/fan-out from the madge graph | package import graph from `import` lines; cycles and fan-in |
| Dependencies | `npm outdated --json` (major versions behind, deprecated) | `mvn -q versions:display-dependency-updates`. **Fallback:** parse `pom.xml` and compare against a small known-EOL list |
| Testing | source files with no matching `*.spec/test.*`; coverage summary if present | `src/main` classes with no `*Test` in `src/test`; JaCoCo XML if present |
| Ops/config | hardcoded `http(s)://`/`localhost` in non-test src; secret-shaped literals → **Defect** | same; missing actuator health/metrics config |

Churn input for every category: `git log --since=180.days --name-only` → commits per file.

### Classify (`src/pipeline/stages/classify.ts`)
Nano gets one bundle at a time (snippet capped at around 150 lines) plus the `scan.py` stack summary. It returns `Finding { title, description, evidence[] }` or `Defect { kind, description }` or `discard { reason }`. Run 8 in parallel with `p-limit`.

### Fingerprint and consolidation (`src/domain/fingerprint.ts`, `src/pipeline/stages/consolidate.ts`)
`fingerprint = sha1(category | rule | normalisedSymbolPath).slice(0, 10)`. The symbol path uses package/module plus class/function, **never line numbers**. Findings that share a Fingerprint merge into one Debt Item.

### Rubric (`src/domain/rubric.ts`, `src/pipeline/stages/score.ts`)
Each dimension scores 1–5. Severity = Impact + Reach + Churn + Risk (4–20): **High ≥ 15, Medium ≥ 9, otherwise Low.**
- **Reach** (code): fan-in percentile across the repo → 1–5.
- **Churn** (code): commit-count percentile of the affected files → 1–5.
- **Effort** (code, tie-break only): affected LOC <50 → S, <300 → M, <1000 → L, otherwise XL.
- **Impact, Risk** (nano): pick 1–5 from anchored descriptions and give a one-line justification that cites the evidence.

### Cut (`src/domain/cut.ts`)
Sort by Severity, then score, then smaller Effort first. Take all High and Medium. If that gives fewer than 10, fill up to 10 from Low. Cap at 15 unless `--uncap` or `--max N` is passed. Everything else goes into the Scan Report only.

### Lite Dossier (`src/pipeline/stages/dossier.ts`)
Nano fills fixed templates, validated by Zod for required headings.
- **`context.md`**: What, Where (files, symbols), Evidence (tool output), Why it is debt, Scanned Commit.
- **`impact.md`**: Rubric scores with justifications, Severity, Effort, who and what is affected, risk of leaving it.

Copies are kept in `~/.techdebt/runs/<repo>/<ts>/<fingerprint>/`.

### Ticketer (`src/pipeline/stages/ticket.ts`)
1. Ensure the Epic `<repo>-tech-debts` exists. Find it by JQL (`issuetype = Epic AND summary ~ "<repo>-tech-debts"`), otherwise create it. All jira-cli calls use `--instance techdebt-bot`.
2. Per Debt Item, the nano agent loop gets the forked `jira-autonomous` skill text and the `run_jira_cli` tool. **It must JQL-search `labels = td-fp-<fp>` first.** If a ticket exists, it comments instead of creating. Otherwise it creates a **Task** with:
   - Priority: High → Major, Medium → Minor, Low → Trivial
   - Labels: `tech-debt`, `td-sev-<sev>`, `td-cat-<cat>`, `td-fp-<fp>`, `td-repo-<repo>`
   - Epic link
   - Description (wiki markup): summary, why it matters, Severity and scores, evidence list, Fingerprint, Scanned Commit SHA, and "Run `/techdebt-ask <KEY>` to explore".
3. Code (not the agent) uploads `context.md` and `impact.md` via `POST /rest/api/2/issue/{key}/attachments` (`X-Atlassian-Token: no-check`).
4. Write the ticket key into the Scan Report.

### Scan Report (`src/report/`)
`report.md` + `report.json` contain:
- the Cut with ticket keys
- items below the Cut with scores
- the Defect count (and a list if `--include-defects` is passed)
- Scanned Commit
- tokens and cost per stage, using the price per 1M tokens set in the profile

### Repo Profile (`src/profile/`)
`techdebt setup <repo>` asks interactively for the Jira project, Epic name (default: `<repo>-tech-debts`), issue type, and the Defect default, then saves them to YAML. Later scans read the YAML and run with no questions.

### Preflight (`src/preflight/`, `techdebt doctor`)
Runs inside `setup`, at the start of every `scan`, and on its own as `techdebt doctor`. It finishes before any nano call is made.

**Environment checks:** CircuIT token fetch succeeds; jira-cli instance `techdebt-bot` passes `whoami`; `git`, `jscpd`, `madge` are available; PMD and `mvn` are available for Java repos; the default branch can be checked out.

**Jira checks:** one call, `GET /rest/api/2/mypermissions?projectKey=<KEY>&permissions=BROWSE_PROJECTS,CREATE_ISSUES,ADD_COMMENTS,EDIT_ISSUES,CREATE_ATTACHMENTS`.

| Permission | Missing → |
|---|---|
| `BROWSE_PROJECTS`, `CREATE_ISSUES` | **Block** |
| `ADD_COMMENTS` | Fallback: list existing tickets in the Scan Report instead of commenting |
| `EDIT_ISSUES` | Fallback: create tickets without Epic link / labels |
| `CREATE_ATTACHMENTS` | Fallback: inline `context.md` / `impact.md` into the description |

For each gap, preflight **prints and copies to the clipboard** a ready-to-send admin request, e.g. *"Please add user techdebt-bot to the Developers role in project CSPE (needs: Create Attachments)."* It never sends the request itself.

- **Interactive:** `[r]` re-check after the admin grants it, `[i]` use the fallback, `[q]` quit. Blocking gaps offer only `[r]` and `[q]`.
- **Headless mode:** post-hackathon (for CI). The hackathon build is interactive only.

### Plugin skills (`plugin/skills/`)
- **`techdebt-ask`**:
  1. Fetch the ticket via `jira-issues` and download the attachments.
  2. Read the current code at the cited paths.
  3. If no `[techdebt-plan]` comment exists, generate `design-options` and `implementation-plan`, show them, and post them as a `[techdebt-plan v1]` comment once the user confirms.
  4. Answer the user's questions.
- **`techdebt-implement`**:
  1. Load the ticket, attachments and latest plan comment. Generate the plan if it's missing.
  2. **Drift check**: `git diff --stat <scannedSHA>..HEAD -- <evidence files>`. Stop and ask if anything changed.
  3. Create branch `td/<KEY>-<slug>`.
  4. Work through the plan step by step, running the repo's tests and lint as it goes.
  5. Open the PR with `gh pr create` and link the ticket.
  6. Transition the ticket to In Progress, then In Review.
- **`techdebt-grill-implement`**: grills the user on edge cases against the context and plan, posts the amended plan as `[techdebt-plan v2]`, then hands off to `techdebt-implement`.

## Team split and schedule (2 people)

The split follows a seam that keeps the two people mostly independent: **Person A owns the pipeline brain** (everything that calls nano, plus the ranking logic). **Person B owns the edges**: everything that touches the scanned repo, Jira, or the developer.

| | **Person A: Pipeline brain** | **Person B: Edges** |
|---|---|---|
| Owns | `src/integrations/llm/circuit-client.ts`, `src/integrations/llm/agent-loop.ts`, `src/pipeline/stages/classify.ts`, `src/pipeline/stages/consolidate.ts`, `src/pipeline/stages/score.ts`, `src/domain/fingerprint.ts`, `src/domain/rubric.ts`, `src/domain/cut.ts`, `src/pipeline/stages/dossier.ts`, `src/report/`, `src/pipeline/stages/ticket.ts`, the `scan` command | `src/integrations/git/worktree.ts`, `src/analyzers/*`, `src/integrations/jira/*`, `src/integrations/git/churn.ts`, `src/preflight/`, `src/profile/`, the `setup` and `doctor` commands, `skills/jira-autonomous/`, `plugin/skills/*` |
| Consumes from the other | `EvidenceBundle[]` (from analyzers), `src/integrations/jira/` client (for the ticketer) | `src/integrations/llm/circuit-client.ts` token fetch (for preflight), real tickets (to test the skills) |
| Works offline against | `fixtures/evidence-*.json` until real analyzers land | A hand-made ticket in `<JIRA-KEY>` until the ticketer lands |

**Shared file:** only `src/domain/schemas.ts`, which both people write together in kickoff. After that, changes go through a quick ping. In `src/cli/` each person registers only their own commands.

**Git:** short-lived branches `a/<topic>` and `b/<topic>`, merged to `main` at every ✅ sync point.

### Kickoff (D1, first 45 min, together)
1. Scaffold the repo (TS, commander, zod, eslint config) and push `main`.
2. Write `src/domain/schemas.ts`: `EvidenceBundle`, `Finding`, `Defect`, `DebtItem`, `RubricScores`, `Dossier`, `RepoProfile`, `ScanContext`.
3. Agree the two cross-person interfaces:
   - `runAnalyzers(ctx: ScanContext): Promise<EvidenceBundle[]>` (B → A)
   - `jira.search / create / update / comment / epicLink / attach / myPermissions` (B → A)
4. B commits `fixtures/evidence-admin-mfe.json`, about 20 hand-written bundles across all 5 categories, so A can start immediately.

### Day 1: a ranked Cut from a dry run

| Block (~2 h) | Person A | Person B |
|---|---|---|
| D1-1 | `src/integrations/llm/circuit-client.ts`: token cache, `api-key` header, `user` appkey, usage capture. **Probe whether nano accepts `json_schema`** and pick the structured-output strategy. `src/integrations/llm/agent-loop.ts` | `src/integrations/git/worktree.ts` (worktree of default branch, SHA), `scan.py` wiring, churn from `git log`. `src/integrations/jira/jira-cli.ts` + `src/integrations/jira/jira-rest.ts` (`myPermissions` first) |
| D1-2 | `src/pipeline/stages/classify.ts` + `src/pipeline/stages/consolidate.ts` (Fingerprint), run against fixtures | TS analyzers on `admin-mfe`: ESLint, jscpd, madge, npm outdated, tests, ops. Replace the fixture with **real evidence JSON** |
| ✅ Sync 1 | Merge. A runs classify on B's real `admin-mfe` evidence. | ← |
| D1-3 | `src/domain/rubric.ts` + `src/pipeline/stages/score.ts` (Reach/Churn/Effort in code, Impact/Risk by nano), `src/domain/cut.ts`, `src/report/` + cost | Java analyzers on `feature-service`: PMD, jscpd, import graph, mvn/pom, tests, ops. `src/preflight/` + `techdebt doctor` |
| ✅ Sync 2 (eve) | **Together:** `techdebt doctor`, then `techdebt scan --dry-run` on `admin-mfe`, then on `feature-service`. Fix what breaks. | ← |

**Day 1 exit:** `techdebt scan --dry-run <feature-service>` prints a ranked Cut of 10–15 Debt Items with evidence, scores and token cost, and `techdebt doctor` reports Jira permission status.

### Day 2: tickets, skills, PR

| Block (~2 h) | Person A | Person B |
|---|---|---|
| D2-1 | `src/pipeline/stages/dossier.ts`: `context.md` + `impact.md` templates, Zod heading checks | `src/profile/` + `techdebt setup` (runs preflight). Fork `jira-issues` → `skills/jira-autonomous/`. Create one hand-made test ticket. Start `techdebt-ask` against it |
| D2-2 | `src/pipeline/stages/ticket.ts`: Epic find/create, JQL dedup, create Task, labels, priority, attachments (with fallbacks from preflight). **First live scan into `<JIRA-KEY>`** | Finish `techdebt-ask` (plan generation + `[techdebt-plan v1]` comment). `techdebt-implement` (drift check, branch, tests, PR, transition) |
| ✅ Sync 3 | B runs `ask` and `implement` on A's **real** tickets. A re-runs the scan to prove **0 duplicates**. | ← |
| D2-3 | Tune analyzer noise from the live run, polish the Scan Report, **record a fallback scan** | `techdebt-grill-implement`. Produce the **real PR** for the chosen demo ticket |
| D2-4 | **Together:** rehearse the demo twice. Freeze code 1 h before presenting. | ← |

### If one person falls behind
- **A behind:** B takes `src/report/` (pure formatting from `DebtItem[]`).
- **B behind:** A takes the Java Architecture analyzer or drops it (cut list #2). `grill-implement` is dropped first in all cases.

## Demo script (≈7 min)

1. *(30 s)* Problem: debt grows invisibly, and nobody has time to inventory it.
2. *(90 s)* Run `techdebt scan ~/…/cspe-sc-feature-service` live, or replay a recorded run if the network is slow.
3. *(60 s)* Open the Scan Report: the Cut, Severity bands, Defect count, and "this scan cost $X".
4. *(60 s)* Open the `cspe-sc-feature-service-tech-debts` Epic: tickets with priority, labels, and `context.md`/`impact.md` attached.
5. *(60 s)* Run `/techdebt-ask <KEY>` and ask "why is this High?" and "what breaks if we ignore it?"
6. *(90 s)* Run `/techdebt-implement <KEY>`: drift check, then the plan, then the PR link.
7. *(30 s)* Re-run the scan to show **0 duplicate tickets**. Then the roadmap: web UI, backend, Webex bot.

## Cut list: drop in this order if behind

1. `techdebt-grill-implement`
2. Java Architecture analyzer (keep TS)
3. `mvn versions` (use the `pom.xml` fallback)
4. `techdebt setup` interactive prompts (hand-write the YAML); preflight `[r]` re-check loop (keep the checks and the printed message)
5. REST attachment upload (inline `context.md`/`impact.md` into the description instead)
6. Live implement PR (show a pre-recorded one)

**Never cut:** Fingerprint dedup and the Scan Report. Re-running without duplicates is the credibility moment.

## Risks

| Risk | Mitigation |
|---|---|
| Gateway rejects `json_schema` response format | Forced tool call carrying the schema (verify in D1-1) |
| nano classifies noisy evidence poorly | Small bundles, anchored prompts, `discard` allowed; tune thresholds in D2-1 |
| `mvn` slow or no network | `pom.xml` parsing fallback |
| Generic user lacks Jira permissions | Preflight catches it before the scan, prints the admin request, offers fallbacks |
| Fewer than 10 real Debt Items on a small repo | The Cut floor fills from Low; demo on `feature-service`, not `admin-mfe` |
| Scan takes too long live | Run 8 nano calls in parallel; pre-recorded fallback run |

## Deviations from the target architecture (deliberate)

| Target (ADR) | Hackathon | Why |
|---|---|---|
| Debt Service + Postgres + private S3 (ADR-0001) | Jira + local `~/.techdebt/` files | 2 days; the expansion brings in a proper UI backend and Webex bot |
| One MCP server with stage-scoped tokens (ADR-0003) | In-process tool functions; `run_jira_cli` allow-list | No external runtimes to share tools with yet |
| Agent-written design options and implementation plan at scan time | Generated on first user-skill run, posted as a Jira comment (ADR-0005) | nano is too weak for design work; users bring strong models |

## Open before kickoff

- [ ] `<JIRA-KEY>`: Jira project for the tickets
- [ ] Generic Jira user provisioned; PAT configured as jira-cli instance `techdebt-bot` and in `TECHDEBT_JIRA_TOKEN`. `techdebt doctor` will report any missing permissions and print the admin request
- [ ] Who is Person A and who is Person B
- [ ] CircuIT creds exported locally
- [ ] PMD and Maven available on the demo machine
