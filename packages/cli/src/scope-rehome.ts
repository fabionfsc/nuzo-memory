import {
  escapeUntrustedControlCharacters,
  renderUntrustedInlineText,
  stringifyUntrustedJson,
  type SQLiteProjectScopeRehomePlan,
  type SQLiteProjectScopeRehomeResult,
} from "@nuzo/memory-core";
import { toIntegrityOutput } from "./doctor.js";

export function formatScopeRehomePlan(plan: SQLiteProjectScopeRehomePlan, json: boolean): string {
  const output = toScopeRehomePlanOutput(plan);
  if (json) return stringifyUntrustedJson(output, 2);
  return [
    "Project scope rehome plan (read-only)",
    `Store: ${escapeUntrustedControlCharacters(plan.sourcePath)}`,
    `From: ${renderUntrustedInlineText(plan.sourceScope)}`,
    `To: ${renderUntrustedInlineText(plan.targetScope)}`,
    `Plan hash: ${plan.planHash}`,
    `Applicable: ${plan.applicable ? "yes" : "no"}`,
    `Memories: ${plan.memoryCount} (${plan.activeMemoryCount} active, ${plan.archivedMemoryCount} archived)`,
    `Existing target memories: ${plan.targetMemoryCount}`,
    `Affected relations: ${plan.affectedRelationCount}`,
    `Historical audit events: ${plan.historicalEventCount} (rewritten: 0)`,
    `Target collisions: ${plan.collisionCount}`,
    "No changes were made. Apply requires --apply --yes and a new --backup-path.",
  ].join("\n");
}

export function formatScopeRehomeResult(result: SQLiteProjectScopeRehomeResult, json: boolean): string {
  const output = toScopeRehomeResultOutput(result);
  if (json) return stringifyUntrustedJson(output, 2);
  return [
    `Rehomed ${result.memoryCount} memories from ${renderUntrustedInlineText(result.sourceScope)} to ${renderUntrustedInlineText(result.targetScope)}`,
    `Validated backup: ${escapeUntrustedControlCharacters(result.backupPath)}`,
    `Relations preserved: ${result.affectedRelationCount}`,
    `Historical audit events preserved: ${result.historicalEventCount} (rewritten: 0)`,
    "IDs, revisions, timestamps, lifecycle metadata, and relation records were preserved.",
    `Audit event: ${renderUntrustedInlineText(result.eventId)}`,
    `Integrity: ${result.after.ok && result.after.ftsOk ? "ok" : "failed"}`,
  ].join("\n");
}

export function toScopeRehomePlanOutput(plan: SQLiteProjectScopeRehomePlan) {
  return {
    version: plan.version,
    dry_run: plan.dryRun,
    source_path: plan.sourcePath,
    source_scope: plan.sourceScope,
    target_scope: plan.targetScope,
    plan_hash: plan.planHash,
    applicable: plan.applicable,
    memory_count: plan.memoryCount,
    active_memory_count: plan.activeMemoryCount,
    archived_memory_count: plan.archivedMemoryCount,
    target_memory_count: plan.targetMemoryCount,
    affected_relation_count: plan.affectedRelationCount,
    historical_event_count: plan.historicalEventCount,
    historical_events_rewritten: plan.historicalEventsRewritten,
    collision_count: plan.collisionCount,
    integrity: toIntegrityOutput(plan.integrity),
  };
}

export function toScopeRehomeResultOutput(result: SQLiteProjectScopeRehomeResult) {
  return {
    version: result.version,
    applied: result.applied,
    source_path: result.sourcePath,
    backup_path: result.backupPath,
    source_scope: result.sourceScope,
    target_scope: result.targetScope,
    plan_hash: result.planHash,
    memory_count: result.memoryCount,
    active_memory_count: result.activeMemoryCount,
    archived_memory_count: result.archivedMemoryCount,
    affected_relation_count: result.affectedRelationCount,
    historical_event_count: result.historicalEventCount,
    historical_events_rewritten: result.historicalEventsRewritten,
    revisions_preserved: result.revisionsPreserved,
    event_id: result.eventId,
    backup_integrity: toIntegrityOutput(result.backup),
    after_integrity: toIntegrityOutput(result.after),
  };
}
