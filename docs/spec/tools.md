# Tool Contract

Nuzo should expose the same core operations through MCP and CLI.

## MCP Tools

### Common Input Rules

MCP schemas reject malformed memory selectors before handlers run:

- `scope` must match `<kind>:<id>`.
- Supported scope kinds are `user`, `project`, `agent`, and `team`.
- Scope IDs may contain letters, numbers, `.`, `_`, `~`, `:`, `/`, and `-`.
- `tags` must be lowercase labels starting with a letter or number.
- Tags may contain lowercase letters, numbers, `.`, `_`, and `-`, up to 64 characters.
- Memory writes and filters accept at most 32 tags.
- Memory content is limited to 8,000 characters.
- Recall queries are limited to 2,000 characters.
- Scope and memory identifiers are limited to 256 characters.
- Import documents are limited to 1,000 memories.

Selectors are not authorization. A syntactically valid scope only says which
records a caller is asking for. Core policy must still decide whether that
caller may access the scope.

For MCP and host-plugin calls, `project:auto` is a reserved convenience
selector. The server resolves it to a stable `project:<path-hash>` derived from
the active host project directory before calling core. It must never be stored
or queried as one shared literal project scope.

The published MCP runtime uses the shared Nuzo runtime resolver. Operators can
set `NUZO_MEMORY_STORE`, `NUZO_MEMORY_SCOPE`, and `NUZO_AUTHORIZED_SCOPES`
before launching `nuzo-mcp-server`. When `NUZO_MEMORY_SCOPE` or project config
sets a default scope, MCP tool schemas expose that resolved scope as the
default instead of always advertising `user:default`.

Restricted MCP or host-plugin sessions can be configured with an explicit
scope allowlist. In restricted mode:

- writes are allowed only for allowlisted scopes;
- list, export, and bulk forget require an explicit allowlisted scope;
- `include_global` requires `user:default` to be explicitly allowlisted;
- update, archive, and delete require authorization for the memory's current
  scope, and updates that move a memory require authorization for the target
  scope as well;
- history requires authorization for the target memory's current scope and
  fails closed when that scope cannot be established.

Denied scope access returns `MEMORY_SCOPE_FORBIDDEN`. Restricted unscoped list,
export, or bulk destructive operations return `MEMORY_SCOPE_REQUIRED`.

Domain errors returned by MCP tools use a JSON text envelope:

```json
{
  "code": "MEMORY_SCOPE_FORBIDDEN",
  "message": "Memory scope is not authorized.",
  "details": {
    "scope": "project:nuzo"
  }
}
```

`code` is the stable machine-readable field. `message` is human-readable and
may be clarified compatibly. `details` is optional and is omitted when including
it could reveal unauthorized memory metadata, for example a forbidden memory's
current scope during an ID-based history, update, or forget operation.

The local CLI defaults to administrator mode for the selected local store.
Use separate stores or a restricted MCP runtime when a repository-controlled
agent should not enumerate unrelated memory.

### `memory.remember`

Store a memory.

Inferred host capture must not call this tool directly; use
`memory.confirm_capture` after the user confirms a capture draft. Direct
library-style integrations may still use `memory.remember` for explicit writes.
See `docs/spec/capture-suggestions.md`.

Input:

```json
{
  "content": "The user prefers SQLite for local-first prototypes.",
  "kind": "preference",
  "scope": "user:default",
  "tags": ["storage", "architecture"],
  "source": "codex:mcp"
}
```

Output:

```json
{
  "id": "mem_01HZY...",
  "created": true,
  "warnings": []
}
```

### `memory.recall`

Find relevant memories.

Normal recall is read-only with respect to memory metadata and audit history.
It does not store the query or update `last_used_at` by default.

Input:

```json
{
  "query": "How should I design local storage for this plugin?",
  "scope": "project:auto",
  "limit": 8,
  "include_global": true,
  "retrieval_mode": "hybrid"
}
```

When `include_global` is true, recall should include the requested scope plus `user:default`. It should not search unrelated project, team, or agent scopes.

`retrieval_mode` is optional and accepts `fts`, `semantic`, or `hybrid`.
Omission means `fts` and preserves the `0.6.0` behavior. `semantic_fallback` is
also optional and accepts `error` or `fts`. Strict semantic mode errors by
default when its provider or index is unavailable. Hybrid always falls back
read-only to FTS and reports why.

Output:

```json
{
  "results": [
    {
      "id": "mem_01HZY...",
      "revision": 1,
      "content": "The user prefers SQLite for local-first prototypes.",
      "score": 0.91,
      "scope": "user:default",
      "reason": "Matched storage and local-first terms."
    }
  ],
  "retrieval": {
    "requested_mode": "hybrid",
    "effective_mode": "hybrid",
    "semantic_fallback_code": null
  }
}
```

`retrieval` is present when a non-FTS mode is requested. It remains present
when `results` is empty, so clients can distinguish successful semantic or
hybrid retrieval from FTS fallback. Fallback sets `effective_mode` to `fts`
and supplies a stable semantic error code.

The optional semantic model and derived sidecar are provisioned and rebuilt by
the local operator. The MCP tool cannot download a model, rebuild an index, or
turn retrieval into a write operation. `memory.recall_hook` remains FTS-only
in `0.7.0`.

### `memory.recall_hook`

Prototype read-only recall entrypoint for host lifecycle hooks.

This tool exists so Codex, Claude Code, or another MCP-compatible host can recall relevant context at the start of a task without introducing automatic memory capture.

It never creates memories and does not produce capture suggestions. Confirmed
host capture still goes through `memory.confirm_capture`.

Input:

```json
{
  "task_context": "Continue work on the Nuzo MCP plugin packaging.",
  "project_scope": "project:auto",
  "limit": 5
}
```

Behavior:

- builds a concise recall query from `task_context`;
- searches `project_scope` plus `user:default`;
- limits results to 1-8 memories;
- does not update `last_used_at` or append recall audit events;
- returns inspectable recall results and read-only metadata.

Output:

```json
{
  "mode": "read_only",
  "memory_writes": false,
  "capture_suggestions": false,
  "query": "Continue work on the Nuzo MCP plugin packaging.",
  "scope": "project:auto",
  "include_global": true,
  "limit": 5,
  "results": []
}
```

### `memory.suggest_capture`

Validate and normalize an inferred memory draft before asking the user whether
to save or update it.

This tool is read-only. It must not create memory records, append audit events,
update usage metadata, or persist rejected drafts. Candidate detection stays in
the host or agent; Nuzo validates the proposed draft. Exact duplicate checking
is the compatibility default. Callers may explicitly request bounded
relationship evidence in `0.6.0`.

Input:

```json
{
  "content": "The user prefers concise final answers.",
  "kind": "preference",
  "scope": "user:default",
  "tags": ["workflow"],
  "source": "codex:capture-suggestion",
  "confidence": 0.72,
  "reason": "The user stated a recurring response style preference."
}
```

Optional relationship input:

```json
{
  "relationship_mode": "bounded"
}
```

`relationship_mode` is optional and accepts `exact` or `bounded`. Omission
means `exact`. The partial example above is combined with the normal draft
input; it is not a separate tool call. Relationship meanings and core evidence
invariants are defined in [Capture Suggestions](capture-suggestions.md).

Behavior:

- applies the same core validation, scope authorization, tag rules, confidence
  rules, and secret scanning as `memory.remember`;
- trims content and de-duplicates tags in the returned draft;
- checks active memories in the same scope for exact normalized content
  duplicates;
- when `relationship_mode` is `bounded`, evaluates the versioned relationship
  contract after the exact check;
- returns `requires_confirmation: true` for every successful response;
- returns `memory_writes: false` and does not persist the draft.

Duplicate matching is intentionally narrow: case-insensitive, whitespace-collapsed
content equality within the same active scope. Tags, kind, source, and confidence
do not make identical content a new suggestion. This exact check remains
deterministic in bounded mode and is separate from ranked candidate limits.

When relationship mode is omitted or `exact`, the following `ready` and
`duplicate` responses remain unchanged from `0.5.0`.

Output when ready to ask the user:

```json
{
  "status": "ready",
  "memory_writes": false,
  "requires_confirmation": true,
  "draft": {
    "content": "The user prefers concise final answers.",
    "kind": "preference",
    "scope": "user:default",
    "tags": ["workflow"],
    "source": "codex:capture-suggestion",
    "confidence": 0.72,
    "reason": "The user stated a recurring response style preference."
  },
  "duplicate": null
}
```

Output when an exact active duplicate exists:

