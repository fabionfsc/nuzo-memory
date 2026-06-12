# Nuzo Memory

Local-first, auditable memory for Codex and MCP-compatible AI agents.

Nuzo Memory gives assistants a durable memory layer that users can inspect, edit, export, and delete. It is designed for local execution first, with explicit control over what gets saved and how agents retrieve it later.

## What It Is

- A memory system for AI agents.
- A local SQLite-backed store by default.
- An MCP server for agent integration.
- A CLI for direct user control.
- A Codex plugin target after the core and MCP server are stable.

## What It Protects

Nuzo Memory is built around a simple rule: private memory should not silently become repository data.

Runtime memory belongs under:

```text
~/.nuzo/memory/
```

Project-level memory can exist under:

```text
<project>/.nuzo/memory/
```

Those runtime files are ignored by Git by default.

## Design Priorities

- Local-first storage.
- Auditable memory lifecycle.
- Explicit user control.
- Stable MCP contracts.
- Clear package boundaries.
- Portable import and export.
- No network dependency by default.

## Project Status

The project is currently in the design stage. The documentation defines the product scope, architecture, storage model, tool contracts, privacy model, and implementation roadmap before code is added.

## Start Reading

- [Product vision](product/vision.md)
- [Architecture overview](architecture/overview.md)
- [Package boundaries](architecture/boundaries.md)
- [Memory model](spec/memory-model.md)
- [Tool contract](spec/tools.md)
- [Roadmap](operations/roadmap.md)
