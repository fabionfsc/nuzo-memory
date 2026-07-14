import type {
  AuditEventFilter,
  MemoryChallengeOutcome,
  ConfirmCaptureDecision,
  ConfirmCaptureInput,
  ForgetMemoryInput,
  ForgetMemoriesInput,
  ImportMemoriesInput,
  ListMemoriesInput,
  MemoryRelationType,
  MemoryExportDocument,
  MemoryConfidenceState,
  MemoryKind,
  MemoryProvenance,
  MemoryScope,
  MemoryService,
  NuzoAuthorizationMode,
  NuzoRuntimeAdjustment,
  NuzoRuntimeConfigProvenance,
  RememberMemoryInput,
  SQLiteIntegrityReport,
  RuntimeFileSafetyReport,
  SuggestCaptureInput,
  UpdateMemoryInput,
} from "@nuzo/memory-core";
import { createDoctorOutput } from "./handler-doctor.js";
import {
  buildRecallHookQuery,
  clampRecallHookLimit,
  encodeMemoryEventCursor,
  encodeMemoryListCursor,
  resolveToolScope,
  toRecallOutput,
  toSuggestionDraftOutput,
  toToolEvent,
  toToolRecord,
  toToolRelation,
} from "./handler-formatters.js";

export { formatIntegrityDiagnostics } from "./handler-doctor.js";

export interface RememberToolInput {
  content: string;
  kind: MemoryKind;
  scope: string;
  tags: string[];
  source: string;
  confidence?: number;
  confidence_state?: MemoryConfidenceState | null;
  provenance?: MemoryProvenance | null;
  review_after?: string | null;
  expires_at?: string | null;
}

export interface RecallToolInput {
  query: string;
  scope: string;
  limit: number;
  include_global: boolean;
  retrieval_mode?: "fts" | "semantic" | "hybrid";
  semantic_fallback?: "error" | "fts";
}

export interface RecallHookToolInput {
  task_context: string;
  project_scope?: string;
  limit?: number;
}

export interface SuggestCaptureToolInput {
  content: string;
  kind: MemoryKind;
  scope: string;
  tags: string[];
  source: string;
  confidence?: number;
  confidence_state?: MemoryConfidenceState | null;
  provenance?: MemoryProvenance | null;
  review_after?: string | null;
  expires_at?: string | null;
  reason: string;
  relationship_mode?: "exact" | "bounded";
}

export interface ConfirmCaptureToolInput {
  decision: ConfirmCaptureDecision;
  content: string;
  kind: MemoryKind;
  scope: string;
  tags: string[];
  source: string;
  confidence?: number;
  confidence_state?: MemoryConfidenceState | null;
  provenance?: MemoryProvenance | null;
  review_after?: string | null;
  expires_at?: string | null;
  reason: string;
  confirm: boolean;
  actor: string;
  target_memory_id?: string;
  expected_revision?: number;
}

export interface ListToolInput {
  scope?: string;
  tags: string[];
  include_archived: boolean;
  needs_review?: boolean;
  limit: number;
  cursor?: string;
}

export interface ShowToolInput {
  id: string;
  history_limit: number;
}

export interface ChallengeToolInput {
  id: string;
  outcome: MemoryChallengeOutcome;
  reason: string;
  actor: string;
  expected_revision?: number;
  superseded_by_memory_id?: string;
}

export interface RelateToolInput {
  source_memory_id: string;
  target_memory_id: string;
  relation: MemoryRelationType;
  reason?: string;
  actor: string;
}

export interface RelationsToolInput {
  memory_id: string;
  include_reverse: boolean;
  limit: number;
}

export interface UnrelateToolInput {
  id: string;
  reason?: string;
  actor: string;
}

export interface UpdateToolInput {
  id: string;
  expected_revision?: number;
  content?: string;
  kind?: MemoryKind;
  scope?: string;
  tags?: string[];
  confidence?: number;
  confidence_state?: MemoryConfidenceState | null;
  provenance?: MemoryProvenance | null;
  review_after?: string | null;
  expires_at?: string | null;
}

