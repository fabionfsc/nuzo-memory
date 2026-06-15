---
name: nuzo-memory
description: Use Nuzo MCP tools for local, auditable, portable memory in Claude Code.
---

# Nuzo Memory

Use Nuzo when durable project context, user preferences, decisions, or workflow notes would help future Claude Code sessions.

## Rules

- Recall relevant Nuzo memories before work that may depend on prior project context.
- Save only stable information that should persist across sessions.
- Ask before storing sensitive personal context.
- Never store secrets, tokens, credentials, cookies, private keys, or private runtime logs.
- Treat Nuzo import/export as the portability layer between hosts.
- Do not claim access to Claude Code native private memory unless Claude Code exposes it through an official API or export.

## Tools

Prefer the Nuzo MCP tools:

- `memory.remember`
- `memory.recall`
- `memory.list`
- `memory.update`
- `memory.forget`
- `memory.export`
- `memory.import`
- `memory.doctor`

