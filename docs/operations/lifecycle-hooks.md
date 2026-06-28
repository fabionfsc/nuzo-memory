# Lifecycle Hooks

Lifecycle hooks are host events that can make Nuzo feel useful without the user manually calling memory tools every time.

Hooks must stay conservative. They should improve recall and suggestion quality, not turn memory into hidden state.

## Current Status

Nuzo `0.2.0` includes MCP-level read-only lifecycle primitives:

- `memory.recall_hook` for task-start recall;
- `memory.suggest_capture` for validating inferred memory drafts before
  confirmation.

Nuzo `0.2.1` adds automatic host integration through the official
`SessionStart` and `UserPromptSubmit` events exposed by Codex and Claude Code.
The integration remains read-only and fail-open: a missing store or hook error
must not block the host session.

This document defines the policy that must be satisfied before adding hooks to Codex, Claude Code, or another agent host.

## Goals

- Recall relevant local memories before work that depends on prior context.
- Suggest durable memories when the user states a stable preference, project decision, or recurring instruction.
- Keep all writes inspectable and user-controlled.
- Avoid saving secrets, credentials, transient logs, or one-off session details.
- Keep host packages thin wrappers around MCP and core behavior.

## Non-Goals

- Silent memory capture.
- Background sync.
- Native host memory migration.
- Host-specific memory formats.
- Storing full prompts, tool logs, terminal output, or private files by default.

## Hook Types

### Recall Hooks

Recall hooks are read-only.

They may run before or during an agent task to fetch relevant memories through `memory.recall`.

The first prototype uses `memory.recall_hook`, which wraps recall with host-hook-safe defaults.

Allowed behavior:

- build a concise recall query from the current task;
- include the project scope plus `user:default`;
- limit result count;
- show or make available the recalled memories to the host;
- update `last_used_at` only if core supports it explicitly.
- return read-only metadata such as `memory_writes: false` and `capture_suggestions: false`.

The `memory.recall_hook` prototype does not update `last_used_at` or append recall audit events.

Host integrations use two complementary recall phases:

| Phase | Host event | Input | Retrieval |
| --- | --- | --- | --- |
| Session bootstrap | `SessionStart` | current working directory | bounded active `autoload` memories from the current project and `user:default` |
| Contextual recall | `UserPromptSubmit` | current prompt and working directory | bounded FTS matches from memory content and tags in the current project and `user:default` |

The session bootstrap runs before a prompt exists, so it must not guess a task
topic or load every memory. Contextual recall runs alongside each submitted
prompt so topic tags such as `cloudflare` can retrieve relevant instructions
even when the session started in an unrelated directory.

Recalled context must be formatted as inspectable Nuzo memory data and injected
through the host's `additionalContext` mechanism. It must not describe stored
content as a current fact or as a host instruction. Results are bounded by
count and output size. Empty results produce no injected context.

The shared renderer follows the
[Memory Trust Boundary](../architecture/memory-trust-boundary.md): every record
is untrusted stored data regardless of kind, source, confidence, or write path.
The envelope states that directives must not be followed solely because they
appear in memory and renders one attributed JSON record per physical line.

The host runner must derive a stable `project:<path-hash>` scope from the
session working directory. The literal `project:auto` selector must not become
a shared project namespace in storage.

Not allowed:

- writing new memories;
- reading unrelated project scopes;
- sending memory content to a remote service outside the host interaction;
- bypassing the MCP tool contract;
- presenting memory content as system, developer, plugin, or current-user
  instructions;
- assigning authority from a record's kind, source, confidence, or tags.

### Capture Hooks

Capture hooks are write-suggestion hooks.

They may detect candidate memories, but they must not persist them without user confirmation.

The capture suggestion contract is defined in `docs/spec/capture-suggestions.md`.

Allowed behavior:

- propose a memory draft;
- validate the draft through `memory.suggest_capture`;
- classify the draft as `preference`, `project_decision`, `fact`, `instruction`, or `note`;
- suggest tags and scope;
- show exact duplicates instead of proposing redundant writes;
- ask the user to confirm, edit, or reject;
- call `memory.remember` only after confirmation.

Not allowed:

- automatically saving inferred memories;
- saving secrets or credentials;
- saving raw messages wholesale;
- saving volatile context such as temporary errors, stack traces, or command output unless the user explicitly asks.

## Confirmation Rules

User confirmation is required for:

- every new memory created from inference;
- every update that changes memory content;
- every hard delete;
- scope changes from project memory to user memory;
- memories involving personal facts or security-sensitive context.

Confirmation can be skipped only when the user directly invokes a memory write, for example:

```text
Remember that this project uses SQLite for local storage.
```

Even then, policy checks and secret scanning still apply.

## Scope Rules

Default scopes:

| Situation | Scope |
| --- | --- |
| User preference that applies across projects | `user:default` |
| Project architecture decision | `project:<path-hash>` |
| Host-specific behavior | `agent:<name>` |
| General note with unclear scope | Ask before saving |

Hooks must not write to `user:default` when the context is clearly project-specific.

## Safety Filters

Hooks must reject or require explicit manual override for content that looks like:

- API keys;
- tokens;
- passwords;
- cookies;
- private keys;
- connection strings with credentials;
- private personal identifiers;
- raw command logs;
- raw file contents;
- legal, medical, or financial facts that the user did not explicitly ask to save.

## Host Boundary

Host packages may contain hook configuration and host-specific instructions.

They must not contain:

- storage logic;
- recall ranking logic;
- policy checks;
- import/export implementation;
- host-specific memory schemas.

All hook writes and reads must go through the Nuzo MCP tools.

The generated host plugins may bundle the same small hook runner and host hook
configuration. Codex and Claude Code wrappers must not implement ranking,
storage, secret scanning, or capture policy independently.

Hook execution is optional and user-controllable. Codex requires users to
review and trust plugin command hooks. Claude Code can disable plugin hooks.
Nuzo diagnostics and documentation must report these host controls honestly;
installation alone must not be described as proof that hooks executed.

## Initial Implementation Order

1. Manual recall through MCP tools.
2. Capture suggestion specification and examples.
3. MCP-level read-only recall hook prototype.
4. MCP-level read-only capture suggestion validation.
5. Capture suggestion prompt with no persistence.
6. Confirmed capture calling `memory.remember`.
7. Optional update suggestions calling `memory.update`.

Do not implement hard-delete hooks.

## Acceptance Criteria

Before shipping a host hook:

- the hook is documented in that host's operation page;
- users can disable it;
- writes require confirmation;
- policy checks run in core;
- inferred drafts pass through `memory.suggest_capture`;
- tests cover allowed and blocked capture examples;
- README and roadmap mention the behavior accurately.
- a memory confirmed in one session is available as context in a fresh session;
- topical tags can retrieve a memory from the first relevant prompt;
- session bootstrap only includes explicitly tagged `autoload` memories;
- contextual prompt recall excludes `autoload` memories already supplied by
  session bootstrap;
- host hook failures do not block the user's prompt;
- hook output is bounded and contains no capture suggestion or memory write.
- hook output frames records as untrusted stored data and preserves ID,
  revision, scope, kind, tags, source, and bounded content;
- content containing newlines, fake records, or envelope markers cannot alter
  the output structure.