```json
{
  "status": "duplicate",
  "memory_writes": false,
  "requires_confirmation": true,
  "draft": {
    "content": "The user prefers concise final answers.",
    "kind": "preference",
    "scope": "user:default",
    "tags": ["workflow"],
    "source": "codex:capture-suggestion",
    "confidence": 0.72,
    "reason": "The user stated a recurring response style preference."
  },
  "duplicate": {
    "id": "mem_01HZY...",
    "revision": 1,
    "content": "The user prefers concise final answers.",
    "kind": "preference",
    "scope": "user:default",
    "tags": ["workflow"],
    "source": "codex:mcp",
    "confidence": 1,
    "created_at": "2026-06-19T00:00:00.000Z",
    "updated_at": "2026-06-19T00:00:00.000Z",
    "last_used_at": null,
    "archived_at": null
  }
}
```

Bounded output for an update candidate:

```json
{
  "status": "review",
  "memory_writes": false,
  "requires_confirmation": true,
  "draft": {
    "content": "The user prefers detailed final answers.",
    "kind": "preference",
    "scope": "user:default",
    "tags": ["workflow"],
    "source": "codex:capture-suggestion",
    "confidence": 0.72,
    "reason": "The user changed a recurring response style preference."
  },
  "duplicate": null,
  "relationship_mode": "bounded",
  "relationship": "update_candidate",
  "relationship_evidence": {
    "version": 1,
    "primary_memory_id": "mem_01HZY...",
    "candidate_limit": 20,
    "returned_limit": 3,
    "evaluated_count": 2,
    "search_exhaustive": true,
    "evidence_truncated": false,
    "reason": "The draft changes an existing response-style preference.",
    "candidates": [
      {
        "memory": {
          "id": "mem_01HZY...",
          "revision": 3,
          "content": "The user prefers concise final answers.",
          "kind": "preference",
          "scope": "user:default",
          "tags": ["workflow"],
          "source": "codex:mcp",
          "confidence": 1,
          "created_at": "2026-06-19T00:00:00.000Z",
          "updated_at": "2026-06-28T00:00:00.000Z",
          "last_used_at": null,
          "archived_at": null
        },
        "matched_terms": ["user", "prefers", "final", "answers"],
        "matched_tags": ["workflow"],
        "reason": "Same scoped preference and subject with changed detail."
      }
    ]
  }
}
```

Bounded status mapping:

| `relationship` | `status` | Required client behavior |
| --- | --- | --- |
| `exact_duplicate` | `duplicate` | Show the existing memory and default to no write. |
| `update_candidate` | `review` | Offer `memory.update` only after confirmation. |
| `related` | `review` | Ask whether the draft should remain separate. |
| `independent` | `ready` | Offer `memory.remember` only after confirmation. |
| `uncertain` | `review` | Ask for clarification and do not offer a default write. |

Bounded response additions:

| Field | Contract |
| --- | --- |
| `relationship_mode` | Always `bounded`; required by clients that requested bounded mode. |
| `relationship` | One value from the mapping above. |
| `relationship_evidence.version` | `1`. |
| `primary_memory_id` | First candidate ID for exact, update, or related; otherwise `null`. |
| `candidate_limit` | Always `20`. |
| `returned_limit` | Always `3`. |
| `evaluated_count` | Integer from `0` through `20`. |
| `search_exhaustive` | Whether retrieval proved no omitted candidate could change the decision. |
| `evidence_truncated` | Whether qualifying evidence was omitted from the returned list. |
| `reason` | At most 1,000 characters and must explain the top-level relationship. |
| `candidates` | Zero to three active same-scope memory records with bounded matching evidence. |

Each candidate contains a normal public memory record, up to 8
`matched_terms`, up to 8 `matched_tags`, and a reason of at most 1,000
characters. Candidates are ordered strongest first. Archived or cross-scope
records must never appear. Equivalent evidence is ordered by memory ID
ascending for deterministic output.

For `independent`, `primary_memory_id` is `null`, `candidates` is empty,
`search_exhaustive` is true, and `evidence_truncated` is false. If evidence is
ambiguous, or a non-exhaustive search cannot safely establish independence,
the result must be `uncertain` instead.

An exact duplicate short-circuits broader classification and returns exactly
one bounded candidate with `evaluated_count: 1`, `search_exhaustive: true`, and
`evidence_truncated: false`.

Policy or authorization failures retain their existing structured errors and
do not return relationship output. Relationship analysis never creates a
memory, audit event, usage update, or stored draft.

Compatibility rules:

