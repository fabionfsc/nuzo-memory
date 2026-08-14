import { toCaptureDuplicateKey } from "../capture-suggestions.js";
import type {
  AuditLog,
  AuditLogQuery,
  CaptureCandidateLookupInput,
  CaptureCandidateLookupResult,
  Clock,
  IdGenerator,
  MemoryStore,
  SearchIndex,
} from "../ports.js";
import { decodeMemoryEventCursor, decodeMemoryListCursor } from "../pagination.js";
import type {
  ListMemoriesInput,
  ListMemoryRelationsInput,
  MemoryHistoryInput,
  MemoryEvent,
  MemoryRecord,
  MemoryRelationRecord,
  RecallMemoriesInput,
  RecallMemoryResult,
} from "../types.js";

export class FixedClock implements Clock {
  constructor(private current: Date = new Date("2026-06-12T00:00:00.000Z")) {}

  now(): Date {
    return new Date(this.current);
  }

  set(date: Date): void {
    this.current = new Date(date);
  }
}

export class SequentialIdGenerator implements IdGenerator {
  private memoryCounter = 0;
  private eventCounter = 0;
  private relationCounter = 0;

  memoryId(): string {
    this.memoryCounter += 1;
    return `mem_${String(this.memoryCounter).padStart(6, "0")}`;
  }

  eventId(): string {
    this.eventCounter += 1;
    return `evt_${String(this.eventCounter).padStart(6, "0")}`;
  }

  relationId(): string {
    this.relationCounter += 1;
    return `rel_${String(this.relationCounter).padStart(6, "0")}`;
  }
}

export class InMemoryStore implements MemoryStore {
  private readonly memories = new Map<string, MemoryRecord>();
  private readonly relations = new Map<string, MemoryRelationRecord>();

  async create(memory: MemoryRecord): Promise<void> {
    this.memories.set(memory.id, cloneMemory(memory));
  }

  async update(memory: MemoryRecord, expectedRevision?: number): Promise<boolean> {
    const current = this.memories.get(memory.id);
    if (expectedRevision !== undefined && current?.revision !== expectedRevision) {
      return false;
    }
    this.memories.set(memory.id, cloneMemory(memory));
    return true;
  }

  async findById(id: string): Promise<MemoryRecord | null> {
    const memory = this.memories.get(id);
    return memory ? cloneMemory(memory) : null;
  }

  async findByIds(ids: readonly string[]): Promise<MemoryRecord[]> {
    return [...new Set(ids)]
      .map((id) => this.memories.get(id))
      .filter((memory): memory is MemoryRecord => memory !== undefined)
      .map(cloneMemory);
  }

  async findCaptureCandidates(input: CaptureCandidateLookupInput): Promise<CaptureCandidateLookupResult> {
    const active = [...this.memories.values()]
      .filter((memory) => (
        memory.archivedAt === null &&
        memory.scope === input.scope &&
        memory.id !== input.excludeMemoryId
      ))
      .sort((left, right) => left.id.localeCompare(right.id));
    const duplicate = active.find((memory) => toCaptureDuplicateKey(memory.content) === input.duplicateKey) ?? null;
    if (!input.includeCandidates || duplicate !== null) {
      return { duplicate: duplicate ? cloneMemory(duplicate) : null, candidates: [], searchExhaustive: true };
    }
    if (active.length <= input.exhaustiveScanLimit) {
      return { duplicate: null, candidates: active.map(cloneMemory), searchExhaustive: true };
    }

    const queryTerms = captureLookupTerms(`${input.query} ${input.tags.join(" ")}`);
    const candidates = active
      .map((memory) => ({
        memory,
        score: captureLookupOverlap(queryTerms, `${memory.content} ${memory.tags.join(" ")}`),
      }))
      .filter((candidate) => candidate.score > 0)
      .sort((left, right) => right.score - left.score || left.memory.id.localeCompare(right.memory.id))
      .slice(0, input.candidateLimit)
      .map((candidate) => cloneMemory(candidate.memory));
    return { duplicate: null, candidates, searchExhaustive: false };
  }

