# Stage 1: Core Implementation Plan

Stage 1 creates the local memory lifecycle without depending on CLI, MCP, or Codex plugin code.

## Goal

Build a core package that can:

- initialize a local store;
- remember memories;
- recall memories with full-text search;
- list memories;
- update memories;
- archive or delete memories;
- export and import memories;
- record audit events;
- reject obvious secrets.

## Package Boundary

Current package:

```text
packages/core/
```

The core should expose use cases instead of transport-specific handlers.

Recommended use cases:

```text
rememberMemory
recallMemories
listMemories
updateMemory
forgetMemory
exportMemories
importMemories
runDoctor
```

The initial scaffold currently defines domain types and ports in:

```text
packages/core/src/index.ts
```

The first implementation slice also includes:

- `createMemoryService`;
- `DefaultPolicyEngine`;
- `RegexSecretScanner`;
- in-memory adapters for tests;
- Vitest coverage for remember, recall, archive, hard-delete confirmation, and secret rejection.

## Ports

Core should depend on interfaces:

```text
MemoryStore
SearchIndex
AuditLog
Clock
IdGenerator
SecretScanner
PolicyEngine
```

Initial adapters:

```text
SQLiteMemoryStore
SQLiteFtsSearchIndex
SQLiteAuditLog
RegexSecretScanner
```

## Storage

Initial SQLite tables:

- `memories`
- `memory_events`
- `memories_fts`

See `docs/architecture/storage.md` for schema details.

## Validation

The core should validate:

- required fields;
- supported memory kinds;
- supported scopes;
- tag shape;
- confidence range;
- destructive action confirmation;
- likely secret content.

## Tests

Required Stage 1 tests:

- init creates schema;
- init is idempotent;
- remember stores a memory;
- remember rejects obvious secrets;
- recall returns relevant FTS results;
- list filters by scope and tag;
- update records an audit event;
- archive hides memory from recall;
- hard delete requires confirmation;
- export/import round trip works;
- doctor detects tracked memory files.

## Exit Criteria

Stage 1 is done when the core can run in tests without CLI, MCP, or Codex-specific code.
