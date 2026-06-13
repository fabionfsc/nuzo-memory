# Testing Strategy

Testing should protect the project contracts before implementation details.

## Test Pyramid

1. Core unit tests.
2. Storage integration tests with temporary SQLite databases.
3. CLI contract tests.
4. MCP tool contract tests.
5. End-to-end smoke tests.

## Required MVP Tests

- init creates expected directories and database;
- init is idempotent;
- remember stores valid memories;
- remember rejects obvious secrets;
- recall returns relevant FTS results;
- list filters by scope and tag;
- update records audit event;
- forget archives by default;
- hard delete requires explicit confirmation;
- export produces valid versioned format;
- import dry-run reports planned changes;
- doctor reports tracked memory files.

## Test Data

Use fake memory content only.

Never place real user facts, credentials, or local project secrets in fixtures.

## Contract Tests

MCP and CLI should have snapshot-style contract tests for:

- input validation;
- output shape;
- error codes;
- warnings.

Snapshots should avoid timestamps and generated IDs unless normalized.

## Migration Tests

Each migration should be tested from:

- an empty store;
- the immediately previous schema;
- a small realistic fixture.

## Manual Smoke Test

Before a release:

```bash
nuzo memory init
nuzo memory remember "The user prefers local-first tools." --kind preference --tag example
nuzo memory recall "local-first"
nuzo memory list
nuzo memory export --path ./memories.memory.export.json
nuzo memory doctor
```
