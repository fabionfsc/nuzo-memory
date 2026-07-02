import { memoryEventTypes, type ConfirmCaptureDecision, type MemoryEvent, type RetrievalMode, type SemanticFallbackMode } from "@nuzo/memory-core";
import { InvalidArgumentError } from "commander";

export type ExportFormat = "json" | "markdown";

export function inferExportFormat(path?: string): ExportFormat {
  return path?.toLowerCase().endsWith(".md") ? "markdown" : "json";
}

export function parseExportFormat(value: string): ExportFormat {
  if (value === "json" || value === "markdown") return value;
  throw new InvalidArgumentError("Expected export format to be json or markdown.");
}

export function parsePositiveInteger(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new InvalidArgumentError("Expected a positive integer.");
  }
  return parsed;
}

export function parseIsoDate(value: string, field: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new InvalidArgumentError(`Expected ${field} to be an ISO timestamp.`);
  }
  return parsed;
}

export function parseAuditEventType(
  value: string,
  previous: MemoryEvent["eventType"][] = [],
): MemoryEvent["eventType"][] {
  if (!memoryEventTypes.includes(value as MemoryEvent["eventType"])) {
    throw new InvalidArgumentError(`Expected audit event type to be one of: ${memoryEventTypes.join(", ")}.`);
  }
  return [...previous, value as MemoryEvent["eventType"]];
}

export function parseConfidence(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new InvalidArgumentError("Expected a number between 0 and 1.");
  }
  return parsed;
}

export function parseRelationshipMode(value: string): "exact" | "bounded" {
  if (value === "exact" || value === "bounded") return value;
  throw new InvalidArgumentError("Expected relationship mode to be exact or bounded.");
}

export function parseRetrievalMode(value: string): RetrievalMode {
  if (value !== "fts" && value !== "semantic" && value !== "hybrid") {
    throw new InvalidArgumentError("Retrieval mode must be fts, semantic, or hybrid.");
  }
  return value;
}

export function parseSemanticFallback(value: string): SemanticFallbackMode {
  if (value !== "error" && value !== "fts") {
    throw new InvalidArgumentError("Semantic fallback must be error or fts.");
  }
  return value;
}

export function parseConfirmCaptureDecision(value: string): ConfirmCaptureDecision {
  if (
    value === "create" ||
    value === "update" ||
    value === "keep_separate" ||
    value === "clarify" ||
    value === "reject"
  ) {
    return value;
  }
  throw new InvalidArgumentError(
    "Expected capture decision to be create, update, keep_separate, clarify, or reject.",
  );
}
