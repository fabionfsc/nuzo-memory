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

Development source:

```text
packages/codex-plugin/
├── .codex-plugin/
│   └── plugin.json
├── .mcp.json
├── README.md
└── package.json
```

Generated release artifact:

```text
build/plugins/codex/nuzo/
├── .codex-plugin/
│   └── plugin.json
├── .mcp.json
└── LICENSE
```

Generate and validate it with:

```bash
npm run package:plugins
```

The generated artifact is ignored by Git. Release automation should recreate
it from a clean checkout.

## Runtime Resolution

The source plugin uses the monorepo build for development:

```text
packages/mcp-server/dist/index.js
```

The generated release plugin does not rely on that sibling directory. It pins
the published MCP package to the same version as the plugin:

```json
{
  "mcpServers": {
    "nuzo": {
      "command": "npm",
      "args": ["exec", "--yes", "--package=@nuzo/mcp-server@0.2.0", "--", "nuzo-mcp-server"]
    }
  }
}
```

`0.2.0` matches the current release. Future packaging uses the actual shared
package version and rejects version drift.

The first launch may need npm registry access. Nuzo does not use `latest` and
does not require a global install.

The MCP server uses the default local memory store:

```text
~/.nuzo/memory/memories.sqlite
```

To override the store for local testing, run the MCP server with:

```bash
NUZO_MEMORY_STORE=/absolute/path/to/memories.sqlite node packages/mcp-server/dist/index.js
```

## Development Install Flow

This flow validates the monorepo source package. It is separate from the
generated release artifact.

1. Build the monorepo:

```bash
npm run build
```

2. Validate the plugin manifest and MCP config:

```bash
npm run check -w @nuzo/codex-plugin
```

3. For release-layout testing, generate the artifact:

```bash
npm run package:plugins
```

4. Point a local marketplace entry at `build/plugins/codex/nuzo`. The
marketplace entry should use `source.path` relative to the marketplace root.

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

5. Restart Codex.

6. Open the plugin directory:

```text
codex
/plugins
```

7. Install or enable `Nuzo`, then start a new thread before relying on the plugin.

The generated `0.2.0` config resolves the matching public
`@nuzo/mcp-server@0.2.0` package. It has been installed through an isolated
Codex marketplace and used to call `memory.doctor` successfully.

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
- `memory.suggest_capture`
- `memory.list`
- `memory.update`
- `memory.history`
- `memory.forget`
- `memory.forget_many`
- `memory.export`
- `memory.import`
- `memory.doctor`

## Nuzo Skill

The plugin ships `skills/nuzo-memory/SKILL.md`. It guides Codex to use
read-only task-start recall, keep Nuzo separate from Codex built-in generated
memories, and propose inferred memory drafts before calling
`memory.remember`.

The skill is host guidance only. Secret scanning, validation, storage, search,
audit, and import/export behavior remain in core and MCP.

For the `0.2.0` agent memory lifecycle, the Codex skill is the first
host-facing behavior surface. It should make the following loop natural in a
fresh Codex session:

```text
start task
  -> memory.recall_hook
  -> use recalled context
user asks to remember or states durable context
  -> memory.suggest_capture
  -> user confirms, edits, or rejects
  -> memory.remember or memory.update after confirmation
next Codex session
  -> memory.recall_hook returns the confirmed memory
```

The plugin should not implement storage, ranking, policy checks, or direct
import/export behavior. Those remain MCP/core responsibilities.

Explicit user commands such as "save this in Nuzo memory", "remember this for
this project", or "store this decision in Nuzo" still pass through
`memory.suggest_capture` so the user can inspect the normalized memory before a
write occurs.

### Explicit Save Request Flow

When the user says something like:

```text
Save this in Nuzo memory: I prefer short status updates while you work.
```

Codex should treat that as a request to start a confirmed capture flow:

1. Build a concise draft:

```text
The user prefers short status updates while work is running.
```

2. Call `memory.suggest_capture` with the draft, kind, scope, tags, source,
   confidence, and reason.
3. Show the validated draft or duplicate result.
4. If the user confirms or edits it, call `memory.remember` with the final
   fields.
5. If the user rejects it, write nothing.

Explicit intent lowers ambiguity, but it does not bypass core policy checks,
secret scanning, duplicate detection, or the visible draft step.

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
- source `.mcp.json` defines the development MCP server path.

Release validation additionally checks:

- the MCP server runs through `npm exec`;
- `@nuzo/mcp-server` is pinned to the plugin version and runs the explicit
  `nuzo-mcp-server` binary;
- no sibling monorepo path remains in the artifact.

The repository check also validates the plugin metadata:

```bash
npm run check
```

Generate and validate both host artifacts with:

```bash
npm run package:plugins
```

## Current Limits

- Public marketplace listing is not yet available; repository marketplace
  installation remains the distribution path.
- Runtime memory remains local and should not be committed to Git.
- Automatic recall or capture hooks must follow `docs/operations/lifecycle-hooks.md`
  before implementation.
- Capture suggestions must follow `docs/spec/capture-suggestions.md`, validate inferred drafts with `memory.suggest_capture`, and call `memory.remember` only after confirmation.

## Source References

- Codex manual, [Build plugins](https://developers.openai.com/codex/plugins/build): plugin manifests, marketplace metadata, local plugin testing, and workspace sharing.
- Codex manual, [Plugins](https://developers.openai.com/codex/plugins): plugin directory, install flow, enabled state, and new-thread pickup after install.
- Codex manual, [Model Context Protocol](https://developers.openai.com/codex/mcp): direct MCP setup and plugin-provided MCP server configuration.
