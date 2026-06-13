import { NuzoMemoryError } from "./errors.js";
import type { AuditLog, Clock, IdGenerator, MemoryStore, PolicyEngine, SearchIndex } from "./ports.js";
import type {
  ExportMemoriesInput,
  ForgetMemoryInput,
  ImportMemoriesInput,
  ImportMemoriesResult,
  ListMemoriesInput,
  MemoryExportDocument,
  MemoryExportItem,
  MemoryRecord,
  RecallMemoriesInput,
  RecallMemoryResult,
  RememberMemoryInput,
  UpdateMemoryInput,
} from "./types.js";

export interface MemoryServiceDependencies {
  store: MemoryStore;
  searchIndex: SearchIndex;
  auditLog: AuditLog;
  clock: Clock;
  ids: IdGenerator;
  policy: PolicyEngine;
}

export interface MemoryService {
  remember(input: RememberMemoryInput): Promise<MemoryRecord>;
  recall(input: RecallMemoriesInput): Promise<RecallMemoryResult[]>;
  list(input?: ListMemoriesInput): Promise<MemoryRecord[]>;
  update(input: UpdateMemoryInput): Promise<MemoryRecord>;
  exportMemories(input: ExportMemoriesInput): Promise<MemoryExportDocument>;
  importMemories(input: ImportMemoriesInput): Promise<ImportMemoriesResult>;
  forget(input: ForgetMemoryInput): Promise<void>;
}

