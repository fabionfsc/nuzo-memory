import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import {
  createMemoryService,
  DefaultPolicyEngine,
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
