# Claude Code Plugin

Nuzo's Claude Code package is an official-path wrapper around the Nuzo MCP server.

It should make the same Nuzo memory tools available in Claude Code without adding Claude-specific memory behavior.

Claude Code is one host package, not the product boundary. Codex and future MCP-compatible agent CLIs should use the same MCP server and core behavior.

## Package

Development source:

```text
packages/claude-code-plugin/
├── .claude-plugin/plugin.json
├── .mcp.json
├── hooks/
│   └── hooks.json
├── skills/
│   └── nuzo-memory/
│       └── SKILL.md
└── README.md
```

Generated release artifact:

```text
build/plugins/claude-code/nuzo/
├── .claude-plugin/
│   └── plugin.json
├── skills/
│   └── nuzo-memory/
│       └── SKILL.md
├── hooks/
│   └── hooks.json
├── .mcp.json
└── LICENSE
```

Generate and validate it with:

```bash
npm run package:plugins
```

## Current Scope

The package currently provides:

- Claude Code plugin metadata;
- MCP server defaults for the `nuzo` MCP server;
- a Claude Code skill that tells the host how to use Nuzo safely;
- read-only `SessionStart` and `UserPromptSubmit` hooks.

It does not provide:

- a separate memory engine;
- Claude-specific storage;
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

This is the monorepo development default.

The generated release artifact instead uses:

```json
{
  "mcpServers": {
    "nuzo": {
      "command": "npm",
      "args": ["exec", "--yes", "--package=@nuzo/memory@0.3.0", "--", "nuzo-mcp-server"],
      "cwd": "${CLAUDE_PLUGIN_ROOT}"
    }
  }
}
```

`0.3.0` matches the current release. Future packaging pins the actual plugin
version. This keeps the artifact portable across supported platforms while
allowing npm to install the correct native SQLite build.

Build the monorepo before testing the MCP path:

```bash
npm run build
test -f packages/mcp-server/dist/index.js
```

Claude Code sets plugin-specific environment variables for plugin-provided MCP servers. Nuzo uses `${CLAUDE_PLUGIN_ROOT}` so the plugin resolves the MCP server relative to the installed plugin package.

## Development Install Flow

This flow validates the monorepo source package.

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

4. For source-level local development, load the plugin directory directly:

```bash
claude --plugin-dir packages/claude-code-plugin
```

5. After changing plugin components such as `.mcp.json`, run:

```text
/reload-plugins
```

6. Confirm the `nuzo` MCP server and the `nuzo-memory` skill are visible, then
   inspect `/hooks` before relying on automatic recall.

7. To validate the release layout, generate it and run the host validator:

```bash
npm run package:plugins
claude plugin validate build/plugins/claude-code/nuzo --strict
```

The generated `0.3.0` config resolves the matching public
`@nuzo/memory@0.3.0` package. It has been installed through an isolated
Claude Code marketplace, and `claude mcp list` reports the Nuzo server as
connected.

## Marketplace Install Direction

For normal sharing, Claude Code plugins should be distributed through a marketplace and installed with:

```bash
claude plugin install nuzo@<marketplace-name>
```

Scopes should be selected intentionally:

- user scope for personal installs;
- project scope for team-shared repository setup;
- local scope for machine-specific testing.

Repository-level marketplace metadata can now be prepared as a separate
distribution step. It should remain reproducible and version-pinned.

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
- the development server resolves through `${CLAUDE_PLUGIN_ROOT}`;
- host-specific skill files exist when referenced.

Release validation additionally checks:

- the MCP server runs through `npm exec`;
- `@nuzo/memory` is pinned to the plugin version and runs the explicit
  `nuzo-mcp-server` binary;
- `cwd` resolves through `${CLAUDE_PLUGIN_ROOT}`;
- no sibling monorepo path remains.

If the `claude` CLI is installed, run the host validator too:

```bash
claude plugin validate packages/claude-code-plugin
```

## Boundary

Claude Code plugin files are packaging files only.

Memory lifecycle, policy checks, recall ranking, import/export, and storage belong in `packages/core`. Tool schemas and host-facing tool behavior belong in `packages/mcp-server` and `docs/spec/tools.md`.

## Hooks

The plugin bundles the same read-only lifecycle used by Codex:

- `SessionStart` injects bounded `autoload` memory from the active project and
  `user:default`;
- `UserPromptSubmit` recalls relevant memory from prompt text, memory content,
  and topical tags;
- empty results inject no context;
- errors fail open and never block the prompt;
- neither event suggests or writes memory.

Run the packaged runner diagnostic with:

```bash
npm exec --yes --package=@nuzo/memory -- nuzo-memory-hook --doctor
```

The report confirms runtime and store readiness. Claude Code remains the
authority for whether plugin hooks are enabled; verify them through `/hooks`.
The hook policy is defined in `docs/operations/lifecycle-hooks.md`, and capture
remains governed by `docs/spec/capture-suggestions.md`.

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
- Claude Code docs, [Hooks reference](https://code.claude.com/docs/en/hooks): plugin hooks, `SessionStart`, `UserPromptSubmit`, and `additionalContext`.
