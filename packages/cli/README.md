# @nuzo/memory-cli

The user-facing CLI for Nuzo, a local-first and auditable memory layer for AI
agents.

Most users should start here.

## Install

```bash
npm install --global @nuzo/memory-cli
nuzo memory init
nuzo memory doctor
```

## Use

```bash
nuzo memory remember "The demo project uses SQLite." --kind project_decision
nuzo memory recall "SQLite"
nuzo memory list
nuzo memory list --all-scopes
nuzo memory suggest-capture "The user prefers concise notes." --kind preference --reason "Durable response style preference."
nuzo memory export --path ./memories.memory.export.json
```

For project-local memory:

```bash
nuzo memory init --project
```

## Defaults

Runtime memory is stored locally under:

```text
~/.nuzo/memory/
```

Nuzo does not enable telemetry, sync, embeddings, or network calls by default.
Inferred memories should be suggested first and written only after explicit
user confirmation.

## Related Packages

| Package | Purpose |
| --- | --- |
| `@nuzo/memory-cli` | The `nuzo` command for local memory control. |
| `@nuzo/mcp-server` | MCP stdio server for Codex, Claude Code, and MCP hosts. |
| `@nuzo/memory-core` | Library-level memory lifecycle and storage behavior. |

Documentation: https://nuzo.com.br/

License: Apache-2.0
