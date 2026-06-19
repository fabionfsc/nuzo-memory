import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import {
  createMemoryService,
  DefaultPolicyEngine,
  type MemoryExportDocument,
  RegexSecretScanner,
  SQLiteMemoryDatabase,
} from "../index.js";
import { FixedClock, SequentialIdGenerator } from "../testing.js";

let tempDirectories: string[] = [];

afterEach(() => {
  for (const directory of tempDirectories) {
    rmSync(directory, { recursive: true, force: true });
  }
  tempDirectories = [];
});

function createTempDatabase() {
  const directory = mkdtempSync(join(tmpdir(), "nuzo-core-"));
  tempDirectories.push(directory);
  const database = new SQLiteMemoryDatabase({ path: join(directory, "memories.sqlite") });
  const service = createMemoryService({
    store: database,
    searchIndex: database,
    auditLog: database,
    clock: new FixedClock(),
    ids: new SequentialIdGenerator(),
    policy: new DefaultPolicyEngine(new RegexSecretScanner()),
    transactions: database,
  });

  return { database, service };
}

describe("SQLiteMemoryDatabase", () => {
  it("creates the complete version 1 schema from an empty database", () => {
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
            'idx_memory_events_memory_id'
          )
          ORDER BY name
        `,
      )
      .all() as Array<{ name: string; type: string }>;

    expect(database.getSchemaVersion()).toBe(1);
    expect(objects).toEqual([
      { name: "idx_memories_archived_at", type: "index" },
      { name: "idx_memories_scope", type: "index" },
      { name: "idx_memory_events_memory_id", type: "index" },
      { name: "memories", type: "table" },
      { name: "memories_fts", type: "table" },
      { name: "memory_events", type: "table" },
    ]);

    database.close();
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

    expect(reopened.getSchemaVersion()).toBe(1);
    await expect(reopened.findById(memory.id)).resolves.toMatchObject({
      content: "Migration tests preserve fake memory data.",
      tags: ["migration"],
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

  it("rejects a database from a newer schema version with a structured error", () => {
    const directory = mkdtempSync(join(tmpdir(), "nuzo-schema-"));
    tempDirectories.push(directory);
    const path = join(directory, "memories.sqlite");
    const database = new Database(path);
    database.pragma("user_version = 2");
    database.close();

    expect(() => new SQLiteMemoryDatabase({ path })).toThrowError(
      expect.objectContaining({
        code: "MEMORY_SCHEMA_UNSUPPORTED",
        details: {
          currentVersion: 2,
          supportedVersion: 1,
        },
      }),
    );
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
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.memory.id).toBe(memory.id);

    const events = await database.list(memory.id);
    expect(events.map((event) => event.eventType)).toEqual(["memory.created", "memory.recalled"]);

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
});
