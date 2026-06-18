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
  it("remembers and recalls a memory", async () => {
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
      "memory.recalled",
    ]);
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
});