export function createMemoryService(dependencies: MemoryServiceDependencies): MemoryService {
  const { auditLog, clock, ids, policy, searchIndex, store } = dependencies;

  return {
    async remember(input) {
      await policy.assertCanRemember(input);

      const now = clock.now();
      const memory: MemoryRecord = {
        id: ids.memoryId(),
        scope: input.scope,
        kind: input.kind,
        content: input.content.trim(),
        tags: [...new Set(input.tags ?? [])],
        source: input.source,
        confidence: input.confidence ?? 1,
        createdAt: now,
        updatedAt: now,
        lastUsedAt: null,
        archivedAt: null,
      };

      await store.create(memory);
      await searchIndex.index(memory);
      await auditLog.append({
        id: ids.eventId(),
        memoryId: memory.id,
        eventType: "memory.created",
        actor: input.source,
        payload: { kind: memory.kind, scope: memory.scope, tags: memory.tags },
        createdAt: now,
      });

      return memory;
    },

    async recall(input) {
      await policy.assertCanRecall(input);

      const results = await searchIndex.search({
        ...input,
        limit: input.limit ?? 8,
      });

      const now = clock.now();
      for (const result of results) {
        await store.update({
          ...result.memory,
          lastUsedAt: now,
        });
        await auditLog.append({
          id: ids.eventId(),
          memoryId: result.memory.id,
          eventType: "memory.recalled",
          actor: "core",
          payload: { query: input.query, score: result.score },
          createdAt: now,
        });
      }

      return results;
    },

    async list(input = {}) {
      return store.list(input);
    },

    async update(input) {
      const current = await store.findById(input.id);
      if (!current) {
        throw new NuzoMemoryError("MEMORY_NOT_FOUND", "Memory was not found.", { id: input.id });
      }

      const hasChanges =
        input.content !== undefined ||
        input.kind !== undefined ||
        input.scope !== undefined ||
        input.tags !== undefined ||
        input.confidence !== undefined;
      if (!hasChanges) {
        throw new NuzoMemoryError("MEMORY_UPDATE_EMPTY", "At least one memory field must be updated.", {
          id: input.id,
        });
      }

      await policy.assertCanUpdate(input, current);

      const updated: MemoryRecord = {
        ...current,
        content: input.content?.trim() ?? current.content,
        kind: input.kind ?? current.kind,
        scope: input.scope ?? current.scope,
        tags: input.tags ? [...new Set(input.tags)] : current.tags,
        confidence: input.confidence ?? current.confidence,
        updatedAt: clock.now(),
      };

      await store.update(updated);
      await searchIndex.index(updated);
      await auditLog.append({
        id: ids.eventId(),
        memoryId: updated.id,
        eventType: "memory.updated",
        actor: input.actor,
        payload: {
          changed: {
            content: input.content !== undefined,
            kind: input.kind !== undefined,
            scope: input.scope !== undefined,
            tags: input.tags !== undefined,
            confidence: input.confidence !== undefined,
          },
        },
        createdAt: updated.updatedAt,
      });

      return updated;
    },

    async exportMemories(input) {
      const memories = await store.list(input);
      const now = clock.now();
      await auditLog.append({
        id: ids.eventId(),
        memoryId: null,
        eventType: "memory.exported",
        actor: input.actor,
        payload: {
          scope: input.scope ?? null,
          tags: input.tags ?? [],
          includeArchived: input.includeArchived === true,
          count: memories.length,
        },
        createdAt: now,
      });

      return {
        format: "nuzo-memory-export",
        version: 1,
        exported_at: now.toISOString(),
        memories: memories.map(toExportItem),
      };
    },

    async importMemories(input) {
      assertExportDocument(input.document);

      let imported = 0;
      for (const item of input.document.memories) {
        const scope = input.scope ?? item.scope;
        await policy.assertCanRemember({
          content: item.content,
          kind: item.kind,
          scope,
          tags: item.tags,
          source: item.source,
          confidence: item.confidence,
        });

        if (input.dryRun === true) {
          imported += 1;
          continue;
        }

        const memory: MemoryRecord = {
          id: ids.memoryId(),
          scope,
          kind: item.kind,
          content: item.content.trim(),
          tags: [...new Set(item.tags)],
          source: item.source,
          confidence: item.confidence,
          createdAt: parseExportDate(item.created_at, "created_at"),
          updatedAt: parseExportDate(item.updated_at, "updated_at"),
          lastUsedAt: item.last_used_at ? parseExportDate(item.last_used_at, "last_used_at") : null,
          archivedAt: item.archived_at ? parseExportDate(item.archived_at, "archived_at") : null,
        };

        await store.create(memory);
        await searchIndex.index(memory);
        await auditLog.append({
          id: ids.eventId(),
          memoryId: memory.id,
          eventType: "memory.imported",
          actor: input.actor,
          payload: {
            originalScope: item.scope,
            scope,
            archived: memory.archivedAt !== null,
          },
          createdAt: clock.now(),
        });
        imported += 1;
      }

      return {
        imported,
        skipped: 0,
        dryRun: input.dryRun === true,
      };
    },

    async forget(input) {
      const memory = await store.findById(input.id);
      if (!memory) {
        throw new NuzoMemoryError("MEMORY_NOT_FOUND", "Memory was not found.", { id: input.id });
      }

      const mode = input.mode ?? "archive";
      const now = clock.now();

      if (mode === "delete") {
        if (input.confirm !== true) {
          throw new NuzoMemoryError(
            "MEMORY_DELETE_CONFIRMATION_REQUIRED",
            "Hard delete requires explicit confirmation.",
            { id: input.id },
          );
        }

        await store.delete(input.id);
        await searchIndex.remove(input.id);
        await auditLog.append({
          id: ids.eventId(),
          memoryId: input.id,
          eventType: "memory.deleted",
          actor: input.actor,
          payload: { reason: input.reason ?? null },
          createdAt: now,
        });
        return;
      }

      await store.archive(input.id, now);
      await searchIndex.remove(input.id);
      await auditLog.append({
        id: ids.eventId(),
        memoryId: input.id,
        eventType: "memory.archived",
        actor: input.actor,
        payload: { reason: input.reason ?? null },
        createdAt: now,
      });
    },
  };
}

function toExportItem(memory: MemoryRecord): MemoryExportItem {
  return {
    scope: memory.scope,
    kind: memory.kind,
    content: memory.content,
    tags: [...memory.tags],
    source: memory.source,
    confidence: memory.confidence,
    created_at: memory.createdAt.toISOString(),
    updated_at: memory.updatedAt.toISOString(),
    last_used_at: memory.lastUsedAt?.toISOString() ?? null,
    archived_at: memory.archivedAt?.toISOString() ?? null,
  };
}

function assertExportDocument(document: MemoryExportDocument): void {
  if (document.format !== "nuzo-memory-export" || document.version !== 1) {
    throw new NuzoMemoryError("MEMORY_EXPORT_UNSUPPORTED", "Memory export format is not supported.", {
      format: document.format,
      version: document.version,
    });
  }
  if (!Array.isArray(document.memories)) {
    throw new NuzoMemoryError("MEMORY_EXPORT_INVALID", "Memory export document is invalid.");
  }
}

function parseExportDate(value: string, field: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new NuzoMemoryError("MEMORY_EXPORT_INVALID", "Memory export contains an invalid date.", {
      field,
      value,
    });
  }
  return date;
}
