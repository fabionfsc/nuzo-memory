import {
  renderUntrustedInlineText,
  stringifyUntrustedJson,
  type RelationGovernanceReview,
} from "@nuzo/memory-core";

export function formatRelationGovernanceReview(
  report: RelationGovernanceReview,
  json: boolean,
): string {
  if (json) {
    return stringifyUntrustedJson(toRelationGovernanceOutput(report), 2);
  }

  const lines = [
    "Relation governance review (read-only)",
    [
      `scope=${renderUntrustedInlineText(report.scope)}`,
      `reviewed=${report.reviewedMemories}`,
      `scanned=${report.scannedMemories}/${report.memoryScanLimit}`,
      `candidates=${report.candidates.length}/${report.candidateLimit}`,
      `memory_scan_truncated=${String(report.memoryScanTruncated)}`,
      `candidate_results_truncated=${String(report.candidateResultsTruncated)}`,
    ].join("\t"),
  ];
  for (const candidate of report.candidates) {
    const existing = candidate.existingRelations.length === 0
      ? "none"
      : candidate.existingRelations
          .map((relation) => `${relation.direction}:${relation.relation}:${relation.id}`)
          .join(",");
    lines.push([
      renderUntrustedInlineText(candidate.primaryMemoryId),
      `rev=${candidate.primaryRevision}`,
      `scope=${renderUntrustedInlineText(candidate.primaryScope)}`,
      `lifecycle=${candidate.primaryLifecycle}`,
      `candidate=${renderUntrustedInlineText(candidate.candidateMemoryId)}`,
      `candidate_rev=${candidate.candidateRevision}`,
      `candidate_scope=${renderUntrustedInlineText(candidate.candidateScope)}`,
      `candidate_lifecycle=${candidate.candidateLifecycle}`,
      `relationship=${candidate.relationship}`,
      `state=${candidate.state}`,
      `reasons=${candidate.reasonCodes.join(",")}`,
      `existing=${renderUntrustedInlineText(existing)}`,
    ].join("\t"));
  }
  lines.push("No changes were made. Inspect each ID with `nuzo memory show <id>`.");
  lines.push("Confirm a decision only through `nuzo memory relate ...` or `nuzo memory challenge ...`.");
  return lines.join("\n");
}

export function toRelationGovernanceOutput(report: RelationGovernanceReview) {
  return {
    version: report.version,
    mode: report.mode,
    memory_writes: report.memoryWrites,
    relation_writes: report.relationWrites,
    lifecycle_writes: report.lifecycleWrites,
    audit_writes: report.auditWrites,
    scope: report.scope,
    include_archived: report.includeArchived,
    needs_review: report.needsReview,
    memory_scan_limit: report.memoryScanLimit,
    candidate_limit: report.candidateLimit,
    scanned_memories: report.scannedMemories,
    reviewed_memories: report.reviewedMemories,
    memory_scan_truncated: report.memoryScanTruncated,
    candidate_results_truncated: report.candidateResultsTruncated,
    candidates: report.candidates.map((candidate) => ({
      primary_memory_id: candidate.primaryMemoryId,
      primary_revision: candidate.primaryRevision,
      primary_scope: candidate.primaryScope,
      primary_lifecycle: candidate.primaryLifecycle,
      candidate_memory_id: candidate.candidateMemoryId,
      candidate_revision: candidate.candidateRevision,
      candidate_scope: candidate.candidateScope,
      candidate_lifecycle: candidate.candidateLifecycle,
      relationship: candidate.relationship,
      reason_codes: candidate.reasonCodes,
      state: candidate.state,
      existing_relations: candidate.existingRelations.map((relation) => ({
        id: relation.id,
        relation: relation.relation,
        direction: relation.direction,
      })),
    })),
  };
}
