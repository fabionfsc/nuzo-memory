# Claude Code Plugin

Nuzo's Claude Code package is an official-path wrapper around the Nuzo MCP server.

It should make the same Nuzo memory tools available in Claude Code without adding Claude-specific memory behavior.

Claude Code is one host package, not the product boundary. Codex and future MCP-compatible agent CLIs should use the same MCP server and core behavior.

## Install

Prerequisites: Node.js 22 or 24, npm 10 or newer, and a current Claude Code CLI.

```bash
claude plugin marketplace add fabionfsc/nuzo-memory
claude plugin install nuzo@nuzo-memory --scope user
```

Run `claude plugin list --json` and confirm that `nuzo@nuzo-memory` is enabled.
Inside Claude Code, inspect `/mcp` and `/hooks`, then start a new session. The
plugin obtains its pinned `@nuzo/memory` runtime on first use, so a global npm
install is not required.

## Verify Cross-session Memory

In a new Claude Code session, ask:

```text
Save this in Nuzo memory: My installation test marker is NUZO-CLAUDE-OK.
```

Inspect and confirm the proposed draft. Start another new session and ask:

```text
What is my Nuzo installation test marker?
```

The answer should use `NUZO-CLAUDE-OK`. If recall fails, confirm
`nuzo@nuzo-memory` is enabled, inspect `/mcp` and `/hooks`, run
`/reload-plugins`, and confirm both sessions use the same `NUZO_MEMORY_STORE`.

## Update, Disable, Or Remove

For the current `0.9.0` release, update with the native Claude Code commands:

```bash
claude plugin marketplace update nuzo-memory
claude plugin update nuzo@nuzo-memory --scope user
```

Use `/reload-plugins` or start a new session after updating. Routine controls:

```bash
claude plugin disable nuzo@nuzo-memory
claude plugin enable nuzo@nuzo-memory
claude plugin uninstall nuzo@nuzo-memory --scope user
```

### Managed Updates

If Claude Code was installed through `nuzo setup`, later updates use:

```bash
nuzo update --yes
```

Nuzo refreshes the managed marketplace and updates the plugin in its existing
Claude Code scope. It does not repeat setup or silently install a missing
plugin.

## Package

Tracked installable source:

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

The tracked plugin points Claude Code at the version-matched Nuzo MCP server:

```json
{
  "mcpServers": {
    "nuzo": {
      "command": "npm",
      "args": ["exec", "--yes", "--package=@nuzo/memory@0.9.0", "--", "nuzo-mcp-server"],
      "cwd": "${CLAUDE_PLUGIN_ROOT}"
    }
  }
}
```

The generated release artifact uses the same runtime command:

```json
{
  "mcpServers": {
    "nuzo": {
      "command": "npm",
      "args": ["exec", "--yes", "--package=@nuzo/memory@0.9.0", "--", "nuzo-mcp-server"],
      "cwd": "${CLAUDE_PLUGIN_ROOT}"
    }
  }
}
```

`0.9.0` matches the current release. Future packaging pins the actual plugin
version. This keeps the artifact portable across supported platforms while
allowing npm to install the correct native SQLite build.

Claude Code sets plugin-specific environment variables for plugin-provided MCP
servers. Nuzo uses `${CLAUDE_PLUGIN_ROOT}` as the process working directory;
the executable itself is provided by the pinned npm runtime.

## Contributor Validation

This flow validates the tracked marketplace-installable source package.

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

The generated `0.9.0` config resolves the matching public
`@nuzo/memory@0.9.0` package. The release gate validates the artifact with the
npm-distributed Claude Code CLI and validates the shared NUZO-37 SessionStart
canary without writing memory from hooks.

## Runtime Configuration

The plugin runtime uses the same effective Nuzo resolver as the CLI and MCP
server. By default it reads:

```text
~/.nuzo/memory/memories.sqlite
```

Operators can override runtime behavior without editing the package:

| Variable | Purpose |
| --- | --- |
| `NUZO_MEMORY_STORE` | Select the SQLite store path. |
| `NUZO_MEMORY_SCOPE` | Select the default scope; `project:auto` resolves from the active project path. |
| `NUZO_AUTHORIZED_SCOPES` | Restrict MCP/hook access to a comma-separated scope allowlist, for example `project:auto,user:default`. |

Use `NUZO_AUTHORIZED_SCOPES` for repository-controlled agents that should not
enumerate or write unrelated scopes in a shared local store. Without it, the
runtime is an unrestricted local process over the selected store.

## Marketplace Install Direction

For normal sharing, Claude Code plugins should be distributed through a marketplace and installed with:

```bash
claude plugin install nuzo@<marketplace-name>
```

Scopes should be selected intentionally:

- user scope for personal installs;
- project scope for team-shared repository setup;
- local scope for machine-specific testing.

The repository publishes `.claude-plugin/marketplace.json` under the stable
marketplace name `nuzo-memory`. Its tracked plugin source and npm runtime move
together at one version.

## Direct MCP Fallback

If marketplace installation is unavailable, configure Claude Code directly
against the published runtime:

```bash
claude mcp add --transport stdio nuzo -- npm exec --yes --package=@nuzo/memory@0.9.0 -- nuzo-mcp-server
```

This exposes MCP tools but does not install the Nuzo skill or lifecycle hooks.
Use it to isolate marketplace or plugin-loading failures.

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
- the `nuzo` MCP server uses `npm exec` with an exact runtime version;
- the runtime working directory resolves through `${CLAUDE_PLUGIN_ROOT}`;
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

Both events render one attributed JSON record per line inside the shared Nuzo
trust envelope. Recalled content is untrusted stored data, not a Claude Code
system, plugin, or current-user instruction. Source and confidence remain
inspectable attribution and metadata; they do not elevate authority. See
[Memory Trust Boundary](../architecture/memory-trust-boundary.md).

Run the packaged runner diagnostic with:

```bash
npm exec --yes --package=@nuzo/memory -- nuzo-memory-hook --doctor
```

The report confirms content-free runtime and store readiness. Claude Code
remains the authority for whether plugin hooks are enabled; verify them through
`/hooks`. The hook policy is
defined in `docs/operations/lifecycle-hooks.md`, and capture remains governed
by `docs/spec/capture-suggestions.md`.

## Chat Memory Lifecycle

The `nuzo-memory` skill guides Claude Code through the same user-controlled MCP
flow as Codex:

```text
user asks to remember something
  -> memory.suggest_capture validates a visible draft
  -> user chooses create, update, keep separate, clarify, or reject
  -> memory.confirm_capture applies only the explicit decision
user asks to update a memory
  -> show the current memory, proposed replacement, ID, and revision
  -> confirmed update uses target_memory_id and expected_revision
user asks to remove a memory
  -> identify and show the intended memory
  -> archive by default, or permanently delete only after explicit confirmation
  -> memory.forget uses the displayed expected_revision
```

Revision conflicts require Claude Code to re-read the memory and ask again; it
must not retry silently. Multiple-memory removal starts with a bounded dry-run
`memory.forget_many` preview. Rejected, blocked, duplicate, unclear, and merely
inferred drafts remain write-free. The lifecycle hooks themselves stay
read-only and never perform these mutations.

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
