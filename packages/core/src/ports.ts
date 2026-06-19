import type {
  ListMemoriesInput,
  MemoryEvent,
  MemoryRecord,
  RecallMemoriesInput,
  RecallMemoryResult,
  RememberMemoryInput,
  UpdateMemoryInput,
} from "./types.js";

export interface MemoryStore {
  create(memory: MemoryRecord): Promise<void>;
  update(memory: MemoryRecord): Promise<void>;
  findById(id: string): Promise<MemoryRecord | null>;
  list(filter: ListMemoriesInput): Promise<MemoryRecord[]>;
  archive(id: string, archivedAt: Date): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface SearchIndex {
  index(memory: MemoryRecord): Promise<void>;
  remove(memoryId: string): Promise<void>;
  search(input: RecallMemoriesInput): Promise<RecallMemoryResult[]>;
}

export interface AuditLog {
  append(event: MemoryEvent): Promise<void>;
  list(memoryId: string): Promise<MemoryEvent[]>;
}

export interface TransactionManager {
  run<T>(operation: () => Promise<T>): Promise<T>;
}

export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  memoryId(): string;
  eventId(): string;
}

export interface SecretScanner {
  scan(content: string): Promise<SecretScanResult>;
}

export interface SecretScanResult {
  ok: boolean;
  findings: SecretFinding[];
}

export interface SecretFinding {
  kind: string;
  message: string;
}

export interface PolicyEngine {
  assertCanRemember(input: RememberMemoryInput): Promise<void>;
  assertCanUpdate(input: UpdateMemoryInput, current: MemoryRecord): Promise<void>;
  assertCanRecall(input: RecallMemoriesInput): Promise<void>;
}
