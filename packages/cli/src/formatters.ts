import {
  escapeUntrustedControlCharacters,
  renderUntrustedInlineText,
  type CaptureSuggestionResult,
  type ConfirmCaptureResult,
  type MemoryEvent,
  type MemoryRecord,
} from "@nuzo/memory-core";

export function formatCaptureSuggestion(suggestion: CaptureSuggestionResult, json: boolean): string {
  const output = toCaptureSuggestionOutput(suggestion);
  if (json) return JSON.stringify(output, null, 2);

  const lines = [
    `Status: ${renderUntrustedInlineText(output.status)}`,
    "Memory writes: no",
    "Requires confirmation: yes",
    `Content: ${renderUntrustedInlineText(output.draft.content)}`,
    `Kind: ${renderUntrustedInlineText(output.draft.kind)}`,
    `Scope: ${renderUntrustedInlineText(output.draft.scope)}`,
    `Tags: ${formatInlineTags(output.draft.tags)}`,
    `Source: ${renderUntrustedInlineText(output.draft.source)}`,
    `Confidence: ${output.draft.confidence}`,
    `Confidence state: ${renderUntrustedInlineText(output.draft.confidence_state ?? "none")}`,
    `Review after: ${output.draft.review_after ?? "none"}`,
    `Expires at: ${output.draft.expires_at ?? "none"}`,
    `Reason: ${renderUntrustedInlineText(output.draft.reason)}`,
  ];
  if (output.duplicate !== null) {
    lines.push(`Duplicate: ${renderUntrustedInlineText(output.duplicate.id)}`);
  }
  if ("relationship_mode" in output && output.relationship_mode === "bounded") {
    lines.push(`Relationship: ${renderUntrustedInlineText(output.relationship)}`);
    lines.push(`Relationship reason: ${renderUntrustedInlineText(output.relationship_evidence.reason)}`);
    if (output.relationship_evidence.primary_memory_id !== null) {
      lines.push(
        `Primary memory: ${renderUntrustedInlineText(output.relationship_evidence.primary_memory_id)}`,
      );
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
      confidence_state: suggestion.draft.confidenceState,
      provenance: suggestion.draft.provenance,
      review_after: suggestion.draft.reviewAfter?.toISOString() ?? null,
      expires_at: suggestion.draft.expiresAt?.toISOString() ?? null,
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
    `Decision: ${renderUntrustedInlineText(output.decision)}`,
    `Status: ${renderUntrustedInlineText(output.status)}`,
    `Memory writes: ${output.memory_writes ? "yes" : "no"}`,
    "Requires confirmation: no",
    `Reason: ${renderUntrustedInlineText(output.reason)}`,
  ];
  if (output.memory !== null) {
    lines.push(`Memory: ${renderUntrustedInlineText(output.memory.id)}`);
  }
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
    confidence_state: memory.confidenceState,
    provenance: memory.provenance,
    review_after: memory.reviewAfter?.toISOString() ?? null,
    expires_at: memory.expiresAt?.toISOString() ?? null,
    created_at: memory.createdAt.toISOString(),
    updated_at: memory.updatedAt.toISOString(),
    last_used_at: memory.lastUsedAt?.toISOString() ?? null,
    archived_at: memory.archivedAt?.toISOString() ?? null,
  };
}

export function formatAuditEvent(event: MemoryEvent): string {
  return [
    event.createdAt.toISOString(),
    renderUntrustedInlineText(event.id),
    renderUntrustedInlineText(event.memoryId ?? "global"),
    renderUntrustedInlineText(event.eventType),
    renderUntrustedInlineText(event.actor),
    escapeUntrustedControlCharacters(JSON.stringify(event.payload)),
  ].join("\t");
}

function formatInlineTags(tags: readonly string[]): string {
  return tags.length === 0 ? "none" : tags.map(renderUntrustedInlineText).join(", ");
}
