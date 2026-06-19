import { NuzoMemoryError } from "./errors.js";
import type {
  AuditLog,
  Clock,
  IdGenerator,
  MemoryStore,
  PolicyEngine,
  SearchIndex,
  TransactionManager,
} from "./ports.js";
import type {
  ExportMemoriesInput,
  ForgetMemoryInput,
  ForgetMemoriesInput,
  ForgetMemoriesResult,
  ImportMemoriesInput,
  ImportMemoriesResult,
  ListMemoriesInput,
  MemoryExportDocument,
  MemoryExportItem,
  MemoryEvent,
  MemoryRecord,
  MemoryScope,
  RecallMemoriesInput,
  RecallMemoryResult,
  RememberMemoryInput,
  UpdateMemoryInput,
} from "./types.js";
import { memoryKinds } from "./types.js";

export interface MemoryServiceDependencies {
  store: MemoryStore;
  searchIndex: SearchIndex;
  auditLog: AuditLog;
  clock: Clock;
  ids: IdGenerator;
  policy: PolicyEngine;
  transactions?: TransactionManager;
}

export interface MemoryService {
  remember(input: RememberMemoryInput): Promise<MemoryRecord>;
  recall(input: RecallMemoriesInput): Promise<RecallMemoryResult[]>;
  list(input?: ListMemoriesInput): Promise<MemoryRecord[]>;
  update(input: UpdateMemoryInput): Promise<MemoryRecord>;
  history(memoryId: string): Promise<MemoryEvent[]>;
  exportMemories(input: ExportMemoriesInput): Promise<MemoryExportDocument>;
  importMemories(input: ImportMemoriesInput): Promise<ImportMemoriesResult>;
  forget(input: ForgetMemoryInput): Promise<void>;
  forgetMany(input: ForgetMemoriesInput): Promise<ForgetMemoriesResult>;
}

export function createMemoryService(dependencies: MemoryServiceDependencies): MemoryService {
  const { auditLog, clock, ids, policy, searchIndex, store, transactions } = dependencies;
  const runTransaction = transactions
    ? <T>(operation: () => Promise<T>) => transactions.run(operation)
    : <T>(operation: () => Promise<T>) => operation();

  async function forgetMemory(input: ForgetMemoryInput): Promise<void> {
    assertActor(input.actor);

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

      await runTransaction(async () => {
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
      });
      return;
    }

    await runTransaction(async () => {
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
    });
  }

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

      await runTransaction(async () => {
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
      });

      return memory;
    },

    async recall(input) {
      await policy.assertCanRecall(input);

      const results = await searchIndex.search({
        ...input,
        limit: input.limit ?? 8,
      });

      if (input.recordUsage === false) {
        return results;
      }

      const now = clock.now();
      await runTransaction(async () => {
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
      });

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

      await runTransaction(async () => {
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
      });

      return updated;
    },

    async history(memoryId) {
      if (memoryId.trim().length === 0) {
        throw new NuzoMemoryError("MEMORY_ID_EMPTY", "Memory ID cannot be empty.");
      }
      return auditLog.list(memoryId);
    },

    async exportMemories(input) {
      assertActor(input.actor);

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
      assertActor(input.actor);
      assertExportDocument(input.document);

      const planned: Array<{
        item: MemoryExportItem;
        scope: MemoryScope;
        tags: string[];
      }> = [];
      const duplicateKeysByScope = new Map<MemoryScope, Set<string>>();
      let skipped = 0;

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

        const tags = [...new Set(item.tags)];
        let duplicateKeys = duplicateKeysByScope.get(scope);
        if (!duplicateKeys) {
          const existing = await store.list({ scope, includeArchived: true });
          duplicateKeys = new Set(existing.map(toImportDuplicateKey));
          duplicateKeysByScope.set(scope, duplicateKeys);
        }

        const duplicateKey = toImportDuplicateKey({
          scope,
          kind: item.kind,
          content: item.content,
          tags,
        });

        if (duplicateKeys.has(duplicateKey)) {
          skipped += 1;
          continue;
        }

        duplicateKeys.add(duplicateKey);
        planned.push({ item, scope, tags });
      }

      if (input.dryRun === true) {
        return {
          imported: planned.length,
          skipped,
          dryRun: true,
        };
      }

      await runTransaction(async () => {
        for (const { item, scope, tags } of planned) {
          const memory: MemoryRecord = {
            id: ids.memoryId(),
            scope,
            kind: item.kind,
            content: item.content.trim(),
            tags,
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
        }
      });

      return {
        imported: planned.length,
        skipped,
        dryRun: false,
      };
    },

    forget: forgetMemory,

    async forgetMany(input) {
      const hasScope = input.scope !== undefined;
      const hasTags = (input.tags?.length ?? 0) > 0;
      const selectsAll = input.all === true;
      if (!selectsAll && !hasScope && !hasTags) {
        throw new NuzoMemoryError(
          "MEMORY_BULK_SELECTOR_REQUIRED",
          "Bulk forget requires a scope, at least one tag, or all.",
        );
      }
      if (selectsAll && (hasScope || hasTags)) {
        throw new NuzoMemoryError(
          "MEMORY_BULK_SELECTOR_CONFLICT",
          "Bulk forget all cannot be combined with scope or tags.",
        );
      }
      assertActor(input.actor);

      const mode = input.mode ?? "archive";
      const dryRun = input.dryRun !== false;
      if (!dryRun && mode === "delete" && input.confirm !== true) {
        throw new NuzoMemoryError(
          "MEMORY_DELETE_CONFIRMATION_REQUIRED",
          "Hard delete requires explicit confirmation.",
        );
      }

      const filter: ListMemoriesInput = {};
      if (input.scope !== undefined) {
        filter.scope = input.scope;
      }
      if (hasTags) {
        filter.tags = input.tags!;
      }
      const memories = await store.list(filter);
      const memoryIds = memories.map((memory) => memory.id);

      if (!dryRun) {
        for (const memory of memories) {
          const forgetInput: ForgetMemoryInput = {
            id: memory.id,
            mode,
            actor: input.actor,
          };
          if (input.confirm !== undefined) {
            forgetInput.confirm = input.confirm;
          }
          if (input.reason !== undefined) {
            forgetInput.reason = input.reason;
          }
          await forgetMemory(forgetInput);
        }
      }

      return {
        matched: memories.length,
        affected: dryRun ? 0 : memories.length,
        mode,
        dryRun,
        ids: memoryIds,
      };
    },
  };
}

