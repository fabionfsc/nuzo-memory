import Database from "better-sqlite3";
import {
  chmodSync,
  closeSync,
  constants as fsConstants,
  copyFileSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  realpathSync,
  renameSync,
  rmSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { NuzoMemoryError } from "../errors.js";
import { schemaVersion } from "./schema.js";

export interface SQLiteIntegrityReport {
  ok: boolean;
  canonicalOk: boolean;
  ftsOk: boolean;
  ftsSchemaOk: boolean;
  path: string;
  schemaVersion: number | null;
  supportedSchemaVersion: number;
  integrityCheck: string;
  foreignKeyViolations: number;
  memoryCount: number;
  activeMemoryCount: number;
  ftsRowCount: number;
  missingFtsRows: number;
  orphanFtsRows: number;
  duplicateFtsRows: number;
  mismatchedFtsRows: number;
  errors: string[];
}

export interface SQLiteBackupResult {
  sourcePath: string;
  backupPath: string;
  pages: number;
  remainingPages: number;
  report: SQLiteIntegrityReport;
}

export interface SQLiteRestoreResult {
  backupPath: string;
  targetPath: string;
  report: SQLiteIntegrityReport;
}

export interface SQLiteFtsRepairPlan {
  sourcePath: string;
  repairRequired: boolean;
  repairable: boolean;
  report: SQLiteIntegrityReport;
}

export interface SQLiteFtsRepairResult {
  sourcePath: string;
  backupPath: string | null;
  repaired: boolean;
  pages: number;
  remainingPages: number;
  before: SQLiteIntegrityReport;
  backup: SQLiteIntegrityReport | null;
  after: SQLiteIntegrityReport;
}

export async function backupSQLiteMemoryStore(input: {
  sourcePath: string;
  backupPath: string;
  overwrite?: boolean;
}): Promise<SQLiteBackupResult> {
  const sourcePath = resolve(input.sourcePath);
  const backupPath = resolve(input.backupPath);
  if (sourcePath === backupPath) {
    throw new NuzoMemoryError("MEMORY_BACKUP_TARGET_CONFLICT", "Backup path must differ from the source store path.");
  }
  if (!existsSync(sourcePath)) {
    throw new NuzoMemoryError("MEMORY_BACKUP_SOURCE_MISSING", "Backup source store does not exist.", {
      path: sourcePath,
    });
  }
  if (existsSync(backupPath) && input.overwrite !== true) {
    throw new NuzoMemoryError("MEMORY_BACKUP_EXISTS", "Backup path already exists. Use --overwrite to replace it.", {
      path: backupPath,
    });
  }

  mkdirSync(dirname(backupPath), { recursive: true, mode: 0o700 });
  rmSQLiteFileSet(backupPath);
  const source = new Database(sourcePath, { readonly: true, fileMustExist: true });
  try {
    source.pragma("busy_timeout = 5000");
    const backup = await source.backup(backupPath);
    chmodSQLiteFileSet(backupPath);
    const report = inspectSQLiteMemoryStore(backupPath);
    if (!report.ok) {
      rmSQLiteFileSet(backupPath);
      throw new NuzoMemoryError("MEMORY_BACKUP_INVALID", "Created backup failed integrity validation.", {
        path: backupPath,
        errors: report.errors,
      });
    }
    return {
      sourcePath,
      backupPath,
      pages: backup.totalPages,
      remainingPages: backup.remainingPages,
      report,
    };
  } finally {
    source.close();
  }
}

export function restoreSQLiteMemoryStore(input: {
  backupPath: string;
  targetPath: string;
  overwrite?: boolean;
}): SQLiteRestoreResult {
  const backupPath = resolve(input.backupPath);
  const targetPath = resolve(input.targetPath);
  if (backupPath === targetPath) {
    throw new NuzoMemoryError("MEMORY_RESTORE_TARGET_CONFLICT", "Restore backup path must differ from the target store path.");
  }
  if (!existsSync(backupPath)) {
    throw new NuzoMemoryError("MEMORY_RESTORE_SOURCE_MISSING", "Restore backup path does not exist.", {
      path: backupPath,
    });
  }
  if (existsSync(targetPath) && input.overwrite !== true) {
    throw new NuzoMemoryError("MEMORY_RESTORE_CONFIRMATION_REQUIRED", "Restore would replace an existing store. Re-run with --yes to confirm.", {
      path: targetPath,
    });
  }

  const backupReport = inspectSQLiteMemoryStore(backupPath);
  if (!backupReport.ok) {
    throw new NuzoMemoryError("MEMORY_RESTORE_SOURCE_INVALID", "Restore backup failed integrity validation.", {
      path: backupPath,
      errors: backupReport.errors,
    });
  }

  mkdirSync(dirname(targetPath), { recursive: true, mode: 0o700 });
  const temporaryPath = `${targetPath}.restore-${randomUUID()}`;
  try {
    copyFileSync(backupPath, temporaryPath);
    chmodSync(temporaryPath, 0o600);
    const temporaryReport = inspectSQLiteMemoryStore(temporaryPath);
    if (!temporaryReport.ok) {
      throw new NuzoMemoryError("MEMORY_RESTORE_COPY_INVALID", "Restore copy failed integrity validation.", {
        path: temporaryPath,
        errors: temporaryReport.errors,
      });
    }
    rmSQLiteFileSet(targetPath);
    renameSync(temporaryPath, targetPath);
    chmodSQLiteFileSet(targetPath);
    return {
      backupPath,
      targetPath,
      report: inspectSQLiteMemoryStore(targetPath),
    };
  } catch (error) {
    rmSQLiteFileSet(temporaryPath);
    if (error instanceof NuzoMemoryError) {
      throw error;
    }
    throw new NuzoMemoryError("MEMORY_RESTORE_FAILED", "Memory store restore failed.", {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}

export function planSQLiteFtsRepair(path: string): SQLiteFtsRepairPlan {
  const report = inspectSQLiteMemoryStore(path);
  return {
    sourcePath: report.path,
    repairRequired: !report.ftsOk,
    repairable: report.schemaVersion === schemaVersion &&
      report.canonicalOk &&
      report.ftsSchemaOk,
    report,
  };
}

export async function repairSQLiteFtsIndex(input: {
  sourcePath: string;
  backupPath: string;
  confirm?: boolean;
}): Promise<SQLiteFtsRepairResult> {
  if (input.confirm !== true) {
    throw new NuzoMemoryError(
      "MEMORY_FTS_REPAIR_CONFIRMATION_REQUIRED",
      "FTS repair requires explicit confirmation.",
    );
  }

  const sourcePath = resolve(input.sourcePath);
  const backupPath = resolve(input.backupPath);
  if (sqliteFileSetsOverlap(sourcePath, backupPath)) {
    throw new NuzoMemoryError(
      "MEMORY_FTS_REPAIR_BACKUP_CONFLICT",
      "FTS repair backup files must not overlap the source SQLite fileset.",
    );
  }
  assertNoSymlinkLeaf(sourcePath);
  assertNoSymlinkLeaf(backupPath);
  const sourceIdentity = readFileIdentity(sourcePath);

  const initialPlan = planSQLiteFtsRepair(sourcePath);
  assertFileIdentity(sourcePath, sourceIdentity);
  assertFtsRepairable(initialPlan);
  if (!initialPlan.repairRequired) {
    return {
      sourcePath,
      backupPath: null,
      repaired: false,
      pages: 0,
      remainingPages: 0,
      before: initialPlan.report,
      backup: null,
      after: initialPlan.report,
    };
  }
  if (sqliteFileSetExists(backupPath)) {
    throw new NuzoMemoryError(
      "MEMORY_BACKUP_EXISTS",
      "Backup path already exists. Choose a different --backup-path.",
      { path: backupPath },
    );
  }

  mkdirSync(dirname(backupPath), { recursive: true, mode: 0o700 });
  assertNoSymlinkLeaf(backupPath);
  if (sqliteFileSetsOverlap(sourcePath, backupPath)) {
    throw new NuzoMemoryError(
      "MEMORY_FTS_REPAIR_BACKUP_CONFLICT",
      "FTS repair backup files must not overlap the source SQLite fileset.",
    );
  }
  const temporaryBackupPath = `${backupPath}.tmp-${randomUUID()}`;
  const writer = new Database(sourcePath, { fileMustExist: true });
  let transactionOpen = false;
  let sourceCommitted = false;
  let backupPublished = false;
  let backupValidated = false;
  let backupPages = 0;
  let backupRemainingPages = 0;
  let lockedPlan = initialPlan;
  let backupReport: SQLiteIntegrityReport | null = null;
  try {
    writer.pragma("busy_timeout = 5000");
    writer.pragma("foreign_keys = ON");
    writer.exec("BEGIN IMMEDIATE");
    transactionOpen = true;
    assertFileIdentity(sourcePath, sourceIdentity);

    // Re-run preflight while holding the writer reservation. A second local
    // process may have repaired or changed the store after the dry-run.
    lockedPlan = planSQLiteFtsRepair(sourcePath);
    assertFileIdentity(sourcePath, sourceIdentity);
    assertFtsRepairable(lockedPlan);
    if (!lockedPlan.repairRequired) {
      writer.exec("ROLLBACK");
      transactionOpen = false;
      return {
        sourcePath,
        backupPath: null,
        repaired: false,
        pages: 0,
        remainingPages: 0,
        before: lockedPlan.report,
        backup: null,
        after: lockedPlan.report,
      };
    }

    // better-sqlite3 cannot back up the same connection while it owns an
    // explicit transaction. A readonly sibling can take the WAL-safe snapshot
    // while BEGIN IMMEDIATE prevents concurrent writers from racing it.
    createPrivateFileExclusive(temporaryBackupPath);
    const snapshot = new Database(sourcePath, { readonly: true, fileMustExist: true });
    try {
      snapshot.pragma("busy_timeout = 5000");
      assertFileIdentity(sourcePath, sourceIdentity);
      const backup = await snapshot.backup(temporaryBackupPath);
      backupPages = backup.totalPages;
      backupRemainingPages = backup.remainingPages;
    } finally {
      snapshot.close();
    }
    assertFileIdentity(sourcePath, sourceIdentity);
    chmodSQLiteFileSet(temporaryBackupPath);

    // Normalize only the derived FTS table in the recovery copy. Canonical
    // rows remain the exact pre-repair snapshot and the ordinary strict restore
    // command can validate and consume this backup.
    rebuildFtsAtPath(temporaryBackupPath);
    backupReport = inspectSQLiteMemoryStore(temporaryBackupPath);
    if (!backupReport.ok) {
      throw new NuzoMemoryError(
        "MEMORY_FTS_REPAIR_BACKUP_INVALID",
        "FTS repair backup failed validation.",
        { path: temporaryBackupPath, errors: backupReport.errors },
      );
    }
    if (sqliteFileSetExists(backupPath)) {
      throw new NuzoMemoryError(
        "MEMORY_BACKUP_EXISTS",
        "Backup path appeared while the repair backup was being prepared.",
        { path: backupPath },
      );
    }
    try {
      linkSync(temporaryBackupPath, backupPath);
    } catch (error) {
      if (isNodeError(error, "EEXIST")) {
        throw new NuzoMemoryError(
          "MEMORY_BACKUP_EXISTS",
          "Backup path appeared while the repair backup was being published.",
          { path: backupPath },
        );
      }
      throw error;
    }
    backupPublished = true;
    if (pathEntryExists(`${backupPath}-wal`) || pathEntryExists(`${backupPath}-shm`)) {
      removeFileIfIdentityMatches(backupPath, readFileIdentity(temporaryBackupPath));
      backupPublished = false;
      throw new NuzoMemoryError(
        "MEMORY_BACKUP_EXISTS",
        "Backup sidecar path appeared while the repair backup was being published.",
        { path: backupPath },
      );
    }
    chmodSync(backupPath, 0o600);
    backupReport = inspectSQLiteMemoryStore(backupPath);
    if (!backupReport.ok) {
      removeFileIfIdentityMatches(backupPath, readFileIdentity(temporaryBackupPath));
      backupPublished = false;
      throw new NuzoMemoryError(
        "MEMORY_FTS_REPAIR_BACKUP_INVALID",
        "Published FTS repair backup failed validation.",
        { path: backupPath, errors: backupReport.errors },
      );
    }
    backupValidated = true;
    rmSQLiteFileSet(temporaryBackupPath);

    assertFileIdentity(sourcePath, sourceIdentity);
    rebuildFtsInDatabase(writer);
    assertFtsRebuildComplete(writer);
    writer.exec("COMMIT");
    transactionOpen = false;
    sourceCommitted = true;
    assertFileIdentity(sourcePath, sourceIdentity);
  } catch (error) {
    if (transactionOpen) {
      try {
        writer.exec("ROLLBACK");
      } catch {
        // Preserve the original error; SQLite also rolls back on close.
      }
    }
    rmSQLiteFileSet(temporaryBackupPath);
    if (error instanceof NuzoMemoryError) {
      if (backupPublished && backupValidated && !sourceCommitted) {
        throw new NuzoMemoryError(
          "MEMORY_FTS_REPAIR_FAILED",
          "FTS repair failed and the source transaction was rolled back; the validated backup was retained.",
          { backupPath, causeCode: error.code },
        );
      }
      throw error;
    }
    throw new NuzoMemoryError("MEMORY_FTS_REPAIR_FAILED", "FTS repair failed.", {
      cause: error instanceof Error ? error.message : String(error),
      ...(backupPublished && backupValidated ? { backupPath } : {}),
    });
  } finally {
    writer.close();
  }

  const after = inspectSQLiteMemoryStore(sourcePath);
  if (!after.ok) {
    throw new NuzoMemoryError(
      "MEMORY_FTS_REPAIR_FAILED",
      "FTS repair completed but the source store failed validation.",
      { backupPath, errors: after.errors },
    );
  }
  return {
    sourcePath,
    backupPath,
    repaired: true,
    pages: backupPages,
    remainingPages: backupRemainingPages,
    before: lockedPlan.report,
    backup: backupReport,
    after,
  };
}

export function inspectSQLiteMemoryStore(path: string): SQLiteIntegrityReport {
  const storePath = resolve(path);
  let storeStats: ReturnType<typeof lstatSync>;
  try {
    storeStats = lstatSync(storePath);
  } catch (error) {
    const missing = isNodeError(error, "ENOENT");
    return {
      ok: false,
      canonicalOk: false,
      ftsOk: false,
      ftsSchemaOk: false,
      path: storePath,
      schemaVersion: null,
      supportedSchemaVersion: schemaVersion,
      integrityCheck: missing ? "missing" : "error",
      foreignKeyViolations: 0,
      memoryCount: 0,
      activeMemoryCount: 0,
      ftsRowCount: 0,
      missingFtsRows: 0,
      orphanFtsRows: 0,
      duplicateFtsRows: 0,
      mismatchedFtsRows: 0,
      errors: [missing
        ? "memory store does not exist"
        : error instanceof Error ? error.message : String(error)],
    };
  }
  if (storeStats.isSymbolicLink()) {
    return {
      ok: false,
      canonicalOk: false,
      ftsOk: false,
      ftsSchemaOk: false,
      path: storePath,
      schemaVersion: null,
      supportedSchemaVersion: schemaVersion,
      integrityCheck: "unsafe_symlink",
      foreignKeyViolations: 0,
      memoryCount: 0,
      activeMemoryCount: 0,
      ftsRowCount: 0,
      missingFtsRows: 0,
      orphanFtsRows: 0,
      duplicateFtsRows: 0,
      mismatchedFtsRows: 0,
      errors: ["memory store path is a symbolic link"],
    };
  }
  if (!storeStats.isFile()) {
    return {
      ok: false,
      canonicalOk: false,
      ftsOk: false,
      ftsSchemaOk: false,
      path: storePath,
      schemaVersion: null,
      supportedSchemaVersion: schemaVersion,
      integrityCheck: "not_a_file",
      foreignKeyViolations: 0,
      memoryCount: 0,
      activeMemoryCount: 0,
      ftsRowCount: 0,
      missingFtsRows: 0,
      orphanFtsRows: 0,
      duplicateFtsRows: 0,
      mismatchedFtsRows: 0,
      errors: ["memory store path is not a file"],
    };
  }

  let database: Database.Database | null = null;
  try {
    const canonicalErrors: string[] = [];
    const ftsErrors: string[] = [];
    database = new Database(storePath, { readonly: true, fileMustExist: true });
    database.pragma("busy_timeout = 5000");
    const version = database.pragma("user_version", { simple: true }) as number;
    const integrityCheck = String(database.pragma("integrity_check", { simple: true }));
    if (integrityCheck !== "ok") {
      canonicalErrors.push(`sqlite integrity_check failed: ${integrityCheck}`);
    }
    if (version > schemaVersion) {
      canonicalErrors.push(`schema version ${version} is newer than supported version ${schemaVersion}`);
    }
    if (version < 1) {
      canonicalErrors.push("schema version is not initialized");
    }

    const foreignKeyViolations = countRows(
      database,
      "SELECT COUNT(*) AS count FROM pragma_foreign_key_check",
    );
    if (foreignKeyViolations > 0) {
      canonicalErrors.push(`${foreignKeyViolations} foreign key violation(s) found`);
    }

    const hasMemories = ordinaryTableExists(database, "memories");
    const hasEvents = ordinaryTableExists(database, "memory_events");
    const hasRelations = ordinaryTableExists(database, "memory_relations");
    const memoriesSchemaOk = hasMemories &&
      tableHasColumns(database, "memories", requiredMemoryColumns(version)) &&
      tableHasPrimaryKey(database, "memories", "id");
    const eventsSchemaOk = hasEvents &&
      tableHasColumns(database, "memory_events", ["id", "memory_id", "event_type", "actor", "payload", "created_at"]) &&
      tableHasPrimaryKey(database, "memory_events", "id");
    const relationsSchemaOk = version < 6 || hasRelations && hasValidRelationsSchema(database);
    const hasFts = tableExists(database, "memories_fts");
    const ftsUsable = hasFts && tableHasColumns(database, "memories_fts", ["id", "scope", "content", "tags"]);
    const ftsIsVirtual = hasFts && isFts5VirtualTable(database, "memories_fts");
    const memoryCount = memoriesSchemaOk ? countRows(database, "SELECT COUNT(*) AS count FROM memories") : 0;
    const activeMemoryCount = memoriesSchemaOk ? countRows(database, "SELECT COUNT(*) AS count FROM memories WHERE archived_at IS NULL") : 0;
    const invalidMemoryRows = memoriesSchemaOk ? countRows(database, `
      SELECT COUNT(*) AS count
      FROM memories m
      WHERE json_valid(m.tags) = 0
        OR CASE WHEN json_valid(m.tags) THEN json_type(m.tags) ELSE 'invalid' END <> 'array'
        OR EXISTS (
          SELECT 1
          FROM json_each(CASE WHEN json_valid(m.tags) THEN m.tags ELSE '[]' END)
          WHERE type <> 'text'
        )
    `) : 0;
    const ftsCounts = memoriesSchemaOk && ftsUsable
      ? readFtsConsistency(database, invalidMemoryRows === 0)
      : {
          ftsRowCount: 0,
          missingFtsRows: 0,
          orphanFtsRows: 0,
          duplicateFtsRows: 0,
          mismatchedFtsRows: 0,
        };

    if (!hasMemories) canonicalErrors.push("memories table is missing");
    if (hasMemories && !memoriesSchemaOk) canonicalErrors.push("memories table schema is invalid");
    if (!hasEvents) canonicalErrors.push("memory_events table is missing");
    if (hasEvents && !eventsSchemaOk) canonicalErrors.push("memory_events table schema is invalid");
    if (version >= 6 && !hasRelations) canonicalErrors.push("memory_relations table is missing");
    if (version >= 6 && hasRelations && !relationsSchemaOk) {
      canonicalErrors.push("memory_relations table schema is invalid");
    }
    if (invalidMemoryRows > 0) canonicalErrors.push(`${invalidMemoryRows} canonical memory row(s) are invalid`);
    if (!hasFts) ftsErrors.push("memories_fts table is missing");
    if (hasFts && (!ftsUsable || !ftsIsVirtual)) ftsErrors.push("memories_fts schema is invalid");
    if (ftsCounts.missingFtsRows > 0) ftsErrors.push(`${ftsCounts.missingFtsRows} active memory row(s) are missing from FTS`);
    if (ftsCounts.orphanFtsRows > 0) ftsErrors.push(`${ftsCounts.orphanFtsRows} orphan or archived FTS row(s) found`);
    if (ftsCounts.duplicateFtsRows > 0) ftsErrors.push(`${ftsCounts.duplicateFtsRows} duplicate FTS row(s) found`);
    if (ftsCounts.mismatchedFtsRows > 0) ftsErrors.push(`${ftsCounts.mismatchedFtsRows} stale FTS row(s) found`);
    const errors = [...canonicalErrors, ...ftsErrors];

    return {
      ok: errors.length === 0,
      canonicalOk: canonicalErrors.length === 0,
      ftsOk: ftsErrors.length === 0,
      ftsSchemaOk: ftsUsable && ftsIsVirtual,
      path: storePath,
      schemaVersion: version,
      supportedSchemaVersion: schemaVersion,
      integrityCheck,
      foreignKeyViolations,
      memoryCount,
      activeMemoryCount,
      ...ftsCounts,
      errors,
    };
  } catch (error) {
    return {
      ok: false,
      canonicalOk: false,
      ftsOk: false,
      ftsSchemaOk: false,
      path: storePath,
      schemaVersion: null,
      supportedSchemaVersion: schemaVersion,
      integrityCheck: "error",
      foreignKeyViolations: 0,
      memoryCount: 0,
      activeMemoryCount: 0,
      ftsRowCount: 0,
      missingFtsRows: 0,
      orphanFtsRows: 0,
      duplicateFtsRows: 0,
      mismatchedFtsRows: 0,
      errors: [error instanceof Error ? error.message : String(error)],
    };
  } finally {
    database?.close();
  }
}

function countRows(database: Database.Database, sql: string): number {
  const row = database.prepare(sql).get() as { count: number };
  return row.count;
}

function tableExists(database: Database.Database, table: string): boolean {
  const row = database
    .prepare("SELECT 1 FROM sqlite_master WHERE name = ? AND type IN ('table', 'view') LIMIT 1")
    .get(table);
  return row !== undefined;
}

function ordinaryTableExists(database: Database.Database, table: string): boolean {
  const row = database
    .prepare("SELECT 1 FROM sqlite_master WHERE name = ? AND type = 'table' LIMIT 1")
    .get(table);
  return row !== undefined;
}

function tableHasColumns(database: Database.Database, table: string, columns: readonly string[]): boolean {
  const rows = database.pragma(`table_info(${table})`) as Array<{ name: string }>;
  const names = new Set(rows.map((row) => row.name));
  return columns.every((column) => names.has(column));
}

function tableHasPrimaryKey(database: Database.Database, table: string, column: string): boolean {
  const rows = database.pragma(`table_info(${table})`) as Array<{ name: string; pk: number }>;
  return rows.some((row) => row.name === column && row.pk === 1);
}

function requiredMemoryColumns(version: number): string[] {
  const columns = [
    "id",
    "revision",
    "scope",
    "kind",
    "content",
    "tags",
    "source",
    "confidence",
    "created_at",
    "updated_at",
    "last_used_at",
    "archived_at",
  ];
  if (version >= 3) columns.push("provenance");
  if (version >= 4) columns.push("confidence_state");
  if (version >= 5) columns.push("review_after", "expires_at");
  if (version >= 7) columns.push("capture_key");
  return columns;
}

function hasValidRelationsSchema(database: Database.Database): boolean {
  if (
    !tableHasColumns(database, "memory_relations", [
      "id",
      "source_memory_id",
      "target_memory_id",
      "relation",
      "reason",
      "created_at",
    ]) ||
    !tableHasPrimaryKey(database, "memory_relations", "id")
  ) {
    return false;
  }

  const foreignKeys = database.pragma("foreign_key_list(memory_relations)") as Array<{
    from: string;
    table: string;
    to: string;
    on_delete: string;
  }>;
  const hasCascadeReference = (column: string) => foreignKeys.some((foreignKey) =>
    foreignKey.from === column &&
    foreignKey.table === "memories" &&
    foreignKey.to === "id" &&
    foreignKey.on_delete.toUpperCase() === "CASCADE"
  );
  if (!hasCascadeReference("source_memory_id") || !hasCascadeReference("target_memory_id")) {
    return false;
  }

  const indexes = database.pragma("index_list(memory_relations)") as Array<{
    name: string;
    unique: number;
  }>;
  return indexes.some((index) => {
    if (index.unique !== 1) return false;
    const columns = database.pragma(`index_info(${JSON.stringify(index.name)})`) as Array<{
      name: string;
      seqno: number;
    }>;
    return columns
      .sort((left, right) => left.seqno - right.seqno)
      .map((column) => column.name)
      .join(",") === "source_memory_id,target_memory_id,relation";
  });
}

function isFts5VirtualTable(database: Database.Database, table: string): boolean {
  const row = database.prepare("SELECT sql FROM sqlite_master WHERE name = ? AND type = 'table'").get(table) as
    | { sql: string | null }
    | undefined;
  return typeof row?.sql === "string" && /^\s*CREATE\s+VIRTUAL\s+TABLE\s+memories_fts\s+USING\s+fts5\s*\(\s*id\s+UNINDEXED\s*,\s*scope\s+UNINDEXED\s*,\s*content\s*,\s*tags\s*\)\s*$/iu.test(row.sql);
}

function readFtsConsistency(database: Database.Database, compareCanonicalValues: boolean): {
  ftsRowCount: number;
  missingFtsRows: number;
  orphanFtsRows: number;
  duplicateFtsRows: number;
  mismatchedFtsRows: number;
} {
  const ftsRowCount = countRows(database, "SELECT COUNT(*) AS count FROM memories_fts");
  const activeMemoryCount = countRows(
    database,
    "SELECT COUNT(*) AS count FROM memories WHERE archived_at IS NULL",
  );
  const indexedActiveMemoryCount = countRows(database, `
    SELECT COUNT(DISTINCT f.id) AS count
    FROM memories_fts f
    JOIN memories m ON m.id = f.id
    WHERE m.archived_at IS NULL
  `);
  const missingFtsRows = Math.max(0, activeMemoryCount - indexedActiveMemoryCount);
  const orphanFtsRows = countRows(database, `
    SELECT COUNT(*) AS count
    FROM memories_fts f
    LEFT JOIN memories m ON m.id = f.id
    WHERE m.id IS NULL OR m.archived_at IS NOT NULL
  `);
  const duplicateFtsRows = countRows(database, `
    SELECT COALESCE(SUM(row_count - 1), 0) AS count
    FROM (
      SELECT COUNT(*) AS row_count
      FROM memories_fts
      GROUP BY id
      HAVING COUNT(*) > 1
    )
  `);
  const mismatchedFtsRows = compareCanonicalValues ? countRows(database, `
    SELECT COUNT(*) AS count
    FROM memories m
    JOIN memories_fts f ON f.id = m.id
    WHERE m.archived_at IS NULL
      AND (
        f.scope IS NOT m.scope
        OR f.content IS NOT m.content
        OR f.tags IS NOT COALESCE((
          SELECT GROUP_CONCAT(value, ' ')
          FROM (
            SELECT value
            FROM json_each(m.tags)
            ORDER BY key
          )
        ), '')
      )
  `) : 0;
  return { ftsRowCount, missingFtsRows, orphanFtsRows, duplicateFtsRows, mismatchedFtsRows };
}

function assertFtsRepairable(plan: SQLiteFtsRepairPlan): void {
  if (!plan.repairable) {
    throw new NuzoMemoryError(
      "MEMORY_FTS_REPAIR_SOURCE_INVALID",
      "Canonical SQLite integrity must pass before FTS repair.",
      { path: plan.sourcePath, errors: plan.report.errors },
    );
  }
}

function rebuildFtsAtPath(path: string): void {
  const database = new Database(path, { fileMustExist: true });
  try {
    database.pragma("busy_timeout = 5000");
    database.pragma("journal_mode = DELETE");
    database.pragma("foreign_keys = ON");
    const rebuild = database.transaction(() => {
      rebuildFtsInDatabase(database);
      assertFtsRebuildComplete(database);
    });
    rebuild.immediate();
  } finally {
    database.close();
  }
  chmodSQLiteFileSet(path);
}

function rebuildFtsInDatabase(database: Database.Database): void {
  database.prepare("DELETE FROM memories_fts").run();
  database.prepare(`
    INSERT INTO memories_fts (id, scope, content, tags)
    SELECT
      m.id,
      m.scope,
      m.content,
      COALESCE((
        SELECT GROUP_CONCAT(value, ' ')
        FROM (
          SELECT value
          FROM json_each(m.tags)
          ORDER BY key
        )
      ), '')
    FROM memories m
    WHERE m.archived_at IS NULL
    ORDER BY m.id ASC
  `).run();
}

function assertFtsRebuildComplete(database: Database.Database): void {
  database.prepare(
    "INSERT INTO memories_fts(memories_fts, rank) VALUES('integrity-check', 1)",
  ).run();
  const integrityCheck = String(database.pragma("integrity_check", { simple: true }));
  const foreignKeyViolations = countRows(
    database,
    "SELECT COUNT(*) AS count FROM pragma_foreign_key_check",
  );
  const counts = readFtsConsistency(database, true);
  const activeMemoryCount = countRows(database, "SELECT COUNT(*) AS count FROM memories WHERE archived_at IS NULL");
  if (
    integrityCheck !== "ok" ||
    foreignKeyViolations !== 0 ||
    counts.ftsRowCount !== activeMemoryCount ||
    counts.missingFtsRows !== 0 ||
    counts.orphanFtsRows !== 0 ||
    counts.duplicateFtsRows !== 0 ||
    counts.mismatchedFtsRows !== 0
  ) {
    throw new NuzoMemoryError(
      "MEMORY_FTS_REPAIR_FAILED",
      "Rebuilt FTS index did not match canonical active memories.",
    );
  }
}

function chmodSQLiteFileSet(path: string): void {
  for (const candidate of [path, `${path}-wal`, `${path}-shm`]) {
    if (existsSync(candidate)) {
      chmodSync(candidate, 0o600);
    }
  }
}

function rmSQLiteFileSet(path: string): void {
  for (const candidate of [path, `${path}-wal`, `${path}-shm`]) {
    rmSync(candidate, { force: true });
  }
}

function sqliteFileSetExists(path: string): boolean {
  return sqliteFileSetPaths(path).some((candidate) => pathEntryExists(candidate));
}

function sqliteFileSetsOverlap(left: string, right: string): boolean {
  const leftPaths = new Set(sqliteFileSetPaths(canonicalPathForComparison(left)));
  return sqliteFileSetPaths(canonicalPathForComparison(right)).some((candidate) => leftPaths.has(candidate));
}

function sqliteFileSetPaths(path: string): string[] {
  return [path, `${path}-wal`, `${path}-shm`];
}

function canonicalPathForComparison(path: string): string {
  try {
    return join(realpathSync(dirname(path)), basename(path));
  } catch {
    return path;
  }
}

type FileIdentity = { dev: number; ino: number };

function createPrivateFileExclusive(path: string): void {
  const descriptor = openSync(
    path,
    fsConstants.O_WRONLY |
      fsConstants.O_CREAT |
      fsConstants.O_EXCL |
      fsConstants.O_NOFOLLOW,
    0o600,
  );
  closeSync(descriptor);
  chmodSync(path, 0o600);
}

function readFileIdentity(path: string): FileIdentity {
  const stats = lstatSync(path);
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new NuzoMemoryError(
      "MEMORY_FTS_REPAIR_PATH_UNSAFE",
      "FTS repair requires a regular, non-symbolic-link SQLite file.",
      { path },
    );
  }
  return { dev: stats.dev, ino: stats.ino };
}

function assertFileIdentity(path: string, expected: FileIdentity): void {
  const actual = readFileIdentity(path);
  if (actual.dev !== expected.dev || actual.ino !== expected.ino) {
    throw new NuzoMemoryError(
      "MEMORY_FTS_REPAIR_SOURCE_CHANGED",
      "The source store path changed while FTS repair was running.",
      { path },
    );
  }
}

function removeFileIfIdentityMatches(path: string, expected: FileIdentity): void {
  try {
    const actual = readFileIdentity(path);
    if (actual.dev === expected.dev && actual.ino === expected.ino) {
      rmSync(path, { force: true });
    }
  } catch {
    // A concurrently replaced path is not ours to remove.
  }
}

function isNodeError(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === code;
}

function pathEntryExists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch (error) {
    return !isNodeError(error, "ENOENT");
  }
}

function assertNoSymlinkLeaf(path: string): void {
  try {
    if (lstatSync(path).isSymbolicLink()) {
      throw new NuzoMemoryError(
        "MEMORY_FTS_REPAIR_PATH_UNSAFE",
        "FTS repair refuses symbolic-link source or backup files.",
        { path },
      );
    }
  } catch (error) {
    if (!isNodeError(error, "ENOENT")) {
      if (error instanceof NuzoMemoryError) throw error;
      throw new NuzoMemoryError(
        "MEMORY_FTS_REPAIR_PATH_UNSAFE",
        "FTS repair could not safely inspect a source or backup path.",
        { path },
      );
    }
  }
}
