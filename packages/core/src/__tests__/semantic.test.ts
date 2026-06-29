import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { EmbeddingProvider } from "../ports.js";
import {
  clearSemanticIndex,
  createHybridSearchIndex,
  createSemanticSearch,
  embeddingProviderFingerprint,
  inspectSemanticIndex,
  rebuildSemanticIndex,
  semanticIndexPathFor,
} from "../semantic.js";
import { createMemoryService } from "../service.js";
import { SQLiteMemoryDatabase } from "../sqlite/adapter.js";
import { DefaultPolicyEngine } from "../policy.js";
import { RegexSecretScanner } from "../secrets.js";
import { FixedClock, SequentialIdGenerator } from "../testing/in-memory.js";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("optional semantic retrieval", () => {
  it("builds a private derived index and finds paraphrases", async () => {
    const fixture = await createFixture();
    const path = semanticIndexPathFor(fixture.storePath);
    const memories = await fixture.service.list({ includeArchived: false });

    const rebuilt = await rebuildSemanticIndex({ path, provider: localProvider, memories });
    expect(rebuilt.indexedMemories).toBe(3);
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(readFileSync(fixture.storePath).subarray(0, 15).toString()).toBe("SQLite format 3");

    const semantic = createSemanticSearch({
      path,
      provider: localProvider,
      store: fixture.database,
      similarityFloor: 0.1,
    });
    await expect(semantic.status()).resolves.toMatchObject({
      state: "ready",
      indexedMemories: 3,
      activeMemories: 3,
    });
    const results = await semantic.search({
      query: "verifiable supply chain metadata",
      scope: "project:nuzo",
      limit: 2,
      retrievalMode: "semantic",
    });
    expect(results.map((result) => result.memory.content)).toEqual([
      "Publish npm releases with trusted SLSA provenance.",
    ]);
    expect(results[0]).toMatchObject({ retrievalMode: "semantic" });
    fixture.database.close();
  });

  it("keeps omitted retrieval mode identical to FTS and fuses opt-in hybrid results", async () => {
    const fixture = await createFixture();
    const path = semanticIndexPathFor(fixture.storePath);
    await rebuildSemanticIndex({ path, provider: localProvider, memories: await fixture.service.list() });
    const semantic = createSemanticSearch({ path, provider: localProvider, store: fixture.database, similarityFloor: 0.1 });
    const hybrid = createHybridSearchIndex({ fts: fixture.database, semantic });

    const defaultResults = await hybrid.search({ query: "npm provenance", scope: "project:nuzo", limit: 5 });
    const directFts = await fixture.database.search({ query: "npm provenance", scope: "project:nuzo", limit: 5 });
    expect(defaultResults).toEqual(directFts);

    const hybridResults = await hybrid.search({
      query: "verifiable supply chain metadata",
      scope: "project:nuzo",
      limit: 5,
      retrievalMode: "hybrid",
    });
    expect(hybridResults[0]?.memory.content).toContain("SLSA provenance");
    expect(hybridResults[0]).toMatchObject({ retrievalMode: "hybrid" });
    expect(hybridResults[0]?.reason).toContain("reciprocal-rank fusion");
    fixture.database.close();
  });

  it("limits the default hybrid semantic contribution to the strongest candidate", async () => {
    const fixture = await createFixture();
    const memories = await fixture.service.list({ scope: "project:nuzo" });
    const fts = {
      async index() {},
      async remove() {},
      async search() { return []; },
    };
    const semantic = {
      async status() {
        return { state: "ready" as const, path: "test", providerFingerprint: "test", indexedMemories: 2, activeMemories: 2, staleMemories: 0, missingMemories: 0, reason: "ready" };
      },
      async search(input: { limit?: number }) {
        return memories.slice(0, input.limit).map((memory, index) => ({ memory, score: 1 - index / 10, reason: "test", retrievalMode: "semantic" as const }));
      },
    };
    const hybrid = createHybridSearchIndex({ fts, semantic });
    const results = await hybrid.search({ query: "broad paraphrase", scope: "project:nuzo", limit: 8, retrievalMode: "hybrid" });
    expect(results).toHaveLength(1);
    expect(results[0]?.memory.id).toBe(memories[0]?.id);
    fixture.database.close();
  });

  it("detects stale canonical revisions and falls hybrid back visibly to FTS", async () => {
    const fixture = await createFixture();
    const path = semanticIndexPathFor(fixture.storePath);
    await rebuildSemanticIndex({ path, provider: localProvider, memories: await fixture.service.list() });
    const target = (await fixture.service.list()).find((memory) => memory.content.includes("SQLite"))!;
    await fixture.service.update({
      id: target.id,
      expectedRevision: target.revision,
      content: "SQLite concurrency uses optimistic revision checks.",
      actor: "test",
    });
    const semantic = createSemanticSearch({ path, provider: localProvider, store: fixture.database, similarityFloor: 0.1 });
    await expect(semantic.status()).resolves.toMatchObject({ state: "stale", staleMemories: 1 });
    await expect(semantic.search({ query: "concurrent database writes", scope: "project:nuzo", retrievalMode: "semantic" }))
      .rejects.toMatchObject({ code: "SEMANTIC_INDEX_STALE" });

    const hybrid = createHybridSearchIndex({ fts: fixture.database, semantic });
    const fallback = await hybrid.search({ query: "SQLite concurrency", scope: "project:nuzo", retrievalMode: "hybrid" });
    expect(fallback[0]).toMatchObject({ retrievalMode: "fts", semanticFallbackCode: "SEMANTIC_INDEX_STALE" });
    expect(fallback[0]?.reason).toContain("Semantic fallback");
    fixture.database.close();
  });

  it("clears only the derived sidecar and preserves canonical memory", async () => {
    const fixture = await createFixture();
    const path = semanticIndexPathFor(fixture.storePath);
    await rebuildSemanticIndex({ path, provider: localProvider, memories: await fixture.service.list() });
    expect(clearSemanticIndex(path)).toBe(true);
    expect(clearSemanticIndex(path)).toBe(false);
    expect(await fixture.service.list()).toHaveLength(3);
    await expect(inspectSemanticIndex(path, embeddingProviderFingerprint(localProvider.descriptor), fixture.database))
      .resolves.toMatchObject({ state: "missing", activeMemories: 3 });
    fixture.database.close();
  });

  it("rejects implicit network providers and malformed vectors without replacing a ready index", async () => {
    const fixture = await createFixture();
    const path = semanticIndexPathFor(fixture.storePath);
    const memories = await fixture.service.list();
    await rebuildSemanticIndex({ path, provider: localProvider, memories });

    const networkProvider: EmbeddingProvider = {
      ...localProvider,
      descriptor: { ...localProvider.descriptor, id: "network-test", network: "explicit" },
    };
    await expect(rebuildSemanticIndex({ path, provider: networkProvider, memories }))
      .rejects.toMatchObject({ code: "SEMANTIC_NETWORK_OPT_IN_REQUIRED" });

    const malformedProvider: EmbeddingProvider = {
      ...localProvider,
      embedDocuments: async (texts) => texts.map(() => [1, 0]),
    };
    await expect(rebuildSemanticIndex({ path, provider: malformedProvider, memories }))
      .rejects.toMatchObject({ code: "SEMANTIC_PROVIDER_INVALID" });
    await expect(inspectSemanticIndex(path, embeddingProviderFingerprint(localProvider.descriptor), fixture.database))
      .resolves.toMatchObject({ state: "ready" });
    fixture.database.close();
  });

  it("never returns archived, other-project, or non-global user vectors", async () => {
    const fixture = await createFixture();
    const archived = await fixture.service.remember({
      content: "Archived npm provenance rule.", kind: "instruction", scope: "project:nuzo", tags: ["npm"], source: "test",
    });
    await fixture.service.forget({ id: archived.id, actor: "test", mode: "archive" });
    await fixture.service.remember({
      content: "Other project npm provenance rule.", kind: "instruction", scope: "project:other", tags: ["npm"], source: "test",
    });
    const path = semanticIndexPathFor(fixture.storePath);
    await rebuildSemanticIndex({ path, provider: localProvider, memories: await fixture.service.list() });
    const semantic = createSemanticSearch({ path, provider: localProvider, store: fixture.database, similarityFloor: 0.1 });
    const projectOnly = await semantic.search({ query: "supply chain metadata", scope: "project:nuzo", retrievalMode: "semantic" });
    expect(projectOnly.map((result) => result.memory.scope)).toEqual(["project:nuzo"]);
    const withGlobal = await semantic.search({ query: "brief answers compromises", scope: "project:nuzo", includeGlobal: true, retrievalMode: "semantic" });
    expect(withGlobal[0]?.memory.scope).toBe("user:default");
    fixture.database.close();
  });
});

