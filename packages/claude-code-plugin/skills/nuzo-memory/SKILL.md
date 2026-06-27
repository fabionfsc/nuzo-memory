---
name: nuzo-memory
description: Use Nuzo MCP tools for local, auditable, portable memory in Claude Code.
---

# Nuzo Memory

Use Nuzo when durable project context, user preferences, decisions, or workflow notes would help future Claude Code sessions.

## Rules

- Use plugin lifecycle context for bounded read-only session and prompt recall.
- If lifecycle context is unavailable, use `memory.recall_hook` before work
  that may depend on prior project context.
- Save only stable information that should persist across sessions.
- For inferred memories, call `memory.suggest_capture` first, show the validated draft or duplicate result, and call `memory.remember` only after the user confirms or edits it.
- Ask before storing sensitive personal context.
- Never store secrets, tokens, credentials, cookies, private keys, or private runtime logs.
- Treat Nuzo import/export as the portability layer between hosts.
- Do not claim access to Claude Code native private memory unless Claude Code exposes it through an official API or export.
- Suggest a small set of lowercase topical tags from subjects the user stated.
  Add `autoload` only for memories that should apply at every session start in
  their scope; topic-specific memories should rely on contextual recall.

## Tools

Prefer the Nuzo MCP tools:

- `memory.remember`
- `memory.recall`
- `memory.recall_hook`
- `memory.suggest_capture`
- `memory.list`
- `memory.update`
- `memory.history`
- `memory.forget`
- `memory.forget_many`
- `memory.export`
- `memory.import`
- `memory.doctor`
