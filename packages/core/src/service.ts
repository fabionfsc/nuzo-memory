import { createHash } from "node:crypto";
import { NuzoMemoryError } from "./errors.js";
import {
  buildBoundedCaptureSuggestion,
  captureCandidateLimit,
  captureExhaustiveScanLimit,
  toCaptureDuplicateKey,
} from "./capture-suggestions.js";
import {
  assertExportDocument,
  parseExportDate,
  toExportItem,
  toExportRelationItem,
  toImportDuplicateKey,
} from "./import-export.js";
import { encodeMemoryEventCursor } from "./pagination.js";
import type {
  AuditLog,
  AuditLogCursor,
  CaptureCandidateLookupInput,
  CaptureCandidateLookupResult,
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
  ListMemoryRelationsBatchInput,
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
  RelationGovernanceCandidate,
  RelationGovernanceLifecycleState,
  RelationGovernanceReasonCode,
  RelationGovernanceReview,
  RememberMemoryInput,
  ReviewMemoryRelationsInput,
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
  relationsBatch(input: ListMemoryRelationsBatchInput): Promise<ReadonlyMap<string, MemoryRelationRecord[]>>;
  reviewRelations(input: ReviewMemoryRelationsInput): Promise<RelationGovernanceReview>;
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
  let confirmedCreateQueue: Promise<void> = Promise.resolve();

  async function runConfirmedCreate<T>(operation: () => Promise<T>): Promise<T> {
    const previous = confirmedCreateQueue;
    let release!: () => void;
    confirmedCreateQueue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await runTransaction(operation);
    } finally {
      release();
    }
  }

  async function findMemoriesByIds(memoryIds: readonly string[]): Promise<Map<string, MemoryRecord>> {
    const uniqueMemoryIds = [...new Set(memoryIds)];
    const memories = store.findByIds
      ? await store.findByIds(uniqueMemoryIds)
      : (await Promise.all(uniqueMemoryIds.map((memoryId) => store.findById(memoryId))))
          .filter((memory): memory is MemoryRecord => memory !== null);
    return new Map(memories.map((memory) => [memory.id, memory]));
  }

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

  async function validateRememberMemory(input: RememberMemoryInput): Promise<string> {
    await policy.assertCanRemember(input);
    const actor = input.actor ?? "core";
    assertActor(actor);
    return actor;
  }

  function createMemoryRecord(input: RememberMemoryInput): MemoryRecord {
    const now = clock.now();
    return {
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
  }

  async function persistMemory(memory: MemoryRecord, actor: string): Promise<void> {
    await store.create(memory);
    await searchIndex.index(memory);
    await auditLog.append({
      id: ids.eventId(),
      memoryId: memory.id,
      eventType: "memory.created",
      actor,
      payload: {
        kind: memory.kind,
        scope: memory.scope,
        tags: memory.tags,
        confidenceState: memory.confidenceState,
        provenance: memory.provenance,
        reviewAfter: memory.reviewAfter?.toISOString() ?? null,
        expiresAt: memory.expiresAt?.toISOString() ?? null,
      },
      createdAt: memory.createdAt,
    });
  }

  async function rememberMemory(input: RememberMemoryInput): Promise<MemoryRecord> {
    const actor = await validateRememberMemory(input);
    const memory = createMemoryRecord(input);
    await runTransaction(async () => {
      await persistMemory(memory, actor);
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

  async function isRelationEndpointVisible(memory: MemoryRecord): Promise<boolean> {
    try {
      await policy.assertCanListRelations({ memoryId: memory.id }, memory);
      return true;
    } catch (error) {
      if (error instanceof NuzoMemoryError && error.code === "MEMORY_SCOPE_FORBIDDEN") {
        return false;
      }
      throw error;
    }
  }

  function relationEndpointIdsFromEvent(event: MemoryEvent): string[] | null {
    if (
      event.eventType === "memory.relation.created" ||
      event.eventType === "memory.relation.deleted"
    ) {
      const { sourceMemoryId, targetMemoryId } = event.payload;
      return typeof sourceMemoryId === "string" && typeof targetMemoryId === "string"
        ? [sourceMemoryId, targetMemoryId]
        : [];
    }

    if (
      event.eventType === "memory.challenged" &&
      (
        event.payload.outcome === "superseded" ||
        typeof event.payload.supersededByMemoryId === "string" ||
        typeof event.payload.relationId === "string"
      )
    ) {
      const ids: string[] = [];
      if (event.memoryId !== null) {
        ids.push(event.memoryId);
      }
      if (typeof event.payload.supersededByMemoryId === "string") {
        ids.push(event.payload.supersededByMemoryId);
      }
      return ids.length === 2 ? ids : [];
    }

    return null;
  }

  async function isHistoricalRelationEndpointVisible(
    endpointId: string,
    scope: unknown,
    current?: MemoryRecord,
  ): Promise<boolean> {
    const historicalScope = typeof scope === "string"
      ? scope as MemoryScope
      // Invalid by construction so no public scope allowlist can authorize an
      // old event whose endpoint scope was never recorded.
      : "" as MemoryScope;
    if (current) {
      return isRelationEndpointVisible({ ...current, scope: historicalScope });
    }
    if (policy.assertCanListRelationEndpointReference === undefined) {
      return false;
    }
    try {
      await policy.assertCanListRelationEndpointReference({ id: endpointId, scope: historicalScope });
      return true;
    } catch (error) {
      if (error instanceof NuzoMemoryError && error.code === "MEMORY_SCOPE_FORBIDDEN") {
        return false;
      }
      throw error;
    }
  }

  async function isAuditEventVisible(event: MemoryEvent): Promise<boolean> {
    const endpointIds = relationEndpointIdsFromEvent(event);
    if (endpointIds === null) {
      return true;
    }
    if (endpointIds.length === 0) {
      return false;
    }

    const endpoints = new Map<string, MemoryRecord>();
    for (const endpointId of new Set(endpointIds)) {
      const endpoint = await store.findById(endpointId);
      if (!endpoint) {
        continue;
      }
      endpoints.set(endpointId, endpoint);
      if (!(await isRelationEndpointVisible(endpoint))) {
        return false;
      }
    }

    if (
      event.eventType === "memory.relation.created" ||
      event.eventType === "memory.relation.deleted"
    ) {
      const historicalEndpoints = [
        [event.payload.sourceMemoryId, event.payload.sourceScope],
        [event.payload.targetMemoryId, event.payload.targetScope],
      ] as const;
      for (const [endpointId, scope] of historicalEndpoints) {
        if (typeof endpointId !== "string") {
          return false;
        }
        if (!(await isHistoricalRelationEndpointVisible(
          endpointId,
          scope,
          endpoints.get(endpointId),
        ))) {
          return false;
        }
      }
    }

    if (event.eventType === "memory.challenged") {
      const historicalEndpoints = [
        [event.memoryId, event.payload.scope],
        [event.payload.supersededByMemoryId, event.payload.supersededByScope],
      ] as const;
      for (const [endpointId, scope] of historicalEndpoints) {
        if (typeof endpointId !== "string") {
          return false;
        }
        if (!(await isHistoricalRelationEndpointVisible(
          endpointId,
          scope,
          endpoints.get(endpointId),
        ))) {
          return false;
        }
      }
    }

    return true;
  }

  async function filterVisibleAuditEvents(events: readonly MemoryEvent[]): Promise<MemoryEvent[]> {
    const visibleEvents: MemoryEvent[] = [];
    for (const event of events) {
      if (await isAuditEventVisible(event)) {
        visibleEvents.push(event);
      }
    }
    return visibleEvents;
  }

  async function listVisibleHistory(
    memoryId: string,
    input: MemoryHistoryInput,
  ): Promise<MemoryEvent[]> {
    if (input.limit === undefined) {
      return filterVisibleAuditEvents(await auditLog.list(memoryId, input));
    }

    const visibleEvents: MemoryEvent[] = [];
    let cursor = input.cursor;
    while (visibleEvents.length < input.limit) {
      const batchLimit = Math.min(1_000, Math.max(50, input.limit - visibleEvents.length));
      const batchInput: MemoryHistoryInput = { limit: batchLimit };
      if (cursor !== undefined) {
        batchInput.cursor = cursor;
      }
      const events = await auditLog.list(memoryId, batchInput);
      if (events.length === 0) {
        break;
      }
      visibleEvents.push(...await filterVisibleAuditEvents(events));
      if (events.length < batchLimit) {
        break;
      }
      const nextCursor = encodeMemoryEventCursor(events[events.length - 1]!);
      if (nextCursor === cursor) {
        break;
      }
      cursor = nextCursor;
    }
    return visibleEvents.slice(0, input.limit);
  }

  async function queryVisibleAudit(input: AuditEventFilter): Promise<MemoryEvent[]> {
    const visibleLimit = input.limit ?? 50;
    const { limit: _limit, ...filter } = input;
    const visibleEvents: MemoryEvent[] = [];
    let cursor: AuditLogCursor | undefined;
    while (visibleEvents.length < visibleLimit) {
      const batchLimit = Math.min(1_000, Math.max(50, visibleLimit - visibleEvents.length));
      const events = await auditLog.query({
        ...filter,
        limit: batchLimit,
        ...(cursor === undefined ? {} : { cursor }),
      });
      if (events.length === 0) {
        break;
      }
      visibleEvents.push(...await filterVisibleAuditEvents(events));
      if (events.length < batchLimit) {
        break;
      }
      const lastEvent = events[events.length - 1]!;
      const nextCursor: AuditLogCursor = { createdAt: lastEvent.createdAt, id: lastEvent.id };
      if (
        nextCursor.id === cursor?.id &&
        nextCursor.createdAt.getTime() === cursor.createdAt.getTime()
      ) {
        break;
      }
      cursor = nextCursor;
    }
    return visibleEvents.slice(0, visibleLimit);
  }

  async function listRelations(input: ListMemoryRelationsInput): Promise<MemoryRelationRecord[]> {
    assertMemoryId(input.memoryId);
    const memory = await store.findById(input.memoryId);
    if (!memory) {
      throw new NuzoMemoryError("MEMORY_NOT_FOUND", "Memory was not found.", { id: input.memoryId });
    }
    await policy.assertCanListRelations(input, memory);
    const relations = await store.listRelations({
      memoryId: input.memoryId,
      includeReverse: input.includeReverse ?? true,
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
      // A relation endpoint may live in a scope the caller cannot access when a
      // store is shared across restricted sessions. Omit the relation from the
      // read result instead of failing the whole read, and never leak the
      // forbidden endpoint's id, scope, or existence. Non-authorization errors
      // still propagate.
      if (!(await isRelationEndpointVisible(source)) || !(await isRelationEndpointVisible(target))) {
        continue;
      }
      visibleRelations.push(relation);
    }
    return visibleRelations.slice(0, input.limit ?? 50);
  }

  async function listRelationsBatch(
    input: ListMemoryRelationsBatchInput,
  ): Promise<ReadonlyMap<string, MemoryRelationRecord[]>> {
    const memoryIds = [...new Set(input.memoryIds)];
    if (memoryIds.length > 200) {
      throw new NuzoMemoryError(
        "MEMORY_RELATION_BATCH_LIMIT_INVALID",
        "Relation batch size must be 0-200 memories.",
        { count: memoryIds.length, max: 200 },
      );
    }
    for (const memoryId of memoryIds) {
      assertMemoryId(memoryId);
    }
    if (memoryIds.length === 0) {
      return new Map();
    }

    const primaryMemories = await findMemoriesByIds(memoryIds);
    for (const memoryId of memoryIds) {
      const memory = primaryMemories.get(memoryId);
      if (!memory) {
        throw new NuzoMemoryError("MEMORY_NOT_FOUND", "Memory was not found.", { id: memoryId });
      }
      await policy.assertCanListRelations(
        {
          memoryId,
          ...(input.limitPerMemory === undefined ? {} : { limit: input.limitPerMemory }),
        },
        memory,
      );
    }

    const includeReverse = input.includeReverse ?? true;
    const candidates = await store.listRelationsForMemoryIds(memoryIds, includeReverse);
    const endpointIds = [...new Set(candidates.flatMap((relation) => [
      relation.sourceMemoryId,
      relation.targetMemoryId,
    ]))];
    const endpoints = await findMemoriesByIds(endpointIds);
    const visibility = new Map<string, boolean>();
    for (const memoryId of endpointIds) {
      const memory = endpoints.get(memoryId);
      visibility.set(memoryId, memory !== undefined && await isRelationEndpointVisible(memory));
    }

    const requested = new Set(memoryIds);
    const result = new Map(memoryIds.map((memoryId) => [memoryId, [] as MemoryRelationRecord[]]));
    for (const relation of candidates) {
      if (visibility.get(relation.sourceMemoryId) !== true || visibility.get(relation.targetMemoryId) !== true) {
        continue;
      }
      if (requested.has(relation.sourceMemoryId)) {
        result.get(relation.sourceMemoryId)!.push(relation);
      }
      if (includeReverse && requested.has(relation.targetMemoryId)) {
        result.get(relation.targetMemoryId)!.push(relation);
      }
    }

    const limit = input.limitPerMemory ?? 50;
    for (const [memoryId, relations] of result) {
      relations.sort((left, right) => (
        right.createdAt.getTime() - left.createdAt.getTime() || right.id.localeCompare(left.id)
      ));
      result.set(memoryId, relations.slice(0, limit));
    }
    return result;
  }

  async function reviewMemoryRelations(
    input: ReviewMemoryRelationsInput,
  ): Promise<RelationGovernanceReview> {
    const candidateLimit = input.limit ?? 50;
    if (!Number.isInteger(candidateLimit) || candidateLimit < 1 || candidateLimit > 200) {
      throw new NuzoMemoryError(
        "MEMORY_RELATION_REVIEW_LIMIT_INVALID",
        "Relation governance candidate limit must be 1-200.",
        { limit: candidateLimit },
      );
    }

    const now = clock.now();
    const primaryInput: ListMemoriesInput = {
      scope: input.scope,
      includeArchived: input.includeArchived === true,
      needsReview: input.needsReview === true,
      limit: 201,
      ...(input.needsReview === true ? { reviewDueAt: now } : {}),
    };
    const activeInput: ListMemoriesInput = {
      scope: input.scope,
      includeArchived: false,
      limit: 201,
    };
    await policy.assertCanList(primaryInput);
    await policy.assertCanList(activeInput);
    const [primaryRows, activeRows] = await Promise.all([
      store.list(primaryInput),
      store.list(activeInput),
    ]);
    const primaryMemories = primaryRows.slice(0, 200);
    const activeMemories = activeRows.slice(0, 200);
    const memoryScanTruncated = primaryRows.length > 200 || activeRows.length > 200;
    const reviewMemoriesById = new Map(
      [...primaryMemories, ...activeMemories].map((memory) => [memory.id, memory]),
    );
    const pairCandidates = new Map<string, Omit<RelationGovernanceCandidate, "state" | "existingRelations">>();

    for (const primary of primaryMemories) {
      const lookup = await findCaptureCandidates({
        scope: primary.scope,
        excludeMemoryId: primary.id,
        duplicateKey: toCaptureDuplicateKey(primary.content),
        query: primary.content,
        tags: primary.tags,
        includeCandidates: true,
        candidateLimit: captureCandidateLimit,
        exhaustiveScanLimit: captureExhaustiveScanLimit,
      });
      const suggestion = buildBoundedCaptureSuggestion({
        draft: {
          content: primary.content,
          kind: primary.kind,
          scope: primary.scope,
          tags: primary.tags,
          source: primary.source,
          confidence: primary.confidence,
          confidenceState: primary.confidenceState,
          provenance: primary.provenance,
          reviewAfter: primary.reviewAfter,
          expiresAt: primary.expiresAt,
          reason: "Read-only relation governance review.",
        },
        duplicate: lookup.duplicate,
        memories: lookup.candidates,
        searchExhaustive: lookup.searchExhaustive,
      });
      if (suggestion.relationship === undefined || suggestion.relationship === "independent") {
        continue;
      }
      for (const evidence of suggestion.relationshipEvidence?.candidates ?? []) {
        if (evidence.memory.id === primary.id) {
          continue;
        }
        reviewMemoriesById.set(evidence.memory.id, evidence.memory);
        const pairKey = relationPairKey(primary.id, evidence.memory.id);
        const reasonCodes = relationGovernanceReasonCodes(
          suggestion.relationship,
          evidence.matchedTerms.length,
          evidence.matchedTags.length,
          !suggestion.relationshipEvidence!.searchExhaustive,
        );
        const candidate = {
          primaryMemoryId: primary.id,
          primaryRevision: primary.revision,
          primaryScope: primary.scope,
          primaryLifecycle: relationGovernanceLifecycle(primary, now),
          candidateMemoryId: evidence.memory.id,
          candidateRevision: evidence.memory.revision,
          candidateScope: evidence.memory.scope,
          candidateLifecycle: relationGovernanceLifecycle(evidence.memory, now),
          relationship: suggestion.relationship,
          reasonCodes,
        } satisfies Omit<RelationGovernanceCandidate, "state" | "existingRelations">;
        const current = pairCandidates.get(pairKey);
        if (!current || relationGovernancePriority(candidate.relationship) < relationGovernancePriority(current.relationship)) {
          pairCandidates.set(pairKey, candidate);
        }
      }
    }

    const authorizedCandidates: Array<Omit<RelationGovernanceCandidate, "state" | "existingRelations">> = [];
    const visibility = new Map<string, boolean>();
    for (const candidate of pairCandidates.values()) {
      let visible = true;
      for (const memoryId of [candidate.primaryMemoryId, candidate.candidateMemoryId]) {
        if (!visibility.has(memoryId)) {
          const memory = reviewMemoriesById.get(memoryId);
          visibility.set(memoryId, memory !== undefined && await isRelationEndpointVisible(memory));
        }
        visible = visible && visibility.get(memoryId) === true;
      }
      if (visible) {
        authorizedCandidates.push(candidate);
      }
    }

    const candidateMemoryIds = [...new Set(authorizedCandidates.flatMap((candidate) => [
      candidate.primaryMemoryId,
      candidate.candidateMemoryId,
    ]))];
    const existing = await store.listRelationsForMemoryIds(candidateMemoryIds, true);
    const relationIndex = new Map<string, MemoryRelationRecord[]>();
    for (const relation of existing) {
      const pairKey = relationPairKey(relation.sourceMemoryId, relation.targetMemoryId);
      if (!pairCandidates.has(pairKey)) {
        continue;
      }
      const indexed = relationIndex.get(pairKey) ?? [];
      indexed.push(relation);
      relationIndex.set(pairKey, indexed);
    }

    const candidates = authorizedCandidates.map((candidate): RelationGovernanceCandidate => {
      const relations = (relationIndex.get(relationPairKey(
        candidate.primaryMemoryId,
        candidate.candidateMemoryId,
      )) ?? []).sort((left, right) => left.id.localeCompare(right.id));
      return {
        ...candidate,
        state: relations.length === 0 ? "unreviewed" : "already_related",
        existingRelations: relations.map((relation) => ({
          id: relation.id,
          relation: relation.relation,
          direction: relation.sourceMemoryId === candidate.primaryMemoryId ? "outgoing" : "incoming",
        })),
      };
    }).sort(compareRelationGovernanceCandidates);

    return {
      version: 1,
      mode: "read_only",
      memoryWrites: false,
      relationWrites: false,
      lifecycleWrites: false,
      auditWrites: false,
      scope: input.scope,
      includeArchived: input.includeArchived === true,
      needsReview: input.needsReview === true,
      memoryScanLimit: 200,
      candidateLimit,
      scannedMemories: activeMemories.length,
      reviewedMemories: primaryMemories.length,
      memoryScanTruncated,
      candidateResultsTruncated: candidates.length > candidateLimit,
      candidates: candidates.slice(0, candidateLimit),
    };
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
          sourceScope: source.scope,
          targetScope: target.scope,
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
      listVisibleHistory(input.id, { limit: input.historyLimit ?? 50 }),
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
          supersededByScope: supersedingMemory?.scope ?? null,
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

  async function findCaptureCandidates(
    input: CaptureCandidateLookupInput,
  ): Promise<CaptureCandidateLookupResult> {
    if (store.findCaptureCandidates !== undefined) {
      return normalizeCaptureCandidateLookup(input, await store.findCaptureCandidates(input));
    }

    const memories = (await store.list({ scope: input.scope }))
      .filter((memory) => memory.id !== input.excludeMemoryId);
    const duplicate = memories.find((memory) => (
      memory.archivedAt === null &&
      toCaptureDuplicateKey(memory.content) === input.duplicateKey
    )) ?? null;
    return {
      duplicate,
      candidates: input.includeCandidates ? memories : [],
      searchExhaustive: true,
    };
  }

  function normalizeCaptureCandidateLookup(
    input: CaptureCandidateLookupInput,
    result: CaptureCandidateLookupResult,
  ): CaptureCandidateLookupResult {
    const duplicateValid = result.duplicate === null || (
      result.duplicate.archivedAt === null &&
      result.duplicate.scope === input.scope &&
      result.duplicate.id !== input.excludeMemoryId &&
      toCaptureDuplicateKey(result.duplicate.content) === input.duplicateKey
    );
    const duplicate = duplicateValid ? result.duplicate : null;
    const authorizedCandidates = result.candidates.filter((memory) => (
      memory.archivedAt === null &&
      memory.scope === input.scope &&
      memory.id !== input.excludeMemoryId
    ));
    const resultLimit = result.searchExhaustive
      ? input.exhaustiveScanLimit
      : input.candidateLimit;
    const limitsValid = result.candidates.length <= resultLimit;
    const candidatesValid = authorizedCandidates.length === result.candidates.length;
    return {
      duplicate,
      candidates: authorizedCandidates.slice(0, resultLimit),
      searchExhaustive: result.searchExhaustive && duplicateValid && candidatesValid && limitsValid,
    };
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
      const lookup = await findCaptureCandidates({
        scope: draft.scope,
        duplicateKey,
        query: draft.content,
        tags: draft.tags,
        includeCandidates: input.relationshipMode === "bounded",
        candidateLimit: captureCandidateLimit,
        exhaustiveScanLimit: captureExhaustiveScanLimit,
      });

      if (input.relationshipMode === "bounded") {
        return buildBoundedCaptureSuggestion({
          draft,
          duplicate: lookup.duplicate,
          memories: lookup.candidates,
          searchExhaustive: lookup.searchExhaustive,
        });
      }

      return {
        status: lookup.duplicate ? "duplicate" : "ready",
        memoryWrites: false,
        requiresConfirmation: true,
        draft,
        duplicate: lookup.duplicate,
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
        const rememberInput: RememberMemoryInput = {
          content: input.content,
          kind: input.kind,
          scope: input.scope,
          tags: input.tags ?? [],
          source: input.source,
          actor: input.actor,
          confidenceState: input.confidenceState ?? "user_confirmed",
          provenance: input.provenance ?? null,
          reviewAfter: input.reviewAfter ?? null,
          expiresAt: input.expiresAt ?? null,
        };
        if (input.confidence !== undefined) {
          rememberInput.confidence = input.confidence;
        }
        if (input.decision === "create") {
          const actor = await validateRememberMemory(rememberInput);
          const result = await runConfirmedCreate(async () => {
            const duplicateKey = toCaptureDuplicateKey(input.content);
            const duplicate = (await findCaptureCandidates({
              scope: input.scope,
              duplicateKey,
              query: input.content,
              tags: input.tags ?? [],
              includeCandidates: false,
              candidateLimit: captureCandidateLimit,
              exhaustiveScanLimit: captureExhaustiveScanLimit,
            })).duplicate;
            if (duplicate) {
              return { duplicate, memory: null };
            }
            const memory = createMemoryRecord(rememberInput);
            await persistMemory(memory, actor);
            return { duplicate: null, memory };
          });
          if (result.duplicate) {
            return {
              decision: input.decision,
              status: "skipped",
              memoryWrites: false,
              memory: result.duplicate,
              requiresConfirmation: false,
              reason: input.reason.trim(),
            };
          }
          return {
            decision: input.decision,
            status: "created",
            memoryWrites: true,
            memory: result.memory,
            requiresConfirmation: false,
            reason: input.reason.trim(),
          };
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

    async relationsBatch(input) {
      return listRelationsBatch(input);
    },

    async reviewRelations(input) {
      return reviewMemoryRelations(input);
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
      return listVisibleHistory(memoryId, input);
    },

    async audit(input = {}) {
      if (input.memoryId !== undefined) {
        assertMemoryId(input.memoryId);
      }
      const currentMemory = input.memoryId === undefined
        ? undefined
        : await store.findById(input.memoryId);
      await policy.assertCanAudit(input, currentMemory);
      return queryVisibleAudit(input);
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
                sourceScope: source.scope,
                targetScope: target.scope,
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

function relationPairKey(leftMemoryId: string, rightMemoryId: string): string {
  return leftMemoryId < rightMemoryId
    ? `${leftMemoryId}\u0000${rightMemoryId}`
    : `${rightMemoryId}\u0000${leftMemoryId}`;
}

function relationGovernanceReasonCodes(
  relationship: Exclude<RelationGovernanceCandidate["relationship"], "independent">,
  matchedTermCount: number,
  matchedTagCount: number,
  scanTruncated: boolean,
): RelationGovernanceReasonCode[] {
  const codes: RelationGovernanceReasonCode[] = [];
  if (relationship === "exact_duplicate") codes.push("exact_normalized_content");
  if (relationship === "update_candidate") codes.push("possible_revision");
  if (relationship === "related") codes.push("shared_subject");
  if (relationship === "uncertain") codes.push("classification_uncertain");
  if (matchedTagCount > 0) codes.push("shared_tags");
  if (matchedTermCount > 0) codes.push("shared_terms");
  if (scanTruncated) codes.push("candidate_scan_truncated");
  return codes;
}

function relationGovernanceLifecycle(
  memory: MemoryRecord,
  now: Date,
): RelationGovernanceLifecycleState {
  if (memory.archivedAt !== null) return "archived";
  if (memory.expiresAt !== null && memory.expiresAt <= now) return "expired";
  if (
    memory.confidenceState === "needs_review" ||
    (memory.reviewAfter !== null && memory.reviewAfter <= now)
  ) return "review_due";
  return "active";
}

function relationGovernancePriority(
  relationship: RelationGovernanceCandidate["relationship"],
): number {
  return {
    exact_duplicate: 0,
    update_candidate: 1,
    related: 2,
    uncertain: 3,
  }[relationship];
}

function compareRelationGovernanceCandidates(
  left: RelationGovernanceCandidate,
  right: RelationGovernanceCandidate,
): number {
  return Number(left.state === "already_related") - Number(right.state === "already_related") ||
    relationGovernancePriority(left.relationship) - relationGovernancePriority(right.relationship) ||
    left.primaryMemoryId.localeCompare(right.primaryMemoryId) ||
    left.candidateMemoryId.localeCompare(right.candidateMemoryId);
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
