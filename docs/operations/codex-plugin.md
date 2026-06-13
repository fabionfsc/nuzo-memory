# Codex Plugin

Nuzo includes a thin Codex plugin wrapper in `packages/codex-plugin`.

The plugin does not implement memory behavior directly. It points Codex at the Nuzo MCP server, while the memory lifecycle remains in `packages/core`.

## Package Layout

```text
packages/codex-plugin/
├── .codex-plugin/
│   └── plugin.json
├── .mcp.json
├── README.md
└── package.json
```

## Build First

The plugin MCP config expects the MCP server build output to exist:

```bash
npm run build
```

This creates:

```text
packages/mcp-server/dist/index.js
```

## MCP Defaults

The plugin config points to the local MCP server:

```json
{
  "mcpServers": {
    "nuzo": {
      "command": "node",
      "args": ["../mcp-server/dist/index.js"]
    }
  }
}
```

The MCP server uses the default local memory store:

```text
~/.nuzo/memory/memories.sqlite
```

To override the store for local testing, run the MCP server with:

```bash
NUZO_MEMORY_STORE=/absolute/path/to/memories.sqlite node packages/mcp-server/dist/index.js
```

## Exposed Tools

- `memory.remember`
- `memory.recall`
- `memory.list`
- `memory.update`
- `memory.forget`
- `memory.export`
- `memory.import`
- `memory.doctor`

## Validation

Validate the plugin manifest with:

```bash
npm run check -w @nuzo/codex-plugin
```

The repository check also validates the plugin:

```bash
npm run check
```

## Current Limits

- The wrapper is ready for local development, but install/update docs are still evolving.
- The plugin assumes the monorepo has already been built.
- Runtime memory remains local and should not be committed to Git.
