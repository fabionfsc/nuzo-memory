import type {
  AuditEventFilter,
  ConfirmCaptureDecision,
  ConfirmCaptureInput,
  CaptureSuggestionDraft,
  ForgetMemoryInput,
  ForgetMemoriesInput,
  ImportMemoriesInput,
  ListMemoriesInput,
  MemoryExportDocument,
  MemoryKind,
  MemoryRecord,
  MemoryScope,
  MemoryService,
  NuzoAuthorizationMode,
  NuzoRuntimeAdjustment,
  NuzoRuntimeConfigProvenance,
  RecallMemoryResult,
  RememberMemoryInput,
  SQLiteIntegrityReport,
  SuggestCaptureInput,
  UpdateMemoryInput,
} from "@nuzo/memory-core";
import { memoryToolNames } from "./tool-contract.js";

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
  limit: number;
  cursor?: string;
}

export interface UpdateToolInput {
  id: string;
  expected_revision?: number;
  content?: string;
  kind?: MemoryKind;
  scope?: string;
  tags?: string[];
  confidence?: number;
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
      score: number;
      reason: string;
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
      score: number;
      reason: string;
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

export type MemoryToolRecord = {
  id: string;
  revision: number;
  content: string;
  kind: MemoryKind;
  scope: MemoryScope;
  tags: string[];
  source: string;
  confidence: number;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
  archived_at: string | null;
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
  reason: string;
};

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
      const response = await service.recallDetailed({
        query: input.query,
        scope: resolveToolScope(input.scope, options.projectScope),
        limit: input.limit,
        includeGlobal: input.include_global,
        retrievalMode: input.retrieval_mode ?? "fts",
        ...(input.semantic_fallback === undefined ? {} : { semanticFallback: input.semantic_fallback }),
      });

      const output: Awaited<ReturnType<MemoryToolHandlers["recall"]>> = {
        results: response.results.map(toRecallOutput),
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
        results: results.map(toRecallOutput),
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
        actor: input.actor,
      };
      if (input.confidence !== undefined) {
        confirmInput.confidence = input.confidence;
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
        memories: page.map(toToolRecord),
        next_cursor: memories.length > input.limit && page.length > 0
          ? encodeMemoryListCursor(page[page.length - 1]!)
          : null,
        limit: input.limit,
        truncated: memories.length > input.limit,
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
      const warnings: string[] = [];
      let activeMemories: number | null = null;
      let archivedMemories: number | null = null;
      let totalMemories: number | null = null;
      let readable = false;

      try {
        const [active, all] = await Promise.all([
          listDiagnosticMemories(service, options.doctorDiagnostics?.diagnosticScopes, false),
          listDiagnosticMemories(service, options.doctorDiagnostics?.diagnosticScopes, true),
        ]);
        activeMemories = active.length;
        totalMemories = all.length;
        archivedMemories = Math.max(totalMemories - activeMemories, 0);
        readable = true;
      } catch (error) {
        warnings.push(`memory store read check failed: ${formatDoctorError(error)}`);
      }

      const writableCheck = options.doctorDiagnostics?.writable === undefined
        ? "not_performed"
        : options.doctorDiagnostics.writable
          ? "writable"
          : "not_writable";
      if (writableCheck === "not_writable") {
        warnings.push("memory store writability check failed");
      }

      const schema = formatSchemaDiagnostics(options.doctorDiagnostics?.schema);
      if (schema.status === "outdated") {
        warnings.push("memory store schema is older than the supported version");
      }
      if (schema.status === "newer") {
        warnings.push("memory store schema is newer than the supported version");
      }
      const integrity = formatIntegrityDiagnostics(resolveIntegrityDiagnostics(options.doctorDiagnostics?.integrity));
      if (integrity.status === "failed") {
        warnings.push(...integrity.errors.map((error) => `memory integrity: ${error}`));
      }
      if (integrity.status === "missing") {
        warnings.push("memory integrity: memory store does not exist");
      }

      return {
        ok: warnings.length === 0,
        network: "disabled",
        store: {
          path: options.storePath ?? null,
          readable,
          writable_check: writableCheck,
        },
        config: {
          project_scope: options.doctorDiagnostics?.runtime?.projectScope ?? null,
          project_root_source: options.doctorDiagnostics?.runtime?.provenance.projectRoot ?? null,
          config_source: options.doctorDiagnostics?.runtime?.provenance.config ?? null,
          store_source: options.doctorDiagnostics?.runtime?.provenance.store ?? null,
          scope_source: options.doctorDiagnostics?.runtime?.provenance.scope ?? null,
          adjustments: options.doctorDiagnostics?.runtime?.adjustments ?? [],
        },
        authorization: {
          mode: options.doctorDiagnostics?.runtime?.authorizationMode ?? "unknown",
          source: options.doctorDiagnostics?.runtime?.provenance.authorization ?? null,
          allowed_scopes: options.doctorDiagnostics?.runtime?.authorizedScopes ?? null,
        },
        schema,
        counts: {
          active_memories: activeMemories,
          archived_memories: archivedMemories,
          total_memories: totalMemories,
        },
        integrity,
        lifecycle: {
          recall_hook: "available",
          automatic_host_hooks: "verify_in_host",
          autoload_tag: "autoload",
          supported_events: ["SessionStart", "UserPromptSubmit"],
        },
        tools: [...memoryToolNames],
        warnings,
      };
    },
  };
}

