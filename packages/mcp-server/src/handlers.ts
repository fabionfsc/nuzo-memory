import type {
  MemoryKind,
  MemoryScope,
  MemoryService,
  RecallMemoryResult,
  RememberMemoryInput,
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
}

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
