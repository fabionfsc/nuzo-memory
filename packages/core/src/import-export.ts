import { NuzoMemoryError } from "./errors.js";
import { memoryLimits } from "./policy.js";
import { memoryConfidenceStates, memoryKinds, memoryProvenanceKinds } from "./types.js";
import type { MemoryExportDocument, MemoryExportItem, MemoryProvenance, MemoryRecord } from "./types.js";

export function toExportItem(memory: MemoryRecord): MemoryExportItem {
  return {
    scope: memory.scope,
    kind: memory.kind,
    content: memory.content,
    tags: [...memory.tags],
    source: memory.source,
    confidence: memory.confidence,
    confidence_state: memory.confidenceState,
    provenance: memory.provenance,
    created_at: memory.createdAt.toISOString(),
    updated_at: memory.updatedAt.toISOString(),
    last_used_at: memory.lastUsedAt?.toISOString() ?? null,
    archived_at: memory.archivedAt?.toISOString() ?? null,
  };
}

export function assertExportDocument(document: MemoryExportDocument): void {
  const value = document as unknown;
  if (!isRecord(value)) {
    throw new NuzoMemoryError("MEMORY_EXPORT_INVALID", "Memory export document is invalid.");
  }

  if (value.format !== "nuzo-memory-export" || value.version !== 1) {
    throw new NuzoMemoryError("MEMORY_EXPORT_UNSUPPORTED", "Memory export format is not supported.", {
      format: value.format,
      version: value.version,
    });
  }

  parseExportDate(getStringField(value, "exported_at", "document"), "exported_at");

  if (!Array.isArray(value.memories)) {
    throw new NuzoMemoryError("MEMORY_EXPORT_INVALID", "Memory export document is invalid.");
  }
  if (value.memories.length > memoryLimits.importItems) {
    throw new NuzoMemoryError(
      "MEMORY_IMPORT_LIMIT_EXCEEDED",
      "Memory import contains too many items.",
      { maxItems: memoryLimits.importItems },
    );
  }

  value.memories.forEach(assertExportItem);
}