- clients that omit `relationship_mode` keep the exact-only response shape;
- clients that request bounded mode must require the matching response marker;
- an unknown-input error or missing marker means the server is older or did
  not honor bounded mode;
- that fallback must not be interpreted as `independent`;
- the legacy `duplicate` field remains populated only for an exact duplicate
  and refers to the same memory as bounded primary evidence.

If the user confirms or edits a ready draft, the host must call
`memory.confirm_capture` with the final user-approved fields and explicit
decision. A duplicate response is advisory; hosts should normally show the
existing memory and avoid asking for a new write unless the user explicitly
wants a separate memory. A bounded `update_candidate` uses
`memory.confirm_capture` with `decision: "update"`, the displayed ID, and the
displayed revision only after confirmation. `related` and `uncertain` require a
user decision before any write path is offered.

### `memory.confirm_capture`

Apply an explicit user decision for a previously suggested capture draft.

This tool is the confirmed-write companion to `memory.suggest_capture`. It does
not infer user intent. Callers must pass the final user-approved draft fields
and the explicit decision.

Input for confirmed creation:

```json
{
  "decision": "create",
  "content": "The user prefers concise final answers.",
  "kind": "preference",
  "scope": "user:default",
  "tags": ["workflow"],
  "source": "codex:capture-confirmed",
  "confidence": 0.72,
  "reason": "The user confirmed the draft.",
  "confirm": true
}
```

Input for confirmed replacement:

```json
{
  "decision": "update",
  "target_memory_id": "mem_01HZY...",
  "expected_revision": 3,
  "content": "The user prefers detailed final answers.",
  "kind": "preference",
  "scope": "user:default",
  "tags": ["workflow"],
  "source": "codex:capture-confirmed",
  "reason": "The user confirmed the replacement.",
  "confirm": true
}
```

Supported decisions:

| `decision` | Behavior |
| --- | --- |
| `create` | Create through the canonical remember path only when `confirm` is `true`; exact active duplicates are skipped by default. |
| `update` | Update `target_memory_id` through the canonical update path using `expected_revision`; conflicts return `MEMORY_REVISION_CONFLICT`. |
| `keep_separate` | Create a separate memory through the canonical remember path only when `confirm` is `true`. |
| `clarify` | Write nothing and return `needs_clarification`. |
| `reject` | Write nothing and return `skipped`. |

Output:

```json
{
  "decision": "update",
  "status": "updated",
  "memory_writes": true,
  "requires_confirmation": false,
  "reason": "The user confirmed the replacement.",
  "memory": {
    "id": "mem_01HZY...",
    "revision": 4,
    "content": "The user prefers detailed final answers.",
    "kind": "preference",
    "scope": "user:default",
    "tags": ["workflow"],
    "source": "codex:capture-confirmed",
    "confidence": 0.72,
    "created_at": "2026-06-19T00:00:00.000Z",
    "updated_at": "2026-06-28T00:00:00.000Z",
    "last_used_at": null,
    "archived_at": null
  }
}
```

`create`, `keep_separate`, and `update` require `confirm: true`. `reject` and
`clarify` ignore `confirm` and must not create memories, audit events, usage
updates, stored drafts, or hidden notes. Confirmed writes remain subject to the
same policy checks as direct `memory.remember` and `memory.update` calls.

Revision conflicts are never retried silently. A client must re-read the memory
and ask the user to confirm again before calling `memory.confirm_capture` or
`memory.update` with a newer `expected_revision`.

### `memory.list`

List memories by filters.

Input:

```json
{
  "scope": "user:default",
  "tags": ["architecture"],
  "include_archived": false
}
```

### `memory.update`

Edit metadata or content for a memory.

`expected_revision` is optional but recommended when the caller is editing a
memory it previously listed or recalled. If provided and the stored revision no
longer matches, the operation fails with `MEMORY_REVISION_CONFLICT`.

Input:

```json
{
  "id": "mem_01HZY...",
  "expected_revision": 1,
  "content": "The user prefers SQLite for simple local-first prototypes.",
  "tags": ["storage", "architecture", "sqlite"]
}
```

Output includes the updated memory and its next revision.

Revision conflicts are returned as structured tool errors:

```json
{
  "code": "MEMORY_REVISION_CONFLICT",
  "message": "Memory changed before this operation could commit.",
  "details": {
    "id": "mem_01HZY...",
    "expectedRevision": 1,
    "currentRevision": 2
  }
}
```

Hosts should re-read the memory and ask the user to confirm the updated draft
again instead of retrying silently.