  async list(filter: ListMemoriesInput): Promise<MemoryRecord[]> {
    return [...this.memories.values()]
      .filter((memory) => filter.includeArchived === true || memory.archivedAt === null)
      .filter((memory) => !filter.scope || memory.scope === filter.scope)
      .filter((memory) => !filter.tags || filter.tags.every((tag) => memory.tags.includes(tag)))
      .filter((memory) => {
        if (filter.needsReview !== true) {
          return true;
        }
        const dueAt = filter.reviewDueAt ?? new Date();
        return (memory.reviewAfter !== null && memory.reviewAfter <= dueAt) ||
          (memory.expiresAt !== null && memory.expiresAt <= dueAt);
      })
      .sort((left, right) =>
        right.updatedAt.getTime() - left.updatedAt.getTime() ||
        right.createdAt.getTime() - left.createdAt.getTime() ||
        right.id.localeCompare(left.id))
      .filter((memory) => {
        if (filter.cursor === undefined) {
          return true;
        }
        const cursor = decodeMemoryListCursor(filter.cursor);
        const updatedAt = memory.updatedAt.toISOString();
        const createdAt = memory.createdAt.toISOString();
        return updatedAt < cursor.updated_at ||
          (updatedAt === cursor.updated_at && createdAt < cursor.created_at) ||
          (updatedAt === cursor.updated_at && createdAt === cursor.created_at && memory.id < cursor.id);
      })
      .slice(0, filter.limit)
      .map(cloneMemory);
  }

  async archive(id: string, archivedAt: Date, expectedRevision?: number): Promise<boolean> {
    const memory = this.memories.get(id);
    if (!memory) {
      return false;
    }
    if (expectedRevision !== undefined && memory.revision !== expectedRevision) {
      return false;
    }
    this.memories.set(id, cloneMemory({ ...memory, revision: memory.revision + 1, updatedAt: archivedAt, archivedAt }));
    return true;
  }

  async delete(id: string, expectedRevision?: number): Promise<boolean> {
    const memory = this.memories.get(id);
    if (!memory) {
      return false;
    }
    if (expectedRevision !== undefined && memory.revision !== expectedRevision) {
      return false;
    }
    const deleted = this.memories.delete(id);
    if (deleted) {
      for (const relation of this.relations.values()) {
        if (relation.sourceMemoryId === id || relation.targetMemoryId === id) {
          this.relations.delete(relation.id);
        }
      }
    }
    return deleted;
  }

  async createRelation(relation: MemoryRelationRecord): Promise<boolean> {
    const duplicate = [...this.relations.values()].some((current) =>
      current.sourceMemoryId === relation.sourceMemoryId &&
      current.targetMemoryId === relation.targetMemoryId &&
      current.relation === relation.relation
    );
    if (duplicate) {
      return false;
    }
    this.relations.set(relation.id, cloneRelation(relation));
    return true;
  }

  async findRelationById(id: string): Promise<MemoryRelationRecord | null> {
    const relation = this.relations.get(id);
    return relation ? cloneRelation(relation) : null;
  }

  async listRelations(input: ListMemoryRelationsInput): Promise<MemoryRelationRecord[]> {
    return [...this.relations.values()]
      .filter((relation) =>
        relation.sourceMemoryId === input.memoryId ||
        (input.includeReverse !== false && relation.targetMemoryId === input.memoryId)
      )
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime() || right.id.localeCompare(left.id))
      .slice(0, input.limit)
      .map(cloneRelation);
  }

  async listRelationsForMemoryIds(
    memoryIds: readonly string[],
    includeReverse = true,
  ): Promise<MemoryRelationRecord[]> {
    const memoryIdSet = new Set(memoryIds);
    return [...this.relations.values()]
      .filter((relation) => memoryIdSet.has(relation.sourceMemoryId) || (
        includeReverse && memoryIdSet.has(relation.targetMemoryId)
      ))
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime() || left.id.localeCompare(right.id))
      .map(cloneRelation);
  }

  async deleteRelation(id: string): Promise<boolean> {
    return this.relations.delete(id);
  }
}

function captureLookupTerms(value: string): Set<string> {
  return new Set(value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}_]+/u)
    .filter((term) => term.length > 1));
}

function captureLookupOverlap(queryTerms: ReadonlySet<string>, value: string): number {
  const candidateTerms = captureLookupTerms(value);
  return [...queryTerms].filter((term) => candidateTerms.has(term)).length;
}

export class InMemorySearchIndex implements SearchIndex {
  private readonly indexed = new Map<string, MemoryRecord>();

  async index(memory: MemoryRecord): Promise<void> {
    this.indexed.set(memory.id, cloneMemory(memory));
  }

  async remove(memoryId: string): Promise<void> {
    this.indexed.delete(memoryId);
  }

