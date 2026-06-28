import Database from "better-sqlite3";
import { chmodSync, closeSync, existsSync, openSync } from "node:fs";
import { NuzoMemoryError } from "../errors.js";
import type { AuditLog, MemoryStore, SearchIndex, TransactionManager } from "../ports.js";
import type {
  AuditEventFilter,
  ListMemoriesInput,
  MemoryEvent,
  MemoryKind,
  MemoryRecord,
  MemoryScope,
  RecallMemoriesInput,
  RecallMemoryResult,
} from "../types.js";
import { migrate } from "./schema.js";

interface MemoryRow {
  id: string;
  revision: number;
  scope: MemoryScope;
  kind: MemoryKind;
  content: string;
  tags: string;
  source: string;
  confidence: number;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
  archived_at: string | null;
}

interface MemoryEventRow {
  id: string;
  memory_id: string | null;
  event_type: MemoryEvent["eventType"];
  actor: string;
  payload: string;
  created_at: string;
}

interface SearchRow extends MemoryRow {
  score: number;
}

export interface SQLiteMemoryDatabaseOptions {
  path: string;
}

export class SQLiteMemoryDatabase implements MemoryStore, SearchIndex, AuditLog, TransactionManager {
  readonly database: Database.Database;
  private transactionQueue: Promise<void> = Promise.resolve();

  constructor(options: SQLiteMemoryDatabaseOptions) {
    createPrivateDatabaseFile(options.path);
    this.database = new Database(options.path);
    try {
      migrate(this.database);
      protectDatabaseFiles(options.path);
    } catch (error) {
      this.database.close();
      protectDatabaseFiles(options.path);
      throw error;
    }
  }

  close(): void {
    this.database.close();
    protectDatabaseFiles(this.database.name);
  }

  getSchemaVersion(): number {
    return this.database.pragma("user_version", { simple: true }) as number;
  }

  async run<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.transactionQueue;
    let release!: () => void;
    this.transactionQueue = new Promise<void>((resolve) => {
      release = resolve;
    });

