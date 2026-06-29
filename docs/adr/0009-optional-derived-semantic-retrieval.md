# ADR 0009: Optional Derived Semantic Retrieval

## Status

Accepted.

## Context

SQLite FTS is fast, local, inspectable, and sufficient when a query shares
terms or tags with a memory. The `0.7.0` benchmark demonstrates a material gap
for English paraphrases and shows that hybrid ranking can improve that fixture
without weakening scope, archived, bounded-output, zero-write, or no-network
gates.

Embeddings also add model resources, derived state, less inspectable scores,
provider failures, and a possible network privacy boundary. Coupling them to
canonical mutations would allow an optional provider to block or corrupt the
memory lifecycle. Enabling them by default would change Nuzo's local-first
contract.

## Decision

Keep SQLite memory records and FTS canonical. Add semantic retrieval through
an optional core-owned embedding-provider interface and a separate derived
SQLite sidecar.

The omitted retrieval mode remains `fts`. `semantic` and `hybrid` require an
explicit caller or runtime choice. Hybrid ranking uses reciprocal-rank fusion
and falls back visibly to FTS when semantic state is unavailable. A strict
semantic-only request fails explicitly by default.

Semantic index build, rebuild, status, and clear are explicit maintenance
operations. Canonical writes never invoke a provider. The sidecar records the
provider fingerprint and canonical memory revisions; stale or incompatible
vectors cannot be returned as current memory.

Local inference is preferred. A network-capable provider requires a second,
explicit network opt-in that is independent from selecting retrieval mode.
Model downloads are provisioning actions and cannot happen automatically
during normal recall or startup.

The semantic sidecar is disposable and excluded from memory export. Removing
it cannot remove canonical content. Rebuild uses active authorized canonical
records as its only source of truth.

## Consequences

- Existing installs and callers continue to use FTS without a model, account,
  API key, new network call, or semantic sidecar.
- Provider failures cannot roll back remember, update, import, archive, or
  delete operations.
- Recently changed memories remain discoverable through FTS while the sidecar
  is stale; semantic-only callers receive an explicit stale-index error.
- Hybrid reasons and diagnostics must identify semantic contribution or FTS
  fallback.
- Sidecar vectors are sensitive derived data and require the same local file
  protection and Git exclusion as canonical memory.
- Backup and migration remain centered on the existing JSON export and
  canonical SQLite schema; semantic state is rebuilt instead of migrated as
  durable user data.
- A production provider must pass the benchmark with raw text. The synthetic
  benchmark encoder is not a runtime provider.

## Alternatives Rejected

- **Replace FTS with semantic retrieval.** This changes defaults, increases
  resource use, and makes provider availability a requirement for normal use.
- **Store vectors in the canonical database.** This complicates canonical
  migrations and makes “delete the semantic index” unsafe or ambiguous.
- **Embed synchronously on every write.** Provider latency or failure could
  block canonical memory mutations and introduce hidden network work.
- **Treat semantic scores as FTS scores.** Their scales are unrelated and
  direct weighted addition is provider-specific and difficult to audit.
- **Allow automatic model downloads.** Normal recall could unexpectedly use
  network, disk, and remote model revisions.
- **Duplicate semantic policy in CLI and MCP.** This would let interfaces drift
  on scope, fallback, and provider safety; the boundary belongs in core.
