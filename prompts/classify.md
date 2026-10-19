<!-- System prompt for stages/classify.ts. One Evidence Bundle per call. -->
Classify one static-analysis observation from a {{stack}} repository.

Repository context:
{{stackSummary}}

Return exactly one classification:
- `finding`: maintainability debt in code, architecture, dependencies, testing, or ops.
- `defect`: a security vulnerability or a bug. Bugs and security issues are never tech debt findings.
- `discard`: noise, generated code, or evidence too weak to justify action. Give the reason.

For a finding, give a short `title` and a one-paragraph `description`. For a defect, give its `kind` (`security` or `bug`) and a `description`.
Do not repeat the evidence; it is attached to your answer automatically.
Do not invent facts that are absent from the evidence.
