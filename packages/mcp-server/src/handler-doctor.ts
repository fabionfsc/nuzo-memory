import type {
  MemoryRecord,
  MemoryScope,
  MemoryService,
  RuntimeFileSafetyReport,
  SQLiteIntegrityReport,
} from "@nuzo/memory-core";
import { memoryToolNames } from "./tool-contract.js";
import type {
  MemoryDoctorDiagnostics,
  MemoryDoctorFileSafetyOutput,
  MemoryDoctorIntegrityOutput,
  MemoryToolHandlers,
} from "./handlers.js";

export async function createDoctorOutput(
  service: MemoryService,
  diagnostics: MemoryDoctorDiagnostics | undefined,
  storePath: string | undefined,
): ReturnType<MemoryToolHandlers["doctor"]> {
  const warnings: string[] = [];
  let activeMemories: number | null = null;
  let archivedMemories: number | null = null;
  let totalMemories: number | null = null;
  let readable = false;

  try {
    const [active, all] = await Promise.all([
      listDiagnosticMemories(service, diagnostics?.diagnosticScopes, false),
      listDiagnosticMemories(service, diagnostics?.diagnosticScopes, true),
    ]);
    activeMemories = active.length;
    totalMemories = all.length;
    archivedMemories = Math.max(totalMemories - activeMemories, 0);
    readable = true;
  } catch (error) {
    warnings.push(`memory store read check failed: ${formatDoctorError(error)}`);
  }

  const writableCheck = diagnostics?.writable === undefined
    ? "not_performed"
    : diagnostics.writable
      ? "writable"
      : "not_writable";
  if (writableCheck === "not_writable") {
    warnings.push("memory store writability check failed");
  }

  const schema = formatSchemaDiagnostics(diagnostics?.schema);
  if (schema.status === "outdated") {
    warnings.push("memory store schema is older than the supported version");
  }
  if (schema.status === "newer") {
    warnings.push("memory store schema is newer than the supported version");
  }
  const integrity = formatIntegrityDiagnostics(resolveIntegrityDiagnostics(diagnostics?.integrity));
  if (integrity.status === "failed") {
    warnings.push(...integrity.errors.map((error) => `memory integrity: ${error}`));
  }
  if (integrity.status === "missing") {
    warnings.push("memory integrity: memory store does not exist");
  }
  const fileSafety = resolveFileSafetyDiagnostics(diagnostics?.fileSafety);
  if (fileSafety.unsafe.length > 0) {
    warnings.push(`${fileSafety.unsafe.length} runtime path permission, ownership, or symlink finding(s)`);
  }
  if (fileSafety.stale_artifacts.length > 0) {
    warnings.push(`${fileSafety.stale_artifacts.length} stale runtime artifact(s) require review`);
  }
  if (fileSafety.unexpected_files.length > 0) {
    warnings.push(`${fileSafety.unexpected_files.length} unexpected file(s) exist in Nuzo runtime directories`);
  }

  return Promise.resolve({
    ok: warnings.length === 0,
    network: "disabled",
    store: {
      path: storePath ?? null,
      readable,
      writable_check: writableCheck,
    },
    config: {
      project_scope: diagnostics?.runtime?.projectScope ?? null,
      project_root_source: diagnostics?.runtime?.provenance.projectRoot ?? null,
      config_source: diagnostics?.runtime?.provenance.config ?? null,
      store_source: diagnostics?.runtime?.provenance.store ?? null,
      scope_source: diagnostics?.runtime?.provenance.scope ?? null,
      adjustments: diagnostics?.runtime?.adjustments ?? [],
    },
    authorization: {
      mode: diagnostics?.runtime?.authorizationMode ?? "unknown",
      source: diagnostics?.runtime?.provenance.authorization ?? null,
      allowed_scopes: diagnostics?.runtime?.authorizedScopes ?? null,
    },
    schema,
    counts: {
      active_memories: activeMemories,
      archived_memories: archivedMemories,
      total_memories: totalMemories,
    },
    integrity,
    file_safety: fileSafety,
    secret_scan: {
      status: "not_performed",
      guidance: "Run nuzo memory doctor --scan-secrets locally for an explicit active-record scan.",
    },
    lifecycle: {
      recall_hook: "available",
      automatic_host_hooks: "verify_in_host",
      autoload_tag: "autoload",
      supported_events: ["SessionStart", "UserPromptSubmit"],
    },
    tools: [...memoryToolNames],
    warnings,
  });
}

function resolveFileSafetyDiagnostics(
  diagnostics: MemoryDoctorDiagnostics["fileSafety"],
): MemoryDoctorFileSafetyOutput {
  const report = typeof diagnostics === "function" ? diagnostics() : diagnostics;
  if (report === undefined) {
    return {
      permission_semantics: "not_performed",
      inspected_paths: 0,
      unsafe: [],
      stale_artifacts: [],
      unexpected_files: [],
    };
  }
  return {
    permission_semantics: report.permissionSemantics,
    inspected_paths: report.inspectedPaths,
    unsafe: report.unsafe.map((finding: RuntimeFileSafetyReport["unsafe"][number]) => ({
      path: finding.path,
      type: finding.type,
      reason: finding.reason,
      actual_mode: finding.actualMode,
      expected_mode: finding.expectedMode,
    })),
    stale_artifacts: report.staleArtifacts,
    unexpected_files: report.unexpectedFiles,
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
