import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { join } from "node:path";

const repositoryRoot = new URL("..", import.meta.url).pathname;
const coreIndexPath = join(repositoryRoot, "packages", "core", "src", "index.ts");
const apiSpecPath = join(repositoryRoot, "docs", "spec", "memory-core-api.md");

const runtimeExports = [
  "DefaultPolicyEngine",
  "NuzoMemoryError",
  "RandomIdGenerator",
  "RegexSecretScanner",
  "SQLiteMemoryDatabase",
  "SystemClock",
  "clearSemanticIndex",
  "createHybridSearchIndex",
  "createLocalTransformersEmbeddingProvider",
  "createMemoryService",
  "createSemanticSearch",
  "defaultLocalTransformersModelPath",
  "embeddingProviderFingerprint",
  "formatMemoryExportMarkdown",
  "getDefaultStorePath",
  "inspectLocalTransformersModel",
  "inspectSemanticIndex",
  "localTransformersModel",
  "localTransformersModelFiles",
  "localTransformersProviderDescriptor",
  "memoryEventTypes",
  "memoryKinds",
  "memoryLimits",
  "memoryScopePattern",
  "memoryTagPattern",
  "migrate",
  "projectScopeFromPath",
  "provisionLocalTransformersModel",
  "rebuildSemanticIndex",
  "resolveAutomaticScope",
  "resolveNuzoRuntimeConfig",
  "schemaVersion",
  "semanticIndexPathFor",
];

const typeExports = [
  "AuditEventFilter",
  "AuditLog",
  "CaptureRelationship",
  "CaptureRelationshipCandidate",
  "CaptureRelationshipEvidence",
  "CaptureRelationshipMode",
  "CaptureSuggestionDraft",
  "CaptureSuggestionResult",
  "Clock",
  "ConfirmCaptureDecision",
  "ConfirmCaptureInput",
  "ConfirmCaptureResult",
  "DefaultPolicyEngineOptions",
  "EmbeddingProvider",
  "EmbeddingProviderDescriptor",
  "ExportMemoriesInput",
  "ForgetMemoriesInput",
  "ForgetMemoriesResult",
  "ForgetMemoryInput",
  "HybridSearchIndexOptions",
  "IdGenerator",
  "ImportMemoriesInput",
  "ImportMemoriesResult",
  "ListMemoriesInput",
  "LocalTransformersModelManifest",
  "LocalTransformersModelStatus",
  "LocalTransformersProviderOptions",
  "MemoryEvent",
  "MemoryEventType",
  "MemoryExportDocument",
  "MemoryExportItem",
  "MemoryKind",
  "MemoryRecord",
  "MemoryScope",
  "MemoryService",
  "MemoryServiceDependencies",
  "MemoryStore",
  "NuzoConfig",
  "NuzoRuntimeConfig",
  "NuzoRuntimeConfigOptions",
  "PolicyEngine",
  "ProvisionLocalTransformersModelInput",
  "ProvisionLocalTransformersModelResult",
  "RebuildSemanticIndexInput",
  "RebuildSemanticIndexResult",
  "RecallDiagnostics",
  "RecallMemoriesInput",
  "RecallMemoriesResponse",
  "RecallMemoryResult",
  "RememberMemoryInput",
  "RetrievalMode",
  "SearchIndex",
  "SecretFinding",
  "SecretScanResult",
  "SecretScanner",
  "SemanticFallbackMode",
  "SemanticIndexState",
  "SemanticIndexStatus",
  "SemanticSearch",
  "SemanticSearchOptions",
  "SQLiteMemoryDatabaseOptions",
  "SuggestCaptureInput",
  "TransactionManager",
  "UpdateMemoryInput",
];

test("@nuzo/memory-core root API surface is explicit and documented", () => {
  const index = readFileSync(coreIndexPath, "utf8");
  const spec = readFileSync(apiSpecPath, "utf8");

  assert.doesNotMatch(index, /export\s+\*\s+from/);
  assert.deepEqual(
    collectNamedExports(index, false).sort(),
    [...runtimeExports].sort(),
    "runtime exports changed without updating the core API contract",
  );
  assert.deepEqual(
    collectNamedExports(index, true).sort(),
    [...typeExports].sort(),
    "type exports changed without updating the core API contract",
  );

  for (const symbol of [...runtimeExports, ...typeExports]) {
    assert.match(index, new RegExp(`\\b${symbol}\\b`), `missing ${symbol} from core index`);
    assert.match(spec, new RegExp(`\\b${symbol}\\b`), `missing ${symbol} from memory-core API spec`);
  }
});

function collectNamedExports(source, typeOnly) {
  const prefix = typeOnly ? "export type" : "export";
  const pattern = typeOnly
    ? /export\s+type\s+\{([\s\S]*?)\}\s+from/g
    : /export\s+\{([\s\S]*?)\}\s+from/g;
  const names = [];
  for (const match of source.matchAll(pattern)) {
    if (!source.slice(match.index, match.index + prefix.length).startsWith(prefix)) {
      continue;
    }
    names.push(...match[1]
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean));
  }
  return names;
}
