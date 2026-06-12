# Nuzo Memory

[![GitHub Pages](https://github.com/fabionfsc/nuzo-memory/actions/workflows/pages.yml/badge.svg)](https://github.com/fabionfsc/nuzo-memory/actions/workflows/pages.yml)
[![Docs](https://img.shields.io/badge/docs-nuzo.com.br-111827)](https://nuzo.com.br)
[![Status](https://img.shields.io/badge/status-design%20stage-0f766e)](#project-status)

Local-first, auditable memory for Codex and MCP-compatible AI agents.

Nuzo Memory is a memory layer for assistants that should remember useful things without turning private context into invisible, unmanageable state. It is designed around a simple promise: every saved memory can be inspected, edited, exported, and deleted by the user.

The project is inspired by the usefulness of ChatGPT-style memory, but built for local-first developer workflows, open tooling, and explicit user control.

## Why This Exists

AI agents are becoming long-running collaborators, but most sessions still start from zero. They re-learn preferences, repeat old decisions, and lose project context unless the user keeps restating it.

Nuzo Memory aims to make persistent memory practical for coding agents:

- remember stable user preferences;
- preserve project decisions;
- recall relevant context across sessions;
- keep private memory out of Git by default;
- expose everything through auditable local storage;
- work across agents through MCP.

## What Makes It Different

| Principle | What it means |
| --- | --- |
| Local-first | Memories live on the user's machine by default. |
| Auditable | Every memory has metadata, history, source, and scope. |
| Explicit | Agents can suggest memories, but users stay in control. |
| Portable | Import/export formats are documented from the start. |
| MCP-native | The first agent interface is a stable MCP server contract. |
| Git-safe | Runtime databases and exports are ignored by default. |

## Project Status

Nuzo Memory is currently in the **design stage**.

This repository intentionally starts with architecture and specification documents before runtime code. The goal is to lock in the important boundaries early: storage, scopes, tool contracts, privacy rules, package ownership, and GitHub Pages publishing.

The first implementation target is:

```text
SQLite local store -> core memory service -> CLI -> MCP server -> Codex plugin
```

## Planned Experience

The CLI should eventually feel like this:

```bash
nuzo memory init
nuzo memory remember "The user prefers local-first tools." --kind preference --tag workflow
nuzo memory recall "How should I store agent memory?"
nuzo memory list --tag workflow
nuzo memory forget mem_01HZY --archive
nuzo memory doctor
```

Agents will use the same core through MCP tools:

```text
memory.remember
memory.recall
memory.list
memory.update
memory.forget
memory.export
memory.import
memory.doctor
```

## Architecture

```text
Agent / User
    |
    | MCP tools / CLI commands
    v
Interface Layer
    |
    v
Core Memory Service
    |
    +-- Policy Engine
    +-- Storage Adapter
    +-- Search Adapter
    +-- Audit Log
    |
    v
Local SQLite Store
```

Future package layout:

```text
packages/
├── core/         # memory lifecycle, validation, policy, ports
├── cli/          # user-facing command line
├── mcp-server/   # MCP transport and tool schemas
└── codex-plugin/ # Codex packaging and defaults
```

The core rule is strict: business logic belongs in `packages/core`. CLI, MCP, and Codex integrations should call the core instead of duplicating memory behavior.

## Storage Model

User-level memory:

```text
~/.nuzo/memory/
├── memories.sqlite
├── exports/
└── logs/
```

Optional project-level memory:

```text
<project>/.nuzo/memory/
├── memories.sqlite
└── config.json
```

Runtime memory is intentionally outside the repository unless the user explicitly exports it.

## Documentation

The documentation site is published with GitHub Pages and MkDocs Material:

- Site: https://nuzo.com.br
- GitHub Pages fallback: https://fabionfsc.github.io/nuzo-memory/

Start here:

- [Product vision](docs/product/vision.md)
- [Requirements](docs/product/requirements.md)
- [Architecture overview](docs/architecture/overview.md)
- [Package boundaries](docs/architecture/boundaries.md)
- [Memory model](docs/spec/memory-model.md)
- [Tool contract](docs/spec/tools.md)
- [Roadmap](docs/operations/roadmap.md)

## Repository Layout

```text
nuzo-memory/
├── .github/workflows/pages.yml
├── docs/
│   ├── product/
│   ├── architecture/
│   ├── spec/
│   ├── operations/
│   └── adr/
├── examples/
├── mkdocs.yml
├── requirements-docs.txt
└── README.md
```

## Local Docs

Install docs dependencies:

```bash
python3 -m venv .venv-docs
.venv-docs/bin/pip install -r requirements-docs.txt
```

Run locally:

```bash
.venv-docs/bin/mkdocs serve
```

Validate strictly:

```bash
.venv-docs/bin/mkdocs build --strict
```

## Privacy Defaults

Nuzo Memory should not:

- send memories to a remote service by default;
- call embedding APIs by default;
- enable telemetry by default;
- commit runtime memory files to Git;
- hide memory writes from the user.

The project treats memory as user-owned state, not agent-owned state.

## Roadmap

1. Documentation and public project structure.
2. Core package with SQLite storage and FTS search.
3. CLI for user-controlled memory management.
4. MCP server for agent integrations.
5. Codex plugin packaging.
6. Optional encrypted storage, embeddings, sync, and richer UI.

## License

License is not selected yet. Apache-2.0 is the current recommendation because this may become infrastructure used by teams.
