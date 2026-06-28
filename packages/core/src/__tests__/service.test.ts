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

  return { auditLog, service, store };
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
  });

  it("queries bounded store-wide audit events with filters", async () => {
    const { service } = createTestService();

    const userMemory = await service.remember({
      content: "User prefers audit summaries.",
      kind: "preference",
      scope: "user:default",
      source: "test:user",
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
        actor: "test:project",
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
    await expect(restricted.service.audit({ memoryId: allowed.id })).resolves.toMatchObject([
      {
        memoryId: allowed.id,
      },
    ]);
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
});
