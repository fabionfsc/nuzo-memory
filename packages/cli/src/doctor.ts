import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { dirname } from "node:path";
import {
  inspectRuntimeFileSafety,
  inspectSQLiteMemoryStore,
  RegexSecretScanner,
  SQLiteMemoryDatabase,
  type MemoryScope,
  type NuzoRuntimeConfig,
  type RuntimeFileSafetyReport,
  type SQLiteIntegrityReport,
} from "@nuzo/memory-core";
import { pathExists } from "./filesystem.js";
import { resolveRuntimeConfig, type GlobalOptions } from "./runtime.js";

export interface DoctorReport {
  storePath: string;
  storeExists: boolean;
  storeDirectory: string;
  storeDirectoryExists: boolean;
  scope: MemoryScope;
  projectScope: `project:${string}`;
  authorizationMode: "administrator";
  provenance: NuzoRuntimeConfig["provenance"];
  adjustments: NuzoRuntimeConfig["adjustments"];
  network: "disabled";
  gitTracking: GitTrackingReport;
  integrity: SQLiteIntegrityReport;
  fileSafety: RuntimeFileSafetyReport;
  secretScan: DoctorSecretScanReport;
  warnings: string[];
}

type DoctorSecretScanReport =
  | { status: "not_requested"; scannedRecords: 0; flaggedRecords: 0; findingsByKind: Record<string, never> }
  | { status: "completed"; scannedRecords: number; flaggedRecords: number; findingsByKind: Record<string, number> };

type GitTrackingReport =
  | { status: "clean"; trackedFiles: string[] }
  | { status: "tracked"; trackedFiles: string[] }
  | { status: "unavailable"; reason: string; trackedFiles: [] }
  | { status: "skipped"; reason: string; trackedFiles: [] };

export async function createDoctorReport(
  options: GlobalOptions,
  scanSecrets = false,
): Promise<DoctorReport> {
  const runtime = resolveRuntimeConfig(options);
  const storePath = runtime.storePath;
  const storeDirectory = dirname(storePath);
  const gitTracking = findTrackedMemoryFiles();
  const integrity = inspectSQLiteMemoryStore(storePath);
  const fileSafety = inspectRuntimeFileSafety({
    storePath,
    projectRoot: runtime.projectRoot,
    home: process.env.HOME ?? homedir(),
  });
  let secretScan: DoctorSecretScanReport = {
    status: "not_requested",
    scannedRecords: 0,
    flaggedRecords: 0,
    findingsByKind: {},
  };
  const warnings: string[] = [];

  if (!pathExists(storePath)) warnings.push("memory store has not been initialized");
  if (!pathExists(storeDirectory)) warnings.push("memory store directory does not exist");
  if (gitTracking.status === "tracked") {
    warnings.push(`${gitTracking.trackedFiles.length} local memory file(s) are tracked by Git`);
  }
  if (gitTracking.status === "unavailable") {
    warnings.push(`Git tracking check unavailable: ${gitTracking.reason}`);
  }
  if (pathExists(storePath) && !integrity.ok) {
    for (const error of integrity.errors) warnings.push(`Memory integrity: ${error}`);
  }
  if (pathExists(storePath)) {
    const database = new SQLiteMemoryDatabase({ path: storePath, readonly: true });
    try {
      const legacyProjectMemories = await database.list({ scope: "project:auto", includeArchived: false });
      if (legacyProjectMemories.length > 0) {
        warnings.push(`${legacyProjectMemories.length} active legacy project:auto memory(s) require scope review`);
      }
      if (scanSecrets) secretScan = await scanActiveMemorySecrets(database);
    } finally {
      database.close();
    }
  }
  if (fileSafety.unsafe.length > 0) {
    warnings.push(`${fileSafety.unsafe.length} runtime path permission, ownership, or symlink finding(s)`);
  }
  if (fileSafety.staleArtifacts.length > 0) {
    warnings.push(`${fileSafety.staleArtifacts.length} stale runtime artifact(s) require review`);
  }
  if (fileSafety.unexpectedFiles.length > 0) {
    warnings.push(`${fileSafety.unexpectedFiles.length} unexpected file(s) exist in Nuzo runtime directories`);
  }
  if (secretScan.status === "completed" && secretScan.flaggedRecords > 0) {
    warnings.push(`${secretScan.flaggedRecords} active memory record(s) matched high-confidence secret patterns`);
  }

  return {
    storePath,
    storeExists: pathExists(storePath),
    storeDirectory,
    storeDirectoryExists: pathExists(storeDirectory),
    scope: runtime.scope,
    projectScope: runtime.projectScope,
    authorizationMode: "administrator",
    provenance: runtime.provenance,
    adjustments: runtime.adjustments,
    network: "disabled",
    gitTracking,
    integrity,
    fileSafety,
    secretScan,
    warnings,
  };
}

