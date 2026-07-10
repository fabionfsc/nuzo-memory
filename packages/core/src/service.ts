import { createHash } from "node:crypto";
import { NuzoMemoryError } from "./errors.js";
import { buildBoundedCaptureSuggestion, toCaptureDuplicateKey } from "./capture-suggestions.js";
import {
  assertExportDocument,
  parseExportDate,
  toExportItem,
  toExportRelationItem,
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
  ChallengeMemoryInput,
  ChallengeMemoryResult,
  ConfirmCaptureInput,
  ConfirmCaptureResult,
  CaptureSuggestionResult,
  ExportMemoriesInput,
  ForgetMemoryInput,
  ForgetMemoriesInput,
  ForgetMemoriesResult,
  ForgetMemoryRelationInput,
  ImportMemoriesInput,
  ImportMemoriesResult,
  InspectMemoryInput,
  ListMemoriesInput,
  ListMemoryRelationsInput,
  MemoryHistoryInput,
  MemoryExportDocument,
  MemoryExportItem,
  MemoryEvent,
  MemoryInspection,
  MemoryRecord,
  MemoryRelationRecord,
  MemoryScope,
  RecallMemoriesInput,
  RecallMemoriesResponse,
  RecallMemoryResult,
  RelateMemoriesInput,
  RememberMemoryInput,
  SuggestCaptureInput,
  UpdateMemoryInput,
} from "./types.js";
import { memoryChallengeOutcomes } from "./types.js";
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
  inspect(input: InspectMemoryInput): Promise<MemoryInspection>;
  challenge(input: ChallengeMemoryInput): Promise<ChallengeMemoryResult>;
  recall(input: RecallMemoriesInput): Promise<RecallMemoryResult[]>;
  recallDetailed(input: RecallMemoriesInput): Promise<RecallMemoriesResponse>;
  list(input?: ListMemoriesInput): Promise<MemoryRecord[]>;
  relate(input: RelateMemoriesInput): Promise<MemoryRelationRecord>;
  relations(input: ListMemoryRelationsInput): Promise<MemoryRelationRecord[]>;
  forgetRelation(input: ForgetMemoryRelationInput): Promise<void>;
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
      reviewAfter: input.reviewAfter ?? null,
      expiresAt: input.expiresAt ?? null,
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
          reviewAfter: memory.reviewAfter?.toISOString() ?? null,
          expiresAt: memory.expiresAt?.toISOString() ?? null,
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
      "provenance" in input ||
      "reviewAfter" in input ||
      "expiresAt" in input;
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
      reviewAfter: "reviewAfter" in input ? input.reviewAfter ?? null : current.reviewAfter,
      expiresAt: "expiresAt" in input ? input.expiresAt ?? null : current.expiresAt,
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
            reviewAfter: "reviewAfter" in input,
            expiresAt: "expiresAt" in input,
          },
          scope: updated.scope,
        },
        createdAt: updated.updatedAt,
      });
    });

    return updated;
  }

  async function relateMemories(input: RelateMemoriesInput): Promise<MemoryRelationRecord> {
    assertMemoryId(input.sourceMemoryId);
    assertMemoryId(input.targetMemoryId);
    assertActor(input.actor);
    assertReason(input.reason);

    const [source, target] = await Promise.all([
      store.findById(input.sourceMemoryId),
      store.findById(input.targetMemoryId),
    ]);
    if (!source) {
      throw new NuzoMemoryError("MEMORY_RELATION_SOURCE_NOT_FOUND", "Source memory was not found.", {
        id: input.sourceMemoryId,
      });
    }
    if (!target) {
      throw new NuzoMemoryError("MEMORY_RELATION_TARGET_NOT_FOUND", "Target memory was not found.", {
        id: input.targetMemoryId,
      });
    }

    await policy.assertCanRelate(input, source, target);

    const now = clock.now();
    const relation: MemoryRelationRecord = {
      id: ids.relationId(),
      sourceMemoryId: input.sourceMemoryId,
      targetMemoryId: input.targetMemoryId,
      relation: input.relation,
      reason: input.reason?.trim() ?? null,
      createdAt: now,
    };

    await runTransaction(async () => {
      const created = await store.createRelation(relation);
      if (!created) {
        throw new NuzoMemoryError(
          "MEMORY_RELATION_DUPLICATE",
          "Memory relation already exists.",
          {
            sourceMemoryId: relation.sourceMemoryId,
            targetMemoryId: relation.targetMemoryId,
            relation: relation.relation,
          },
        );
      }
      await auditLog.append({
        id: ids.eventId(),
        memoryId: relation.sourceMemoryId,
        eventType: "memory.relation.created",
        actor: input.actor,
        payload: {
          relationId: relation.id,
          sourceMemoryId: relation.sourceMemoryId,
          targetMemoryId: relation.targetMemoryId,
          relation: relation.relation,
          reason: relation.reason,
          sourceScope: source.scope,
          targetScope: target.scope,
        },
        createdAt: now,
      });
    });

    return relation;
  }

  async function listRelations(input: ListMemoryRelationsInput): Promise<MemoryRelationRecord[]> {
    assertMemoryId(input.memoryId);
    const memory = await store.findById(input.memoryId);
    if (!memory) {
      throw new NuzoMemoryError("MEMORY_NOT_FOUND", "Memory was not found.", { id: input.memoryId });
    }
    await policy.assertCanListRelations(input, memory);
    const relations = await store.listRelations({
      ...input,
      includeReverse: input.includeReverse ?? true,
      limit: input.limit ?? 50,
    });
    const visibleRelations: MemoryRelationRecord[] = [];
    for (const relation of relations) {
      const [source, target] = await Promise.all([
        store.findById(relation.sourceMemoryId),
        store.findById(relation.targetMemoryId),
      ]);
      if (!source || !target) {
        continue;
      }
      await policy.assertCanListRelations({ memoryId: source.id }, source);
      await policy.assertCanListRelations({ memoryId: target.id }, target);
      visibleRelations.push(relation);
    }
    return visibleRelations;
  }

  async function forgetMemoryRelation(input: ForgetMemoryRelationInput): Promise<void> {
    assertMemoryId(input.id);
    assertActor(input.actor);
    assertReason(input.reason);

    const relation = await store.findRelationById(input.id);
    if (!relation) {
      throw new NuzoMemoryError("MEMORY_RELATION_NOT_FOUND", "Memory relation was not found.", { id: input.id });
    }
    const [source, target] = await Promise.all([
      store.findById(relation.sourceMemoryId),
      store.findById(relation.targetMemoryId),
    ]);
    if (!source) {
      throw new NuzoMemoryError("MEMORY_RELATION_SOURCE_NOT_FOUND", "Source memory was not found.", {
        id: relation.sourceMemoryId,
      });
    }
    if (!target) {
      throw new NuzoMemoryError("MEMORY_RELATION_TARGET_NOT_FOUND", "Target memory was not found.", {
        id: relation.targetMemoryId,
      });
    }
    await policy.assertCanListRelations({ memoryId: source.id }, source);
    await policy.assertCanListRelations({ memoryId: target.id }, target);

    const now = clock.now();
    await runTransaction(async () => {
      const deleted = await store.deleteRelation(input.id);
      if (!deleted) {
        throw new NuzoMemoryError("MEMORY_RELATION_NOT_FOUND", "Memory relation was not found.", { id: input.id });
      }
      await auditLog.append({
        id: ids.eventId(),
        memoryId: relation.sourceMemoryId,
        eventType: "memory.relation.deleted",
        actor: input.actor,
        payload: {
          relationId: relation.id,
          sourceMemoryId: relation.sourceMemoryId,
          targetMemoryId: relation.targetMemoryId,
          relation: relation.relation,
          reason: input.reason ?? null,
        },
        createdAt: now,
      });
    });
  }

  async function inspectMemory(input: InspectMemoryInput): Promise<MemoryInspection> {
    assertMemoryId(input.id);
    assertPageInput({ limit: input.historyLimit ?? 50 });
    const memory = await store.findById(input.id);
    if (!memory) {
      throw new NuzoMemoryError("MEMORY_NOT_FOUND", "Memory was not found.", { id: input.id });
    }
    await policy.assertCanList({ scope: memory.scope, includeArchived: true });
    const [relations, events] = await Promise.all([
      listRelations({ memoryId: input.id, includeReverse: true, limit: 50 }),
      auditLog.list(input.id, { limit: input.historyLimit ?? 50 }),
    ]);
    return {
      memory,
      relations,
      events,
    };
  }

  async function challengeMemory(input: ChallengeMemoryInput): Promise<ChallengeMemoryResult> {
    assertMemoryId(input.id);
    assertActor(input.actor);
    assertCaptureReason(input.reason);
    if (!memoryChallengeOutcomes.includes(input.outcome)) {
      throw new NuzoMemoryError("MEMORY_CHALLENGE_OUTCOME_INVALID", "Memory challenge outcome is invalid.", {
        outcome: input.outcome,
      });
    }

    const current = await store.findById(input.id);
    if (!current) {
      throw new NuzoMemoryError("MEMORY_NOT_FOUND", "Memory was not found.", { id: input.id });
    }
    assertExpectedRevision(input.expectedRevision, current);

    let supersedingMemory: MemoryRecord | null = null;
    if (input.outcome === "superseded") {
      if (input.supersededByMemoryId === undefined) {
        throw new NuzoMemoryError(
          "MEMORY_SUPERSEDING_MEMORY_REQUIRED",
          "Superseded challenges require the superseding memory ID.",
          { id: input.id },
        );
      }
      assertMemoryId(input.supersededByMemoryId);
      if (input.supersededByMemoryId === input.id) {
        throw new NuzoMemoryError("MEMORY_RELATION_SELF_INVALID", "A memory cannot supersede itself.", {
          id: input.id,
        });
      }
      supersedingMemory = await store.findById(input.supersededByMemoryId);
      if (!supersedingMemory) {
        throw new NuzoMemoryError("MEMORY_RELATION_SOURCE_NOT_FOUND", "Superseding memory was not found.", {
          id: input.supersededByMemoryId,
        });
      }
      await policy.assertCanRelate({
        sourceMemoryId: supersedingMemory.id,
        targetMemoryId: current.id,
        relation: "supersedes",
        reason: input.reason,
        actor: input.actor,
      }, supersedingMemory, current);
    }

    const now = clock.now();
    const confidenceState = input.outcome === "valid"
      ? "user_confirmed"
      : input.outcome === "needs_review"
        ? "needs_review"
        : "deprecated";
    const reviewAfter = input.outcome === "valid" ? null : now;
    const updateInput: UpdateMemoryInput = {
      id: input.id,
      confidenceState,
      reviewAfter,
      actor: input.actor,
    };
    if (input.expectedRevision !== undefined) {
      updateInput.expectedRevision = input.expectedRevision;
    }
    await policy.assertCanUpdate(updateInput, current);

    const updated: MemoryRecord = {
      ...current,
      revision: current.revision + 1,
      confidenceState,
      reviewAfter,
      updatedAt: now,
    };
    let createdRelation: MemoryRelationRecord | null = null;

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
            content: false,
            kind: false,
            scope: false,
            tags: false,
            confidence: false,
            confidenceState: true,
            provenance: false,
            reviewAfter: true,
            expiresAt: false,
          },
          scope: updated.scope,
        },
        createdAt: now,
      });
      if (input.outcome === "superseded" && supersedingMemory !== null) {
        const relation: MemoryRelationRecord = {
          id: ids.relationId(),
          sourceMemoryId: supersedingMemory.id,
          targetMemoryId: updated.id,
          relation: "supersedes",
          reason: input.reason.trim(),
          createdAt: now,
        };
        const created = await store.createRelation(relation);
        if (!created) {
          throw new NuzoMemoryError(
            "MEMORY_RELATION_DUPLICATE",
            "Memory relation already exists.",
            {
              sourceMemoryId: relation.sourceMemoryId,
              targetMemoryId: relation.targetMemoryId,
              relation: relation.relation,
            },
          );
        }
        createdRelation = relation;
        await auditLog.append({
          id: ids.eventId(),
          memoryId: relation.sourceMemoryId,
          eventType: "memory.relation.created",
          actor: input.actor,
          payload: {
            relationId: relation.id,
            sourceMemoryId: relation.sourceMemoryId,
            targetMemoryId: relation.targetMemoryId,
            relation: relation.relation,
            reason: relation.reason,
            sourceScope: supersedingMemory.scope,
            targetScope: updated.scope,
          },
          createdAt: now,
        });
      }
      await auditLog.append({
        id: ids.eventId(),
        memoryId: updated.id,
        eventType: "memory.challenged",
        actor: input.actor,
        payload: {
          outcome: input.outcome,
          reason: input.reason.trim(),
          previousConfidenceState: current.confidenceState,
          confidenceState: updated.confidenceState,
          reviewAfter: updated.reviewAfter?.toISOString() ?? null,
          supersededByMemoryId: input.supersededByMemoryId ?? null,
          relationId: createdRelation?.id ?? null,
          scope: updated.scope,
        },
        createdAt: now,
      });
    });

    return {
      memory: updated,
      relation: createdRelation,
      outcome: input.outcome,
    };
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
    const queryHash = hashRecallQuery(input.query);
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
          payload: {
            queryHash,
            queryHashAlgorithm: "sha256",
            score: result.score,
            scope: current.scope,
          },
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
        reviewAfter: input.reviewAfter ?? null,
        expiresAt: input.expiresAt ?? null,
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
        if ("reviewAfter" in input) {
          updateInput.reviewAfter = input.reviewAfter ?? null;
        }
        if ("expiresAt" in input) {
          updateInput.expiresAt = input.expiresAt ?? null;
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
          reviewAfter: input.reviewAfter ?? null,
          expiresAt: input.expiresAt ?? null,
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

    async inspect(input) {
      return inspectMemory(input);
    },

    async challenge(input) {
      return challengeMemory(input);
    },

    async recall(input) {
      return (await recallMemories(input)).results;
    },

    async recallDetailed(input) {
      return recallMemories(input);
    },

    async list(input = {}) {
      await policy.assertCanList(input);
      const listInput: ListMemoriesInput = { ...input };
      if (listInput.needsReview === true && listInput.reviewDueAt === undefined) {
        listInput.reviewDueAt = clock.now();
      }
      return store.list(listInput);
    },

    async relate(input) {
      return relateMemories(input);
    },

    async relations(input) {
      return listRelations(input);
    },

    async forgetRelation(input) {
      return forgetMemoryRelation(input);
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
        relations: storeExportRelations(memories, await store.listRelationsForMemoryIds(memories.map((memory) => memory.id))),
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
          reviewAfter: item.review_after ? parseExportDate(item.review_after, "review_after") : null,
          expiresAt: item.expires_at ? parseExportDate(item.expires_at, "expires_at") : null,
        });

      }

      const planImport = async (): Promise<{
        planned: Array<{
          item: MemoryExportItem;
          index: number;
          scope: MemoryScope;
          tags: string[];
        }>;
        skipped: number;
      }> => {
        const planned: Array<{
          item: MemoryExportItem;
          index: number;
          scope: MemoryScope;
          tags: string[];
        }> = [];
        const duplicateKeysByScope = new Map<MemoryScope, Set<string>>();
        let skipped = 0;

        for (const [index, item] of input.document.memories.entries()) {
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
          planned.push({ item, index, scope, tags });
        }

        return { planned, skipped };
      };

      for (const relation of input.document.relations ?? []) {
        if (input.document.memories[relation.source_index] === undefined || input.document.memories[relation.target_index] === undefined) {
          throw new NuzoMemoryError("MEMORY_EXPORT_INVALID", "Memory export relation references a missing memory.");
        }
      }

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
        const importedMemoryIdByIndex = new Map<number, string>();
        for (const { item, index, scope, tags } of plan.planned) {
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
            reviewAfter: item.review_after ? parseExportDate(item.review_after, "review_after") : null,
            expiresAt: item.expires_at ? parseExportDate(item.expires_at, "expires_at") : null,
            createdAt: parseExportDate(item.created_at, "created_at"),
            updatedAt: parseExportDate(item.updated_at, "updated_at"),
            lastUsedAt: item.last_used_at ? parseExportDate(item.last_used_at, "last_used_at") : null,
            archivedAt: item.archived_at ? parseExportDate(item.archived_at, "archived_at") : null,
          };

          await store.create(memory);
          importedMemoryIdByIndex.set(index, memory.id);
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
        for (const relationItem of input.document.relations ?? []) {
          const sourceMemoryId = importedMemoryIdByIndex.get(relationItem.source_index);
          const targetMemoryId = importedMemoryIdByIndex.get(relationItem.target_index);
          if (sourceMemoryId === undefined || targetMemoryId === undefined) {
            continue;
          }
          const relation: MemoryRelationRecord = {
            id: ids.relationId(),
            sourceMemoryId,
            targetMemoryId,
            relation: relationItem.relation,
            reason: relationItem.reason ?? null,
            createdAt: parseExportDate(relationItem.created_at, "relations.created_at"),
          };
          const source = await store.findById(sourceMemoryId);
          const target = await store.findById(targetMemoryId);
          if (!source || !target) {
            continue;
          }
          await policy.assertCanRelate({
            sourceMemoryId,
            targetMemoryId,
            relation: relation.relation,
            ...(relation.reason === null ? {} : { reason: relation.reason }),
            actor: input.actor,
          }, source, target);
          const created = await store.createRelation(relation);
          if (created) {
            await auditLog.append({
              id: ids.eventId(),
              memoryId: relation.sourceMemoryId,
              eventType: "memory.relation.created",
              actor: input.actor,
              payload: {
                relationId: relation.id,
                sourceMemoryId: relation.sourceMemoryId,
                targetMemoryId: relation.targetMemoryId,
                relation: relation.relation,
                reason: relation.reason,
                imported: true,
              },
              createdAt: clock.now(),
            });
          }
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

function hashRecallQuery(query: string): string {
  return createHash("sha256").update(query, "utf8").digest("hex");
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

function storeExportRelations(
  memories: readonly MemoryRecord[],
  relations: readonly MemoryRelationRecord[],
) {
  if (relations.length === 0) {
    return [];
  }
  const memoryIndexById = new Map(memories.map((memory, index) => [memory.id, index]));
  return relations
    .map((relation) => toExportRelationItem(relation, memoryIndexById))
    .filter((relation): relation is NonNullable<typeof relation> => relation !== null);
}
