<p align="center">
  <img src="docs/assets/logo.svg" alt="Nuzo" width="96" height="96">
</p>

<h1 align="center">Nuzo</h1>

<p align="center">
  <strong>Local-first memory for AI agents.</strong>
  <br>
  Inspectable, portable, user-controlled memory for Codex, Claude Code, and MCP-compatible hosts.
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
  <a href="https://github.com/fabionfsc/nuzo-memory/releases/tag/v1.0.0">
    <img alt="Release" src="https://img.shields.io/badge/release-v1.0.0-22c55e">
  </a>
  <a href="#license">
    <img alt="License" src="https://img.shields.io/badge/license-Apache--2.0-64748b">
  </a>
</p>

<p align="center">
  <a href="https://nuzo.com.br/getting-started/">Get started</a>
  ·
  <a href="https://nuzo.com.br/getting-started/agent-memory-loop/">Memory loop</a>
  ·
  <a href="https://nuzo.com.br/operations/privacy-and-security/">Privacy & security</a>
  ·
  <a href="https://nuzo.com.br/spec/tools/">MCP tools</a>
</p>

---

Nuzo gives agents useful memory across sessions without turning that memory into
opaque hidden state. Memories stay in a local SQLite store that you can inspect,
edit, export, archive, or delete.

| What you get | What stays explicit |
| --- | --- |
| Cross-session recall for Codex, Claude Code, and MCP hosts. | No telemetry or remote embeddings by default. |
| CLI, MCP server, and host hook runtime in one package. | No silent inferred memory writes. |
| Local SQLite storage and portable import/export. | Suggested memories require confirmation. |
| A stable 1.0.0 public contract with release validation. | Recalled memory remains untrusted data, not agent instructions. |

`1.0.0` is the current public release.

## Install Once

Use Node.js 22 LTS or 24 LTS with npm 10 or newer.

```bash
npm install --global @nuzo/memory@1.0.0
nuzo setup
```

Prefer a one-line installer when you want prerequisite checks first:

```bash
curl -fsSL https://nuzo.com.br/install.sh | sh
nuzo setup
```

The installer resolves the npm package, downloads the package tarball, verifies
its npm integrity metadata, installs the verified tarball globally, and leaves
host configuration to `nuzo setup`.

If you do not want to pipe a network script directly into the shell, download
and inspect `https://nuzo.com.br/install.sh` first, then run `sh install.sh`.

`nuzo setup` detects Codex and Claude Code. When both are available, it lets
you choose Codex, Claude Code, or both, then shows the host changes and asks
before changing host configuration. Open the configured host, confirm Nuzo is
enabled, trust the two Nuzo read-only recall hooks, then start a new session.

To inspect the current integration surface without changing anything:

```bash
nuzo hosts
```

This read-only command lists managed setup hosts, generic MCP usage, and future
host candidates separately.

For non-interactive setup:

```bash
# Codex
nuzo setup --codex --yes

# Claude Code
nuzo setup --claude-code --yes

# Both
nuzo setup --all --yes
```

Hook trust prompts are expected. Nuzo uses one `SessionStart` hook and one
`UserPromptSubmit` hook for bounded recall. These hooks do not write memory;
memory writes still require explicit user confirmation.

After package upgrades, update the global package normally. Nuzo refreshes
plugins that were already installed through `nuzo setup`:

```bash
npm install --global @nuzo/memory@latest
```

If npm lifecycle scripts are disabled or the automatic refresh needs attention,
run `nuzo update --yes` as the recovery path. Direct host plugin installation
is documented in the [Codex](docs/operations/codex-plugin.md) and
[Claude Code](docs/operations/claude-code-plugin.md) guides for advanced
setups, but the npm package is the recommended path because it also installs
the management CLI.

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

## The Memory Loop

```text
new session
  -> read-only recall hook
  -> useful local context
conversation
  -> suggested durable memory
  -> user review and confirmation
later session
  -> confirmed memory recalled again
```

The key boundary is simple: recall can be automatic and read-only; writes are
visible, editable, and confirmed.

## Manage Memory From The CLI

Use the CLI to inspect, edit, export, import, archive, or delete local memory:

```bash
nuzo memory init
nuzo memory doctor
nuzo memory manage
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
npm exec --yes --package=@nuzo/memory@1.0.0 -- nuzo-mcp-server
```

## Why Not Just A File?

Files such as `AGENTS.md` or `MEMORY.md` are good for durable instructions.
Nuzo is for memory that also needs lifecycle control:

| Need | Nuzo behavior |
| --- | --- |
| Recall across Codex, Claude Code, and MCP hosts. | One local memory store and MCP contract. |
| Audit, update, forget, export, and import. | Managed CLI and core memory lifecycle. |
| Avoid hidden agent writes. | Suggested memories are drafts until confirmed. |
| Keep runtime memory out of Git. | Local SQLite store under `~/.nuzo/memory/`. |

## Documentation

- [Getting started](docs/getting-started/index.md)
- [Clean install walkthrough](docs/getting-started/clean-install.md)
- [Agent memory loop](docs/getting-started/agent-memory-loop.md)
- [Privacy and security](docs/operations/privacy-and-security.md)
- [Threat model](docs/operations/threat-model.md)
- [MCP tool contract](docs/spec/tools.md)
- [Roadmap](docs/operations/roadmap.md)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).

## License

Nuzo is licensed under the [Apache License 2.0](LICENSE).
