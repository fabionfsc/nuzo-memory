import { describe, expect, it } from "vitest";
import type { MemoryRecord, MemoryService } from "@nuzo/memory-core";
import { createMemoryToolHandlers } from "../handlers.js";

function createTestHandlers(options: { failList?: boolean } = {}) {
  let memory: MemoryRecord | null = null;
  const calls = {
    remember: 0,
    recall: [] as Array<{
      query: string;
      scope: string;
      limit?: number;
      includeGlobal?: boolean;
    }>,
    update: 0,
    history: 0,
    forget: 0,
    forgetMany: 0,
    exportMemories: 0,
    importMemories: 0,
  };
  const service: MemoryService = {
    async remember(input) {
      calls.remember += 1;
      memory = {
        id: "mem_000001",
        scope: input.scope,
        kind: input.kind,
        content: input.content,
        tags: input.tags ?? [],
        source: input.source,
        confidence: input.confidence ?? 1,
        createdAt: new Date("2026-06-13T00:00:00.000Z"),
        updatedAt: new Date("2026-06-13T00:00:00.000Z"),
        lastUsedAt: null,
        archivedAt: null,
      };
      return memory;
    },
    async recall() {
      calls.recall.push({
        query: "legacy mock recall",
        scope: "user:default",
      });
      return memory
        ? [
            {
              memory,
              score: 1,
              reason: "Matched test memory.",
            },
          ]
        : [];
    },
    async list(input = {}) {
      if (options.failList === true) {
        throw new Error("simulated store failure");
      }
      if (input.includeArchived !== true && memory?.archivedAt) {
        return [];
      }
      return memory ? [memory] : [];
    },
    async update(input) {
      calls.update += 1;
      if (!memory) {
        throw new Error("No memory");
      }
      memory = {
        ...memory,
        content: input.content ?? memory.content,
        tags: input.tags ?? memory.tags,
        updatedAt: new Date("2026-06-13T01:00:00.000Z"),
      };
      return memory;
    },
    async history(id) {
      calls.history += 1;
      return memory?.id === id
        ? [
            {
              id: "evt_000001",
              memoryId: id,
              eventType: "memory.created",
              actor: "nuzo:mcp",
              payload: { kind: memory.kind, scope: memory.scope, tags: memory.tags },
              createdAt: new Date("2026-06-13T00:00:00.000Z"),
            },
          ]
        : [];
    },
    async exportMemories(input) {
      calls.exportMemories += 1;
      return {
        format: "nuzo-memory-export",
        version: 1,
        exported_at: "2026-06-13T00:00:00.000Z",
        memories:
          memory && (input.includeArchived === true || memory.archivedAt === null)
            ? [
                {
                  scope: memory.scope,
                  kind: memory.kind,
                  content: memory.content,
                  tags: memory.tags,
                  source: memory.source,
                  confidence: memory.confidence,
                  created_at: memory.createdAt.toISOString(),
                  updated_at: memory.updatedAt.toISOString(),
                  last_used_at: memory.lastUsedAt?.toISOString() ?? null,
                  archived_at: memory.archivedAt?.toISOString() ?? null,
                },
              ]
            : [],
      };
    },
    async importMemories(input) {
      calls.importMemories += 1;
      return {
        imported: input.document.memories.length,
        skipped: 0,
        dryRun: input.dryRun === true,
      };
    },
    async forget(input) {
      calls.forget += 1;
      if (memory && input.mode === "archive") {
        memory = {
          ...memory,
          archivedAt: new Date("2026-06-13T02:00:00.000Z"),
        };
      }
      if (input.mode === "delete") {
        memory = null;
      }
    },
    async forgetMany(input) {
      calls.forgetMany += 1;
      const matches = memory &&
        (input.all === true || input.scope === memory.scope) &&
        (!input.tags || input.tags.every((tag) => memory?.tags.includes(tag)))
        ? [memory]
        : [];
      if (input.dryRun !== false) {
        return {
          matched: matches.length,
          affected: 0,
          mode: input.mode ?? "archive",
          dryRun: true,
          ids: matches.map((item) => item.id),
        };
      }
      for (const item of matches) {
        if (input.mode === "delete") {
          memory = null;
        } else {
          memory = {
            ...item,
            archivedAt: new Date("2026-06-13T02:00:00.000Z"),
          };
        }
      }
      return {
        matched: matches.length,
        affected: matches.length,
        mode: input.mode ?? "archive",
        dryRun: false,
        ids: matches.map((item) => item.id),
      };
    },
  };

  service.recall = async (input) => {
    calls.recall.push(input);
    return memory
      ? [
          {
            memory,
            score: 1,
            reason: "Matched test memory.",
          },
        ]
      : [];
  };

  return {
    calls,
    handlers: createMemoryToolHandlers(service, { storePath: "/tmp/nuzo-test.sqlite" }),
  };
}

