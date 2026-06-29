# Optional Semantic Retrieval

Semantic retrieval is an opt-in, derived search capability. SQLite memory
records and SQLite FTS remain the canonical store and default retrieval path.

## Retrieval Modes

The core retrieval contract may request one of these modes:

| Mode | Behavior |
| --- | --- |
| `fts` | Search the canonical SQLite FTS index only. This is the default when the field is omitted. |
| `semantic` | Search a compatible semantic index. Missing, stale, or failed semantic state is an explicit error unless the caller requests fallback. |
| `hybrid` | Fuse FTS and semantic rankings. If semantic search is unavailable, return FTS results with a machine-readable fallback diagnostic. |

Adding an optional retrieval-mode field is backward compatible. Changing the
omitted default from `fts` is a breaking contract change and is outside
`0.7.0`.

Result reasons identify every contributing ranker. Hybrid results must not
represent a semantic score as an FTS score or hide fallback behavior.

## Provider Contract

An embedding provider converts raw text into finite, normalized numeric
vectors. Core owns the interface:

```ts
interface EmbeddingProviderDescriptor {
  id: string;
  model: string;
  revision: string;
  dimensions: number;
  network: "none" | "explicit";
}

interface EmbeddingProvider {
  readonly descriptor: EmbeddingProviderDescriptor;
  embedDocuments(texts: readonly string[]): Promise<readonly number[][]>;
  embedQuery(text: string): Promise<readonly number[]>;
}
```

The provider fingerprint is derived from every descriptor field. Changing a
model, revision, dimension, or locality makes an existing index incompatible
and requires an explicit rebuild.

Providers must return one vector per input, with exactly the declared
dimensions and finite numbers. Nuzo rejects malformed vectors before writing
the derived index. Providers do not receive IDs, scopes, sources, timestamps,
audit events, or other metadata unless that text is deliberately included in
the configured embedding document format.

## Network Boundary

A provider with `network: "explicit"` is rejected unless runtime configuration
also sets an explicit network opt-in. Selecting semantic or hybrid mode does
not imply consent to transmit memory.

Network opt-in must identify the provider and document that rebuild sends
memory text and that recall sends query text. Credentials remain provider
configuration and must not be written to Nuzo config, audit payloads, semantic
index metadata, diagnostics, or logs.

The preferred provider path is local inference. Model provisioning may be a
separate, explicit network action, but normal startup and recall must never
download models automatically. A local provider must refuse remote model and
runtime-asset loading during recall and rebuild.

## Derived Index Contract

The semantic index is a separate sidecar database next to the canonical store:

```text
memories.sqlite
memories.semantic.sqlite
```

It contains provider metadata and derived vectors keyed by memory ID and
revision. It does not own canonical memory content, audit events, FTS state, or
memory lifecycle.

Index lifecycle operations are explicit:

- `status` reports `disabled`, `missing`, `ready`, `stale`, `incompatible`, or
  `error` without invoking a provider;
- `rebuild` reads authorized active canonical memories, embeds a bounded batch
  at a time, writes a temporary sidecar, and replaces the old sidecar only
  after the complete build validates;
- `clear` deletes only the semantic sidecar and must be safe to repeat.

Remember, update, import, archive, and delete never call an embedding provider.
They commit canonical state normally and may leave the derived index stale.
This prevents provider latency or failure from rolling back or corrupting a
memory mutation.

At query time, indexed revision and canonical revision must match. Missing,
archived, deleted, unauthorized, or revision-mismatched records are excluded
before ranking. Scope policy runs before semantic lookup and is identical to
the FTS path.

## Failure Policy

Stable error codes distinguish configuration and index state:

```text
SEMANTIC_PROVIDER_MISSING
SEMANTIC_PROVIDER_INVALID
SEMANTIC_NETWORK_OPT_IN_REQUIRED
SEMANTIC_INDEX_MISSING
SEMANTIC_INDEX_STALE
SEMANTIC_INDEX_INCOMPATIBLE
SEMANTIC_INDEX_FAILED
MEMORY_RETRIEVAL_MODE_INVALID
SEMANTIC_FALLBACK_INVALID
SEMANTIC_FUSION_LIMIT_INVALID
```

Default behavior is:

- omitted mode or `fts`: provider/index failures are irrelevant;
- `hybrid`: fall back to FTS and expose the semantic failure code in retrieval
  diagnostics;
- `semantic`: return the semantic error rather than silently changing the
  requested mode;
- a caller may explicitly request FTS fallback for semantic-only mode.

No semantic failure may create, update, archive, delete, or record usage for a
memory. Fallback is read-only unless the caller separately opted into existing
recall-usage recording.

## Ranking

Semantic similarity and FTS scores are not directly comparable. Hybrid mode
uses deterministic reciprocal-rank fusion over bounded candidate lists. The
public result limit is applied after fusion. Tie-breaking is stable.

The default hybrid profile contributes only the strongest semantic candidate.
FTS may still contribute the full bounded result set. This conservative
asymmetry limits semantic noise while preserving multi-result lexical recall;
provider-specific evaluation may explicitly raise the semantic contribution
limit only when its benchmark keeps the noise gate green.

The provider, candidate limits, fusion constant, similarity floor, and result
reason are benchmarked configuration. They may be tuned compatibly, but the
default FTS behavior and scope rules cannot change as a side effect.

## Export, Backup, And Deletion

JSON and Markdown exports contain canonical memory only. They never include
vectors, provider credentials, model files, or semantic metadata. Restoring an
export requires an explicit semantic rebuild.

Deleting `memories.semantic.sqlite` cannot delete or modify canonical memory.
Hard-deleting a canonical memory makes any remaining vector unreachable by
revision-aware lookup; a later rebuild removes it physically from the sidecar.
