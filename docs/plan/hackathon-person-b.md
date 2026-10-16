# Hackathon Plan: Person B, Edges

You own everything that touches the outside world: the scanned repo, the analysis tools, Jira access, preflight, the setup flow, and the developer-facing skills.
Partner: **Person A (Pipeline Brain)** owns everything that calls gpt-5-nano, plus ranking and ticketing. See [`hackathon-person-a.md`](hackathon-person-a.md).
Full component specs are in [`hackathon-plan.md`](hackathon-plan.md); vocabulary is in [`CONTEXT.md`](../../CONTEXT.md).

## You own

| File | What it does |
|---|---|
| `src/integrations/git/worktree.ts`, `churn.ts` | Clean worktree of `origin/main` or `origin/master`, Scanned Commit SHA, churn from `git log` |
| `src/analyzers/*` | Deterministic evidence per Debt Category, for TS and Java; thresholds in `src/analyzers/config/thresholds.yaml` |
| `src/integrations/jira/jira-cli.ts` | jira-cli runner (`--instance techdebt-bot`, subcommand allow-list) |
| `src/integrations/jira/jira-rest.ts` | `mypermissions`, attachment upload (`TECHDEBT_JIRA_TOKEN`) |
| `src/preflight/` | Environment + Jira permission checks; prints and copies the admin request |
| `src/profile/` | Repo Profile YAML in `~/.techdebt/profiles/<repo>.yaml` |
| `src/cli/commands/setup.ts`, `src/cli/commands/doctor.ts` | Interactive setup; standalone preflight |
| `skills/jira-autonomous/` | Fork of `jira-issues` with the confirmation gate removed (pipeline only) |
| `plugin/skills/techdebt-ask/` | Q&A on a ticket; generates the plan if it's missing |
| `plugin/skills/techdebt-implement/` | Drift check → branch → code → tests → PR → Jira transition |
| `plugin/skills/techdebt-grill-implement/` | Grill on edge cases → amended plan → implement |
| `fixtures/` | Hand-written evidence so A can start before the analyzers exist |

## Contracts with Person A

**A consumes from you:**
- `fixtures/evidence-admin-mfe.json`, about 20 bundles across all 5 categories. **Push at kickoff.**
- `runAnalyzers(ctx: ScanContext): Promise<EvidenceBundle[]>`. **Real TS output by Sync 1, Java by Sync 2.**
- `checkout(repoPath): Promise<{ worktree, sha, defaultBranch }>` and `churn(ctx): Promise<Record<file, commitCount>>`, **by end of D1-1**
- `jira.search / create / update / comment / epicLink / attach` from `src/integrations/jira/`, **by end of D1-3**
- `preflight(profile, { interactive }): Promise<{ ok, fallbacks: { noAttach, noEpicLink, noComments } }>`, **by Sync 2**
- `skills/jira-autonomous/SKILL.md`, **by end of D2-1**

**You consume from A:**
- `getCircuitToken()` for the CircuIT check in preflight (end of D1-1)
- Real tickets for testing the skills (Sync 3). Until then, test on one hand-made ticket.

**Shared:** `src/domain/schemas.ts`, written together at kickoff. Ping before changing it.

### `EvidenceBundle` shape (what your analyzers must produce)
```ts
{ category: "code"|"architecture"|"dependencies"|"testing"|"ops",
  rule: string,            // e.g. "complexity", "god-class", "outdated-major", "circular-import"
  symbolPath: string,      // module/package + class/function; NEVER line numbers
  files: string[],
  metrics: { fanIn?: number, loc?: number, value?: number, threshold?: number },
  snippet: string,         // ≤150 lines: tool output or code excerpt
  stack: "ts"|"java" }
```

---

## Kickoff (D1, first 45 min, with A)
- [ ] Scaffold together and write `src/domain/schemas.ts`; agree the interface stubs
- [ ] **Push `fixtures/evidence-admin-mfe.json`** with about 20 realistic bundles covering all 5 categories, so A is unblocked

## Day 1

### D1-1: Checkout + Jira client (~2 h)
- [ ] `src/integrations/git/worktree.ts`:
  - [ ] Detect the default branch from `git symbolic-ref refs/remotes/origin/HEAD`, falling back to `main`, then `master`
  - [ ] Create a temp worktree, `git worktree add <tmp> origin/<branch>`, and record the SHA. Remove the worktree when the scan ends.
  - [ ] `churn()` in `src/integrations/git/churn.ts`: `git log --since=180.days --name-only --pretty=format:` → commits per file
  - [ ] Run `python3 ~/.agents/skills/acquire-codebase-knowledge/scripts/scan.py --output <tmp>/scan.txt` **inside the worktree** and put a stack summary into `ScanContext`
  - [ ] Push `checkout` + `churn` for A
