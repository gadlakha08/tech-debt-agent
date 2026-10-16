# Hackathon Plan: Person A, Pipeline Brain

You own everything that calls gpt-5-nano and all the ranking logic: turning evidence into ranked, ticketed Debt Items.
Partner: **Person B (Edges)** owns the scanned repo, Jira access, preflight, and the developer skills. See [`hackathon-person-b.md`](hackathon-person-b.md).
Full component specs are in [`hackathon-plan.md`](hackathon-plan.md); vocabulary is in [`CONTEXT.md`](../../CONTEXT.md).

## You own

| File | What it does |
|---|---|
| `src/llm/circuit.ts` | CircuIT client: OAuth token cache, `api-key` header, `user` appkey, usage capture |
| `src/llm/loop.ts` | Minimal tool-calling agent loop (max 8 steps, Zod-validated output, 1 retry) |
| `src/classify.ts` | nano: `EvidenceBundle` → `Finding` / `Defect` / `discard` |
| `src/consolidate.ts` | Fingerprint + merge Findings into Debt Items |
| `src/rubric.ts` | Reach / Churn / Effort in code, Impact / Risk by nano, Severity bands |
| `src/cut.ts` | High + Medium, floor 10, cap 15, `--uncap`, `--max N` |
| `src/dossier.ts` | `context.md` + `impact.md` from fixed templates |
| `src/ticketer.ts` | nano agent + `jira-autonomous` skill: Epic, dedup, create, attach |
| `src/report.ts` | Scan Report `report.md` / `report.json` with token + cost per stage |
| `scan` command in `src/cli.ts` | Wires stages 0–10 together |

## Contracts with Person B

**You consume from B:**
- `runAnalyzers(ctx: ScanContext): Promise<EvidenceBundle[]>`. Until it lands (Sync 1), use `fixtures/evidence-admin-mfe.json`.
- `checkout(repoPath): Promise<{ worktree, sha, defaultBranch }>`
- `churn(ctx): Promise<Record<file, commitCount>>`
- `preflight(profile, { interactive }): Promise<{ ok, fallbacks: { noAttach, noEpicLink, noComments } }>`
- `jira.search / create / update / comment / epicLink / attach` from `src/jira/`. Until it lands, stub it with an in-memory fake.
- `skills/jira-autonomous/SKILL.md` (lands D2-1)

**B consumes from you:**
- `getCircuitToken(): Promise<string>`, needed by B's preflight. **Deliver by end of D1-1.**
- Real Jira tickets from your ticketer, needed by B's skills. **Deliver at Sync 3.**

**Shared:** `src/schemas.ts`, written together at kickoff. Ping before changing it.

---

## Kickoff (D1, first 45 min, with B)
- [ ] Scaffold together: `package.json`, `tsconfig`, commander, zod, eslint; push `main`
- [ ] Write `schemas.ts` together: `EvidenceBundle`, `Finding`, `Defect`, `DebtItem`, `RubricScores`, `Dossier`, `RepoProfile`, `ScanContext`
- [ ] Agree the interface signatures above, and put empty exported stubs in place so both sides compile
- [ ] Wait for B to push `fixtures/evidence-admin-mfe.json` (~20 bundles)

## Day 1

### D1-1: CircuIT client + agent loop (~2 h)
- [ ] `circuit.ts`:
  - [ ] Token fetch: POST to `CIRCUIT_LLM_TOKEN_URL` with Basic `clientId:clientSecret` and `grant_type=client_credentials`. Cache the token and refresh it 120 s before `expires_in` runs out.
  - [ ] Call `POST {CIRCUIT_LLM_CHAT_URL}/openai/deployments/{CIRCUIT_LLM_DEPLOYMENT}/chat/completions`. Send header `api-key: <token>` and body `user: JSON.stringify({ appkey })`. **Never send `temperature`.**
  - [ ] Capture `usage.prompt_tokens` / `completion_tokens` per call, tagged by stage name
  - [ ] Export `getCircuitToken()` for B and push it
- [ ] **Probe structured output:** send one request with `response_format: { type: "json_schema", ... }`. If it's rejected, use a forced tool call (`tool_choice` = one function whose parameters are the schema). Write the result in the README.
- [ ] `loop.ts`: `runAgent({ system, user, tools, outputSchema, maxSteps = 8 })`:
  - [ ] executes tool calls and appends the results
  - [ ] validates the final output with Zod, retrying once with the validation error
  - [ ] has read-only tools ready: `read_file`, `grep`, `list_files`
- **Done when:** a 3-line script makes nano return a valid Zod object through `runAgent`.

### D1-2: Classify + consolidate (~2 h)
- [ ] `classify.ts`:
  - [ ] Sends one bundle per call: snippet capped at about 150 lines, plus the stack summary from `ctx`
  - [ ] Output: `Finding { title, description, evidence[] }`, `Defect { kind, description }`, or `discard { reason }`
  - [ ] The prompt tells it: security issues and bugs → `Defect`, never `Finding`
  - [ ] Runs up to 8 calls in parallel with `p-limit`
- [ ] `consolidate.ts`:
  - [ ] `fingerprint = sha1(category | rule | normalisedSymbolPath).slice(0, 10)`. Normalise to module/package plus class/function, **never line numbers**.
  - [ ] Merge Findings that share a Fingerprint into one `DebtItem` and union their evidence
- **Done when:** running against the fixtures gives a list of Debt Items, with the Defects kept separate.