async function listDiagnosticMemories(
  service: MemoryService,
  scopes: readonly MemoryScope[] | undefined,
  includeArchived: boolean,
): Promise<MemoryRecord[]> {
  if (scopes === undefined) {
    return service.list({ includeArchived });
  }
  const scoped = await Promise.all(
    scopes.map((scope) => service.list({ scope, includeArchived })),
  );
  return [...new Map(scoped.flat().map((memory) => [memory.id, memory])).values()];
}

export function formatIntegrityDiagnostics(
  report: SQLiteIntegrityReport | undefined,
): MemoryDoctorIntegrityOutput {
  if (report === undefined) {
    return {
      ok: null,
      path: null,
      schema_version: null,
      supported_schema_version: null,
      integrity_check: null,
      foreign_key_violations: null,
      memory_count: null,
      active_memory_count: null,
      fts_row_count: null,
      missing_fts_rows: null,
      orphan_fts_rows: null,
      errors: [],
      status: "not_performed",
    };
  }

  return {
    ok: report.ok,
    path: report.path,
    schema_version: report.schemaVersion,
    supported_schema_version: report.supportedSchemaVersion,
    integrity_check: report.integrityCheck,
    foreign_key_violations: report.foreignKeyViolations,
    memory_count: report.memoryCount,
    active_memory_count: report.activeMemoryCount,
    fts_row_count: report.ftsRowCount,
    missing_fts_rows: report.missingFtsRows,
    orphan_fts_rows: report.orphanFtsRows,
    errors: report.errors,
    status: report.ok ? "ok" : report.integrityCheck === "missing" ? "missing" : "failed",
  };
}

function resolveIntegrityDiagnostics(
  integrity: MemoryDoctorDiagnostics["integrity"],
): SQLiteIntegrityReport | undefined {
  return typeof integrity === "function" ? integrity() : integrity;
}

function formatSchemaDiagnostics(
  schema: MemoryDoctorDiagnostics["schema"],
): {
  current_version: number | null;
  supported_version: number | null;
  status: "current" | "outdated" | "newer" | "not_performed";
} {
  if (schema === undefined) {
    return {
      current_version: null,
      supported_version: null,
      status: "not_performed",
    };
  }

  return {
    current_version: schema.currentVersion,
    supported_version: schema.supportedVersion,
    status: schema.currentVersion === schema.supportedVersion
      ? "current"
      : schema.currentVersion < schema.supportedVersion
        ? "outdated"
        : "newer",
  };
}

function formatDoctorError(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }
  return "unknown error";
}

function buildRecallHookQuery(taskContext: string): string {
  return taskContext.trim().replace(/\s+/g, " ").slice(0, 500);
}

function clampRecallHookLimit(limit: number | undefined): number {
  if (limit === undefined) {
    return 5;
  }
  return Math.min(Math.max(Math.trunc(limit), 1), 8);
}

function resolveToolScope(
  scope: string,
  projectScope: `project:${string}` | undefined,
): MemoryScope {
  if (scope === "project:auto" && projectScope !== undefined) {
    return projectScope;
  }
  return scope as MemoryScope;
}

function toRecallOutput(result: RecallMemoryResult) {
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

function toSuggestionDraftOutput(draft: CaptureSuggestionDraft): CaptureSuggestionToolDraft {
  return {
    content: draft.content,
    kind: draft.kind,
    scope: draft.scope,
    tags: draft.tags,
    source: draft.source,
    confidence: draft.confidence,
    reason: draft.reason,
  };
}

function toToolRecord(memory: MemoryRecord): MemoryToolRecord {
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

function encodeMemoryListCursor(memory: MemoryRecord): string {
  return Buffer.from(JSON.stringify({
    updated_at: memory.updatedAt.toISOString(),
    created_at: memory.createdAt.toISOString(),
    id: memory.id,
  }), "utf8").toString("base64url");
}

function encodeMemoryEventCursor(event: { id: string; createdAt: Date }): string {
  return Buffer.from(JSON.stringify({
    created_at: event.createdAt.toISOString(),
    id: event.id,
  }), "utf8").toString("base64url");
}

function toToolEvent(event: {
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
