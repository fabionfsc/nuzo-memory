# Capture Suggestions

Capture suggestions are draft memories proposed by an agent before anything is written to storage.

They exist to make Nuzo useful without turning memory into hidden state.

## Decision

Nuzo starts capture as host or agent behavior, not as a new persisted memory state.

In the MVP, a host integration may detect a memory-worthy statement and prepare a draft, but persistence still routes through the existing `memory.remember` tool after user confirmation.

```text
conversation context
  -> candidate detection
  -> memory draft
  -> user confirm / edit / reject
  -> memory.remember
```

There is no silent write path.

## Candidate Criteria

A statement is memory-worthy when it is:

- stable beyond the current turn;
- useful in future sessions;
- specific enough to act on;
- safe to store;
- not already represented by an equivalent active memory.

Common memory-worthy categories:

| Category | Example |
| --- | --- |
| Preference | "I prefer concise final answers." |
| Project decision | "Nuzo should keep memory business logic in `packages/core`." |
| Recurring instruction | "For this repo, run MkDocs strict before pushing docs changes." |
| Durable fact | "The docs domain for this project is `nuzo.com.br`." |
| Workflow note | "Use GitHub Issues as the execution tracker for Nuzo." |

Not every useful sentence should become memory. One-off task details, temporary errors, command output, and speculative notes should stay in the current conversation unless the user explicitly asks to save them.

## Draft Format

A capture suggestion should be shown as a small, editable draft:

```json
{
  "content": "The user prefers concise final answers.",
  "kind": "preference",
  "scope": "user:default",
  "tags": ["workflow"],
  "source": "codex:capture-suggestion",
  "confidence": 0.72,
  "reason": "The user stated a recurring response style preference.",
  "requires_confirmation": true
}
```

Draft fields:

| Field | Required | Notes |
| --- | --- | --- |
| `content` | yes | The exact memory text proposed for persistence. |
| `kind` | yes | One of `preference`, `project_decision`, `fact`, `instruction`, or `note`. |
| `scope` | yes | Defaults by the scope rules below. |
| `tags` | yes | Short lowercase tags for filtering. |
| `source` | yes | Host and path that produced the draft, such as `codex:capture-suggestion`. |
| `confidence` | yes | Confidence in the draft, not permission to save it. |
| `reason` | yes | Short explanation shown to the user. |
| `requires_confirmation` | yes | Must be `true` for inferred writes. |

The draft is not a stored memory. It has no memory ID until `memory.remember` succeeds.

## User Flow

Capture suggestions must offer three outcomes:

| Outcome | Behavior |
| --- | --- |
| Confirm | Call `memory.remember` with the confirmed draft. |
| Edit | Let the user change content, kind, scope, or tags before calling `memory.remember`. |
| Reject | Do not write anything. The rejection itself is not stored unless the user explicitly asks. |

The confirmation prompt should be direct:

```text
Save this Nuzo memory?

Content: The user prefers concise final answers.
Kind: preference
Scope: user:default
Tags: workflow
Reason: The user stated a recurring response style preference.

Confirm, edit, or reject?
```

Agents may batch multiple suggestions, but each suggested memory must remain inspectable and individually rejectable.

## Scope Rules

Choose the narrowest useful scope.

| Situation | Default scope |
| --- | --- |
| Cross-project user preference | `user:default` |
| Project architecture decision | `project:<path-hash>` |
| Project workflow rule | `project:<path-hash>` |
| Host-specific usage preference | `agent:<name>` |
| Unclear or mixed scope | Ask before saving. |

Do not promote project-specific information to `user:default` by default.

## Allowed Examples

These examples may produce drafts:

| User statement | Draft kind | Default scope |
| --- | --- | --- |
| "For Nuzo, always use GitHub Issues for executable work." | `instruction` | `project:<path-hash>` |
| "I prefer Apache-2.0 for this project." | `project_decision` | `project:<path-hash>` |
| "I like concise status updates while work is running." | `preference` | `user:default` |
| "This repo uses `/tmp/nuzo-git` as the git dir workaround." | `fact` | `project:<path-hash>` |
| "When changing MCP tools, update `docs/spec/tools.md` first." | `instruction` | `project:<path-hash>` |

## Blocked Examples

These examples must not produce a persisted memory unless the user explicitly rewrites them into a safe memory:

| Input | Reason |
| --- | --- |
| "My token is `ghp_...`." | Secret. |
| "Here is my `.env` file..." | Raw private file content. |
| "The build failed once with this stack trace..." | Transient log. |
| "Use password `hunter2` for local testing." | Credential. |
| "I might maybe switch to Postgres later." | Speculative and not durable. |
| "The customer said their card failed." | Sensitive personal or payment context. |

When blocked, the agent may explain that Nuzo avoids storing that kind of content and ask for a sanitized durable preference or decision instead.

## Host Responsibilities

Host plugins may provide prompts, skills, or hooks that create capture drafts.

They must not contain:

- secret detection logic beyond calling core policy checks;
- separate memory schemas;
- storage behavior;
- host-specific import/export formats;
- automatic write paths.

All confirmed writes must call `memory.remember`.

## Core Responsibilities

Core must still validate confirmed writes.

Confirmation is not a bypass for:

- secret scanning;
- kind validation;
- scope validation;
- tag normalization;
- duplicate detection;
- disabled-scope checks.

If core rejects a confirmed draft, the host should show the structured error and avoid retrying automatically.

## Initial Implementation Order

1. Document capture suggestion policy.
2. Add test fixtures for allowed and blocked examples.
3. Add host prompt/skill guidance for suggesting drafts.
4. Add optional read-only recall hook.
5. Add confirmed capture flow that calls `memory.remember`.

Do not add a capture hook that writes directly to storage.
