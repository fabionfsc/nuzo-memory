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
  <a href="https://nuzo.com.br/getting-started/">Get started</a>
  ·
  <a href="https://nuzo.com.br/operations/codex-plugin/">Codex</a>
  ·
  <a href="https://nuzo.com.br/operations/claude-code-plugin/">Claude Code</a>
  ·
  <a href="https://nuzo.com.br/spec/tools/">MCP tools</a>
</p>

---

Nuzo gives Codex, Claude Code, and other MCP-compatible agents durable memory
without turning that memory into hidden state. Memories stay in a local SQLite
store that you can inspect, edit, export, or delete.

`0.8.1` is the current public release.

## Upcoming In 0.9.0: Install Once, Update In Place

This workflow is **not available in the current 0.8.1 release**. It is the
committed installation contract for `0.9.0`:

```bash
npm install --global @nuzo/memory@0.9.0
nuzo setup
```

`nuzo setup` detects Codex and Claude Code, shows the exact host changes, and
installs the selected Nuzo plugins after confirmation. It is a first-install
command, not routine maintenance. Non-interactive alternatives remain clear:

```bash
# Codex only
nuzo host install codex --yes

# Claude Code only
nuzo host install claude-code --yes

# Both hosts
nuzo host install --all --yes
```

Later upgrades do not require setup again:

```bash
npm install --global @nuzo/memory@latest
nuzo update --yes
```

`nuzo update` discovers already-installed Nuzo plugins, refreshes their managed
marketplace, and updates Codex and Claude Code in place. It never silently
installs a missing host plugin. npm installation itself does not modify host
configuration; the explicit Nuzo command keeps every host change visible and
auditable.

## Install For Your Agent

Use Node.js 22 LTS or 24 LTS with npm 10 or newer.

### Codex

```bash
codex plugin marketplace add fabionfsc/nuzo-memory
codex plugin add nuzo@nuzo-memory
```

Open `/plugins` to confirm Nuzo is enabled, then open `/hooks` and trust the
Nuzo hooks. Start a new thread after installation.

### Claude Code

```bash
claude plugin marketplace add fabionfsc/nuzo-memory
claude plugin install nuzo@nuzo-memory --scope user
```

Run `claude plugin list --json`, inspect `/mcp` and `/hooks`, then start a new
session.

The plugins obtain their version-matched Nuzo runtime themselves. Do not also
install the global npm package unless you want the shell CLI.

## Verify Memory Across Sessions

In a new Codex thread or Claude Code session, say:

```text
Save this in Nuzo memory: My installation test marker is NUZO-OK.
```

Review and confirm the proposed memory. Start another new session and ask:

```text
What is my Nuzo installation test marker?
```

The answer should use `NUZO-OK`. If it does not, follow the
[Codex](docs/operations/codex-plugin.md) or
[Claude Code](docs/operations/claude-code-plugin.md) troubleshooting path.

## Use The CLI

Install the CLI when you want to manage memory from a shell or connect a
generic MCP host:

```bash
npm install --global @nuzo/memory@0.8.1
nuzo memory init
nuzo memory doctor
```

Try a local write and recall:

```bash
nuzo memory remember "The demo project uses SQLite." --kind project_decision --tag demo
nuzo memory recall "demo storage"
```

The CLI also supports list, update, forget, audit, export, import, and optional
local semantic retrieval. See the [CLI guide](docs/operations/local-cli.md).

For a generic MCP host, run Nuzo as a stdio server:

```bash
npm exec --yes --package=@nuzo/memory@0.8.1 -- nuzo-mcp-server
```

## Safe Defaults

- Local SQLite storage under `~/.nuzo/memory/`.
- No telemetry or remote embeddings by default.
- No hidden inferred writes; suggested memories require confirmation.
- Recalled memory remains untrusted data, not agent instructions.
- Runtime memory files stay out of Git.

## Documentation

- [Getting started](docs/getting-started/index.md)
- [Clean install walkthrough](docs/getting-started/clean-install.md)
- [Privacy and security](docs/operations/privacy-and-security.md)
- [MCP tool contract](docs/spec/tools.md)
- [Roadmap](docs/operations/roadmap.md)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).

## License

Nuzo is licensed under the [Apache License 2.0](LICENSE).
