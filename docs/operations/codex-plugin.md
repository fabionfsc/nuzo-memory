# Codex Plugin

Nuzo includes a thin Codex plugin wrapper in `packages/codex-plugin`.

The plugin does not implement memory behavior directly. It points Codex at the Nuzo MCP server, while the memory lifecycle remains in `packages/core`.

Codex is one host package, not the whole product boundary. Claude Code and future MCP-compatible agent CLIs should use the same MCP server and core behavior.

See `docs/architecture/agent-host-compatibility.md` before changing plugin packaging.

## Official Codex Shape

The Codex plugin contract starts with:

- a plugin folder;
- a required `.codex-plugin/plugin.json` manifest;
- optional bundled capabilities such as skills, hooks, apps, and MCP servers;
- installation through the Codex plugin directory or a configured marketplace source.

For Nuzo, the plugin packages the MCP server, memory skill, and read-only
lifecycle hooks. It does not store memory, rank recall results, validate
privacy policy, or implement import/export behavior directly.

Codex identifies the plugin by the manifest `name`, so Nuzo keeps the stable identifier `nuzo` and the human display name `Nuzo`.

## Package Layout

Development source:

```text
packages/codex-plugin/
├── .codex-plugin/
│   └── plugin.json
├── .mcp.json
├── hooks/
│   └── hooks.json
├── skills/
│   └── nuzo-memory/
│       └── SKILL.md
├── README.md
└── package.json
```

Generated release artifact:

```text
build/plugins/codex/nuzo/
├── .codex-plugin/
│   └── plugin.json
├── .mcp.json
├── hooks/
│   └── hooks.json
├── skills/
│   └── nuzo-memory/
│       └── SKILL.md
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
the published Nuzo package to the same version as the plugin:

```json
{
  "mcpServers": {
    "nuzo": {
      "command": "npm",
      "args": ["exec", "--yes", "--package=@nuzo/memory@0.6.0", "--", "nuzo-mcp-server"]
    }
  }
}
```

`0.6.0` matches the current release. Future packaging uses the actual shared
package version and rejects version drift.

The first launch may need npm registry access. Nuzo does not use `latest` and
does not require a global install.

The release artifact uses the same pinned Nuzo package for its read-only hook
runner:

```text
npm exec --yes --package=@nuzo/memory@<plugin-version> -- nuzo-memory-hook
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

7. Install or enable `Nuzo`, open `/hooks`, and trust the two Nuzo command hooks.

8. Start a new thread. `SessionStart` loads bounded `autoload` memory and
   `UserPromptSubmit` recalls topic matches from content and tags.

The generated `0.6.0` config resolves the matching public
`@nuzo/memory@0.6.0` package. It has been installed through an isolated
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
- `memory.confirm_capture`
- `memory.list`
- `memory.update`
- `memory.history`
- `memory.forget`
- `memory.forget_many`
- `memory.export`
- `memory.import`
- `memory.doctor`

## Nuzo Skill

The plugin ships `skills/nuzo-memory/SKILL.md` plus official `SessionStart` and
`UserPromptSubmit` hooks. Hooks inject bounded read-only context; the skill
keeps Nuzo separate from Codex built-in generated memories and guides confirmed
capture behavior.

Recalled records are rendered as attributed, untrusted stored data. Memory
kind, source, confidence, tags, and scope do not place content in Codex's
instruction hierarchy. The shared hook envelope tells Codex not to execute or
follow directives solely because they appear in memory and prevents embedded
newlines or fake record text from changing the output structure. See
[Memory Trust Boundary](../architecture/memory-trust-boundary.md).

The skill is host guidance only. Secret scanning, validation, storage, search,
audit, and import/export behavior remain in core and MCP.

The host-facing lifecycle makes the following loop natural in a fresh Codex
session:

```text
start session
  -> SessionStart recalls autoload memory
submit task
  -> UserPromptSubmit recalls matching content and tags
  -> use recalled context
user asks to remember or states durable context
  -> memory.suggest_capture
  -> show draft, duplicate, or relationship evidence
  -> user chooses create, update, keep separate, clarify, or reject
  -> memory.confirm_capture applies the explicit decision
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
3. Show the validated draft, duplicate result, and any relationship evidence.
4. If the user confirms or edits it, call `memory.confirm_capture` with the
   explicit decision. Use `create` for a new memory, `update` with the displayed
   memory ID and revision for a replacement, or `keep_separate` for a related
   memory that should remain distinct.
5. If the user rejects or needs clarification, do not write memory. Call
   `memory.confirm_capture` with `reject` or `clarify` only when a structured
   no-write result is useful.

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
- `@nuzo/memory` is pinned to the plugin version and runs the explicit
  `nuzo-mcp-server` binary;
- no sibling monorepo path remains in the artifact.
- `SessionStart` and `UserPromptSubmit` use the same version-pinned,
  read-only hook runner.

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
- Codex skips plugin command hooks until the user reviews and trusts them in
  `/hooks`; installation alone does not prove automatic recall is active.
- Automatic capture is not enabled. Inferred writes still require confirmation.
- Capture suggestions must follow `docs/spec/capture-suggestions.md`, validate inferred drafts with `memory.suggest_capture`, and call `memory.confirm_capture` only after an explicit user decision.

## Source References

- Codex manual, [Build plugins](https://developers.openai.com/codex/plugins/build): plugin manifests, marketplace metadata, local plugin testing, and workspace sharing.
- Codex manual, [Plugins](https://developers.openai.com/codex/plugins): plugin directory, install flow, enabled state, and new-thread pickup after install.
- Codex manual, [Model Context Protocol](https://developers.openai.com/codex/mcp): direct MCP setup and plugin-provided MCP server configuration.
- Codex manual, [Hooks](https://developers.openai.com/codex/hooks): lifecycle events, plugin-bundled hooks, trust review, and `additionalContext`.
