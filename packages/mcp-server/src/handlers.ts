import type {
  ForgetMemoryInput,
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

export interface ForgetToolInput {
  id: string;
  mode: "archive" | "delete";
  confirm: boolean;
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
  list(input: ListToolInput): Promise<{
    memories: MemoryToolRecord[];
  }>;
  update(input: UpdateToolInput): Promise<{
    memory: MemoryToolRecord;
  }>;
  forget(input: ForgetToolInput): Promise<{
    id: string;
    forgotten: true;
    mode: "archive" | "delete";
  }>;
  exportMemories(input: ExportToolInput): Promise<MemoryExportDocument>;
  importMemories(input: ImportToolInput): Promise<{
    imported: number;
    skipped: number;
    dry_run: boolean;
  }>;
  doctor(): Promise<{
    ok: true;
    network: "disabled";
    tools: string[];
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

export function createMemoryToolHandlers(service: MemoryService): MemoryToolHandlers {
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
      return {
        ok: true,
        network: "disabled",
        tools: [
          "memory.remember",
          "memory.recall",
          "memory.list",
          "memory.update",
          "memory.forget",
          "memory.export",
          "memory.import",
          "memory.doctor",
        ],
      };
    },
  };
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
