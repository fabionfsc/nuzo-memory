# Project Scope Rehome

Moving or renaming a repository intentionally changes Nuzo's deterministic
project scope. Version `1.2.0` provides an administrator-only CLI workflow to
move the canonical memories from one explicit project scope to another without
pretending that export/import is identity-preserving.

Preview first:

```bash
nuzo memory --store ~/.nuzo/memory/memories.sqlite rehome-scope \
  --from project:old-explicit-scope \
  --to project:new-explicit-scope \
  --dry-run --json
```

The default is the same read-only plan when `--dry-run` is omitted. Apply only
after reviewing the counts and plan hash:

```bash
nuzo memory --store ~/.nuzo/memory/memories.sqlite rehome-scope \
  --from project:old-explicit-scope \
  --to project:new-explicit-scope \
  --apply --yes \
  --backup-path ./before-scope-rehome.sqlite
```

## Preconditions

- source and target must be different, valid, literal `project:*` scopes;
- `project:auto`, user, agent, and team scopes are rejected;
- the current SQLite schema, canonical tables, foreign keys, and FTS index must
  pass integrity validation;
- the source must contain at least one memory;
- the new backup path and all SQLite sidecars must not already exist or overlap
  the source fileset;
- active normalized-content collisions between source and target block apply.

Archived records do not collide with active capture because archived memories
are excluded from exact-capture uniqueness. The plan reports only content-free
counts for memories, lifecycle, target records, affected relations, historical
events, and collisions.

## Atomicity and backup

Apply acquires `BEGIN IMMEDIATE`, recomputes the plan under the writer lock, and
refuses a changed plan. While holding that reservation it creates a private
WAL-safe SQLite snapshot through a read-only sibling handle, validates the
snapshot, compares its plan hash to the locked source, and publishes it at the
requested path before canonical mutation.

The transaction changes only canonical `memories.scope`, the matching derived
FTS scope, and one global `memory.scope.rehomed` audit event. It validates FTS,
foreign keys, and SQLite integrity before commit. Any pre-commit error rolls
back the source transaction; if the backup was already published, it remains
available for recovery.

## Preserved identity and history

The move preserves:

- memory IDs, revisions, content, kinds, tags, sources, confidence, provenance,
  review/expiry timestamps, creation/update/use timestamps, and archive state;
- relation IDs, endpoints, types, reasons, and timestamps;
- every historical audit-event row and payload byte-for-byte.

Historical payload scopes describe event-time context and are intentionally not
rewritten. The new global event records `originalScope`, target `scope`, counts,
the plan hash, and `historicalEventsRewritten: 0`, so audit queries can find the
transition from either scope.

There is no MCP tool, host hook, automatic inference, background migration,
network request, telemetry, merge, or collision override for rehome.