    await previous;
    let started = false;
    try {
      this.database.exec("BEGIN IMMEDIATE");
      started = true;
      protectDatabaseFiles(this.database.name);
      const result = await operation();
      this.database.exec("COMMIT");
      return result;
    } catch (error) {
      if (started && this.database.inTransaction) {
        this.database.exec("ROLLBACK");
      }
      throw error;
    } finally {
      protectDatabaseFiles(this.database.name);
      release();
    }
  }

  async create(memory: MemoryRecord): Promise<void> {
    this.database
      .prepare(
        `
          INSERT INTO memories (
            id, scope, kind, content, tags, source, confidence,
            created_at, updated_at, last_used_at, archived_at
          )
          VALUES (
            @id, @scope, @kind, @content, @tags, @source, @confidence,
            @created_at, @updated_at, @last_used_at, @archived_at
          )
        `,
      )
      .run(toMemoryRow(memory));
  }

  async update(memory: MemoryRecord, expectedRevision?: number): Promise<boolean> {
    const where = expectedRevision === undefined ? "id = @id" : "id = @id AND revision = @expected_revision";
    const result = this.database
      .prepare(
        `
          UPDATE memories
          SET revision = @revision,
              scope = @scope,
              kind = @kind,
              content = @content,
              tags = @tags,
              source = @source,
              confidence = @confidence,
              created_at = @created_at,
              updated_at = @updated_at,
              last_used_at = @last_used_at,
              archived_at = @archived_at
          WHERE ${where}
        `,
      )
      .run({
        ...toMemoryRow(memory),
        expected_revision: expectedRevision,
      });
    return result.changes === 1;
  }

  async findById(id: string): Promise<MemoryRecord | null> {
    const row = this.database.prepare("SELECT * FROM memories WHERE id = ?").get(id) as
      | MemoryRow
      | undefined;
    return row ? fromMemoryRow(row) : null;
  }

  async archive(id: string, archivedAt: Date, expectedRevision?: number): Promise<boolean> {
    const where = expectedRevision === undefined ? "id = @id" : "id = @id AND revision = @expected_revision";
    const result = this.database
      .prepare(
        `
          UPDATE memories
          SET revision = revision + 1,
              archived_at = @archived_at,
              updated_at = @archived_at
          WHERE ${where}
        `,
      )
      .run({ id, archived_at: archivedAt.toISOString(), expected_revision: expectedRevision });
    return result.changes === 1;
  }

  async delete(id: string, expectedRevision?: number): Promise<boolean> {
    const where = expectedRevision === undefined ? "id = ?" : "id = ? AND revision = ?";
    const result =
      expectedRevision === undefined
        ? this.database.prepare(`DELETE FROM memories WHERE ${where}`).run(id)
        : this.database.prepare(`DELETE FROM memories WHERE ${where}`).run(id, expectedRevision);
    return result.changes === 1;
  }

  async index(memory: MemoryRecord): Promise<void> {
    this.database.prepare("DELETE FROM memories_fts WHERE id = ?").run(memory.id);
    if (memory.archivedAt) {
      return;
    }

    this.database
      .prepare("INSERT INTO memories_fts (id, scope, content, tags) VALUES (?, ?, ?, ?)")
      .run(memory.id, memory.scope, memory.content, memory.tags.join(" "));
  }

  async remove(memoryId: string): Promise<void> {
    this.database.prepare("DELETE FROM memories_fts WHERE id = ?").run(memoryId);
  }

  async search(input: RecallMemoriesInput): Promise<RecallMemoryResult[]> {
    const limit = input.limit ?? 8;
    const candidateLimit = Math.min(Math.max(limit * 8, limit), 200);
    const query = toFtsQuery(input.query);
    if (!query) {
      return [];
    }

    const scopeClause =
      input.includeGlobal === true
        ? "AND (m.scope = @scope OR m.scope = 'user:default')"
        : "AND m.scope = @scope";
    const rows = this.database
      .prepare(
        `
          SELECT m.*, bm25(memories_fts, 0.0, 0.0, 1.0, 5.0) * -1 AS score
          FROM memories_fts
          JOIN memories m ON m.id = memories_fts.id
          WHERE memories_fts MATCH @query
            AND m.archived_at IS NULL
            ${scopeClause}
          ORDER BY bm25(memories_fts, 0.0, 0.0, 1.0, 5.0)
          LIMIT @limit
        `,
      )
      .all({ query, scope: input.scope, limit: candidateLimit }) as SearchRow[];

    const queryTerms = tokenizeSearchText(input.query);
    const minimumMatches = minimumRecallMatches(queryTerms);
    return rows
      .map((row) => {
        const memory = fromMemoryRow(row);
        const matchedTags = findExactTagMatches(queryTerms, memory.tags);
        const matchedStrongTags = matchedTags.filter((tag) => !recallWeakTagTerms.has(tag));
        const matchedTerms = findRecallTermMatches(queryTerms, memory);
        const matchedStrongTerms = matchedTerms.filter((term) => !recallWeakTagTerms.has(term));
        return {
          memory,
          matchedTerms,
          matchedTags,
          matchedStrongTags,
          matchedStrongTerms,
          score: row.score + matchedTags.length * 1_000 + matchedTerms.length * 10,
          reason: [
            matchedTags.length > 0 ? `Matched tags: ${matchedTags.join(", ")}` : null,
            matchedTerms.length > 0 ? `Matched terms: ${matchedTerms.join(", ")}` : null,
            `FTS query: ${query}`,
          ].filter(Boolean).join("; "),
        };
      })
      .filter((result) => (
        (result.matchedTerms.length >= minimumMatches && result.matchedStrongTerms.length > 0) ||
        result.matchedStrongTerms.length >= minimumMatches ||
        result.matchedStrongTerms.some(isDistinctiveSingleRecallTerm) ||
        (queryTerms.length <= 2 && result.matchedStrongTags.length > 0) ||
        result.matchedTags.length >= 2 ||
        result.matchedStrongTags.length > 0
      ))
      .sort((left, right) => right.score - left.score)
      .slice(0, limit)
      .map(({
        matchedTerms: _matchedTerms,
        matchedTags: _matchedTags,
        matchedStrongTags: _matchedStrongTags,
        matchedStrongTerms: _matchedStrongTerms,
        ...result
      }) => result);
  }

  async append(event: MemoryEvent): Promise<void> {
    this.database
      .prepare(
        `
          INSERT INTO memory_events (id, memory_id, event_type, actor, payload, created_at)
          VALUES (@id, @memory_id, @event_type, @actor, @payload, @created_at)
        `,
      )
      .run(toEventRow(event));
  }

  async list(filter: ListMemoriesInput): Promise<MemoryRecord[]>;
  async list(memoryId: string): Promise<MemoryEvent[]>;
  async list(memoryIdOrFilter: string | ListMemoriesInput): Promise<MemoryEvent[] | MemoryRecord[]> {
    if (typeof memoryIdOrFilter !== "string") {
      return this.listMemories(memoryIdOrFilter);
    }

    const rows = this.database
      .prepare("SELECT * FROM memory_events WHERE memory_id = ? ORDER BY created_at ASC")
      .all(memoryIdOrFilter) as MemoryEventRow[];
    return rows.map(fromEventRow);
  }

  async query(filter: AuditEventFilter): Promise<MemoryEvent[]> {
    const where: string[] = [];
    const params: Record<string, unknown> = {
      limit: filter.limit ?? 50,
    };

    if (filter.memoryId !== undefined) {
      where.push("e.memory_id = @memory_id");
      params.memory_id = filter.memoryId;
    }

    if (filter.eventTypes !== undefined && filter.eventTypes.length > 0) {
      const placeholders = filter.eventTypes.map((_, index) => `@event_type_${index}`);
      where.push(`e.event_type IN (${placeholders.join(", ")})`);
      filter.eventTypes.forEach((eventType, index) => {
        params[`event_type_${index}`] = eventType;
      });
    }

    if (filter.actor !== undefined) {
      where.push("e.actor = @actor");
      params.actor = filter.actor;
    }

    if (filter.scope !== undefined) {
      where.push("(m.scope = @scope OR json_extract(e.payload, '$.scope') = @scope OR json_extract(e.payload, '$.originalScope') = @scope)");
      params.scope = filter.scope;
    }

    if (filter.since !== undefined) {
      where.push("e.created_at >= @since");
      params.since = filter.since.toISOString();
    }

    if (filter.until !== undefined) {
      where.push("e.created_at <= @until");
      params.until = filter.until.toISOString();
    }

    const sql = `
      SELECT e.*
      FROM memory_events e
      LEFT JOIN memories m ON m.id = e.memory_id
      ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY e.created_at DESC, e.id DESC
      LIMIT @limit
    `;

    const rows = this.database.prepare(sql).all(params) as MemoryEventRow[];
    return rows.map(fromEventRow);
  }

  private async listMemories(filter: ListMemoriesInput): Promise<MemoryRecord[]> {
    const where: string[] = [];
    const params: Record<string, unknown> = {};

    if (filter.scope) {
      where.push("scope = @scope");
      params.scope = filter.scope;
    }

    if (filter.includeArchived !== true) {
      where.push("archived_at IS NULL");
    }

    const sql = `
      SELECT *
      FROM memories
      ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY updated_at DESC, created_at DESC
    `;

    const rows = this.database.prepare(sql).all(params) as MemoryRow[];
    return rows
      .map(fromMemoryRow)
      .filter((memory) => !filter.tags || filter.tags.every((tag) => memory.tags.includes(tag)));
  }
}

