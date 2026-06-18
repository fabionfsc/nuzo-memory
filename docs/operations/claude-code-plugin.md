# Claude Code Plugin

Nuzo's Claude Code package is an official-path wrapper around the Nuzo MCP server.

It should make the same Nuzo memory tools available in Claude Code without adding Claude-specific memory behavior.

Claude Code is one host package, not the product boundary. Codex and future MCP-compatible agent CLIs should use the same MCP server and core behavior.

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

## Official Claude Code Shape

Claude Code plugins are installable packages that can bundle skills, agents, hooks, MCP servers, LSP servers, background monitors, default settings, and executables.

For Nuzo, the useful parts are:

- `.claude-plugin/plugin.json` for plugin metadata;
- `.mcp.json` at the plugin root for MCP server configuration;
- `skills/` at the plugin root for Claude Code-specific usage guidance.

Only `plugin.json` belongs inside `.claude-plugin/`. Skills, hooks, agents, MCP config, and other components should stay at the plugin root.

Nuzo keeps the plugin identifier `nuzo` and the human display name `Nuzo`.

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

Build the monorepo before testing the MCP path:

```bash
npm run build
test -f packages/mcp-server/dist/index.js
```

Claude Code sets plugin-specific environment variables for plugin-provided MCP servers. Nuzo uses `${CLAUDE_PLUGIN_ROOT}` so the plugin resolves the MCP server relative to the installed plugin package.

## Development Install Flow

This flow is for validating Nuzo during development. It is not a product installer and should not be automated until the supported Claude Code packaging path is stable.

1. Build the monorepo:

```bash
npm run build
```

2. Validate the Nuzo Claude Code plugin metadata:

```bash
npm run check -w @nuzo/claude-code-plugin
```

3. If Claude Code is installed locally, validate with the host CLI:

```bash
claude plugin validate packages/claude-code-plugin
```

4. For local development, load the plugin directory directly:

```bash
claude --plugin-dir packages/claude-code-plugin
```

5. After changing plugin components such as `.mcp.json`, run:

```text
/reload-plugins
```

6. Confirm the `nuzo` MCP server and the `nuzo-memory` skill are visible in Claude Code before relying on the plugin.

The local development package must be able to reach the built MCP server path declared in `.mcp.json`. Until release packaging is finalized, direct `--plugin-dir` testing is a development validation step rather than an end-user installation path.

## Marketplace Install Direction

For normal sharing, Claude Code plugins should be distributed through a marketplace and installed with:

```bash
claude plugin install nuzo@<marketplace-name>
```

Scopes should be selected intentionally:

- user scope for personal installs;
- project scope for team-shared repository setup;
- local scope for machine-specific testing.

Nuzo should not add repository-level marketplace settings until the package layout, release artifact, and update behavior are stable.

## Direct MCP Fallback

For debugging the MCP server without plugin packaging, configure Claude Code directly against the built server:

```bash
claude mcp add --transport stdio nuzo -- node /absolute/path/to/nuzo/packages/mcp-server/dist/index.js
```

Use this only to isolate MCP behavior. Plugin validation should still go through the package in `packages/claude-code-plugin`.

## Validation

Run:

```bash
npm run check -w @nuzo/claude-code-plugin
```

The validator checks:

- `.claude-plugin/plugin.json` exists;
- the plugin name remains `nuzo`;
- the optional display name remains `Nuzo`;
- the license remains `Apache-2.0`;
- `.mcp.json` defines an MCP server named `nuzo`;
- the `nuzo` MCP server uses `node`;
- the `nuzo` MCP server resolves through `${CLAUDE_PLUGIN_ROOT}`;
- host-specific skill files exist when referenced.

If the `claude` CLI is installed, run the host validator too:

```bash
claude plugin validate packages/claude-code-plugin
```

## Boundary

Claude Code plugin files are packaging files only.

Memory lifecycle, policy checks, recall ranking, import/export, and storage belong in `packages/core`. Tool schemas and host-facing tool behavior belong in `packages/mcp-server` and `docs/spec/tools.md`.

## Hooks

Claude Code supports hooks, but Nuzo should not add automatic recall or capture hooks until the policy is documented.

The hook policy is defined in `docs/operations/lifecycle-hooks.md`.

The capture suggestion contract is defined in `docs/spec/capture-suggestions.md`.

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

## Source References

- Claude Code docs, [Create plugins](https://code.claude.com/docs/en/plugins): plugin structure, `--plugin-dir`, `/reload-plugins`, and marketplace direction.
- Claude Code docs, [Plugins reference](https://code.claude.com/docs/en/plugins-reference): manifest schema, component locations, and plugin CLI commands.
- Claude Code docs, [MCP](https://code.claude.com/docs/en/mcp): stdio MCP setup and plugin-provided MCP variable behavior.
- Claude Code docs, [Settings](https://code.claude.com/docs/en/settings): plugin enablement, scopes, and marketplace configuration.
