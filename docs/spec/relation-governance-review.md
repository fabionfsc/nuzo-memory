# Relation Governance Review

Nuzo `1.2.0` provides a bounded, deterministic way to inspect older stores for
likely duplicate, related, or revising memories:

```bash
nuzo memory --scope project:example review-relations
nuzo memory --scope project:example review-relations --needs-review --json
nuzo memory --scope project:example review-relations --include-archived --limit 100
```

This is a read-only report. It has no apply mode and cannot create a memory,
relation, lifecycle transition, or audit event. It uses the same local lexical
classifier as bounded capture suggestions; it does not call an LLM, load an
embedding model, access the network, or start a background scan.

## Bounds and filters

- one explicit resolved scope is required for every run;
- at most 200 active memories are used as the candidate pool;
- at most 200 primary memories are reviewed;
- `--limit` bounds returned candidate pairs to 1-200 and defaults to 50;
- active memories are reviewed by default;
- `--include-archived` permits archived memories as primary review subjects,
  while their comparison candidates remain active;
- `--needs-review` selects primary memories whose `review_after` or
  `expires_at` timestamp is due.

The result states independently whether the memory scan or candidate result was
truncated. A truncated scan adds the content-free
`candidate_scan_truncated` reason code and never upgrades weak evidence to an
independent conclusion.

## Output contract

Each candidate contains only:

- primary and candidate IDs, revisions, scopes, and lifecycle states;
- `exact_duplicate`, `update_candidate`, `related`, or `uncertain`;
- stable reason codes such as `exact_normalized_content`,
  `possible_revision`, `shared_subject`, `shared_tags`, and `shared_terms`;
- `unreviewed` or `already_related`, plus existing relation IDs, types, and
  direction.

The JSON document has `version: 1` and explicit `memory_writes`,
`relation_writes`, `lifecycle_writes`, and `audit_writes` fields, all `false`.

The report intentionally omits memory content, matched terms, matched tag
values, sources, provenance, and relation reasons. Human-readable output also
passes dynamic identifiers and scopes through the shared untrusted-text
renderer.

## Explicit follow-up

Inspect both records before deciding:

```bash
nuzo memory --scope project:example show <primary-id>
nuzo memory --scope project:example show <candidate-id>
```

If the user confirms a relation, use the normal audited mutation:

```bash
nuzo memory --scope project:example relate <source-id> \
  --target <target-id> --relation related_to \
  --reason "User-confirmed relationship."
```

For stale, incorrect, or superseded knowledge, use the normal challenge flow
with the displayed revision:

```bash
nuzo memory --scope project:example challenge <id> \
  --outcome superseded --superseded-by <replacement-id> \
  --expected-revision <revision> --reason "User-confirmed replacement."
```

Nothing in the report selects or executes either command automatically.
