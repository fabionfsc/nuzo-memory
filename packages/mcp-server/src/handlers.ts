import type {
  ForgetMemoryInput,
  ForgetMemoriesInput,
  ImportMemoriesInput,
  ListMemoriesInput,
  MemoryExportDocument,
  MemoryKind,
  MemoryRecord,
  MemoryScope,
  MemoryService,
  RecallMemoryResult,
  RememberMemoryInput,
  UpdateMemoryInput,
} from "@nuzo/memory-core";

export interface RememberToolInput {
  content: string;
  kind: MemoryKind;
  scope: string;
  tags: string[];
  source: string;
  confidence?: number;
}

export interface RecallToolInput {
  query: string;
  scope: string;
  limit: number;
  include_global: boolean;
}

export interface RecallHookToolInput {
  task_context: string;
  project_scope?: string;
  limit?: number;
}

export interface ListToolInput {
  scope?: string;
  tags: string[];
  include_archived: boolean;
}

export interface UpdateToolInput {
  id: string;
  content?: string;
  kind?: MemoryKind;
  scope?: string;
  tags?: string[];
  confidence?: number;
}

export interface HistoryToolInput {
  id: string;
}

export interface ForgetToolInput {
  id: string;
  mode: "archive" | "delete";
  confirm: boolean;
  reason?: string;
}

export interface ForgetManyToolInput {
  scope?: string;
  tags: string[];
  all: boolean;
  mode: "archive" | "delete";
  confirm: boolean;
  dry_run: boolean;
  reason?: string;
}

export interface ExportToolInput {
  scope?: string;
  tags: string[];
  include_archived: boolean;
}

export interface ImportToolInput {
  document: MemoryExportDocument;
  scope?: string;
  dry_run: boolean;
}

export interface MemoryToolHandlerOptions {
  storePath?: string;
}

export interface MemoryToolHandlers {
  remember(input: RememberToolInput): Promise<{
    id: string;
    created: true;
    warnings: string[];
  }>;
  recall(input: RecallToolInput): Promise<{
    results: Array<{
      id: string;
      content: string;
      kind: MemoryKind;
      scope: MemoryScope;
      tags: string[];
      score: number;
      reason: string;
    }>;
  }>;
  recallHook(input: RecallHookToolInput): Promise<{
    mode: "read_only";
    memory_writes: false;
    capture_suggestions: false;
    query: string;
    scope: MemoryScope;
    include_global: true;
    limit: number;
    results: Array<{
      id: string;
      content: string;
      kind: MemoryKind;
      scope: MemoryScope;
      tags: string[];
      score: number;
      reason: string;
    }>;
  }>;
  list(input: ListToolInput): Promise<{
    memories: MemoryToolRecord[];
  }>;
  update(input: UpdateToolInput): Promise<{
    memory: MemoryToolRecord;
  }>;
  history(input: HistoryToolInput): Promise<{
    events: MemoryToolEvent[];
  }>;
  forget(input: ForgetToolInput): Promise<{
    id: string;
    forgotten: true;
    mode: "archive" | "delete";
  }>;
  forgetMany(input: ForgetManyToolInput): Promise<{
    matched: number;
    affected: number;
    mode: "archive" | "delete";
    dry_run: boolean;
    ids: string[];
  }>;
  exportMemories(input: ExportToolInput): Promise<MemoryExportDocument>;
  importMemories(input: ImportToolInput): Promise<{
    imported: number;
    skipped: number;
    dry_run: boolean;
  }>;
  doctor(): Promise<{
    ok: boolean;
    network: "disabled";
    store: {
      path: string | null;
      readable: boolean;
      writable_check: "not_performed";
    };
    counts: {
      active_memories: number | null;
      archived_memories: number | null;
      total_memories: number | null;
    };
    tools: string[];
    warnings: string[];
  }>;
}

export type MemoryToolRecord = {
  id: string;
  content: string;
  kind: MemoryKind;
  scope: MemoryScope;
  tags: string[];
  source: string;
  confidence: number;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
  archived_at: string | null;
};

export type MemoryToolEvent = {
  id: string;
  memory_id: string | null;
  event_type: string;
  actor: string;
  payload: Record<string, unknown>;
  created_at: string;
};

