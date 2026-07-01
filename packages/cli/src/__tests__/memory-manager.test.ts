import { describe, expect, it } from "vitest";
import type {
  MemoryEvent,
  MemoryRecord,
  MemoryService,
} from "@nuzo/memory-core";
import {
  runMemoryManager,
  type MemoryManagerChoice,
  type MemoryManagerIO,
} from "../memory-manager.js";

const now = new Date("2026-07-01T00:00:00.000Z");

describe("interactive memory manager", () => {
  it("reviews, edits, audits, exports, and imports through core use cases", async () => {
    const original = memory();
    const updated = { ...original, content: "Use concise answers with concrete evidence.", tags: ["style", "evidence"], revision: 2 };
    const updates: unknown[] = [];
    const exported: unknown[] = [];
    const imported: unknown[] = [];
    const io = new FakeManagerIO({
      choices: ["browse", original.id, "edit", "preference", "history", "back", "audit", "export", "import", "exit"],
      inputs: [updated.content, "style, evidence", "backup.json", "import.json"],
      confirmations: [true, true],
    });
    const service = mockService({
      list: async () => [original],
      update: async (input) => {
        updates.push(input);
        return updated;
      },
      history: async () => [event("memory.created", original.id)],
      audit: async () => [event("memory.updated", original.id)],
    });

    await runMemoryManager({
      service,
      io,
      scope: "user:default",
      transfers: {
        exportJson: async (path, includeArchived) => {
          exported.push({ path, includeArchived });
          return 1;
        },
        importJson: async (path, dryRun) => {
          imported.push({ path, dryRun });
          return { imported: 1, skipped: 0 };
        },
      },
    });

    expect(updates).toEqual([{
      id: original.id,
      expectedRevision: 1,
      content: updated.content,
      kind: "preference",
      tags: ["style", "evidence"],
      actor: "nuzo:cli-manager",
    }]);
    expect(exported).toEqual([{ path: "backup.json", includeArchived: true }]);
    expect(imported).toEqual([
      { path: "import.json", dryRun: true },
      { path: "import.json", dryRun: false },
    ]);
    expect(io.output.join("\n")).toContain("Updated mem_manager_test to revision 2.");
    expect(io.output.join("\n")).toContain("Memory manager closed.");
  });

  it("archives reversibly with the displayed revision", async () => {
    const candidate = memory();
    const forgotten: unknown[] = [];
    const io = new FakeManagerIO({
      choices: ["browse", candidate.id, "archive", "exit"],
      confirmations: [true],
    });
    const service = mockService({
      list: async () => [candidate],
      forget: async (input) => { forgotten.push(input); },
    });

    await runMemoryManager({ service, io, scope: "user:default", transfers: noTransfers() });

    expect(forgotten).toEqual([{
      id: candidate.id,
      expectedRevision: 1,
      mode: "archive",
      actor: "nuzo:cli-manager",
      reason: "Confirmed in the interactive memory manager.",
    }]);
  });

  it("requires explicit permanent-delete confirmation", async () => {
    const candidate = { ...memory(), archivedAt: now };
    const forgotten: unknown[] = [];
    const io = new FakeManagerIO({
      choices: ["archived", candidate.id, "delete", "exit"],
      confirmations: [true],
    });
    const service = mockService({
      list: async () => [candidate],
      forget: async (input) => { forgotten.push(input); },
    });

    await runMemoryManager({ service, io, scope: "user:default", transfers: noTransfers() });

    expect(io.confirmationPhrases).toEqual(["DELETE"]);
    expect(forgotten).toEqual([{
      id: candidate.id,
      expectedRevision: 1,
      mode: "delete",
      confirm: true,
      actor: "nuzo:cli-manager",
      reason: "Explicit permanent deletion in the interactive memory manager.",
    }]);
  });
});

class FakeManagerIO implements MemoryManagerIO {
  readonly output: string[] = [];
  readonly confirmationPhrases: Array<string | undefined> = [];
  readonly #choices: string[];
  readonly #inputs: string[];
  readonly #confirmations: boolean[];

  constructor(input: { choices: string[]; inputs?: string[]; confirmations?: boolean[] }) {
    this.#choices = [...input.choices];
    this.#inputs = [...(input.inputs ?? [])];
    this.#confirmations = [...(input.confirmations ?? [])];
  }

  write(message: string): void {
    this.output.push(message);
  }

  async choose(_prompt: string, choices: MemoryManagerChoice[]): Promise<string> {
    const value = this.#choices.shift();
    if (value === undefined || !choices.some((choice) => choice.value === value)) {
      throw new Error(`Unexpected choice ${String(value)}; options=${choices.map((choice) => choice.value).join(",")}`);
    }
    return value;
  }

  async input(): Promise<string> {
    const value = this.#inputs.shift();
    if (value === undefined) throw new Error("Missing fake input");
    return value;
  }

  async confirm(_prompt: string, confirmation?: string): Promise<boolean> {
    this.confirmationPhrases.push(confirmation);
    return this.#confirmations.shift() ?? false;
  }
}

function memory(): MemoryRecord {
  return {
    id: "mem_manager_test",
    revision: 1,
    scope: "user:default",
    kind: "preference",
    content: "Use concise answers.",
    tags: ["style"],
    source: "test:manager",
    confidence: 1,
    createdAt: now,
    updatedAt: now,
    lastUsedAt: null,
    archivedAt: null,
  };
}

function event(eventType: MemoryEvent["eventType"], memoryId: string): MemoryEvent {
  return {
    id: `evt_${eventType}`,
    memoryId,
    eventType,
    actor: "test",
    payload: {},
    createdAt: now,
  };
}

function mockService(overrides: Partial<MemoryService>): MemoryService {
  const unsupported = async () => { throw new Error("Unexpected service call"); };
  return {
    suggestCapture: unsupported,
    confirmCapture: unsupported,
    remember: unsupported,
    recall: unsupported,
    recallDetailed: unsupported,
    list: unsupported,
    update: unsupported,
    history: unsupported,
    audit: unsupported,
    exportMemories: unsupported,
    importMemories: unsupported,
    forget: unsupported,
    forgetMany: unsupported,
    ...overrides,
  } as MemoryService;
}

function noTransfers() {
  return {
    exportJson: async () => 0,
    importJson: async () => ({ imported: 0, skipped: 0 }),
  };
}