export interface HistoryToolInput {
  id: string;
  limit: number;
  cursor?: string;
}

export interface AuditToolInput {
  memory_id?: string;
  event_type: string[];
  actor?: string;
  scope?: string;
  since?: string;
  until?: string;
  limit: number;
}

export interface ForgetToolInput {
  id: string;
  expected_revision?: number;
  mode: "archive" | "delete";
  confirm: boolean;
  reason?: string;
}

export interface ForgetManyToolInput {
  scope?: string;
  tags: string[];
  all: boolean;
  mode: "archive" | "delete";
  confirm: boolean;
  dry_run: boolean;
  reason?: string;
}

export interface ExportToolInput {
  scope?: string;
  tags: string[];
  include_archived: boolean;
  limit: number;
  cursor?: string;
}

export interface ImportToolInput {
  document: MemoryExportDocument;
  scope?: string;
  dry_run: boolean;
}

export interface MemoryToolHandlerOptions {
  storePath?: string;
  doctorDiagnostics?: MemoryDoctorDiagnostics;
  projectScope?: `project:${string}`;
}

export interface MemoryDoctorDiagnostics {
  schema?: {
    currentVersion: number;
    supportedVersion: number;
  };
  integrity?: SQLiteIntegrityReport | (() => SQLiteIntegrityReport);
  fileSafety?: RuntimeFileSafetyReport | (() => RuntimeFileSafetyReport);
  writable?: boolean;
  runtime?: {
    projectScope: `project:${string}`;
    authorizationMode: NuzoAuthorizationMode;
    authorizedScopes?: readonly MemoryScope[];
    provenance: NuzoRuntimeConfigProvenance;
    adjustments: readonly NuzoRuntimeAdjustment[];
  };
  diagnosticScopes?: readonly MemoryScope[];
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
      revision: number;
      content: string;
      kind: MemoryKind;
      scope: MemoryScope;
      tags: string[];
      confidence_state: MemoryConfidenceState | null;
      review_after: string | null;
      expires_at: string | null;
      score: number;
      reason: string;
      relations: MemoryToolRelation[];
    }>;
    retrieval?: {
      requested_mode: "fts" | "semantic" | "hybrid";
      effective_mode: "fts" | "semantic" | "hybrid";
      semantic_fallback_code: string | null;
    };
  }>;
  recallHook(input: RecallHookToolInput): Promise<{
    mode: "read_only";
    memory_writes: false;
    capture_suggestions: false;
    query: string;
    scope: MemoryScope;
    include_global: true;
    limit: number;
    results: Array<{
      id: string;
      revision: number;
      content: string;
      kind: MemoryKind;
      scope: MemoryScope;
      tags: string[];
      confidence_state: MemoryConfidenceState | null;
      review_after: string | null;
      expires_at: string | null;
      score: number;
      reason: string;
      relations: MemoryToolRelation[];
    }>;
  }>;
  suggestCapture(input: SuggestCaptureToolInput): Promise<{
    status: "ready" | "duplicate" | "review";
    memory_writes: false;
    requires_confirmation: true;
    draft: CaptureSuggestionToolDraft;
    duplicate: MemoryToolRecord | null;
    relationship_mode?: "bounded";
    relationship?: string;
    relationship_evidence?: {
      version: 1;
      primary_memory_id: string | null;
      candidate_limit: number;
      returned_limit: number;
      evaluated_count: number;
      search_exhaustive: boolean;
      evidence_truncated: boolean;
      reason: string;
      candidates: Array<{
        memory: MemoryToolRecord;
        matched_terms: string[];
        matched_tags: string[];
        reason: string;
      }>;
    };
  }>;
  confirmCapture(input: ConfirmCaptureToolInput): Promise<{
    decision: ConfirmCaptureDecision;
    status: "created" | "updated" | "skipped" | "needs_clarification";
    memory_writes: boolean;
    requires_confirmation: false;
    reason: string;
    memory: MemoryToolRecord | null;
  }>;
  list(input: ListToolInput): Promise<{
    memories: MemoryToolRecord[];
    next_cursor: string | null;
    limit: number;
    truncated: boolean;
  }>;
  show(input: ShowToolInput): Promise<{
    memory: MemoryToolRecord;
    relations: MemoryToolRelation[];
    events: MemoryToolEvent[];
  }>;
  challenge(input: ChallengeToolInput): Promise<{
    memory: MemoryToolRecord;
    outcome: MemoryChallengeOutcome;
    relation: MemoryToolRelation | null;
  }>;
  relate(input: RelateToolInput): Promise<{
    relation: MemoryToolRelation;
  }>;
  relations(input: RelationsToolInput): Promise<{
    relations: MemoryToolRelation[];
  }>;
  unrelate(input: UnrelateToolInput): Promise<{
    id: string;
    removed: true;
  }>;
  update(input: UpdateToolInput): Promise<{
    memory: MemoryToolRecord;
  }>;
  history(input: HistoryToolInput): Promise<{
    events: MemoryToolEvent[];
    next_cursor: string | null;
    limit: number;
    truncated: boolean;
  }>;
  audit(input: AuditToolInput): Promise<{
    events: MemoryToolEvent[];
  }>;
  forget(input: ForgetToolInput): Promise<{
    id: string;
    forgotten: true;
    mode: "archive" | "delete";
  }>;
  forgetMany(input: ForgetManyToolInput): Promise<{
    matched: number;
    affected: number;
    mode: "archive" | "delete";
    dry_run: boolean;
    ids: string[];
  }>;
  exportMemories(input: ExportToolInput): Promise<{
    document: MemoryExportDocument;
    next_cursor: string | null;
    limit: number;
    truncated: boolean;
  }>;
  importMemories(input: ImportToolInput): Promise<{
    imported: number;
    skipped: number;
    dry_run: boolean;
  }>;
  doctor(): Promise<{
    ok: boolean;
    network: "disabled";
    store: {
      path: string | null;
      readable: boolean;
      writable_check: "writable" | "not_writable" | "not_performed";
    };
    config: {
      project_scope: string | null;
      project_root_source: NuzoRuntimeConfigProvenance["projectRoot"] | null;
      config_source: NuzoRuntimeConfigProvenance["config"] | null;
      store_source: NuzoRuntimeConfigProvenance["store"] | null;
      scope_source: NuzoRuntimeConfigProvenance["scope"] | null;
      adjustments: readonly NuzoRuntimeAdjustment[];
    };
    authorization: {
      mode: NuzoAuthorizationMode | "unknown";
      source: NuzoRuntimeConfigProvenance["authorization"] | null;
      allowed_scopes: readonly MemoryScope[] | null;
    };
    schema: {
      current_version: number | null;
      supported_version: number | null;
      status: "current" | "outdated" | "newer" | "not_performed";
    };
    counts: {
      active_memories: number | null;
      archived_memories: number | null;
      total_memories: number | null;
    };
    integrity: MemoryDoctorIntegrityOutput;
    file_safety: MemoryDoctorFileSafetyOutput;
    secret_scan: {
      status: "not_performed";
      guidance: string;
    };
    lifecycle: {
      recall_hook: "available";
      automatic_host_hooks: "verify_in_host";
      autoload_tag: "autoload";
      supported_events: ["SessionStart", "UserPromptSubmit"];
    };
    tools: string[];
    warnings: string[];
  }>;
}

