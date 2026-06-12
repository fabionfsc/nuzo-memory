import type Database from "better-sqlite3";

export const schemaVersion = 1;

export function migrate(database: Database.Database): void {
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");

  const currentVersion = database.pragma("user_version", { simple: true }) as number;
  if (currentVersion > schemaVersion) {
    throw new Error(`Unsupported SQLite schema version: ${currentVersion}`);
  }

  if (currentVersion < 1) {
    migrateToV1(database);
    database.pragma(`user_version = ${schemaVersion}`);
  }
}

function migrateToV1(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
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
