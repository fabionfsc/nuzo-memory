import { describe, expect, it } from "vitest";
import {
  createMemoryService,
  DefaultPolicyEngine,
  formatMemoryExportMarkdown,
  NuzoMemoryError,
  RegexSecretScanner,
} from "../index.js";
import {
  InMemoryAuditLog,
  InMemorySearchIndex,
  InMemoryStore,
  SequentialIdGenerator,
  FixedClock,
} from "../testing.js";
import { encodeMemoryEventCursor } from "../pagination.js";
import type { ListMemoryRelationsInput, MemoryRecord, MemoryRelationRecord } from "../index.js";

class CountingRelationStore extends InMemoryStore {
  relationQueries = 0;
  batchRelationQueries = 0;

  override async listRelations(input: ListMemoryRelationsInput): Promise<MemoryRelationRecord[]> {
    this.relationQueries += 1;
    return super.listRelations(input);
  }

  override async listRelationsForMemoryIds(
    memoryIds: readonly string[],
    includeReverse = true,
  ): Promise<MemoryRelationRecord[]> {
    this.batchRelationQueries += 1;
    return super.listRelationsForMemoryIds(memoryIds, includeReverse);
  }
}

// A policy that fails an endpoint authorization check with a non-authorization
// error, used to prove relation reads rethrow instead of swallowing it.
class RethrowEndpointPolicy extends DefaultPolicyEngine {
  constructor(private readonly boomMemoryId: string) {
    super(new RegexSecretScanner());
  }

  override assertCanListRelations = async (
    input: ListMemoryRelationsInput,
    memory: MemoryRecord,
  ): Promise<void> => {
    if (memory.id === this.boomMemoryId) {
      throw new NuzoMemoryError(
        "MEMORY_POLICY_TEST_FAILURE",
        "Simulated non-authorization policy failure.",
      );
    }
    await super.assertCanListRelations(input, memory);
  };
}

class HideEndpointPolicy extends DefaultPolicyEngine {
  constructor(private readonly hiddenMemoryId: string) {
    super(new RegexSecretScanner());
  }

  override assertCanListRelations = async (
    input: ListMemoryRelationsInput,
    memory: MemoryRecord,
  ): Promise<void> => {
    if (memory.id === this.hiddenMemoryId) {
      throw new NuzoMemoryError(
        "MEMORY_SCOPE_FORBIDDEN",
        "Memory scope is not authorized.",
        { scope: memory.scope },
      );
    }
    await super.assertCanListRelations(input, memory);
  };
}

function createTestService() {
  const store = new InMemoryStore();
  const searchIndex = new InMemorySearchIndex();
  const auditLog = new InMemoryAuditLog();
  const clock = new FixedClock();
  const ids = new SequentialIdGenerator();
  const policy = new DefaultPolicyEngine(new RegexSecretScanner());

  const service = createMemoryService({
    store,
    searchIndex,
    auditLog,
    clock,
    ids,
    policy,
  });

  return { auditLog, clock, service, store };
}

function createRestrictedTestService(scopes: Array<"user:default" | "project:nuzo">) {
  const store = new InMemoryStore();
  const searchIndex = new InMemorySearchIndex();
  const auditLog = new InMemoryAuditLog();
  const clock = new FixedClock();
  const ids = new SequentialIdGenerator();
  const policy = new DefaultPolicyEngine(new RegexSecretScanner(), {
    allowedScopes: scopes,
  });

  const service = createMemoryService({
    store,
    searchIndex,
    auditLog,
    clock,
    ids,
    policy,
  });

  return { auditLog, service, store };
}

