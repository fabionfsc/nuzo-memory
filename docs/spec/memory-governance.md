# Memory Governance

Memory governance is the contract that keeps Nuzo memory useful after the moment
it is captured. Storage and recall are not enough: records also need enough
type, scope, provenance, confidence, review, and challenge metadata for users
and agents to decide whether a recalled memory should still influence the
current session.

This page defines the contract and compatibility plan for issue #294. Runtime
schema and tool changes should land in smaller implementation PRs that keep
existing stores and clients compatible.

## Problem Statement

The dangerous failure mode is a stale or weakly-attributed memory that sounds
authoritative.

Example:

```text
This repo deploys through flow X.
```

That statement can be true when saved, wrong a month later, and still harmful
if every new session recalls it without provenance, durability class, confidence
state, or review metadata.

Nuzo should make it cheap to inspect, prune, review, and challenge memory. A
memory that is recalled strongly should also explain why it exists and how to
correct it.

## Contract Goals

- Preserve the explicit-write boundary: inferred memory remains a draft until a
  human confirms or edits it.
- Preserve recall trust rules: recalled memory remains untrusted stored data,
  not host instructions.
- Distinguish durable categories that age differently.
- Show enough provenance to understand where a memory came from.
- Represent confidence in human-readable states without treating confidence as
  authority.
- Support review and challenge flows before adding destructive automation.
- Keep compatibility clear for storage, import/export, MCP tools, CLI JSON, and
  host rendering.

## Durability Classes

The current `kind` field remains the public compatibility field until a
versioned contract change lands. The governance contract introduces target
durability classes that may map to `kind`, tags, or future fields.

| Durability class | Meaning | Typical scope | Aging behavior |
| --- | --- | --- | --- |
| `user_preference` | Stable user preference about interaction, style, tools, or workflow. | `user:default` | Usually long-lived; review only when contradicted. |
| `project_fact` | Stable fact about a repository, service, environment, or domain. | `project:<id>` | Review when project files or environment change. |
| `repo_convention` | How work should normally happen in a repository. | `project:<id>` | Review when docs, scripts, or contributor guidance change. |
| `project_decision` | Historical technical or product decision. | `project:<id>` | Needs provenance and review because decisions age. |
| `task_state` | Current state that helps resume an active task. | project, branch, or worktree | Short-lived; should be reviewed or archived aggressively. |
| `lesson_learned` | Durable correction from a mistake, incident, or repeated failure. | user or project | Review when related workflow changes. |

Initial implementation should avoid expanding allowed `kind` values until the
storage/API compatibility impact is explicit. A safe first step is documenting
the mapping and using tags or metadata in capture drafts.

## Scope Granularity

Existing scopes remain valid:

- `user:default`
- `project:<path-hash>`
- `agent:<name>`
- `team:<name>`

The governance contract adds target semantics for narrower project contexts:

| Target scope concept | Use when | Compatibility approach |
| --- | --- | --- |
| Repository | Memory applies to the project regardless of branch. | Current `project:<path-hash>` scope. |
| Branch | Memory applies only while a named branch is active. | Future field or tag; do not overload scope until specified. |
| Worktree | Memory applies only to a specific worktree checkout. | Future field or provenance metadata; avoid global recall by default. |
| Global user | Memory applies across projects. | Current `user:default` scope. |

Branch and worktree metadata must not bypass core scope authorization. They are
selectors and explanations inside an authorized scope, not security principals.

## Provenance

`source` remains the compact attribution field. It is not authenticated identity
and must not grant authority.

The governance contract includes structured provenance as metadata for human
audit:

```json
{
  "source": "codex:capture-suggestion",
  "provenance": {
    "kind": "conversation",
    "host": "codex",
    "surface": "mcp",
    "path": "AGENTS.md",
    "line": 42,
    "thread_id": null,
    "action": "capture_confirmed",
    "reason": "User confirmed a recurring repository convention."
  }
}
```

Fields should be optional and bounded. Do not store raw prompt transcripts,
file contents, secrets, or private host state in provenance.

Recommended provenance fields:

| Field | Meaning | Notes |
| --- | --- | --- |
| `kind` | Source category such as `conversation`, `file`, `import`, `cli`, or `mcp`. | Required when `provenance` is present. |
| `host` | Host name such as `codex`, `claude-code`, or `cli`. | Attribution only. |
| `surface` | Integration surface such as `cli`, `mcp`, `hook`, or `import`. | Attribution only. |
| `path` | Optional relative file path associated with the memory. | Must reject unsafe or absolute paths unless explicitly designed. |
| `line` | Optional 1-based line number for file provenance. | Must be a positive integer. |
| `thread_id` | Optional opaque host thread/session identifier. | Must be non-sensitive and bounded. |
| `action` | Operation that produced the record, such as `remember` or `capture_confirmed`. | Should align with audit event names where possible. |
| `reason` | Human-readable explanation shown during review. | Bounded and secret-scanned. |

