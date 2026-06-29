import { describe, expect, it } from "vitest";
import type { MemoryRecord, MemoryService } from "@nuzo/memory-core";
import {
  createMemoryToolHandlers,
  type MemoryDoctorDiagnostics,
} from "../handlers.js";

function createTestHandlers(options: {
  failList?: boolean;
  doctorDiagnostics?: MemoryDoctorDiagnostics;
  projectScope?: `project:${string}`;
} = {}) {
  let memory: MemoryRecord | null = null;
  const calls = {
    remember: 0,
    recall: [] as Array<{
      query: string;
      scope: string;
      limit?: number;
      includeGlobal?: boolean;
      recordUsage?: boolean;
    }>,
    suggestCapture: 0,
    update: 0,
    history: 0,
    forget: 0,
    forgetMany: 0,
    exportMemories: 0,
    importMemories: 0,
    confirmCapture: 0,
  };
  const service: MemoryService = {
    async suggestCapture(input) {
      calls.suggestCapture += 1;
      const duplicate = memory?.content.trim().toLowerCase() === input.content.trim().toLowerCase()
        ? memory
        : null;
      if (input.relationshipMode === "bounded" && memory && duplicate === null) {
        return {
          status: "review",
          memoryWrites: false,
          requiresConfirmation: true,
          draft: {
            content: input.content.trim(),
            kind: input.kind,
            scope: input.scope,
            tags: [...new Set(input.tags ?? [])],
            source: input.source,
            confidence: input.confidence ?? 1,
            reason: input.reason.trim(),
          },
          duplicate: null,
          relationshipMode: "bounded",
          relationship: "update_candidate",
          relationshipEvidence: {
            version: 1,
            primaryMemoryId: memory.id,
            candidateLimit: 20,
            returnedLimit: 3,
            evaluatedCount: 1,
            searchExhaustive: true,
            evidenceTruncated: false,
            reason: "Mock bounded relationship evidence.",
            candidates: [{
              memory,
              matchedTerms: ["final"],
              matchedTags: ["communication"],
              reason: "Mock update candidate.",
            }],
          },
        };
      }
      return {
        status: duplicate ? "duplicate" : "ready",
        memoryWrites: false,
        requiresConfirmation: true,
        draft: {
          content: input.content.trim(),
          kind: input.kind,
          scope: input.scope,
          tags: [...new Set(input.tags ?? [])],
          source: input.source,
          confidence: input.confidence ?? 1,
          reason: input.reason.trim(),
        },
        duplicate,
      };
    },
    async confirmCapture(input) {
      calls.confirmCapture += 1;
      if (input.decision === "reject") {
        return {
          decision: input.decision,
          status: "skipped",
          memoryWrites: false,
          memory: null,
          requiresConfirmation: false,
          reason: input.reason.trim(),
        };
      }
      if (input.decision === "clarify") {
        return {
          decision: input.decision,
          status: "needs_clarification",
          memoryWrites: false,
          memory: null,
          requiresConfirmation: false,
          reason: input.reason.trim(),
        };
      }
      if (input.decision === "update" && memory) {
        memory = {
          ...memory,
          revision: memory.revision + 1,
          content: input.content.trim(),
          kind: input.kind,
          scope: input.scope,
          tags: input.tags ?? [],
          confidence: input.confidence ?? memory.confidence,
          updatedAt: new Date("2026-06-13T01:00:00.000Z"),
        };
        return {
          decision: input.decision,
          status: "updated",
          memoryWrites: true,
          memory,
          requiresConfirmation: false,
          reason: input.reason.trim(),
        };
      }
      memory = {
        id: "mem_000001",
        revision: 1,
        scope: input.scope,
        kind: input.kind,
        content: input.content.trim(),
        tags: input.tags ?? [],
        source: input.source,
        confidence: input.confidence ?? 1,
        createdAt: new Date("2026-06-13T00:00:00.000Z"),
        updatedAt: new Date("2026-06-13T00:00:00.000Z"),
        lastUsedAt: null,
        archivedAt: null,
      };
      return {
        decision: input.decision,
        status: "created",
        memoryWrites: true,
        memory,
        requiresConfirmation: false,
        reason: input.reason.trim(),
      };
    },
    async remember(input) {
      calls.remember += 1;
      memory = {
        id: "mem_000001",
        revision: 1,
        scope: input.scope,
        kind: input.kind,
        content: input.content,
        tags: input.tags ?? [],
        source: input.source,
        confidence: input.confidence ?? 1,
        createdAt: new Date("2026-06-13T00:00:00.000Z"),
        updatedAt: new Date("2026-06-13T00:00:00.000Z"),
        lastUsedAt: null,
        archivedAt: null,
      };
      return memory;
    },
    async recall() {
      calls.recall.push({
        query: "legacy mock recall",
        scope: "user:default",
      });
      return memory
        ? [
            {
              memory,
              score: 1,
              reason: "Matched test memory.",
            },
          ]
        : [];
    },
    async recallDetailed(input) {
      calls.recall.push(input);
      const results = memory
        ? [{ memory, score: 1, reason: "Matched test memory." }]
        : [];
      const mode = input.retrievalMode ?? "fts";
      return {
        results,
        diagnostics: {
          requestedMode: mode,
          effectiveMode: mode,
          semanticFallbackCode: null,
        },
      };
    },
    async list(input = {}) {
      if (options.failList === true) {
        throw new Error("simulated store failure");
      }
      if (input.includeArchived !== true && memory?.archivedAt) {
        return [];
      }
      return memory ? [memory] : [];
    },
    async update(input) {
      calls.update += 1;
      if (!memory) {
        throw new Error("No memory");
      }
      memory = {
        ...memory,
        revision: memory.revision + 1,
        content: input.content ?? memory.content,
        tags: input.tags ?? memory.tags,
        updatedAt: new Date("2026-06-13T01:00:00.000Z"),
      };
      return memory;
    },
    async history(id) {
      calls.history += 1;
      return memory?.id === id
        ? [
            {
              id: "evt_000001",
              memoryId: id,
              eventType: "memory.created",
              actor: "nuzo:mcp",
              payload: { kind: memory.kind, scope: memory.scope, tags: memory.tags },
              createdAt: new Date("2026-06-13T00:00:00.000Z"),
            },
          ]
        : [];
    },
    async exportMemories(input) {
      calls.exportMemories += 1;
      return {
        format: "nuzo-memory-export",
        version: 1,
        exported_at: "2026-06-13T00:00:00.000Z",
        memories:
          memory && (input.includeArchived === true || memory.archivedAt === null)
            ? [
                {
                  scope: memory.scope,
                  kind: memory.kind,
                  content: memory.content,
                  tags: memory.tags,
                  source: memory.source,
                  confidence: memory.confidence,
                  created_at: memory.createdAt.toISOString(),
                  updated_at: memory.updatedAt.toISOString(),
                  last_used_at: memory.lastUsedAt?.toISOString() ?? null,
                  archived_at: memory.archivedAt?.toISOString() ?? null,
                },
              ]
            : [],
      };
    },
    async importMemories(input) {
      calls.importMemories += 1;
      return {
        imported: input.document.memories.length,
        skipped: 0,
        dryRun: input.dryRun === true,
      };
    },
    async forget(input) {
      calls.forget += 1;
      if (memory && input.mode === "archive") {
        memory = {
          ...memory,
          revision: memory.revision + 1,
          archivedAt: new Date("2026-06-13T02:00:00.000Z"),
        };
      }
      if (input.mode === "delete") {
        memory = null;
      }
    },
    async forgetMany(input) {
      calls.forgetMany += 1;
      const matches = memory &&
        (input.all === true || input.scope === memory.scope) &&
        (!input.tags || input.tags.every((tag) => memory?.tags.includes(tag)))
        ? [memory]
        : [];
      if (input.dryRun !== false) {
        return {
          matched: matches.length,
          affected: 0,
          mode: input.mode ?? "archive",
          dryRun: true,
          ids: matches.map((item) => item.id),
        };
      }
      for (const item of matches) {
        if (input.mode === "delete") {
          memory = null;
        } else {
          memory = {
            ...item,
            revision: item.revision + 1,
            archivedAt: new Date("2026-06-13T02:00:00.000Z"),
          };
        }
      }
      return {
        matched: matches.length,
        affected: matches.length,
        mode: input.mode ?? "archive",
        dryRun: false,
        ids: matches.map((item) => item.id),
      };
    },
  };

  service.recall = async (input) => {
    calls.recall.push(input);
    return memory
      ? [
          {
            memory,
            score: 1,
            reason: "Matched test memory.",
          },
        ]
      : [];
  };

  return {
    calls,
    handlers: createMemoryToolHandlers(service, {
      storePath: "/tmp/nuzo-test.sqlite",
      ...(options.projectScope === undefined ? {} : { projectScope: options.projectScope }),
      ...(options.doctorDiagnostics === undefined
        ? {}
        : { doctorDiagnostics: options.doctorDiagnostics }),
    }),
  };
}