function toMemoryRow(memory: MemoryRecord): Record<string, unknown> {
  return {
    id: memory.id,
    revision: memory.revision,
    scope: memory.scope,
    kind: memory.kind,
    content: memory.content,
    tags: JSON.stringify(memory.tags),
    source: memory.source,
    confidence: memory.confidence,
    created_at: memory.createdAt.toISOString(),
    updated_at: memory.updatedAt.toISOString(),
    last_used_at: memory.lastUsedAt?.toISOString() ?? null,
    archived_at: memory.archivedAt?.toISOString() ?? null,
  };
}

function fromMemoryRow(row: MemoryRow): MemoryRecord {
  return {
    id: row.id,
    revision: row.revision,
    scope: row.scope,
    kind: row.kind,
    content: row.content,
    tags: parseTags(row.tags),
    source: row.source,
    confidence: row.confidence,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    lastUsedAt: row.last_used_at ? new Date(row.last_used_at) : null,
    archivedAt: row.archived_at ? new Date(row.archived_at) : null,
  };
}

function toEventRow(event: MemoryEvent): Record<string, unknown> {
  return {
    id: event.id,
    memory_id: event.memoryId,
    event_type: event.eventType,
    actor: event.actor,
    payload: JSON.stringify(event.payload),
    created_at: event.createdAt.toISOString(),
  };
}

