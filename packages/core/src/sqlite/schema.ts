import type Database from "better-sqlite3";
import { NuzoMemoryError } from "../errors.js";

export const schemaVersion = 2;

export function migrate(database: Database.Database): void {
  database.pragma("journal_mode = WAL");
  database.pragma("busy_timeout = 5000");
  database.pragma("foreign_keys = ON");

  const currentVersion = database.pragma("user_version", { simple: true }) as number;
  if (currentVersion > schemaVersion) {
    throw new NuzoMemoryError(
      "MEMORY_SCHEMA_UNSUPPORTED",
      "SQLite memory schema is newer than this Nuzo version supports.",
      {
        currentVersion,
        supportedVersion: schemaVersion,
      },
    );
  }

  if (currentVersion < 1) {
    migrateToV1(database);
    database.pragma("user_version = 1");
  }

  if (currentVersion < 2) {
    migrateToV2(database);
    database.pragma(`user_version = ${schemaVersion}`);
  }
}

function migrateToV1(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      revision INTEGER NOT NULL DEFAULT 1,
      scope TEXT NOT NULL,
      kind TEXT NOT NULL,
      content TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]',
      source TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 1.0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_used_at TEXT,
      archived_at TEXT
    );

    CREATE TABLE IF NOT EXISTS memory_events (
      id TEXT PRIMARY KEY,
      memory_id TEXT,
      event_type TEXT NOT NULL,
      actor TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
      id UNINDEXED,
      scope UNINDEXED,
      content,
      tags
    );

    CREATE INDEX IF NOT EXISTS idx_memories_scope ON memories(scope);
    CREATE INDEX IF NOT EXISTS idx_memories_archived_at ON memories(archived_at);
    CREATE INDEX IF NOT EXISTS idx_memory_events_memory_id ON memory_events(memory_id);
  `);
}

function migrateToV2(database: Database.Database): void {
  const columns = database.pragma("table_info(memories)") as Array<{ name: string }>;
  if (!columns.some((column) => column.name === "revision")) {
    database.exec("ALTER TABLE memories ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;");
  }
}
