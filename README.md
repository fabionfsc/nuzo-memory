<p align="center">
  <img src="docs/assets/logo.svg" alt="Nuzo" width="96" height="96">
</p>

<h1 align="center">Nuzo</h1>

<p align="center">
  Local-first, auditable memory for Codex and MCP-compatible AI agents.
</p>

<p align="center">
  <a href="https://github.com/fabionfsc/nuzo-memory/actions/workflows/pages.yml">
    <img alt="GitHub Pages" src="https://github.com/fabionfsc/nuzo-memory/actions/workflows/pages.yml/badge.svg">
  </a>
  <a href="https://nuzo.com.br">
    <img alt="Docs" src="https://img.shields.io/badge/docs-nuzo.com.br-111827">
  </a>
  <a href="#project-status">
    <img alt="Status" src="https://img.shields.io/badge/status-design%20stage-0f766e">
  </a>
  <a href="#license">
    <img alt="License" src="https://img.shields.io/badge/license-undecided-64748b">
  </a>
</p>

<p align="center">
  <a href="https://nuzo.com.br">Documentation</a>
  ·
  <a href="docs/getting-started/index.md">Getting Started</a>
  ·
  <a href="docs/spec/tools.md">Tool Contract</a>
  ·
  <a href="docs/architecture/overview.md">Architecture</a>
  ·
  <a href="docs/operations/roadmap.md">Roadmap</a>
</p>

---

Nuzo is a memory layer for AI agents that should remember useful context without turning private information into hidden state.

It is inspired by memory patterns found across modern AI assistants and web-based agents, but designed for local-first developer workflows: transparent storage, explicit control, documented contracts, and agent interoperability through MCP.

```text
remember useful context
recall it when relevant
keep it local
make it auditable
let the user stay in control
```

## Why Nuzo?

AI agents are becoming long-running collaborators, but most sessions still start from zero. They re-learn preferences, repeat old decisions, and lose project context unless the user keeps restating it.

Nuzo aims to make persistent agent memory practical:

- remember stable user preferences;
- preserve project decisions;
- recall relevant context across sessions;
- keep private memory out of Git by default;
- expose memory through CLI and MCP;
- make every saved memory inspectable and deletable.

## What It Is

| Layer | Purpose |
| --- | --- |
| Core | Memory lifecycle, validation, policy, storage ports, search ports, audit events. |
| CLI | Direct user control: init, remember, recall, list, update, forget, export, import, doctor. |
| MCP Server | Agent-facing memory tools for Codex and other MCP-compatible clients. |
| Codex Plugin | Packaging and defaults for using Nuzo inside Codex. |
| Docs | Product, architecture, specs, operations, and ADRs published through GitHub Pages. |

## What Makes It Different

| Principle | What it means |
| --- | --- |
| Local-first | Memories live on the user's machine by default. |
| Auditable | Every memory has content, metadata, scope, source, and event history. |
| Explicit | Agents can suggest memories, but users decide what persists. |
| Portable | Import/export formats are documented instead of opaque. |
| MCP-native | The first agent boundary is a stable MCP tool contract. |
| Git-safe | Runtime databases and exports are ignored by default. |
| Private by default | No telemetry, sync, embeddings, or network calls by default. |

## Project Status

Nuzo is currently in the **design stage**.

This repository intentionally starts with architecture and specifications before runtime code. The goal is to make the important boundaries clear early: storage, scopes, package ownership, tool contracts, privacy defaults, release process, and GitHub Pages publishing.

Current implementation target:

```text
SQLite local store
    -> core memory service
    -> CLI
    -> MCP server
    -> Codex plugin
```

The repository now includes the first TypeScript workspace scaffold for `packages/core`.
It also includes an initial local CLI package in `packages/cli`.

## Planned Usage

The CLI should eventually feel like this:

```bash
nuzo memory init
nuzo memory remember "The user prefers local-first tools." --kind preference --tag workflow
nuzo memory recall "How should I store agent memory?"
nuzo memory list --tag workflow
nuzo memory forget mem_01HZY --archive
nuzo memory doctor
```

The initial CLI already supports these commands against a local SQLite store:

```bash
npm run build
node packages/cli/dist/index.js memory init
node packages/cli/dist/index.js memory remember "The user prefers local-first tools." --kind preference
node packages/cli/dist/index.js memory recall "local-first tools"
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

## Storage

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

- Primary site: https://nuzo.com.br
- GitHub Pages fallback: https://fabionfsc.github.io/nuzo-memory/

Start here:

- [Getting started](docs/getting-started/index.md)
- [Product vision](docs/product/vision.md)
- [Requirements](docs/product/requirements.md)
- [Architecture overview](docs/architecture/overview.md)
- [Package boundaries](docs/architecture/boundaries.md)
- [Memory model](docs/spec/memory-model.md)
- [Tool contract](docs/spec/tools.md)
- [Stage 1 core plan](docs/implementation/stage-1-core.md)
- [Roadmap](docs/operations/roadmap.md)

## Repository Layout

```text
nuzo-memory/
├── .github/workflows/pages.yml
├── docs/
│   ├── getting-started/
│   ├── product/
│   ├── architecture/
│   ├── spec/
│   ├── implementation/
│   ├── operations/
│   └── adr/
├── examples/
├── packages/
│   ├── core/
│   └── cli/
├── mkdocs.yml
├── package.json
├── requirements-docs.txt
├── tsconfig.base.json
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

Nuzo should not:

- send memories to a remote service by default;
- call embedding APIs by default;
- enable telemetry by default;
- commit runtime memory files to Git;
- hide memory writes from the user.

The project treats memory as user-owned state, not agent-owned state.

## Roadmap

| Stage | Focus | Status |
| --- | --- | --- |
| 0 | Documentation and public project structure | In progress |
| 1 | Core package with SQLite and FTS search | Planned |
| 2 | CLI for user-controlled memory management | Planned |
| 3 | MCP server for agent integrations | Planned |
| 4 | Codex plugin packaging | Planned |
| 5 | Optional encryption, embeddings, sync, and UI | Later |

## License

License is not selected yet. Apache-2.0 is the current recommendation because this may become infrastructure used by teams.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and [AGENTS.md](AGENTS.md).

Security notes live in [SECURITY.md](SECURITY.md).
