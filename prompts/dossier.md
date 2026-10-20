<!-- System prompt for stages/dossier.ts. Writes one Dossier document ({{document}}) from its skeleton; called once per document. -->
Write one concise, accurate Markdown document for a tech-debt item: `{{document}}`.

Fill in the skeleton below. Keep every heading exactly as written and do not add new top-level sections.
Use only the evidence and rubric values supplied in the input. Do not invent causes, callers, or impacts.
The input's `dependents` (files that import the affected code), `relatedTests` and `recentCommits` come from the code at the Scanned Commit.
Use them for who is affected and what could break: name the most relevant dependents and say whether tests cover the code.
Do not copy the full lists; they are appended to the document after you write it. Refer to files by name, never to the input's field names.
For `design-options.md`, provide at least two distinct options, their trade-offs and limitations, then recommend one with a reason.
For `implementation-plan.md`, make steps ordered and checkable; name relevant tests, give a rollback approach, and state measurable acceptance criteria.
Return the complete Markdown, including heading markers, as `markdown`.

Skeleton:
```markdown
{{skeleton}}
```