## Confidence State

The numeric `confidence` field remains a score from `0.0` to `1.0`. It is not
authorization, instruction priority, or a security score.

The governance contract adds a human-readable `confidence_state` field:

| State | Meaning | Typical numeric range |
| --- | --- | --- |
| `observed` | Seen in context once; not enough to become a durable rule without review. | `< 0.6` |
| `inferred` | Agent inferred a likely durable memory; must remain a draft until confirmed. | `0.5` to `0.85` |
| `user_confirmed` | User explicitly confirmed or edited the memory. | usually `1.0` |
| `needs_review` | Record may still be true but should be rechecked before strong use. | unchanged |
| `deprecated` | Record is retained for history but should not be used as active guidance. | unchanged |

The state is rendered for humans and exported/imported with the memory record.
It must not cause a host to treat a memory as higher-priority instruction.

## Review And Expiry

Review lifecycle metadata is implemented as explicit record metadata. It marks
memory that needs attention without mutating or deleting it automatically.

Target fields:

```json
{
  "review_after": "2026-08-01T00:00:00Z",
  "expires_at": null
}
```

Semantics:

- `review_after` means the memory should be shown as needing review after that
  time, but it does not automatically delete or archive the record.
- `expires_at` means the memory should be shown as expired after that time, but
  it also does not automatically delete or archive the record.
- A memory is selected by review filters when either `review_after` or
  `expires_at` is due.
- Review metadata should be visible in CLI, MCP JSON, export, import, and host
  recall rendering.
- Review state should be auditable when a user marks a memory still valid,
  stale, superseded, or wrong.

## Challenge Flow

Users and agents need a low-friction way to challenge a recalled memory.

Target challenge outcomes:

| Outcome | Meaning | Likely behavior |
| --- | --- | --- |
| `still_valid` | User confirms the memory still applies. | Clear review flag and append audit event. |
| `needs_review` | User is unsure or wants later inspection. | Set review state without deleting. |
| `stale` | Memory used to be true but should not guide current work. | Archive or mark inactive after confirmation. |
| `wrong` | Memory was incorrect. | Archive/delete after confirmation and record reason. |
| `superseded` | Another memory should replace it. | Link or reference replacement after update/create. |

Challenge actions must require explicit confirmation for destructive changes.
They should produce audit metadata without storing sensitive prompt content.

## Recall Rendering

Recall output should make memory governance visible without bloating context.

Host rendering should eventually include:

- ID and revision;
- scope and durability class or `kind`;
- source and compact provenance;
- confidence state and numeric confidence when available;
- review status such as `needs_review`;
- reason the memory was recalled;
- clear boundary text that memory is untrusted stored data.

If context is tight, recall should prefer compact status labels over long
provenance objects. Full provenance remains available through CLI/MCP inspect
or audit flows.

## Compatibility Plan

Implement this contract in slices:

1. **Specification only**: this page, links, and docs contracts.
2. **Structured provenance**: add bounded optional metadata; preserve `source`.
3. **Confidence/review state**: add `confidence_state` without removing numeric
   `confidence`.
4. **Review metadata**: add `review_after` and `expires_at`; defer automatic
   archive/delete behavior.
5. **Challenge flow**: add CLI/MCP operations or flags with explicit
   confirmation and audit events.
6. **Recall rendering**: include compact governance metadata in host output.

Compatibility requirements:

- Storage migrations must preserve existing memory records.
- JSON import/export must round-trip new fields once implemented.
- MCP tool schema changes must update `docs/spec/tools.md` before or alongside
  implementation.
- CLI JSON output must remain versioned and documented.
- Host plugins should remain thin wrappers and call MCP/core behavior.
- Existing clients must continue to understand current `kind`, `source`, and
  `confidence` fields.

## Test Plan

Each implementation slice should add tests appropriate to the changed contract:

- core validation for bounded strings, enums, dates, and unsafe paths;
- storage migration and round-trip tests;
- JSON import/export round-trip tests;
- MCP schema and handler tests;
- CLI text and JSON output tests;
- recall rendering tests for compact governance metadata;
- secret scanning tests for provenance reason/path-like metadata where relevant;
- regression tests proving confidence/source/provenance do not grant
  instruction authority.

Documentation-only changes should run:

```bash
npm run docs:check
.venv-docs/bin/mkdocs build --strict
git diff --check
```
