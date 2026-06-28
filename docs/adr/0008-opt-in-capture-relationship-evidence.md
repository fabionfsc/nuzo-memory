# ADR 0008: Opt-In Capture Relationship Evidence

## Status

Accepted.

## Context

In `0.5.0`, `memory.suggest_capture` validates a draft and performs only an
exact same-scope duplicate check. Calls that omit future fields receive
`status: ready` or `status: duplicate`, and existing hosts may interpret
`ready` as permission to ask whether a new memory should be created.

Capture Intelligence needs to distinguish update candidates, related memory,
independent memory, and ambiguous evidence. Changing the default meaning of
`ready` would be unsafe for existing clients: a client that ignored additive
fields could still offer creation when the server had found a likely update or
an uncertain relationship.

## Decision

Add an optional relationship-analysis mode to the existing suggestion use
case and tool:

```text
relationship_mode = exact | bounded
```

The field is omitted by default and omission means `exact`. Exact mode keeps
the `0.5.0` input behavior and response shape unchanged.

Bounded mode opts into the `0.6.0` relationship contract. Its successful
response adds a versioned evidence object and one of these relationships:

```text
exact_duplicate | update_candidate | related | independent | uncertain
```

Bounded mode preserves `status: duplicate` for exact duplicates and uses
`status: ready` only for independent candidates. Update, related, and
uncertain results use `status: review`. Clients that request bounded mode must
require the bounded response marker; an unknown-input error or missing marker
is legacy or unsupported behavior and must fail safe instead of being treated
as independent.

Core owns classification and evidence. CLI, MCP, Codex, and Claude Code only
map or display the core result. Policy validation runs before relationship
lookup. Candidate evidence is active, same-scope, bounded, and read-only.

Exact duplicate lookup remains deterministic and separate from ranked
candidate evaluation. Ranked evaluation considers at most 20 candidates and
returns at most 3 evidence records. It uses no network, telemetry, mandatory
embedding, remote model, or persisted suggestion state.

Relationship evidence is advisory. It cannot invoke `memory.remember` or
`memory.update`, and it is never authorization to write. Confirmed creation
continues through `memory.remember`; confirmed replacement continues through
`memory.update` with `expected_revision`.

## Consequences

- Existing clients retain the exact-only contract until they explicitly opt
  into bounded analysis.
- New clients can detect old servers by the absent bounded response marker and
  avoid an unsafe create decision.
- The existing tool name and legacy `duplicate` field remain stable.
- Bounded clients must handle `review` and `uncertain` explicitly.
- Candidate limits and versioned evidence become public contracts.
- Exact duplicate lookup may require a direct normalized lookup rather than an
  unbounded in-memory scan.
- Later semantic retrieval may implement the same core boundary, but it cannot
  silently change the local, lexical, read-only default.

## Alternatives Rejected

- **Enable relationship analysis by default.** Additive JSON fields would not
  prevent older clients from misinterpreting `ready`.
- **Replace `ready` and `duplicate` outright.** This would break current CLI,
  MCP, and host consumers without a migration path.
- **Add a second MCP tool.** A parallel tool would duplicate validation and
  draft contracts instead of evolving one suggestion boundary.
- **Classify in each host.** Host-specific logic would drift and violate core
  ownership.
- **Require embeddings or a remote model.** This would violate local-first,
  offline, and privacy defaults before benchmark evidence justified it.
