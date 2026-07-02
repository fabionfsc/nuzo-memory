import type {
  CaptureSuggestionResult,
  ConfirmCaptureResult,
  MemoryEvent,
  MemoryRecord,
} from "@nuzo/memory-core";

export function formatCaptureSuggestion(suggestion: CaptureSuggestionResult, json: boolean): string {
  const output = toCaptureSuggestionOutput(suggestion);
  if (json) return JSON.stringify(output, null, 2);

  const lines = [
    `Status: ${output.status}`,
    "Memory writes: no",
    "Requires confirmation: yes",
    `Content: ${output.draft.content}`,
    `Kind: ${output.draft.kind}`,
    `Scope: ${output.draft.scope}`,
    `Tags: ${output.draft.tags.length > 0 ? output.draft.tags.join(", ") : "none"}`,
    `Source: ${output.draft.source}`,
    `Confidence: ${output.draft.confidence}`,
    `Reason: ${output.draft.reason}`,
  ];
  if (output.duplicate !== null) lines.push(`Duplicate: ${output.duplicate.id}`);
  if ("relationship_mode" in output && output.relationship_mode === "bounded") {
    lines.push(`Relationship: ${output.relationship}`);
    lines.push(`Relationship reason: ${output.relationship_evidence.reason}`);
    if (output.relationship_evidence.primary_memory_id !== null) {
      lines.push(`Primary memory: ${output.relationship_evidence.primary_memory_id}`);
    }
  }
  return lines.join("\n");
}

function toCaptureSuggestionOutput(suggestion: CaptureSuggestionResult) {
  const output = {
    status: suggestion.status,
    memory_writes: false,
    requires_confirmation: true,
    draft: {
      content: suggestion.draft.content,
      kind: suggestion.draft.kind,
      scope: suggestion.draft.scope,
      tags: suggestion.draft.tags,
      source: suggestion.draft.source,
      confidence: suggestion.draft.confidence,
      reason: suggestion.draft.reason,
    },
    duplicate: suggestion.duplicate ? toCliMemoryRecord(suggestion.duplicate) : null,
  };
  if (suggestion.relationshipMode === "bounded" && suggestion.relationship && suggestion.relationshipEvidence) {
    return {
      ...output,
      relationship_mode: suggestion.relationshipMode,
      relationship: suggestion.relationship,
      relationship_evidence: {
        version: suggestion.relationshipEvidence.version,
        primary_memory_id: suggestion.relationshipEvidence.primaryMemoryId,
        candidate_limit: suggestion.relationshipEvidence.candidateLimit,
        returned_limit: suggestion.relationshipEvidence.returnedLimit,
        evaluated_count: suggestion.relationshipEvidence.evaluatedCount,
        search_exhaustive: suggestion.relationshipEvidence.searchExhaustive,
        evidence_truncated: suggestion.relationshipEvidence.evidenceTruncated,
        reason: suggestion.relationshipEvidence.reason,
        candidates: suggestion.relationshipEvidence.candidates.map((candidate) => ({
          memory: toCliMemoryRecord(candidate.memory),
          matched_terms: candidate.matchedTerms,
          matched_tags: candidate.matchedTags,
          reason: candidate.reason,
        })),
      },
    };
  }
  return output;
}

export function formatConfirmCapture(result: ConfirmCaptureResult, json: boolean): string {
  const output = toConfirmCaptureOutput(result);
  if (json) return JSON.stringify(output, null, 2);

  const lines = [
    `Decision: ${output.decision}`,
    `Status: ${output.status}`,
    `Memory writes: ${output.memory_writes ? "yes" : "no"}`,
    "Requires confirmation: no",
    `Reason: ${output.reason}`,
  ];
  if (output.memory !== null) lines.push(`Memory: ${output.memory.id}`);
  return lines.join("\n");
}

function toConfirmCaptureOutput(result: ConfirmCaptureResult) {
  return {
    decision: result.decision,
    status: result.status,
    memory_writes: result.memoryWrites,
    requires_confirmation: false,
    reason: result.reason,
    memory: result.memory ? toCliMemoryRecord(result.memory) : null,
  };
}

function toCliMemoryRecord(memory: MemoryRecord) {
  return {
    id: memory.id,
    revision: memory.revision,
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

export function formatAuditEvent(event: MemoryEvent): string {
  return [
    event.createdAt.toISOString(),
    event.id,
    event.memoryId ?? "global",
    event.eventType,
    event.actor,
    JSON.stringify(event.payload),
  ].join("\t");
}
