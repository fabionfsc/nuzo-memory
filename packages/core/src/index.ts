export type MemoryKind =
  | "preference"
  | "project_decision"
  | "fact"
  | "instruction"
  | "note";

export type MemoryScope =
  | `user:${string}`
  | `project:${string}`
  | `agent:${string}`
  | `team:${string}`;

export interface MemoryRecord {
  id: string;
  scope: MemoryScope;
  kind: MemoryKind;
  content: string;
  tags: string[];
  source: string;
  confidence: number;
  createdAt: Date;
  updatedAt: Date;
  lastUsedAt: Date | null;
  archivedAt: Date | null;
}

export interface MemoryEvent {
  id: string;
  memoryId: string | null;
  eventType:
    | "memory.created"
    | "memory.updated"
    | "memory.archived"
    | "memory.deleted"
    | "memory.imported"
    | "memory.exported"
    | "memory.recalled";
  actor: string;
  payload: Record<string, unknown>;
  createdAt: Date;
}

export interface RememberMemoryInput {
  content: string;
  kind: MemoryKind;
  scope: MemoryScope;
  tags?: string[];
  source: string;
  confidence?: number;
}

export interface RecallMemoriesInput {
  query: string;
  scope: MemoryScope;
  limit?: number;
  includeGlobal?: boolean;
}

export interface RecallMemoryResult {
  memory: MemoryRecord;
  score: number;
  reason: string;
}

export interface MemoryStore {
  create(memory: MemoryRecord): Promise<void>;
  update(memory: MemoryRecord): Promise<void>;
  findById(id: string): Promise<MemoryRecord | null>;
  list(filter: MemoryListFilter): Promise<MemoryRecord[]>;
  archive(id: string, archivedAt: Date): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface MemoryListFilter {
  scope?: MemoryScope;
  tags?: string[];
  includeArchived?: boolean;
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
  assertCanRecall(input: RecallMemoriesInput): Promise<void>;
}