### ✅ Sync 1 (~15 min)
- [ ] Merge both branches. Run classify + consolidate on **B's real `admin-mfe` evidence**.
- [ ] Tell B about noisy bundle types, e.g. "TODO bundles are 80% discard, raise the threshold".

### D1-3: Rubric + Cut + Report (~2 h)
- [ ] `rubric.ts`:
  - [ ] **Reach**: fan-in percentile from `bundle.metrics.fanIn` → 1–5
  - [ ] **Churn**: commit-count percentile of the affected files, from B's `churn()` → 1–5
  - [ ] **Effort**: affected LOC <50 → S, <300 → M, <1000 → L, else XL
  - [ ] **Impact, Risk**: one nano call per Debt Item. Choose 1–5 from the anchored descriptions and give a one-line justification citing the evidence.
  - [ ] **Severity** = Impact + Reach + Churn + Risk: ≥15 High, ≥9 Medium, else Low
- [ ] `cut.ts`:
  - [ ] Sort by Severity, then score, then smaller Effort
  - [ ] Take all High and Medium. If that's fewer than 10, top up with Low. Cap at 15 unless `--uncap` or `--max N`.
- [ ] `report.ts`:
  - [ ] Writes `~/.techdebt/runs/<repo>/<ts>/report.{md,json}`
  - [ ] Contents: the Cut (ticket keys filled in later), the items below the Cut, the Defect count (and the list if `--include-defects`), Scanned Commit SHA, tokens + cost per stage (price per 1M tokens comes from the profile)
- [ ] `scan` command: stages 0–7 + report, with `--dry-run` making no Jira calls
- **Done when:** `techdebt scan --dry-run <admin-mfe>` writes a report with a ranked Cut.

### ✅ Sync 2: evening (~1–2 h, together)
- [ ] `techdebt doctor` (B's) passes
- [ ] `techdebt scan --dry-run` on `cspe-csp-admin-mfe`, then on `cspe-sc-feature-service`
- [ ] Fix what breaks. Note analyzer noise for B to tune tomorrow.

**Day 1 exit:** the feature-service dry run prints 10–15 ranked Debt Items with evidence, scores and token cost.

## Day 2

### D2-1: Lite Dossier (~2 h)
- [ ] `dossier.ts`: one nano call per Debt Item in the Cut, filling fixed templates:
  - [ ] `context.md`: **What**, **Where** (files, symbols), **Evidence** (tool output), **Why it is debt**, **Scanned Commit**
  - [ ] `impact.md`: **Rubric scores + justifications**, **Severity**, **Effort**, **Who / what is affected**, **Risk of leaving it**
  - [ ] Zod check that every required heading is present; regenerate once if one is missing
  - [ ] Save copies to `~/.techdebt/runs/<repo>/<ts>/<fingerprint>/`
- **Done when:** every item in the Cut has both files with all their headings.

### D2-2: Ticketer + first live scan (~2 h)
- [ ] `ticketer.ts`, using B's `jira/` client and the `skills/jira-autonomous/SKILL.md` text as the system prompt:
  - [ ] Find the Epic `<repo>-tech-debts` by JQL, or create it
  - [ ] For each Debt Item:
    - [ ] The agent **must JQL-search `labels = td-fp-<fp>` first**. If a ticket exists, comment on it (skip the comment if `noComments`).
    - [ ] Otherwise create a **Task** with:
      - priority High → Major, Medium → Minor, Low → Trivial
      - labels `tech-debt`, `td-sev-*`, `td-cat-*`, `td-fp-*`, `td-repo-*`
      - the Epic link (skip if `noEpicLink`)
      - a wiki-markup description with the summary, why it matters, Severity + scores, evidence, Fingerprint, Scanned Commit SHA, and "Run `/techdebt-ask <KEY>`"
  - [ ] **Code, not the agent,** attaches `context.md` + `impact.md`. If `noAttach`, inline them into the description instead.
  - [ ] Write ticket keys into the Scan Report
- [ ] **First live scan into `<JIRA-KEY>`** on `cspe-sc-feature-service`
- **Done when:** the Epic holds 10–15 tickets with labels, priority and attachments.

### ✅ Sync 3 (~20 min)
- [ ] Give B the ticket keys. B runs `/techdebt-ask` and `/techdebt-implement` on real tickets.
- [ ] **Re-run the scan → 0 new tickets** (comments only). This is the demo's credibility moment.

### D2-3: Tune + fallback recording (~2 h)
- [ ] Tune the prompts and thresholds using the live run
- [ ] Polish the Scan Report: a clear Cut table, a "this scan cost $X" line, the Defect count
- [ ] **Record a full scan** (terminal recording + report) as the demo fallback

### D2-4: Rehearse (together)
- [ ] Run the demo twice. Freeze code 1 h before presenting.
- **Your demo parts:** step 2 (live scan), step 3 (Scan Report), step 7 (re-run shows 0 duplicates).

---

## If you fall behind
- Hand `report.ts` to B (it's pure formatting from `DebtItem[]`).
- Drop the Impact/Risk nano call and default both to 3. Severity then comes only from Reach + Churn.

## Risks you own
| Risk | Mitigation |
|---|---|
| Gateway rejects `json_schema` | Forced tool call (decided in D1-1) |
| nano gives low-quality classifications | Small bundles, anchored prompts, allow `discard`, tell B which analyzers are noisy |
| Duplicate tickets on re-run | JQL dedup is mandatory in the agent prompt **and** checked again in code before `create` |
| Scan too slow live | `p-limit(8)`, recorded fallback run |
