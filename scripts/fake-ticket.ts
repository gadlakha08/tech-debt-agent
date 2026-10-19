// Creates one hand-made ticket shaped like the ticketer's output, so the plugin skills can be tested early.
// Run: npx tsx scripts/fake-ticket.ts <PROJECT-KEY> [--epic <EPIC-KEY>]
// Outward-facing: this creates a real Jira issue via the techdebt-bot instance.
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { JIRA_PROJECT_KEY } from "../src/domain/schemas.js";
import { assertBotIdentity, createJiraClient } from "../src/integrations/jira/index.js";
import { withTempDir } from "../src/paths.js";

const [projectKey, flag, epicKey] = process.argv.slice(2);
if (!projectKey || !JIRA_PROJECT_KEY.test(projectKey) || (flag && (flag !== "--epic" || !epicKey))) {
  console.error("Usage: npx tsx scripts/fake-ticket.ts <PROJECT-KEY> [--epic <EPIC-KEY>]");
  process.exit(2);
}

const fingerprint = "fake0000sample01";
const labels = ["tech-debt", "td-sev-medium", "td-cat-code", `td-fp-${fingerprint}`, "td-repo-sample-app"];

const description = `h2. Summary
{{applyDiscounts}} in {{src/services/billing/invoice-calculator.ts}} has a cyclomatic complexity of 24 (threshold 10).

h2. Why it matters
* Severity: *Medium* (Impact 3, Reach 4, Churn 3, Risk 3)
* Fan-in 9: changes here ripple into every invoice path.

h2. Dossier
Scanned Commit: {{0000000000000000000000000000000000000000}}
See attached {{context.md}} and {{impact.md}}. Ask questions with the {{techdebt-ask}} skill.

_Hand-made test ticket from scripts/fake-ticket.ts; not produced by a Scan._`;

const context = `# Context: applyDiscounts complexity

- **Debt Category:** code
- **Rule:** complexity (24 > 10)
- **Symbol:** src/services/billing/invoice-calculator#applyDiscounts
- **Scanned Commit:** 0000000000000000000000000000000000000000

## What the code does
Applies tenant, volume and promo discounts in one 22-branch function.

## Why it is debt
Every new discount type adds another branch, and the module has no unit tests.
`;

const impact = `# Impact analysis

- **Callers:** 9 modules import invoice-calculator.
- **Risk of change:** medium. Billing totals are user-visible and no tests guard them.
- **Blast radius:** invoice preview, checkout, and monthly statements.
`;

const jira = createJiraClient();
await assertBotIdentity(jira);
const existing = await jira.search(`project = ${projectKey} AND labels = "td-fp-${fingerprint}"`);
if (existing.length) {
  console.log(`Already ticketed as ${existing.map((i) => i.key).join(", ")}; not creating a duplicate`);
  process.exit(0);
}
await withTempDir("fake-ticket", async (dir) => {
  const issue = await jira.create({
    projectKey,
    issueType: "Task",
    summary: "[Tech Debt] Reduce complexity of applyDiscounts (24 > 10)",
    descriptionWiki: description,
    priority: "3-Medium",
    labels,
  });
  for (const [name, body] of [["context.md", context], ["impact.md", impact]] as const) {
    const file = join(dir, name);
    await writeFile(file, body);
    await jira.attach(issue.key, file);
  }
  if (epicKey) await jira.epicLink(epicKey, [issue.key]);
  console.log(`Created ${issue.key} with labels ${labels.join(", ")}`);
});