function assertExportItem(item: unknown, index: number): void {
  if (!isRecord(item)) {
    throwInvalidExportItem(index, "item must be an object");
  }

  getStringField(item, "scope", `memories[${index}]`);
  const kind = getStringField(item, "kind", `memories[${index}]`);
  if (!memoryKinds.includes(kind as MemoryExportItem["kind"])) {
    throwInvalidExportItem(index, "kind is not supported", { kind });
  }
  getStringField(item, "content", `memories[${index}]`);
  getStringArrayField(item, "tags", `memories[${index}]`);
  getStringField(item, "source", `memories[${index}]`);
  const confidence = getNumberField(item, "confidence", `memories[${index}]`);
  if (confidence < 0 || confidence > 1) {
    throwInvalidExportItem(index, "confidence must be between 0 and 1", {
      confidence,
    });
  }
  getOptionalConfidenceStateField(item, "confidence_state", `memories[${index}]`);
  getOptionalProvenanceField(item, "provenance", `memories[${index}]`);
  const createdAt = getStringField(item, "created_at", `memories[${index}]`);
  const updatedAt = getStringField(item, "updated_at", `memories[${index}]`);
  const lastUsedAt = getNullableStringField(item, "last_used_at", `memories[${index}]`);
  const archivedAt = getNullableStringField(item, "archived_at", `memories[${index}]`);

  parseExportDate(createdAt, `memories[${index}].created_at`);
  parseExportDate(updatedAt, `memories[${index}].updated_at`);
  if (lastUsedAt !== null) {
    parseExportDate(lastUsedAt, `memories[${index}].last_used_at`);
  }
  if (archivedAt !== null) {
    parseExportDate(archivedAt, `memories[${index}].archived_at`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getStringField(record: Record<string, unknown>, field: string, path: string): string {
  if (typeof record[field] !== "string") {
    throwInvalidExportField(path, field, "must be a string", { value: record[field] });
  }
  return record[field];
}

function getNullableStringField(record: Record<string, unknown>, field: string, path: string): string | null {
  if (record[field] !== null && typeof record[field] !== "string") {
    throwInvalidExportField(path, field, "must be a string or null", { value: record[field] });
  }
  return record[field];
}

function getStringArrayField(record: Record<string, unknown>, field: string, path: string): string[] {
  if (!Array.isArray(record[field]) || !record[field].every((value) => typeof value === "string")) {
    throwInvalidExportField(path, field, "must be an array of strings", { value: record[field] });
  }
  return record[field];
}

function getNumberField(record: Record<string, unknown>, field: string, path: string): number {
  if (typeof record[field] !== "number" || !Number.isFinite(record[field])) {
    throwInvalidExportField(path, field, "must be a finite number", { value: record[field] });
  }
  return record[field];
}

function getOptionalConfidenceStateField(record: Record<string, unknown>, field: string, path: string): void {
  if (!(field in record) || record[field] === null) {
    return;
  }
  const value = record[field];
  if (typeof value !== "string" || !memoryConfidenceStates.includes(value as NonNullable<MemoryExportItem["confidence_state"]>)) {
    throwInvalidExportField(path, field, "must be a supported confidence state or null", {
      value,
    });
  }
}

function getOptionalProvenanceField(
  record: Record<string, unknown>,
  field: string,
  path: string,
): MemoryProvenance | null | undefined {
  if (!(field in record)) {
    return undefined;
  }
  if (record[field] === null) {
    return null;
  }
  if (!isRecord(record[field])) {
    throwInvalidExportField(path, field, "must be an object or null", { value: record[field] });
  }
  const provenance = record[field];
  if (!memoryProvenanceKinds.includes(provenance.kind as MemoryProvenance["kind"])) {
    throwInvalidExportField(path, field, "kind is not supported", { kind: provenance.kind });
  }
  for (const textField of ["host", "surface", "thread_id", "action", "reason"] as const) {
    if (provenance[textField] !== undefined && typeof provenance[textField] !== "string") {
      throwInvalidExportField(`${path}.${field}`, textField, "must be a string", {
        value: provenance[textField],
      });
    }
  }
  if (provenance.path !== undefined && typeof provenance.path !== "string") {
    throwInvalidExportField(`${path}.${field}`, "path", "must be a string", { value: provenance.path });
  }
  if (
    provenance.line !== undefined &&
    (typeof provenance.line !== "number" || !Number.isInteger(provenance.line) || provenance.line <= 0)
  ) {
    throwInvalidExportField(`${path}.${field}`, "line", "must be a positive integer", {
      value: provenance.line,
    });
  }
  return provenance as unknown as MemoryProvenance;
}

function throwInvalidExportField(
  path: string,
  field: string,
  reason: string,
  details: Record<string, unknown> = {},
): never {
  throw new NuzoMemoryError("MEMORY_EXPORT_INVALID", "Memory export document is invalid.", {
    path: `${path}.${field}`,
    reason,
    ...details,
  });
}

function throwInvalidExportItem(
  index: number,
  reason: string,
  details: Record<string, unknown> = {},
): never {
  throw new NuzoMemoryError("MEMORY_EXPORT_INVALID", "Memory export document is invalid.", {
    path: `memories[${index}]`,
    reason,
    ...details,
  });
}

export function parseExportDate(value: string, field: string): Date {
  if (value.length > memoryLimits.dateLength) {
    throw new NuzoMemoryError("MEMORY_EXPORT_INVALID", "Memory export contains an invalid date.", {
      field,
      maxLength: memoryLimits.dateLength,
    });
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new NuzoMemoryError("MEMORY_EXPORT_INVALID", "Memory export contains an invalid date.", {
      field,
      value,
    });
  }
  return date;
}

export function toImportDuplicateKey(
  memory: MemoryRecord,
): string;
export function toImportDuplicateKey(
  memory: Pick<MemoryRecord, "scope" | "kind" | "content" | "tags">,
): string;
export function toImportDuplicateKey(
  memory: Pick<MemoryRecord, "scope" | "kind" | "content" | "tags">,
): string {
  return JSON.stringify([
    memory.scope,
    memory.kind,
    normalizeContent(memory.content),
    normalizeTags(memory.tags),
  ]);
}

function normalizeContent(content: string): string {
  return content.trim().replace(/\s+/g, " ");
}

function normalizeTags(tags: string[]): string[] {
  return [...new Set(tags)].sort();
}
