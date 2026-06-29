# Nuzo Codex Plugin

This package wraps the Nuzo MCP server for Codex.

The plugin is intentionally thin:

- memory behavior lives in `packages/core`;
- the transport lives in `packages/mcp-server`;
- this package provides Codex plugin metadata and MCP defaults.
- `skills/nuzo-memory/SKILL.md` guides recall and confirmed capture behavior.
- `hooks/hooks.json` injects bounded read-only recall at session start and user
  prompt submission.

## Runtime

The tracked plugin and generated release artifact run the same pinned public
runtime:

```bash
npm exec --yes --package=@nuzo/memory@0.8.1 -- nuzo-mcp-server
```

Validate the plugin manifest:

```bash
npm run check -w @nuzo/codex-plugin
```

The validator also checks that `.mcp.json` exposes the `nuzo` MCP server
through the exact package version declared by the plugin.

Generate the release layout with:

```bash
npm run package:plugins
```

The release artifact is written to `build/plugins/codex/nuzo` and pins the
matching `@nuzo/memory` version through `npm exec`.

After installation, inspect `/hooks` and trust the Nuzo command hooks. Codex
does not execute new or changed plugin hooks before trust review.

The default memory store is:

```text
~/.nuzo/memory/memories.sqlite
```

## Exposed Tools

- `memory.remember`
- `memory.recall`
- `memory.recall_hook`
- `memory.suggest_capture`
- `memory.confirm_capture`
- `memory.list`
- `memory.update`
- `memory.history`
- `memory.audit`
- `memory.forget`
- `memory.forget_many`
- `memory.export`
- `memory.import`
- `memory.doctor`

## Privacy Defaults

Nuzo does not enable telemetry, sync, embeddings, or network calls by default.
Runtime memory files should not be committed to Git.

More detail lives in `docs/operations/codex-plugin.md`.
