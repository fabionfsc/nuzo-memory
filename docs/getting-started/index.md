# Getting Started

Nuzo `0.7.0` is the current public release.

Most users start with the npm package and then enable the plugin for their AI
agent host.

## Install

Use Node.js 22 LTS or 24 LTS with npm 10 or newer.

```bash
npm install --global @nuzo/memory
```

This installs the local `nuzo` CLI and the MCP runtime used by host plugins.

## Agent Plugins

The npm package does not enable Codex or Claude Code by itself. Install or
enable the Nuzo plugin in the host after installing the runtime.

| Host | Setup |
| --- | --- |
| Codex | Install or enable the `Nuzo` plugin, then trust its hooks when prompted. |
| Claude Code | Install or enable the `Nuzo` plugin, then verify the `nuzo` MCP server is connected. |
| Other MCP hosts | Configure `nuzo-mcp-server` as a stdio MCP server. |

See [Codex plugin](../operations/codex-plugin.md) and
[Claude Code plugin](../operations/claude-code-plugin.md).

## Manage Memory

Use the CLI to inspect and maintain local memory:

```bash
nuzo memory init
nuzo memory doctor
nuzo memory list
nuzo memory recall "deployment preferences"
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