function fromEventRow(row: MemoryEventRow): MemoryEvent {
  return {
    id: row.id,
    memoryId: row.memory_id,
    eventType: row.event_type,
    actor: row.actor,
    payload: parsePayload(row.payload),
    createdAt: new Date(row.created_at),
  };
}

function parseTags(value: string): string[] {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed) || !parsed.every((tag) => typeof tag === "string")) {
    throw new NuzoMemoryError("MEMORY_TAGS_INVALID", "Stored memory tags are invalid.");
  }
  return parsed;
}

function parsePayload(value: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new NuzoMemoryError("MEMORY_EVENT_PAYLOAD_INVALID", "Stored memory event payload is invalid.");
  }
  return parsed as Record<string, unknown>;
}

function toFtsQuery(query: string): string {
  return tokenizeSearchText(query)
    .map((term) => `"${term.replaceAll('"', '""')}"`)
    .join(" OR ");
}

function tokenizeSearchText(value: string): string[] {
  return value
    .trim()
    .toLowerCase()
    .split(/[^\p{L}\p{N}_]+/u)
    .filter((term) => term.length > 1 && !recallStopWords.has(term));
}

function findExactTagMatches(queryTerms: string[], tags: string[]): string[] {
  const queryTermSet = new Set(queryTerms);
  return tags.filter((tag) => {
    const tagTerms = [tag, ...tag.split(/[._-]+/u)].filter(Boolean);
    return tagTerms.some((term) => queryTermSet.has(term));
  });
}

function findRecallTermMatches(queryTerms: string[], memory: MemoryRecord): string[] {
  const memoryTerms = new Set(tokenizeSearchText(`${memory.content} ${memory.tags.join(" ")}`));
  return [...new Set(queryTerms.filter((term) => memoryTerms.has(term)))];
}

function minimumRecallMatches(queryTerms: string[]): number {
  if (queryTerms.length <= 1) {
    return 1;
  }
  return 2;
}

const recallStopWords = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "be",
  "by",
  "all",
  "applies",
  "before",
  "change",
  "changes",
  "command",
  "commands",
  "for",
  "from",
  "how",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "package",
  "packages",
  "require",
  "required",
  "requires",
  "release",
  "releases",
  "should",
  "the",
  "to",
  "what",
  "when",
  "where",
  "which",
  "who",
  "with",
  "validate",
  "validates",
  "qual",
  "quais",
  "como",
  "de",
  "da",
  "do",
  "das",
  "dos",
  "em",
  "para",
  "por",
  "que",
]);

const recallWeakTagTerms = new Set([
  "ci",
  "docs",
  "errors",
  "privacy",
  "release",
  "review",
  "routing",
  "security",
  "storage",
  "testing",
  "workflow",
]);

const recallDistinctiveSingleMatchTerms = new Set([
  "api",
  "bezpieczeństwa",
  "cloudflare",
  "credentials",
  "databasewijzigingen",
  "geheimnisse",
  "go",
  "node",
  "한국어",
]);

function isDistinctiveSingleRecallTerm(term: string): boolean {
  return recallDistinctiveSingleMatchTerms.has(term);
}

function protectDatabaseFiles(path: string): void {
  for (const candidate of [path, `${path}-wal`, `${path}-shm`]) {
    if (existsSync(candidate)) {
      chmodSync(candidate, 0o600);
    }
  }
}

function createPrivateDatabaseFile(path: string): void {
  if (path === ":memory:") {
    return;
  }
  const descriptor = openSync(path, "a", 0o600);
  closeSync(descriptor);
  chmodSync(path, 0o600);
}
