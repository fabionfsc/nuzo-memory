---
name: nuzo-memory
description: Use Nuzo MCP tools for local, auditable, portable memory in Claude Code.
---

# Nuzo Memory

Use Nuzo when durable project context, user preferences, decisions, or workflow notes would help future Claude Code sessions.

## Rules

- Recall relevant Nuzo memories before work that may depend on prior project context.
- Use `memory.recall_hook` for read-only task-start recall when available.
- Save only stable information that should persist across sessions.
- For inferred memories, propose a draft first and call `memory.remember` only after the user confirms or edits it.
- Ask before storing sensitive personal context.
- Never store secrets, tokens, credentials, cookies, private keys, or private runtime logs.
- Treat Nuzo import/export as the portability layer between hosts.
- Do not claim access to Claude Code native private memory unless Claude Code exposes it through an official API or export.

## Tools

Prefer the Nuzo MCP tools:

- `memory.remember`
- `memory.recall`
- `memory.recall_hook`
- `memory.list`
- `memory.update`
- `memory.forget`
- `memory.export`
- `memory.import`
- `memory.doctor`