### `memory.history`

List the audit history for one memory ID.

This is a read-only operation. The unrestricted local administrator workflow
can inspect audit metadata after hard deletion so users can verify that the
deletion occurred. Restricted sessions authorize history against the target
memory's current scope before returning events. Because `memory.history` does
not accept a scope selector, a restricted session fails closed with
`MEMORY_SCOPE_REQUIRED` when the memory is missing or hard-deleted and its
current scope can no longer be established.

Input:

```json
{
  "id": "mem_01HZY..."
}
```

Output:

```json
{
  "events": [
    {
      "id": "evt_01HZY...",
      "memory_id": "mem_01HZY...",
      "event_type": "memory.created",
      "actor": "nuzo:mcp",
      "payload": {
        "kind": "preference",
        "scope": "user:default",
        "tags": ["workflow"]
      },
      "created_at": "2026-06-19T00:00:00.000Z"
    }
  ]
}
```

The tool returns only events associated with the requested memory ID. It does
not include memory content or events from other memories.

### `memory.audit`

List bounded store-wide audit events.

This is a read-only operation. It exposes audit metadata, not memory content.
Use it when a user needs to answer what changed in a store, which actor caused
the change, or whether global events such as exports occurred.

Input:

```json
{
  "memory_id": "mem_01HZY...",
  "event_type": ["memory.exported"],
  "actor": "nuzo:mcp",
  "scope": "project:abc123",
  "since": "2026-06-19T00:00:00.000Z",
  "until": "2026-06-20T00:00:00.000Z",
  "limit": 50
}
```

All filters are optional. `limit` defaults to `50` and must be between `1` and
`200`. `event_type` accepts:

- `memory.created`;
- `memory.updated`;
- `memory.archived`;
- `memory.deleted`;
- `memory.imported`;
- `memory.exported`;
- `memory.recalled`.

Output:

```json
{
  "events": [
    {
      "id": "evt_01HZY...",
      "memory_id": null,
      "event_type": "memory.exported",
      "actor": "nuzo:mcp",
      "payload": {
        "scope": "project:abc123",
        "tags": [],
        "includeArchived": false,
        "count": 3
      },
      "created_at": "2026-06-19T00:00:00.000Z"
    }
  ]
}
```

`memory_id: null` means the event applies to the store or operation rather
than one memory record. Export events are global events.

Restricted runtime mode must not reveal unauthorized scopes. A restricted
session may query audit by an authorized `scope` or by a `memory_id` whose
current memory record is still present and authorized. A broad audit query
without scope is rejected in restricted mode.

### `memory.forget`

Archive or delete a memory.

Input:

```json
{
  "id": "mem_01HZY...",
  "expected_revision": 1,
  "mode": "archive",
  "reason": "No longer accurate."
}
```

### `memory.forget_many`

Preview or apply a filtered bulk archive/delete operation.

Dry-run is the default. A request must select memories by `scope`, `tags`, or
explicit `all: true`. An empty selector is rejected, and `all` cannot be
combined with filters.

Input:

```json
{
  "scope": "project:auto",
  "tags": ["obsolete"],
  "all": false,
  "mode": "archive",
  "dry_run": true,
  "confirm": false,
  "reason": "Project decision was replaced."
}
```

Output:

```json
{
  "matched": 2,
  "affected": 0,
  "mode": "archive",
  "dry_run": true,
  "ids": ["mem_01HZY...", "mem_01HZZ..."]
}
```

To apply an archive, set `dry_run` to `false`. Hard deletion also requires
`confirm: true`.

### `memory.export`

Export memories as a versioned JSON document.

This is the Nuzo portability format. Codex, Claude Code, and future host plugins should expose this same tool instead of creating host-specific export formats.

JSON export version `1` preserves memory record provenance fields that are part
of the memory model, including `source`, scope, kind, tags, confidence, and
timestamps. It does not export audit history. Export itself appends a
store-wide `memory.exported` audit event with `memory_id: null`.

The MCP tool returns JSON only. The CLI can also render the same document as
Markdown for human review based on the output path extension. Markdown exports
are not import inputs.

Input:

```json
{
  "scope": "user:default",
  "tags": [],
  "include_archived": false
}
```

### `memory.import`

Import memories from a documented file format.

Imports accept Nuzo JSON export documents. A memory export created through Nuzo in one host should be importable through Nuzo in another host, as long as both hosts use compatible Nuzo versions.

