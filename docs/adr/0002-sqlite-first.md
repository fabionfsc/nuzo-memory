# ADR 0002: SQLite First

## Status

Accepted.

## Context

The MVP needs reliable local persistence, full-text search, migrations, and simple deployment.

## Decision

Use SQLite as the first storage backend.

Use SQLite FTS for MVP retrieval.

## Consequences

- No external database is required.
- The store is portable and easy to back up.
- The schema can evolve with migrations.
- Embeddings remain optional instead of mandatory.