export function createMemoryToolHandlers(
  service: MemoryService,
  options: MemoryToolHandlerOptions = {},
): MemoryToolHandlers {
  return {
    async remember(input) {
      const rememberInput: RememberMemoryInput = {
        content: input.content,
        kind: input.kind,
        scope: input.scope as MemoryScope,
        tags: input.tags,
        source: input.source,
      };
      if (input.confidence !== undefined) {
        rememberInput.confidence = input.confidence;
      }

      const memory = await service.remember(rememberInput);

      return {
        id: memory.id,
        created: true,
        warnings: [],
      };
    },

    async recall(input) {
      const results = await service.recall({
        query: input.query,
        scope: input.scope as MemoryScope,
        limit: input.limit,
        includeGlobal: input.include_global,
      });

      return {
        results: results.map(toRecallOutput),
      };
    },

    async recallHook(input) {
      const query = buildRecallHookQuery(input.task_context);
      const limit = clampRecallHookLimit(input.limit);
      const scope = (input.project_scope ?? "project:auto") as MemoryScope;
      const results = await service.recall({
        query,
        scope,
        limit,
        includeGlobal: true,
        recordUsage: false,
      });

      return {
        mode: "read_only",
        memory_writes: false,
        capture_suggestions: false,
        query,
        scope,
        include_global: true,
        limit,
        results: results.map(toRecallOutput),
      };
    },

    async list(input) {
      const listInput: ListMemoriesInput = {
        includeArchived: input.include_archived,
      };
      if (input.scope !== undefined) {
        listInput.scope = input.scope as MemoryScope;
      }
      if (input.tags.length > 0) {
        listInput.tags = input.tags;
      }

      const memories = await service.list(listInput);
      return {
        memories: memories.map(toToolRecord),
      };
    },

    async update(input) {
      const updateInput: UpdateMemoryInput = {
        id: input.id,
        actor: "nuzo:mcp",
      };
      if (input.content !== undefined) {
        updateInput.content = input.content;
      }
      if (input.kind !== undefined) {
        updateInput.kind = input.kind;
      }
      if (input.scope !== undefined) {
        updateInput.scope = input.scope as MemoryScope;
      }
      if (input.tags !== undefined) {
        updateInput.tags = input.tags;
      }
      if (input.confidence !== undefined) {
        updateInput.confidence = input.confidence;
      }

      const memory = await service.update(updateInput);
      return {
        memory: toToolRecord(memory),
      };
    },

    async history(input) {
      const events = await service.history(input.id);
      return {
        events: events.map((event) => ({
          id: event.id,
          memory_id: event.memoryId,
          event_type: event.eventType,
          actor: event.actor,
          payload: event.payload,
          created_at: event.createdAt.toISOString(),
        })),
      };
    },

    async forget(input) {
      const forgetInput: ForgetMemoryInput = {
        id: input.id,
        mode: input.mode,
        confirm: input.confirm,
        actor: "nuzo:mcp",
      };
      if (input.reason !== undefined) {
        forgetInput.reason = input.reason;
      }

      await service.forget(forgetInput);
      return {
        id: input.id,
        forgotten: true,
        mode: input.mode,
      };
    },

    async forgetMany(input) {
      const forgetInput: ForgetMemoriesInput = {
        tags: input.tags,
        all: input.all,
        mode: input.mode,
        confirm: input.confirm,
        dryRun: input.dry_run,
        actor: "nuzo:mcp",
      };
      if (input.scope !== undefined) {
        forgetInput.scope = input.scope as MemoryScope;
      }
      if (input.reason !== undefined) {
        forgetInput.reason = input.reason;
      }

      const result = await service.forgetMany(forgetInput);
      return {
        matched: result.matched,
        affected: result.affected,
        mode: result.mode,
        dry_run: result.dryRun,
        ids: result.ids,
      };
    },

    async exportMemories(input) {
      const exportInput: ListMemoriesInput & { actor: string } = {
        actor: "nuzo:mcp",
        includeArchived: input.include_archived,
      };
      if (input.scope !== undefined) {
        exportInput.scope = input.scope as MemoryScope;
      }
      if (input.tags.length > 0) {
        exportInput.tags = input.tags;
      }

      return service.exportMemories(exportInput);
    },

    async importMemories(input) {
      const importInput: ImportMemoriesInput = {
        document: input.document,
        actor: "nuzo:mcp",
        dryRun: input.dry_run,
      };
      if (input.scope !== undefined) {
        importInput.scope = input.scope as MemoryScope;
      }

      const result = await service.importMemories(importInput);
      return {
        imported: result.imported,
        skipped: result.skipped,
        dry_run: result.dryRun,
      };
    },

    async doctor() {
      const warnings: string[] = [];
      let activeMemories: number | null = null;
      let archivedMemories: number | null = null;
      let totalMemories: number | null = null;
      let readable = false;

      try {
        const [active, all] = await Promise.all([
          service.list({ includeArchived: false }),
          service.list({ includeArchived: true }),
        ]);
        activeMemories = active.length;
        totalMemories = all.length;
        archivedMemories = Math.max(totalMemories - activeMemories, 0);
        readable = true;
      } catch (error) {
        warnings.push(`memory store read check failed: ${formatDoctorError(error)}`);
      }

      return {
        ok: warnings.length === 0,
        network: "disabled",
        store: {
          path: options.storePath ?? null,
          readable,
          writable_check: "not_performed",
        },
        counts: {
          active_memories: activeMemories,
          archived_memories: archivedMemories,
          total_memories: totalMemories,
        },
        tools: [
          "memory.remember",
          "memory.recall",
          "memory.recall_hook",
          "memory.list",
          "memory.update",
          "memory.history",
          "memory.forget",
          "memory.forget_many",
          "memory.export",
          "memory.import",
          "memory.doctor",
        ],
        warnings,
      };
    },
  };
}

function formatDoctorError(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }
  return "unknown error";
}

function buildRecallHookQuery(taskContext: string): string {
  return taskContext.trim().replace(/\s+/g, " ").slice(0, 500);
}

function clampRecallHookLimit(limit: number | undefined): number {
  if (limit === undefined) {
    return 5;
  }
  return Math.min(Math.max(Math.trunc(limit), 1), 8);
}

function toRecallOutput(result: RecallMemoryResult) {
  return {
    id: result.memory.id,
    content: result.memory.content,
    kind: result.memory.kind,
    scope: result.memory.scope,
    tags: result.memory.tags,
    score: result.score,
    reason: result.reason,
  };
}

function toToolRecord(memory: MemoryRecord): MemoryToolRecord {
  return {
    id: memory.id,
    content: memory.content,
    kind: memory.kind,
    scope: memory.scope,
    tags: memory.tags,
    source: memory.source,
    confidence: memory.confidence,
    created_at: memory.createdAt.toISOString(),
    updated_at: memory.updatedAt.toISOString(),
    last_used_at: memory.lastUsedAt?.toISOString() ?? null,
    archived_at: memory.archivedAt?.toISOString() ?? null,
  };
}
