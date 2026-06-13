export type MemoryKind =
  | "preference"
  | "project_decision"
  | "fact"
  | "instruction"
  | "note";

export const memoryKinds = [
  "preference",
  "project_decision",
  "fact",
  "instruction",
  "note",
] as const satisfies readonly MemoryKind[];

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

export interface ListMemoriesInput {
  scope?: MemoryScope;
  tags?: string[];
  includeArchived?: boolean;
}

export interface ForgetMemoryInput {
  id: string;
  mode?: "archive" | "delete";
  confirm?: boolean;
  actor: string;
  reason?: string;
}

export interface UpdateMemoryInput {
  id: string;
  content?: string;
  kind?: MemoryKind;
  scope?: MemoryScope;
  tags?: string[];
  confidence?: number;
  actor: string;
}

export interface RecallMemoryResult {
  memory: MemoryRecord;
  score: number;
  reason: string;
}
