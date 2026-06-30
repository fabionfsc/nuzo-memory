# Memory Core API

`@nuzo/memory-core` is the library-level integration package. Most users should
install `@nuzo/memory` and use the CLI, MCP server, or host plugins instead.

This page freezes the root entrypoint surface for the `0.9.0` contract pass.
Symbols listed here remain exported from `@nuzo/memory-core` until a documented
SemVer-compatible replacement or a pre-`1.0.0` breaking cleanup.

## Stability Classes

| Class | Meaning |
| --- | --- |
| Stable public | Intended for ordinary library integrations. Changes require SemVer treatment. |
| Advanced public | Supported, but for host/runtime/storage integrations that accept lower-level ownership. |
| Experimental public | Supported as opt-in pre-`1.0.0` surface. Compatibility can still tighten before `1.0.0`. |

Nuzo does not currently mark any root export as deprecated. If a symbol becomes
deprecated before `1.0.0`, this page and package README must name the migration
path.

The historical wildcard root export exposed the internal `invariant` helper.
The `0.9.0` contract pass removes it from the root API before the stable
`1.0.0` commitment. Library callers should throw or handle `NuzoMemoryError`
directly instead of depending on internal assertion helpers.

## Stable Public Runtime Exports

| Symbol | Purpose |
| --- | --- |
| `NuzoMemoryError` | Structured domain error with stable `code`, `message`, and optional `details`. |
| `createMemoryService` | Construct the host-neutral memory service from explicit dependencies. |
| `DefaultPolicyEngine` | Default validation, secret scanning, and scope authorization policy. |
| `RegexSecretScanner` | Built-in local secret scanner used by the default policy. |
| `SystemClock` | Default wall-clock implementation. |
| `RandomIdGenerator` | Default memory and event ID generator. |
| `memoryKinds` | Stable memory kind values. |
| `memoryEventTypes` | Stable audit event type values. |
| `memoryLimits` | Public validation limits used across CLI and MCP contracts. |
| `memoryScopePattern` | Scope validation pattern. |
| `memoryTagPattern` | Tag validation pattern. |
| `projectScopeFromPath` | Stable project-scope derivation helper. |
| `getDefaultStorePath` | Default user-level SQLite store path helper. |
| `resolveAutomaticScope` | Resolves `project:auto` for library callers. |
| `resolveNuzoRuntimeConfig` | Shared runtime resolver for CLI, MCP, and host integrations. |
| `formatMemoryExportMarkdown` | Markdown rendering for versioned memory exports. |

## Stable Public Type Exports

| Symbol | Purpose |
| --- | --- |
| `MemoryService` | Main service interface. |
| `MemoryServiceDependencies` | Explicit dependency bag for `createMemoryService`. |
| `MemoryRecord` | Canonical memory record. |
| `MemoryEvent` | Canonical audit event. |
| `MemoryKind` | Memory kind union. |
| `MemoryScope` | Scope string type. |
| `MemoryEventType` | Audit event type union. |
| `RememberMemoryInput` | Explicit memory write input. |
| `RecallMemoriesInput` | Recall input. |
| `RecallMemoriesResponse` | Detailed recall response. |
| `RecallMemoryResult` | Individual recall result. |
| `RecallDiagnostics` | Retrieval-mode diagnostics. |
| `ListMemoriesInput` | List/filter input. |
| `MemoryHistoryInput` | Per-memory audit history pagination input. |
| `UpdateMemoryInput` | Update input. |
| `ForgetMemoryInput` | Single-memory archive/delete input. |
| `ForgetMemoriesInput` | Bulk archive/delete input. |
| `ForgetMemoriesResult` | Bulk archive/delete result. |
| `AuditEventFilter` | Audit query filter. |
| `ExportMemoriesInput` | Export input. |
| `ImportMemoriesInput` | Import input. |
| `ImportMemoriesResult` | Import result. |
| `MemoryExportDocument` | Versioned JSON export document. |
| `MemoryExportItem` | Exported memory item. |
| `SuggestCaptureInput` | Capture suggestion input. |
| `ConfirmCaptureDecision` | Confirmed capture decision union. |
| `ConfirmCaptureInput` | Confirmed capture input. |
| `ConfirmCaptureResult` | Confirmed capture result. |
| `CaptureSuggestionDraft` | Normalized capture draft. |
| `CaptureSuggestionResult` | Capture suggestion result. |
| `CaptureRelationshipMode` | Capture relationship mode union. |
| `CaptureRelationship` | Capture relationship classification. |
| `CaptureRelationshipCandidate` | Bounded relationship candidate. |
| `CaptureRelationshipEvidence` | Bounded relationship evidence. |
| `RetrievalMode` | Recall retrieval mode union. |
| `SemanticFallbackMode` | Semantic fallback mode union. |
| `NuzoAuthorizationMode` | Effective `administrator` or `restricted` runtime mode. |
| `NuzoAuthorizationConfig` | Trusted user authorization config shape. |
| `NuzoConfig` | Versioned runtime config shape. |
| `NuzoRuntimeConfig` | Effective runtime config. |
| `NuzoRuntimeConfigOptions` | Runtime resolver options. |
| `NuzoRuntimeConfigProvenance` | Non-sensitive source metadata for effective runtime fields. |
| `NuzoRuntimeAdjustment` | Safe runtime adjustments caused by authorization constraints. |

## Advanced Public Exports

These exports are public for integrations that own storage, policy, dependency
injection, or runtime packaging.

