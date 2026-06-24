<p align="center">
  <img src="docs/assets/logo.svg" alt="Nuzo" width="92" height="92">
</p>

<h1 align="center">Nuzo</h1>

<p align="center">
  Local-first memory for AI agents.
  <br>
  Inspectable, portable, and built around MCP.
</p>

<p align="center">
  <a href="https://github.com/fabionfsc/nuzo-memory/actions/workflows/ci.yml">
    <img alt="CI" src="https://github.com/fabionfsc/nuzo-memory/actions/workflows/ci.yml/badge.svg">
  </a>
  <a href="https://github.com/fabionfsc/nuzo-memory/actions/workflows/pages.yml">
    <img alt="GitHub Pages" src="https://github.com/fabionfsc/nuzo-memory/actions/workflows/pages.yml/badge.svg">
  </a>
  <a href="https://nuzo.com.br">
    <img alt="Docs" src="https://img.shields.io/badge/docs-nuzo.com.br-111827">
  </a>
  <a href="#mvp-status">
    <img alt="MVP" src="https://img.shields.io/badge/MVP-100%25-00a7b5">
  </a>
  <a href="https://github.com/fabionfsc/nuzo-memory/releases/tag/v0.1.2">
    <img alt="Release" src="https://img.shields.io/badge/release-v0.1.2-22c55e">
  </a>
  <a href="#license">
    <img alt="License" src="https://img.shields.io/badge/license-Apache--2.0-64748b">
  </a>
</p>

<p align="center">
  <a href="https://nuzo.com.br">Docs</a>
  ·
  <a href="docs/getting-started/index.md">Start</a>
  ·
  <a href="docs/spec/tools.md">Tools</a>
  ·
  <a href="docs/operations/roadmap.md">Roadmap</a>
</p>

---

Nuzo gives AI agents durable local memory without making that memory hidden.
Users can inspect, edit, export, import, and delete what agents remember.

It is designed for developer workflows across Codex, Claude Code, and
MCP-compatible hosts where useful context should stay user-owned.

## Install In 60 Seconds

Use Node.js 22 LTS or 24 LTS with npm 10 or newer.

```bash
npm install --global @nuzo/memory-cli@0.1.2
nuzo memory init
nuzo memory doctor
```

Store and recall a fake memory:

```bash
nuzo memory remember "The demo project uses SQLite for local storage." --kind project_decision
nuzo memory recall "local storage"
```

Runtime memory defaults to:

```text
~/.nuzo/memory/memories.sqlite
```

## Which Package Should I Use?

Most users install only the CLI.

| Package | Use it when you need... |
| --- | --- |
| `@nuzo/memory-cli` | the `nuzo` command for local memory control. |
| `@nuzo/mcp-server` | an MCP stdio server for Codex, Claude Code, or another host. |
| `@nuzo/memory-core` | library-level integration or Nuzo package development. |

The packages share the same version and are released together. You do not need
to install all three for normal CLI use.

## MVP Status

**Release `0.1.2` is current.**

The MVP is complete: local SQLite storage, FTS recall, CLI lifecycle commands,
12 MCP memory tools, Codex and Claude Code plugin artifacts, npm packages,
GitHub Pages, CI, CodeQL, and release validation are in place.

The `0.1.3` focus is product polish: simpler onboarding, clearer package
guidance, leaner public docs, and a cleaner split between public contribution
guidance and machine-local operator notes.

## Core Commands

```bash
nuzo memory init
nuzo memory remember "The user prefers concise implementation notes." --kind preference
nuzo memory suggest-capture "The user prefers concise final answers." --kind preference --reason "Durable response style preference."
nuzo memory recall "concise implementation notes"
nuzo memory list
nuzo memory update mem_01HZY --expected-revision 1 --content "Updated memory content."
nuzo memory history mem_01HZY
nuzo memory forget mem_01HZY --expected-revision 2
nuzo memory export --path ./memories.memory.export.json
nuzo memory import ./memories.memory.export.json --dry-run
nuzo memory doctor
```

For project-local memory:

```bash
nuzo memory init --project
```

## MCP Tools

Nuzo exposes these tools through the MCP server:

```text
memory.remember
memory.recall
memory.recall_hook
memory.suggest_capture
memory.list
memory.update
memory.history
memory.forget
memory.forget_many
memory.export
memory.import
memory.doctor
```

Inferred memories should go through `memory.suggest_capture` first. Writes
should happen only after explicit user confirmation.

## Privacy Defaults

Nuzo should not:

- send memories to a remote service by default;
- call embedding APIs by default;
- enable telemetry by default;
- commit runtime memory files to Git;
- hide memory writes from the user.

SQLite is part of the product boundary, not a placeholder for a cloud database.
The goal is reliable, inspectable, user-owned memory for local agent workflows.

## Documentation

- Primary site: https://nuzo.com.br
- Getting started: [docs/getting-started/index.md](docs/getting-started/index.md)
- Clean install: [docs/getting-started/clean-install.md](docs/getting-started/clean-install.md)
- Tool contract: [docs/spec/tools.md](docs/spec/tools.md)
- Architecture: [docs/architecture/overview.md](docs/architecture/overview.md)
- Roadmap: [docs/operations/roadmap.md](docs/operations/roadmap.md)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).

## License

Nuzo is licensed under the [Apache License 2.0](LICENSE).
