# Claude Code Plugin

Nuzo's Claude Code package is an official-path wrapper around the Nuzo MCP server.

It should make the same Nuzo memory tools available in Claude Code without adding Claude-specific memory behavior.

## Package

```text
packages/claude-code-plugin/
├── .claude-plugin/plugin.json
├── .mcp.json
├── skills/
│   └── nuzo-memory/
│       └── SKILL.md
└── README.md
```

## Current Scope

The package currently provides:

- Claude Code plugin metadata;
- MCP server defaults for the `nuzo` MCP server;
- a Claude Code skill that tells the host how to use Nuzo safely.

It does not provide:

- a separate memory engine;
- Claude-specific storage;
- lifecycle hooks;
- an installer script;
- native Claude Code memory migration.

## MCP Server

The plugin points Claude Code at the Nuzo MCP server:

```json
{
  "mcpServers": {
    "nuzo": {
      "command": "node",
      "args": [
        "${CLAUDE_PLUGIN_ROOT}/../mcp-server/dist/index.js"
      ]
    }
  }
}
```

This is a monorepo development default. Before release, distribution packaging must confirm whether the MCP server is bundled with the plugin, resolved from an installed package, or configured by the user.

## Validation

Run:

```bash
npm run check -w @nuzo/claude-code-plugin
```

The validator checks:

- `.claude-plugin/plugin.json` exists;
- the plugin name remains `nuzo`;
- the license remains `Apache-2.0`;
- `.mcp.json` defines an MCP server named `nuzo`;
- host-specific skill files exist when referenced.

## Boundary

Claude Code plugin files are packaging files only.

Memory lifecycle, policy checks, recall ranking, import/export, and storage belong in `packages/core`. Tool schemas and host-facing tool behavior belong in `packages/mcp-server` and `docs/spec/tools.md`.

## Hooks

Claude Code supports hooks, but Nuzo should not add automatic recall or capture hooks until the policy is documented.

The hook policy is defined in `docs/operations/lifecycle-hooks.md`.

Before adding host-specific hooks, document:

- when recall is triggered;
- when capture is suggested;
- which memories require user confirmation;
- how secrets and transient logs are filtered;
- how users disable the behavior.

## Portability

Export/import remains a Nuzo feature:

```text
Claude Code + Nuzo plugin
  -> memory.export
  -> nuzo-memory-export JSON
  -> memory.import
  -> Codex + Nuzo plugin
```

This covers memories created and managed through Nuzo. It does not promise access to Claude Code's private native memory unless Claude Code exposes an official API or export format.
