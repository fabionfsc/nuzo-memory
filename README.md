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
  <a href="https://github.com/fabionfsc/nuzo-memory/releases/tag/v0.3.0">
    <img alt="Release" src="https://img.shields.io/badge/release-v0.3.0-22c55e">
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

Nuzo gives AI agents durable local memory without making that memory hidden. It
is designed for Codex, Claude Code, and MCP-compatible hosts where useful
context should stay inspectable and user-owned.

## Install In 60 Seconds

Use Node.js 22 LTS or 24 LTS with npm 10 or newer.

```bash
npm install --global @nuzo/memory
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

## Packages

Most users install one package:

| Package | Purpose |
| --- | --- |
| `@nuzo/memory` | CLI, MCP server, and host lifecycle hooks. |
| `@nuzo/memory-core` | Library-level integrations. |

## Agent Recall

The Codex and Claude Code plugins use the hosts' official `SessionStart` and
`UserPromptSubmit` events for bounded read-only recall.

Memories tagged `autoload` may be loaded at session start. Topical tags such as
`cloudflare` or `workflow` participate in contextual recall. Hooks never capture
or modify memory.

Host-level hook trust remains under user control. See the
[Codex](docs/operations/codex-plugin.md) and
[Claude Code](docs/operations/claude-code-plugin.md) setup pages.

## Common Commands

```bash
nuzo memory init
nuzo memory remember "The user prefers concise implementation notes." --kind preference
nuzo memory suggest-capture "The user prefers concise final answers." --kind preference --reason "Durable response style preference."
nuzo memory recall "concise implementation notes"
nuzo memory list
nuzo memory export --path ./memories.memory.export.json
nuzo memory doctor
```

See the [tool contract](docs/spec/tools.md) for the full MCP surface.

## Defaults

- Local SQLite storage.
- No telemetry by default.
- No remote embeddings by default.
- No hidden inferred writes.
- Runtime memory files stay out of Git.

## Documentation

- Primary site: https://nuzo.com.br
- Getting started: [docs/getting-started/index.md](docs/getting-started/index.md)
- Tool contract: [docs/spec/tools.md](docs/spec/tools.md)
- Architecture: [docs/architecture/overview.md](docs/architecture/overview.md)
- Roadmap: [docs/operations/roadmap.md](docs/operations/roadmap.md)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).

## License

Nuzo is licensed under the [Apache License 2.0](LICENSE).