- [ ] `src/integrations/jira/jira-cli.ts`:
  - [ ] Wrap `jira-cli --instance techdebt-bot --format json <cmd>` with an allow-list: `search`, `create`, `update`, `comment`, `epics link`, `whoami`
- [ ] `src/integrations/jira/jira-rest.ts`:
  - [ ] `myPermissions(projectKey)`: `GET /rest/api/2/mypermissions?projectKey=…&permissions=BROWSE_PROJECTS,CREATE_ISSUES,ADD_COMMENTS,EDIT_ISSUES,CREATE_ATTACHMENTS`
  - [ ] `attach(key, filePath)`: `POST /rest/api/2/issue/{key}/attachments` with `X-Atlassian-Token: no-check`
- **Done when:** `checkout` returns a SHA for `admin-mfe` and `myPermissions` returns real flags for `<JIRA-KEY>`.

### D1-2: TS analyzers on `cspe-csp-admin-mfe` (~2 h)
Run each analyzer in the worktree. Each one emits `EvidenceBundle[]`.
- [ ] **code**:
  - [ ] ESLint with a project-independent flat config: `complexity>10`, `max-depth>3`, `max-lines-per-function>50`, `max-lines>500`
  - [ ] `jscpd --reporters json`
  - [ ] TODO/FIXME/HACK grep, grouped per file
- [ ] **architecture**: `madge --circular --json`, plus fan-in/fan-out from `madge --json`. Record fan-in in `metrics.fanIn` for every module (A needs it for Reach).
- [ ] **dependencies**: `npm outdated --json`; flag packages one or more majors behind, and deprecated ones
- [ ] **testing**: source files with no matching `*.spec.*` / `*.test.*`; parse the coverage summary if present
- [ ] **ops**: hardcoded `http(s)://` or `localhost` in non-test source. Secret-shaped literals become `ops` bundles with `rule: "secret-literal"`, and A's classifier turns them into Defects.
- [ ] `runAnalyzers()` dispatches by `ctx.stack`
- [ ] **Replace the fixture** with real `admin-mfe` output: `fixtures/evidence-admin-mfe.real.json`

### ✅ Sync 1 (~15 min)
- [ ] Merge. A runs classify on your real evidence. Note which bundle types A reports as noisy.

### D1-3: Java analyzers + preflight (~2 h)
- [ ] Java analyzers on `cspe-sc-feature-service`:
  - [ ] **code**:
    - [ ] PMD with a ruleset of `CyclomaticComplexity`, `GodClass`, `ExcessiveMethodLength`, `NcssCount`, run as `pmd check -f json`
    - [ ] `jscpd`
    - [ ] TODO/FIXME grep
  - [ ] **architecture**: package import graph from `import` lines; detect cycles and fan-in
  - [ ] **dependencies**: `mvn -q versions:display-dependency-updates`. **Fallback:** parse `pom.xml` and compare against a small known-EOL list (e.g. Spring Boot 2.x, Java 8/11)
  - [ ] **testing**: `src/main` classes with no `*Test` in `src/test`; parse JaCoCo XML if present
  - [ ] **ops**: hardcoded URLs; missing actuator `health`/`metrics` config
- [ ] `src/preflight/`:
  - [ ] **Environment**: CircuIT token works (`getCircuitToken()`); `jira-cli --instance techdebt-bot whoami`; `git`, `jscpd` and `madge` installed, plus `pmd` and `mvn` for Java; default branch can be checked out
  - [ ] **Jira**: run `myPermissions` and map each gap to block or fallback:

    | Missing | Result |
    |---|---|
    | `BROWSE_PROJECTS`, `CREATE_ISSUES` | **block** |
    | `ADD_COMMENTS` | `noComments` |
    | `EDIT_ISSUES` | `noEpicLink` |
    | `CREATE_ATTACHMENTS` | `noAttach` |
  - [ ] For each gap, **print and copy (`clipboardy`)** the admin request: *"Please add user techdebt-bot to the Developers role in project `<KEY>` (needs: …)."* It never sends the request itself.
  - [ ] **Interactive**: `[r]` re-check / `[i]` use the fallback / `[q]` quit. Blocking gaps offer only `[r]` and `[q]`. Interactive only for the hackathon; headless mode is post-hackathon.
  - [ ] Add the `techdebt doctor` command
- [ ] Push the `src/integrations/jira/` client for A

### ✅ Sync 2: evening (~1–2 h, together)
- [ ] `techdebt doctor`, then `techdebt scan --dry-run` on `admin-mfe`, then on `feature-service`
- [ ] Fix what breaks. Write down the analyzer-noise list for D2.

