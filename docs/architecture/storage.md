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

The current schema version is `2`. Nuzo stores it in SQLite `user_version` and
rejects databases created by newer unsupported Nuzo versions with the
structured `MEMORY_SCHEMA_UNSUPPORTED` error.

Initial schema:

```sql
CREATE TABLE memories (
  id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL DEFAULT 1,
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

## Optional Semantic Sidecar

Optional semantic vectors are not part of the canonical schema above. They
live in `memories.semantic.sqlite`, beside the configured canonical store.
The sidecar contains provider fingerprint, build metadata, memory ID, canonical
revision, scope, and derived vector data. It contains no audit log and does not
own memory lifecycle.

The sidecar is derived, disposable, and excluded from export. Deleting it is a
safe way to disable or reset semantic retrieval. Rebuilding reads active
canonical memory into a temporary sidecar and replaces the previous completed
index only after validation. Canonical writes do not invoke an embedding
provider and therefore cannot be rolled back by semantic failure.

See [Optional Semantic Retrieval](../spec/semantic-retrieval.md) for provider,
staleness, fallback, and scope contracts.

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

Policy validation happens before write transactions. Import duplicate planning
happens inside the write transaction so equivalent imports from multiple local
processes serialize deterministically.

SQLite uses WAL mode and a five-second busy timeout so short concurrent writes
from multiple local agent processes wait instead of failing immediately.

Memory rows include a monotonically increasing `revision`. Stateful writes use
compare-and-swap semantics and return `MEMORY_REVISION_CONFLICT` when another
process commits a newer row before the operation can commit.

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

Scopes organize recall and lifecycle operations, but selectors alone are not
authorization boundaries. Nuzo can run a restricted core or MCP session with
an explicit scope allowlist; cross-scope reads, writes, exports, and
destructive operations are then rejected.

An unrestricted local CLI or core session remains an administrator workflow
over the store and can access every scope. Use restricted sessions for
repository-controlled hosts, and use separate stores when process-level or
machine-level isolation is required.
