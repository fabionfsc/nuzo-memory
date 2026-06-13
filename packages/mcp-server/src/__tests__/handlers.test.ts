import { describe, expect, it } from "vitest";
import type { MemoryRecord, MemoryService } from "@nuzo/memory-core";
import { createMemoryToolHandlers } from "../handlers.js";

function createTestHandlers() {
  let memory: MemoryRecord | null = null;
  const service: MemoryService = {
    async remember(input) {
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
    async list() {
      return memory ? [memory] : [];
    },
    async update() {
      if (!memory) {
        throw new Error("No memory");
      }
      return memory;
    },
    async exportMemories() {
      return {
        format: "nuzo-memory-export",
        version: 1,
        exported_at: "2026-06-13T00:00:00.000Z",
        memories: [],
      };
    },
    async importMemories() {
      return {
        imported: 0,
        skipped: 0,
        dryRun: false,
      };
    },
    async forget() {},
  };

  return createMemoryToolHandlers(service);
}

describe("memory MCP handlers", () => {
  it("remembers and recalls through tool-shaped inputs", async () => {
    const handlers = createTestHandlers();

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
});
