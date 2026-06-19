# Storage Architecture

## Default Locations

User-level memory:

```text
~/.nuzo/memory/memories.sqlite
```

Project-level memory:

```text
<project>/.nuzo/memory/memories.sqlite
```

Temporary exports:

```text
~/.nuzo/memory/exports/
```

Operational logs:

```text
~/.nuzo/memory/logs/
```

## Scope Resolution

Memory lookup should search scopes in this order:

1. Active project scope.
2. User global scope.
3. Optional organization/team scope.

The response must include which scope produced each result.

## SQLite Tables

The current schema version is `1`. Nuzo stores it in SQLite `user_version` and
rejects databases created by newer unsupported Nuzo versions with the
structured `MEMORY_SCHEMA_UNSUPPORTED` error.

Initial schema:

```sql
CREATE TABLE memories (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  kind TEXT NOT NULL,
  content TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]',
  source TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 1.0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_used_at TEXT,
  archived_at TEXT
);

CREATE TABLE memory_events (
  id TEXT PRIMARY KEY,
  memory_id TEXT,
  event_type TEXT NOT NULL,
  actor TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE VIRTUAL TABLE memories_fts USING fts5(
  id UNINDEXED,
  scope UNINDEXED,
  content,
  tags
);
```

## Audit Log

Every write operation creates an event:

- `memory.created`
- `memory.updated`
- `memory.archived`
- `memory.deleted`
- `memory.imported`
- `memory.exported`
- `memory.recalled`

Recall events are opt-in because queries may contain sensitive task context and
can grow quickly. Normal CLI and MCP recall do not record query text or update
`last_used_at` by default. A caller must explicitly request usage recording
through the core API.

## Transaction Guarantees

SQLite-backed logical mutations commit memory rows, FTS changes, and audit
events atomically.

- remember, update, forget, and usage-recording recall use one transaction per
  command;
- import uses one transaction for the complete planned document and rolls back
  every item if any persistence step fails;
- bulk forget uses one transaction per matched memory, so an unexpected failure
  may leave earlier memories committed while the failing memory is rolled back;
- dry runs do not open write transactions.

Policy validation and import planning happen before write transactions.

SQLite uses WAL mode and a five-second busy timeout so short concurrent writes
from multiple local agent processes wait instead of failing immediately.

## Local Permissions

Nuzo-created SQLite databases, WAL/SHM sidecars, config files, and exports use
owner-only `0600` permissions. Nuzo-owned memory, export, and log directories
use `0700` when created.

Project config accepts only the portable
`.nuzo/memory/memories.sqlite` storage path. Absolute paths, traversal, and
symlinked `.nuzo` paths are rejected so repository-controlled config cannot
redirect writes outside the project.

## Secrets And Sensitive Data

The MVP should reject obvious secret-like values:

- API keys;
- private keys;
- passwords;
- auth tokens;
- cookie/session blobs.

The CLI should include a diagnostic command that reports whether any memory database or export file is tracked by Git.

## Scope Boundary

Scopes organize recall and lifecycle operations; they are not authorization
boundaries in `0.1.x`. A process with access to one Nuzo store can potentially
request other scopes or unscoped list/export operations. Use separate stores
when host or project isolation is required until a scoped authorization policy
is implemented.
