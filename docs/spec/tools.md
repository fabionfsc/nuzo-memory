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

Restricted MCP or host-plugin sessions can be configured with an explicit
scope allowlist. In restricted mode:

- writes are allowed only for allowlisted scopes;
- list, export, and bulk forget require an explicit allowlisted scope;
- `include_global` requires `user:default` to be explicitly allowlisted;
- update, archive, and delete require authorization for the memory's current
  scope, and updates that move a memory require authorization for the target
  scope as well.

Denied scope access returns `MEMORY_SCOPE_FORBIDDEN`. Restricted unscoped list,
export, or bulk destructive operations return `MEMORY_SCOPE_REQUIRED`.

The local CLI defaults to administrator mode for the selected local store.
Use separate stores or a restricted MCP runtime when a repository-controlled
agent should not enumerate unrelated memory.

### `memory.remember`

Store a memory.

Inferred memories must not call this tool until the user confirms a capture draft. See `docs/spec/capture-suggestions.md`.

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
  "include_global": true
}
```

When `include_global` is true, recall should include the requested scope plus `user:default`. It should not search unrelated project, team, or agent scopes.

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
  ]
}
```

### `memory.recall_hook`

Prototype read-only recall entrypoint for host lifecycle hooks.

This tool exists so Codex, Claude Code, or another MCP-compatible host can recall relevant context at the start of a task without introducing automatic memory capture.

It never creates memories and does not produce capture suggestions. Confirmed writes still go through `memory.remember`.

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
to save it.

This tool is read-only. It must not create memory records, append audit events,
update usage metadata, or persist rejected drafts. Candidate detection stays in
the host or agent; Nuzo validates the proposed draft and reports whether an
equivalent active memory already exists in the same scope.

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

Behavior:

- applies the same core validation, scope authorization, tag rules, confidence
  rules, and secret scanning as `memory.remember`;
- trims content and de-duplicates tags in the returned draft;
- checks active memories in the same scope for exact normalized content
  duplicates;
- returns `requires_confirmation: true` for every successful response;
- returns `memory_writes: false` and does not persist the draft.

Duplicate matching is intentionally narrow: case-insensitive, whitespace-collapsed
content equality within the same active scope. Tags, kind, source, and confidence
do not make identical content a new suggestion. Broader semantic duplicate
detection is a future ranking feature, not part of this MVP contract.

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

If the user confirms or edits a ready draft, the host must call
`memory.remember` with the final user-approved fields. A duplicate response is
advisory; hosts should normally show the existing memory and avoid asking for a
new write unless the user explicitly wants a separate memory.

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

This is a read-only operation. Audit metadata remains available after hard
deletion so users can verify that the deletion occurred.

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
documents. Counts are aggregate diagnostics only.

Runtime checks:

- schema is current;
- store path is readable;
- store path and parent directory are writable without creating durable memory.

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
