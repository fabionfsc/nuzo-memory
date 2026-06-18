# Lifecycle Hooks

Lifecycle hooks are host events that can make Nuzo feel useful without the user manually calling memory tools every time.

Hooks must stay conservative. They should improve recall and suggestion quality, not turn memory into hidden state.

## Current Status

Nuzo does not implement automatic host hooks yet.

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

Allowed behavior:

- build a concise recall query from the current task;
- include the project scope plus `user:default`;
- limit result count;
- show or make available the recalled memories to the host;
- update `last_used_at` only if core supports it explicitly.

Not allowed:

- writing new memories;
- reading unrelated project scopes;
- sending memory content to a remote service outside the host interaction;
- bypassing the MCP tool contract.

### Capture Hooks

Capture hooks are write-suggestion hooks.

They may detect candidate memories, but they must not persist them without user confirmation.

The capture suggestion contract is defined in `docs/spec/capture-suggestions.md`.

Allowed behavior:

- propose a memory draft;
- classify the draft as `preference`, `project_decision`, `fact`, `instruction`, or `note`;
- suggest tags and scope;
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

## Initial Implementation Order

1. Manual recall through MCP tools.
2. Capture suggestion specification and examples.
3. Read-only recall hook prototype.
4. Capture suggestion prompt with no persistence.
5. Confirmed capture calling `memory.remember`.
6. Optional update suggestions calling `memory.update`.

Do not implement hard-delete hooks.

## Acceptance Criteria

Before shipping a host hook:

- the hook is documented in that host's operation page;
- users can disable it;
- writes require confirmation;
- policy checks run in core;
- tests cover allowed and blocked capture examples;
- README and roadmap mention the behavior accurately.
