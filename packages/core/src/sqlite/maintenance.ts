import Database from "better-sqlite3";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { NuzoMemoryError } from "../errors.js";
import { SQLiteMemoryDatabase } from "./adapter.js";
import { schemaVersion } from "./schema.js";

export interface SQLiteIntegrityReport {
  ok: boolean;
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

export function inspectSQLiteMemoryStore(path: string): SQLiteIntegrityReport {
  const storePath = resolve(path);
  const errors: string[] = [];
  if (!existsSync(storePath)) {
    return {
      ok: false,
      path: storePath,
      schemaVersion: null,
      supportedSchemaVersion: schemaVersion,
      integrityCheck: "missing",
      foreignKeyViolations: 0,
      memoryCount: 0,
      activeMemoryCount: 0,
      ftsRowCount: 0,
      missingFtsRows: 0,
      orphanFtsRows: 0,
      errors: ["memory store does not exist"],
    };
  }
  if (!statSync(storePath).isFile()) {
    return {
      ok: false,
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
      errors: ["memory store path is not a file"],
    };
  }

  let database: Database.Database | null = null;
  try {
    database = new Database(storePath, { readonly: true, fileMustExist: true });
    database.pragma("busy_timeout = 5000");
    const version = database.pragma("user_version", { simple: true }) as number;
    const integrityCheck = String(database.pragma("integrity_check", { simple: true }));
    if (integrityCheck !== "ok") {
      errors.push(`sqlite integrity_check failed: ${integrityCheck}`);
    }
    if (version > schemaVersion) {
      errors.push(`schema version ${version} is newer than supported version ${schemaVersion}`);
    }
    if (version < 1) {
      errors.push("schema version is not initialized");
    }

    const foreignKeyViolations = safeCount(database, "PRAGMA foreign_key_check");
    if (foreignKeyViolations > 0) {
      errors.push(`${foreignKeyViolations} foreign key violation(s) found`);
    }

    const hasMemories = tableExists(database, "memories");
    const hasFts = tableExists(database, "memories_fts");
    const memoryCount = hasMemories ? countRows(database, "SELECT COUNT(*) AS count FROM memories") : 0;
    const activeMemoryCount = hasMemories ? countRows(database, "SELECT COUNT(*) AS count FROM memories WHERE archived_at IS NULL") : 0;
    const ftsRowCount = hasFts ? countRows(database, "SELECT COUNT(*) AS count FROM memories_fts") : 0;
    const missingFtsRows = hasMemories && hasFts
      ? countRows(database, `
        SELECT COUNT(*) AS count
        FROM memories m
        LEFT JOIN memories_fts f ON f.id = m.id
        WHERE m.archived_at IS NULL AND f.id IS NULL
      `)
      : 0;
    const orphanFtsRows = hasMemories && hasFts
      ? countRows(database, `
        SELECT COUNT(*) AS count
        FROM memories_fts f
        LEFT JOIN memories m ON m.id = f.id
        WHERE m.id IS NULL OR m.archived_at IS NOT NULL
      `)
      : 0;

    if (!hasMemories) errors.push("memories table is missing");
    if (!hasFts) errors.push("memories_fts table is missing");
    if (missingFtsRows > 0) errors.push(`${missingFtsRows} active memory row(s) are missing from FTS`);
    if (orphanFtsRows > 0) errors.push(`${orphanFtsRows} orphan or archived FTS row(s) found`);

    return {
      ok: errors.length === 0,
      path: storePath,
      schemaVersion: version,
      supportedSchemaVersion: schemaVersion,
      integrityCheck,
      foreignKeyViolations,
      memoryCount,
      activeMemoryCount,
      ftsRowCount,
      missingFtsRows,
      orphanFtsRows,
      errors,
    };
  } catch (error) {
    return {
      ok: false,
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

function safeCount(database: Database.Database, pragmaSql: string): number {
  try {
    return database.prepare(pragmaSql).all().length;
  } catch {
    return 0;
  }
}

function tableExists(database: Database.Database, table: string): boolean {
  const row = database
    .prepare("SELECT 1 FROM sqlite_master WHERE name = ? AND type IN ('table', 'view') LIMIT 1")
    .get(table);
  return row !== undefined;
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
