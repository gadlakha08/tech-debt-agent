# TypeScript, with our own agent loop on CircuIT Chat Completions

The scan pipeline, CLI and future Webex bot are written in TypeScript. Every agentic stage (classify, Impact/Risk scoring, Dossier, ticketing) runs through a small tool-calling loop we own: plain Chat Completions requests to the CircuIT gateway, a step limit, in-process read-only tools, and a Zod-validated final output with one retry. The Agent Runtime is gpt-5-nano, the only model the pipeline has credentials for. Deterministic logic sits outside the loop: analyzers, fan-out, Rubric arithmetic, Fingerprinting and the Cut.

The plugin skills (`techdebt-ask`, `techdebt-implement`, `techdebt-grill-implement`) do not use this loop. They run in each developer's own Claude Code or Codex session, with that person's credentials and model.

## Considered Options

- **Claude Agent SDK, with a Codex adapter later** (this ADR's earlier version): rejected. The pipeline has no Claude or Bedrock credentials, and Cisco code must go through the CircuIT gateway.
- **Codex SDK / Codex CLI pointed at CircuIT**: rejected for now. Codex expects the Responses API and standard auth, while the gateway uses Chat Completions, an `api-key` header and an appkey in the request body. That would need a gateway shim; we may revisit it after the hackathon.
- **`openai` SDK instead of `fetch`**: rejected. Its auth and request shape don't match the gateway's custom header and body field, and a ~100-line client is easier to control.
- **Go (Cobra) or Python**: rejected. The team's codebases are Java and JS/TS, and the official Webex SDK and bot framework are JavaScript.

## Consequences

- Swapping to a stronger model later is a config change (`CIRCUIT_LLM_DEPLOYMENT`), as long as it is served by the gateway.
- We maintain the loop ourselves; it stays deliberately minimal (no planning, no memory, max 8 steps).
- An Agent Runtime adapter for Claude/Codex remains possible post-hackathon behind `runAgent()`.
