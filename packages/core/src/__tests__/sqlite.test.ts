import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createMemoryService,
  DefaultPolicyEngine,
  backupSQLiteMemoryStore,
  inspectSQLiteMemoryStore,
  planSQLiteProjectScopeRehome,
  planSQLiteFtsRepair,
  rehomeSQLiteProjectScope,
  repairSQLiteFtsIndex,
  type MemoryExportDocument,
  type MemoryRecord,
  RegexSecretScanner,
  restoreSQLiteMemoryStore,
  SQLiteMemoryDatabase,
} from "../index.js";
import { encodeMemoryListCursor } from "../pagination.js";
import { FixedClock, SequentialIdGenerator } from "../testing.js";
import type { IdGenerator } from "../ports.js";

let tempDirectories: string[] = [];

afterEach(() => {
  for (const directory of tempDirectories) {
    rmSync(directory, { recursive: true, force: true });
  }
  tempDirectories = [];
});

function createTempDatabase(ids: IdGenerator = new SequentialIdGenerator()) {
  const directory = mkdtempSync(join(tmpdir(), "nuzo-core-"));
  tempDirectories.push(directory);
  const database = new SQLiteMemoryDatabase({ path: join(directory, "memories.sqlite") });
  const service = createServiceForDatabase(database, ids);

  return { database, directory, service };
}

function createServiceForDatabase(
  database: SQLiteMemoryDatabase,
  ids: IdGenerator = new SequentialIdGenerator(),
) {
  const service = createMemoryService({
    store: database,
    searchIndex: database,
    auditLog: database,
    clock: new FixedClock(),
    ids,
    policy: new DefaultPolicyEngine(new RegexSecretScanner()),
    transactions: database,
  });

  return service;
}

function snapshotCanonicalRows(database: Database.Database): Record<string, unknown[]> {
  return Object.fromEntries(
    ["memories", "memory_events", "memory_relations"].map((table) => [
      table,
      database.prepare(`SELECT * FROM ${table} ORDER BY id ASC`).all(),
    ]),
  );
}

class PrefixedIdGenerator implements IdGenerator {
  private memoryCounter = 0;
  private eventCounter = 0;
  private relationCounter = 0;

  constructor(private readonly prefix: string) {}

  memoryId(): string {
    this.memoryCounter += 1;
    return `mem_${this.prefix}_${String(this.memoryCounter).padStart(6, "0")}`;
  }

  eventId(): string {
    this.eventCounter += 1;
    return `evt_${this.prefix}_${String(this.eventCounter).padStart(6, "0")}`;
  }

  relationId(): string {
    this.relationCounter += 1;
    return `rel_${this.prefix}_${String(this.relationCounter).padStart(6, "0")}`;
  }
}