export type MemoryDoctorIntegrityOutput = {
  ok: boolean | null;
  path: string | null;
  schema_version: number | null;
  supported_schema_version: number | null;
  integrity_check: string | null;
  foreign_key_violations: number | null;
  memory_count: number | null;
  active_memory_count: number | null;
  fts_row_count: number | null;
  missing_fts_rows: number | null;
  orphan_fts_rows: number | null;
  errors: string[];
  status: "ok" | "failed" | "missing" | "not_performed";
};

export type MemoryDoctorFileSafetyOutput = {
  permission_semantics: "posix" | "not_supported" | "not_performed";
  inspected_paths: number;
  unsafe: Array<{
    path: string;
    type: RuntimeFileSafetyReport["unsafe"][number]["type"];
    reason: RuntimeFileSafetyReport["unsafe"][number]["reason"];
    actual_mode: number | null;
    expected_mode: number;
  }>;
  stale_artifacts: string[];
  unexpected_files: string[];
};

export type MemoryToolRecord = {
  id: string;
  revision: number;
  content: string;
  kind: MemoryKind;
  scope: MemoryScope;
  tags: string[];
  source: string;
  confidence: number;
  confidence_state: MemoryConfidenceState | null;
  provenance: MemoryProvenance | null;
  review_after: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
  archived_at: string | null;
  relations?: MemoryToolRelation[];
};