describe("memory MCP handlers", () => {
  it("remembers and recalls through tool-shaped inputs", async () => {
    const { handlers } = createTestHandlers();

    const remembered = await handlers.remember({
      content: "The user prefers explicit MCP contracts.",
      kind: "preference",
      scope: "user:default",
      tags: ["mcp"],
      source: "nuzo:mcp",
    });

    expect(remembered).toEqual({
      id: "mem_000001",
      created: true,
      warnings: [],
    });

    const recalled = await handlers.recall({
      query: "MCP contracts",
      scope: "user:default",
      limit: 8,
      include_global: false,
    });

    expect(recalled.results).toHaveLength(1);
    expect(recalled.results[0]).toMatchObject({
      id: "mem_000001",
      content: "The user prefers explicit MCP contracts.",
      kind: "preference",
      scope: "user:default",
      tags: ["mcp"],
    });
  });

  it("lists, updates, forgets, exports, imports, and reports doctor output", async () => {
    const { handlers } = createTestHandlers();
    const remembered = await handlers.remember({
      content: "The user prefers explicit MCP contracts.",
      kind: "preference",
      scope: "user:default",
      tags: ["mcp"],
      source: "nuzo:mcp",
    });

    const listed = await handlers.list({
      tags: [],
      include_archived: false,
    });
    expect(listed.memories[0]?.id).toBe(remembered.id);

    const updated = await handlers.update({
      id: remembered.id,
      content: "The user prefers complete MCP contracts.",
      tags: ["mcp", "contracts"],
    });
    expect(updated.memory).toMatchObject({
      content: "The user prefers complete MCP contracts.",
      tags: ["mcp", "contracts"],
    });

    const history = await handlers.history({ id: remembered.id });
    expect(history.events).toEqual([
      {
        id: "evt_000001",
        memory_id: remembered.id,
        event_type: "memory.created",
        actor: "nuzo:mcp",
        payload: {
          kind: "preference",
          scope: "user:default",
          tags: ["mcp", "contracts"],
        },
        created_at: "2026-06-13T00:00:00.000Z",
      },
    ]);

    const exported = await handlers.exportMemories({
      tags: [],
      include_archived: false,
    });
    expect(exported.memories).toHaveLength(1);

    const imported = await handlers.importMemories({
      document: exported,
      dry_run: true,
    });
    expect(imported).toEqual({
      imported: 1,
      skipped: 0,
      dry_run: true,
    });

    const forgotten = await handlers.forget({
      id: remembered.id,
      mode: "archive",
      confirm: false,
    });
    expect(forgotten).toEqual({
      id: remembered.id,
      forgotten: true,
      mode: "archive",
    });

    const visible = await handlers.list({
      tags: [],
      include_archived: false,
    });
    expect(visible.memories).toEqual([]);

    const doctor = await handlers.doctor();
    expect(doctor.ok).toBe(true);
    expect(doctor.store).toEqual({
      path: "/tmp/nuzo-test.sqlite",
      readable: true,
      writable_check: "not_performed",
    });
    expect(doctor.counts).toEqual({
      active_memories: 0,
      archived_memories: 1,
      total_memories: 1,
    });
    expect(doctor.tools).toContain("memory.import");
    expect(doctor.tools).toContain("memory.history");
    expect(doctor.tools).toContain("memory.recall_hook");
    expect(doctor.network).toBe("disabled");
    expect(JSON.stringify(doctor)).not.toContain("complete MCP contracts");
    expect(doctor.warnings).toEqual([]);
  });

  it("previews and applies filtered bulk forget operations", async () => {
    const { handlers } = createTestHandlers();
    const remembered = await handlers.remember({
      content: "Archive this MCP bulk memory.",
      kind: "note",
      scope: "project:nuzo",
      tags: ["obsolete"],
      source: "nuzo:mcp",
    });

    const preview = await handlers.forgetMany({
      scope: "project:nuzo",
      tags: ["obsolete"],
      all: false,
      mode: "archive",
      confirm: false,
      dry_run: true,
    });
    expect(preview).toEqual({
      matched: 1,
      affected: 0,
      mode: "archive",
      dry_run: true,
      ids: [remembered.id],
    });

    const applied = await handlers.forgetMany({
      scope: "project:nuzo",
      tags: ["obsolete"],
      all: false,
      mode: "archive",
      confirm: false,
      dry_run: false,
    });
    expect(applied).toEqual({
      matched: 1,
      affected: 1,
      mode: "archive",
      dry_run: false,
      ids: [remembered.id],
    });
  });

  it("reports MCP doctor warnings without exposing memory content", async () => {
    const { handlers } = createTestHandlers({ failList: true });

    const doctor = await handlers.doctor();

    expect(doctor.ok).toBe(false);
    expect(doctor.network).toBe("disabled");
    expect(doctor.store).toEqual({
      path: "/tmp/nuzo-test.sqlite",
      readable: false,
      writable_check: "not_performed",
    });
    expect(doctor.counts).toEqual({
      active_memories: null,
      archived_memories: null,
      total_memories: null,
    });
    expect(doctor.warnings).toEqual([
      "memory store read check failed: simulated store failure",
    ]);
  });

  it("runs recall hook as a limited read-only recall entrypoint", async () => {
    const { calls, handlers } = createTestHandlers();
    await handlers.remember({
      content: "Nuzo should use GitHub Issues as the execution tracker.",
      kind: "instruction",
      scope: "project:nuzo",
      tags: ["workflow"],
      source: "test",
    });
    calls.remember = 0;

    const result = await handlers.recallHook({
      task_context: "  Please continue Nuzo issue work.\nUse the project tracker.  ",
      project_scope: "project:nuzo",
      limit: 20,
    });

    expect(result).toMatchObject({
      mode: "read_only",
      memory_writes: false,
      capture_suggestions: false,
      query: "Please continue Nuzo issue work. Use the project tracker.",
      scope: "project:nuzo",
      include_global: true,
      limit: 8,
    });
    expect(result.results).toHaveLength(1);
    expect(calls.recall.at(-1)).toEqual({
      query: "Please continue Nuzo issue work. Use the project tracker.",
      scope: "project:nuzo",
      limit: 8,
      includeGlobal: true,
      recordUsage: false,
    });
    expect(calls.remember).toBe(0);
    expect(calls.update).toBe(0);
    expect(calls.history).toBe(0);
    expect(calls.forget).toBe(0);
    expect(calls.forgetMany).toBe(0);
    expect(calls.exportMemories).toBe(0);
    expect(calls.importMemories).toBe(0);
  });
});