describe("memory service", () => {
  it("hydrates relation batches with one relation query while preserving per-memory ordering and limits", async () => {
    const store = new CountingRelationStore();
    const service = createMemoryService({
      store,
      searchIndex: new InMemorySearchIndex(),
      auditLog: new InMemoryAuditLog(),
      clock: new FixedClock(),
      ids: new SequentialIdGenerator(),
      policy: new DefaultPolicyEngine(new RegexSecretScanner()),
    });
    const memories = await Promise.all(["alpha", "beta", "gamma", "delta"].map((name) => service.remember({
      content: `Synthetic ${name} batch memory.`,
      kind: "note",
      scope: "project:nuzo",
      source: "test:relation-batch",
    })));
    const [alpha, beta, gamma, delta] = memories as [MemoryRecord, MemoryRecord, MemoryRecord, MemoryRecord];
    const oldest = await service.relate({
      sourceMemoryId: alpha.id,
      targetMemoryId: delta.id,
      relation: "related_to",
      actor: "test",
    });
    const middle = await service.relate({
      sourceMemoryId: beta.id,
      targetMemoryId: alpha.id,
      relation: "supersedes",
      actor: "test",
    });
    const newest = await service.relate({
      sourceMemoryId: alpha.id,
      targetMemoryId: gamma.id,
      relation: "conflicts_with",
      actor: "test",
    });

    store.relationQueries = 0;
    store.batchRelationQueries = 0;
    const hydrated = await service.relationsBatch({
      memoryIds: [alpha.id, beta.id, gamma.id],
      includeReverse: true,
      limitPerMemory: 2,
    });

    expect(store.relationQueries).toBe(0);
    expect(store.batchRelationQueries).toBe(1);
    expect(hydrated.get(alpha.id)).toEqual([newest, middle]);
    expect(hydrated.get(beta.id)).toEqual([middle]);
    expect(hydrated.get(gamma.id)).toEqual([newest]);
    expect(hydrated.get(alpha.id)).not.toContain(oldest);
  });

  it("reports bounded content-free relation governance candidates without writing state or audit events", async () => {
    const { auditLog, clock, service, store } = createTestService();
    const previous = await service.remember({
      content: "Final answers should be concise for routine status updates.",
      kind: "preference",
      scope: "project:nuzo",
      tags: ["response", "style"],
      source: "test:legacy",
      reviewAfter: new Date("2026-06-11T00:00:00.000Z"),
    });
    const current = await service.remember({
      content: "Final answers should now be detailed instead of concise for routine status updates.",
      kind: "preference",
      scope: "project:nuzo",
      tags: ["response", "style"],
      source: "test:legacy",
    });
    const existing = await service.relate({
      sourceMemoryId: current.id,
      targetMemoryId: previous.id,
      relation: "supersedes",
      actor: "test",
    });
    const duplicate: MemoryRecord = {
      ...previous,
      id: "mem_legacy_duplicate",
      createdAt: new Date("2026-06-10T00:00:00.000Z"),
      updatedAt: new Date("2026-06-10T00:00:00.000Z"),
      reviewAfter: null,
    };
    await store.create(duplicate);
    const beforeMemories = await store.list({ scope: "project:nuzo", includeArchived: true });
    const beforeRelations = await store.listRelationsForMemoryIds(beforeMemories.map((memory) => memory.id));
    const beforeEvents = await auditLog.query({ limit: 200 });

    const report = await service.reviewRelations({
      scope: "project:nuzo",
      includeArchived: true,
      limit: 20,
    });

    expect(report).toMatchObject({
      version: 1,
      mode: "read_only",
      memoryWrites: false,
      relationWrites: false,
      lifecycleWrites: false,
      auditWrites: false,
      scope: "project:nuzo",
      memoryScanLimit: 200,
      candidateLimit: 20,
      memoryScanTruncated: false,
      candidateResultsTruncated: false,
    });
    expect(report.candidates).toContainEqual(expect.objectContaining({
      primaryMemoryId: previous.id,
      candidateMemoryId: duplicate.id,
      relationship: "exact_duplicate",
      reasonCodes: expect.arrayContaining(["exact_normalized_content"]),
      state: "unreviewed",
    }));
    expect(report.candidates).toContainEqual(expect.objectContaining({
      primaryMemoryId: current.id,
      candidateMemoryId: previous.id,
      relationship: "update_candidate",
      reasonCodes: expect.arrayContaining(["possible_revision", "shared_tags", "shared_terms"]),
      state: "already_related",
      existingRelations: [{
        id: existing.id,
        relation: "supersedes",
        direction: "outgoing",
      }],
    }));
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain("Final answers");
    expect(serialized).not.toContain("routine status");
    expect(await store.list({ scope: "project:nuzo", includeArchived: true })).toEqual(beforeMemories);
    expect(await store.listRelationsForMemoryIds(beforeMemories.map((memory) => memory.id))).toEqual(beforeRelations);
    expect(await auditLog.query({ limit: 200 })).toEqual(beforeEvents);

    clock.set(new Date("2026-06-12T00:00:00.000Z"));
    const dueReport = await service.reviewRelations({
      scope: "project:nuzo",
      needsReview: true,
      limit: 20,
    });
    expect(dueReport.needsReview).toBe(true);
    expect(dueReport.candidates.every((candidate) => candidate.primaryMemoryId === previous.id)).toBe(true);
    expect(dueReport.candidates.every((candidate) => candidate.primaryLifecycle === "review_due")).toBe(true);
  });

  it("omits relation governance pairs whose endpoint policy is not authorized", async () => {
    const store = new InMemoryStore();
    const searchIndex = new InMemorySearchIndex();
    const auditLog = new InMemoryAuditLog();
    const clock = new FixedClock();
    const ids = new SequentialIdGenerator();
    const admin = createMemoryService({
      store,
      searchIndex,
      auditLog,
      clock,
      ids,
      policy: new DefaultPolicyEngine(new RegexSecretScanner()),
    });
    const previous = await admin.remember({
      content: "The response format uses concise summaries.",
      kind: "preference",
      scope: "project:nuzo",
      tags: ["response"],
      source: "test",
    });
    const hidden = await admin.remember({
      content: "The response format now uses detailed summaries instead of concise summaries.",
      kind: "preference",
      scope: "project:nuzo",
      tags: ["response"],
      source: "test",
    });
    const restricted = createMemoryService({
      store,
      searchIndex,
      auditLog,
      clock,
      ids,
      policy: new HideEndpointPolicy(hidden.id),
    });

    const report = await restricted.reviewRelations({ scope: "project:nuzo", limit: 20 });
    expect(JSON.stringify(report)).not.toContain(hidden.id);
    expect(JSON.stringify(report)).not.toContain(previous.content);
  });

  it("serializes identical confirmed creates without a transaction manager", async () => {
    const { service } = createTestService();
    const input = {
      decision: "create" as const,
      content: "Same-service confirmed capture remains unique.",
      kind: "note" as const,
      scope: "user:default" as const,
      source: "test:capture-confirmed",
      reason: "The user confirmed the concurrency fixture.",
      confirm: true,
      actor: "test",
    };

    const results = await Promise.all([
      service.confirmCapture(input),
      service.confirmCapture(input),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual(["created", "skipped"]);
    await expect(service.list({ scope: "user:default" })).resolves.toHaveLength(1);
  });

  it("remembers and recalls without recording usage by default", async () => {
    const { auditLog, service } = createTestService();

    const memory = await service.remember({
      content: "The user prefers local-first developer tools.",
      kind: "preference",
      scope: "user:default",
      tags: ["workflow"],
      source: "test",
    });

    expect(memory.id).toBe("mem_000001");
    expect(memory.revision).toBe(1);
    expect(memory.confidenceState).toBe("user_confirmed");

    const results = await service.recall({
      query: "local-first tools",
      scope: "user:default",
      limit: 5,
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.memory.id).toBe(memory.id);

    const events = await auditLog.list(memory.id);
    expect(events.map((event) => event.eventType)).toEqual(["memory.created"]);
  });

  it("stores, validates, updates, and clears confidence state", async () => {
    const { service } = createTestService();

    const memory = await service.remember({
      content: "This deploy flow should be reviewed before use.",
      kind: "project_decision",
      scope: "project:nuzo",
      source: "test",
      confidence: 0.6,
      confidenceState: "observed",
    });
    expect(memory.confidence).toBe(0.6);
    expect(memory.confidenceState).toBe("observed");

    const updated = await service.update({
      id: memory.id,
      actor: "test",
      confidenceState: "needs_review",
    });
    expect(updated.confidence).toBe(0.6);
    expect(updated.confidenceState).toBe("needs_review");

    const cleared = await service.update({
      id: memory.id,
      actor: "test",
      confidenceState: null,
    });
    expect(cleared.confidenceState).toBeNull();

    await expect(service.remember({
      content: "Unsupported confidence state should be rejected.",
      kind: "note",
      scope: "project:nuzo",
      source: "test",
      confidenceState: "certain" as never,
    })).rejects.toMatchObject({ code: "MEMORY_CONFIDENCE_STATE_INVALID" });
  });

  it("creates, lists, exports, imports, and removes explicit memory relations", async () => {
    const { auditLog, service } = createTestService();
    const previous = await service.remember({
      content: "The deploy flow uses script A.",
      kind: "project_decision",
      scope: "project:nuzo",
      source: "test",
    });
    const current = await service.remember({
      content: "The deploy flow uses script B.",
      kind: "project_decision",
      scope: "project:nuzo",
      source: "test",
    });

    const relation = await service.relate({
      sourceMemoryId: current.id,
      targetMemoryId: previous.id,
      relation: "supersedes",
      reason: "Newer deployment decision replaces the older note.",
      actor: "test",
    });

    expect(relation).toMatchObject({
      id: "rel_000001",
      sourceMemoryId: current.id,
      targetMemoryId: previous.id,
      relation: "supersedes",
      reason: "Newer deployment decision replaces the older note.",
    });
    await expect(service.relate({
      sourceMemoryId: current.id,
      targetMemoryId: previous.id,
      relation: "supersedes",
      actor: "test",
    })).rejects.toMatchObject({ code: "MEMORY_RELATION_DUPLICATE" });
    await expect(service.relate({
      sourceMemoryId: current.id,
      targetMemoryId: current.id,
      relation: "related_to",
      actor: "test",
    })).rejects.toMatchObject({ code: "MEMORY_RELATION_SELF_INVALID" });

    expect(await service.relations({ memoryId: previous.id })).toMatchObject([
      { id: relation.id, sourceMemoryId: current.id, targetMemoryId: previous.id },
    ]);

    const document = await service.exportMemories({
      scope: "project:nuzo",
      includeArchived: true,
      actor: "test",
    });
    expect(document.relations).toEqual([{
      source_index: 0,
      target_index: 1,
      relation: "supersedes",
      reason: "Newer deployment decision replaces the older note.",
      created_at: "2026-06-12T00:00:00.000Z",
    }]);

    const target = createTestService();
    const imported = await target.service.importMemories({
      document,
      actor: "test",
    });
    expect(imported).toEqual({ imported: 2, skipped: 0, dryRun: false });
    const importedMemories = await target.service.list({ scope: "project:nuzo" });
    const importedRelations = await target.service.relations({ memoryId: importedMemories[0]!.id });
    expect(importedRelations).toHaveLength(1);
    expect(importedRelations[0]).toMatchObject({
      relation: "supersedes",
      reason: "Newer deployment decision replaces the older note.",
    });
    await expect(target.service.audit({ eventTypes: ["memory.relation.created"] }))
      .resolves.toMatchObject([{
        payload: {
          sourceScope: "project:nuzo",
          targetScope: "project:nuzo",
          imported: true,
        },
      }]);

    await service.forgetRelation({
      id: relation.id,
      actor: "test",
      reason: "Cleanup",
    });
    expect(await service.relations({ memoryId: current.id })).toEqual([]);
    expect((await auditLog.list(current.id)).map((event) => event.eventType)).toEqual([
      "memory.created",
      "memory.relation.created",
      "memory.relation.deleted",
    ]);
  });

  it("inspects and challenges memories without deleting content", async () => {
    const { auditLog, clock, service } = createTestService();
    const oldMemory = await service.remember({
      content: "The repo deploy flow uses script A.",
      kind: "project_decision",
      scope: "project:nuzo",
      source: "test",
    });
    const newMemory = await service.remember({
      content: "The repo deploy flow uses script B.",
      kind: "project_decision",
      scope: "project:nuzo",
      source: "test",
    });

    const needsReview = await service.challenge({
      id: oldMemory.id,
      expectedRevision: oldMemory.revision,
      outcome: "needs_review",
      reason: "Need to verify whether this is still true.",
      actor: "test",
    });
    expect(needsReview).toMatchObject({
      outcome: "needs_review",
      relation: null,
      memory: {
        id: oldMemory.id,
        revision: 2,
        confidenceState: "needs_review",
      },
    });
    expect(needsReview.memory.reviewAfter?.toISOString()).toBe("2026-06-12T00:00:00.000Z");

    const inspection = await service.inspect({ id: oldMemory.id, historyLimit: 10 });
    expect(inspection.memory.content).toBe("The repo deploy flow uses script A.");
    expect(inspection.relations).toEqual([]);
    expect(inspection.events.map((event) => event.eventType)).toEqual([
      "memory.created",
      "memory.updated",
      "memory.challenged",
    ]);

    clock.set(new Date("2026-06-13T00:00:00.000Z"));
    const superseded = await service.challenge({
      id: oldMemory.id,
      expectedRevision: needsReview.memory.revision,
      outcome: "superseded",
      supersededByMemoryId: newMemory.id,
      reason: "Script B replaced script A.",
      actor: "test",
    });
    expect(superseded.memory).toMatchObject({
      revision: 3,
      confidenceState: "deprecated",
    });
    expect(superseded.relation).toMatchObject({
      id: "rel_000001",
      sourceMemoryId: newMemory.id,
      targetMemoryId: oldMemory.id,
      relation: "supersedes",
      reason: "Script B replaced script A.",
    });

    clock.set(new Date("2026-06-14T00:00:00.000Z"));
    const valid = await service.challenge({
      id: oldMemory.id,
      expectedRevision: superseded.memory.revision,
      outcome: "valid",
      reason: "User revalidated the older record for a legacy branch.",
      actor: "test",
    });
    expect(valid.memory.confidenceState).toBe("user_confirmed");
    expect(valid.memory.reviewAfter).toBeNull();

    await expect(service.challenge({
      id: oldMemory.id,
      outcome: "superseded",
      reason: "Missing target.",
      actor: "test",
    })).rejects.toMatchObject({ code: "MEMORY_SUPERSEDING_MEMORY_REQUIRED" });

    expect((await auditLog.list(oldMemory.id)).map((event) => event.eventType)).toEqual([
      "memory.created",
      "memory.updated",
      "memory.challenged",
      "memory.updated",
      "memory.challenged",
      "memory.updated",
      "memory.challenged",
    ]);
  });

  it("stores, filters, updates, and clears review lifecycle metadata", async () => {
    const { clock, service } = createTestService();
    const reviewAfter = new Date("2026-06-11T00:00:00.000Z");
    const expiresAt = new Date("2026-06-20T00:00:00.000Z");

    const due = await service.remember({
      content: "Review this deployment note before relying on it.",
      kind: "project_decision",
      scope: "project:nuzo",
      source: "test",
      reviewAfter,
      expiresAt,
    });
    const future = await service.remember({
      content: "Review this later deployment note next month.",
      kind: "project_decision",
      scope: "project:nuzo",
      source: "test",
      reviewAfter: new Date("2026-07-01T00:00:00.000Z"),
    });

    expect(due.reviewAfter?.toISOString()).toBe(reviewAfter.toISOString());
    expect(due.expiresAt?.toISOString()).toBe(expiresAt.toISOString());
    expect(future.reviewAfter?.toISOString()).toBe("2026-07-01T00:00:00.000Z");

    const dueMemories = await service.list({
      scope: "project:nuzo",
      needsReview: true,
    });
    expect(dueMemories.map((memory) => memory.id)).toEqual([due.id]);

    clock.set(new Date("2026-07-02T00:00:00.000Z"));
    await expect(service.list({
      scope: "project:nuzo",
      needsReview: true,
    })).resolves.toHaveLength(2);

    const updated = await service.update({
      id: due.id,
      actor: "test",
      reviewAfter: new Date("2026-08-01T00:00:00.000Z"),
      expiresAt: null,
    });
    expect(updated.reviewAfter?.toISOString()).toBe("2026-08-01T00:00:00.000Z");
    expect(updated.expiresAt).toBeNull();

    const cleared = await service.update({
      id: updated.id,
      actor: "test",
      reviewAfter: null,
    });
    expect(cleared.reviewAfter).toBeNull();

    await expect(service.remember({
      content: "Invalid lifecycle date should be rejected.",
      kind: "note",
      scope: "project:nuzo",
      source: "test",
      reviewAfter: new Date("not-a-date"),
    })).rejects.toMatchObject({ code: "MEMORY_DATE_INVALID" });
  });

  it("stores, validates, updates, and clears structured provenance", async () => {
    const { service } = createTestService();

    const memory = await service.remember({
      content: "This repo uses npm scripts for validation.",
      kind: "project_decision",
      scope: "project:nuzo",
      tags: ["workflow"],
      source: "codex:capture-confirmed",
      provenance: {
        kind: "file",
        host: "codex",
        surface: "mcp",
        path: "AGENTS.md",
        line: 42,
        action: "capture_confirmed",
        reason: "User confirmed repository workflow guidance.",
      },
    });

    expect(memory.provenance).toEqual({
      kind: "file",
      host: "codex",
      surface: "mcp",
      path: "AGENTS.md",
      line: 42,
      action: "capture_confirmed",
      reason: "User confirmed repository workflow guidance.",
    });

    const updated = await service.update({
      id: memory.id,
      actor: "test",
      provenance: {
        kind: "conversation",
        host: "codex",
        surface: "cli",
        action: "update",
      },
    });
    expect(updated.provenance).toEqual({
      kind: "conversation",
      host: "codex",
      surface: "cli",
      action: "update",
    });

    const cleared = await service.update({
      id: memory.id,
      actor: "test",
      provenance: null,
    });
    expect(cleared.provenance).toBeNull();

    await expect(service.remember({
      content: "Unsafe provenance path should be rejected.",
      kind: "note",
      scope: "project:nuzo",
      source: "test",
      provenance: {
        kind: "file",
        path: "../secrets.env",
      },
    })).rejects.toMatchObject({ code: "MEMORY_PROVENANCE_PATH_UNSAFE" });

    await expect(service.remember({
      content: "Sensitive provenance reason should be rejected.",
      kind: "note",
      scope: "project:nuzo",
      source: "test",
      provenance: {
        kind: "conversation",
        reason: "Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456",
      },
    })).rejects.toMatchObject({ code: "MEMORY_SECRET_DETECTED" });
  });

  it("recalls Unicode words without splitting accented characters", async () => {
    const { service } = createTestService();
    const memory = await service.remember({
      content: "A memória local deve permanecer auditável.",
      kind: "instruction",
      scope: "user:default",
      source: "test",
    });

    const results = await service.recall({
      query: "memória auditável",
      scope: "user:default",
    });

    expect(results[0]?.memory.id).toBe(memory.id);
  });

  it("records recall usage only when explicitly requested", async () => {
    const { auditLog, service, store } = createTestService();

    const memory = await service.remember({
      content: "Nuzo should keep recall hooks read-only.",
      kind: "instruction",
      scope: "project:nuzo",
      tags: ["hooks"],
      source: "test",
    });

    const results = await service.recall({
      query: "read-only hooks",
      scope: "project:nuzo",
      limit: 5,
      includeGlobal: true,
      recordUsage: true,
    });

    expect(results[0]?.memory.id).toBe(memory.id);
    await expect(store.findById(memory.id)).resolves.toMatchObject({
      lastUsedAt: new Date("2026-06-12T00:00:00.000Z"),
    });

    const events = await auditLog.list(memory.id);
    expect(events.map((event) => event.eventType)).toEqual(["memory.created", "memory.recalled"]);
    expect(events[1]?.payload).toEqual({
      queryHash: "ff69922274ea614baa14ce1a4e065af177b7efe53f5533169d5bdb0baecf5194",
      queryHashAlgorithm: "sha256",
      score: results[0]?.score,
      scope: "project:nuzo",
    });
    expect(JSON.stringify(events[1]?.payload)).not.toContain("read-only hooks");
  });

  it("queries bounded store-wide audit events with filters", async () => {
    const { service } = createTestService();

    const userMemory = await service.remember({
      content: "User prefers audit summaries.",
      kind: "preference",
      scope: "user:default",
      source: "test:user",
      actor: "test:user",
    });
    const projectMemory = await service.remember({
      content: "Project exports should be visible in global audit.",
      kind: "project_decision",
      scope: "project:nuzo",
      source: "test:project",
    });
    await service.exportMemories({
      scope: "project:nuzo",
      actor: "test:export",
    });

    await expect(service.audit({ limit: 2 })).resolves.toMatchObject([
      {
        eventType: "memory.exported",
        memoryId: null,
        actor: "test:export",
      },
      {
        eventType: "memory.created",
        memoryId: projectMemory.id,
        actor: "core",
      },
    ]);

    await expect(service.audit({ scope: "project:nuzo" })).resolves.toMatchObject([
      {
        eventType: "memory.exported",
        memoryId: null,
      },
      {
        eventType: "memory.created",
        memoryId: projectMemory.id,
      },
    ]);

    await expect(service.audit({
      memoryId: userMemory.id,
      eventTypes: ["memory.created"],
      actor: "test:user",
    })).resolves.toMatchObject([
      {
        eventType: "memory.created",
        memoryId: userMemory.id,
        actor: "test:user",
      },
    ]);
  });

  it("rejects fractional limits and oversized audit event filters", async () => {
    const { service } = createTestService();

    await expect(service.recall({
      query: "bounded recall",
      scope: "project:nuzo",
      limit: 1.5,
    })).rejects.toMatchObject({ code: "RECALL_LIMIT_INVALID" });
    await expect(service.list({ limit: 1.5 })).rejects.toMatchObject({
      code: "MEMORY_LIST_LIMIT_INVALID",
    });
    await expect(service.audit({ limit: 1.5 })).rejects.toMatchObject({
      code: "MEMORY_AUDIT_LIMIT_INVALID",
    });
    await expect(service.history("mem_missing", { limit: 1.5 })).rejects.toMatchObject({
      code: "MEMORY_HISTORY_LIMIT_INVALID",
    });
    await expect(service.audit({
      eventTypes: Array.from({ length: 11 }, () => "memory.created" as const),
    })).rejects.toMatchObject({
      code: "MEMORY_AUDIT_EVENT_TYPE_LIMIT_EXCEEDED",
      details: { maxEventTypes: 10 },
    });
  });

  it("enforces restricted scope policy for audit queries", async () => {
    const unrestricted = createTestService();
    const allowed = await unrestricted.service.remember({
      content: "Allowed project audit event.",
      kind: "note",
      scope: "project:nuzo",
      source: "test",
    });
    await unrestricted.service.exportMemories({
      scope: "project:nuzo",
      actor: "test:export",
    });
    const forbidden = await unrestricted.service.remember({
      content: "Forbidden user audit event.",
      kind: "note",
      scope: "user:default",
      source: "test",
    });

    const restricted = createRestrictedTestService(["project:nuzo"]);
    for (const memory of await unrestricted.store.list({ includeArchived: true })) {
      await restricted.store.create(memory);
    }
    for (const event of await unrestricted.service.audit()) {
      await restricted.auditLog.append(event);
    }

    await expect(restricted.service.audit()).rejects.toMatchObject({
      code: "MEMORY_SCOPE_REQUIRED",
    });
    await expect(restricted.service.audit({ scope: "user:default" })).rejects.toMatchObject({
      code: "MEMORY_SCOPE_FORBIDDEN",
    });
    await expect(restricted.service.audit({ memoryId: forbidden.id })).rejects.toMatchObject({
      code: "MEMORY_SCOPE_FORBIDDEN",
    });
    await expect(restricted.service.history(forbidden.id)).rejects.toMatchObject({
      code: "MEMORY_SCOPE_FORBIDDEN",
    });
    await expect(restricted.service.audit({ memoryId: allowed.id })).resolves.toMatchObject([
      {
        memoryId: allowed.id,
      },
    ]);
    await expect(restricted.service.history(allowed.id)).resolves.toMatchObject([
      {
        memoryId: allowed.id,
      },
    ]);
    await expect(restricted.service.history("mem_missing")).rejects.toMatchObject({
      code: "MEMORY_SCOPE_REQUIRED",
    });
    await expect(restricted.service.audit({ scope: "project:nuzo" })).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: "memory.exported",
          memoryId: null,
          payload: expect.objectContaining({
            scope: "project:nuzo",
          }),
        }),
      ]),
    );
  });

  it("rejects likely secrets", async () => {
    const { service } = createTestService();

    await expect(
      service.remember({
        content: "github token is ghp_123456789012345678901234567890123456",
        kind: "note",
        scope: "user:default",
        source: "test",
      }),
    ).rejects.toMatchObject({
      code: "MEMORY_SECRET_DETECTED",
    });
  });

  it("validates capture suggestions without writing memory or audit events", async () => {
    const { auditLog, service } = createTestService();

    const suggestion = await service.suggestCapture({
      content: "  The user prefers concise final answers.  ",
      kind: "preference",
      scope: "user:default",
      tags: ["workflow", "workflow"],
      source: "codex:capture-suggestion",
      confidence: 0.72,
      confidenceState: "observed",
      provenance: {
        kind: "conversation",
        host: "codex",
        surface: "mcp",
        action: "suggest_capture",
      },
      reason: "The user stated a durable response style preference.",
    });

    expect(suggestion).toEqual({
      status: "ready",
      memoryWrites: false,
      requiresConfirmation: true,
      draft: {
        content: "The user prefers concise final answers.",
        kind: "preference",
        scope: "user:default",
        tags: ["workflow"],
        source: "codex:capture-suggestion",
        confidence: 0.72,
        confidenceState: "observed",
        provenance: {
          kind: "conversation",
          host: "codex",
          surface: "mcp",
          action: "suggest_capture",
        },
        reviewAfter: null,
        expiresAt: null,
        reason: "The user stated a durable response style preference.",
      },
      duplicate: null,
    });
    await expect(service.list({ scope: "user:default" })).resolves.toEqual([]);
    await expect(auditLog.list("mem_000001")).resolves.toEqual([]);
  });

  it("accepts representative allowed capture suggestion candidates without persisting drafts", async () => {
    const { service } = createTestService();
    const examples = [
      {
        content: "For Nuzo, always use GitHub Issues for executable work.",
        kind: "instruction" as const,
        scope: "project:nuzo" as const,
        tags: ["workflow"],
      },
      {
        content: "I prefer concise status updates while work is running.",
        kind: "preference" as const,
        scope: "user:default" as const,
        tags: ["communication"],
      },
      {
        content: "This repo uses /tmp/nuzo-git as the git dir workaround.",
        kind: "fact" as const,
        scope: "project:nuzo" as const,
        tags: ["git"],
      },
      {
        content: "When changing MCP tools, update docs/spec/tools.md first.",
        kind: "instruction" as const,
        scope: "project:nuzo" as const,
        tags: ["mcp", "docs"],
      },
    ];

    for (const example of examples) {
      const suggestion = await service.suggestCapture({
        ...example,
        source: "test:capture-candidate",
        confidence: 0.8,
        reason: "Representative durable memory candidate from the capture suggestion spec.",
      });

      expect(suggestion).toMatchObject({
        status: "ready",
        memoryWrites: false,
        requiresConfirmation: true,
        draft: example,
        duplicate: null,
      });
    }

    await expect(service.list({})).resolves.toEqual([]);
  });

  it("persists a confirmed capture draft only through remember", async () => {
    const { auditLog, service } = createTestService();

    const suggestion = await service.suggestCapture({
      content: "Nuzo should keep MCP tool schemas in docs/spec/tools.md.",
      kind: "project_decision",
      scope: "project:nuzo",
      tags: ["mcp", "docs"],
      source: "test:capture-candidate",
      confidence: 0.8,
      reason: "The statement is a durable project rule for future MCP changes.",
    });

    await expect(service.list({ scope: "project:nuzo" })).resolves.toEqual([]);

    const memory = await service.remember({
      content: suggestion.draft.content,
      kind: suggestion.draft.kind,
      scope: suggestion.draft.scope,
      tags: suggestion.draft.tags,
      source: "test:capture-confirmed",
      confidence: suggestion.draft.confidence,
    });

    await expect(service.list({ scope: "project:nuzo" })).resolves.toHaveLength(1);
    await expect(auditLog.list(memory.id)).resolves.toHaveLength(1);
  });

  it("reports exact active duplicate capture suggestions in the same scope", async () => {
    const { service } = createTestService();
    const memory = await service.remember({
      content: "The user prefers concise final answers.",
      kind: "preference",
      scope: "user:default",
      tags: ["workflow"],
      source: "test",
    });

    const suggestion = await service.suggestCapture({
      content: " the USER prefers   concise final answers. ",
      kind: "note",
      scope: "user:default",
      tags: ["style"],
      source: "codex:capture-suggestion",
      reason: "Equivalent content was inferred from the conversation.",
    });

    expect(suggestion.status).toBe("duplicate");
    expect(suggestion.memoryWrites).toBe(false);
    expect(suggestion.duplicate?.id).toBe(memory.id);
    await expect(service.list({ scope: "user:default" })).resolves.toHaveLength(1);
  });

  it("returns bounded relationship evidence without writing memory or audit events", async () => {
    const { auditLog, service } = createTestService();
    const memory = await service.remember({
      content: "The user prefers concise final answers with explicit tradeoffs.",
      kind: "preference",
      scope: "user:default",
      tags: ["communication", "style"],
      source: "test",
    });
    const beforeEvents = await auditLog.list(memory.id);

    const suggestion = await service.suggestCapture({
      content: "The user prefers detailed final answers with explicit tradeoffs.",
      kind: "preference",
      scope: "user:default",
      tags: ["communication"],
      source: "codex:capture-suggestion",
      confidence: 0.8,
      reason: "The user stated a durable response style preference.",
      relationshipMode: "bounded",
    });

    expect(suggestion).toMatchObject({
      status: "review",
      memoryWrites: false,
      requiresConfirmation: true,
      duplicate: null,
      relationshipMode: "bounded",
      relationship: "update_candidate",
      relationshipEvidence: {
        version: 1,
        primaryMemoryId: memory.id,
        candidateLimit: 20,
        returnedLimit: 3,
        candidates: [
          {
            memory: { id: memory.id },
            matchedTags: ["communication"],
          },
        ],
      },
    });
    expect(suggestion.relationshipEvidence?.candidates[0]?.matchedTerms).toContain("final");
    await expect(service.list({ scope: "user:default" })).resolves.toHaveLength(1);
    await expect(auditLog.list(memory.id)).resolves.toEqual(beforeEvents);
  });

  it("does not claim independence after truncating qualifying capture candidates", async () => {
    const { service } = createTestService();
    for (let index = 0; index < 21; index += 1) {
      await service.remember({
        content: `Release branch fixture ${index} stores unrelated context.`,
        kind: "note",
        scope: "project:nuzo",
        source: "test",
      });
    }

    const suggestion = await service.suggestCapture({
      content: "Release branch governance applies for every planned milestone.",
      kind: "project_decision",
      scope: "project:nuzo",
      source: "codex:capture-suggestion",
      reason: "The project established a durable release governance rule.",
      relationshipMode: "bounded",
    });

    expect(suggestion).toMatchObject({
      status: "review",
      memoryWrites: false,
      requiresConfirmation: true,
      duplicate: null,
      relationshipMode: "bounded",
      relationship: "uncertain",
      relationshipEvidence: {
        primaryMemoryId: null,
        evaluatedCount: 20,
        searchExhaustive: false,
        evidenceTruncated: true,
        candidates: [],
      },
    });
    expect(suggestion.relationshipEvidence?.reason).toContain("not exhaustive");
    await expect(service.list({ scope: "project:nuzo" })).resolves.toHaveLength(21);
  });

  it("prefilters dense capture scopes while preserving related and exact evidence", async () => {
    const { service } = createTestService();
    for (let index = 0; index < 125; index += 1) {
      await service.remember({
        content: `Synthetic editor state ${index} records temporary window layout and cursor position.`,
        kind: "note",
        scope: "project:dense",
        tags: ["synthetic", `row-${index}`],
        source: "test:dense",
      });
    }
    const related = await service.remember({
      content: "Production deployment requires an explicit rollback checklist and service owner.",
      kind: "instruction",
      scope: "project:dense",
      tags: ["deploy", "rollback"],
      source: "test:dense",
    });

    const suggestion = await service.suggestCapture({
      content: "Production deployment needs a rollback checklist and an owner.",
      kind: "instruction",
      scope: "project:dense",
      tags: ["deploy"],
      source: "test:dense",
      reason: "Dense relationship lookup remains bounded.",
      relationshipMode: "bounded",
    });
    expect(suggestion).toMatchObject({
      relationship: "related",
      relationshipEvidence: {
        primaryMemoryId: related.id,
        searchExhaustive: false,
        evidenceTruncated: true,
      },
    });
    expect(suggestion.relationshipEvidence?.evaluatedCount).toBeLessThanOrEqual(20);

    const independent = await service.suggestCapture({
      content: "Rust source files use cargo fmt before review.",
      kind: "instruction",
      scope: "project:dense",
      source: "test:dense",
      reason: "Dense independent lookup must fail closed.",
      relationshipMode: "bounded",
    });
    expect(independent).toMatchObject({
      relationship: "uncertain",
      relationshipEvidence: {
        primaryMemoryId: null,
        searchExhaustive: false,
        evidenceTruncated: true,
      },
    });

    const duplicate = await service.suggestCapture({
      content: "  production deployment requires an explicit rollback checklist and service owner.  ",
      kind: "note",
      scope: "project:dense",
      source: "test:dense",
      reason: "Exact lookup remains deterministic in a dense scope.",
      relationshipMode: "bounded",
    });
    expect(duplicate).toMatchObject({
      relationship: "exact_duplicate",
      duplicate: { id: related.id },
      relationshipEvidence: {
        primaryMemoryId: related.id,
        evaluatedCount: 1,
        searchExhaustive: true,
        evidenceTruncated: false,
      },
    });
  });

  it("fails closed when a custom capture prefilter violates scope and result bounds", async () => {
    const { service, store } = createTestService();
    const forbidden = await service.remember({
      content: "Another project stores a forbidden capture candidate.",
      kind: "note",
      scope: "project:other",
      source: "test:adapter",
    });
    store.findCaptureCandidates = async () => ({
      duplicate: forbidden,
      candidates: Array.from({ length: 125 }, () => forbidden),
      searchExhaustive: true,
    });

    const suggestion = await service.suggestCapture({
      content: "Another project stores a forbidden capture candidate.",
      kind: "note",
      scope: "project:nuzo",
      source: "test:adapter",
      reason: "A custom adapter result must not cross the authorized scope.",
      relationshipMode: "bounded",
    });

    expect(suggestion).toMatchObject({
      duplicate: null,
      relationship: "uncertain",
      relationshipEvidence: {
        primaryMemoryId: null,
        evaluatedCount: 0,
        searchExhaustive: false,
        evidenceTruncated: true,
        candidates: [],
      },
    });
  });

  it("applies remember policy to capture suggestions", async () => {
    const { service } = createRestrictedTestService(["project:nuzo"]);

    await expect(
      service.suggestCapture({
        content: "The user prefers concise final answers.",
        kind: "preference",
        scope: "project:nuzo",
        source: "codex:capture-suggestion",
        reason: "   ",
      }),
    ).rejects.toMatchObject({
      code: "MEMORY_REASON_EMPTY",
    });
    await expect(
      service.suggestCapture({
        content: "github token is ghp_123456789012345678901234567890123456",
        kind: "note",
        scope: "project:nuzo",
        source: "codex:capture-suggestion",
        reason: "A sensitive value was inferred.",
      }),
    ).rejects.toMatchObject({
      code: "MEMORY_SECRET_DETECTED",
    });
    await expect(
      service.suggestCapture({
        content: "The user prefers concise final answers.",
        kind: "preference",
        scope: "user:default",
        source: "codex:capture-suggestion",
        reason: "The user stated a durable response style preference.",
      }),
    ).rejects.toMatchObject({
      code: "MEMORY_SCOPE_FORBIDDEN",
    });
  });

  it("blocks unsafe capture suggestions without persisting partial drafts", async () => {
    const { auditLog, service } = createTestService();

    await expect(
      service.suggestCapture({
        content: "My token is ghp_123456789012345678901234567890123456.",
        kind: "note",
        scope: "project:nuzo",
        source: "test:capture-candidate",
        reason: "Unsafe token example from the capture suggestion spec.",
      }),
    ).rejects.toMatchObject({
      code: "MEMORY_SECRET_DETECTED",
    });

    await expect(service.list({ scope: "project:nuzo" })).resolves.toEqual([]);
    await expect(auditLog.list("mem_000001")).resolves.toEqual([]);
  });

  it("applies explicit confirmed capture create, keep-separate, reject, and clarify decisions", async () => {
    const { auditLog, service } = createTestService();

    const created = await service.confirmCapture({
      decision: "create",
      content: "The user prefers concise final answers.",
      kind: "preference",
      scope: "user:default",
      tags: ["communication"],
      source: "test:capture-confirmed",
      reason: "The user confirmed a durable preference.",
      confirm: true,
      actor: "test",
    });
    expect(created).toMatchObject({
      decision: "create",
      status: "created",
      memoryWrites: true,
      memory: { content: "The user prefers concise final answers." },
      requiresConfirmation: false,
    });
    expect(created.memory?.id).toBeDefined();

    const duplicate = await service.confirmCapture({
      decision: "create",
      content: "  the USER prefers concise final answers. ",
      kind: "note",
      scope: "user:default",
      tags: ["style"],
      source: "test:capture-confirmed",
      reason: "The user confirmed an equivalent draft.",
      confirm: true,
      actor: "test",
    });
    expect(duplicate).toMatchObject({
      decision: "create",
      status: "skipped",
      memoryWrites: false,
      memory: { id: created.memory?.id },
    });

    const separate = await service.confirmCapture({
      decision: "keep_separate",
      content: "The user prefers concise final answers.",
      kind: "note",
      scope: "user:default",
      tags: ["style"],
      source: "test:capture-confirmed",
      reason: "The user explicitly asked to keep a separate memory.",
      confirm: true,
      actor: "test",
    });
    expect(separate).toMatchObject({
      decision: "keep_separate",
      status: "created",
      memoryWrites: true,
    });

    const beforeReadOnly = await service.list({ includeArchived: true });
    const reject = await service.confirmCapture({
      decision: "reject",
      content: "Rejected drafts write nothing.",
      kind: "note",
      scope: "user:default",
      source: "test:capture-confirmed",
      reason: "The user rejected the draft.",
      actor: "test",
    });
    const clarify = await service.confirmCapture({
      decision: "clarify",
      content: "Ambiguous drafts require clarification.",
      kind: "note",
      scope: "user:default",
      source: "test:capture-confirmed",
      reason: "The draft was ambiguous.",
      actor: "test",
    });
    expect(reject).toMatchObject({ status: "skipped", memoryWrites: false, memory: null });
    expect(clarify).toMatchObject({ status: "needs_clarification", memoryWrites: false, memory: null });
    await expect(service.list({ includeArchived: true })).resolves.toEqual(beforeReadOnly);
    await expect(auditLog.query({ limit: 20 })).resolves.toHaveLength(2);
  });

  it("applies confirmed capture updates with expected revisions and no silent conflict retry", async () => {
    const { service } = createTestService();
    const memory = await service.remember({
      content: "The user prefers concise final answers.",
      kind: "preference",
      scope: "user:default",
      tags: ["communication"],
      source: "test",
    });

    const updated = await service.confirmCapture({
      decision: "update",
      content: "The user prefers detailed final answers.",
      kind: "preference",
      scope: "user:default",
      tags: ["communication"],
      source: "test:capture-confirmed",
      provenance: {
        kind: "conversation",
        host: "codex",
        surface: "mcp",
        action: "capture_confirmed",
      },
      reason: "The user confirmed a replacement preference.",
      confirm: true,
      actor: "test",
      targetMemoryId: memory.id,
      expectedRevision: memory.revision,
    });
    expect(updated).toMatchObject({
      decision: "update",
      status: "updated",
      memoryWrites: true,
      memory: {
        id: memory.id,
        revision: 2,
        content: "The user prefers detailed final answers.",
        provenance: {
          kind: "conversation",
          host: "codex",
          surface: "mcp",
          action: "capture_confirmed",
        },
      },
    });

    await expect(
      service.confirmCapture({
        decision: "update",
        content: "This stale confirmed update must not commit.",
        kind: "preference",
        scope: "user:default",
        source: "test:capture-confirmed",
        reason: "The user confirmed using a stale displayed revision.",
        confirm: true,
        actor: "test",
        targetMemoryId: memory.id,
        expectedRevision: memory.revision,
      }),
    ).rejects.toMatchObject({
      code: "MEMORY_REVISION_CONFLICT",
      details: {
        id: memory.id,
        expectedRevision: 1,
        currentRevision: 2,
      },
    });
    await expect(service.list({ scope: "user:default" })).resolves.toMatchObject([
      { id: memory.id, revision: 2, content: "The user prefers detailed final answers." },
    ]);
  });

  it("requires explicit confirmation and policy approval before confirmed capture writes", async () => {
    const { service } = createRestrictedTestService(["project:nuzo"]);

    await expect(
      service.confirmCapture({
        decision: "create",
        content: "Unconfirmed capture must not write.",
        kind: "note",
        scope: "project:nuzo",
        source: "test:capture-confirmed",
        reason: "The user has not confirmed the write.",
        actor: "test",
      }),
    ).rejects.toMatchObject({
      code: "MEMORY_CAPTURE_CONFIRMATION_REQUIRED",
    });
    await expect(
      service.confirmCapture({
        decision: "create",
        content: "Global memory is forbidden here.",
        kind: "note",
        scope: "user:default",
        source: "test:capture-confirmed",
        reason: "The write targets a forbidden scope.",
        confirm: true,
        actor: "test",
      }),
    ).rejects.toMatchObject({
      code: "MEMORY_SCOPE_FORBIDDEN",
    });
    await expect(
      service.confirmCapture({
        decision: "create",
        content: "github token is ghp_123456789012345678901234567890123456",
        kind: "note",
        scope: "project:nuzo",
        source: "test:capture-confirmed",
        reason: "The draft contains a secret.",
        confirm: true,
        actor: "test",
      }),
    ).rejects.toMatchObject({
      code: "MEMORY_SECRET_DETECTED",
    });
    await expect(service.list({ scope: "project:nuzo" })).resolves.toEqual([]);
  });

  it("enforces restricted scope authorization", async () => {
    const { service } = createRestrictedTestService(["project:nuzo"]);
    const memory = await service.remember({
      content: "Only project scoped memory is allowed here.",
      kind: "instruction",
      scope: "project:nuzo",
      source: "test",
    });

    await expect(
      service.remember({
        content: "User global memory is not authorized.",
        kind: "note",
        scope: "user:default",
        source: "test",
      }),
    ).rejects.toMatchObject({
      code: "MEMORY_SCOPE_FORBIDDEN",
    });
    await expect(
      service.recall({
        query: "project scoped",
        scope: "project:nuzo",
        includeGlobal: true,
      }),
    ).rejects.toMatchObject({
      code: "MEMORY_SCOPE_FORBIDDEN",
      details: { scope: "user:default" },
    });
    await expect(service.list()).rejects.toMatchObject({
      code: "MEMORY_SCOPE_REQUIRED",
    });
    await expect(
      service.update({
        id: memory.id,
        scope: "user:default",
        actor: "test",
      }),
    ).rejects.toMatchObject({
      code: "MEMORY_SCOPE_FORBIDDEN",
    });
    await expect(
      service.forgetMany({
        all: true,
        actor: "test",
        dryRun: false,
      }),
    ).rejects.toMatchObject({
      code: "MEMORY_SCOPE_REQUIRED",
    });
  });

  it("allows global recall only when user:default is authorized", async () => {
    const { service } = createRestrictedTestService(["project:nuzo", "user:default"]);
    await service.remember({
      content: "Project scope can include global recall when explicitly allowed.",
      kind: "instruction",
      scope: "project:nuzo",
      source: "test",
    });

    await expect(
      service.recall({
        query: "global recall",
        scope: "project:nuzo",
        includeGlobal: true,
      }),
    ).resolves.toHaveLength(1);
  });

  it("rejects oversized recall, tag, source, import, and reason inputs", async () => {
    const { service } = createTestService();
    const actorMemory = await service.remember({
      content: "Actor validation must protect direct updates.",
      kind: "instruction",
      scope: "project:nuzo",
      source: "test",
    });
    await expect(
      service.recall({
        query: "x".repeat(2001),
        scope: "user:default",
      }),
    ).rejects.toMatchObject({ code: "RECALL_QUERY_TOO_LONG" });
    await expect(service.history("x".repeat(257))).rejects.toMatchObject({
      code: "MEMORY_ID_INVALID",
    });
    await expect(
      service.exportMemories({
        actor: "x".repeat(257),
      }),
    ).rejects.toMatchObject({ code: "MEMORY_ACTOR_INVALID" });
    await expect(service.update({
      id: actorMemory.id,
      content: "This update must not be committed.",
      actor: "x".repeat(257),
    })).rejects.toMatchObject({ code: "MEMORY_ACTOR_INVALID" });
    await expect(service.list({ scope: "project:nuzo" })).resolves.toEqual([actorMemory]);
    await expect(
      service.remember({
        content: "Too many tags.",
        kind: "note",
        scope: "user:default",
        tags: Array.from({ length: 33 }, (_, index) => `tag-${index}`),
        source: "test",
      }),
    ).rejects.toMatchObject({ code: "MEMORY_TAG_LIMIT_EXCEEDED" });
    await expect(
      service.remember({
        content: "Oversized source.",
        kind: "note",
        scope: "user:default",
        source: "x".repeat(257),
      }),
    ).rejects.toMatchObject({ code: "MEMORY_SOURCE_TOO_LONG" });
    await expect(
      service.importMemories({
        actor: "test",
        document: {
          format: "nuzo-memory-export",
          version: 1,
          exported_at: "2026-06-19T00:00:00.000Z",
          memories: Array.from({ length: 1001 }, () => ({
            scope: "user:default" as const,
            kind: "note" as const,
            content: "Bounded import.",
            tags: [],
            source: "test",
            confidence: 1,
            created_at: "2026-06-19T00:00:00.000Z",
            updated_at: "2026-06-19T00:00:00.000Z",
            last_used_at: null,
            archived_at: null,
          })),
        },
      }),
    ).rejects.toMatchObject({ code: "MEMORY_IMPORT_LIMIT_EXCEEDED" });
    await expect(
      service.importMemories({
        actor: "test",
        document: {
          format: "nuzo-memory-export",
          version: 1,
          exported_at: "x".repeat(65),
          memories: [],
        },
      }),
    ).rejects.toMatchObject({ code: "MEMORY_EXPORT_INVALID" });

    const memory = await service.remember({
      content: "Bound reasons in audit events.",
      kind: "note",
      scope: "user:default",
      source: "test",
    });
    await expect(
      service.forget({
        id: memory.id,
        actor: "test",
        reason: "x".repeat(1001),
      }),
    ).rejects.toMatchObject({ code: "MEMORY_REASON_TOO_LONG" });
  });

  it("applies secret policy consistently to updates and imports", async () => {
    const { service } = createTestService();
    const memory = await service.remember({
      content: "Keep credentials outside durable memory.",
      kind: "instruction",
      scope: "user:default",
      source: "test",
    });

    await expect(service.remember({
      content: "github_pat_11AA22BB33CC44DD55EE66FF77GG88HH99II00JJ",
      kind: "note",
      scope: "user:default",
      source: "test",
    })).rejects.toMatchObject({
      code: "MEMORY_SECRET_DETECTED",
    });

    await expect(
      service.update({
        id: memory.id,
        content: "Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456",
        actor: "test",
      }),
    ).rejects.toMatchObject({
      code: "MEMORY_SECRET_DETECTED",
    });

    const document = await service.exportMemories({
      actor: "test",
      scope: "user:default",
    });
    document.memories[0]!.content =
      "postgresql://demo:supersensitive@localhost:5432/app";

    const target = createTestService();
    await expect(
      target.service.importMemories({
        document,
        actor: "test",
      }),
    ).rejects.toMatchObject({
      code: "MEMORY_SECRET_DETECTED",
    });
    await expect(target.service.list({ includeArchived: true })).resolves.toEqual([]);
  });

  it("updates and reindexes a memory", async () => {
    const { auditLog, service } = createTestService();
    const memory = await service.remember({
      content: "The user prefers old notes.",
      kind: "note",
      scope: "user:default",
      tags: ["old"],
      source: "test",
    });

    const updated = await service.update({
      id: memory.id,
      content: "The user prefers concise final answers.",
      kind: "preference",
      tags: ["style", "codex"],
      actor: "test",
    });

    expect(updated.content).toBe("The user prefers concise final answers.");
    expect(updated.revision).toBe(2);
    expect(updated.kind).toBe("preference");
    expect(updated.tags).toEqual(["style", "codex"]);
    expect(updated.updatedAt).toEqual(new Date("2026-06-12T00:00:00.000Z"));

    const results = await service.recall({
      query: "concise answers",
      scope: "user:default",
    });
    expect(results[0]?.memory.id).toBe(memory.id);

    const events = await auditLog.list(memory.id);
    expect(events.map((event) => event.eventType)).toEqual([
      "memory.created",
      "memory.updated",
    ]);
  });

  it("returns isolated audit history after hard deletion", async () => {
    const { service } = createTestService();
    const first = await service.remember({
      content: "Keep an auditable deletion trail.",
      kind: "instruction",
      scope: "project:nuzo",
      source: "test",
    });
    await service.remember({
      content: "This unrelated memory must stay out of the history.",
      kind: "note",
      scope: "project:nuzo",
      source: "test",
    });
    await service.update({
      id: first.id,
      tags: ["audit"],
      actor: "test",
    });
    await service.forget({
      id: first.id,
      mode: "delete",
      confirm: true,
      actor: "test",
    });

    const history = await service.history(first.id);

    expect(history.map((event) => event.eventType)).toEqual([
      "memory.created",
      "memory.updated",
      "memory.deleted",
    ]);
    expect(history.every((event) => event.memoryId === first.id)).toBe(true);
    await expect(service.list({ includeArchived: true })).resolves.toHaveLength(1);
  });

  it("rejects empty updates", async () => {
    const { service } = createTestService();
    const memory = await service.remember({
      content: "Keep this unchanged.",
      kind: "note",
      scope: "user:default",
      source: "test",
    });

    await expect(
      service.update({
        id: memory.id,
        actor: "test",
      }),
    ).rejects.toMatchObject({
      code: "MEMORY_UPDATE_EMPTY",
    });
  });

  it("rejects stale expected revisions", async () => {
    const { service } = createTestService();
    const memory = await service.remember({
      content: "Protect this memory from stale writes.",
      kind: "instruction",
      scope: "user:default",
      source: "test",
    });

    await service.update({
      id: memory.id,
      expectedRevision: memory.revision,
      content: "The current revision is now newer.",
      actor: "test",
    });

    await expect(
      service.update({
        id: memory.id,
        expectedRevision: memory.revision,
        content: "This stale update must not commit.",
        actor: "test",
      }),
    ).rejects.toMatchObject({
      code: "MEMORY_REVISION_CONFLICT",
      details: {
        id: memory.id,
        expectedRevision: 1,
        currentRevision: 2,
      },
    });
  });

  it("rejects empty actors across audited operations", async () => {
    const { service } = createTestService();
    const memory = await service.remember({
      content: "Every audit event must identify its actor.",
      kind: "instruction",
      scope: "user:default",
      source: "test",
    });
    const document = await service.exportMemories({
      actor: "test",
      scope: "user:default",
    });

    await expect(
      service.forget({
        id: memory.id,
        actor: " ",
      }),
    ).rejects.toMatchObject({
      code: "MEMORY_ACTOR_EMPTY",
    });
    await expect(
      service.exportMemories({
        actor: "",
        scope: "user:default",
      }),
    ).rejects.toMatchObject({
      code: "MEMORY_ACTOR_EMPTY",
    });
    await expect(
      service.importMemories({
        document,
        actor: "\t",
      }),
    ).rejects.toMatchObject({
      code: "MEMORY_ACTOR_EMPTY",
    });
  });

  it("rejects invalid list, export, and bulk-forget filters", async () => {
    const { service } = createTestService();

    await expect(
      service.list({
        scope: "invalid" as never,
      }),
    ).rejects.toMatchObject({
      code: "MEMORY_SCOPE_INVALID",
    });
    await expect(
      service.exportMemories({
        actor: "test",
        tags: ["Invalid Tag"],
      }),
    ).rejects.toMatchObject({
      code: "MEMORY_TAG_INVALID",
    });
    await expect(
      service.forgetMany({
        tags: ["invalid/tag"],
        actor: "test",
      }),
    ).rejects.toMatchObject({
      code: "MEMORY_TAG_INVALID",
    });
  });

  it("exports and imports memories", async () => {
    const source = createTestService();
    await source.service.remember({
      content: "The user prefers JSON exports for migrations.",
      kind: "preference",
      scope: "user:default",
      tags: ["export"],
      source: "codex:capture-confirmed",
      confidenceState: "needs_review",
      reviewAfter: new Date("2026-07-01T00:00:00.000Z"),
      expiresAt: new Date("2026-08-01T00:00:00.000Z"),
      provenance: {
        kind: "import",
        host: "cli",
        surface: "cli",
        action: "remember",
        reason: "Seeded by export/import test.",
      },
    });

    const document = await source.service.exportMemories({
      actor: "nuzo:cli",
      scope: "user:default",
    });

    expect(document).toMatchObject({
      format: "nuzo-memory-export",
      version: 1,
    });
    expect(document.memories).toHaveLength(1);
    expect(document.memories[0]?.content).toBe("The user prefers JSON exports for migrations.");
    expect(document.memories[0]?.source).toBe("codex:capture-confirmed");
    expect(document.memories[0]?.confidence_state).toBe("needs_review");
    expect(document.memories[0]?.review_after).toBe("2026-07-01T00:00:00.000Z");
    expect(document.memories[0]?.expires_at).toBe("2026-08-01T00:00:00.000Z");
    expect(document.memories[0]?.provenance).toEqual({
      kind: "import",
      host: "cli",
      surface: "cli",
      action: "remember",
      reason: "Seeded by export/import test.",
    });

    await expect(source.service.audit({ eventTypes: ["memory.exported"] })).resolves.toMatchObject([
      {
        memoryId: null,
        eventType: "memory.exported",
        actor: "nuzo:cli",
        payload: {
          scope: "user:default",
          tags: [],
          includeArchived: false,
          count: 1,
        },
      },
    ]);
    expect(JSON.stringify(await source.service.audit({ eventTypes: ["memory.exported"] })))
      .not.toContain("JSON exports for migrations");

    const target = createTestService();
    const result = await target.service.importMemories({
      document,
      actor: "nuzo:mcp",
    });

    expect(result).toEqual({
      imported: 1,
      skipped: 0,
      dryRun: false,
    });

    const imported = await target.service.recall({
      query: "JSON exports",
      scope: "user:default",
    });
    expect(imported[0]?.memory.content).toBe("The user prefers JSON exports for migrations.");
    expect(imported[0]?.memory.source).toBe("codex:capture-confirmed");
    expect(imported[0]?.memory.confidenceState).toBe("needs_review");
    expect(imported[0]?.memory.reviewAfter?.toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(imported[0]?.memory.expiresAt?.toISOString()).toBe("2026-08-01T00:00:00.000Z");
    expect(imported[0]?.memory.provenance).toEqual({
      kind: "import",
      host: "cli",
      surface: "cli",
      action: "remember",
      reason: "Seeded by export/import test.",
    });
    await expect(target.service.audit({ eventTypes: ["memory.imported"] })).resolves.toMatchObject([
      {
        eventType: "memory.imported",
        actor: "nuzo:mcp",
        payload: {
          originalScope: "user:default",
          scope: "user:default",
          archived: false,
        },
      },
    ]);
  });

  it("skips duplicate imports in the same target scope", async () => {
    const source = createTestService();
    await source.service.remember({
      content: "The user prefers portable memory imports.",
      kind: "preference",
      scope: "user:default",
      tags: ["import", "portable"],
      source: "test",
    });
    const document = await source.service.exportMemories({
      actor: "test",
      scope: "user:default",
    });

    const target = createTestService();
    const first = await target.service.importMemories({
      document,
      actor: "test",
    });
    const second = await target.service.importMemories({
      document,
      actor: "test",
    });

    expect(first).toEqual({
      imported: 1,
      skipped: 0,
      dryRun: false,
    });
    expect(second).toEqual({
      imported: 0,
      skipped: 1,
      dryRun: false,
    });
    await expect(target.service.list()).resolves.toHaveLength(1);
  });

  it("formats memory exports as Markdown for review", async () => {
    const source = createTestService();
    await source.service.remember({
      content: "The user prefers readable memory review files.",
      kind: "preference",
      scope: "user:default",
      tags: ["review"],
      source: "test",
    });

    const document = await source.service.exportMemories({
      actor: "test",
      scope: "user:default",
    });
    const markdown = formatMemoryExportMarkdown(document);

    expect(markdown).toContain("# Nuzo Memory Export");
    expect(markdown).toContain("format: nuzo-memory-export");
    expect(markdown).toContain("### Memory 1");
    expect(markdown).toContain('kind: "preference"');
    expect(markdown).toContain('  - "review"');
    expect(markdown).toContain("The user prefers readable memory review files.");
  });

  it("validates import dry runs without writing", async () => {
    const source = createTestService();
    await source.service.remember({
      content: "Validate import before writing.",
      kind: "note",
      scope: "user:default",
      source: "test",
    });
    const document = await source.service.exportMemories({
      actor: "test",
      scope: "user:default",
    });

    const target = createTestService();
    const result = await target.service.importMemories({
      document,
      actor: "test",
      dryRun: true,
    });

    expect(result).toEqual({
      imported: 1,
      skipped: 0,
      dryRun: true,
    });
    await expect(target.service.list()).resolves.toEqual([]);
  });

  it("reports duplicate skips during import dry runs", async () => {
    const source = createTestService();
    await source.service.remember({
      content: "Validate duplicate imports before writing.",
      kind: "note",
      scope: "user:default",
      source: "test",
    });
    const document = await source.service.exportMemories({
      actor: "test",
      scope: "user:default",
    });

    const target = createTestService();
    await target.service.importMemories({
      document,
      actor: "test",
    });
    const dryRun = await target.service.importMemories({
      document,
      actor: "test",
      dryRun: true,
    });

    expect(dryRun).toEqual({
      imported: 0,
      skipped: 1,
      dryRun: true,
    });
    await expect(target.service.list()).resolves.toHaveLength(1);
  });

  it("reports within-document duplicates consistently in dry-run and real imports", async () => {
    const source = createTestService();
    await source.service.remember({
      content: "Keep import planning deterministic.",
      kind: "instruction",
      scope: "project:nuzo",
      tags: ["import", "planning"],
      source: "test",
    });
    const document = await source.service.exportMemories({
      actor: "test",
      scope: "project:nuzo",
    });
    document.memories.push({
      ...document.memories[0]!,
      content: "  Keep   import planning deterministic.  ",
      tags: ["planning", "import", "planning"],
    });

    const target = createTestService();
    const dryRun = await target.service.importMemories({
      document,
      actor: "test",
      dryRun: true,
    });
    const imported = await target.service.importMemories({
      document,
      actor: "test",
    });

    expect(dryRun).toEqual({
      imported: 1,
      skipped: 1,
      dryRun: true,
    });
    expect(imported).toEqual({
      imported: 1,
      skipped: 1,
      dryRun: false,
    });
    await expect(target.service.list({ includeArchived: true })).resolves.toHaveLength(1);
  });

  it("preflights policy for every import item before writing", async () => {
    const source = createTestService();
    await source.service.remember({
      content: "This valid item must not be partially imported.",
      kind: "note",
      scope: "user:default",
      source: "test",
    });
    const document = await source.service.exportMemories({
      actor: "test",
      scope: "user:default",
    });
    document.memories.push({
      ...document.memories[0]!,
      content: "github token is ghp_123456789012345678901234567890123456",
    });

    const target = createTestService();
    await expect(
      target.service.importMemories({
        document,
        actor: "test",
      }),
    ).rejects.toMatchObject({
      code: "MEMORY_SECRET_DETECTED",
    });
    await expect(target.service.list({ includeArchived: true })).resolves.toEqual([]);
  });

  it("rejects malformed import memory items with a structured error", async () => {
    const { service } = createTestService();
    const document = {
      format: "nuzo-memory-export",
      version: 1,
      exported_at: "2026-06-12T00:00:00.000Z",
      memories: [
        {
          scope: "user:default",
          kind: "note",
          content: "Malformed import item.",
          tags: ["valid"],
          source: "test",
          confidence: "high",
          created_at: "2026-06-12T00:00:00.000Z",
          updated_at: "2026-06-12T00:00:00.000Z",
          last_used_at: null,
          archived_at: null,
        },
      ],
    };

    await expect(
      service.importMemories({
        document: document as never,
        actor: "test",
      }),
    ).rejects.toMatchObject({
      code: "MEMORY_EXPORT_INVALID",
      details: {
        path: "memories[0].confidence",
      },
    });
  });

  it("archives by default when forgetting", async () => {
    const { service, store } = createTestService();
    const memory = await service.remember({
      content: "Archive this later.",
      kind: "note",
      scope: "user:default",
      source: "test",
    });

    await service.forget({
      id: memory.id,
      actor: "test",
    });

    const visible = await service.list();
    expect(visible).toHaveLength(0);

    const archived = await store.list({ includeArchived: true });
    expect(archived[0]?.archivedAt).toBeInstanceOf(Date);
  });

  it("requires confirmation for hard delete", async () => {
    const { service } = createTestService();
    const memory = await service.remember({
      content: "Delete this later.",
      kind: "note",
      scope: "user:default",
      source: "test",
    });

    await expect(
      service.forget({
        id: memory.id,
        mode: "delete",
        actor: "test",
      }),
    ).rejects.toBeInstanceOf(NuzoMemoryError);
  });

  it("previews and applies bulk archive with isolated filters", async () => {
    const { service } = createTestService();
    const first = await service.remember({
      content: "Archive the obsolete project decision.",
      kind: "project_decision",
      scope: "project:nuzo",
      tags: ["obsolete"],
      source: "test",
    });
    await service.remember({
      content: "Keep the active project decision.",
      kind: "project_decision",
      scope: "project:nuzo",
      tags: ["active"],
      source: "test",
    });
    await service.remember({
      content: "Keep the obsolete tag in another scope.",
      kind: "note",
      scope: "project:other",
      tags: ["obsolete"],
      source: "test",
    });

    const preview = await service.forgetMany({
      scope: "project:nuzo",
      tags: ["obsolete"],
      actor: "test",
    });
    expect(preview).toEqual({
      matched: 1,
      affected: 0,
      mode: "archive",
      dryRun: true,
      ids: [first.id],
    });
    await expect(service.list({ includeArchived: true })).resolves.toHaveLength(3);

    const applied = await service.forgetMany({
      scope: "project:nuzo",
      tags: ["obsolete"],
      actor: "test",
      dryRun: false,
    });
    expect(applied).toEqual({
      matched: 1,
      affected: 1,
      mode: "archive",
      dryRun: false,
      ids: [first.id],
    });
    await expect(service.list({ scope: "project:nuzo" })).resolves.toHaveLength(1);
    await expect(service.list({ scope: "project:other" })).resolves.toHaveLength(1);
  });

  it("requires explicit selectors and hard-delete confirmation for bulk forget", async () => {
    const { service } = createTestService();
    await service.remember({
      content: "Delete this fake bulk memory.",
      kind: "note",
      scope: "user:default",
      source: "test",
    });

    await expect(
      service.forgetMany({
        actor: "test",
      }),
    ).rejects.toMatchObject({
      code: "MEMORY_BULK_SELECTOR_REQUIRED",
    });
    await expect(
      service.forgetMany({
        all: true,
        scope: "user:default",
        actor: "test",
      }),
    ).rejects.toMatchObject({
      code: "MEMORY_BULK_SELECTOR_CONFLICT",
    });

    const preview = await service.forgetMany({
      all: true,
      mode: "delete",
      actor: "test",
    });
    expect(preview).toMatchObject({
      matched: 1,
      affected: 0,
      mode: "delete",
      dryRun: true,
    });
    await expect(
      service.forgetMany({
        all: true,
        mode: "delete",
        actor: "test",
        dryRun: false,
      }),
    ).rejects.toMatchObject({
      code: "MEMORY_DELETE_CONFIRMATION_REQUIRED",
    });
    const deleted = await service.forgetMany({
      all: true,
      mode: "delete",
      actor: "test",
      dryRun: false,
      confirm: true,
    });
    expect(deleted.affected).toBe(1);
    await expect(service.list({ includeArchived: true })).resolves.toEqual([]);
  });

  it("hides relations with an unauthorized endpoint from restricted readers without leaking it", async () => {
    // One shared store, two sessions: an unrestricted administrator and a
    // restricted host session authorized for only two scopes.
    const store = new InMemoryStore();
    const searchIndex = new InMemorySearchIndex();
    const auditLog = new InMemoryAuditLog();
    const clock = new FixedClock();
    const ids = new SequentialIdGenerator();
    const shared = { store, searchIndex, auditLog, clock, ids } as const;
    const admin = createMemoryService({
      ...shared,
      policy: new DefaultPolicyEngine(new RegexSecretScanner()),
    });
    const restricted = createMemoryService({
      ...shared,
      policy: new DefaultPolicyEngine(new RegexSecretScanner(), {
        allowedScopes: ["project:nuzo", "user:default"],
      }),
    });

    const allowedA = await admin.remember({
      content: "Project nuzo deploys with blue green.",
      kind: "project_decision",
      scope: "project:nuzo",
      tags: ["deploy"],
      source: "admin",
    });
    const allowedB = await admin.remember({
      content: "Prefer concise final answers.",
      kind: "preference",
      scope: "user:default",
      tags: ["style"],
      source: "admin",
    });
    const forbidden = await admin.remember({
      content: "Runbook lives in the private ops project.",
      kind: "note",
      scope: "project:secret",
      tags: ["ops"],
      source: "admin",
    });

    // A fully-authorized relation and two relations that each touch the
    // forbidden scope (one outgoing, one incoming to exercise includeReverse).
    const visibleRelation = await admin.relate({
      sourceMemoryId: allowedA.id,
      targetMemoryId: allowedB.id,
      relation: "related_to",
      reason: "Both endpoints are user-visible.",
      actor: "admin",
    });
    const hiddenOutgoingRelation = await admin.relate({
      sourceMemoryId: allowedA.id,
      targetMemoryId: forbidden.id,
      relation: "related_to",
      reason: "Outgoing to a forbidden scope.",
      actor: "admin",
    });
    const hiddenIncomingRelation = await admin.relate({
      sourceMemoryId: forbidden.id,
      targetMemoryId: allowedA.id,
      relation: "supersedes",
      reason: "Incoming from a forbidden scope.",
      actor: "admin",
    });
    const deletedHiddenRelation = await admin.relate({
      sourceMemoryId: allowedA.id,
      targetMemoryId: forbidden.id,
      relation: "conflicts_with",
      reason: "Hidden relation that will be removed.",
      actor: "admin",
    });
    await admin.forgetRelation({
      id: deletedHiddenRelation.id,
      actor: "admin",
      reason: "Hidden relation removal reason.",
    });

    const superseded = await admin.challenge({
      id: allowedB.id,
      expectedRevision: allowedB.revision,
      outcome: "superseded",
      supersededByMemoryId: forbidden.id,
      reason: "Forbidden memory supersedes this preference.",
      actor: "admin",
    });
    expect(superseded.relation).not.toBeNull();

    // The restricted reader sees only the fully-authorized relation and never
    // the forbidden endpoint's id or scope.
    const restrictedRelations = await restricted.relations({
      memoryId: allowedA.id,
      includeReverse: true,
      limit: 1,
    });
    expect(restrictedRelations).toEqual([visibleRelation]);
    const serialized = JSON.stringify(restrictedRelations);
    expect(serialized).not.toContain(forbidden.id);
    expect(serialized).not.toContain("project:secret");
    const restrictedBatch = await restricted.relationsBatch({
      memoryIds: [allowedA.id, allowedB.id],
      includeReverse: true,
      limitPerMemory: 1,
    });
    expect(restrictedBatch.get(allowedA.id)).toEqual([visibleRelation]);
    expect(restrictedBatch.get(allowedB.id)).toEqual([visibleRelation]);
    const serializedBatch = JSON.stringify([...restrictedBatch]);
    expect(serializedBatch).not.toContain(forbidden.id);
    expect(serializedBatch).not.toContain("project:secret");

    // Inspect succeeds for an authorized memory and hides the same relations.
    const inspection = await restricted.inspect({ id: allowedA.id, historyLimit: 50 });
    expect(inspection.memory.id).toBe(allowedA.id);
    expect(inspection.relations).toEqual([visibleRelation]);
    const serializedInspection = JSON.stringify(inspection);
    for (const hiddenValue of [
      forbidden.id,
      "project:secret",
      hiddenOutgoingRelation.id,
      hiddenIncomingRelation.id,
      deletedHiddenRelation.id,
      "Outgoing to a forbidden scope.",
      "Incoming from a forbidden scope.",
      "Hidden relation that will be removed.",
      "Hidden relation removal reason.",
    ]) {
      expect(serializedInspection).not.toContain(hiddenValue);
    }

    const history = await restricted.history(allowedA.id, { limit: 50 });
    const auditByMemory = await restricted.audit({ memoryId: allowedA.id, limit: 50 });
    for (const output of [history, auditByMemory]) {
      const serializedOutput = JSON.stringify(output);
      expect(serializedOutput).toContain(visibleRelation.id);
      expect(serializedOutput).not.toContain(forbidden.id);
      expect(serializedOutput).not.toContain("project:secret");
      expect(serializedOutput).not.toContain(hiddenOutgoingRelation.id);
      expect(serializedOutput).not.toContain(deletedHiddenRelation.id);
      expect(serializedOutput).not.toContain("Hidden relation removal reason.");
    }

    const challengedInspection = await restricted.inspect({ id: allowedB.id, historyLimit: 50 });
    const challengedHistory = await restricted.history(allowedB.id, { limit: 50 });
    const challengedAudit = await restricted.audit({ memoryId: allowedB.id, limit: 50 });
    for (const output of [challengedInspection, challengedHistory, challengedAudit]) {
      const serializedOutput = JSON.stringify(output);
      expect(serializedOutput).not.toContain(forbidden.id);
      expect(serializedOutput).not.toContain("Forbidden memory supersedes this preference.");
      expect(serializedOutput).not.toContain(superseded.relation!.id);
    }

    // Reading relations for a memory whose own scope is forbidden still fails
    // closed instead of leaking that the memory exists.
    await expect(
      restricted.relations({ memoryId: forbidden.id, includeReverse: true, limit: 50 }),
    ).rejects.toMatchObject({ code: "MEMORY_SCOPE_FORBIDDEN" });
    await expect(
      restricted.relationsBatch({ memoryIds: [allowedA.id, forbidden.id], limitPerMemory: 50 }),
    ).rejects.toMatchObject({ code: "MEMORY_SCOPE_FORBIDDEN" });
    await expect(
      restricted.inspect({ id: forbidden.id, historyLimit: 50 }),
    ).rejects.toMatchObject({ code: "MEMORY_SCOPE_FORBIDDEN" });
    await expect(
      restricted.history(forbidden.id, { limit: 50 }),
    ).rejects.toMatchObject({ code: "MEMORY_SCOPE_FORBIDDEN" });
    await expect(
      restricted.audit({ memoryId: forbidden.id, limit: 50 }),
    ).rejects.toMatchObject({ code: "MEMORY_SCOPE_FORBIDDEN" });

    await expect(restricted.relate({
      sourceMemoryId: allowedA.id,
      targetMemoryId: forbidden.id,
      relation: "duplicate_of",
      actor: "restricted",
    })).rejects.toMatchObject({ code: "MEMORY_SCOPE_FORBIDDEN" });
    await expect(restricted.forgetRelation({
      id: hiddenOutgoingRelation.id,
      actor: "restricted",
      reason: "This must remain fail closed.",
    })).rejects.toMatchObject({ code: "MEMORY_SCOPE_FORBIDDEN" });
    const beforeFailedChallenge = await admin.inspect({ id: allowedA.id });
    await expect(restricted.challenge({
      id: allowedA.id,
      expectedRevision: beforeFailedChallenge.memory.revision,
      outcome: "superseded",
      supersededByMemoryId: forbidden.id,
      reason: "This cross-scope challenge must fail.",
      actor: "restricted",
    })).rejects.toMatchObject({ code: "MEMORY_SCOPE_FORBIDDEN" });
    const afterFailedChallenge = await admin.inspect({ id: allowedA.id });
    expect(afterFailedChallenge.memory).toEqual(beforeFailedChallenge.memory);

    // The unrestricted administrator still sees every relation.
    const adminRelations = await admin.relations({
      memoryId: allowedA.id,
      includeReverse: true,
      limit: 50,
    });
    expect(adminRelations).toHaveLength(3);
    expect(adminRelations).toEqual(expect.arrayContaining([
      visibleRelation,
      hiddenOutgoingRelation,
      hiddenIncomingRelation,
    ]));
    expect((await admin.audit({ memoryId: allowedA.id, limit: 200 }))
      .filter((event) => event.eventType === "memory.relation.deleted"))
      .toHaveLength(1);

    await admin.forget({
      id: forbidden.id,
      expectedRevision: forbidden.revision,
      mode: "delete",
      confirm: true,
      actor: "admin",
    });
    const unrestrictedHistoryAfterDelete = JSON.stringify(await admin.history(allowedA.id, { limit: 50 }));
    expect(unrestrictedHistoryAfterDelete).toContain(hiddenOutgoingRelation.id);
    const restrictedHistoryAfterDelete = JSON.stringify(await restricted.history(allowedA.id, { limit: 50 }));
    expect(restrictedHistoryAfterDelete).not.toContain(hiddenOutgoingRelation.id);
  });

  it("honors custom forbidden-endpoint policy without weakening primary authorization", async () => {
    const store = new InMemoryStore();
    const searchIndex = new InMemorySearchIndex();
    const auditLog = new InMemoryAuditLog();
    const clock = new FixedClock();
    const ids = new SequentialIdGenerator();
    const shared = { store, searchIndex, auditLog, clock, ids } as const;
    const admin = createMemoryService({
      ...shared,
      policy: new DefaultPolicyEngine(new RegexSecretScanner()),
    });
    const primary = await admin.remember({
      content: "Custom policy primary memory.",
      kind: "note",
      scope: "project:nuzo",
      source: "admin",
    });
    const hidden = await admin.remember({
      content: "Custom policy hidden memory.",
      kind: "note",
      scope: "project:nuzo",
      source: "admin",
    });
    const hiddenRelation = await admin.relate({
      sourceMemoryId: primary.id,
      targetMemoryId: hidden.id,
      relation: "related_to",
      reason: "Custom policy hidden relation reason.",
      actor: "admin",
    });

    const restricted = createMemoryService({
      ...shared,
      policy: new HideEndpointPolicy(hidden.id),
    });
    await expect(restricted.relations({ memoryId: primary.id })).resolves.toEqual([]);
    await expect(restricted.relations({ memoryId: hidden.id })).rejects.toMatchObject({
      code: "MEMORY_SCOPE_FORBIDDEN",
    });

    await admin.forget({
      id: hidden.id,
      expectedRevision: hidden.revision,
      mode: "delete",
      confirm: true,
      actor: "admin",
    });
    const historyAfterDelete = JSON.stringify(await restricted.history(primary.id, { limit: 50 }));
    expect(historyAfterDelete).not.toContain(hidden.id);
    expect(historyAfterDelete).not.toContain(hiddenRelation.id);
    expect(historyAfterDelete).not.toContain("Custom policy hidden relation reason.");
  });

  it("fills authorized history and audit limits after batches of hidden relation events", async () => {
    const store = new InMemoryStore();
    const searchIndex = new InMemorySearchIndex();
    const auditLog = new InMemoryAuditLog();
    const clock = new FixedClock();
    const ids = new SequentialIdGenerator();
    const shared = { store, searchIndex, auditLog, clock, ids } as const;
    const admin = createMemoryService({
      ...shared,
      policy: new DefaultPolicyEngine(new RegexSecretScanner()),
    });
    const restricted = createMemoryService({
      ...shared,
      policy: new DefaultPolicyEngine(new RegexSecretScanner(), {
        allowedScopes: ["project:nuzo"],
      }),
    });
    const source = await admin.remember({
      content: "Authorized pagination source.",
      kind: "note",
      scope: "project:nuzo",
      source: "admin",
    });
    const hidden = await admin.remember({
      content: "Hidden pagination endpoint.",
      kind: "note",
      scope: "project:secret",
      source: "admin",
    });
    const created = (await admin.history(source.id))[0]!;

    for (let index = 0; index < 60; index += 1) {
      await auditLog.append({
        id: `evt_hidden_${index.toString().padStart(3, "0")}`,
        memoryId: source.id,
        eventType: "memory.relation.created",
        actor: "admin",
        payload: {
          relationId: `rel_hidden_${index}`,
          sourceMemoryId: source.id,
          targetMemoryId: hidden.id,
          relation: "related_to",
          sourceScope: source.scope,
          targetScope: hidden.scope,
        },
        createdAt: clock.now(),
      });
    }
    await auditLog.append({
      id: "evt_visible_update",
      memoryId: source.id,
      eventType: "memory.updated",
      actor: "admin",
      payload: { scope: source.scope },
      createdAt: clock.now(),
    });

    await expect(restricted.history(source.id, {
      cursor: encodeMemoryEventCursor(created),
      limit: 1,
    })).resolves.toMatchObject([{ id: "evt_visible_update" }]);

    // Audit is newest-first. More than 200 newer hidden events must not starve
    // the older authorized event even though the public request asks for one.
    for (let index = 0; index < 201; index += 1) {
      await auditLog.append({
        id: `evt_zz_hidden_${index.toString().padStart(3, "0")}`,
        memoryId: source.id,
        eventType: "memory.relation.created",
        actor: "admin",
        payload: {
          relationId: `rel_zz_hidden_${index}`,
          sourceMemoryId: source.id,
          targetMemoryId: hidden.id,
          relation: "related_to",
          sourceScope: source.scope,
          targetScope: hidden.scope,
        },
        createdAt: clock.now(),
      });
    }
    await expect(restricted.audit({ memoryId: source.id, limit: 1 }))
      .resolves.toMatchObject([{ id: "evt_visible_update" }]);
  });

  it("authorizes relation audit events against their recorded endpoint scopes", async () => {
    const store = new InMemoryStore();
    const searchIndex = new InMemorySearchIndex();
    const auditLog = new InMemoryAuditLog();
    const clock = new FixedClock();
    const ids = new SequentialIdGenerator();
    const shared = { store, searchIndex, auditLog, clock, ids } as const;
    const admin = createMemoryService({
      ...shared,
      policy: new DefaultPolicyEngine(new RegexSecretScanner()),
    });
    const restricted = createMemoryService({
      ...shared,
      policy: new DefaultPolicyEngine(new RegexSecretScanner(), {
        allowedScopes: ["project:nuzo"],
      }),
    });
    const primary = await admin.remember({
      content: "Historical relation scope primary.",
      kind: "note",
      scope: "project:nuzo",
      source: "admin",
    });
    const formerlyHidden = await admin.remember({
      content: "Historical relation scope endpoint.",
      kind: "note",
      scope: "project:secret",
      source: "admin",
    });
    const relation = await admin.relate({
      sourceMemoryId: primary.id,
      targetMemoryId: formerlyHidden.id,
      relation: "related_to",
      reason: "Created while one endpoint was hidden.",
      actor: "admin",
    });
    await admin.update({
      id: formerlyHidden.id,
      expectedRevision: formerlyHidden.revision,
      scope: "project:nuzo",
      actor: "admin",
    });

    await expect(restricted.relations({ memoryId: primary.id })).resolves.toEqual([relation]);
    const history = JSON.stringify(await restricted.history(primary.id, { limit: 50 }));
    expect(history).not.toContain(relation.id);
    expect(history).not.toContain("project:secret");
    expect(history).not.toContain("Created while one endpoint was hidden.");

    const superseder = await admin.remember({
      content: "Historical challenge superseder.",
      kind: "note",
      scope: "project:secret",
      source: "admin",
    });
    const challenged = await admin.challenge({
      id: primary.id,
      expectedRevision: primary.revision,
      outcome: "superseded",
      supersededByMemoryId: superseder.id,
      reason: "Superseded while the replacement was hidden.",
      actor: "admin",
    });
    await admin.update({
      id: superseder.id,
      expectedRevision: superseder.revision,
      scope: "project:nuzo",
      actor: "admin",
    });

    const challengedHistory = JSON.stringify(await restricted.history(primary.id, { limit: 50 }));
    expect(challengedHistory).not.toContain(superseder.id);
    expect(challengedHistory).not.toContain(challenged.relation!.id);
    expect(challengedHistory).not.toContain("Superseded while the replacement was hidden.");
  });

  it("rethrows non-authorization policy errors raised while checking relation endpoints", async () => {
    const store = new InMemoryStore();
    const searchIndex = new InMemorySearchIndex();
    const auditLog = new InMemoryAuditLog();
    const clock = new FixedClock();
    const ids = new SequentialIdGenerator();
    const shared = { store, searchIndex, auditLog, clock, ids } as const;
    const admin = createMemoryService({
      ...shared,
      policy: new DefaultPolicyEngine(new RegexSecretScanner()),
    });

    const primary = await admin.remember({
      content: "Primary memory under test.",
      kind: "note",
      scope: "project:nuzo",
      tags: [],
      source: "admin",
    });
    const endpoint = await admin.remember({
      content: "Endpoint memory under test.",
      kind: "note",
      scope: "project:nuzo",
      tags: [],
      source: "admin",
    });
    await admin.relate({
      sourceMemoryId: primary.id,
      targetMemoryId: endpoint.id,
      relation: "related_to",
      actor: "admin",
    });

    const service = createMemoryService({
      ...shared,
      policy: new RethrowEndpointPolicy(endpoint.id),
    });
    await expect(
      service.relations({ memoryId: primary.id, includeReverse: true, limit: 50 }),
    ).rejects.toMatchObject({ code: "MEMORY_POLICY_TEST_FAILURE" });
  });
});
