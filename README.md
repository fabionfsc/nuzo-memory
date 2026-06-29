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
  <a href="https://github.com/fabionfsc/nuzo-memory/releases/tag/v0.8.1">
    <img alt="Release" src="https://img.shields.io/badge/release-v0.8.1-22c55e">
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

## Install

Use Node.js 22 LTS or 24 LTS with npm 10 or newer. Choose the interface you
actually use; host plugins resolve the matching Nuzo runtime themselves.

| Interface | Install |
| --- | --- |
| Codex | `codex plugin marketplace add fabionfsc/nuzo-memory`, then `codex plugin add nuzo@nuzo-memory` |
| Claude Code | `claude plugin marketplace add fabionfsc/nuzo-memory`, then `claude plugin install nuzo@nuzo-memory` |
| CLI or generic MCP host | `npm install --global @nuzo/memory` |

Nuzo `0.9.0+` also provides a CLI bootstrap path for users who install the
unified package first:

```bash
npm install --global @nuzo/memory
nuzo setup
```

For non-interactive installs, use:

```bash
nuzo host install codex --yes
nuzo host install claude-code --yes
nuzo host install --all --yes
```

After a plugin install, review its hooks and start a new agent session. A
separate global npm install is not required for Codex or Claude Code.

Plugin setup details:
[Codex](docs/operations/codex-plugin.md) ·
[Claude Code](docs/operations/claude-code-plugin.md)

## Manage Memory

Use the CLI when you want to inspect, edit, export, or remove memory directly.

```bash
nuzo memory init
nuzo memory doctor
nuzo memory list
nuzo memory recall "deployment preferences"
nuzo memory export --path ./memories.memory.export.json
```

Runtime memory defaults to:

```text
~/.nuzo/memory/memories.sqlite
```

CLI, MCP server, and host hooks share the same runtime resolver. Use
`NUZO_MEMORY_STORE`, `NUZO_MEMORY_SCOPE`, and, for restricted MCP/hook
sessions, `NUZO_AUTHORIZED_SCOPES` when a host needs an explicit store, default
scope, or scope allowlist.

## Defaults

- Local SQLite storage.
- No telemetry by default.
- No remote embeddings by default.
- No hidden inferred writes.
- Runtime memory files stay out of Git.

## Documentation

- Primary site: https://nuzo.com.br
- Getting started: [docs/getting-started/index.md](docs/getting-started/index.md)
- Codex plugin: [docs/operations/codex-plugin.md](docs/operations/codex-plugin.md)
- Claude Code plugin: [docs/operations/claude-code-plugin.md](docs/operations/claude-code-plugin.md)
- Tool contract: [docs/spec/tools.md](docs/spec/tools.md)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).

## License

Nuzo is licensed under the [Apache License 2.0](LICENSE).
