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
  recordUsage?: boolean;
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

export interface ForgetMemoriesInput {
  scope?: MemoryScope;
  tags?: string[];
  all?: boolean;
  mode?: "archive" | "delete";
  confirm?: boolean;
  dryRun?: boolean;
  actor: string;
  reason?: string;
}

export interface ForgetMemoriesResult {
  matched: number;
  affected: number;
  mode: "archive" | "delete";
  dryRun: boolean;
  ids: string[];
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

export interface ExportMemoriesInput extends ListMemoriesInput {
  actor: string;
}

export interface ImportMemoriesInput {
  document: MemoryExportDocument;
  actor: string;
  scope?: MemoryScope;
  dryRun?: boolean;
}

export interface ImportMemoriesResult {
  imported: number;
  skipped: number;
  dryRun: boolean;
}

export interface MemoryExportDocument {
  format: "nuzo-memory-export";
  version: 1;
  exported_at: string;
  memories: MemoryExportItem[];
}

export interface MemoryExportItem {
  scope: MemoryScope;
  kind: MemoryKind;
  content: string;
  tags: string[];
  source: string;
  confidence: number;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
  archived_at: string | null;
}

export interface RecallMemoryResult {
  memory: MemoryRecord;
  score: number;
  reason: string;
}
