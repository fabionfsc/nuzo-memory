# ADR 0006: Resolve The Host Plugin Runtime From npm

## Status

Accepted for the MVP.

## Context

Codex and Claude Code plugins need to launch the same Nuzo MCP server after the
plugin is copied, cached, or installed outside the monorepo.

The development plugin configs can reference `packages/mcp-server/dist`, but
that sibling path does not exist in an installed plugin.

Bundling `node_modules` inside the plugin is not a portable solution because
Nuzo currently uses the native `better-sqlite3` module. A bundle produced on
one operating system or CPU architecture may not run on another.

Requiring a global Nuzo install would add an extra installation contract and
could let the plugin and MCP server versions drift.

## Decision

Release plugin artifacts remain thin and resolve a version-pinned
`@nuzo/mcp-server` package through `npx`:

```text
npx --yes @nuzo/mcp-server@<plugin-version>
```

The plugin and MCP server versions must match.

Source plugin directories retain monorepo-relative MCP paths for development.
`npm run package:plugins` creates release layouts under `build/plugins/` and
replaces those development configs with the pinned npm command.

The generated artifacts contain host metadata, host-specific skills, MCP
configuration, and the Apache-2.0 license. They do not contain core memory
logic or a copied platform-specific `node_modules`.

## Consequences

- A plugin install does not depend on sibling monorepo directories.
- The first MCP launch may require npm registry access to populate the local
  npm cache.
- Subsequent launches can reuse npm's cache, but Nuzo does not promise fully
  offline first use.
- A release is not installable until the matching MCP package version is
  published.
- Plugin release validation must reject `latest`, unpinned package specs, and
  monorepo-relative runtime paths.
- MCP package publication must support Node.js 22 and 24 on the documented
  platforms.

## Alternatives Rejected

### Bundle `node_modules`

Rejected because the native SQLite dependency makes a single generated plugin
artifact platform-specific.

### Require A Global Install

Rejected because it creates a second manual setup step and allows host plugin
and MCP server versions to diverge.

### Install Dependencies With A Plugin Script

Rejected because it introduces a custom installer lifecycle that neither host
requires for normal plugin packaging.
