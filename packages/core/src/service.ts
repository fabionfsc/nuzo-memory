import { NuzoMemoryError } from "./errors.js";
import { buildBoundedCaptureSuggestion, toCaptureDuplicateKey } from "./capture-suggestions.js";
import {
  assertExportDocument,
  parseExportDate,
  toExportItem,
  toImportDuplicateKey,
} from "./import-export.js";
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
  AuditEventFilter,
  ConfirmCaptureInput,
  ConfirmCaptureResult,
  CaptureSuggestionResult,
  ExportMemoriesInput,
  ForgetMemoryInput,
  ForgetMemoriesInput,
  ForgetMemoriesResult,
  ImportMemoriesInput,
  ImportMemoriesResult,
  ListMemoriesInput,
  MemoryHistoryInput,
  MemoryExportDocument,
  MemoryExportItem,
  MemoryEvent,
  MemoryRecord,
  MemoryScope,
  RecallMemoriesInput,
  RecallMemoriesResponse,
  RecallMemoryResult,
  RememberMemoryInput,
  SuggestCaptureInput,
  UpdateMemoryInput,
} from "./types.js";
import { memoryLimits } from "./policy.js";

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
  suggestCapture(input: SuggestCaptureInput): Promise<CaptureSuggestionResult>;
  confirmCapture(input: ConfirmCaptureInput): Promise<ConfirmCaptureResult>;
  remember(input: RememberMemoryInput): Promise<MemoryRecord>;
  recall(input: RecallMemoriesInput): Promise<RecallMemoryResult[]>;
  recallDetailed(input: RecallMemoriesInput): Promise<RecallMemoriesResponse>;
  list(input?: ListMemoriesInput): Promise<MemoryRecord[]>;
  update(input: UpdateMemoryInput): Promise<MemoryRecord>;
  history(memoryId: string, input?: MemoryHistoryInput): Promise<MemoryEvent[]>;
  audit(input?: AuditEventFilter): Promise<MemoryEvent[]>;
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
    assertMemoryId(input.id);
    assertActor(input.actor);
    assertReason(input.reason);

    const memory = await store.findById(input.id);
    if (!memory) {
      throw new NuzoMemoryError("MEMORY_NOT_FOUND", "Memory was not found.", { id: input.id });
    }
    assertExpectedRevision(input.expectedRevision, memory);
    await policy.assertCanForget(input, memory);

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
        const deleted = await store.delete(input.id, memory.revision);
        assertRevisionCommitted(deleted, input.id, memory.revision);
        await searchIndex.remove(input.id);
        await auditLog.append({
          id: ids.eventId(),
          memoryId: input.id,
          eventType: "memory.deleted",
          actor: input.actor,
          payload: { reason: input.reason ?? null, scope: memory.scope },
          createdAt: now,
        });
      });
      return;
    }

    await runTransaction(async () => {
      const archived = await store.archive(input.id, now, memory.revision);
      assertRevisionCommitted(archived, input.id, memory.revision);
      await searchIndex.remove(input.id);
      await auditLog.append({
        id: ids.eventId(),
        memoryId: input.id,
        eventType: "memory.archived",
        actor: input.actor,
        payload: { reason: input.reason ?? null, scope: memory.scope },
        createdAt: now,
      });
    });
  }

  async function rememberMemory(input: RememberMemoryInput): Promise<MemoryRecord> {
    await policy.assertCanRemember(input);

    const now = clock.now();
    const memory: MemoryRecord = {
      id: ids.memoryId(),
      revision: 1,
      scope: input.scope,
      kind: input.kind,
      content: input.content.trim(),
      tags: [...new Set(input.tags ?? [])],
      source: input.source,
      confidence: input.confidence ?? 1,
      confidenceState: input.confidenceState ?? "user_confirmed",
      provenance: input.provenance ?? null,
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
        payload: {
          kind: memory.kind,
          scope: memory.scope,
          tags: memory.tags,
          confidenceState: memory.confidenceState,
          provenance: memory.provenance,
        },
        createdAt: now,
      });
    });

    return memory;
  }

  async function updateMemory(input: UpdateMemoryInput): Promise<MemoryRecord> {
    assertMemoryId(input.id);
    assertActor(input.actor);
    const current = await store.findById(input.id);
    if (!current) {
      throw new NuzoMemoryError("MEMORY_NOT_FOUND", "Memory was not found.", { id: input.id });
    }
    assertExpectedRevision(input.expectedRevision, current);

    const hasChanges =
      input.content !== undefined ||
      input.kind !== undefined ||
      input.scope !== undefined ||
      input.tags !== undefined ||
      input.confidence !== undefined ||
      "confidenceState" in input ||
      "provenance" in input;
    if (!hasChanges) {
      throw new NuzoMemoryError("MEMORY_UPDATE_EMPTY", "At least one memory field must be updated.", {
        id: input.id,
      });
    }

    await policy.assertCanUpdate(input, current);

    const updated: MemoryRecord = {
      ...current,
      revision: current.revision + 1,
      content: input.content?.trim() ?? current.content,
      kind: input.kind ?? current.kind,
      scope: input.scope ?? current.scope,
      tags: input.tags ? [...new Set(input.tags)] : current.tags,
      confidence: input.confidence ?? current.confidence,
      confidenceState: "confidenceState" in input ? input.confidenceState ?? null : current.confidenceState,
      provenance: "provenance" in input ? input.provenance ?? null : current.provenance,
      updatedAt: clock.now(),
    };

    await runTransaction(async () => {
      const committed = await store.update(updated, current.revision);
      assertRevisionCommitted(committed, input.id, current.revision);
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
            confidenceState: "confidenceState" in input,
            provenance: "provenance" in input,
          },
          scope: updated.scope,
        },
        createdAt: updated.updatedAt,
      });
    });

    return updated;
  }

  async function recallMemories(input: RecallMemoriesInput): Promise<RecallMemoriesResponse> {
    await policy.assertCanRecall(input);
    const requestedMode = input.retrievalMode ?? "fts";
    const response = searchIndex.searchDetailed
      ? await searchIndex.searchDetailed({ ...input, limit: input.limit ?? 8 })
      : {
          results: await searchIndex.search({ ...input, limit: input.limit ?? 8 }),
          diagnostics: {
            requestedMode,
            effectiveMode: requestedMode,
            semanticFallbackCode: null,
          },
        };

    if (input.recordUsage !== true) return response;
    const now = clock.now();
    await runTransaction(async () => {
      for (const result of response.results) {
        const current = await store.findById(result.memory.id);
        if (!current || current.archivedAt !== null) continue;
        const updated: MemoryRecord = {
          ...current,
          revision: current.revision + 1,
          lastUsedAt: now,
        };
        const committed = await store.update(updated, current.revision);
        assertRevisionCommitted(committed, current.id, current.revision);
        await auditLog.append({
          id: ids.eventId(),
          memoryId: current.id,
          eventType: "memory.recalled",
          actor: "core",
          payload: { query: input.query, score: result.score, scope: current.scope },
          createdAt: now,
        });
      }
    });
    return response;
  }

  return {
    async suggestCapture(input) {
      assertCaptureReason(input.reason);
      await policy.assertCanRemember(input);

      const draft = {
        content: input.content.trim(),
        kind: input.kind,
        scope: input.scope,
        tags: [...new Set(input.tags ?? [])],
        source: input.source,
        confidence: input.confidence ?? 1,
        confidenceState: input.confidenceState ?? "inferred",
        provenance: input.provenance ?? null,
        reason: input.reason.trim(),
      };
      const duplicateKey = toCaptureDuplicateKey(draft.content);
      const memories = await store.list({ scope: draft.scope });
      const duplicate = memories.find((memory) => (
        memory.archivedAt === null &&
        toCaptureDuplicateKey(memory.content) === duplicateKey
      )) ?? null;

      if (input.relationshipMode === "bounded") {
        return buildBoundedCaptureSuggestion({ draft, duplicate, memories });
      }

      return {
        status: duplicate ? "duplicate" : "ready",
        memoryWrites: false,
        requiresConfirmation: true,
        draft,
        duplicate,
      };
    },

    async confirmCapture(input) {
      assertCaptureReason(input.reason);
      assertActor(input.actor);

      if (input.decision === "reject") {
        return {
          decision: input.decision,
          status: "skipped",
          memoryWrites: false,
          memory: null,
          requiresConfirmation: false,
          reason: input.reason.trim(),
        };
      }

      if (input.decision === "clarify") {
        return {
          decision: input.decision,
          status: "needs_clarification",
          memoryWrites: false,
          memory: null,
          requiresConfirmation: false,
          reason: input.reason.trim(),
        };
      }

      if (input.confirm !== true) {
        throw new NuzoMemoryError(
          "MEMORY_CAPTURE_CONFIRMATION_REQUIRED",
          "Confirmed capture writes require explicit confirmation.",
          { decision: input.decision },
        );
      }

      if (input.decision === "update") {
        if (input.targetMemoryId === undefined) {
          throw new NuzoMemoryError(
            "MEMORY_TARGET_REQUIRED",
            "Confirmed capture updates require a target memory.",
            { decision: input.decision },
          );
        }
        assertMemoryId(input.targetMemoryId);
        if (input.expectedRevision === undefined) {
          throw new NuzoMemoryError(
            "MEMORY_EXPECTED_REVISION_REQUIRED",
            "Confirmed capture updates require the displayed expected revision.",
            { decision: input.decision, targetMemoryId: input.targetMemoryId },
          );
        }
        const updateInput: UpdateMemoryInput = {
          id: input.targetMemoryId,
          expectedRevision: input.expectedRevision,
          content: input.content,
          kind: input.kind,
          scope: input.scope,
          tags: input.tags ?? [],
          actor: input.actor,
        };
        if (input.confidence !== undefined) {
          updateInput.confidence = input.confidence;
        }
        if ("confidenceState" in input) {
          updateInput.confidenceState = input.confidenceState ?? null;
        }
        if ("provenance" in input) {
          updateInput.provenance = input.provenance ?? null;
        }
        const memory = await updateMemory(updateInput);
        return {
          decision: input.decision,
          status: "updated",
          memoryWrites: true,
          memory,
          requiresConfirmation: false,
          reason: input.reason.trim(),
        };
      }

      if (input.decision === "create" || input.decision === "keep_separate") {
        if (input.decision === "create") {
          const duplicateKey = toCaptureDuplicateKey(input.content);
          const memories = await store.list({ scope: input.scope });
          const duplicate = memories.find((memory) => (
            memory.archivedAt === null &&
            toCaptureDuplicateKey(memory.content) === duplicateKey
          )) ?? null;
          if (duplicate) {
            return {
              decision: input.decision,
              status: "skipped",
              memoryWrites: false,
              memory: duplicate,
              requiresConfirmation: false,
              reason: input.reason.trim(),
            };
          }
        }
        const rememberInput: RememberMemoryInput = {
          content: input.content,
          kind: input.kind,
          scope: input.scope,
          tags: input.tags ?? [],
          source: input.source,
          confidenceState: input.confidenceState ?? "user_confirmed",
          provenance: input.provenance ?? null,
        };
        if (input.confidence !== undefined) {
          rememberInput.confidence = input.confidence;
        }
        const memory = await rememberMemory(rememberInput);
        return {
          decision: input.decision,
          status: "created",
          memoryWrites: true,
          memory,
          requiresConfirmation: false,
          reason: input.reason.trim(),
        };
      }

      throw new NuzoMemoryError("MEMORY_CAPTURE_DECISION_INVALID", "Capture decision is invalid.", {
        decision: input.decision,
      });
    },

    async remember(input) {
      return rememberMemory(input);
    },

    async recall(input) {
      return (await recallMemories(input)).results;
    },

    async recallDetailed(input) {
      return recallMemories(input);
    },

    async list(input = {}) {
      await policy.assertCanList(input);
      return store.list(input);
    },

    async update(input) {
      return updateMemory(input);
    },

    async history(memoryId, input = {}) {
      assertMemoryId(memoryId);
      assertPageInput(input);
      const currentMemory = await store.findById(memoryId);
      await policy.assertCanAudit({ memoryId }, currentMemory);
      return auditLog.list(memoryId, input);
    },

    async audit(input = {}) {
      if (input.memoryId !== undefined) {
        assertMemoryId(input.memoryId);
      }
      const currentMemory = input.memoryId === undefined
        ? undefined
        : await store.findById(input.memoryId);
      await policy.assertCanAudit(input, currentMemory);
      return auditLog.query(input);
    },

    async exportMemories(input) {
      assertActor(input.actor);
      await policy.assertCanList(input);

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

      for (const item of input.document.memories) {
        const scope = input.scope ?? item.scope;
        await policy.assertCanRemember({
          content: item.content,
          kind: item.kind,
          scope,
          tags: item.tags,
          source: item.source,
          confidence: item.confidence,
          confidenceState: item.confidence_state ?? null,
          provenance: item.provenance ?? null,
        });

      }

      const planImport = async (): Promise<{
        planned: Array<{
          item: MemoryExportItem;
          scope: MemoryScope;
          tags: string[];
        }>;
        skipped: number;
      }> => {
        const planned: Array<{
          item: MemoryExportItem;
          scope: MemoryScope;
          tags: string[];
        }> = [];
        const duplicateKeysByScope = new Map<MemoryScope, Set<string>>();
        let skipped = 0;

        for (const item of input.document.memories) {
          const scope = input.scope ?? item.scope;
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

        return { planned, skipped };
      };

      if (input.dryRun === true) {
        const { planned, skipped } = await planImport();
        return {
          imported: planned.length,
          skipped,
          dryRun: true,
        };
      }

      let imported = 0;
      let skipped = 0;
      await runTransaction(async () => {
        const plan = await planImport();
        imported = plan.planned.length;
        skipped = plan.skipped;
        for (const { item, scope, tags } of plan.planned) {
          const memory: MemoryRecord = {
            id: ids.memoryId(),
            revision: 1,
            scope,
            kind: item.kind,
            content: item.content.trim(),
            tags,
            source: item.source,
            confidence: item.confidence,
            confidenceState: item.confidence_state ?? null,
            provenance: item.provenance ?? null,
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
        imported,
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
      assertReason(input.reason);
      await policy.assertCanList({
        ...(input.scope === undefined ? {} : { scope: input.scope }),
        ...(input.tags === undefined ? {} : { tags: input.tags }),
      });

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
            expectedRevision: memory.revision,
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

function assertExpectedRevision(expectedRevision: number | undefined, memory: MemoryRecord): void {
  if (expectedRevision === undefined) {
    return;
  }
  if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
    throw new NuzoMemoryError("MEMORY_REVISION_INVALID", "Memory revision is invalid.", {
      expectedRevision,
    });
  }
  if (memory.revision !== expectedRevision) {
    throw new NuzoMemoryError("MEMORY_REVISION_CONFLICT", "Memory changed before this operation could commit.", {
      id: memory.id,
      expectedRevision,
      currentRevision: memory.revision,
    });
  }
}

function assertRevisionCommitted(committed: boolean, id: string, expectedRevision: number): void {
  if (!committed) {
    throw new NuzoMemoryError("MEMORY_REVISION_CONFLICT", "Memory changed before this operation could commit.", {
      id,
      expectedRevision,
    });
  }
}

function assertActor(actor: string): void {
  if (actor.trim().length === 0) {
    throw new NuzoMemoryError("MEMORY_ACTOR_EMPTY", "Memory actor cannot be empty.");
  }
  if (actor.length > memoryLimits.actorLength) {
    throw new NuzoMemoryError("MEMORY_ACTOR_INVALID", "Memory actor is too long.", {
      maxLength: memoryLimits.actorLength,
    });
  }
}

function assertMemoryId(memoryId: string): void {
  if (memoryId.trim().length === 0) {
    throw new NuzoMemoryError("MEMORY_ID_EMPTY", "Memory ID cannot be empty.");
  }
  if (memoryId.length > memoryLimits.identifierLength) {
    throw new NuzoMemoryError("MEMORY_ID_INVALID", "Memory ID is too long.", {
      maxLength: memoryLimits.identifierLength,
    });
  }
}

function assertReason(reason: string | undefined): void {
  if (reason !== undefined && reason.length > memoryLimits.reasonLength) {
    throw new NuzoMemoryError("MEMORY_REASON_TOO_LONG", "Memory reason is too long.", {
      maxLength: memoryLimits.reasonLength,
    });
  }
}

function assertPageInput(input: MemoryHistoryInput): void {
  const invalidLimit = input.limit !== undefined && (
    !Number.isInteger(input.limit) || input.limit <= 0 || input.limit > 1000
  );
  if (invalidLimit) {
    throw new NuzoMemoryError("MEMORY_HISTORY_LIMIT_INVALID", "History limit must be 1-1000.", {
      limit: input.limit,
    });
  }
  if (input.cursor !== undefined && input.cursor.trim().length === 0) {
    throw new NuzoMemoryError("MEMORY_CURSOR_INVALID", "Memory pagination cursor is invalid.");
  }
  if (input.cursor !== undefined && input.cursor.length > memoryLimits.identifierLength * 4) {
    throw new NuzoMemoryError("MEMORY_CURSOR_INVALID", "Memory pagination cursor is invalid.");
  }
}

function assertCaptureReason(reason: string): void {
  if (reason.trim().length === 0) {
    throw new NuzoMemoryError("MEMORY_REASON_EMPTY", "Memory reason cannot be empty.");
  }
  assertReason(reason);
}
