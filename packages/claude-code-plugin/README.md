# Nuzo Claude Code Plugin

This package contains the initial Claude Code plugin metadata for Nuzo.

It is intentionally thin:

- `.claude-plugin/plugin.json` declares the plugin package.
- `.mcp.json` points Claude Code at the Nuzo MCP server.
- `skills/nuzo-memory/SKILL.md` gives Claude Code host-specific guidance.

Memory behavior stays in `packages/core` and is exposed through `packages/mcp-server`.

The shared MCP contract includes `memory.history` for read-only audit
inspection.

## Current Scope

This package is a scaffold for the supported Claude Code plugin path. It is not a separate memory engine and it does not add lifecycle hooks yet.

The local MCP config currently assumes the monorepo has been built:

```bash
npm run build
```

Then the plugin MCP entry points at:

```text
packages/mcp-server/dist/index.js
```

## Validation

Run:

```bash
npm run check -w @nuzo/claude-code-plugin
```

If Claude Code is installed locally, also run:

```bash
claude plugin validate packages/claude-code-plugin
```

For local host testing:

```bash
claude --plugin-dir packages/claude-code-plugin
```

Then use `/reload-plugins` after changing plugin components such as `.mcp.json`.

Generate and validate the release layout with:

```bash
npm run package:plugins
claude plugin validate build/plugins/claude-code/nuzo --strict
```

The release artifact pins the matching `@nuzo/mcp-server` version through
`npx` and does not reference a monorepo sibling.

## Boundary

Do not add storage, recall ranking, policy, import/export, or tool contract logic here. This package should stay a Claude Code wrapper around the Nuzo MCP server.
