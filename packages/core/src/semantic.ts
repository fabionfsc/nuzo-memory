import { createHash, randomUUID } from "node:crypto";
import { chmodSync, closeSync, existsSync, mkdirSync, openSync, renameSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { NuzoMemoryError } from "./errors.js";
import type {
  EmbeddingProvider,
  EmbeddingProviderDescriptor,
  MemoryStore,
  SearchIndex,
} from "./ports.js";
import type {
  MemoryRecord,
  RecallMemoriesInput,
  RecallMemoriesResponse,
  RecallMemoryResult,
  RetrievalMode,
} from "./types.js";

const semanticSchemaVersion = 1;
const defaultSimilarityFloor = 0.25;
const defaultCandidateLimit = 100;
const fusionConstant = 60;

export type SemanticIndexState =
  | "missing"
  | "ready"
  | "stale"
  | "incompatible"
  | "error";

export interface SemanticIndexStatus {
  state: SemanticIndexState;
  path: string;
  providerFingerprint: string | null;
  indexedMemories: number;
  activeMemories: number;
  staleMemories: number;
  missingMemories: number;
  reason: string;
}

export interface RebuildSemanticIndexInput {
  path: string;
  provider: EmbeddingProvider;
  memories: readonly MemoryRecord[];
  allowNetwork?: boolean;
  batchSize?: number;
}

export interface RebuildSemanticIndexResult {
  path: string;
  providerFingerprint: string;
  indexedMemories: number;
}

export interface SemanticSearchOptions {
  path: string;
  provider: EmbeddingProvider;
  store: MemoryStore;
  allowNetwork?: boolean;
  similarityFloor?: number;
  candidateLimit?: number;
}

export interface SemanticSearch {
  status(): Promise<SemanticIndexStatus>;
  search(input: RecallMemoriesInput): Promise<RecallMemoryResult[]>;
}

export interface HybridSearchIndexOptions {
  fts: SearchIndex;
  semantic?: SemanticSearch;
  semanticFusionLimit?: number;
}

interface SemanticMetadataRow {
  provider_fingerprint: string;
  dimensions: number;
  indexed_memories: number;
}

interface SemanticVectorRow {
  memory_id: string;
  revision: number;
  scope: string;
  vector: Buffer;
}

export function semanticIndexPathFor(storePath: string): string {
  return storePath.endsWith(".sqlite")
    ? `${storePath.slice(0, -".sqlite".length)}.semantic.sqlite`
    : `${storePath}.semantic.sqlite`;
}

export function embeddingProviderFingerprint(descriptor: EmbeddingProviderDescriptor): string {
  validateProviderDescriptor(descriptor);
  return createHash("sha256")
    .update(JSON.stringify({
      id: descriptor.id,
      model: descriptor.model,
      revision: descriptor.revision,
      dimensions: descriptor.dimensions,
      network: descriptor.network,
    }))
    .digest("hex");
}

export async function rebuildSemanticIndex(
  input: RebuildSemanticIndexInput,
): Promise<RebuildSemanticIndexResult> {
  assertProviderAllowed(input.provider, input.allowNetwork === true);
  const descriptor = input.provider.descriptor;
  const fingerprint = embeddingProviderFingerprint(descriptor);
  const memories = input.memories.filter((memory) => memory.archivedAt === null);
  const batchSize = input.batchSize ?? 32;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 256) {
    throw new NuzoMemoryError("SEMANTIC_PROVIDER_INVALID", "Semantic batch size must be between 1 and 256.");
  }

  mkdirSync(dirname(input.path), { recursive: true, mode: 0o700 });
  const temporaryPath = `${input.path}.rebuild-${randomUUID()}`;
  createPrivateFile(temporaryPath);
  const database = new Database(temporaryPath);
  try {
    initializeSemanticSchema(database);
    const insert = database.prepare(`
      INSERT INTO semantic_vectors (memory_id, revision, scope, vector)
      VALUES (?, ?, ?, ?)
    `);
    const writeBatch = database.transaction((batch: readonly MemoryRecord[], vectors: readonly (readonly number[])[]) => {
      for (let index = 0; index < batch.length; index += 1) {
        const memory = batch[index]!;
        const vector = vectors[index]!;
        validateVector(vector, descriptor.dimensions);
        insert.run(memory.id, memory.revision, memory.scope, vectorToBuffer(vector));
      }
    });

    for (let offset = 0; offset < memories.length; offset += batchSize) {
      const batch = memories.slice(offset, offset + batchSize);
      const vectors = await input.provider.embedDocuments(
        batch.map((memory) => semanticDocument(memory)),
      );
      if (vectors.length !== batch.length) {
        throw new NuzoMemoryError(
          "SEMANTIC_PROVIDER_INVALID",
          "Embedding provider returned a different number of document vectors.",
          { expected: batch.length, actual: vectors.length },
        );
      }
      writeBatch(batch, vectors);
    }

    database.prepare(`
      INSERT INTO semantic_metadata (
        singleton, schema_version, provider_fingerprint, provider_id, model,
        model_revision, dimensions, network, indexed_memories, completed_at
      ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      semanticSchemaVersion,
      fingerprint,
      descriptor.id,
      descriptor.model,
      descriptor.revision,
      descriptor.dimensions,
      descriptor.network,
      memories.length,
      new Date().toISOString(),
    );
    const integrity = database.pragma("integrity_check", { simple: true });
    if (integrity !== "ok") {
      throw new NuzoMemoryError("SEMANTIC_INDEX_FAILED", "Semantic index integrity check failed.");
    }
  } catch (error) {
    database.close();
    rmSync(temporaryPath, { force: true });
    throw asSemanticError(error, "Semantic index rebuild failed.");
  }
  database.close();
  chmodSync(temporaryPath, 0o600);
  renameSync(temporaryPath, input.path);
  chmodSync(input.path, 0o600);
  return { path: input.path, providerFingerprint: fingerprint, indexedMemories: memories.length };
}

export function clearSemanticIndex(path: string): boolean {
  const existed = existsSync(path);
  rmSync(path, { force: true });
  rmSync(`${path}-shm`, { force: true });
  rmSync(`${path}-wal`, { force: true });
  return existed;
}

export function createSemanticSearch(options: SemanticSearchOptions): SemanticSearch {
  assertProviderAllowed(options.provider, options.allowNetwork === true);
  const fingerprint = embeddingProviderFingerprint(options.provider.descriptor);
  const similarityFloor = options.similarityFloor ?? defaultSimilarityFloor;
  const candidateLimit = options.candidateLimit ?? defaultCandidateLimit;
  if (!Number.isFinite(similarityFloor) || similarityFloor < -1 || similarityFloor > 1) {
    throw new NuzoMemoryError("SEMANTIC_PROVIDER_INVALID", "Semantic similarity floor must be between -1 and 1.");
  }
  if (!Number.isInteger(candidateLimit) || candidateLimit < 1 || candidateLimit > 1_000) {
    throw new NuzoMemoryError("SEMANTIC_PROVIDER_INVALID", "Semantic candidate limit must be between 1 and 1000.");
  }

  return {
    async status() {
      return inspectSemanticIndex(options.path, fingerprint, options.store);
    },

    async search(input) {
      const status = await inspectSemanticIndex(options.path, fingerprint, options.store, {
        scope: input.scope,
        includeGlobal: input.includeGlobal === true,
      });
      assertSemanticReady(status);
      let queryVector: readonly number[];
      try {
        queryVector = await options.provider.embedQuery(input.query);
        validateVector(queryVector, options.provider.descriptor.dimensions);
      } catch (error) {
        throw asSemanticError(error, "Semantic query embedding failed.");
      }

      const database = openSemanticDatabase(options.path);
      try {
        const scopeClause = input.includeGlobal === true
          ? "scope IN (@scope, 'user:default')"
          : "scope = @scope";
        const rows = database.prepare(`
          SELECT memory_id, revision, scope, vector
          FROM semantic_vectors
          WHERE ${scopeClause}
        `).all({ scope: input.scope }) as SemanticVectorRow[];
        const scored = rows
          .map((row) => ({ row, score: cosine(queryVector, bufferToVector(row.vector)) }))
          .filter((candidate) => candidate.score >= similarityFloor)
          .sort((left, right) => right.score - left.score || left.row.memory_id.localeCompare(right.row.memory_id))
          .slice(0, candidateLimit);
        const results: RecallMemoryResult[] = [];
        for (const candidate of scored) {
          const memory = await options.store.findById(candidate.row.memory_id);
          if (
            !memory ||
            memory.archivedAt !== null ||
            memory.revision !== candidate.row.revision ||
            !scopeMatches(memory, input)
          ) {
            continue;
          }
          results.push({
            memory,
            score: candidate.score,
            reason: `Semantic cosine similarity: ${candidate.score.toFixed(4)}.`,
            retrievalMode: "semantic",
          });
          if (results.length >= (input.limit ?? 8)) break;
        }
        return results;
      } finally {
        database.close();
      }
    },
  };
}

export function createHybridSearchIndex(options: HybridSearchIndexOptions): SearchIndex {
  const semanticFusionLimit = options.semanticFusionLimit ?? 1;
  if (!Number.isInteger(semanticFusionLimit) || semanticFusionLimit < 1 || semanticFusionLimit > 50) {
    throw new NuzoMemoryError("SEMANTIC_FUSION_LIMIT_INVALID", "Semantic fusion limit must be between 1 and 50.");
  }
  const searchDetailed = async (input: RecallMemoriesInput): Promise<RecallMemoriesResponse> => {
      const mode = input.retrievalMode ?? "fts";
      if (!["fts", "semantic", "hybrid"].includes(mode)) {
        throw new NuzoMemoryError("MEMORY_RETRIEVAL_MODE_INVALID", "Retrieval mode is invalid.", { mode });
      }
      if (input.semanticFallback !== undefined && !["error", "fts"].includes(input.semanticFallback)) {
        throw new NuzoMemoryError("SEMANTIC_FALLBACK_INVALID", "Semantic fallback mode is invalid.", { fallback: input.semanticFallback });
      }
      if (mode === "fts") {
        return { results: await options.fts.search(input), diagnostics: recallDiagnostics(mode, "fts", null) };
      }
      if (!options.semantic) return handleSemanticFailure(input, options.fts, "SEMANTIC_PROVIDER_MISSING");
      if (mode === "semantic") {
        try {
          return { results: await options.semantic.search(input), diagnostics: recallDiagnostics(mode, "semantic", null) };
        } catch (error) {
          if (error instanceof NuzoMemoryError && input.semanticFallback === "fts") {
            return { results: fallbackResults(await options.fts.search(input), error.code), diagnostics: recallDiagnostics(mode, "fts", error.code) };
          }
          throw error;
        }
      }

      const ftsResults = await options.fts.search(input);
      try {
        const semanticResults = await options.semantic.search({
          ...input,
          limit: Math.min(input.limit ?? 8, semanticFusionLimit),
        });
        return { results: fuseResults(ftsResults, semanticResults, input.limit ?? 8), diagnostics: recallDiagnostics(mode, "hybrid", null) };
      } catch (error) {
        if (error instanceof NuzoMemoryError) {
          return { results: fallbackResults(ftsResults, error.code), diagnostics: recallDiagnostics(mode, "fts", error.code) };
        }
        throw error;
      }
  };
  return {
    index(memory) {
      return options.fts.index(memory);
    },

    remove(memoryId) {
      return options.fts.remove(memoryId);
    },

    async search(input) {
      return (await searchDetailed(input)).results;
    },

    searchDetailed,
  };
}

export async function inspectSemanticIndex(
  path: string,
  providerFingerprint: string,
  store: MemoryStore,
  scopeFilter?: { scope: MemoryRecord["scope"]; includeGlobal: boolean },
): Promise<SemanticIndexStatus> {
  const active = scopeFilter
    ? [
        ...await store.list({ scope: scopeFilter.scope, includeArchived: false }),
        ...(scopeFilter.includeGlobal && scopeFilter.scope !== "user:default"
          ? await store.list({ scope: "user:default", includeArchived: false })
          : []),
      ]
    : await store.list({ includeArchived: false });
  if (!existsSync(path)) {
    return status("missing", path, null, 0, active.length, 0, active.length, "Semantic index does not exist.");
  }
  let database: Database.Database;
  try {
    database = openSemanticDatabase(path);
  } catch (error) {
    const state = error instanceof NuzoMemoryError && error.code === "SEMANTIC_INDEX_INCOMPATIBLE"
      ? "incompatible"
      : "error";
    return status(state, path, null, 0, active.length, 0, active.length, errorMessage(error));
  }
  try {
    const metadata = database.prepare(`
      SELECT provider_fingerprint, dimensions, indexed_memories
      FROM semantic_metadata WHERE singleton = 1
    `).get() as SemanticMetadataRow | undefined;
    if (!metadata) return status("error", path, null, 0, active.length, 0, active.length, "Semantic metadata is missing.");
    if (metadata.provider_fingerprint !== providerFingerprint) {
      return status("incompatible", path, metadata.provider_fingerprint, metadata.indexed_memories, active.length, 0, active.length, "Provider fingerprint does not match the index.");
    }
    const allRows = database.prepare("SELECT memory_id, revision, scope, vector FROM semantic_vectors").all() as SemanticVectorRow[];
    const rows = scopeFilter
      ? allRows.filter((row) => row.scope === scopeFilter.scope || (scopeFilter.includeGlobal && row.scope === "user:default"))
      : allRows;
    if (rows.some((row) => row.vector.length !== metadata.dimensions * Float32Array.BYTES_PER_ELEMENT)) {
      return status("error", path, metadata.provider_fingerprint, rows.length, active.length, 0, active.length, "Semantic vector dimensions do not match index metadata.");
    }
    const byId = new Map(rows.map((row) => [row.memory_id, row]));
    let staleMemories = 0;
    let missingMemories = 0;
    for (const memory of active) {
      const row = byId.get(memory.id);
      if (!row) missingMemories += 1;
      else if (row.revision !== memory.revision || row.scope !== memory.scope) staleMemories += 1;
    }
    const activeIds = new Set(active.map((memory) => memory.id));
    staleMemories += rows.filter((row) => !activeIds.has(row.memory_id)).length;
    if (staleMemories > 0 || missingMemories > 0) {
      return status("stale", path, metadata.provider_fingerprint, rows.length, active.length, staleMemories, missingMemories, "Canonical memory changed after the semantic rebuild.");
    }
    return status("ready", path, metadata.provider_fingerprint, rows.length, active.length, 0, 0, "Semantic index is ready.");
  } catch (error) {
    return status("error", path, null, 0, active.length, 0, active.length, errorMessage(error));
  } finally {
    database.close();
  }
}

function initializeSemanticSchema(database: Database.Database): void {
  database.pragma("journal_mode = DELETE");
  database.pragma("foreign_keys = ON");
  database.exec(`
    CREATE TABLE semantic_metadata (
      singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
      schema_version INTEGER NOT NULL,
      provider_fingerprint TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      model TEXT NOT NULL,
      model_revision TEXT NOT NULL,
      dimensions INTEGER NOT NULL,
      network TEXT NOT NULL,
      indexed_memories INTEGER NOT NULL,
      completed_at TEXT NOT NULL
    );
    CREATE TABLE semantic_vectors (
      memory_id TEXT PRIMARY KEY,
      revision INTEGER NOT NULL,
      scope TEXT NOT NULL,
      vector BLOB NOT NULL
    );
    CREATE INDEX idx_semantic_vectors_scope ON semantic_vectors(scope);
  `);
  database.pragma(`user_version = ${semanticSchemaVersion}`);
}

function openSemanticDatabase(path: string): Database.Database {
  const database = new Database(path, { readonly: true, fileMustExist: true });
  const version = database.pragma("user_version", { simple: true }) as number;
  if (version !== semanticSchemaVersion) {
    database.close();
    throw new NuzoMemoryError("SEMANTIC_INDEX_INCOMPATIBLE", "Semantic index schema is incompatible.", { version, supported: semanticSchemaVersion });
  }
  return database;
}

function validateProviderDescriptor(descriptor: EmbeddingProviderDescriptor): void {
  if (
    !descriptor ||
    typeof descriptor.id !== "string" || descriptor.id.trim().length === 0 || descriptor.id.length > 128 ||
    typeof descriptor.model !== "string" || descriptor.model.trim().length === 0 || descriptor.model.length > 256 ||
    typeof descriptor.revision !== "string" || descriptor.revision.trim().length === 0 || descriptor.revision.length > 128 ||
    !Number.isInteger(descriptor.dimensions) || descriptor.dimensions < 1 || descriptor.dimensions > 16_384 ||
    !["none", "explicit"].includes(descriptor.network)
  ) {
    throw new NuzoMemoryError("SEMANTIC_PROVIDER_INVALID", "Embedding provider descriptor is invalid.");
  }
}

function assertProviderAllowed(provider: EmbeddingProvider, allowNetwork: boolean): void {
  embeddingProviderFingerprint(provider.descriptor);
  if (provider.descriptor.network === "explicit" && !allowNetwork) {
    throw new NuzoMemoryError("SEMANTIC_NETWORK_OPT_IN_REQUIRED", "Network embedding provider requires explicit network opt-in.");
  }
}

function validateVector(vector: readonly number[], dimensions: number): void {
  if (vector.length !== dimensions || vector.some((value) => !Number.isFinite(value))) {
    throw new NuzoMemoryError("SEMANTIC_PROVIDER_INVALID", "Embedding provider returned an invalid vector.", { expectedDimensions: dimensions, actualDimensions: vector.length });
  }
}

function semanticDocument(memory: MemoryRecord): string {
  return `${memory.content}\nTags: ${memory.tags.join(", ")}`;
}

function vectorToBuffer(vector: readonly number[]): Buffer {
  const buffer = Buffer.allocUnsafe(vector.length * Float32Array.BYTES_PER_ELEMENT);
  vector.forEach((value, index) => buffer.writeFloatLE(value, index * Float32Array.BYTES_PER_ELEMENT));
  return buffer;
}

function bufferToVector(buffer: Buffer): number[] {
  if (buffer.length % Float32Array.BYTES_PER_ELEMENT !== 0) {
    throw new NuzoMemoryError("SEMANTIC_INDEX_FAILED", "Stored semantic vector has an invalid byte length.");
  }
  return Array.from({ length: buffer.length / Float32Array.BYTES_PER_ELEMENT }, (_, index) => buffer.readFloatLE(index * Float32Array.BYTES_PER_ELEMENT));
}

function cosine(left: readonly number[], right: readonly number[]): number {
  if (left.length !== right.length) return -1;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index]! * right[index]!;
    leftNorm += left[index]! ** 2;
    rightNorm += right[index]! ** 2;
  }
  if (leftNorm === 0 || rightNorm === 0) return -1;
  return dot / Math.sqrt(leftNorm * rightNorm);
}

function fuseResults(fts: RecallMemoryResult[], semantic: RecallMemoryResult[], limit: number): RecallMemoryResult[] {
  const fused = new Map<string, { memory: MemoryRecord; score: number; sources: Set<RetrievalMode> }>();
  for (const [source, results] of [["fts", fts], ["semantic", semantic]] as const) {
    results.forEach((result, index) => {
      const current = fused.get(result.memory.id) ?? { memory: result.memory, score: 0, sources: new Set<RetrievalMode>() };
      current.score += 1 / (fusionConstant + index + 1);
      current.sources.add(source);
      fused.set(result.memory.id, current);
    });
  }
  return [...fused.values()]
    .sort((left, right) => right.score - left.score || left.memory.id.localeCompare(right.memory.id))
    .slice(0, limit)
    .map((result) => ({ memory: result.memory, score: result.score, reason: `Hybrid reciprocal-rank fusion: ${[...result.sources].join("+")}.`, retrievalMode: "hybrid" }));
}

async function handleSemanticFailure(input: RecallMemoriesInput, fts: SearchIndex, code: string): Promise<RecallMemoriesResponse> {
  if (input.retrievalMode === "hybrid" || input.semanticFallback === "fts") {
    return {
      results: fallbackResults(await fts.search(input), code),
      diagnostics: recallDiagnostics(input.retrievalMode ?? "semantic", "fts", code),
    };
  }
  throw new NuzoMemoryError(code, "Semantic retrieval is not configured.");
}

function recallDiagnostics(requestedMode: RetrievalMode, effectiveMode: RetrievalMode, semanticFallbackCode: string | null) {
  return { requestedMode, effectiveMode, semanticFallbackCode };
}

function fallbackResults(results: RecallMemoryResult[], code: string): RecallMemoryResult[] {
  return results.map((result) => ({ ...result, reason: `${result.reason}; Semantic fallback: ${code}.`, retrievalMode: "fts", semanticFallbackCode: code }));
}

function assertSemanticReady(indexStatus: SemanticIndexStatus): void {
  if (indexStatus.state === "ready") return;
  const code = {
    missing: "SEMANTIC_INDEX_MISSING",
    stale: "SEMANTIC_INDEX_STALE",
    incompatible: "SEMANTIC_INDEX_INCOMPATIBLE",
    error: "SEMANTIC_INDEX_FAILED",
  }[indexStatus.state];
  throw new NuzoMemoryError(code, indexStatus.reason, { path: indexStatus.path });
}

function status(state: SemanticIndexState, path: string, providerFingerprint: string | null, indexedMemories: number, activeMemories: number, staleMemories: number, missingMemories: number, reason: string): SemanticIndexStatus {
  return { state, path, providerFingerprint, indexedMemories, activeMemories, staleMemories, missingMemories, reason };
}

function scopeMatches(memory: MemoryRecord, input: RecallMemoriesInput): boolean {
  return memory.scope === input.scope || (input.includeGlobal === true && memory.scope === "user:default");
}

function createPrivateFile(path: string): void {
  const descriptor = openSync(path, "wx", 0o600);
  closeSync(descriptor);
  chmodSync(path, 0o600);
}

function asSemanticError(error: unknown, message: string): NuzoMemoryError {
  if (error instanceof NuzoMemoryError) return error;
  return new NuzoMemoryError("SEMANTIC_INDEX_FAILED", message, { cause: errorMessage(error) });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