export type MemoryToolRelation = {
  id: string;
  source_memory_id: string;
  target_memory_id: string;
  direction: "incoming" | "outgoing" | null;
  relation: MemoryRelationType;
  reason: string | null;
  created_at: string;
};

export type MemoryToolEvent = {
  id: string;
  memory_id: string | null;
  event_type: string;
  actor: string;
  payload: Record<string, unknown>;
  created_at: string;
};

export type CaptureSuggestionToolDraft = {
  content: string;
  kind: MemoryKind;
  scope: MemoryScope;
  tags: string[];
  source: string;
  confidence: number;
  confidence_state: MemoryConfidenceState | null;
  provenance: MemoryProvenance | null;
  review_after: string | null;
  expires_at: string | null;
  reason: string;
};

function parseOptionalToolDate(value: string | null | undefined): Date | null {
  if (value === undefined || value === null) {
    return null;
  }
  return new Date(value);
}

export function createMemoryToolHandlers(
  service: MemoryService,
  options: MemoryToolHandlerOptions = {},
): MemoryToolHandlers {
  return {
    async remember(input) {
      const rememberInput: RememberMemoryInput = {
        content: input.content,
        kind: input.kind,
        scope: resolveToolScope(input.scope, options.projectScope),
        tags: input.tags,
        source: input.source,
        actor: "nuzo:mcp",
      };
      if (input.confidence !== undefined) {
        rememberInput.confidence = input.confidence;
      }
      if ("confidence_state" in input) {
        rememberInput.confidenceState = input.confidence_state ?? null;
      }
      if ("provenance" in input) {
        rememberInput.provenance = input.provenance ?? null;
      }
      if ("review_after" in input) {
        rememberInput.reviewAfter = parseOptionalToolDate(input.review_after);
      }
      if ("expires_at" in input) {
        rememberInput.expiresAt = parseOptionalToolDate(input.expires_at);
      }

      const memory = await service.remember(rememberInput);

      return {
        id: memory.id,
        created: true,
        warnings: [],
      };
    },

    async recall(input) {
      const response = await service.recallDetailed({
        query: input.query,
        scope: resolveToolScope(input.scope, options.projectScope),
        limit: input.limit,
        includeGlobal: input.include_global,
        retrievalMode: input.retrieval_mode ?? "fts",
        ...(input.semantic_fallback === undefined ? {} : { semanticFallback: input.semantic_fallback }),
      });

      const output: Awaited<ReturnType<MemoryToolHandlers["recall"]>> = {
        results: await Promise.all(response.results.map(async (result) => ({
          ...toRecallOutput(result),
          relations: (await service.relations({
            memoryId: result.memory.id,
            includeReverse: true,
            limit: 10,
          })).map((relation) => toToolRelation(relation, result.memory.id)),
        }))),
      };
      if ((input.retrieval_mode ?? "fts") !== "fts") {
        output.retrieval = {
          requested_mode: response.diagnostics.requestedMode,
          effective_mode: response.diagnostics.effectiveMode,
          semantic_fallback_code: response.diagnostics.semanticFallbackCode,
        };
      }
      return output;
    },

    async recallHook(input) {
      const query = buildRecallHookQuery(input.task_context);
      const limit = clampRecallHookLimit(input.limit);
      const scope = resolveToolScope(input.project_scope ?? "project:auto", options.projectScope);
      const results = await service.recall({
        query,
        scope,
        limit,
        includeGlobal: true,
        recordUsage: false,
      });

      return {
        mode: "read_only",
        memory_writes: false,
        capture_suggestions: false,
        query,
        scope,
        include_global: true,
        limit,
        results: await Promise.all(results.map(async (result) => ({
          ...toRecallOutput(result),
          relations: (await service.relations({
            memoryId: result.memory.id,
            includeReverse: true,
            limit: 10,
          })).map((relation) => toToolRelation(relation, result.memory.id)),
        }))),
      };
    },

    async suggestCapture(input) {
      const suggestInput: SuggestCaptureInput = {
        content: input.content,
        kind: input.kind,
        scope: resolveToolScope(input.scope, options.projectScope),
        tags: input.tags,
        source: input.source,
        reason: input.reason,
      };
      if (input.confidence !== undefined) {
        suggestInput.confidence = input.confidence;
      }
      if ("confidence_state" in input) {
        suggestInput.confidenceState = input.confidence_state ?? null;
      }
      if ("provenance" in input) {
        suggestInput.provenance = input.provenance ?? null;
      }
      if ("review_after" in input) {
        suggestInput.reviewAfter = parseOptionalToolDate(input.review_after);
      }
      if ("expires_at" in input) {
        suggestInput.expiresAt = parseOptionalToolDate(input.expires_at);
      }
      if (input.relationship_mode !== undefined) {
        suggestInput.relationshipMode = input.relationship_mode;
      }

      const result = await service.suggestCapture(suggestInput);

      const output = {
        status: result.status,
        memory_writes: false as const,
        requires_confirmation: true as const,
        draft: toSuggestionDraftOutput(result.draft),
        duplicate: result.duplicate ? toToolRecord(result.duplicate) : null,
      };
      if (result.relationshipMode === "bounded" && result.relationship && result.relationshipEvidence) {
        return {
          ...output,
          relationship_mode: result.relationshipMode,
          relationship: result.relationship,
          relationship_evidence: {
            version: result.relationshipEvidence.version,
            primary_memory_id: result.relationshipEvidence.primaryMemoryId,
            candidate_limit: result.relationshipEvidence.candidateLimit,
            returned_limit: result.relationshipEvidence.returnedLimit,
            evaluated_count: result.relationshipEvidence.evaluatedCount,
            search_exhaustive: result.relationshipEvidence.searchExhaustive,
            evidence_truncated: result.relationshipEvidence.evidenceTruncated,
            reason: result.relationshipEvidence.reason,
            candidates: result.relationshipEvidence.candidates.map((candidate) => ({
              memory: toToolRecord(candidate.memory),
              matched_terms: candidate.matchedTerms,
              matched_tags: candidate.matchedTags,
              reason: candidate.reason,
            })),
          },
        };
      }
      return output;
    },

    async confirmCapture(input) {
      const confirmInput: ConfirmCaptureInput = {
        decision: input.decision,
        content: input.content,
        kind: input.kind,
        scope: resolveToolScope(input.scope, options.projectScope),
        tags: input.tags,
        source: input.source,
        reason: input.reason,
        confirm: input.confirm,
        actor: "nuzo:mcp",
      };
      if (input.confidence !== undefined) {
        confirmInput.confidence = input.confidence;
      }
      if ("confidence_state" in input) {
        confirmInput.confidenceState = input.confidence_state ?? null;
      }
      if ("provenance" in input) {
        confirmInput.provenance = input.provenance ?? null;
      }
      if ("review_after" in input) {
        confirmInput.reviewAfter = parseOptionalToolDate(input.review_after);
      }
      if ("expires_at" in input) {
        confirmInput.expiresAt = parseOptionalToolDate(input.expires_at);
      }
      if (input.target_memory_id !== undefined) {
        confirmInput.targetMemoryId = input.target_memory_id;
      }
      if (input.expected_revision !== undefined) {
        confirmInput.expectedRevision = input.expected_revision;
      }
      const result = await service.confirmCapture(confirmInput);
      return {
        decision: result.decision,
        status: result.status,
        memory_writes: result.memoryWrites,
        requires_confirmation: false,
        reason: result.reason,
        memory: result.memory ? toToolRecord(result.memory) : null,
      };
    },

    async list(input) {
      const listInput: ListMemoriesInput = {
        includeArchived: input.include_archived,
        needsReview: input.needs_review === true,
        limit: input.limit + 1,
      };
      if (input.scope !== undefined) {
        listInput.scope = resolveToolScope(input.scope, options.projectScope);
      }
      if (input.tags.length > 0) {
        listInput.tags = input.tags;
      }
      if (input.cursor !== undefined) {
        listInput.cursor = input.cursor;
      }

      const memories = await service.list(listInput);
      const page = memories.slice(0, input.limit);
      return {
        memories: await Promise.all(page.map(async (memory) => ({
          ...toToolRecord(memory),
          relations: (await service.relations({
            memoryId: memory.id,
            includeReverse: true,
            limit: 10,
          })).map((relation) => toToolRelation(relation, memory.id)),
        }))),
        next_cursor: memories.length > input.limit && page.length > 0
          ? encodeMemoryListCursor(page[page.length - 1]!)
          : null,
        limit: input.limit,
        truncated: memories.length > input.limit,
      };
    },

    async show(input) {
      const inspection = await service.inspect({
        id: input.id,
        historyLimit: input.history_limit,
      });
      return {
        memory: {
          ...toToolRecord(inspection.memory),
          relations: inspection.relations.map((relation) => toToolRelation(relation, inspection.memory.id)),
        },
        relations: inspection.relations.map((relation) => toToolRelation(relation, inspection.memory.id)),
        events: inspection.events.map(toToolEvent),
      };
    },

    async challenge(input) {
      const result = await service.challenge({
        id: input.id,
        outcome: input.outcome,
        reason: input.reason,
        actor: "nuzo:mcp",
        ...(input.expected_revision === undefined ? {} : { expectedRevision: input.expected_revision }),
        ...(input.superseded_by_memory_id === undefined ? {} : { supersededByMemoryId: input.superseded_by_memory_id }),
      });
      return {
        memory: toToolRecord(result.memory),
        outcome: result.outcome,
        relation: result.relation === null ? null : toToolRelation(result.relation, result.memory.id),
      };
    },

    async relate(input) {
      const relation = await service.relate({
        sourceMemoryId: input.source_memory_id,
        targetMemoryId: input.target_memory_id,
        relation: input.relation,
        actor: "nuzo:mcp",
        ...(input.reason === undefined ? {} : { reason: input.reason }),
      });
      return {
        relation: toToolRelation(relation),
      };
    },

    async relations(input) {
      const relations = await service.relations({
        memoryId: input.memory_id,
        includeReverse: input.include_reverse,
        limit: input.limit,
      });
      return {
        relations: relations.map((relation) => toToolRelation(relation, input.memory_id)),
      };
    },

    async unrelate(input) {
      await service.forgetRelation({
        id: input.id,
        actor: "nuzo:mcp",
        ...(input.reason === undefined ? {} : { reason: input.reason }),
      });
      return {
        id: input.id,
        removed: true,
      };
    },

    async update(input) {
      const updateInput: UpdateMemoryInput = {
        id: input.id,
        actor: "nuzo:mcp",
      };
      if (input.expected_revision !== undefined) {
        updateInput.expectedRevision = input.expected_revision;
      }
      if (input.content !== undefined) {
        updateInput.content = input.content;
      }
      if (input.kind !== undefined) {
        updateInput.kind = input.kind;
      }
      if (input.scope !== undefined) {
        updateInput.scope = resolveToolScope(input.scope, options.projectScope);
      }
      if (input.tags !== undefined) {
        updateInput.tags = input.tags;
      }
      if (input.confidence !== undefined) {
        updateInput.confidence = input.confidence;
      }
      if ("confidence_state" in input) {
        updateInput.confidenceState = input.confidence_state ?? null;
      }
      if ("provenance" in input) {
        updateInput.provenance = input.provenance ?? null;
      }
      if ("review_after" in input) {
        updateInput.reviewAfter = parseOptionalToolDate(input.review_after);
      }
      if ("expires_at" in input) {
        updateInput.expiresAt = parseOptionalToolDate(input.expires_at);
      }

      const memory = await service.update(updateInput);
      return {
        memory: toToolRecord(memory),
      };
    },

    async history(input) {
      const historyInput = {
        limit: input.limit + 1,
      };
      if (input.cursor !== undefined) {
        Object.assign(historyInput, { cursor: input.cursor });
      }
      const events = await service.history(input.id, historyInput);
      const page = events.slice(0, input.limit);
      return {
        events: page.map(toToolEvent),
        next_cursor: events.length > input.limit && page.length > 0
          ? encodeMemoryEventCursor(page[page.length - 1]!)
          : null,
        limit: input.limit,
        truncated: events.length > input.limit,
      };
    },

    async audit(input) {
      const auditInput: AuditEventFilter = {
        limit: input.limit,
      };
      if (input.memory_id !== undefined) {
        auditInput.memoryId = input.memory_id;
      }
      if (input.event_type.length > 0) {
        auditInput.eventTypes = input.event_type as NonNullable<AuditEventFilter["eventTypes"]>;
      }
      if (input.actor !== undefined) {
        auditInput.actor = input.actor;
      }
      if (input.scope !== undefined) {
        auditInput.scope = resolveToolScope(input.scope, options.projectScope);
      }
      if (input.since !== undefined) {
        auditInput.since = new Date(input.since);
      }
      if (input.until !== undefined) {
        auditInput.until = new Date(input.until);
      }

      const events = await service.audit(auditInput);
      return {
        events: events.map(toToolEvent),
      };
    },

    async forget(input) {
      const forgetInput: ForgetMemoryInput = {
        id: input.id,
        mode: input.mode,
        confirm: input.confirm,
        actor: "nuzo:mcp",
      };
      if (input.expected_revision !== undefined) {
        forgetInput.expectedRevision = input.expected_revision;
      }
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

    async forgetMany(input) {
      const forgetInput: ForgetMemoriesInput = {
        tags: input.tags,
        all: input.all,
        mode: input.mode,
        confirm: input.confirm,
        dryRun: input.dry_run,
        actor: "nuzo:mcp",
      };
      if (input.scope !== undefined) {
        forgetInput.scope = resolveToolScope(input.scope, options.projectScope);
      }
      if (input.reason !== undefined) {
        forgetInput.reason = input.reason;
      }

      const result = await service.forgetMany(forgetInput);
      return {
        matched: result.matched,
        affected: result.affected,
        mode: result.mode,
        dry_run: result.dryRun,
        ids: result.ids,
      };
    },

    async exportMemories(input) {
      const exportInput: ListMemoriesInput & { actor: string } = {
        actor: "nuzo:mcp",
        includeArchived: input.include_archived,
        limit: input.limit,
      };
      if (input.scope !== undefined) {
        exportInput.scope = resolveToolScope(input.scope, options.projectScope);
      }
      if (input.tags.length > 0) {
        exportInput.tags = input.tags;
      }
      if (input.cursor !== undefined) {
        exportInput.cursor = input.cursor;
      }

      const records = await service.list({
        ...exportInput,
        limit: input.limit + 1,
      });
      const document = await service.exportMemories(exportInput);
      const page = document.memories.slice(0, input.limit);
      const lastRecord = records.slice(0, input.limit).at(-1);
      const nextCursor = records.length > input.limit && lastRecord !== undefined
        ? encodeMemoryListCursor(lastRecord)
        : null;
      return {
        document: {
          ...document,
          memories: page,
        },
        next_cursor: nextCursor,
        limit: input.limit,
        truncated: records.length > input.limit,
      };
    },

    async importMemories(input) {
      const importInput: ImportMemoriesInput = {
        document: input.document,
        actor: "nuzo:mcp",
        dryRun: input.dry_run,
      };
      if (input.scope !== undefined) {
        importInput.scope = resolveToolScope(input.scope, options.projectScope);
      }

      const result = await service.importMemories(importInput);
      return {
        imported: result.imported,
        skipped: result.skipped,
        dry_run: result.dryRun,
      };
    },

    async doctor() {
      return createDoctorOutput(service, options.doctorDiagnostics, options.storePath);
    },
  };
}