function assertActor(actor: string): void {
  if (actor.trim().length === 0) {
    throw new NuzoMemoryError("MEMORY_ACTOR_EMPTY", "Memory actor cannot be empty.");
  }
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
  const value = document as unknown;
  if (!isRecord(value)) {
    throw new NuzoMemoryError("MEMORY_EXPORT_INVALID", "Memory export document is invalid.");
  }

  if (value.format !== "nuzo-memory-export" || value.version !== 1) {
    throw new NuzoMemoryError("MEMORY_EXPORT_UNSUPPORTED", "Memory export format is not supported.", {
      format: value.format,
      version: value.version,
    });
  }

  parseExportDate(getStringField(value, "exported_at", "document"), "exported_at");

  if (!Array.isArray(value.memories)) {
    throw new NuzoMemoryError("MEMORY_EXPORT_INVALID", "Memory export document is invalid.");
  }

  value.memories.forEach(assertExportItem);
}

function assertExportItem(item: unknown, index: number): void {
  if (!isRecord(item)) {
    throwInvalidExportItem(index, "item must be an object");
  }

  getStringField(item, "scope", `memories[${index}]`);
  const kind = getStringField(item, "kind", `memories[${index}]`);
  if (!memoryKinds.includes(kind as MemoryExportItem["kind"])) {
    throwInvalidExportItem(index, "kind is not supported", { kind });
  }
  getStringField(item, "content", `memories[${index}]`);
  getStringArrayField(item, "tags", `memories[${index}]`);
  getStringField(item, "source", `memories[${index}]`);
  const confidence = getNumberField(item, "confidence", `memories[${index}]`);
  if (confidence < 0 || confidence > 1) {
    throwInvalidExportItem(index, "confidence must be between 0 and 1", {
      confidence,
    });
  }
  const createdAt = getStringField(item, "created_at", `memories[${index}]`);
  const updatedAt = getStringField(item, "updated_at", `memories[${index}]`);
  const lastUsedAt = getNullableStringField(item, "last_used_at", `memories[${index}]`);
  const archivedAt = getNullableStringField(item, "archived_at", `memories[${index}]`);

  parseExportDate(createdAt, `memories[${index}].created_at`);
  parseExportDate(updatedAt, `memories[${index}].updated_at`);
  if (lastUsedAt !== null) {
    parseExportDate(lastUsedAt, `memories[${index}].last_used_at`);
  }
  if (archivedAt !== null) {
    parseExportDate(archivedAt, `memories[${index}].archived_at`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getStringField(record: Record<string, unknown>, field: string, path: string): string {
  if (typeof record[field] !== "string") {
    throwInvalidExportField(path, field, "must be a string", { value: record[field] });
  }
  return record[field];
}

function getNullableStringField(record: Record<string, unknown>, field: string, path: string): string | null {
  if (record[field] !== null && typeof record[field] !== "string") {
    throwInvalidExportField(path, field, "must be a string or null", { value: record[field] });
  }
  return record[field];
}

function getStringArrayField(record: Record<string, unknown>, field: string, path: string): string[] {
  if (!Array.isArray(record[field]) || !record[field].every((value) => typeof value === "string")) {
    throwInvalidExportField(path, field, "must be an array of strings", { value: record[field] });
  }
  return record[field];
}

function getNumberField(record: Record<string, unknown>, field: string, path: string): number {
  if (typeof record[field] !== "number" || !Number.isFinite(record[field])) {
    throwInvalidExportField(path, field, "must be a finite number", { value: record[field] });
  }
  return record[field];
}

function throwInvalidExportField(
  path: string,
  field: string,
  reason: string,
  details: Record<string, unknown> = {},
): never {
  throw new NuzoMemoryError("MEMORY_EXPORT_INVALID", "Memory export document is invalid.", {
    path: `${path}.${field}`,
    reason,
    ...details,
  });
}

function throwInvalidExportItem(
  index: number,
  reason: string,
  details: Record<string, unknown> = {},
): never {
  throw new NuzoMemoryError("MEMORY_EXPORT_INVALID", "Memory export document is invalid.", {
    path: `memories[${index}]`,
    reason,
    ...details,
  });
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

function toImportDuplicateKey(
  memory: MemoryRecord,
): string;
function toImportDuplicateKey(
  memory: Pick<MemoryRecord, "scope" | "kind" | "content" | "tags">,
): string;
function toImportDuplicateKey(
  memory: Pick<MemoryRecord, "scope" | "kind" | "content" | "tags">,
): string {
  return JSON.stringify([
    memory.scope,
    memory.kind,
    normalizeContent(memory.content),
    normalizeTags(memory.tags),
  ]);
}

function normalizeContent(content: string): string {
  return content.trim().replace(/\s+/g, " ");
}

function normalizeTags(tags: string[]): string[] {
  return [...new Set(tags)].sort();
}