  async search(input: RecallMemoriesInput): Promise<RecallMemoryResult[]> {
    const terms = input.query
      .toLowerCase()
      .split(/[^\p{L}\p{N}_]+/u)
      .filter(Boolean);

    return [...this.indexed.values()]
      .filter((memory) => memory.archivedAt === null)
      .filter(
        (memory) =>
          memory.scope === input.scope || (input.includeGlobal === true && memory.scope === "user:default"),
      )
      .map((memory) => {
        const content = memory.content.toLowerCase();
        const tags = memory.tags.join(" ").toLowerCase();
        const contentMatches = terms.filter((term) => content.includes(term));
        const tagMatches = terms.filter((term) => tags.includes(term));
        const exactTagMatches = memory.tags.filter((tag) => {
          const tagTerms = [tag, ...tag.split(/[._-]+/u)];
          return tagTerms.some((tagTerm) => terms.includes(tagTerm));
        });
        const matches = [...new Set([...contentMatches, ...tagMatches])];
        return {
          memory: cloneMemory(memory),
          score: (
            contentMatches.length +
            tagMatches.length * 5 +
            exactTagMatches.length * 1_000
          ) / Math.max(terms.length, 1),
          reason: matches.length > 0 ? `Matched terms: ${matches.join(", ")}` : "No term match.",
        };
      })
      .filter((result) => result.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, input.limit ?? 8);
  }
}

export class InMemoryAuditLog implements AuditLog {
  private readonly events: MemoryEvent[] = [];

  async append(event: MemoryEvent): Promise<void> {
    this.events.push(cloneEvent(event));
  }

  async list(memoryId: string, input: MemoryHistoryInput = {}): Promise<MemoryEvent[]> {
    return this.events
      .filter((event) => event.memoryId === memoryId)
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime() || left.id.localeCompare(right.id))
      .filter((event) => {
        if (input.cursor === undefined) {
          return true;
        }
        const cursor = decodeMemoryEventCursor(input.cursor);
        const createdAt = event.createdAt.toISOString();
        return createdAt > cursor.created_at || (createdAt === cursor.created_at && event.id > cursor.id);
      })
      .slice(0, input.limit)
      .map(cloneEvent);
  }

  async query(filter: AuditLogQuery): Promise<MemoryEvent[]> {
    const limit = filter.limit ?? 50;
    return this.events
      .filter((event) => filter.memoryId === undefined || event.memoryId === filter.memoryId)
      .filter((event) => filter.eventTypes === undefined || filter.eventTypes.includes(event.eventType))
      .filter((event) => filter.actor === undefined || event.actor === filter.actor)
      .filter((event) => filter.scope === undefined || eventPayloadScopeMatches(event, filter.scope))
      .filter((event) => filter.since === undefined || event.createdAt >= filter.since)
      .filter((event) => filter.until === undefined || event.createdAt <= filter.until)
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime() || right.id.localeCompare(left.id))
      .filter((event) => {
        if (filter.cursor === undefined) {
          return true;
        }
        const cursor = filter.cursor;
        const createdAt = event.createdAt.toISOString();
        const cursorCreatedAt = cursor.createdAt.toISOString();
        return createdAt < cursorCreatedAt || (createdAt === cursorCreatedAt && event.id < cursor.id);
      })
      .slice(0, limit)
      .map(cloneEvent);
  }
}

function eventPayloadScopeMatches(event: MemoryEvent, scope: string): boolean {
  return event.payload.scope === scope || event.payload.originalScope === scope;
}

function cloneMemory(memory: MemoryRecord): MemoryRecord {
  return {
    ...memory,
    tags: [...memory.tags],
    confidenceState: memory.confidenceState,
    provenance: memory.provenance === null ? null : { ...memory.provenance },
    reviewAfter: memory.reviewAfter ? new Date(memory.reviewAfter) : null,
    expiresAt: memory.expiresAt ? new Date(memory.expiresAt) : null,
    createdAt: new Date(memory.createdAt),
    updatedAt: new Date(memory.updatedAt),
    lastUsedAt: memory.lastUsedAt ? new Date(memory.lastUsedAt) : null,
    archivedAt: memory.archivedAt ? new Date(memory.archivedAt) : null,
  };
}

function cloneEvent(event: MemoryEvent): MemoryEvent {
  return {
    ...event,
    payload: { ...event.payload },
    createdAt: new Date(event.createdAt),
  };
}

function cloneRelation(relation: MemoryRelationRecord): MemoryRelationRecord {
  return {
    ...relation,
    createdAt: new Date(relation.createdAt),
  };
}
