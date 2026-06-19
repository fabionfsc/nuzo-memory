import type { AuditLog, Clock, IdGenerator, MemoryStore, SearchIndex } from "../ports.js";
import type {
  ListMemoriesInput,
  MemoryEvent,
  MemoryRecord,
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

  memoryId(): string {
    this.memoryCounter += 1;
    return `mem_${String(this.memoryCounter).padStart(6, "0")}`;
  }

  eventId(): string {
    this.eventCounter += 1;
    return `evt_${String(this.eventCounter).padStart(6, "0")}`;
  }
}

export class InMemoryStore implements MemoryStore {
  private readonly memories = new Map<string, MemoryRecord>();

  async create(memory: MemoryRecord): Promise<void> {
    this.memories.set(memory.id, cloneMemory(memory));
  }

  async update(memory: MemoryRecord): Promise<void> {
    this.memories.set(memory.id, cloneMemory(memory));
  }

  async findById(id: string): Promise<MemoryRecord | null> {
    const memory = this.memories.get(id);
    return memory ? cloneMemory(memory) : null;
  }

  async list(filter: ListMemoriesInput): Promise<MemoryRecord[]> {
    return [...this.memories.values()]
      .filter((memory) => filter.includeArchived === true || memory.archivedAt === null)
      .filter((memory) => !filter.scope || memory.scope === filter.scope)
      .filter((memory) => !filter.tags || filter.tags.every((tag) => memory.tags.includes(tag)))
      .map(cloneMemory);
  }

  async archive(id: string, archivedAt: Date): Promise<void> {
    const memory = this.memories.get(id);
    if (memory) {
      this.memories.set(id, cloneMemory({ ...memory, archivedAt }));
    }
  }

  async delete(id: string): Promise<void> {
    this.memories.delete(id);
  }
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
        const haystack = `${memory.content} ${memory.tags.join(" ")}`.toLowerCase();
        const matches = terms.filter((term) => haystack.includes(term));
        return {
          memory: cloneMemory(memory),
          score: matches.length / Math.max(terms.length, 1),
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

  async list(memoryId: string): Promise<MemoryEvent[]> {
    return this.events.filter((event) => event.memoryId === memoryId).map(cloneEvent);
  }
}

function cloneMemory(memory: MemoryRecord): MemoryRecord {
  return {
    ...memory,
    tags: [...memory.tags],
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
