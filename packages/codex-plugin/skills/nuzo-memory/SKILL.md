---
name: nuzo-memory
description: Use Nuzo MCP tools for local, auditable, portable memory in Codex when durable project context, preferences, decisions, instructions, or workflow notes should persist across sessions.
---

# Nuzo Memory

Use Nuzo as user-controlled memory. Treat Codex built-in generated memories as
a separate host feature; do not claim migration or access without an official
Codex API or export.

## Workflow

1. Use `memory.recall_hook` for read-only task-start recall when prior context
   may matter.
2. Save direct user requests to remember only after core policy checks pass.
3. For inferred memories, propose a concise draft with content, kind, scope,
   tags, and reason. Call `memory.remember` only after the user confirms or
   edits it.
4. Keep project decisions in the active project scope and cross-project
   preferences in `user:default`.
5. Use `memory.history` when the user needs an audit trail.
6. Preview `memory.forget_many` before applying bulk archive or deletion.

## Safety

- Save only stable information useful in future sessions.
- Never store secrets, tokens, credentials, cookies, private keys, raw private
  files, or transient command logs.
- Do not silently save inferred memories.
- Keep Nuzo import/export as the portability format across hosts.

## Tools

- `memory.remember`
- `memory.recall`
- `memory.recall_hook`
- `memory.list`
- `memory.update`
- `memory.history`
- `memory.forget`
- `memory.forget_many`
- `memory.export`
- `memory.import`
- `memory.doctor`
