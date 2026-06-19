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

Validate the plugin manifest:

```bash
npm run check -w @nuzo/codex-plugin
```

The validator also checks that `.mcp.json` exposes the `nuzo` MCP server through `node ../mcp-server/dist/index.js`.

Generate the release layout with:

```bash
npm run package:plugins
```

The release artifact is written to `build/plugins/codex/nuzo` and pins the
matching `@nuzo/mcp-server` version through `npx`.

The default memory store is:

```text
~/.nuzo/memory/memories.sqlite
```

## Exposed Tools

- `memory.remember`
- `memory.recall`
- `memory.recall_hook`
- `memory.list`
- `memory.update`
- `memory.history`
- `memory.forget`
- `memory.export`
- `memory.import`
- `memory.doctor`

## Privacy Defaults

Nuzo does not enable telemetry, sync, embeddings, or network calls by default.
Runtime memory files should not be committed to Git.

More detail lives in `docs/operations/codex-plugin.md`.
