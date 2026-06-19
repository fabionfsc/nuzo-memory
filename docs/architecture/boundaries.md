# Architecture Boundaries

This project should avoid future refactors by keeping package responsibilities narrow from the beginning.

## Rule

Business logic belongs in `packages/core`.

Interfaces call the core. Interfaces do not own memory rules.

## Package Boundaries

```text
packages/core
  Owns memory model, validation, policy, storage ports, search ports, audit events, migrations.

packages/cli
  Owns command parsing, terminal output, prompts, exit codes.

packages/mcp-server
  Owns MCP transport, tool schemas, request/response mapping.

packages/codex-plugin
  Owns Codex packaging, plugin manifest, and Codex-specific docs.

packages/claude-code-plugin
  Owns Claude Code packaging, plugin manifest, MCP defaults, and Claude-specific docs.

packages/docs-site
  Optional future package for nuzo.com.br documentation.
```

## Dependency Direction

Allowed:

```text
cli -> core
mcp-server -> core
codex-plugin -> mcp-server
codex-plugin -> core docs
claude-code-plugin -> mcp-server
claude-code-plugin -> core docs
docs-site -> docs
```

Not allowed:

```text
core -> cli
core -> mcp-server
core -> codex-plugin
core -> claude-code-plugin
mcp-server -> cli
cli -> mcp-server
```

## Core Contracts

The core package should expose use cases, not database tables.

Recommended use cases:

- `rememberMemory`
- `recallMemories`
- `listMemories`
- `updateMemory`
- `history`
- `forgetMemory`
- `forgetMany`
- `exportMemories`
- `importMemories`
- `runDoctor`

## Ports

The core should depend on ports:

- `MemoryStore`
- `SearchIndex`
- `AuditLog`
- `TransactionManager`
- `Clock`
- `IdGenerator`
- `SecretScanner`
- `PolicyEngine`

Adapters implement those ports:

- `SQLiteMemoryDatabase` implements storage, FTS, audit, and transaction ports.
- `RegexSecretScanner`

## Why This Matters

This lets the project change storage, search, CLI framework, or MCP SDK without rewriting the memory lifecycle.

## Anti-Patterns

- MCP handlers writing directly to SQLite.
- CLI commands duplicating validation.
- Codex plugin containing business logic.
- Claude Code plugin containing business logic.
- Search logic mixed into persistence code.
- Export format generated from raw SQL rows without a stable model.
- Project config read from many places instead of one resolver.
