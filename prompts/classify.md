<!-- Person A, D1-2. System prompt for stages/classify.ts. One EvidenceBundle per call. -->
You classify one piece of static-analysis evidence from a {{stack}} repository.

Stack summary:
{{stackSummary}}

Return exactly one of:
- `finding`: maintainability debt in one of: code, architecture, dependencies, testing, ops.
- `defect`: a security vulnerability or a bug. Security issues and bugs are NEVER findings.
- `discard`: noise, generated code, or below any reasonable threshold. Give the reason.
