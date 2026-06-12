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

Recall events may be configurable because they can grow quickly.

## Secrets And Sensitive Data

The MVP should reject obvious secret-like values:

- API keys;
- private keys;
- passwords;
- auth tokens;
- cookie/session blobs.

The CLI should include a diagnostic command that reports whether any memory database or export file is tracked by Git.
