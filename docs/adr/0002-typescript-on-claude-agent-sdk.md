# TypeScript, with a runtime adapter over the Claude Agent SDK

The scan pipeline, CLI, Debt Service and future Webex bot are all written in TypeScript. Each agentic stage runs through an Agent Runtime adapter. v1 ships the Claude Agent SDK implementation only; a Codex implementation (`@openai/codex-sdk`) follows in v2 behind the same interface. Deterministic logic stays in TypeScript above the adapter: fan-out, Rubric arithmetic, Fingerprinting, the Cut and Debt Service writes.

## Considered Options

- **Go (Cobra) driving `claude -p` subprocesses**: rejected. No Go Agent SDK exists, so guardrails could only live in prompts and output would be unvalidated JSON on stdout. A Go binary's single-file distribution would not help either, because the agent runtime must be installed anyway.
- **Python Agent SDK**: just as capable, but rejected because the team's codebases are Java and JS/TS, and the official Webex SDK and bot framework are JavaScript.
- **In-process SDK custom tools**: rejected because Codex supports custom tools only through MCP (see ADR-0003).
