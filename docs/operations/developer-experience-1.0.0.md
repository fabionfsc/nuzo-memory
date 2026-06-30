# 1.0.0 Developer Experience Contract

This page defines the target user experience Nuzo must prove before the stable
`1.0.0` release.

It is a product contract for planning and validation, not a statement that every
command already exists in the current public release. Version-specific install
commands remain documented in the getting started and host-plugin guides.

## Product Boundary

Nuzo `1.0.0` is a CLI-first, local-first memory layer for agent developers.

The stable release should feel integrated in Codex and Claude Code while
keeping memory inspectable and controlled through the local `nuzo` command. A
browser dashboard is not part of the `1.0.0` requirement. A future local web UI
may be evaluated after the stable CLI and host workflows are proven.

## Target First-Install Flow

The preferred user path is:

```bash
npm install --global @nuzo/memory
nuzo setup
```

`nuzo setup` is the explicit host-configuration step. It should:

- detect supported host CLIs available on `PATH`, starting with Codex and
  Claude Code;
- show which hosts were detected and what Nuzo will change;
- let the user choose Codex, Claude Code, or both;
- install or refresh the Nuzo marketplace entry needed by each selected host;
- install and enable the matching Nuzo plugin where the host supports that
  workflow;
- explain any host-level action the user must still perform, such as reviewing
  and trusting hooks;
- print a concise success summary naming each configured host;
- leave memory stores, host configs, and plugin changes auditable.

The npm lifecycle must not silently modify Codex, Claude Code, or another host
configuration. A package-manager install may point the user to `nuzo setup`,
but host mutation belongs to an explicit Nuzo command.

Automation should have clear non-interactive forms:

```bash
nuzo setup --codex --yes
nuzo setup --claude-code --yes
nuzo setup --all --yes
```

Do not keep a second public host-install path. The first-class product story
should be one setup command.

## Target Host Activation Flow

After setup, the expected host flow is:

1. The user opens Codex or Claude Code.
2. The Nuzo plugin is visible and enabled through the host's plugin UI or CLI.
3. The user reviews and trusts Nuzo hooks where the host requires explicit
   trust.
4. The user starts a new session.
5. Nuzo loads bounded, relevant, read-only memory context for the active
   project and user scope.

Hook trust stays visible. Nuzo must not try to hide or bypass host security
prompts.

## Agent Memory Loop

The stable user experience should support this loop without requiring manual
shell commands during normal agent work:

```text
new agent session
  -> Nuzo recalls bounded relevant memory
user asks the agent to remember, update, or remove something
  -> the agent uses Nuzo MCP tools
Nuzo validates policy, scope, duplicates, and update candidates
  -> the user confirms write/update/delete decisions when needed
future session
  -> the confirmed memory is recalled again
```

Direct user intent can be handled fluently. Examples include:

- "Save this in Nuzo memory."
- "Remember this for this project."
- "Update that memory with this extra context."
- "Remove that from memory."
- "Forget memories tagged obsolete."

Inferred memory remains conservative. If the agent notices a durable preference,
project decision, recurring instruction, stable fact, or workflow note, Nuzo may
help the host produce an editable draft. The draft must not be persisted until
the user confirms a create, update, or keep-separate decision.

Silent inferred writes are outside the `1.0.0` default contract.

## Capture, Update, And Delete Expectations

Before a memory is written or changed through host behavior, Nuzo should help
the host answer:

- Is the proposed memory durable enough to be useful in future sessions?
- Is it safe under the local policy and secret scanner?
- Which scope should own it?
- Does an equivalent memory already exist?
- Does it update an existing memory rather than create a duplicate?
- Does the operation need an expected revision to avoid overwriting a newer
  change?

The stable behavior should prefer:

- zero write for blocked, rejected, duplicate, or unclear drafts;
- confirmed create for independent memories;
- confirmed update with `expected_revision` for changed memories;
- confirmed keep-separate when related memories should remain distinct;
- archive before hard delete unless the user explicitly confirms deletion;
- structured conflict handling instead of silent retry.

## Session Recall Expectations

Every new supported host session should be able to receive a small, bounded,
read-only memory context without manual CLI commands.

Recall must remain:

- local by default;
- scope-aware;
- bounded in count and output size;
- framed as stored user data, not higher-priority instructions;
- safe when no store exists yet;
- resilient when hooks are unavailable, disabled, or not trusted.

If recall cannot run, Nuzo should fail open for the host session and provide a
clear diagnostic path such as `memory.doctor` or `nuzo memory doctor`.

## Managed Update Flow

Routine package updates should not require the user to repeat setup:

```bash
npm install --global @nuzo/memory@latest
nuzo update --yes
```

`nuzo update` should:

- discover already-installed Nuzo host plugins;
- refresh the managed marketplace entries;
- update Codex and Claude Code plugins in place where installed;
- preserve the user's existing host scope;
- skip missing hosts instead of silently installing new plugins;
- explain whether the user must reload plugins or start a new session.

Nuzo cannot promise that every host will hot-reload an already-open session.
The stable promise is that the user does not have to repeat first-time setup
after a normal update.

## CLI Memory Management

The CLI is the stable memory control plane for `1.0.0`.

The existing command surface must remain capable of administration:

- `nuzo memory doctor`
- `nuzo memory remember`
- `nuzo memory recall`
- `nuzo memory list`
- `nuzo memory update`
- `nuzo memory forget`
- `nuzo memory forget-many`
- `nuzo memory history`
- `nuzo memory audit`
- `nuzo memory export`
- `nuzo memory import`

Before `1.0.0`, Nuzo should evaluate a CLI-only interactive management mode for
users who do not want to compose every lifecycle operation manually. The target
shape is a terminal workflow, not a browser UI:

```bash
nuzo memory manage
```

or:

```bash
nuzo manage
```

The interactive CLI should be treated as optional for the exact stable boundary
unless implementation evidence shows it is necessary to make memory review,
editing, deletion, and audit usable for normal developers. If included, it must
reuse core use cases and the existing CLI/MCP contracts instead of introducing a
second memory engine.

## Non-Goals For `1.0.0`

The stable release does not require:

- browser dashboard or hosted web interface;
- cloud sync;
- account system;
- telemetry;
- mandatory embeddings;
- remote LLM classification;
- graph memory as the default store;
- silent inferred writes;
- importing private native host memory without an official host export path;
- hiding host-level plugin or hook trust prompts.

## Release Evidence Required

Before `1.0.0`, release validation should prove:

- fresh npm global install plus `nuzo setup` works for supported hosts;
- Codex and Claude Code can recall a confirmed memory in a later session;
- explicit remember, update, and forget requests work through host tools;
- inferred capture remains draft-first and confirmation-gated;
- update candidates avoid unbounded duplicate memories;
- `nuzo update --yes` updates already-installed plugins without repeating
  setup;
- CLI memory administration works against the same store used by hosts;
- docs match the tested user path;
- failures produce actionable diagnostics without exposing memory content.

## Execution Tracking

Focused GitHub Issues own the executable work:

- [#214](https://github.com/fabionfsc/nuzo-memory/issues/214) defines the
  overall `1.0.0` CLI-first developer experience release gate.
- [#217](https://github.com/fabionfsc/nuzo-memory/issues/217) tracks setup and
  managed update UX refinement.
- [#215](https://github.com/fabionfsc/nuzo-memory/issues/215) tracks host chat
  memory flows for remember, update, and forget.
- [#216](https://github.com/fabionfsc/nuzo-memory/issues/216) evaluates a
  CLI-only interactive memory manager before `1.0.0`.