async function scanActiveMemorySecrets(database: SQLiteMemoryDatabase): Promise<DoctorSecretScanReport> {
  const memories = await database.list({ includeArchived: false });
  const scanner = new RegexSecretScanner();
  const findingsByKind: Record<string, number> = {};
  let flaggedRecords = 0;
  for (const memory of memories) {
    const result = await scanner.scan(memory.content);
    if (!result.ok) flaggedRecords += 1;
    for (const finding of result.findings) {
      findingsByKind[finding.kind] = (findingsByKind[finding.kind] ?? 0) + 1;
    }
  }
  return { status: "completed", scannedRecords: memories.length, flaggedRecords, findingsByKind };
}

function findTrackedMemoryFiles(cwd = process.cwd()): GitTrackingReport {
  if (process.env.NUZO_DOCTOR_SKIP_GIT === "1") {
    return { status: "skipped", reason: "NUZO_DOCTOR_SKIP_GIT=1", trackedFiles: [] };
  }
  const result = spawnSync("git", [
    "ls-files", "-z", "--", ".nuzo", "*.sqlite", "*.sqlite-*",
    "*.memory.export.md", "*.memory.export.json", "memories.sqlite", "memories.sqlite-*",
  ], { cwd, encoding: "utf8" });
  if (result.error) return { status: "unavailable", reason: result.error.message, trackedFiles: [] };
  if (result.status !== 0) {
    return {
      status: "unavailable",
      reason: result.stderr.trim().split(/\r?\n/)[0] || "not a Git worktree",
      trackedFiles: [],
    };
  }
  const trackedFiles = result.stdout.split("\0").filter(Boolean);
  return trackedFiles.length === 0
    ? { status: "clean", trackedFiles }
    : { status: "tracked", trackedFiles };
}

export function formatGitTracking(report: GitTrackingReport): string {
  if (report.status === "skipped") return `Git tracking: skipped (${report.reason})`;
  if (report.status === "unavailable") return `Git tracking: unavailable (${report.reason})`;
  if (report.status === "tracked") {
    return `Git tracking: warning (${report.trackedFiles.length} local memory file(s) tracked)`;
  }
  return "Git tracking: clean";
}

export function formatFileSafety(report: RuntimeFileSafetyReport): string {
  if (report.permissionSemantics === "not_supported") {
    return "File safety: permission semantics not supported on this platform";
  }
  const findings = report.unsafe.length + report.staleArtifacts.length + report.unexpectedFiles.length;
  return findings === 0
    ? `File safety: clean (${report.inspectedPaths} path(s) inspected)`
    : `File safety: warning (${findings} finding(s))`;
}

export function formatSecretScan(report: DoctorSecretScanReport): string {
  return report.status === "not_requested"
    ? "Secret scan: not requested (use --scan-secrets for an explicit active-record scan)"
    : `Secret scan: ${report.flaggedRecords} flagged of ${report.scannedRecords} active record(s)`;
}

export function formatIntegrityReport(report: SQLiteIntegrityReport): string {
  const lines = [
    `Store: ${report.path}`,
    `Status: ${report.ok ? "ok" : "failed"}`,
    `Schema: ${report.schemaVersion ?? "unknown"} (supported ${report.supportedSchemaVersion})`,
    `SQLite integrity: ${report.integrityCheck}`,
    `Foreign key violations: ${report.foreignKeyViolations}`,
    `Memories: ${report.memoryCount}`,
    `Active memories: ${report.activeMemoryCount}`,
    `FTS rows: ${report.ftsRowCount}`,
    `Missing FTS rows: ${report.missingFtsRows}`,
    `Orphan FTS rows: ${report.orphanFtsRows}`,
  ];
  for (const error of report.errors) lines.push(`Error: ${error}`);
  return lines.join("\n");
}

export function toIntegrityOutput(report: SQLiteIntegrityReport) {
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
  };
}

export function toDoctorOutput(report: DoctorReport) {
  return {
    store_path: report.storePath,
    store_exists: report.storeExists,
    store_directory: report.storeDirectory,
    store_directory_exists: report.storeDirectoryExists,
    scope: report.scope,
    project_scope: report.projectScope,
    authorization: { mode: report.authorizationMode, source: "local_cli", allowed_scopes: null },
    config: {
      project_root_source: report.provenance.projectRoot,
      config_source: report.provenance.config,
      store_source: report.provenance.store,
      scope_source: report.provenance.scope,
      adjustments: report.adjustments,
    },
    network: report.network,
    integrity: toIntegrityOutput(report.integrity),
    file_safety: {
      permission_semantics: report.fileSafety.permissionSemantics,
      inspected_paths: report.fileSafety.inspectedPaths,
      unsafe: report.fileSafety.unsafe.map((finding) => ({
        path: finding.path,
        type: finding.type,
        reason: finding.reason,
        actual_mode: finding.actualMode,
        expected_mode: finding.expectedMode,
      })),
      stale_artifacts: report.fileSafety.staleArtifacts,
      unexpected_files: report.fileSafety.unexpectedFiles,
    },
    secret_scan: {
      status: report.secretScan.status,
      scanned_records: report.secretScan.scannedRecords,
      flagged_records: report.secretScan.flaggedRecords,
      findings_by_kind: report.secretScan.findingsByKind,
    },
    git_tracking: report.gitTracking,
    warnings: report.warnings,
    status: report.warnings.length === 0 ? "ok" : "warning",
  };
}