**Day 1 exit:** the feature-service dry run produces a ranked Cut, and `doctor` reports Jira permission status with the admin message.

## Day 2

### D2-1: Setup, forked Jira skill, start `ask` (~2 h)
- [ ] `src/profile/` + `techdebt setup <repo>`:
  - [ ] Asks for the Jira project key, Epic name (default `<repo>-tech-debts`), issue type (default Task), Defect default, and price per 1M tokens
  - [ ] Runs preflight, then saves the YAML
- [ ] **Fork `~/.agents/skills/jira-issues` → `skills/jira-autonomous/`**:
  - [ ] Keep all the content: commands, wiki markup, references
  - [ ] **Remove** the "Explicit confirmation gate" and "Ask before writes" rules
  - [ ] **Add** these rules:
    - "the saved Repo Profile is the user's confirmation"
    - "always use `--instance techdebt-bot`"
    - "always JQL-search `labels = td-fp-<fp>` before creating"
  - [ ] Push it for A
- [ ] Create **one hand-made test ticket** (`scripts/fake-ticket.ts`) in `<JIRA-KEY>`, shaped like A's: labels, description, and attached `context.md` / `impact.md`
- [ ] Start `plugin/skills/techdebt-ask/SKILL.md` against that ticket

### D2-2: `ask` + `implement` skills (~2 h)
- [ ] **`techdebt-ask <KEY>`**:
  1. Fetch the ticket with the user's own `jira-issues` skill and download the attachments
  2. Read the current code at the cited paths
  3. If there's no `[techdebt-plan` comment, generate **Design options** (at least 2, with trade-offs and a recommendation) and an **Implementation plan** (Steps, Tests to add/run, Rollback, Acceptance criteria). Show them, and **post them as a `[techdebt-plan v1]` comment once the user confirms**.
  4. Answer the user's questions from the ticket, attachments, plan and current code
- [ ] **`techdebt-implement <KEY>`**:
  1. Load the ticket, attachments and latest `[techdebt-plan vN]` comment. Generate the plan if it's missing, as in `ask`.
  2. **Drift check**: `git diff --stat <scannedSHA>..HEAD -- <evidence files>`. If anything changed, stop and ask.
  3. Create branch `td/<KEY>-<slug>`
  4. Work through the plan step by step, running the repo's tests and lint after each step (detect `npm test` / `mvn test`)
  5. Open the PR with `gh pr create`, putting the ticket key in the title and a link in the body
  6. Transition the ticket to In Progress, then In Review
- [ ] Both skills declare that they work in **Claude Code and Codex**: plain `SKILL.md`, no runtime-specific tools

### ✅ Sync 3 (~20 min)
- [ ] Run `ask` and `implement` on **A's real tickets**. Pick the demo ticket: small Effort, clear evidence, tests exist.

### D2-3: `grill-implement` + demo PR (~2 h)
- [ ] **`techdebt-grill-implement <KEY>`**:
  - [ ] Loads everything `implement` loads
  - [ ] Grills the user in rounds on edge cases, such as callers, config, backwards compatibility and tests
  - [ ] Posts the amended plan as `[techdebt-plan v(N+1)]`, then hands off to `techdebt-implement`
- [ ] Produce the **real PR** for the demo ticket. Keep it open for the demo.
- [ ] Add the skills to the `ai-essentials` marketplace layout. Publishing can wait until after the hackathon.

### D2-4: Rehearse (together)
- [ ] Run the demo twice. Freeze code 1 h before presenting.
- **Your demo parts:** step 4 (the Epic and ticket attachments), step 5 (`/techdebt-ask`), step 6 (`/techdebt-implement` → PR). You also show `techdebt doctor` if time allows.

---

## If you fall behind
- Drop `grill-implement` first.
- A takes the Java Architecture analyzer, or it gets dropped.
- Use `pom.xml` parsing instead of `mvn versions`.
- Hand-write the Repo Profile YAML instead of the `setup` prompts. Keep the preflight checks and the printed message, and drop the `[r]` loop.

## Risks you own
| Risk | Mitigation |
|---|---|
| Analyzers produce too much noise | Thresholds in one config file; tune them in D2 using A's noise list |
| `mvn` is slow or has no network | `pom.xml` fallback |
| PMD not installed on the demo machine | Check in `doctor`, and install on day 1 |
| Generic Jira user lacks permissions | Preflight catches it, prints the admin request, and A's ticketer applies the fallbacks |
| `implement` breaks the build live | Demo the PR you prepared in D2-3 |
