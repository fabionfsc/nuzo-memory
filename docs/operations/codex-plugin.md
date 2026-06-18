# Codex Plugin

Nuzo includes a thin Codex plugin wrapper in `packages/codex-plugin`.

The plugin does not implement memory behavior directly. It points Codex at the Nuzo MCP server, while the memory lifecycle remains in `packages/core`.

Codex is one host package, not the whole product boundary. Claude Code and future MCP-compatible agent CLIs should use the same MCP server and core behavior.

See `docs/architecture/agent-host-compatibility.md` before changing plugin packaging.

## Official Codex Shape

The Codex plugin contract starts with:

- a plugin folder;
- a required `.codex-plugin/plugin.json` manifest;
- optional bundled capabilities such as skills, apps, and MCP servers;
- installation through the Codex plugin directory or a configured marketplace source.

For Nuzo, the plugin should only package the MCP server. It should not store memory, rank recall results, validate privacy policy, or implement import/export behavior directly.

Codex identifies the plugin by the manifest `name`, so Nuzo keeps the stable identifier `nuzo` and the human display name `Nuzo`.

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

Check that output before testing a plugin install:

```bash
test -f packages/mcp-server/dist/index.js
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

## Development Install Flow

This flow is for validating Nuzo during development. It is not a product installer and should not be automated until the supported Codex packaging path is stable.

1. Build the monorepo:

```bash
npm run build
```

2. Validate the plugin manifest and MCP config:

```bash
npm run check -w @nuzo/codex-plugin
```

3. Copy the plugin package into a Codex marketplace plugin directory for local testing, or point a local marketplace entry at a copied package. The marketplace entry should use `source.path` relative to the marketplace root.

Example entry:

```json
{
  "name": "nuzo",
  "source": {
    "source": "local",
    "path": "./plugins/nuzo"
  },
  "policy": {
    "installation": "AVAILABLE",
    "authentication": "ON_INSTALL"
  },
  "category": "Developer Tools"
}
```

4. Restart Codex.

5. Open the plugin directory:

```text
codex
/plugins
```

6. Install or enable `Nuzo`, then start a new thread before relying on the plugin.

The copied package must be able to reach the built MCP server path declared in `.mcp.json`. Until release packaging is finalized, this makes local marketplace testing a development validation step rather than an end-user installation path.

## Direct MCP Fallback

For debugging the MCP server without plugin packaging, configure Codex directly against the built server:

```bash
codex mcp add nuzo -- node /absolute/path/to/nuzo/packages/mcp-server/dist/index.js
```

Use this only to isolate MCP behavior. Plugin validation should still go through the package in `packages/codex-plugin`.

## Exposed Tools

- `memory.remember`
- `memory.recall`
- `memory.recall_hook`
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

The validator checks:

- `.codex-plugin/plugin.json` exists;
- required manifest fields are present;
- the plugin identifier is stable kebab-case;
- the license is `Apache-2.0`;
- `mcpServers` points to an existing relative `.mcp.json` file;
- `.mcp.json` defines the `nuzo` MCP server using `node ../mcp-server/dist/index.js`.

The repository check also validates the plugin metadata:

```bash
npm run check
```

For runtime validation, build first and confirm the MCP server output exists:

```bash
npm run build
test -f packages/mcp-server/dist/index.js
```

## Current Limits

- The wrapper is ready for development validation, but normal use should follow the supported Codex plugin workflow.
- Development-only install helpers should wait until the official plugin path and package layout are stable.
- The plugin assumes the monorepo has already been built.
- Runtime memory remains local and should not be committed to Git.
- Automatic recall or capture hooks must follow `docs/operations/lifecycle-hooks.md` before implementation.
- Capture suggestions must follow `docs/spec/capture-suggestions.md` and call `memory.remember` only after confirmation.

## Source References

- Codex manual, [Build plugins](https://developers.openai.com/codex/plugins/build): plugin manifests, marketplace metadata, local plugin testing, and workspace sharing.
- Codex manual, [Plugins](https://developers.openai.com/codex/plugins): plugin directory, install flow, enabled state, and new-thread pickup after install.
- Codex manual, [Model Context Protocol](https://developers.openai.com/codex/mcp): direct MCP setup and plugin-provided MCP server configuration.
