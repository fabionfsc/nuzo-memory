# Getting Started

Nuzo `1.0.0` is the current public release. For Codex and Claude Code, use the
global npm package first. It installs the local management CLI and lets Nuzo
configure supported host plugins from one place.

If you want to evaluate the storage and lifecycle boundary before configuring
a host, start with the [60-second disposable CLI demo](sixty-second-demo.md).
If you are deciding whether Nuzo adds value beyond a file or native host
memory, read [Why Nuzo?](../product/why-nuzo.md).

## Install

Prerequisites: Node.js 22 LTS or 24 LTS, npm 10 or newer, and a current Codex
or Claude Code CLI when configuring a host plugin.

```bash
npm install --global @nuzo/memory@1.0.0
nuzo setup
```

Alternatively, use the one-line installer. It invokes npm for the same
`@nuzo/memory` package, validates the installed `nuzo` command, and leaves host
configuration to the explicit `nuzo setup` step. It does not install Node.js or
npm automatically:

```bash
curl -fsSL https://nuzo.com.br/install.sh | sh
nuzo setup
```

Under the hood, the installer resolves the npm package, downloads the package
tarball, verifies its npm integrity metadata, installs the verified tarball
globally, and leaves host configuration to `nuzo setup`.

If you do not want to pipe a network script directly into the shell, download
and inspect `https://nuzo.com.br/install.sh` first, then run `sh install.sh`.

`nuzo setup` detects supported local hosts. When both Codex and Claude Code are
available, it lets you choose Codex, Claude Code, or both, then shows the exact
plugin changes and asks before changing host configuration.

Use `nuzo hosts` when you want a read-only inventory of managed hosts, generic
MCP usage, and future host candidates before choosing a setup path.

For non-interactive setup:

```bash
# Codex
nuzo setup --codex --yes

# Claude Code
nuzo setup --claude-code --yes

# Both
nuzo setup --all --yes
```

After setup, open Codex or Claude Code, confirm Nuzo is enabled, review and
trust the two Nuzo read-only recall hooks, `SessionStart` and
`UserPromptSubmit`, then start a new session. Trust prompts are expected; the
hooks do not write memory.

Direct host plugin commands remain documented for advanced installs:
[Codex](../operations/codex-plugin.md) and
[Claude Code](../operations/claude-code-plugin.md).

## Upgrade

Update the global package normally. Nuzo automatically refreshes host plugins
that were already installed through `nuzo setup`:

```bash
npm install --global @nuzo/memory@latest
```

If npm lifecycle scripts are disabled or the automatic refresh needs attention,
run `nuzo update --yes` as the recovery path. Updates never install a missing
host plugin; first-time host configuration stays behind `nuzo setup`.

## Verify A Host Installation

In a new Codex thread or Claude Code session, say:

```text
Save this in Nuzo memory: My installation test marker is NUZO-OK.
```

Nuzo should produce a draft rather than writing inferred memory silently.
Review and confirm it. Start another new session and ask:

```text
What is my Nuzo installation test marker?
```

The answer should use `NUZO-OK`. If it does not, verify that the plugin, MCP
server, and hooks are enabled and that both sessions resolve the same memory
store.

## Shell CLI

Install the unified package when you want to inspect and administer memory from
a terminal:

```bash
nuzo memory init
nuzo memory doctor
nuzo memory manage
```

Store and recall safe test data:

```bash
nuzo memory remember "The demo project uses SQLite." --kind project_decision --tag demo
nuzo memory recall "demo storage"
```

Continue with the [local CLI guide](../operations/local-cli.md).

## Generic MCP Host

Configure the following as a stdio MCP server:

```bash
npm exec --yes --package=@nuzo/memory@1.0.0 -- nuzo-mcp-server
```

The server exposes the [19 Nuzo memory tools](../spec/tools.md). A host should
call `memory.suggest_capture`, show the draft to the user, and call
`memory.confirm_capture` only after an explicit decision.

## Package Choice

Most users need only one installation path.

| Package | Use it when you need... |
| --- | --- |
| `@nuzo/memory` | The CLI, direct MCP server, or host hook runtime. |
| `@nuzo/memory-core` | A library-level integration or Nuzo development. |

Use `@nuzo/memory` for the normal Codex and Claude Code setup path. Manual
host-plugin installation remains available for advanced host-only testing, but
it does not install the local management CLI.

## Local Data

The default user store is:

```text
~/.nuzo/memory/memories.sqlite
```

Runtime stores and exports do not belong in Git. See
[privacy and security](../operations/privacy-and-security.md) before using real
memory data.
