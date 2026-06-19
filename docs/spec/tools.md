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
  "tools": [
    "memory.remember",
    "memory.recall",
    "memory.recall_hook",
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

Handler-only integrations that do not provide runtime diagnostics return
`not_performed` explicitly. Future checks may inspect exports for obvious
secrets.

## CLI Commands

```bash
nuzo memory init
nuzo memory remember "The user prefers concise output." --kind preference --tag codex
nuzo memory recall "output style"
nuzo memory list --tag codex
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