| Symbol | Class | Purpose |
| --- | --- | --- |
| `SQLiteMemoryDatabase` | Advanced public | SQLite adapter implementing store, search, audit, and transactions. |
| `SQLiteMemoryDatabaseOptions` | Advanced public | SQLite adapter options. |
| `inspectSQLiteMemoryStore` | Advanced public | Inspect a SQLite memory store for schema, integrity, count, and FTS consistency diagnostics. |
| `backupSQLiteMemoryStore` | Advanced public | Create a WAL-safe SQLite online backup and validate the resulting snapshot. |
| `restoreSQLiteMemoryStore` | Advanced public | Validate and restore a SQLite memory backup into a target store path. |
| `SQLiteIntegrityReport` | Advanced public | Content-free SQLite store integrity report. |
| `SQLiteBackupResult` | Advanced public | SQLite backup result with snapshot integrity diagnostics. |
| `SQLiteRestoreResult` | Advanced public | SQLite restore result with target integrity diagnostics. |
| `schemaVersion` | Advanced public | Current SQLite schema version. |
| `migrate` | Advanced public | Apply SQLite migrations to a database handle. |
| `MemoryStore` | Advanced public | Storage port. |
| `SearchIndex` | Advanced public | Search port. |
| `AuditLog` | Advanced public | Audit-log port. |
| `TransactionManager` | Advanced public | Transaction port. |
| `Clock` | Advanced public | Clock port. |
| `IdGenerator` | Advanced public | ID-generator port. |
| `SecretScanner` | Advanced public | Secret-scanner port. |
| `SecretScanResult` | Advanced public | Secret-scan result. |
| `SecretFinding` | Advanced public | Secret finding. |
| `PolicyEngine` | Advanced public | Policy port. |
| `DefaultPolicyEngineOptions` | Advanced public | Default policy options. |
| `EmbeddingProvider` | Experimental public | Optional embedding provider port. |
| `EmbeddingProviderDescriptor` | Experimental public | Embedding provider identity/fingerprint input. |
| `semanticIndexPathFor` | Experimental public | Derived semantic sidecar path helper. |
| `embeddingProviderFingerprint` | Experimental public | Provider fingerprint helper. |
| `rebuildSemanticIndex` | Experimental public | Rebuild the derived semantic sidecar. |
| `clearSemanticIndex` | Experimental public | Remove the derived semantic sidecar. |
| `inspectSemanticIndex` | Experimental public | Inspect semantic index state without recall. |
| `createSemanticSearch` | Experimental public | Create semantic search against a sidecar. |
| `createHybridSearchIndex` | Experimental public | Combine FTS and semantic search. |
| `SemanticIndexState` | Experimental public | Semantic index state union. |
| `SemanticIndexStatus` | Experimental public | Semantic index status. |
| `RebuildSemanticIndexInput` | Experimental public | Rebuild input. |
| `RebuildSemanticIndexResult` | Experimental public | Rebuild result. |
| `SemanticSearchOptions` | Experimental public | Semantic search options. |
| `SemanticSearch` | Experimental public | Semantic search interface. |
| `HybridSearchIndexOptions` | Experimental public | Hybrid search options. |
| `localTransformersModel` | Experimental public | Pinned local Transformers model metadata. |
| `localTransformersModelFiles` | Experimental public | Pinned model file manifest. |
| `defaultLocalTransformersModelPath` | Experimental public | Default local model path helper. |
| `localTransformersProviderDescriptor` | Experimental public | Local provider descriptor. |
| `inspectLocalTransformersModel` | Experimental public | Inspect local model state. |
| `provisionLocalTransformersModel` | Experimental public | Explicit model provisioning helper. |
| `createLocalTransformersEmbeddingProvider` | Experimental public | Create the optional local embedding provider. |
| `LocalTransformersModelManifest` | Experimental public | Local model manifest type. |
| `LocalTransformersModelStatus` | Experimental public | Local model status type. |
| `ProvisionLocalTransformersModelInput` | Experimental public | Model provisioning input. |
| `ProvisionLocalTransformersModelResult` | Experimental public | Model provisioning result. |
| `LocalTransformersProviderOptions` | Experimental public | Local provider options. |

## Error Contract

Library callers should catch `NuzoMemoryError` for expected domain, validation,
policy, authorization, storage-version, and semantic-state failures. Its
`code` is the machine-readable compatibility field. `message` is human-readable
and can be clarified compatibly. `details` may be absent, especially where
including details could reveal unauthorized memory metadata.

Unknown thrown errors are not public domain failures and should be treated as
internal failures by CLI, MCP, or host wrappers.

## Minimal Library Integration

```ts
import {
  createMemoryService,
  DefaultPolicyEngine,
  RandomIdGenerator,
  RegexSecretScanner,
  SQLiteMemoryDatabase,
  SystemClock,
} from "@nuzo/memory-core";

const database = new SQLiteMemoryDatabase({
  path: "/absolute/path/to/memories.sqlite",
});

try {
  const service = createMemoryService({
    store: database,
    searchIndex: database,
    auditLog: database,
    transactions: database,
    clock: new SystemClock(),
    ids: new RandomIdGenerator(),
    policy: new DefaultPolicyEngine(new RegexSecretScanner(), {
      allowedScopes: ["project:nuzo"],
    }),
  });

  await service.remember({
    content: "Run docs validation before release.",
    kind: "instruction",
    scope: "project:nuzo",
    tags: ["release", "docs"],
    source: "example:library",
  });
} finally {
  database.close();
}
```

The caller owns database lifetime. Close the SQLite adapter when the
integration is done. Optional semantic providers can also expose `dispose`;
host runtimes should await disposal during shutdown.

## Compatibility Gate

The root entrypoint must remain explicit. Do not add `export *` to
`packages/core/src/index.ts`.

Changing the root API requires updating this page and the contract gate in
`tools/core-api-contract.test.mjs` in the same PR.
