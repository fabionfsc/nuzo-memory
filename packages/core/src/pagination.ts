import { NuzoMemoryError } from "./errors.js";
import type { MemoryEvent, MemoryRecord } from "./types.js";

export interface MemoryListCursorFields {
  updated_at: string;
  created_at: string;
  id: string;
}

export interface MemoryEventCursorFields {
  created_at: string;
  id: string;
}

export function encodeMemoryListCursor(memory: MemoryRecord): string {
  return encodeCursor({
    updated_at: memory.updatedAt.toISOString(),
    created_at: memory.createdAt.toISOString(),
    id: memory.id,
  });
}

export function decodeMemoryListCursor(cursor: string): MemoryListCursorFields {
  const decoded = decodeCursor(cursor);
  const fields = decoded as Partial<MemoryListCursorFields>;
  if (
    typeof fields.updated_at !== "string" ||
    typeof fields.created_at !== "string" ||
    typeof fields.id !== "string"
  ) {
    throwInvalidCursor();
  }
  assertIsoDate(fields.updated_at, "updated_at");
  assertIsoDate(fields.created_at, "created_at");
  return {
    updated_at: fields.updated_at,
    created_at: fields.created_at,
    id: fields.id,
  };
}

export function encodeMemoryEventCursor(event: MemoryEvent): string {
  return encodeCursor({
    created_at: event.createdAt.toISOString(),
    id: event.id,
  });
}

export function decodeMemoryEventCursor(cursor: string): MemoryEventCursorFields {
  const decoded = decodeCursor(cursor);
  const fields = decoded as Partial<MemoryEventCursorFields>;
  if (typeof fields.created_at !== "string" || typeof fields.id !== "string") {
    throwInvalidCursor();
  }
  assertIsoDate(fields.created_at, "created_at");
  return {
    created_at: fields.created_at,
    id: fields.id,
  };
}

function encodeCursor(fields: Record<string, string>): string {
  return Buffer.from(JSON.stringify(fields), "utf8").toString("base64url");
}

function decodeCursor(cursor: string): unknown {
  try {
    return JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as unknown;
  } catch {
    throwInvalidCursor();
  }
}

function assertIsoDate(value: string, field: string): void {
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== value) {
    throw new NuzoMemoryError("MEMORY_CURSOR_INVALID", "Memory pagination cursor is invalid.", {
      field,
    });
  }
}

function throwInvalidCursor(): never {
  throw new NuzoMemoryError("MEMORY_CURSOR_INVALID", "Memory pagination cursor is invalid.");
}
