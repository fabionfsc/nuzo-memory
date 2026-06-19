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
  <a href="https://github.com/fabionfsc/nuzo-memory/releases/tag/v0.1.0">
    <img alt="Release" src="https://img.shields.io/badge/release-v0.1.0-22c55e">
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
  <a href="docs/architecture/overview.md">Architecture</a>
  ·
  <a href="docs/operations/roadmap.md">Roadmap</a>
</p>

---

Nuzo is a local memory layer for AI agents. It gives agents durable context
while keeping memory visible, editable, exportable, and under user control.

It is inspired by memory patterns across modern AI assistants, but designed for
developer workflows where storage, contracts, and privacy defaults should be
explicit.

## Why

Most agent sessions still start from zero. They re-learn preferences, repeat
decisions, and lose project context unless the user keeps restating it.

Nuzo makes persistent memory practical without turning it into hidden state:

- local SQLite storage by default;
- CLI control for remember, recall, list, update, history, single/bulk forget, export, import, and doctor;
- MCP tools for Codex, Claude Code, and MCP-compatible hosts;
- documented JSON/Markdown export formats;
- no telemetry, sync, embeddings, or network calls by default.

## MVP Status

**MVP `0.1.0` is released.**

The first public release includes core memory behavior, SQLite/FTS recall, the
local CLI, 11 MCP tools, Codex and Claude Code plugin wrappers, CI, Pages, and
versioned npm runtime packages.

Release validation covers:

- clean CLI installation from npm;
- the Node.js 22 and 24 release validation matrix;
- official marketplace installation paths for Codex and Claude Code;
- live `memory.doctor` calls through both host plugin configurations.

Post-MVP work focuses on public marketplace distribution, trusted npm
publishing, lifecycle integrations, and feedback from real workflows.

## Shape

```text
Agent / CLI
   -> MCP tools or local commands
   -> Core memory service
   -> Policy, search, audit, storage ports
   -> Local SQLite store
```

| Package | Role |
| --- | --- |
| `@nuzo/memory-core` | Memory lifecycle, policy, search, storage, import/export. |
| `@nuzo/memory-cli` | User-facing `nuzo` command for local memory control. |
| `@nuzo/mcp-server` | MCP stdio server exposing memory tools. |
| Codex plugin | Thin host wrapper around the MCP runtime. |
| Claude Code plugin | Thin host wrapper around the MCP runtime. |

## Try Locally

Use Node.js 22 LTS or 24 LTS with npm 10+.

Install the released CLI:

```bash
npm install --global @nuzo/memory-cli@0.1.0
nuzo memory init
nuzo memory doctor
```

Or work from the repository:

```bash
npm install
npm run check
npm test
npm run build
```

Run the current workspace CLI:

```bash
npm run nuzo -- memory init
npm run nuzo -- memory remember "The user prefers local-first tools." --kind preference
npm run nuzo -- memory recall "local-first tools"
npm run nuzo -- memory doctor
```

For project-local memory, initialize from the project root with:

```bash
npm run nuzo -- memory init --project
```

Run the MCP server after building:

```bash
node packages/mcp-server/dist/index.js
```

## Memory Contract

Current MCP tools:

```text
memory.remember
memory.recall
memory.recall_hook
memory.list
memory.update
memory.history
memory.forget
memory.forget_many
memory.export
memory.import
memory.doctor
```

Runtime memory is ignored by Git and defaults to:

```text
~/.nuzo/memory/memories.sqlite
```

## Documentation

- Primary site: https://nuzo.com.br
- GitHub Pages fallback: https://fabionfsc.github.io/nuzo-memory/
- Getting started: [docs/getting-started/index.md](docs/getting-started/index.md)
- Architecture: [docs/architecture/overview.md](docs/architecture/overview.md)
- Tool contract: [docs/spec/tools.md](docs/spec/tools.md)
- Versioning: [docs/operations/versioning.md](docs/operations/versioning.md)
- Release checklist: [docs/operations/release-checklist.md](docs/operations/release-checklist.md)
- Roadmap: [docs/operations/roadmap.md](docs/operations/roadmap.md)

## Privacy Defaults

Nuzo should not:

- send memories to a remote service by default;
- call embedding APIs by default;
- enable telemetry by default;
- commit runtime memory files to Git;
- hide memory writes from the user.

Memory is user-owned state, not agent-owned state.

## License

Nuzo is licensed under the [Apache License 2.0](LICENSE).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), and
[AGENTS.md](AGENTS.md).
