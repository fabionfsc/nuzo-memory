import type Database from "better-sqlite3";
import { toCaptureDuplicateKey } from "../capture-suggestions.js";
import { NuzoMemoryError } from "../errors.js";

export const schemaVersion = 7;

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
    database.pragma("user_version = 2");
  }

  if (currentVersion < 3) {
    migrateToV3(database);
    database.pragma("user_version = 3");
  }

  if (currentVersion < 4) {
    migrateToV4(database);
    database.pragma("user_version = 4");
  }

  if (currentVersion < 5) {
    migrateToV5(database);
    database.pragma("user_version = 5");
  }

  if (currentVersion < 6) {
    migrateToV6(database);
    database.pragma("user_version = 6");
  }

  if (currentVersion < 7) {
    migrateToV7(database);
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

function migrateToV3(database: Database.Database): void {
  const columns = database.pragma("table_info(memories)") as Array<{ name: string }>;
  if (!columns.some((column) => column.name === "provenance")) {
    database.exec("ALTER TABLE memories ADD COLUMN provenance TEXT;");
  }
}

function migrateToV4(database: Database.Database): void {
  const columns = database.pragma("table_info(memories)") as Array<{ name: string }>;
  if (!columns.some((column) => column.name === "confidence_state")) {
    database.exec("ALTER TABLE memories ADD COLUMN confidence_state TEXT;");
  }
}

function migrateToV5(database: Database.Database): void {
  const columns = database.pragma("table_info(memories)") as Array<{ name: string }>;
  if (!columns.some((column) => column.name === "review_after")) {
    database.exec("ALTER TABLE memories ADD COLUMN review_after TEXT;");
  }
  if (!columns.some((column) => column.name === "expires_at")) {
    database.exec("ALTER TABLE memories ADD COLUMN expires_at TEXT;");
  }
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_memories_review_after ON memories(review_after);
    CREATE INDEX IF NOT EXISTS idx_memories_expires_at ON memories(expires_at);
  `);
}

function migrateToV6(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS memory_relations (
      id TEXT PRIMARY KEY,
      source_memory_id TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
      target_memory_id TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
      relation TEXT NOT NULL,
      reason TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(source_memory_id, target_memory_id, relation)
    );

    CREATE INDEX IF NOT EXISTS idx_memory_relations_source ON memory_relations(source_memory_id);
    CREATE INDEX IF NOT EXISTS idx_memory_relations_target ON memory_relations(target_memory_id);
  `);
}

function migrateToV7(database: Database.Database): void {
  const columns = database.pragma("table_info(memories)") as Array<{ name: string }>;
  if (!columns.some((column) => column.name === "capture_key")) {
    database.exec("ALTER TABLE memories ADD COLUMN capture_key TEXT;");
  }

  const rows = database.prepare("SELECT id, content FROM memories WHERE capture_key IS NULL").all() as Array<{
    id: string;
    content: string;
  }>;
  const updateCaptureKey = database.prepare("UPDATE memories SET capture_key = ? WHERE id = ?");
  for (const row of rows) {
    updateCaptureKey.run(toCaptureDuplicateKey(row.content), row.id);
  }

  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_memories_active_capture_key
      ON memories(scope, capture_key, id) WHERE archived_at IS NULL;
  `);
}
