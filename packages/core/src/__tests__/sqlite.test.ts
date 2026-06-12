import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