Import preserves each imported memory's exported `source` field unless the
caller supplies a replacement scope. Import appends `memory.imported` audit
events using the importing surface as `actor` and records `originalScope`,
effective `scope`, and archive state in metadata-only payloads.

Imports should be idempotent for exact memory equivalents. If a target store already has a memory with the same scope, kind, normalized content, and normalized tags, the import should skip that item instead of creating a duplicate.

Input:

```json
{
  "document": {
    "format": "nuzo-memory-export",
    "version": 1,
    "exported_at": "2026-06-13T00:00:00.000Z",
    "memories": []
  },
  "scope": "user:default",
  "dry_run": true
}
```

### `memory.doctor`

Run safety and environment checks.

CLI checks:

- memory path exists;
- Git is not tracking local memory files;
- network access is disabled.

MCP doctor returns a read-only diagnostic summary for host agents:

```json
{
  "ok": true,
  "network": "disabled",
  "store": {
    "path": "~/.nuzo/memory/memories.sqlite",
    "readable": true,
    "writable_check": "writable"
  },
  "schema": {
    "current_version": 1,
    "supported_version": 1,
    "status": "current"
  },
  "counts": {
    "active_memories": 4,
    "archived_memories": 1,
    "total_memories": 5
  },
  "integrity": {
    "ok": true,
    "path": "~/.nuzo/memory/memories.sqlite",
    "schema_version": 2,
    "supported_schema_version": 2,
    "integrity_check": "ok",
    "foreign_key_violations": 0,
    "memory_count": 5,
    "active_memory_count": 4,
    "fts_row_count": 4,
    "missing_fts_rows": 0,
    "orphan_fts_rows": 0,
    "errors": [],
    "status": "ok"
  },
  "lifecycle": {
    "recall_hook": "available",
    "automatic_host_hooks": "verify_in_host",
    "autoload_tag": "autoload",
    "supported_events": ["SessionStart", "UserPromptSubmit"]
  },
  "tools": [
    "memory.remember",
    "memory.recall",
    "memory.recall_hook",
    "memory.suggest_capture",
    "memory.confirm_capture",
    "memory.list",
    "memory.update",
    "memory.history",
    "memory.forget",
    "memory.forget_many",
    "memory.export",
    "memory.import",
    "memory.doctor"
  ],
  "warnings": []
}
```

The MCP response must not include memory content, tags, sources, or export
documents. Counts and integrity fields are aggregate metadata-only diagnostics.
`integrity.status` is `ok`, `failed`, `missing`, or `not_performed`.

Runtime checks:

- schema is current;
- store path is readable;
- store path and parent directory are writable without creating durable memory.
- SQLite `integrity_check`, foreign keys, schema version, memory counts, and
  FTS row consistency are healthy when a store path is available.

Lifecycle diagnostics distinguish runtime capability from host activation.
`automatic_host_hooks: verify_in_host` means the user must still verify that
the plugin hook is enabled and trusted in Codex or Claude Code. MCP cannot
inspect or override that host-level decision.

Handler-only integrations that do not provide runtime diagnostics return
`not_performed` explicitly. Future checks may inspect exports for obvious
secrets.

## CLI Commands

```bash
nuzo memory init
nuzo memory remember "The user prefers concise output." --kind preference --tag codex
nuzo memory suggest-capture "The user prefers concise output." --kind preference --reason "Durable response style preference."
nuzo memory confirm-capture "The user prefers concise output." --decision create --kind preference --reason "User confirmed the draft." --yes
nuzo memory recall "output style"
nuzo memory list --tag codex
nuzo memory list --all-scopes
nuzo memory update mem_01HZY --expected-revision 1 --content "The user prefers concise final answers."
nuzo memory history mem_01HZY
nuzo memory forget mem_01HZY --expected-revision 2 --archive
nuzo memory forget-many --tag obsolete
nuzo memory forget-many --scope project:auto --apply
nuzo memory export --path ./memories.memory.export.json
nuzo memory export --path ./memories.memory.export.md
nuzo memory import ./memories.memory.export.json --dry-run
nuzo memory doctor
```

`project:auto` values written literally by versions before `0.2.1` cannot be
assigned automatically because the original project path was not stored.
`nuzo memory doctor` reports active legacy records. Review them with
`nuzo memory list --all-scopes`, then run `nuzo memory update <id> --scope
project:auto` from the intended project directory to move each record to that
project's resolved scope.