describe("SQLiteMemoryDatabase", () => {
  const confirmedCreateInput = {
    decision: "create" as const,
    content: "Concurrent exact capture remains unique.",
    kind: "note" as const,
    scope: "user:default" as const,
    tags: ["concurrency"],
    source: "test:capture-confirmed",
    reason: "The user confirmed the synthetic concurrency fixture.",
    confirm: true,
    actor: "test",
  };

  it("creates the complete version 7 schema from an empty database", () => {
    const directory = mkdtempSync(join(tmpdir(), "nuzo-schema-"));
    tempDirectories.push(directory);
    const database = new SQLiteMemoryDatabase({ path: join(directory, "memories.sqlite") });

    const objects = database.database
      .prepare(
        `
          SELECT name, type
          FROM sqlite_master
          WHERE name IN (
            'memories',
            'memory_events',
            'memories_fts',
            'idx_memories_scope',
            'idx_memories_archived_at',
            'idx_memories_review_after',
            'idx_memories_expires_at',
            'idx_memories_active_capture_key',
            'idx_memory_events_memory_id'
          )
          ORDER BY name
        `,
      )
      .all() as Array<{ name: string; type: string }>;

    const columns = database.database.pragma("table_info(memories)") as Array<{ name: string }>;

    expect(database.getSchemaVersion()).toBe(7);
    expect(database.database.pragma("busy_timeout", { simple: true })).toBe(5000);
    expect(columns.some((column) => column.name === "revision")).toBe(true);
    expect(columns.some((column) => column.name === "provenance")).toBe(true);
    expect(columns.some((column) => column.name === "confidence_state")).toBe(true);
    expect(columns.some((column) => column.name === "review_after")).toBe(true);
    expect(columns.some((column) => column.name === "expires_at")).toBe(true);
    expect(columns.some((column) => column.name === "capture_key")).toBe(true);
    expect(objects).toEqual([
      { name: "idx_memories_active_capture_key", type: "index" },
      { name: "idx_memories_archived_at", type: "index" },
      { name: "idx_memories_expires_at", type: "index" },
      { name: "idx_memories_review_after", type: "index" },
      { name: "idx_memories_scope", type: "index" },
      { name: "idx_memory_events_memory_id", type: "index" },
      { name: "memories", type: "table" },
      { name: "memories_fts", type: "table" },
      { name: "memory_events", type: "table" },
    ]);

    database.close();
  });

  it("keeps SQLite database files private even with a permissive umask", () => {
    const directory = mkdtempSync(join(tmpdir(), "nuzo-permissions-"));
    tempDirectories.push(directory);
    const path = join(directory, "memories.sqlite");
    const previousUmask = process.umask(0o022);
    try {
      const database = new SQLiteMemoryDatabase({ path });
      expect(statSync(path).mode & 0o777).toBe(0o600);
      database.close();
      expect(statSync(path).mode & 0o777).toBe(0o600);
    } finally {
      process.umask(previousUmask);
    }
  });

  it("migrates version 6 stores with deterministic capture keys and active indexes", async () => {
    const directory = mkdtempSync(join(tmpdir(), "nuzo-capture-key-migration-"));
    tempDirectories.push(directory);
    const path = join(directory, "memories.sqlite");
    const legacy = new Database(path);
    legacy.exec(`
      CREATE TABLE memories (
        id TEXT PRIMARY KEY,
        revision INTEGER NOT NULL DEFAULT 1,
        scope TEXT NOT NULL,
        kind TEXT NOT NULL,
        content TEXT NOT NULL,
        tags TEXT NOT NULL DEFAULT '[]',
        source TEXT NOT NULL,
        confidence REAL NOT NULL DEFAULT 1.0,
        confidence_state TEXT,
        provenance TEXT,
        review_after TEXT,
        expires_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_used_at TEXT,
        archived_at TEXT
      );
      INSERT INTO memories (
        id, scope, kind, content, tags, source, confidence, confidence_state,
        created_at, updated_at
      ) VALUES (
        'mem_legacy_capture', 'project:nuzo', 'instruction',
        '  Run   strict capture validation.  ', '[]', 'test:migration', 1.0,
        'user_confirmed', '2026-07-11T00:00:00.000Z', '2026-07-11T00:00:00.000Z'
      );
      PRAGMA user_version = 6;
    `);
    legacy.close();

    const database = new SQLiteMemoryDatabase({ path });
    expect(database.getSchemaVersion()).toBe(7);
    const columns = database.database.pragma("table_info(memories)") as Array<{ name: string }>;
    expect(columns.some((column) => column.name === "capture_key")).toBe(true);
    await expect(database.findCaptureCandidates({
      scope: "project:nuzo",
      duplicateKey: "run strict capture validation.",
      query: "Run strict capture validation.",
      tags: [],
      includeCandidates: false,
      candidateLimit: 20,
      exhaustiveScanLimit: 100,
    })).resolves.toMatchObject({
      duplicate: { id: "mem_legacy_capture" },
      candidates: [],
      searchExhaustive: true,
    });
    database.close();
  });

  it("uses indexed exact lookup and bounded FTS prefilter for dense capture scopes", async () => {
    const { database, service } = createTempDatabase();
    for (let index = 0; index < 125; index += 1) {
      await service.remember({
        content: `Synthetic editor state ${index} records temporary window layout and cursor position.`,
        kind: "note",
        scope: "project:dense",
        tags: ["synthetic", `row-${index}`],
        source: "test:dense-sqlite",
      });
    }
    const related = await service.remember({
      content: "Production deployment requires an explicit rollback checklist and service owner.",
      kind: "instruction",
      scope: "project:dense",
      tags: ["deploy", "rollback"],
      source: "test:dense-sqlite",
    });

    const queryPlan = database.database.prepare(`
      EXPLAIN QUERY PLAN
      SELECT * FROM memories
      WHERE scope = @scope AND archived_at IS NULL AND capture_key = @capture_key
      ORDER BY id ASC LIMIT 1
    `).all({
      scope: "project:dense",
      capture_key: "production deployment requires an explicit rollback checklist and service owner.",
    }) as Array<{ detail: string }>;
    expect(queryPlan.some((step) => step.detail.includes("idx_memories_active_capture_key"))).toBe(true);
    const scopeCountPlan = database.database.prepare(`
      EXPLAIN QUERY PLAN
      SELECT COUNT(*) FROM memories
      WHERE scope = @scope AND archived_at IS NULL
    `).all({ scope: "project:dense" }) as Array<{ detail: string }>;
    expect(scopeCountPlan.some((step) => step.detail.includes("idx_memories_active_capture_key"))).toBe(true);

    const lookup = await database.findCaptureCandidates({
      scope: "project:dense",
      duplicateKey: "no duplicate",
      query: "Production deployment needs a rollback checklist and an owner.",
      tags: ["deploy"],
      includeCandidates: true,
      candidateLimit: 20,
      exhaustiveScanLimit: 100,
    });
    expect(lookup).toMatchObject({
      duplicate: null,
      searchExhaustive: false,
      candidates: expect.arrayContaining([expect.objectContaining({ id: related.id })]),
    });
    expect(lookup.candidates).toHaveLength(1);

    await expect(database.findCaptureCandidates({
      scope: "project:dense",
      duplicateKey: "production deployment requires an explicit rollback checklist and service owner.",
      query: related.content,
      tags: [],
      includeCandidates: false,
      candidateLimit: 20,
      exhaustiveScanLimit: 100,
    })).resolves.toMatchObject({
      duplicate: { id: related.id },
      candidates: [],
      searchExhaustive: true,
    });
    database.close();
  });

  it.skipIf(process.platform === "win32")("refuses to open a SQLite store through a symbolic link", () => {
    const directory = mkdtempSync(join(tmpdir(), "nuzo-store-symlink-"));
    tempDirectories.push(directory);
    const target = join(directory, "target.sqlite");
    const link = join(directory, "memories.sqlite");
    writeFileSync(target, "sentinel", "utf8");
    symlinkSync(target, link);

    expect(() => new SQLiteMemoryDatabase({ path: link })).toThrowError(
      expect.objectContaining({ code: "MEMORY_STORE_PATH_UNSAFE" }),
    );
    expect(readFileSync(target, "utf8")).toBe("sentinel");
  });

  it.skipIf(process.platform === "win32")("opens diagnostics read-only without repairing permissions", async () => {
    const directory = mkdtempSync(join(tmpdir(), "nuzo-readonly-"));
    tempDirectories.push(directory);
    const path = join(directory, "memories.sqlite");
    new SQLiteMemoryDatabase({ path }).close();
    chmodSync(path, 0o644);

    const database = new SQLiteMemoryDatabase({ path, readonly: true });
    await expect(database.list({ includeArchived: false })).resolves.toEqual([]);
    database.close();

    expect(statSync(path).mode & 0o777).toBe(0o644);
  });

  it("reopens idempotently without losing memory or audit data", async () => {
    const directory = mkdtempSync(join(tmpdir(), "nuzo-schema-"));
    tempDirectories.push(directory);
    const path = join(directory, "memories.sqlite");
    const first = new SQLiteMemoryDatabase({ path });
    const firstService = createMemoryService({
      store: first,
      searchIndex: first,
      auditLog: first,
      clock: new FixedClock(),
      ids: new SequentialIdGenerator(),
      policy: new DefaultPolicyEngine(new RegexSecretScanner()),
      transactions: first,
    });
    const memory = await firstService.remember({
      content: "Migration tests preserve fake memory data.",
      kind: "note",
      scope: "project:nuzo",
      tags: ["migration"],
      source: "test",
    });
    first.close();

    const reopened = new SQLiteMemoryDatabase({ path });

    expect(reopened.getSchemaVersion()).toBe(7);
    await expect(reopened.findById(memory.id)).resolves.toMatchObject({
      revision: 1,
      content: "Migration tests preserve fake memory data.",
      tags: ["migration"],
      provenance: null,
    });
    await expect(reopened.list(memory.id)).resolves.toHaveLength(1);
    await expect(
      reopened.search({
        query: "Migration preserve",
        scope: "project:nuzo",
      }),
    ).resolves.toHaveLength(1);

    reopened.close();
  });

  it("serializes identical confirmed creates in one SQLite service", async () => {
    const { database, service } = createTempDatabase();

    const results = await Promise.all([
      service.confirmCapture(confirmedCreateInput),
      service.confirmCapture(confirmedCreateInput),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual(["created", "skipped"]);
    await expect(service.list({ scope: "user:default" })).resolves.toHaveLength(1);
    database.close();
  });

  it("serializes identical confirmed creates across two SQLite connections", async () => {
    const directory = mkdtempSync(join(tmpdir(), "nuzo-confirm-concurrency-"));
    tempDirectories.push(directory);
    const path = join(directory, "memories.sqlite");
    const first = new SQLiteMemoryDatabase({ path });
    const second = new SQLiteMemoryDatabase({ path });
    const firstService = createServiceForDatabase(first, new PrefixedIdGenerator("first"));
    const secondService = createServiceForDatabase(second, new PrefixedIdGenerator("second"));

    const results = await Promise.all([
      firstService.confirmCapture(confirmedCreateInput),
      secondService.confirmCapture(confirmedCreateInput),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual(["created", "skipped"]);
    await expect(firstService.list({ scope: "user:default" })).resolves.toHaveLength(1);
    first.close();
    second.close();
  });

  it("persists structured provenance across reopen", async () => {
    const directory = mkdtempSync(join(tmpdir(), "nuzo-provenance-"));
    tempDirectories.push(directory);
    const path = join(directory, "memories.sqlite");
    const first = new SQLiteMemoryDatabase({ path });
    const firstService = createServiceForDatabase(first);
    const memory = await firstService.remember({
      content: "Provenance should survive SQLite persistence.",
      kind: "note",
      scope: "project:nuzo",
      tags: ["provenance"],
      source: "test",
      provenance: {
        kind: "file",
        host: "codex",
        surface: "cli",
        path: "docs/spec/memory-governance.md",
        line: 12,
        action: "remember",
      },
    });
    first.close();

    const reopened = new SQLiteMemoryDatabase({ path });

    await expect(reopened.findById(memory.id)).resolves.toMatchObject({
      provenance: {
        kind: "file",
        host: "codex",
        surface: "cli",
        path: "docs/spec/memory-governance.md",
        line: 12,
        action: "remember",
      },
    });

    reopened.close();
  });

  it("inspects store integrity and detects broken FTS consistency", async () => {
    const { database, directory, service } = createTempDatabase();
    await service.remember({
      content: "Integrity checks must include FTS consistency.",
      kind: "note",
      scope: "project:nuzo",
      tags: ["integrity"],
      source: "test",
    });
    const path = join(directory, "memories.sqlite");

    expect(inspectSQLiteMemoryStore(path)).toMatchObject({
      ok: true,
      canonicalOk: true,
      ftsOk: true,
      ftsSchemaOk: true,
      schemaVersion: 7,
      integrityCheck: "ok",
      memoryCount: 1,
      activeMemoryCount: 1,
      ftsRowCount: 1,
      missingFtsRows: 0,
      orphanFtsRows: 0,
      duplicateFtsRows: 0,
      mismatchedFtsRows: 0,
      errors: [],
    });

    database.database.prepare("DELETE FROM memories_fts").run();
    expect(inspectSQLiteMemoryStore(path)).toMatchObject({
      ok: false,
      canonicalOk: true,
      ftsOk: false,
      missingFtsRows: 1,
      errors: ["1 active memory row(s) are missing from FTS"],
    });

    database.close();
  });

  it("repairs every FTS drift class after publishing a validated recovery backup", async () => {
    const { database, directory, service } = createTempDatabase();
    const memories = await Promise.all([
      service.remember({
        content: "The missing index row must be rebuilt.",
        kind: "note",
        scope: "project:nuzo",
        tags: ["missing"],
        source: "test",
      }),
      service.remember({
        content: "The duplicate index row must be deduplicated.",
        kind: "note",
        scope: "project:nuzo",
        tags: ["duplicate"],
        source: "test",
      }),
      service.remember({
        content: "The stale index row must match canonical content.",
        kind: "note",
        scope: "user:default",
        tags: ["stale", "canonical"],
        source: "test",
      }),
    ]);
    await service.relate({
      sourceMemoryId: memories[1]!.id,
      targetMemoryId: memories[0]!.id,
      relation: "related_to",
      actor: "test",
    });
    const sourcePath = join(directory, "memories.sqlite");
    const backupPath = join(directory, "fts-repair.backup.sqlite");
    const restoredPath = join(directory, "restored.sqlite");
    const canonicalBefore = snapshotCanonicalRows(database.database);

    database.database.prepare("DELETE FROM memories_fts WHERE id = ?").run(memories[0]!.id);
    database.database.prepare(`
      INSERT INTO memories_fts (id, scope, content, tags)
      SELECT id, scope, content, 'duplicate' FROM memories WHERE id = ?
    `).run(memories[1]!.id);
    database.database.prepare("UPDATE memories_fts SET content = 'stale derived content' WHERE id = ?")
      .run(memories[2]!.id);
    database.database.prepare(`
      INSERT INTO memories_fts (id, scope, content, tags)
      VALUES ('mem_orphan', 'project:nuzo', 'orphan derived content', 'orphan')
    `).run();

    const plan = planSQLiteFtsRepair(sourcePath);
    expect(plan).toMatchObject({
      sourcePath,
      repairRequired: true,
      repairable: true,
      report: {
        ok: false,
        canonicalOk: true,
        ftsOk: false,
        ftsSchemaOk: true,
        missingFtsRows: 1,
        orphanFtsRows: 1,
        duplicateFtsRows: 1,
        mismatchedFtsRows: 1,
      },
    });

    await expect(repairSQLiteFtsIndex({ sourcePath, backupPath }))
      .rejects.toMatchObject({ code: "MEMORY_FTS_REPAIR_CONFIRMATION_REQUIRED" });
    expect(existsSync(backupPath)).toBe(false);

    const result = await repairSQLiteFtsIndex({ sourcePath, backupPath, confirm: true });
    expect(result).toMatchObject({
      sourcePath,
      backupPath,
      repaired: true,
      remainingPages: 0,
      backup: { ok: true, ftsOk: true, memoryCount: 3, ftsRowCount: 3 },
      after: {
        ok: true,
        canonicalOk: true,
        ftsOk: true,
        missingFtsRows: 0,
        orphanFtsRows: 0,
        duplicateFtsRows: 0,
        mismatchedFtsRows: 0,
      },
    });
    expect(result.pages).toBeGreaterThan(0);
    expect(statSync(backupPath).mode & 0o777).toBe(0o600);
    expect(readdirSync(directory).filter((entry) => entry.includes(".tmp-") || entry.startsWith("fts-repair.backup.sqlite-")))
      .toEqual([]);
    const backupDatabase = new Database(backupPath, { readonly: true });
    expect(backupDatabase.pragma("journal_mode", { simple: true })).toBe("delete");
    backupDatabase.close();
    expect(snapshotCanonicalRows(database.database)).toEqual(canonicalBefore);

    const restored = restoreSQLiteMemoryStore({ backupPath, targetPath: restoredPath });
    expect(restored.report).toMatchObject({ ok: true, ftsOk: true, memoryCount: 3 });
    const restoredDatabase = new SQLiteMemoryDatabase({ path: restoredPath, readonly: true });
    try {
      await expect(restoredDatabase.search({
        query: "canonical content",
        scope: "user:default",
      })).resolves.toMatchObject([{ memory: { id: memories[2]!.id } }]);
    } finally {
      restoredDatabase.close();
      database.close();
    }
  });

  it("rolls back a rebuilt source FTS transaction and retains its validated backup on failure", async () => {
    const { database, directory, service } = createTempDatabase();
    const first = await service.remember({
      content: "Rollback keeps this canonical memory unchanged.",
      kind: "note",
      scope: "project:nuzo",
      tags: ["rollback"],
      source: "test",
    });
    const second = await service.remember({
      content: "Rollback also keeps audit and relation rows unchanged.",
      kind: "note",
      scope: "project:nuzo",
      tags: ["failure"],
      source: "test",
    });
    await service.relate({
      sourceMemoryId: second.id,
      targetMemoryId: first.id,
      relation: "related_to",
      actor: "test",
    });
    const sourcePath = join(directory, "memories.sqlite");
    const backupPath = join(directory, "failure.backup.sqlite");
    const canonicalBefore = snapshotCanonicalRows(database.database);
    database.database.prepare("DELETE FROM memories_fts WHERE id = ?").run(first.id);
    const ftsBefore = database.database
      .prepare("SELECT rowid, id, scope, content, tags FROM memories_fts ORDER BY rowid ASC")
      .all();

    const prepareDescriptor = Object.getOwnPropertyDescriptor(Database.prototype, "prepare");
    if (prepareDescriptor === undefined) throw new Error("better-sqlite3 prepare descriptor is missing");
    const originalPrepare = Database.prototype.prepare;
    let ftsIntegrityChecks = 0;
    Object.defineProperty(Database.prototype, "prepare", {
      ...prepareDescriptor,
      value(this: Database.Database, sql: string) {
        if (sql.includes("VALUES('integrity-check', 1)")) {
          ftsIntegrityChecks += 1;
          if (ftsIntegrityChecks === 2) throw new Error("injected post-rebuild failure");
        }
        return originalPrepare.call(this, sql);
      },
    });
    try {
      await expect(repairSQLiteFtsIndex({ sourcePath, backupPath, confirm: true }))
        .rejects.toMatchObject({
          code: "MEMORY_FTS_REPAIR_FAILED",
          details: { backupPath },
        });
    } finally {
      Object.defineProperty(Database.prototype, "prepare", prepareDescriptor);
    }

    expect(snapshotCanonicalRows(database.database)).toEqual(canonicalBefore);
    expect(database.database
      .prepare("SELECT rowid, id, scope, content, tags FROM memories_fts ORDER BY rowid ASC")
      .all()).toEqual(ftsBefore);
    expect(inspectSQLiteMemoryStore(sourcePath)).toMatchObject({
      canonicalOk: true,
      ftsOk: false,
      missingFtsRows: 1,
    });
    expect(inspectSQLiteMemoryStore(backupPath)).toMatchObject({
      ok: true,
      canonicalOk: true,
      ftsOk: true,
      memoryCount: 2,
    });
    expect(readdirSync(directory).filter((entry) => entry.includes(".tmp-"))).toEqual([]);

    database.close();
  });

  it("does not write for a healthy FTS plan and blocks repair when canonical rows are invalid", async () => {
    const { database, directory, service } = createTempDatabase();
    const memory = await service.remember({
      content: "A healthy index needs no recovery backup.",
      kind: "note",
      scope: "user:default",
      source: "test",
    });
    const sourcePath = join(directory, "memories.sqlite");
    const backupPath = join(directory, "fts-repair.backup.sqlite");

    expect(planSQLiteFtsRepair(sourcePath)).toMatchObject({
      repairRequired: false,
      repairable: true,
    });
    await expect(repairSQLiteFtsIndex({ sourcePath, backupPath, confirm: true }))
      .resolves.toMatchObject({ repaired: false, backupPath: null });
    expect(existsSync(backupPath)).toBe(false);

    database.database.prepare("UPDATE memories SET tags = 'not-json' WHERE id = ?").run(memory.id);
    database.database.prepare("DELETE FROM memories_fts WHERE id = ?").run(memory.id);
    expect(planSQLiteFtsRepair(sourcePath)).toMatchObject({
      repairRequired: true,
      repairable: false,
      report: { canonicalOk: false, ftsOk: false },
    });
    await expect(repairSQLiteFtsIndex({ sourcePath, backupPath, confirm: true }))
      .rejects.toMatchObject({ code: "MEMORY_FTS_REPAIR_SOURCE_INVALID" });
    expect(existsSync(backupPath)).toBe(false);

    database.close();
  });

  it("rejects FTS repair backup paths that overlap any source SQLite sidecar", async () => {
    const { database, directory, service } = createTempDatabase();
    const memory = await service.remember({
      content: "Fileset overlap must fail before repair.",
      kind: "note",
      scope: "user:default",
      source: "test",
    });
    const sourcePath = join(directory, "memories.sqlite");
    database.database.prepare("DELETE FROM memories_fts WHERE id = ?").run(memory.id);

    await expect(repairSQLiteFtsIndex({
      sourcePath,
      backupPath: `${sourcePath}-wal`,
      confirm: true,
    })).rejects.toMatchObject({ code: "MEMORY_FTS_REPAIR_BACKUP_CONFLICT" });
    expect(planSQLiteFtsRepair(sourcePath).repairRequired).toBe(true);

    database.close();

    const reverseSourcePath = join(directory, "reverse.sqlite-wal");
    const reverse = new SQLiteMemoryDatabase({ path: reverseSourcePath });
    const reverseService = createServiceForDatabase(reverse, new PrefixedIdGenerator("reverse"));
    const reverseMemory = await reverseService.remember({
      content: "Reverse fileset overlap must also fail.",
      kind: "note",
      scope: "user:default",
      source: "test",
    });
    reverse.database.prepare("DELETE FROM memories_fts WHERE id = ?").run(reverseMemory.id);
    await expect(repairSQLiteFtsIndex({
      sourcePath: reverseSourcePath,
      backupPath: join(directory, "reverse.sqlite"),
      confirm: true,
    })).rejects.toMatchObject({ code: "MEMORY_FTS_REPAIR_BACKUP_CONFLICT" });
    reverse.close();
  });

  it.skipIf(process.platform === "win32")("refuses symbolic-link source and backup paths for FTS repair", async () => {
    const { database, directory, service } = createTempDatabase();
    const memory = await service.remember({
      content: "Symbolic links cannot redirect FTS repair.",
      kind: "note",
      scope: "user:default",
      source: "test",
    });
    const sourcePath = join(directory, "memories.sqlite");
    database.database.prepare("DELETE FROM memories_fts WHERE id = ?").run(memory.id);
    database.close();

    const sourceLink = join(directory, "linked-source.sqlite");
    symlinkSync(sourcePath, sourceLink);
    expect(planSQLiteFtsRepair(sourceLink)).toMatchObject({
      repairRequired: true,
      repairable: false,
      report: { integrityCheck: "unsafe_symlink" },
    });
    await expect(repairSQLiteFtsIndex({
      sourcePath: sourceLink,
      backupPath: join(directory, "source-link.backup.sqlite"),
      confirm: true,
    })).rejects.toMatchObject({ code: "MEMORY_FTS_REPAIR_PATH_UNSAFE" });

    const danglingBackup = join(directory, "dangling.backup.sqlite");
    symlinkSync(join(directory, "missing-target.sqlite"), danglingBackup);
    await expect(repairSQLiteFtsIndex({
      sourcePath,
      backupPath: danglingBackup,
      confirm: true,
    })).rejects.toMatchObject({ code: "MEMORY_FTS_REPAIR_PATH_UNSAFE" });
  });

  it.skipIf(process.platform === "win32")("allows stable intermediate directory symlinks while rejecting symlink files", async () => {
    const directory = mkdtempSync(join(tmpdir(), "nuzo-fts-parent-link-"));
    tempDirectories.push(directory);
    const realDirectory = join(directory, "real");
    const linkedDirectory = join(directory, "linked");
    mkdirSync(realDirectory, { mode: 0o700 });
    symlinkSync(realDirectory, linkedDirectory);
    const realSourcePath = join(realDirectory, "memories.sqlite");
    const linkedSourcePath = join(linkedDirectory, "memories.sqlite");
    const linkedBackupPath = join(linkedDirectory, "repair.backup.sqlite");
    const database = new SQLiteMemoryDatabase({ path: realSourcePath });
    const service = createServiceForDatabase(database, new PrefixedIdGenerator("parent_link"));
    const memory = await service.remember({
      content: "System directory aliases must not block safe local repair.",
      kind: "note",
      scope: "user:default",
      source: "test",
    });
    database.database.prepare("DELETE FROM memories_fts WHERE id = ?").run(memory.id);
    database.close();

    await expect(repairSQLiteFtsIndex({
      sourcePath: linkedSourcePath,
      backupPath: linkedBackupPath,
      confirm: true,
    })).resolves.toMatchObject({ repaired: true, backupPath: linkedBackupPath });
    expect(inspectSQLiteMemoryStore(realSourcePath)).toMatchObject({ ok: true, ftsOk: true });
    expect(inspectSQLiteMemoryStore(join(realDirectory, "repair.backup.sqlite")))
      .toMatchObject({ ok: true, ftsOk: true });
  });

  it("blocks FTS repair for altered canonical or FTS schemas", async () => {
    const { database, directory, service } = createTempDatabase();
    const memory = await service.remember({
      content: "Schema preconditions protect the repair boundary.",
      kind: "note",
      scope: "user:default",
      source: "test",
    });
    const sourcePath = join(directory, "memories.sqlite");
    database.database.prepare("DELETE FROM memories_fts WHERE id = ?").run(memory.id);
    database.database.exec(`
      DROP TABLE memory_events;
      CREATE VIEW memory_events AS
      SELECT id, id AS memory_id, 'memory.created' AS event_type,
        'test' AS actor, '{}' AS payload, created_at
      FROM memories;
    `);
    expect(planSQLiteFtsRepair(sourcePath)).toMatchObject({
      repairRequired: true,
      repairable: false,
      report: { canonicalOk: false },
    });
    database.close();

    const ftsPath = join(directory, "invalid-fts.sqlite");
    const invalidFts = new SQLiteMemoryDatabase({ path: ftsPath });
    invalidFts.database.exec(`
      DROP TABLE memories_fts;
      CREATE VIRTUAL TABLE memories_fts USING fts5(id, scope, content, tags);
    `);
    expect(planSQLiteFtsRepair(ftsPath)).toMatchObject({
      repairRequired: true,
      repairable: false,
      report: { canonicalOk: true, ftsOk: false, ftsSchemaOk: false },
    });
    invalidFts.close();
  });

  it("persists explicit memory relations and cascades hard deletes", async () => {
    const { database, service } = createTempDatabase();
    const previous = await service.remember({
      content: "Old test convention.",
      kind: "note",
      scope: "project:nuzo",
      source: "test",
    });
    const current = await service.remember({
      content: "Current test convention.",
      kind: "note",
      scope: "project:nuzo",
      source: "test",
    });
    const relation = await service.relate({
      sourceMemoryId: current.id,
      targetMemoryId: previous.id,
      relation: "supersedes",
      actor: "test",
    });

    expect(await service.relations({ memoryId: previous.id })).toMatchObject([
      { id: relation.id, sourceMemoryId: current.id, targetMemoryId: previous.id },
    ]);

    const reopenedService = createServiceForDatabase(database, new PrefixedIdGenerator("relations_reopen"));
    expect(await reopenedService.relations({ memoryId: current.id })).toMatchObject([
      { id: relation.id, relation: "supersedes" },
    ]);
    expect((await reopenedService.relationsBatch({
      memoryIds: [current.id],
      includeReverse: true,
      limitPerMemory: 10,
    })).get(current.id)).toMatchObject([
      { id: relation.id, relation: "supersedes" },
    ]);
    expect((await reopenedService.relationsBatch({
      memoryIds: [previous.id],
      includeReverse: true,
      limitPerMemory: 10,
    })).get(previous.id)).toMatchObject([
      { id: relation.id, relation: "supersedes" },
    ]);
    expect((await reopenedService.relationsBatch({
      memoryIds: [previous.id],
      includeReverse: false,
      limitPerMemory: 10,
    })).get(previous.id)).toEqual([]);

    await reopenedService.forget({
      id: previous.id,
      mode: "delete",
      confirm: true,
      actor: "test",
    });
    expect(await reopenedService.relations({ memoryId: current.id })).toEqual([]);

    database.close();
  });

  it("plans and atomically rehomes an explicit project scope through a validated WAL-safe backup", async () => {
    const { database, directory, service } = createTempDatabase();
    const sourceScope = "project:old-location" as const;
    const targetScope = "project:new-location" as const;
    const first = await service.remember({
      content: "Scope rehome preserves the first canonical record.",
      kind: "project_decision",
      scope: sourceScope,
      tags: ["rehome"],
      source: "test",
      reviewAfter: new Date("2027-01-01T00:00:00.000Z"),
    });
    const second = await service.remember({
      content: "Scope rehome preserves relations and lifecycle state.",
      kind: "note",
      scope: sourceScope,
      tags: ["rehome", "relations"],
      source: "test",
    });
    const archived = await service.remember({
      content: "Archived scope rehome fixture.",
      kind: "note",
      scope: sourceScope,
      source: "test",
    });
    await service.forget({ id: archived.id, mode: "archive", actor: "test" });
    const existingTarget = await service.remember({
      content: "Existing target-scope memory remains unchanged.",
      kind: "note",
      scope: targetScope,
      source: "test",
    });
    await service.relate({
      sourceMemoryId: first.id,
      targetMemoryId: second.id,
      relation: "related_to",
      actor: "test",
    });
    await service.relate({
      sourceMemoryId: second.id,
      targetMemoryId: existingTarget.id,
      relation: "related_to",
      actor: "test",
    });
    const sourcePath = join(directory, "memories.sqlite");
    const backupPath = join(directory, "before-rehome.sqlite");
    const before = snapshotCanonicalRows(database.database);
    const sourceBefore = database.database.prepare(
      "SELECT * FROM memories WHERE scope = ? ORDER BY id",
    ).all(sourceScope) as Array<Record<string, unknown>>;

    const plan = planSQLiteProjectScopeRehome({ sourcePath, sourceScope, targetScope });
    expect(plan).toMatchObject({
      version: 1,
      dryRun: true,
      applicable: true,
      memoryCount: 3,
      activeMemoryCount: 2,
      archivedMemoryCount: 1,
      targetMemoryCount: 1,
      affectedRelationCount: 2,
      historicalEventsRewritten: 0,
      collisionCount: 0,
      integrity: { ok: true, ftsOk: true },
    });
    expect(plan.planHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(snapshotCanonicalRows(database.database)).toEqual(before);
    database.close();

    const result = await rehomeSQLiteProjectScope({
      sourcePath,
      backupPath,
      sourceScope,
      targetScope,
      actor: "nuzo:cli",
      confirm: true,
    });
    expect(result).toMatchObject({
      version: 1,
      applied: true,
      sourceScope,
      targetScope,
      planHash: plan.planHash,
      memoryCount: 3,
      activeMemoryCount: 2,
      archivedMemoryCount: 1,
      affectedRelationCount: 2,
      historicalEventsRewritten: 0,
      revisionsPreserved: true,
      backup: { ok: true },
      after: { ok: true, ftsOk: true },
    });

    const backup = new Database(backupPath, { readonly: true, fileMustExist: true });
    expect(snapshotCanonicalRows(backup)).toEqual(before);
    backup.close();
    const reopened = new SQLiteMemoryDatabase({ path: sourcePath });
    expect(reopened.database.prepare("SELECT COUNT(*) AS count FROM memories WHERE scope = ?")
      .get(sourceScope)).toEqual({ count: 0 });
    const moved = reopened.database.prepare(
      "SELECT * FROM memories WHERE id IN (?, ?, ?) ORDER BY id",
    ).all(first.id, second.id, archived.id) as Array<Record<string, unknown>>;
    expect(moved.map(({ scope: _scope, ...row }) => row)).toEqual(
      sourceBefore.map(({ scope: _scope, ...row }) => row),
    );
    expect(moved.every((row) => row.scope === targetScope)).toBe(true);
    expect(reopened.database.prepare("SELECT * FROM memory_relations ORDER BY id").all())
      .toEqual(before.memory_relations);
    const historicalEvents = reopened.database.prepare(
      "SELECT * FROM memory_events WHERE event_type <> 'memory.scope.rehomed' ORDER BY id",
    ).all();
    expect(historicalEvents).toEqual(before.memory_events);
    const rehomeEvent = reopened.database.prepare(
      "SELECT * FROM memory_events WHERE event_type = 'memory.scope.rehomed'",
    ).get() as { id: string; memory_id: null; actor: string; payload: string };
    expect(rehomeEvent).toMatchObject({ id: result.eventId, memory_id: null, actor: "nuzo:cli" });
    expect(JSON.parse(rehomeEvent.payload)).toMatchObject({
      scope: targetScope,
      originalScope: sourceScope,
      memoryCount: 3,
      historicalEventsRewritten: 0,
      revisionsPreserved: true,
      planHash: plan.planHash,
    });
    expect(reopened.database.prepare(
      "SELECT COUNT(*) AS count FROM memories_fts WHERE scope = ?",
    ).get(targetScope)).toEqual({ count: 3 });
    const reopenedService = createServiceForDatabase(
      reopened,
      new PrefixedIdGenerator("rehome_audit"),
    );
    await expect(reopenedService.audit({
      scope: sourceScope,
      eventTypes: ["memory.scope.rehomed"],
    })).resolves.toMatchObject([{ id: result.eventId }]);
    await expect(reopenedService.audit({
      scope: targetScope,
      eventTypes: ["memory.scope.rehomed"],
    })).resolves.toMatchObject([{ id: result.eventId }]);
    reopened.close();
  });

  it("fails project-scope rehome collisions before backup or canonical mutation", async () => {
    const { database, directory, service } = createTempDatabase();
    const sourceScope = "project:collision-source" as const;
    const targetScope = "project:collision-target" as const;
    await service.remember({
      content: "The same normalized active memory.",
      kind: "note",
      scope: sourceScope,
      source: "test",
    });
    await service.remember({
      content: "  the SAME normalized active memory.  ",
      kind: "note",
      scope: targetScope,
      source: "test",
    });
    const sourcePath = join(directory, "memories.sqlite");
    const backupPath = join(directory, "collision-backup.sqlite");
    const before = snapshotCanonicalRows(database.database);
    expect(() => planSQLiteProjectScopeRehome({
      sourcePath,
      sourceScope: "user:default",
      targetScope,
    })).toThrowError(expect.objectContaining({ code: "MEMORY_SCOPE_REHOME_SCOPE_INVALID" }));
    expect(() => planSQLiteProjectScopeRehome({
      sourcePath,
      sourceScope: "project:auto",
      targetScope,
    })).toThrowError(expect.objectContaining({ code: "MEMORY_SCOPE_REHOME_SCOPE_INVALID" }));
    expect(() => planSQLiteProjectScopeRehome({
      sourcePath,
      sourceScope,
      targetScope: sourceScope,
    })).toThrowError(expect.objectContaining({ code: "MEMORY_SCOPE_REHOME_SCOPE_CONFLICT" }));
    const plan = planSQLiteProjectScopeRehome({ sourcePath, sourceScope, targetScope });
    expect(plan).toMatchObject({ applicable: false, collisionCount: 1 });
    expect(snapshotCanonicalRows(database.database)).toEqual(before);
    database.close();

    await expect(rehomeSQLiteProjectScope({
      sourcePath,
      backupPath,
      sourceScope,
      targetScope,
      actor: "nuzo:cli",
      confirm: true,
    })).rejects.toMatchObject({ code: "MEMORY_SCOPE_REHOME_COLLISION" });
    expect(existsSync(backupPath)).toBe(false);
    const unchanged = new Database(sourcePath, { readonly: true, fileMustExist: true });
    expect(snapshotCanonicalRows(unchanged)).toEqual(before);
    unchanged.close();
  });

  it.skipIf(process.platform === "win32")("refuses symbolic-link source and backup files for project-scope rehome", async () => {
    const { database, directory, service } = createTempDatabase();
    const sourceScope = "project:symlink-source" as const;
    const targetScope = "project:symlink-target" as const;
    await service.remember({
      content: "Scope rehome must not follow symbolic-link files.",
      kind: "note",
      scope: sourceScope,
      source: "test",
    });
    const sourcePath = join(directory, "memories.sqlite");
    database.close();
    const sourceLink = join(directory, "linked-source.sqlite");
    symlinkSync(sourcePath, sourceLink);
    expect(() => planSQLiteProjectScopeRehome({
      sourcePath: sourceLink,
      sourceScope,
      targetScope,
    })).toThrowError(expect.objectContaining({ code: "MEMORY_SCOPE_REHOME_PATH_UNSAFE" }));

    const backupLink = join(directory, "linked-backup.sqlite");
    symlinkSync(join(directory, "missing-backup.sqlite"), backupLink);
    await expect(rehomeSQLiteProjectScope({
      sourcePath,
      backupPath: backupLink,
      sourceScope,
      targetScope,
      actor: "nuzo:cli",
      confirm: true,
    })).rejects.toMatchObject({ code: "MEMORY_SCOPE_REHOME_PATH_UNSAFE" });
  });

  it("rolls back project-scope rehome failures and retains the validated recovery backup", async () => {
    const { database, directory, service } = createTempDatabase();
    const sourceScope = "project:rollback-source" as const;
    const targetScope = "project:rollback-target" as const;
    const first = await service.remember({
      content: "First rollback fixture.",
      kind: "note",
      scope: sourceScope,
      source: "test",
    });
    const second = await service.remember({
      content: "Second rollback fixture.",
      kind: "note",
      scope: sourceScope,
      source: "test",
    });
    const sourcePath = join(directory, "memories.sqlite");
    const backupPath = join(directory, "rollback-backup.sqlite");
    const before = snapshotCanonicalRows(database.database);
    database.database.exec(`
      CREATE TRIGGER fail_scope_rehome
      BEFORE UPDATE OF scope ON memories
      WHEN OLD.id = '${second.id}'
      BEGIN
        SELECT RAISE(ABORT, 'simulated scope rehome failure');
      END;
    `);
    database.close();

    await expect(rehomeSQLiteProjectScope({
      sourcePath,
      backupPath,
      sourceScope,
      targetScope,
      actor: "nuzo:cli",
      confirm: true,
    })).rejects.toMatchObject({
      code: "MEMORY_SCOPE_REHOME_FAILED",
      details: { backupPath },
    });
    expect(existsSync(backupPath)).toBe(true);
    expect(inspectSQLiteMemoryStore(sourcePath)).toMatchObject({ ok: true, ftsOk: true });
    const unchanged = new Database(sourcePath, { readonly: true, fileMustExist: true });
    expect(snapshotCanonicalRows(unchanged)).toEqual(before);
    expect(unchanged.prepare("SELECT scope FROM memories WHERE id = ?").get(first.id))
      .toEqual({ scope: sourceScope });
    unchanged.close();
  });

  it("creates a WAL-safe SQLite backup and restores it after validation", async () => {
    const { database, directory, service } = createTempDatabase();
    const memory = await service.remember({
      content: "SQLite backup must include uncheckpointed WAL memory data.",
      kind: "project_decision",
      scope: "project:nuzo",
      tags: ["backup", "wal"],
      source: "test",
    });
    await service.recall({
      query: "uncheckpointed WAL",
      scope: "project:nuzo",
      recordUsage: true,
    });
    const sourcePath = join(directory, "memories.sqlite");
    const backupPath = join(directory, "backup.sqlite");
    const restoredPath = join(directory, "restored.sqlite");

    const originalBackup = Database.prototype.backup;
    let modeWhenBackupStarted: number | null = null;
    const backupSpy = vi.spyOn(Database.prototype, "backup").mockImplementation(function (
      this: Database.Database,
      destinationFile: string,
      options?: Database.BackupOptions,
    ) {
      modeWhenBackupStarted = existsSync(destinationFile)
        ? statSync(destinationFile).mode & 0o777
        : null;
      return options === undefined
        ? originalBackup.call(this, destinationFile)
        : originalBackup.call(this, destinationFile, options);
    });
    let backup;
    try {
      backup = await backupSQLiteMemoryStore({ sourcePath, backupPath });
    } finally {
      backupSpy.mockRestore();
    }
    expect(modeWhenBackupStarted).toBe(0o600);
    expect(backup).toMatchObject({
      sourcePath,
      backupPath,
      remainingPages: 0,
      report: {
        ok: true,
        memoryCount: 1,
        ftsRowCount: 1,
      },
    });
    expect(backup.pages).toBeGreaterThan(0);
    expect(existsSync(backupPath)).toBe(true);
    expect(statSync(backupPath).mode & 0o777).toBe(0o600);

    const restored = restoreSQLiteMemoryStore({ backupPath, targetPath: restoredPath });
    expect(restored).toMatchObject({
      backupPath,
      targetPath: restoredPath,
      report: {
        ok: true,
        memoryCount: 1,
      },
    });

    const restoredDatabase = new SQLiteMemoryDatabase({ path: restoredPath });
    try {
      await expect(restoredDatabase.findById(memory.id)).resolves.toMatchObject({
        content: "SQLite backup must include uncheckpointed WAL memory data.",
        revision: 2,
      });
      await expect(restoredDatabase.list(memory.id)).resolves.toHaveLength(2);
      await expect(restoredDatabase.search({
        query: "backup WAL",
        scope: "project:nuzo",
      })).resolves.toHaveLength(1);
    } finally {
      restoredDatabase.close();
      database.close();
    }
  });

  it("restores a live SQLite source through its uncheckpointed WAL", async () => {
    const { database, directory, service } = createTempDatabase();
    const sourcePath = join(directory, "memories.sqlite");
    const restoredPath = join(directory, "restored-live.sqlite");
    database.database.pragma("wal_checkpoint(TRUNCATE)");
    database.database.pragma("wal_autocheckpoint = 0");

    const memory = await service.remember({
      content: "Restore must snapshot data that exists only in the live WAL.",
      kind: "project_decision",
      scope: "project:nuzo",
      tags: ["restore", "wal"],
      source: "test",
    });
    expect(statSync(`${sourcePath}-wal`).size).toBeGreaterThan(0);

    const restored = restoreSQLiteMemoryStore({
      backupPath: sourcePath,
      targetPath: restoredPath,
    });
    expect(restored.report).toMatchObject({
      ok: true,
      memoryCount: 1,
      ftsRowCount: 1,
    });
    expect(statSync(restoredPath).mode & 0o777).toBe(0o600);

    const restoredDatabase = new SQLiteMemoryDatabase({ path: restoredPath, readonly: true });
    try {
      await expect(restoredDatabase.findById(memory.id)).resolves.toMatchObject({
        content: "Restore must snapshot data that exists only in the live WAL.",
      });
      await expect(restoredDatabase.search({
        query: "live WAL",
        scope: "project:nuzo",
      })).resolves.toMatchObject([{ memory: { id: memory.id } }]);
    } finally {
      restoredDatabase.close();
      database.close();
    }
  });

  it("requires explicit overwrite for backup and restore targets", async () => {
    const { database, directory, service } = createTempDatabase();
    await service.remember({
      content: "Overwrite checks protect existing backup and restore paths.",
      kind: "note",
      scope: "user:default",
      source: "test",
    });
    const sourcePath = join(directory, "memories.sqlite");
    const backupPath = join(directory, "backup.sqlite");
    const targetPath = join(directory, "target.sqlite");

    await backupSQLiteMemoryStore({ sourcePath, backupPath });
    await expect(backupSQLiteMemoryStore({ sourcePath, backupPath }))
      .rejects.toMatchObject({ code: "MEMORY_BACKUP_EXISTS" });

    const target = new SQLiteMemoryDatabase({ path: targetPath });
    target.close();
    expect(() => restoreSQLiteMemoryStore({ backupPath, targetPath }))
      .toThrowError(expect.objectContaining({ code: "MEMORY_RESTORE_CONFIRMATION_REQUIRED" }));

    expect(() => restoreSQLiteMemoryStore({ backupPath, targetPath, overwrite: true }))
      .not.toThrow();
    expect(inspectSQLiteMemoryStore(targetPath)).toMatchObject({ ok: true, memoryCount: 1 });

    database.close();
  });

  it("does not treat imported originalScope metadata as an audit authorization scope", async () => {
    const { database, service } = createTempDatabase();
    const memory = await service.remember({
      content: "Imported audit scope filtering fixture.",
      kind: "note",
      scope: "project:allowed",
      source: "test",
    });
    await database.append({
      id: "evt_import_scope_filter",
      memoryId: memory.id,
      eventType: "memory.imported",
      actor: "nuzo:cli",
      payload: {
        originalScope: "project:unrelated",
        scope: "project:allowed",
        archived: false,
      },
      createdAt: new Date("2026-08-14T18:00:00.000Z"),
    });

    await expect(database.query({
      scope: "project:unrelated",
      eventTypes: ["memory.imported"],
    })).resolves.toEqual([]);
    await expect(database.query({
      scope: "project:allowed",
      eventTypes: ["memory.imported"],
    })).resolves.toMatchObject([{ id: "evt_import_scope_filter" }]);
    database.close();
  });

  it("rejects a database from a newer schema version with a structured error", () => {
    const directory = mkdtempSync(join(tmpdir(), "nuzo-schema-"));
    tempDirectories.push(directory);
    const path = join(directory, "memories.sqlite");
    const database = new Database(path);
    database.pragma("user_version = 8");
    database.close();

    expect(() => new SQLiteMemoryDatabase({ path })).toThrowError(
      expect.objectContaining({
        code: "MEMORY_SCHEMA_UNSUPPORTED",
        details: {
          currentVersion: 8,
          supportedVersion: 7,
        },
      }),
    );
  });

  it("opens generated 0.6.0, 0.7.0, and 0.8.0 stores for export/import compatibility", async () => {
    for (const releasedVersion of ["0.6.0", "0.7.0", "0.8.0"]) {
      const directory = mkdtempSync(join(tmpdir(), `nuzo-released-${releasedVersion}-`));
      tempDirectories.push(directory);
      const sourcePath = join(directory, "released.sqlite");
      const sourceDatabase = new SQLiteMemoryDatabase({ path: sourcePath });
      const sourceService = createServiceForDatabase(sourceDatabase, new PrefixedIdGenerator(releasedVersion.replaceAll(".", "_")));
      const memory = await sourceService.remember({
        content: `Generated ${releasedVersion} store keeps migration compatibility.`,
        kind: "project_decision",
        scope: "project:nuzo",
        tags: ["migration", `v${releasedVersion.replaceAll(".", "-")}`],
        source: `test:released:${releasedVersion}`,
      });
      const updated = await sourceService.update({
        id: memory.id,
        expectedRevision: memory.revision,
        content: `Generated ${releasedVersion} store preserves revisions after migration.`,
        actor: "test:released",
      });
      sourceDatabase.close();

      const reopened = new SQLiteMemoryDatabase({ path: sourcePath });
      const reopenedService = createServiceForDatabase(reopened, new PrefixedIdGenerator(`reopen_${releasedVersion.replaceAll(".", "_")}`));
      const document = await reopenedService.exportMemories({
        actor: "test:export",
        includeArchived: true,
      });
      expect(document.memories).toEqual([
        expect.objectContaining({
          content: `Generated ${releasedVersion} store preserves revisions after migration.`,
          source: `test:released:${releasedVersion}`,
        }),
      ]);
      await expect(reopened.findById(updated.id)).resolves.toMatchObject({
        revision: 2,
      });
      await expect(reopened.list(updated.id)).resolves.toHaveLength(2);
      await expect(reopened.search({
        query: "preserves revisions migration",
        scope: "project:nuzo",
      })).resolves.toHaveLength(1);

      const target = new SQLiteMemoryDatabase({ path: join(directory, "imported.sqlite") });
      const targetService = createServiceForDatabase(target, new PrefixedIdGenerator(`target_${releasedVersion.replaceAll(".", "_")}`));
      await expect(targetService.importMemories({
        document,
        actor: "test:import",
      })).resolves.toEqual({ imported: 1, skipped: 0, dryRun: false });
      await expect(targetService.importMemories({
        document,
        actor: "test:import",
      })).resolves.toEqual({ imported: 0, skipped: 1, dryRun: false });
      await expect(targetService.list({ includeArchived: true })).resolves.toHaveLength(1);

      target.close();
      reopened.close();
    }
  });

  it("persists and recalls memories with FTS", async () => {
    const { database, service } = createTempDatabase();

    const memory = await service.remember({
      content: "The user prefers SQLite for local-first prototypes.",
      kind: "preference",
      scope: "user:default",
      tags: ["sqlite", "architecture"],
      source: "test",
    });

    const results = await service.recall({
      query: "SQLite prototypes",
      scope: "user:default",
      recordUsage: true,
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.memory.id).toBe(memory.id);

    const events = await database.list(memory.id);
    expect(events.map((event) => event.eventType)).toEqual(["memory.created", "memory.recalled"]);
    expect(events[1]?.payload).toEqual({
      queryHash: "f6276cec4eb85cc77bb6bd4e351860f5ec09bbda8e0bc33aedab589c36e14e7a",
      queryHashAlgorithm: "sha256",
      score: results[0]?.score,
      scope: "user:default",
    });
    expect(JSON.stringify(events[1]?.payload)).not.toContain("SQLite prototypes");

    database.close();
  });

  it("queries store-wide audit events with SQLite filters", async () => {
    const { database, service } = createTempDatabase();

    const memory = await service.remember({
      content: "SQLite audit filters include global export events.",
      kind: "note",
      scope: "project:nuzo",
      tags: ["audit"],
      source: "test:sqlite",
    });
    await service.exportMemories({
      scope: "project:nuzo",
      actor: "test:export",
    });
    await service.forget({
      id: memory.id,
      actor: "test:forget",
      mode: "delete",
      confirm: true,
      reason: "Verify deleted memory scope remains auditable.",
    });

    const scopedEvents = await database.query({ scope: "project:nuzo" });
    expect(scopedEvents.map((event) => event.eventType)).toEqual([
      "memory.deleted",
      "memory.exported",
      "memory.created",
    ]);
    expect(scopedEvents[0]?.payload).toMatchObject({
      scope: "project:nuzo",
    });

    const exportedEvents = await database.query({
      eventTypes: ["memory.exported"],
      actor: "test:export",
    });
    expect(exportedEvents).toMatchObject([
      {
        memoryId: null,
        eventType: "memory.exported",
      },
    ]);

    const newestPage = await database.query({ limit: 1 });
    const olderPage = await database.query({
      limit: 2,
      cursor: {
        createdAt: newestPage[0]!.createdAt,
        id: newestPage[0]!.id,
      },
    });
    expect(newestPage.map((event) => event.eventType)).toEqual(["memory.deleted"]);
    expect(olderPage.map((event) => event.eventType)).toEqual([
      "memory.exported",
      "memory.created",
    ]);

    database.close();
  });

  it("prioritizes exact tag matches over common prompt words", async () => {
    const { database, service } = createTempDatabase();
    await service.remember({
      content: "Current project marker uses a generic context path.",
      kind: "fact",
      scope: "project:nuzo",
      tags: ["projecttopic"],
      source: "test",
    });
    const tagged: MemoryRecord[] = [];
    for (let index = 0; index < 7; index += 1) {
      tagged.push(await service.remember({
        content: `Bounded recall fixture ${index} must respect the result limit.`,
        kind: "note",
        scope: "project:nuzo",
        tags: ["boundedtopic"],
        source: "test",
      }));
    }

    const results = await service.recall({
      query: "List every boundedtopic fixture number available in the current context.",
      scope: "project:nuzo",
      limit: 5,
    });

    expect(results).toHaveLength(5);
    expect(results.every((result) => result.memory.tags.includes("boundedtopic"))).toBe(true);
    expect(results.every((result) => tagged.some((memory) => memory.id === result.memory.id)))
      .toBe(true);
    expect(results.every((result) => result.reason.startsWith("Matched tags: boundedtopic")))
      .toBe(true);

    database.close();
  });

  it("filters single-term noise from multi-term recall queries", async () => {
    const { database, service } = createTempDatabase();
    await service.remember({
      content: "Cloudflare routing changes use the local reverse proxy workflow.",
      kind: "project_decision",
      scope: "project:nuzo",
      tags: ["cloudflare", "routing", "workflow"],
      source: "test",
    });
    await service.remember({
      content: "Publish npm releases through trusted publishing with SLSA provenance.",
      kind: "project_decision",
      scope: "project:nuzo",
      tags: ["npm", "release", "provenance"],
      source: "test",
    });

    const provenance = await service.recall({
      query: "How should the npm release provenance be published?",
      scope: "project:nuzo",
      limit: 5,
    });
    expect(provenance.map((result) => result.memory.tags[0])).toEqual(["npm"]);

    const unrelatedSpecificQuery = await service.recall({
      query: "Kubernetes ingress routing",
      scope: "project:nuzo",
      limit: 5,
    });
    expect(unrelatedSpecificQuery).toEqual([]);

    database.close();
  });

  it("accepts distinctive terms without fixture-specific vocabulary", async () => {
    const { database, service } = createTempDatabase();
    const observability = await service.remember({
      content: "Observability uses local spans for diagnostic traces.",
      kind: "project_decision",
      scope: "project:nuzo",
      tags: ["diagnostics"],
      source: "test",
    });

    const results = await service.recall({
      query: "What observability guidance applies?",
      scope: "project:nuzo",
      limit: 5,
    });

    expect(results.map((result) => result.memory.id)).toEqual([observability.id]);
    database.close();
  });

  it("rejects stale update and forget revisions across SQLite connections", async () => {
    const { database: firstDatabase, directory, service: firstService } = createTempDatabase();
    const secondDatabase = new SQLiteMemoryDatabase({ path: join(directory, "memories.sqlite") });
    const secondService = createServiceForDatabase(secondDatabase, new PrefixedIdGenerator("b"));

    const memory = await firstService.remember({
      content: "Concurrent writes must not silently overwrite committed state.",
      kind: "instruction",
      scope: "project:nuzo",
      source: "test",
    });

    const updated = await secondService.update({
      id: memory.id,
      expectedRevision: memory.revision,
      content: "The second connection committed first.",
      actor: "test",
    });
    expect(updated.revision).toBe(2);

    await expect(
      firstService.update({
        id: memory.id,
        expectedRevision: memory.revision,
        content: "This stale update must fail.",
        actor: "test",
      }),
    ).rejects.toMatchObject({
      code: "MEMORY_REVISION_CONFLICT",
      details: {
        id: memory.id,
        expectedRevision: 1,
        currentRevision: 2,
      },
    });

    await expect(
      firstService.forget({
        id: memory.id,
        expectedRevision: memory.revision,
        actor: "test",
      }),
    ).rejects.toMatchObject({
      code: "MEMORY_REVISION_CONFLICT",
    });

    await expect(firstDatabase.findById(memory.id)).resolves.toMatchObject({
      revision: 2,
      content: "The second connection committed first.",
      archivedAt: null,
    });
    await expect(firstDatabase.list(memory.id)).resolves.toHaveLength(2);

    secondDatabase.close();
    firstDatabase.close();
  });

  it("deduplicates equivalent imports deterministically across SQLite connections", async () => {
    const { database: firstDatabase, directory, service: firstService } = createTempDatabase();
    const secondDatabase = new SQLiteMemoryDatabase({ path: join(directory, "memories.sqlite") });
    const secondService = createServiceForDatabase(secondDatabase);
    const document: MemoryExportDocument = {
      format: "nuzo-memory-export",
      version: 1,
      exported_at: "2026-06-12T00:00:00.000Z",
      memories: [
        {
          scope: "user:default",
          kind: "note",
          content: "Equivalent import writes should serialize cleanly.",
          tags: ["import", "concurrency"],
          source: "test",
          confidence: 1,
          created_at: "2026-06-12T00:00:00.000Z",
          updated_at: "2026-06-12T00:00:00.000Z",
          last_used_at: null,
          archived_at: null,
        },
      ],
    };

    const results = [
      await firstService.importMemories({ document, actor: "test" }),
      await secondService.importMemories({ document, actor: "test" }),
    ];

    expect(results).toEqual(
      expect.arrayContaining([
        { imported: 1, skipped: 0, dryRun: false },
        { imported: 0, skipped: 1, dryRun: false },
      ]),
    );
    await expect(firstService.list({ includeArchived: true })).resolves.toHaveLength(1);

    secondDatabase.close();
    firstDatabase.close();
  });

  it("recalls accented Unicode terms through SQLite FTS", async () => {
    const { database, service } = createTempDatabase();
    const memory = await service.remember({
      content: "A memória portátil deve continuar auditável.",
      kind: "instruction",
      scope: "user:default",
      source: "test",
    });

    const results = await service.recall({
      query: "memória auditável",
      scope: "user:default",
    });

    expect(results[0]?.memory.id).toBe(memory.id);
    database.close();
  });

  it("rolls back a memory row when FTS indexing fails", async () => {
    const { database, service } = createTempDatabase();
    database.database.exec("DROP TABLE memories_fts");

    await expect(
      service.remember({
        content: "This memory must roll back with a failed index.",
        kind: "note",
        scope: "user:default",
        source: "test",
      }),
    ).rejects.toThrow();

    const memoryCount = database.database
      .prepare("SELECT COUNT(*) AS count FROM memories")
      .get() as { count: number };
    const eventCount = database.database
      .prepare("SELECT COUNT(*) AS count FROM memory_events")
      .get() as { count: number };
    expect(memoryCount.count).toBe(0);
    expect(eventCount.count).toBe(0);

    database.close();
  });

  it("rolls back memory and FTS writes when audit persistence fails", async () => {
    const { database, service } = createTempDatabase();
    database.database.exec(`
      CREATE TRIGGER fail_created_audit
      BEFORE INSERT ON memory_events
      WHEN NEW.event_type = 'memory.created'
      BEGIN
        SELECT RAISE(ABORT, 'simulated audit failure');
      END;
    `);

    await expect(
      service.remember({
        content: "This memory must roll back with a failed audit event.",
        kind: "note",
        scope: "user:default",
        source: "test",
      }),
    ).rejects.toThrow("simulated audit failure");

    const memoryCount = database.database
      .prepare("SELECT COUNT(*) AS count FROM memories")
      .get() as { count: number };
    const indexCount = database.database
      .prepare("SELECT COUNT(*) AS count FROM memories_fts")
      .get() as { count: number };
    const eventCount = database.database
      .prepare("SELECT COUNT(*) AS count FROM memory_events")
      .get() as { count: number };
    expect(memoryCount.count).toBe(0);
    expect(indexCount.count).toBe(0);
    expect(eventCount.count).toBe(0);

    database.database.exec("DROP TRIGGER fail_created_audit");
    await expect(
      service.remember({
        content: "The transaction queue remains usable after rollback.",
        kind: "note",
        scope: "user:default",
        source: "test",
      }),
    ).resolves.toMatchObject({
      content: "The transaction queue remains usable after rollback.",
    });

    database.close();
  });

  it("rolls back an entire multi-item import when a later audit write fails", async () => {
    const { database, service } = createTempDatabase();
    const document: MemoryExportDocument = {
      format: "nuzo-memory-export",
      version: 1,
      exported_at: "2026-06-12T00:00:00.000Z",
      memories: [
        {
          scope: "user:default",
          kind: "note",
          content: "First imported memory must not commit alone.",
          tags: ["import"],
          source: "test",
          confidence: 1,
          created_at: "2026-06-12T00:00:00.000Z",
          updated_at: "2026-06-12T00:00:00.000Z",
          last_used_at: null,
          archived_at: null,
        },
        {
          scope: "user:default",
          kind: "note",
          content: "Second imported memory triggers rollback.",
          tags: ["import"],
          source: "test",
          confidence: 1,
          created_at: "2026-06-12T00:00:00.000Z",
          updated_at: "2026-06-12T00:00:00.000Z",
          last_used_at: null,
          archived_at: null,
        },
      ],
    };
    database.database.exec(`
      CREATE TRIGGER fail_second_import_audit
      BEFORE INSERT ON memory_events
      WHEN NEW.event_type = 'memory.imported' AND NEW.id = 'evt_000002'
      BEGIN
        SELECT RAISE(ABORT, 'simulated second import audit failure');
      END;
    `);

    await expect(
      service.importMemories({
        document,
        actor: "test",
      }),
    ).rejects.toThrow("simulated second import audit failure");

    const memoryCount = database.database
      .prepare("SELECT COUNT(*) AS count FROM memories")
      .get() as { count: number };
    const indexCount = database.database
      .prepare("SELECT COUNT(*) AS count FROM memories_fts")
      .get() as { count: number };
    const eventCount = database.database
      .prepare("SELECT COUNT(*) AS count FROM memory_events")
      .get() as { count: number };
    expect(memoryCount.count).toBe(0);
    expect(indexCount.count).toBe(0);
    expect(eventCount.count).toBe(0);

    database.close();
  });

  it("commits bulk forget per memory and rolls back only the failing memory", async () => {
    const { database, service } = createTempDatabase();
    const first = await service.remember({
      content: "Archive this memory before the simulated failure.",
      kind: "note",
      scope: "user:default",
      source: "test",
    });
    const second = await service.remember({
      content: "Keep this memory active when its audit write fails.",
      kind: "note",
      scope: "user:default",
      source: "test",
    });
    database.database
      .prepare("UPDATE memories SET updated_at = ? WHERE id = ?")
      .run("2026-06-13T00:00:00.000Z", first.id);
    database.database.exec(`
      CREATE TRIGGER fail_second_archive_audit
      BEFORE INSERT ON memory_events
      WHEN NEW.event_type = 'memory.archived' AND NEW.memory_id = 'mem_000002'
      BEGIN
        SELECT RAISE(ABORT, 'simulated second archive audit failure');
      END;
    `);

    await expect(
      service.forgetMany({
        all: true,
        actor: "test",
        dryRun: false,
      }),
    ).rejects.toThrow("simulated second archive audit failure");

    await expect(database.findById(first.id)).resolves.toMatchObject({
      archivedAt: expect.any(Date),
    });
    await expect(database.findById(second.id)).resolves.toMatchObject({
      archivedAt: null,
    });
    await expect(
      database.search({
        query: "audit",
        scope: "user:default",
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        memory: expect.objectContaining({ id: second.id }),
      }),
    ]);

    database.close();
  });

  it("excludes archived memories from list and search", async () => {
    const { database, service } = createTempDatabase();

    const memory = await service.remember({
      content: "Archive this SQLite memory.",
      kind: "note",
      scope: "user:default",
      source: "test",
    });

    await service.forget({ id: memory.id, actor: "test" });

    await expect(service.list()).resolves.toHaveLength(0);
    await expect(service.recall({ query: "SQLite", scope: "user:default" })).resolves.toHaveLength(0);

    database.close();
  });

  it("pushes list tag filtering, ordering, limits, and cursors into SQLite results", async () => {
    const { database, service } = createTempDatabase();

    await service.remember({
      content: "First tagged SQLite page item.",
      kind: "note",
      scope: "project:nuzo",
      tags: ["page"],
      source: "test",
    });
    await service.remember({
      content: "Second tagged SQLite page item.",
      kind: "note",
      scope: "project:nuzo",
      tags: ["page"],
      source: "test",
    });
    await service.remember({
      content: "Untagged SQLite page item.",
      kind: "note",
      scope: "project:nuzo",
      tags: ["other"],
      source: "test",
    });

    const firstPage = await service.list({
      scope: "project:nuzo",
      tags: ["page"],
      limit: 1,
    });
    expect(firstPage).toHaveLength(1);
    expect(firstPage[0]?.tags).toContain("page");

    const secondPage = await service.list({
      scope: "project:nuzo",
      tags: ["page"],
      cursor: encodeMemoryListCursor(firstPage[0]!),
      limit: 1,
    });
    expect(secondPage).toHaveLength(1);
    expect(secondPage[0]?.tags).toContain("page");
    expect(secondPage[0]?.id).not.toBe(firstPage[0]?.id);

    database.close();
  });
});