const localProvider: EmbeddingProvider = {
  descriptor: {
    id: "test-local",
    model: "public-fixture",
    revision: "1",
    dimensions: 4,
    network: "none",
  },
  async embedDocuments(texts) {
    return texts.map(embedText);
  },
  async embedQuery(text) {
    return embedText(text);
  },
};

function embedText(text: string): number[] {
  const value = text.toLowerCase();
  if (/npm|provenance|slsa|supply chain|metadata/.test(value)) return [1, 0, 0, 0];
  if (/sqlite|concurrency|database|revision/.test(value)) return [0, 1, 0, 0];
  if (/concise|brief|tradeoffs|compromises/.test(value)) return [0, 0, 1, 0];
  return [0, 0, 0, 1];
}

async function createFixture() {
  const directory = mkdtempSync(join(tmpdir(), "nuzo-semantic-test-"));
  directories.push(directory);
  const storePath = join(directory, "memories.sqlite");
  const database = new SQLiteMemoryDatabase({ path: storePath });
  const service = createMemoryService({
    store: database,
    searchIndex: database,
    auditLog: database,
    clock: new FixedClock(),
    ids: new SequentialIdGenerator(),
    policy: new DefaultPolicyEngine(new RegexSecretScanner()),
    transactions: database,
  });
  await service.remember({
    content: "Publish npm releases with trusted SLSA provenance.", kind: "instruction", scope: "project:nuzo", tags: ["npm", "release"], source: "test",
  });
  await service.remember({
    content: "SQLite writes use optimistic revisions.", kind: "instruction", scope: "project:nuzo", tags: ["sqlite"], source: "test",
  });
  await service.remember({
    content: "The user prefers concise answers with explicit tradeoffs.", kind: "preference", scope: "user:default", tags: ["style"], source: "test",
  });
  return { directory, storePath, database, service };
}