describe("memory MCP handlers", () => {
  it("remembers and recalls through tool-shaped inputs", async () => {
    const { handlers } = createTestHandlers();

    const remembered = await handlers.remember({
      content: "The user prefers explicit MCP contracts.",
      kind: "preference",
      scope: "user:default",
      tags: ["mcp"],
      source: "nuzo:mcp",
    });

    expect(remembered).toEqual({
      id: "mem_000001",
      created: true,
      warnings: [],
    });

    const recalled = await handlers.recall({
      query: "MCP contracts",
      scope: "user:default",
      limit: 8,
      include_global: false,
    });

    expect(recalled.results).toHaveLength(1);
    expect(recalled.results[0]).toMatchObject({
      id: "mem_000001",
      content: "The user prefers explicit MCP contracts.",
      kind: "preference",
      scope: "user:default",
      tags: ["mcp"],
    });

    const hybrid = await handlers.recall({
      query: "MCP contracts",
      scope: "user:default",
      limit: 8,
      include_global: false,
      retrieval_mode: "hybrid",
    });
    expect(hybrid.retrieval).toEqual({
      requested_mode: "hybrid",
      effective_mode: "hybrid",
      semantic_fallback_code: null,
    });
  });

  it("lists, updates, forgets, exports, imports, and reports doctor output", async () => {
    const { handlers } = createTestHandlers();
    const remembered = await handlers.remember({
      content: "The user prefers explicit MCP contracts.",
      kind: "preference",
      scope: "user:default",
      tags: ["mcp"],
      source: "nuzo:mcp",
    });

    const listed = await handlers.list({
      tags: [],
      include_archived: false,
    });
    expect(listed.memories[0]?.id).toBe(remembered.id);

    const updated = await handlers.update({
      id: remembered.id,
      content: "The user prefers complete MCP contracts.",
      tags: ["mcp", "contracts"],
    });
    expect(updated.memory).toMatchObject({
      content: "The user prefers complete MCP contracts.",
      tags: ["mcp", "contracts"],
    });

    const history = await handlers.history({ id: remembered.id });
    expect(history.events).toEqual([
      {
        id: "evt_000001",
        memory_id: remembered.id,
        event_type: "memory.created",
        actor: "nuzo:mcp",
        payload: {
          kind: "preference",
          scope: "user:default",
          tags: ["mcp", "contracts"],
        },
        created_at: "2026-06-13T00:00:00.000Z",
      },
    ]);

    const exported = await handlers.exportMemories({
      tags: [],
      include_archived: false,
    });
    expect(exported.memories).toHaveLength(1);

    const imported = await handlers.importMemories({
      document: exported,
      dry_run: true,
    });
    expect(imported).toEqual({
      imported: 1,
      skipped: 0,
      dry_run: true,
    });

    const forgotten = await handlers.forget({
      id: remembered.id,
      mode: "archive",
      confirm: false,
    });
    expect(forgotten).toEqual({
      id: remembered.id,
      forgotten: true,
      mode: "archive",
    });

    const visible = await handlers.list({
      tags: [],
      include_archived: false,
    });
    expect(visible.memories).toEqual([]);

    const doctor = await handlers.doctor();
    expect(doctor.ok).toBe(true);
    expect(doctor.store).toEqual({
      path: "/tmp/nuzo-test.sqlite",
      readable: true,
      writable_check: "not_performed",
    });
    expect(doctor.counts).toEqual({
      active_memories: 0,
      archived_memories: 1,
      total_memories: 1,
    });
    expect(doctor.schema).toEqual({
      current_version: null,
      supported_version: null,
      status: "not_performed",
    });
    expect(doctor.integrity).toEqual({
      ok: null,
      path: null,
      schema_version: null,
      supported_schema_version: null,
      integrity_check: null,
      foreign_key_violations: null,
      memory_count: null,
      active_memory_count: null,
      fts_row_count: null,
      missing_fts_rows: null,
      orphan_fts_rows: null,
      errors: [],
      status: "not_performed",
    });
    expect(doctor.lifecycle).toEqual({
      recall_hook: "available",
      automatic_host_hooks: "verify_in_host",
      autoload_tag: "autoload",
      supported_events: ["SessionStart", "UserPromptSubmit"],
    });
    expect(doctor.tools).toContain("memory.import");
    expect(doctor.tools).toContain("memory.history");
    expect(doctor.tools).toContain("memory.recall_hook");
    expect(doctor.network).toBe("disabled");
    expect(JSON.stringify(doctor)).not.toContain("complete MCP contracts");
    expect(doctor.warnings).toEqual([]);
  });

  it("reports schema and writability warnings from runtime diagnostics", async () => {
    const { handlers } = createTestHandlers({
      doctorDiagnostics: {
        schema: {
          currentVersion: 1,
          supportedVersion: 2,
        },
        integrity: {
          ok: false,
          path: "/tmp/nuzo-test.sqlite",
          schemaVersion: 1,
          supportedSchemaVersion: 2,
          integrityCheck: "ok",
          foreignKeyViolations: 0,
          memoryCount: 1,
          activeMemoryCount: 1,
          ftsRowCount: 0,
          missingFtsRows: 1,
          orphanFtsRows: 0,
          errors: ["1 active memory row(s) are missing from FTS"],
        },
        writable: false,
      },
    });

    const doctor = await handlers.doctor();

    expect(doctor.ok).toBe(false);
    expect(doctor.store.writable_check).toBe("not_writable");
    expect(doctor.schema).toEqual({
      current_version: 1,
      supported_version: 2,
      status: "outdated",
    });
    expect(doctor.warnings).toEqual([
      "memory store writability check failed",
      "memory store schema is older than the supported version",
      "memory integrity: 1 active memory row(s) are missing from FTS",
    ]);
    expect(doctor.integrity).toMatchObject({
      ok: false,
      status: "failed",
      missing_fts_rows: 1,
      errors: ["1 active memory row(s) are missing from FTS"],
    });
  });

  it("previews and applies filtered bulk forget operations", async () => {
    const { handlers } = createTestHandlers();
    const remembered = await handlers.remember({
      content: "Archive this MCP bulk memory.",
      kind: "note",
      scope: "project:nuzo",
      tags: ["obsolete"],
      source: "nuzo:mcp",
    });

    const preview = await handlers.forgetMany({
      scope: "project:nuzo",
      tags: ["obsolete"],
      all: false,
      mode: "archive",
      confirm: false,
      dry_run: true,
    });
    expect(preview).toEqual({
      matched: 1,
      affected: 0,
      mode: "archive",
      dry_run: true,
      ids: [remembered.id],
    });

    const applied = await handlers.forgetMany({
      scope: "project:nuzo",
      tags: ["obsolete"],
      all: false,
      mode: "archive",
      confirm: false,
      dry_run: false,
    });
    expect(applied).toEqual({
      matched: 1,
      affected: 1,
      mode: "archive",
      dry_run: false,
      ids: [remembered.id],
    });
  });

  it("reports MCP doctor warnings without exposing memory content", async () => {
    const { handlers } = createTestHandlers({ failList: true });

    const doctor = await handlers.doctor();

    expect(doctor.ok).toBe(false);
    expect(doctor.network).toBe("disabled");
    expect(doctor.store).toEqual({
      path: "/tmp/nuzo-test.sqlite",
      readable: false,
      writable_check: "not_performed",
    });
    expect(doctor.counts).toEqual({
      active_memories: null,
      archived_memories: null,
      total_memories: null,
    });
    expect(doctor.integrity.status).toBe("not_performed");
    expect(doctor.warnings).toEqual([
      "memory store read check failed: simulated store failure",
    ]);
  });

  it("runs recall hook as a limited read-only recall entrypoint", async () => {
    const { calls, handlers } = createTestHandlers();
    await handlers.remember({
      content: "Nuzo should use GitHub Issues as the execution tracker.",
      kind: "instruction",
      scope: "project:nuzo",
      tags: ["workflow"],
      source: "test",
    });
    calls.remember = 0;

    const result = await handlers.recallHook({
      task_context: "  Please continue Nuzo issue work.\nUse the project tracker.  ",
      project_scope: "project:nuzo",
      limit: 20,
    });

    expect(result).toMatchObject({
      mode: "read_only",
      memory_writes: false,
      capture_suggestions: false,
      query: "Please continue Nuzo issue work. Use the project tracker.",
      scope: "project:nuzo",
      include_global: true,
      limit: 8,
    });
    expect(result.results).toHaveLength(1);
    expect(calls.recall.at(-1)).toEqual({
      query: "Please continue Nuzo issue work. Use the project tracker.",
      scope: "project:nuzo",
      limit: 8,
      includeGlobal: true,
      recordUsage: false,
    });
    expect(calls.remember).toBe(0);
    expect(calls.update).toBe(0);
    expect(calls.history).toBe(0);
    expect(calls.forget).toBe(0);
    expect(calls.forgetMany).toBe(0);
    expect(calls.exportMemories).toBe(0);
    expect(calls.importMemories).toBe(0);
  });

  it("resolves project:auto to the active host project scope", async () => {
    const { calls, handlers } = createTestHandlers({ projectScope: "project:resolved" });

    await handlers.remember({
      content: "Use the active project scope.",
      kind: "instruction",
      scope: "project:auto",
      tags: ["workflow"],
      source: "test",
    });
    const listed = await handlers.list({
      scope: "project:auto",
      tags: [],
      include_archived: false,
    });

    const result = await handlers.recallHook({
      task_context: "Cloudflare workflow",
      project_scope: "project:auto",
    });

    expect(listed.memories[0]?.scope).toBe("project:resolved");
    expect(result.scope).toBe("project:resolved");
    expect(calls.recall.at(-1)?.scope).toBe("project:resolved");
  });

  it("validates capture suggestions without calling remember", async () => {
    const { calls, handlers } = createTestHandlers();

    const suggestion = await handlers.suggestCapture({
      content: "  The user prefers concise final answers.  ",
      kind: "preference",
      scope: "user:default",
      tags: ["workflow", "workflow"],
      source: "codex:capture-suggestion",
      confidence: 0.72,
      reason: "The user stated a durable response style preference.",
    });

    expect(suggestion).toEqual({
      status: "ready",
      memory_writes: false,
      requires_confirmation: true,
      draft: {
        content: "The user prefers concise final answers.",
        kind: "preference",
        scope: "user:default",
        tags: ["workflow"],
        source: "codex:capture-suggestion",
        confidence: 0.72,
        reason: "The user stated a durable response style preference.",
      },
      duplicate: null,
    });
    expect(calls.suggestCapture).toBe(1);
    expect(calls.remember).toBe(0);
  });

  it("returns duplicate capture suggestions with the existing memory", async () => {
    const { handlers } = createTestHandlers();
    const remembered = await handlers.remember({
      content: "The user prefers concise final answers.",
      kind: "preference",
      scope: "user:default",
      tags: ["workflow"],
      source: "nuzo:mcp",
    });

    const suggestion = await handlers.suggestCapture({
      content: "The user prefers concise final answers.",
      kind: "note",
      scope: "user:default",
      tags: ["style"],
      source: "codex:capture-suggestion",
      reason: "Equivalent content was inferred from the conversation.",
    });

    expect(suggestion.status).toBe("duplicate");
    expect(suggestion.memory_writes).toBe(false);
    expect(suggestion.duplicate).toMatchObject({
      id: remembered.id,
      content: "The user prefers concise final answers.",
      scope: "user:default",
    });
  });

  it("returns bounded capture relationship evidence", async () => {
    const { handlers } = createTestHandlers();
    const remembered = await handlers.remember({
      content: "The user prefers concise final answers with explicit tradeoffs.",
      kind: "preference",
      scope: "user:default",
      tags: ["communication", "style"],
      source: "nuzo:mcp",
    });

    const suggestion = await handlers.suggestCapture({
      content: "The user prefers detailed final answers with explicit tradeoffs.",
      kind: "preference",
      scope: "user:default",
      tags: ["communication"],
      source: "codex:capture-suggestion",
      reason: "The user stated a durable response style preference.",
      relationship_mode: "bounded",
    });

    expect(suggestion).toMatchObject({
      status: "review",
      memory_writes: false,
      requires_confirmation: true,
      duplicate: null,
      relationship_mode: "bounded",
      relationship: "update_candidate",
      relationship_evidence: {
        primary_memory_id: remembered.id,
        candidate_limit: 20,
        returned_limit: 3,
        candidates: [
          {
            memory: { id: remembered.id },
            matched_tags: ["communication"],
          },
        ],
      },
    });
  });

  it("confirms capture decisions through the core service", async () => {
    const { calls, handlers } = createTestHandlers();

    const created = await handlers.confirmCapture({
      decision: "create",
      content: "The user prefers concise final answers.",
      kind: "preference",
      scope: "user:default",
      tags: ["communication"],
      source: "codex:capture-confirmed",
      reason: "The user confirmed a durable preference.",
      confirm: true,
      actor: "nuzo:mcp",
    });
    expect(created).toMatchObject({
      decision: "create",
      status: "created",
      memory_writes: true,
      requires_confirmation: false,
      memory: {
        id: "mem_000001",
        revision: 1,
        scope: "user:default",
      },
    });

    const updated = await handlers.confirmCapture({
      decision: "update",
      content: "The user prefers detailed final answers.",
      kind: "preference",
      scope: "user:default",
      tags: ["communication"],
      source: "codex:capture-confirmed",
      reason: "The user confirmed a replacement preference.",
      confirm: true,
      actor: "nuzo:mcp",
      target_memory_id: "mem_000001",
      expected_revision: 1,
    });
    expect(updated).toMatchObject({
      decision: "update",
      status: "updated",
      memory_writes: true,
      memory: {
        id: "mem_000001",
        revision: 2,
        content: "The user prefers detailed final answers.",
      },
    });

    const rejected = await handlers.confirmCapture({
      decision: "reject",
      content: "Rejected draft.",
      kind: "note",
      scope: "user:default",
      tags: [],
      source: "codex:capture-confirmed",
      reason: "The user rejected the draft.",
      confirm: false,
      actor: "nuzo:mcp",
    });
    expect(rejected).toMatchObject({
      decision: "reject",
      status: "skipped",
      memory_writes: false,
      memory: null,
    });
    expect(calls.confirmCapture).toBe(3);
    expect(calls.remember).toBe(0);
  });
});
