# Getting Started

Nuzo `0.8.1` is the current public release. Choose one path below and complete
its verification before changing advanced configuration.

## Upcoming In 0.9.0: One Install Path

The following commands are **not available in the current 0.8.1 release**.
They define the simpler `0.9.0` onboarding flow:

```bash
npm install --global @nuzo/memory@0.9.0
nuzo setup
```

Nuzo will detect Codex and Claude Code, show its plan, and configure only the
hosts the user confirms. Use `nuzo setup --codex --yes`,
`nuzo setup --claude-code --yes`, or `nuzo setup --all --yes` for explicit
non-interactive installation.

Setup is run once. For later releases, update the package and its already
installed host plugins without repeating setup:

```bash
npm install --global @nuzo/memory@latest
nuzo update --yes
```

The npm lifecycle does not silently alter host configuration. `nuzo update`
keeps that mutation explicit, updates only installed plugins, and directs a
first-time user back to setup.

## Codex

Prerequisites: Node.js 22 LTS or 24 LTS, npm 10 or newer, and a current Codex
CLI.

```bash
codex plugin marketplace add fabionfsc/nuzo-memory
codex plugin add nuzo@nuzo-memory
codex plugin list --json
```

Start Codex, open `/plugins`, and confirm `nuzo@nuzo-memory` is enabled. Open
`/hooks`, review and trust the Nuzo `SessionStart` and `UserPromptSubmit` hooks,
then start a new thread.

Continue with [Codex installation and troubleshooting](../operations/codex-plugin.md).

## Claude Code

Prerequisites: Node.js 22 LTS or 24 LTS, npm 10 or newer, and a current Claude
Code CLI.

```bash
claude plugin marketplace add fabionfsc/nuzo-memory
claude plugin install nuzo@nuzo-memory --scope user
claude plugin list --json
```

Confirm `nuzo@nuzo-memory` is enabled. Inside Claude Code, inspect `/mcp` and
`/hooks`, then start a new session.

Continue with [Claude Code installation and troubleshooting](../operations/claude-code-plugin.md).

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
npm install --global @nuzo/memory@0.8.1
nuzo memory init
nuzo memory doctor
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
npm exec --yes --package=@nuzo/memory@0.8.1 -- nuzo-mcp-server
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

Codex and Claude Code plugins resolve their own version-matched
`@nuzo/memory` runtime. Do not install it globally as a second copy unless you
also want the shell CLI.

## Local Data

The default user store is:

```text
~/.nuzo/memory/memories.sqlite
```

Runtime stores and exports do not belong in Git. See
[privacy and security](../operations/privacy-and-security.md) before using real
memory data.
