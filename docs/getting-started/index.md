# Getting Started

Nuzo `0.8.1` is the current public release.

Start with the interface you use. The Codex and Claude Code plugins resolve a
version-matched Nuzo runtime, so plugin users do not need a separate global npm
installation.

## Install

Use Node.js 22 LTS or 24 LTS with npm 10 or newer.

=== "Codex"

    ```bash
    codex plugin marketplace add fabionfsc/nuzo-memory
    codex plugin add nuzo@nuzo-memory
    ```

=== "Claude Code"

    ```bash
    claude plugin marketplace add fabionfsc/nuzo-memory
    claude plugin install nuzo@nuzo-memory
    ```

=== "CLI or generic MCP"

    ```bash
    npm install --global @nuzo/memory
    ```

=== "CLI bootstrap (0.9.0+)"

    ```bash
    npm install --global @nuzo/memory
    nuzo setup
    ```

    The npm install only installs the `nuzo` command. It does not change Codex
    or Claude Code configuration automatically.

    `nuzo setup` detects Codex and Claude Code CLIs in `PATH`, shows the host
    plugin setup plan, and asks before changing host configuration.

    For scripts or fresh VMs, choose the host explicitly:

    ```bash
    # Codex
    nuzo host install codex --yes

    # Claude Code
    nuzo host install claude-code --yes

    # Both Codex and Claude Code
    nuzo host install --all --yes
    ```

Review and enable the plugin hooks, then start a new session. The first plugin
launch may access npm to obtain the pinned runtime.

See [Codex plugin](../operations/codex-plugin.md) and
[Claude Code plugin](../operations/claude-code-plugin.md).

## Manage Memory

Use the CLI to inspect and maintain local memory:

```bash
nuzo memory init
nuzo memory doctor
nuzo memory list
nuzo memory recall "deployment preferences"
nuzo memory integrity
nuzo memory backup --path ./memories.backup.sqlite
```

It creates:

```text
~/.nuzo/
├── config.json
└── memory/
    ├── memories.sqlite
    ├── exports/
    └── logs/
```

## Packages

You usually need one package.

| Package | Use it when you need... |
| --- | --- |
| `@nuzo/memory` | CLI, MCP server, and host lifecycle hooks. |
| `@nuzo/memory-core` | library-level integration or Nuzo package development. |

## More

- [Agent memory loop](agent-memory-loop.md)
- [Local CLI details](../operations/local-cli.md)
- [Tool contract](../spec/tools.md)

## Safety Reminder

Runtime memory does not belong in Git.

The project should keep ignoring:

```text
.nuzo/memory/
*.memory.export.md
*.memory.export.json
*.sqlite
*.sqlite-*
```
