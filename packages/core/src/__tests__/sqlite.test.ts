import { mkdtempSync, rmSync, statSync } from "node:fs";
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

class PrefixedIdGenerator implements IdGenerator {
  private memoryCounter = 0;
  private eventCounter = 0;

  constructor(private readonly prefix: string) {}

  memoryId(): string {
    this.memoryCounter += 1;
    return `mem_${this.prefix}_${String(this.memoryCounter).padStart(6, "0")}`;
  }

  eventId(): string {
    this.eventCounter += 1;
    return `evt_${this.prefix}_${String(this.eventCounter).padStart(6, "0")}`;
  }
}

describe("SQLiteMemoryDatabase", () => {
  it("creates the complete version 2 schema from an empty database", () => {
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

    const columns = database.database.pragma("table_info(memories)") as Array<{ name: string }>;

    expect(database.getSchemaVersion()).toBe(2);
    expect(database.database.pragma("busy_timeout", { simple: true })).toBe(5000);
    expect(columns.some((column) => column.name === "revision")).toBe(true);
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

    expect(reopened.getSchemaVersion()).toBe(2);
    await expect(reopened.findById(memory.id)).resolves.toMatchObject({
      revision: 1,
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
    database.pragma("user_version = 3");
    database.close();

    expect(() => new SQLiteMemoryDatabase({ path })).toThrowError(
      expect.objectContaining({
        code: "MEMORY_SCHEMA_UNSUPPORTED",
        details: {
          currentVersion: 3,
          supportedVersion: 2,
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
      recordUsage: true,
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.memory.id).toBe(memory.id);

    const events = await database.list(memory.id);
    expect(events.map((event) => event.eventType)).toEqual(["memory.created", "memory.recalled"]);

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
    const tagged = [];
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
});
