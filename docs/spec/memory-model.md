# Memory Model

## Memory

A memory is a durable record the user expects the agent to use in future sessions.

```json
{
  "id": "mem_01HZY...",
  "revision": 1,
  "scope": "user:default",
  "kind": "preference",
  "content": "The user prefers concise implementation plans before large edits.",
  "tags": ["codex", "workflow"],
  "source": "codex:mcp",
  "confidence": 1.0,
  "created_at": "2026-06-11T00:00:00Z",
  "updated_at": "2026-06-11T00:00:00Z",
  "last_used_at": null,
  "archived_at": null
}
```

## Kinds

- `preference`: stable user preference.
- `project_decision`: durable project decision.
- `fact`: stable fact about the user, project, or environment.
- `instruction`: recurring instruction the agent should follow.
- `note`: general durable note.

## Scopes

- `user:default`: global user memory.
- `project:<path-hash>`: local project memory.
- `agent:<name>`: memory specific to one agent.
- `team:<name>`: future team-level memory.

Valid scopes use the shape `<kind>:<id>`, where `kind` is `user`, `project`,
`agent`, or `team`. Scope IDs may contain letters, numbers, `.`, `_`, `~`, `:`,
`/`, and `-`.

## Tags

Tags are lightweight labels used for filtering and retrieval.

Tags must be lowercase labels that start with a letter or number. They may
contain lowercase letters, numbers, `.`, `_`, and `-`, up to 64 characters.

Recommended initial tags:

- `codex`
- `project`
- `preference`
- `architecture`
- `security`
- `workflow`

The `autoload` tag has defined host-integration semantics. Active memories with
this tag may be included in a bounded, read-only session bootstrap before the
first user prompt. Use it only for context that should apply broadly whenever
its scope is active, such as a durable project convention or global response
preference. Topic-specific memories should use descriptive tags such as
`cloudflare`, `docker`, or `release` and rely on contextual recall instead.

Tags are retrieval metadata, not instructions or authorization. Hosts may
suggest topical tags for a capture draft, but inferred tags remain part of the
user-confirmed draft and must never trigger a silent write.

## Confidence

Confidence is a number from `0.0` to `1.0`.

The MVP should default explicit user-approved memories to `1.0`.

Inferred or suggested memories should not be saved without confirmation. If saved, they can use lower confidence and include source metadata.

Confidence is not an authorization or instruction-priority signal. Recalled
content remains stored data even when confidence is `1.0`.

## Source, Provenance, And Recall Trust

`source` records attribution supplied by the writer, such as `codex:mcp` or an
import path. It helps users audit where a memory came from, but it is not an
authenticated identity and must not grant additional authority.

Audit event `actor` records the Nuzo surface that performed an operation, such
as `nuzo:cli`, `nuzo:mcp`, `core`, or a test/import actor. `source` belongs to
the memory record; `actor` belongs to an event. Together they provide
provenance for explicit writes, confirmed capture, imports, CLI actions, MCP
actions, and host integrations.

Audit payloads are metadata-only. They may include scope, tags, kind, count,
reason, changed fields, query, or score, but they must not retain memory
content. This keeps hard-deleted memory content deleted while preserving enough
history to verify that a delete occurred.

During recall, every memory's content is treated as untrusted stored data.
This includes explicit user writes, confirmed capture, imported memories, and
records shared by multiple hosts. The `instruction` kind describes intended
future usefulness; it does not place content in the host's system, developer,
plugin, or current-user instruction hierarchy.

Automatic lifecycle context preserves bounded content with its ID, revision,
scope, kind, tags, and source inside the rendering contract defined by
[Memory Trust Boundary](../architecture/memory-trust-boundary.md).

## Lifecycle

```text
suggested -> created -> updated -> archived -> deleted
```

Deletion should support two modes:

- archive: hide from recall but retain audit metadata;
- hard delete: remove content from the store.

## Revisions

Each memory has a monotonically increasing `revision`.

The initial revision is `1`. Updates, archive operations, hard deletes, and
explicit recall-usage metadata writes compare against the revision that was
read before the write transaction. If another process commits a newer revision
first, the operation must fail with `MEMORY_REVISION_CONFLICT` instead of
silently overwriting the newer state.

Clients that edit or delete a memory after showing it to a user should pass the
last seen revision as `expected_revision`. If the current revision differs,
the client should re-read the memory, show the newer state, and ask the user to
confirm the operation again.

Import deduplication uses the normalized memory identity of scope, kind,
content, and tags. For the SQLite MVP, import planning runs inside the write
transaction so equivalent concurrent imports serialize deterministically. A
database-level normalized uniqueness index remains optional future hardening if
Nuzo adds storage adapters without equivalent transactional behavior.

## Retrieval Result

Recall responses should include enough context for the agent to use memory responsibly:

```json
{
  "memory": {
    "id": "mem_01HZY...",
    "revision": 1,
    "kind": "preference",
    "content": "The user prefers concise implementation plans before large edits.",
    "tags": ["codex", "workflow"]
  },
  "score": 0.82,
  "scope": "user:default",
  "reason": "Matched query terms: concise, plans, edits"
}
```
