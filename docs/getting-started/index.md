# Getting Started

Nuzo `0.9.1` is the current public release. For Codex and Claude Code, use the
global npm package first. It installs the local management CLI and lets Nuzo
configure supported host plugins from one place.

## Install

Prerequisites: Node.js 22 LTS or 24 LTS, npm 10 or newer, and a current Codex
or Claude Code CLI when configuring a host plugin.

```bash
npm install --global @nuzo/memory@0.9.1
nuzo setup
```

`nuzo setup` detects supported local hosts. When both Codex and Claude Code are
available, it lets you choose Codex, Claude Code, or both, then shows the exact
plugin changes and asks before changing host configuration.

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
npm exec --yes --package=@nuzo/memory@0.9.1 -- nuzo-mcp-server
```

The server exposes the [14 Nuzo memory tools](../spec/tools.md). A host should
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
