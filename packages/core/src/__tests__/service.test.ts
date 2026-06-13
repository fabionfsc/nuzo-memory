import { describe, expect, it } from "vitest";
import {
  createMemoryService,
  DefaultPolicyEngine,
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
