# Nuzo Codex Plugin

This package wraps the Nuzo MCP server for Codex.

The plugin is intentionally thin:

- memory behavior lives in `packages/core`;
- the transport lives in `packages/mcp-server`;
- this package provides Codex plugin metadata and MCP defaults.

## Local Development

Build the workspace first:

```bash
npm run build
```

Then the plugin MCP config can run:

```bash
node packages/mcp-server/dist/index.js
```

The default memory store is:

```text
~/.nuzo/memory/memories.sqlite
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

## Privacy Defaults

Nuzo does not enable telemetry, sync, embeddings, or network calls by default.
Runtime memory files should not be committed to Git.
