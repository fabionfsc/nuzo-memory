import type {
  AuditEventFilter,
  ListMemoriesInput,
  ListMemoryRelationsInput,
  MemoryHistoryInput,
  MemoryEvent,
  MemoryRecord,
  MemoryRelationRecord,
  MemoryScope,
  RecallMemoriesInput,
  RecallMemoriesResponse,
  RecallMemoryResult,
  RelateMemoriesInput,
  RememberMemoryInput,
  UpdateMemoryInput,
} from "./types.js";

export interface CaptureCandidateLookupInput {
  scope: MemoryScope;
  excludeMemoryId?: string;
  duplicateKey: string;
  query: string;
  tags: readonly string[];
  includeCandidates: boolean;
  candidateLimit: number;
  exhaustiveScanLimit: number;
}

export interface CaptureCandidateLookupResult {
  duplicate: MemoryRecord | null;
  candidates: MemoryRecord[];
  searchExhaustive: boolean;
}

export interface MemoryStore {
  create(memory: MemoryRecord): Promise<void>;
  update(memory: MemoryRecord, expectedRevision?: number): Promise<boolean>;
  findById(id: string): Promise<MemoryRecord | null>;
  findByIds?(ids: readonly string[]): Promise<MemoryRecord[]>;
  findCaptureCandidates?(input: CaptureCandidateLookupInput): Promise<CaptureCandidateLookupResult>;
  list(filter: ListMemoriesInput): Promise<MemoryRecord[]>;
  archive(id: string, archivedAt: Date, expectedRevision?: number): Promise<boolean>;
  delete(id: string, expectedRevision?: number): Promise<boolean>;
  createRelation(relation: MemoryRelationRecord): Promise<boolean>;
  findRelationById(id: string): Promise<MemoryRelationRecord | null>;
  listRelations(input: ListMemoryRelationsInput): Promise<MemoryRelationRecord[]>;
  listRelationsForMemoryIds(
    memoryIds: readonly string[],
    includeReverse?: boolean,
  ): Promise<MemoryRelationRecord[]>;
  deleteRelation(id: string): Promise<boolean>;
}

export interface SearchIndex {
  index(memory: MemoryRecord): Promise<void>;
  remove(memoryId: string): Promise<void>;
  search(input: RecallMemoriesInput): Promise<RecallMemoryResult[]>;
  searchDetailed?(input: RecallMemoriesInput): Promise<RecallMemoriesResponse>;
}

export interface EmbeddingProviderDescriptor {
  id: string;
  model: string;
  revision: string;
  dimensions: number;
  network: "none" | "explicit";
}

export interface EmbeddingProvider {
  readonly descriptor: EmbeddingProviderDescriptor;
  embedDocuments(texts: readonly string[]): Promise<readonly (readonly number[])[]>;
  embedQuery(text: string): Promise<readonly number[]>;
  dispose?(): Promise<void>;
}

export interface AuditLog {
  append(event: MemoryEvent): Promise<void>;
  list(memoryId: string, input?: MemoryHistoryInput): Promise<MemoryEvent[]>;
  /** Return newest-first events; cursor is an exclusive upper bound. */
  query(filter: AuditLogQuery): Promise<MemoryEvent[]>;
}

export interface AuditLogQuery extends AuditEventFilter {
  cursor?: AuditLogCursor;
}

export interface AuditLogCursor {
  createdAt: Date;
  id: string;
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
  relationId(): string;
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
  assertCanForget(input: { id: string }, current: MemoryRecord): Promise<void>;
  assertCanRecall(input: RecallMemoriesInput): Promise<void>;
  assertCanList(input: ListMemoriesInput): Promise<void>;
  assertCanRelate(input: RelateMemoriesInput, source: MemoryRecord, target: MemoryRecord): Promise<void>;
  assertCanListRelations(input: ListMemoryRelationsInput, memory: MemoryRecord): Promise<void>;
  /**
   * Optional fail-closed authorization for a deleted relation endpoint when
   * only the stable ID and event-time scope remain available.
   */
  assertCanListRelationEndpointReference?(reference: RelationEndpointReference): Promise<void>;
  assertCanAudit(input: AuditEventFilter, currentMemory?: MemoryRecord | null): Promise<void>;
}

export interface RelationEndpointReference {
  id: string;
  scope: MemoryScope;
}
