import type {
  CaptureSuggestionDraft,
  MemoryRecord,
  MemoryScope,
  RecallMemoryResult,
} from "@nuzo/memory-core";
import type {
  CaptureSuggestionToolDraft,
  MemoryToolEvent,
  MemoryToolRecord,
} from "./handlers.js";

export function buildRecallHookQuery(taskContext: string): string {
  return taskContext.trim().replace(/\s+/g, " ").slice(0, 500);
}

export function clampRecallHookLimit(limit: number | undefined): number {
  if (limit === undefined) {
    return 5;
  }
  return Math.min(Math.max(Math.trunc(limit), 1), 8);
}

export function resolveToolScope(
  scope: string,
  projectScope: `project:${string}` | undefined,
): MemoryScope {
  if (scope === "project:auto" && projectScope !== undefined) {
    return projectScope;
  }
  return scope as MemoryScope;
}

export function toRecallOutput(result: RecallMemoryResult) {
  return {
    id: result.memory.id,
    revision: result.memory.revision,
    content: result.memory.content,
    kind: result.memory.kind,
    scope: result.memory.scope,
    tags: result.memory.tags,
    score: result.score,
    reason: result.reason,
  };
}

export function toSuggestionDraftOutput(draft: CaptureSuggestionDraft): CaptureSuggestionToolDraft {
  return {
    content: draft.content,
    kind: draft.kind,
    scope: draft.scope,
    tags: draft.tags,
    source: draft.source,
    confidence: draft.confidence,
    provenance: draft.provenance,
    reason: draft.reason,
  };
}

export function toToolRecord(memory: MemoryRecord): MemoryToolRecord {
  return {
    id: memory.id,
    revision: memory.revision,
    content: memory.content,
    kind: memory.kind,
    scope: memory.scope,
    tags: memory.tags,
    source: memory.source,
    confidence: memory.confidence,
    provenance: memory.provenance,
    created_at: memory.createdAt.toISOString(),
    updated_at: memory.updatedAt.toISOString(),
    last_used_at: memory.lastUsedAt?.toISOString() ?? null,
    archived_at: memory.archivedAt?.toISOString() ?? null,
  };
}

export function encodeMemoryListCursor(memory: MemoryRecord): string {
  return Buffer.from(JSON.stringify({
    updated_at: memory.updatedAt.toISOString(),
    created_at: memory.createdAt.toISOString(),
    id: memory.id,
  }), "utf8").toString("base64url");
}

export function encodeMemoryEventCursor(event: { id: string; createdAt: Date }): string {
  return Buffer.from(JSON.stringify({
    created_at: event.createdAt.toISOString(),
    id: event.id,
  }), "utf8").toString("base64url");
}

export function toToolEvent(event: {
  id: string;
  memoryId: string | null;
  eventType: string;
  actor: string;
  payload: Record<string, unknown>;
  createdAt: Date;
}): MemoryToolEvent {
  return {
    id: event.id,
    memory_id: event.memoryId,
    event_type: event.eventType,
    actor: event.actor,
    payload: event.payload,
    created_at: event.createdAt.toISOString(),
  };
}
