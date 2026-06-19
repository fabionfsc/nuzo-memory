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
      source: "test",
    });

    const document = await source.service.exportMemories({
      actor: "test",
      scope: "user:default",
    });

    expect(document).toMatchObject({
      format: "nuzo-memory-export",
      version: 1,
    });
    expect(document.memories).toHaveLength(1);
    expect(document.memories[0]?.content).toBe("The user prefers JSON exports for migrations.");

    const target = createTestService();
    const result = await target.service.importMemories({
      document,
      actor: "test",
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
