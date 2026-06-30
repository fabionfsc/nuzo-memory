import Database from "better-sqlite3";
import { chmodSync, closeSync, existsSync, openSync } from "node:fs";
import { NuzoMemoryError } from "../errors.js";
import { decodeMemoryEventCursor, decodeMemoryListCursor } from "../pagination.js";
import type { AuditLog, MemoryStore, SearchIndex, TransactionManager } from "../ports.js";
import type {
  AuditEventFilter,
  ListMemoriesInput,
  MemoryHistoryInput,
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
    const candidates = rows.map((row) => {
      const memory = fromMemoryRow(row);
      const matchedTags = findExactTagMatches(queryTerms, memory.tags);
      const matchedStrongTags = matchedTags.filter((tag) => !recallWeakTerms.has(tag));
      const matchedTerms = findRecallTermMatches(queryTerms, memory);
      const matchedStrongTerms = matchedTerms.filter((term) => !recallWeakTerms.has(term));
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
    });
    const strongTermFrequency = countTermFrequency(
      candidates.map((candidate) => candidate.matchedStrongTerms),
    );
    return candidates
      .filter((result) => (
        (result.matchedTerms.length >= minimumMatches && result.matchedStrongTerms.length > 0) ||
        result.matchedStrongTerms.some((term) => strongTermFrequency.get(term) === 1) ||
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
  async list(memoryId: string, input?: MemoryHistoryInput): Promise<MemoryEvent[]>;
  async list(memoryIdOrFilter: string | ListMemoriesInput, input: MemoryHistoryInput = {}): Promise<MemoryEvent[] | MemoryRecord[]> {
    if (typeof memoryIdOrFilter !== "string") {
      return this.listMemories(memoryIdOrFilter);
    }

    const where = ["memory_id = @memory_id"];
    const params: Record<string, unknown> = {
      memory_id: memoryIdOrFilter,
    };

    if (input.cursor !== undefined) {
      const cursor = decodeMemoryEventCursor(input.cursor);
      where.push("(created_at > @cursor_created_at OR (created_at = @cursor_created_at AND id > @cursor_id))");
      params.cursor_created_at = cursor.created_at;
      params.cursor_id = cursor.id;
    }

    if (input.limit !== undefined) {
      params.limit = input.limit;
    }

    const sql = `
      SELECT *
      FROM memory_events
      WHERE ${where.join(" AND ")}
      ORDER BY created_at ASC, id ASC
      ${input.limit !== undefined ? "LIMIT @limit" : ""}
    `;

    const rows = this.database.prepare(sql).all(params) as MemoryEventRow[];
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
      where.push("m.scope = @scope");
      params.scope = filter.scope;
    }

    if (filter.includeArchived !== true) {
      where.push("m.archived_at IS NULL");
    }

    for (const [index, tag] of (filter.tags ?? []).entries()) {
      const parameterName = `tag_${index}`;
      where.push(`EXISTS (SELECT 1 FROM json_each(m.tags) WHERE value = @${parameterName})`);
      params[parameterName] = tag;
    }

    if (filter.cursor !== undefined) {
      const cursor = decodeMemoryListCursor(filter.cursor);
      where.push(`(
        m.updated_at < @cursor_updated_at OR
        (m.updated_at = @cursor_updated_at AND m.created_at < @cursor_created_at) OR
        (m.updated_at = @cursor_updated_at AND m.created_at = @cursor_created_at AND m.id < @cursor_id)
      )`);
      params.cursor_updated_at = cursor.updated_at;
      params.cursor_created_at = cursor.created_at;
      params.cursor_id = cursor.id;
    }

    if (filter.limit !== undefined) {
      params.limit = filter.limit;
    }

    const sql = `
      SELECT m.*
      FROM memories m
      ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY m.updated_at DESC, m.created_at DESC, m.id DESC
      ${filter.limit !== undefined ? "LIMIT @limit" : ""}
    `;

    const rows = this.database.prepare(sql).all(params) as MemoryRow[];
    return rows.map(fromMemoryRow);
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

function countTermFrequency(termGroups: string[][]): Map<string, number> {
  const frequencies = new Map<string, number>();
  for (const terms of termGroups) {
    for (const term of new Set(terms)) {
      frequencies.set(term, (frequencies.get(term) ?? 0) + 1);
    }
  }
  return frequencies;
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

const recallWeakTerms = new Set([
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
