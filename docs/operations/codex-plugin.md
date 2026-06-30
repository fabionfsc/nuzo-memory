# Codex Plugin

Nuzo includes a thin Codex plugin wrapper in `packages/codex-plugin`.

The plugin does not implement memory behavior directly. It points Codex at the Nuzo MCP server, while the memory lifecycle remains in `packages/core`.

Codex is one host package, not the whole product boundary. Claude Code and future MCP-compatible agent CLIs should use the same MCP server and core behavior.

See `docs/architecture/agent-host-compatibility.md` before changing plugin packaging.

## Install

Prerequisites: Node.js 22 or 24, npm 10 or newer, and a current Codex CLI.

```bash
codex plugin marketplace add fabionfsc/nuzo-memory
codex plugin add nuzo@nuzo-memory
```

Then start Codex, open `/plugins` to confirm that `Nuzo` is installed and
enabled, and open `/hooks` to review and trust its `SessionStart` and
`UserPromptSubmit` command hooks. Start a new thread after installation. The
plugin obtains its pinned `@nuzo/memory` runtime on first use, so a global npm
install is not required.

Verify the installed state:

```bash
codex plugin list --json
```

The result should contain the enabled plugin ID `nuzo@nuzo-memory`.

## Verify Cross-session Memory

In a new Codex thread, ask:

```text
Save this in Nuzo memory: My installation test marker is NUZO-CODEX-OK.
```

Inspect and confirm the proposed draft. Start another new thread and ask:

```text
What is my Nuzo installation test marker?
```

The answer should use `NUZO-CODEX-OK`. If recall fails, confirm the plugin is
enabled, both hooks are trusted, the `nuzo` MCP server is connected, and both
threads use the same `NUZO_MEMORY_STORE` configuration.

## Update Or Remove

For the current `0.8.1` release, update with the native Codex commands:

```bash
codex plugin marketplace upgrade nuzo-memory
codex plugin add nuzo@nuzo-memory
```

Start a new thread after updating. To remove Nuzo and its marketplace:

```bash
codex plugin remove nuzo@nuzo-memory
codex plugin marketplace remove nuzo-memory
```

### Upcoming In 0.9.0

This command is **not available in the current 0.8.1 release**. If Codex was
installed through `nuzo setup`, later updates use:

```bash
nuzo update --yes
```

Nuzo refreshes the managed marketplace and activates the latest plugin. It
does not repeat setup or silently install Codex when the plugin is absent.

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

Tracked installable source:

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

The tracked plugin and generated release artifact both pin the published Nuzo
package to the same version as the plugin:

```json
{
  "mcpServers": {
    "nuzo": {
      "command": "npm",
      "args": ["exec", "--yes", "--package=@nuzo/memory@0.8.1", "--", "nuzo-mcp-server"]
    }
  }
}
```

`0.8.1` matches the current release. Future packaging uses the actual shared
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

To override runtime behavior for local testing, set environment variables
before launching the server or hook:

```bash
NUZO_MEMORY_STORE=/absolute/path/to/memories.sqlite node packages/mcp-server/dist/index.js
```

Supported runtime variables:

| Variable | Purpose |
| --- | --- |
| `NUZO_MEMORY_STORE` | Select the SQLite store path. |
| `NUZO_MEMORY_SCOPE` | Select the default scope; `project:auto` resolves from the active project path. |
| `NUZO_AUTHORIZED_SCOPES` | Restrict MCP/hook access to a comma-separated scope allowlist, for example `project:auto,user:default`. |

Use `NUZO_AUTHORIZED_SCOPES` for repository-controlled agents that should not
enumerate or write unrelated scopes in a shared local store. Without it, the
runtime is an unrestricted local process over the selected store.

## Contributor Validation

The tracked source is itself marketplace-installable. Contributor validation
also regenerates the ignored release artifact to prove reproducibility.

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

4. Add the repository root as a local marketplace and install Nuzo:

```bash
codex plugin marketplace add "$PWD"
codex plugin add nuzo@nuzo-memory
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

The generated `0.8.1` config resolves the matching public
`@nuzo/memory@0.8.1` package. The release gate installs the artifact through
an isolated local Codex marketplace and validates the shared NUZO-37
SessionStart canary without writing memory from hooks.

## Direct MCP Fallback

If marketplace installation is unavailable, configure Codex directly against
the published runtime:

```bash
codex mcp add nuzo -- npm exec --yes --package=@nuzo/memory@0.8.1 -- nuzo-mcp-server
```

This exposes MCP tools but does not install the Nuzo skill or lifecycle hooks.
Use it to isolate marketplace or plugin-loading failures.

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

Use `memory.doctor` from inside Codex to inspect content-free runtime readiness
and schema diagnostics without returning stored memory text.

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

### Explicit Update And Forget Flow

For an update, Codex shows the existing memory and proposed replacement, then
passes the displayed memory ID and revision to `memory.confirm_capture` only
after confirmation. A revision conflict requires a fresh read and a new user
decision; Codex must not retry silently.

For "remove that from memory", Codex first identifies and shows the intended
memory. Archive is the reversible default. Permanent deletion is a separate
destructive choice and requires explicit confirmation. The call to
`memory.forget` includes the displayed `expected_revision`; Codex reports
success only after the tool succeeds. Bulk requests use a dry-run
`memory.forget_many` preview before any confirmed apply.

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
- source `.mcp.json` pins the public runtime to the plugin version.

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

- OpenAI-curated directory listing is not controlled by this repository;
  repository marketplace installation is the supported public path.
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
