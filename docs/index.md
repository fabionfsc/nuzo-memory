# Nuzo

Local-first, auditable memory for Codex and MCP-compatible AI agents.

Nuzo gives assistants a durable memory layer that users can inspect, edit, export, and delete. It is built for developer workflows where memory should be useful, explicit, and safe to keep across sessions.

## The Idea

Modern agents can write code, inspect repositories, run tools, and help make project decisions. But without memory, every session loses important context: preferences, decisions, failed attempts, useful facts, and project-specific rules.

Nuzo is designed to preserve that context locally.

```text
remember useful context
recall it when relevant
keep it auditable
let the user control it
```

## Design Priorities

| Priority | Meaning |
| --- | --- |
| Local-first | Memories live on the user's machine by default. |
| Auditable | Stored memories can be listed, inspected, edited, exported, and deleted. |
| Agent-compatible | MCP is the first integration boundary. |
| Git-safe | Runtime memory is ignored by default. |
| Portable | Import/export formats are documented. |
| Private by default | No telemetry, sync, or network dependency by default. |

## Planned Interfaces

- CLI for direct user control.
- MCP server for Codex and other compatible agents.
- Codex plugin wrapper after the MCP server is stable.
- Documented import/export format for backup and migration.

## Current Focus

The repository is moving from documentation init into Stage 1 planning.

| Stage | Focus | Status |
| --- | --- | --- |
| 0 | Public docs and project structure | In progress |
| 1 | Core SQLite memory lifecycle | Next |
| 2 | CLI control plane | Planned |
| 3 | MCP server | Planned |
| 4 | Codex plugin | Planned |

## Runtime Storage

User-level memory:

```text
~/.nuzo/memory/memories.sqlite
```

Project-level memory:

```text
<project>/.nuzo/memory/memories.sqlite
```

These files are runtime state. They are not meant to be committed to the repository.

## Project Status

The project is currently in the design stage. The repository defines product principles, architecture, package boundaries, storage model, tool contracts, privacy rules, and implementation roadmap before code is added.

## Start Reading

- [Getting started](getting-started/index.md)
- [Product vision](product/vision.md)
- [Requirements](product/requirements.md)
- [Architecture overview](architecture/overview.md)
- [Package boundaries](architecture/boundaries.md)
- [Memory model](spec/memory-model.md)
- [Tool contract](spec/tools.md)
- [Stage 1 core plan](implementation/stage-1-core.md)
- [Roadmap](operations/roadmap.md)
