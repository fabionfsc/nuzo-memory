import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  createMemoryService,
  DefaultPolicyEngine,
  projectScopeFromPath,
  RandomIdGenerator,
  RegexSecretScanner,
  SQLiteMemoryDatabase,
  SystemClock,
  type EmbeddingProvider,
} from "@nuzo/memory-core";
import { afterEach, describe, expect, it } from "vitest";
import { createNuzoMcpServerRuntime } from "../index.js";
import { sortedMemoryToolNames } from "../tool-contract.js";
import {
  type BoundedSuggestionOutput,
  type ConfirmCaptureOutput,
  expectToolError,
  parseToolJson,
  protocolState,
  rememberProtocolMemory,
  toolText,
} from "./protocol-test-utils.js";

let tempDirectories: string[] = [];

afterEach(() => {
  for (const directory of tempDirectories) {
    rmSync(directory, { recursive: true, force: true });
  }
  tempDirectories = [];
});

describe("MCP protocol contract", () => {
  it("awaits semantic provider disposal when the runtime closes", async () => {
    const directory = mkdtempSync(join(tmpdir(), "nuzo-mcp-runtime-close-"));
    tempDirectories.push(directory);
    let releaseDispose!: () => void;
    let disposeStarted = false;
    let disposed = false;
    const disposeBarrier = new Promise<void>((resolve) => {
      releaseDispose = resolve;
    });
    const semanticProvider: EmbeddingProvider = {
      descriptor: {
        id: "test-provider",
        model: "test-model",
        revision: "test",
        dimensions: 2,
        network: "none",
      },
      async embedDocuments(texts) {
        return texts.map(() => [1, 0]);
      },
      async embedQuery() {
        return [1, 0];
      },
      async dispose() {
        disposeStarted = true;
        await disposeBarrier;
        disposed = true;
      },
    };
    const runtime = createNuzoMcpServerRuntime({
      storePath: join(directory, "memories.sqlite"),
      semanticProvider,
    });

    let closeResolved = false;
    const closePromise = runtime.close().then(() => {
      closeResolved = true;
    });
    await Promise.resolve();

    expect(disposeStarted).toBe(true);
    expect(closeResolved).toBe(false);

    releaseDispose();
    await closePromise;

    expect(disposed).toBe(true);
    expect(closeResolved).toBe(true);
    await expect(runtime.close()).resolves.toBeUndefined();
  });

  it("discovers and calls the public tool contract through the SDK", async () => {
    const directory = mkdtempSync(join(tmpdir(), "nuzo-mcp-protocol-"));
    tempDirectories.push(directory);
    const runtime = createNuzoMcpServerRuntime({
      storePath: join(directory, "memories.sqlite"),
    });
    const client = new Client({
      name: "nuzo-contract-test",
      version: "0.0.0",
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    try {
      await Promise.all([
        runtime.server.connect(serverTransport),
        client.connect(clientTransport),
      ]);

      const tools = await client.listTools();
      expect(tools.tools.map((tool) => tool.name).sort()).toEqual(sortedMemoryToolNames);
      const tool = (name: string) => tools.tools.find((candidate) => candidate.name === name);
      expect(tool("memory.remember")).toMatchObject({
        description: expect.stringContaining("only when the user explicitly requested this exact write"),
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false,
        },
      });
      expect(tool("memory.suggest_capture")).toMatchObject({
        description: expect.stringContaining("Display the returned draft to the user"),
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      });
      expect(tool("memory.confirm_capture")).toMatchObject({
        description: expect.stringContaining("host's attestation"),
        annotations: {
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: false,
          openWorldHint: false,
        },
      });
      const annotationGroups = {
        readOnly: [
          "memory.recall",
          "memory.recall_hook",
          "memory.suggest_capture",
          "memory.list",
          "memory.show",
          "memory.relations",
          "memory.history",
          "memory.audit",
          "memory.doctor",
        ],
        write: [
          "memory.remember",
          "memory.challenge",
          "memory.relate",
          "memory.export",
          "memory.import",
        ],
        destructive: [
          "memory.confirm_capture",
          "memory.unrelate",
          "memory.update",
          "memory.forget",
          "memory.forget_many",
        ],
      };
      for (const name of annotationGroups.readOnly) {
        expect(tool(name)?.annotations, name).toEqual({
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        });
      }
      for (const name of annotationGroups.write) {
        expect(tool(name)?.annotations, name).toEqual({
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false,
        });
      }
      for (const name of annotationGroups.destructive) {
        expect(tool(name)?.annotations, name).toEqual({
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: false,
          openWorldHint: false,
        });
      }
      expect(tools.tools.find((tool) => tool.name === "memory.remember")?.inputSchema)
        .toMatchObject({
          type: "object",
          required: ["content", "kind"],
          properties: {
            confidence_state: {
              anyOf: expect.arrayContaining([
                expect.objectContaining({
                  type: "string",
                }),
              ]),
            },
            provenance: {
              anyOf: expect.arrayContaining([
                expect.objectContaining({
                  type: "object",
                }),
              ]),
            },
            review_after: {
              anyOf: expect.arrayContaining([
                expect.objectContaining({
                  type: "string",
                }),
              ]),
            },
            expires_at: {
              anyOf: expect.arrayContaining([
                expect.objectContaining({
                  type: "string",
                }),
              ]),
            },
            scope: {
              default: "user:default",
              type: "string",
            },
          },
        });
      expect(tools.tools.find((tool) => tool.name === "memory.forget_many")?.inputSchema)
        .toMatchObject({
          type: "object",
          properties: {
            dry_run: {
              default: true,
              type: "boolean",
            },
          },
        });
      expect(tools.tools.find((tool) => tool.name === "memory.list")?.inputSchema)
        .toMatchObject({
          type: "object",
          properties: {
            needs_review: {
              default: false,
              type: "boolean",
            },
          },
        });
      expect(tools.tools.find((tool) => tool.name === "memory.suggest_capture")?.inputSchema)
        .toMatchObject({
          type: "object",
          required: ["content", "kind", "reason"],
          properties: {
            confidence_state: {
              anyOf: expect.arrayContaining([
                expect.objectContaining({
                  type: "string",
                }),
              ]),
            },
            provenance: {
              anyOf: expect.arrayContaining([
                expect.objectContaining({
                  type: "object",
                }),
              ]),
            },
            review_after: {
              anyOf: expect.arrayContaining([
                expect.objectContaining({
                  type: "string",
                }),
              ]),
            },
            expires_at: {
              anyOf: expect.arrayContaining([
                expect.objectContaining({
                  type: "string",
                }),
              ]),
            },
            relationship_mode: {
              type: "string",
            },
            source: {
              default: "nuzo:capture-suggestion",
              type: "string",
            },
          },
        });
      expect(tools.tools.find((tool) => tool.name === "memory.audit")?.inputSchema)
        .toMatchObject({
          type: "object",
          properties: {
            limit: {
              default: 50,
              type: "integer",
            },
          },
        });

      const readySuggestion = parseToolJson(await client.callTool({
        name: "memory.suggest_capture",
        arguments: {
          content: "The protocol test uses local auditable memory.",
          kind: "project_decision",
          scope: "project:nuzo",
          tags: ["protocol"],
          source: "test:capture-suggestion",
          confidence: 0.8,
          reason: "The test proposed a durable project decision.",
        },
      })) as {
        status: string;
        memory_writes: boolean;
        requires_confirmation: boolean;
        duplicate: unknown;
        draft: { content: string; confidence: number };
      };
      expect(readySuggestion).toMatchObject({
        status: "ready",
        memory_writes: false,
        requires_confirmation: true,
        duplicate: null,
        draft: {
          content: "The protocol test uses local auditable memory.",
          confidence: 0.8,
        },
      });

      const remembered = parseToolJson(await client.callTool({
        name: "memory.remember",
        arguments: {
          content: "The protocol test uses local auditable memory.",
          kind: "project_decision",
          scope: "project:nuzo",
          tags: ["protocol"],
          source: "test:mcp-client",
        },
      })) as { created: boolean; id: string };
      expect(remembered).toMatchObject({
        created: true,
      });
      expect(remembered.id).toMatch(/^mem_/);
      const rememberedHistory = parseToolJson(await client.callTool({
        name: "memory.history",
        arguments: { id: remembered.id },
      })) as { events: Array<{ actor: string; event_type: string }> };
      expect(rememberedHistory.events[0]).toMatchObject({
        actor: "nuzo:mcp",
        event_type: "memory.created",
      });

      const duplicateSuggestion = parseToolJson(await client.callTool({
        name: "memory.suggest_capture",
        arguments: {
          content: "  the protocol test uses local   auditable memory. ",
          kind: "note",
          scope: "project:nuzo",
          tags: ["protocol"],
          reason: "Equivalent content was inferred after the write.",
        },
      })) as {
        status: string;
        memory_writes: boolean;
        duplicate: { id: string; content: string } | null;
      };
      expect(duplicateSuggestion).toMatchObject({
        status: "duplicate",
        memory_writes: false,
        duplicate: {
          id: remembered.id,
          content: "The protocol test uses local auditable memory.",
        },
      });

      const recalled = parseToolJson(await client.callTool({
        name: "memory.recall",
        arguments: {
          query: "local auditable",
          scope: "project:nuzo",
        },
      })) as { results: Array<{ id: string; content: string }> };
      expect(recalled.results).toEqual([
        expect.objectContaining({
          id: remembered.id,
          content: "The protocol test uses local auditable memory.",
        }),
      ]);

      const hybridFallback = parseToolJson(await client.callTool({
        name: "memory.recall",
        arguments: {
          query: "local auditable",
          scope: "project:nuzo",
          retrieval_mode: "hybrid",
        },
      })) as {
        results: Array<{ id: string }>;
        retrieval: { requested_mode: string; effective_mode: string; semantic_fallback_code: string };
      };
      expect(hybridFallback.results[0]?.id).toBe(remembered.id);
      expect(hybridFallback.retrieval).toEqual({
        requested_mode: "hybrid",
        effective_mode: "fts",
        semantic_fallback_code: "SEMANTIC_INDEX_MISSING",
      });

      const history = parseToolJson(await client.callTool({
        name: "memory.history",
        arguments: {
          id: remembered.id,
        },
      })) as { events: Array<{ event_type: string; memory_id: string }> };
      expect(history.events.map((event) => event.event_type)).toEqual([
        "memory.created",
      ]);
      expect(history.events.every((event) => event.memory_id === remembered.id)).toBe(true);

      await client.callTool({
        name: "memory.export",
        arguments: {
          scope: "project:nuzo",
        },
      });

      const audit = parseToolJson(await client.callTool({
        name: "memory.audit",
        arguments: {
          scope: "project:nuzo",
          event_type: ["memory.exported"],
          limit: 5,
        },
      })) as { events: Array<{ event_type: string; memory_id: string | null; payload: { scope?: string } }> };
      expect(audit.events).toMatchObject([
        {
          event_type: "memory.exported",
          memory_id: null,
          payload: {
            scope: "project:nuzo",
          },
        },
      ]);

      const memoryAudit = parseToolJson(await client.callTool({
        name: "memory.audit",
        arguments: {
          memory_id: remembered.id,
          event_type: ["memory.created"],
          actor: "nuzo:mcp",
          since: "2000-01-01T00:00:00.000Z",
          until: "2999-01-01T00:00:00.000Z",
        },
      })) as { events: Array<{ event_type: string; memory_id: string; actor: string }> };
      expect(memoryAudit.events).toMatchObject([
        {
          event_type: "memory.created",
          memory_id: remembered.id,
          actor: "nuzo:mcp",
        },
      ]);

      const preview = parseToolJson(await client.callTool({
        name: "memory.forget_many",
        arguments: {
          scope: "project:nuzo",
          tags: ["protocol"],
        },
      })) as { affected: number; dry_run: boolean; ids: string[]; matched: number };
      expect(preview).toMatchObject({
        affected: 0,
        dry_run: true,
        ids: [remembered.id],
        matched: 1,
      });

      const doctor = parseToolJson(await client.callTool({
        name: "memory.doctor",
        arguments: {},
      })) as {
        counts: { active_memories: number; total_memories: number };
        integrity: {
          ok: boolean;
          status: string;
          memory_count: number;
          active_memory_count: number;
          fts_row_count: number;
          errors: string[];
        };
        lifecycle: { automatic_host_hooks: string; autoload_tag: string };
        ok: boolean;
        schema: {
          current_version: number;
          status: string;
          supported_version: number;
        };
        store: {
          writable_check: string;
        };
        tools: string[];
      };
      expect(doctor).toMatchObject({
        counts: {
          active_memories: 1,
          total_memories: 1,
        },
        integrity: {
          ok: true,
          status: "ok",
          memory_count: 1,
          active_memory_count: 1,
          fts_row_count: 1,
          errors: [],
        },
        lifecycle: {
          automatic_host_hooks: "verify_in_host",
          autoload_tag: "autoload",
        },
        ok: true,
        schema: {
          current_version: 7,
          status: "current",
          supported_version: 7,
        },
        store: {
          writable_check: "writable",
        },
      });
      expect([...doctor.tools].sort()).toEqual(sortedMemoryToolNames);
    } finally {
      await client.close();
      await runtime.close();
    }
  });

  it("prevents callers from spoofing MCP audit actors", async () => {
    const directory = mkdtempSync(join(tmpdir(), "nuzo-mcp-audit-actor-"));
    tempDirectories.push(directory);
    const runtime = createNuzoMcpServerRuntime({
      storePath: join(directory, "memories.sqlite"),
    });
    const client = new Client({
      name: "nuzo-audit-actor-test",
      version: "0.0.0",
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    try {
      await Promise.all([
        runtime.server.connect(serverTransport),
        client.connect(clientTransport),
      ]);

      const source = await rememberProtocolMemory(client, {
        content: "Audit actor source memory.",
        kind: "note",
        scope: "project:nuzo",
        tags: ["audit-actor"],
      });
      const target = await rememberProtocolMemory(client, {
        content: "Audit actor target memory.",
        kind: "note",
        scope: "project:nuzo",
        tags: ["audit-actor"],
      });

      await client.callTool({
        name: "memory.challenge",
        arguments: {
          id: source.id,
          outcome: "needs_review",
          reason: "Exercise the trusted actor boundary.",
          actor: "spoofed:operator",
        },
      });
      const related = parseToolJson(await client.callTool({
        name: "memory.relate",
        arguments: {
          source_memory_id: source.id,
          target_memory_id: target.id,
          relation: "related_to",
          actor: "spoofed:operator",
        },
      })) as { relation: { id: string } };
      await client.callTool({
        name: "memory.unrelate",
        arguments: {
          id: related.relation.id,
          actor: "spoofed:operator",
        },
      });

      const audit = parseToolJson(await client.callTool({
        name: "memory.audit",
        arguments: {
          memory_id: source.id,
          event_type: [
            "memory.challenged",
            "memory.relation.created",
            "memory.relation.deleted",
          ],
        },
      })) as { events: Array<{ actor: string; event_type: string }> };
      expect(audit.events.map((event) => event.event_type).sort()).toEqual([
        "memory.challenged",
        "memory.relation.created",
        "memory.relation.deleted",
      ]);
      expect(audit.events.every((event) => event.actor === "nuzo:mcp")).toBe(true);

      const spoofedAudit = parseToolJson(await client.callTool({
        name: "memory.audit",
        arguments: {
          memory_id: source.id,
          actor: "spoofed:operator",
        },
      })) as { events: unknown[] };
      expect(spoofedAudit.events).toEqual([]);
    } finally {
      await client.close();
      await runtime.close();
    }
  });

  it("round-trips bounded capture relationships and policy outcomes through the SDK", async () => {
    const directory = mkdtempSync(join(tmpdir(), "nuzo-mcp-capture-contract-"));
    tempDirectories.push(directory);
    const runtime = createNuzoMcpServerRuntime({
      storePath: join(directory, "memories.sqlite"),
    });
    const client = new Client({
      name: "nuzo-capture-contract-test",
      version: "0.0.0",
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    try {
      await Promise.all([
        runtime.server.connect(serverTransport),
        client.connect(clientTransport),
      ]);

      const response = await rememberProtocolMemory(client, {
        content: "The user prefers concise final answers with explicit tradeoffs.",
        kind: "preference",
        scope: "user:default",
        tags: ["communication", "style"],
      });
      await rememberProtocolMemory(client, {
        content: "Run MkDocs strict validation before merging documentation changes.",
        kind: "instruction",
        scope: "project:nuzo",
        tags: ["docs", "mkdocs", "workflow"],
      });
      await rememberProtocolMemory(client, {
        content: "Dependency changes require an audit and signature verification.",
        kind: "instruction",
        scope: "project:nuzo",
        tags: ["dependencies", "security", "workflow"],
      });
      await rememberProtocolMemory(client, {
        content: "Release changes use a focused branch and squash merge.",
        kind: "instruction",
        scope: "project:nuzo",
        tags: ["git", "release", "workflow"],
      });

      const cases = [
        {
          content: "The user prefers concise final answers with explicit tradeoffs.",
          kind: "note",
          scope: "user:default",
          expectedRelationship: "exact_duplicate",
          expectedStatus: "duplicate",
          expectedPrimary: response.id,
          expectedDuplicate: response.id,
        },
        {
          content: "The user prefers detailed final answers with explicit tradeoffs.",
          kind: "preference",
          scope: "user:default",
          expectedRelationship: "update_candidate",
          expectedStatus: "review",
          expectedPrimary: response.id,
          expectedDuplicate: null,
        },
        {
          content: "Use short headings when presenting final answers.",
          kind: "preference",
          scope: "user:default",
          expectedRelationship: "related",
          expectedStatus: "review",
          expectedPrimary: response.id,
          expectedDuplicate: null,
        },
        {
          content: "Rust source files use rustfmt before review.",
          kind: "instruction",
          scope: "project:nuzo",
          expectedRelationship: "independent",
          expectedStatus: "ready",
          expectedPrimary: null,
          expectedDuplicate: null,
        },
        {
          content: "Use the preferred validation process for important changes.",
          kind: "instruction",
          scope: "project:nuzo",
          expectedRelationship: "uncertain",
          expectedStatus: "review",
          expectedPrimary: null,
          expectedDuplicate: null,
        },
      ] as const;

      for (const item of cases) {
        const before = await protocolState(client);
        const suggestion = parseToolJson(await client.callTool({
          name: "memory.suggest_capture",
          arguments: {
            content: item.content,
            kind: item.kind,
            scope: item.scope,
            tags: ["capture-contract"],
            source: "test:capture-suggestion",
            confidence: 0.8,
            reason: "Protocol contract coverage for bounded capture evidence.",
            relationship_mode: "bounded",
          },
        })) as BoundedSuggestionOutput;
        const after = await protocolState(client);

        expect(after).toEqual(before);
        expect(suggestion).toMatchObject({
          status: item.expectedStatus,
          memory_writes: false,
          requires_confirmation: true,
          duplicate: item.expectedDuplicate === null ? null : { id: item.expectedDuplicate },
          relationship_mode: "bounded",
          relationship: item.expectedRelationship,
          relationship_evidence: {
            version: 1,
            primary_memory_id: item.expectedPrimary,
            candidate_limit: 20,
            returned_limit: 3,
          },
        });
        expect(suggestion.relationship_evidence.evaluated_count).toBeGreaterThanOrEqual(0);
        expect(suggestion.relationship_evidence.evaluated_count).toBeLessThanOrEqual(20);
        expect(suggestion.relationship_evidence.reason.length).toBeGreaterThan(0);
        expect(suggestion.relationship_evidence.reason.length).toBeLessThanOrEqual(1_000);
        expect(suggestion.relationship_evidence.candidates.length).toBeLessThanOrEqual(3);
        for (const candidate of suggestion.relationship_evidence.candidates) {
          expect(candidate.memory.scope).toBe(item.scope);
          expect(candidate.memory.revision).toBeGreaterThanOrEqual(1);
          expect(candidate.matched_terms.length).toBeLessThanOrEqual(8);
          expect(candidate.matched_tags.length).toBeLessThanOrEqual(8);
          expect(candidate.reason.length).toBeGreaterThan(0);
          expect(candidate.reason.length).toBeLessThanOrEqual(1_000);
        }
        if (item.expectedPrimary === null) {
          expect(suggestion.relationship_evidence.primary_memory_id).toBeNull();
        } else {
          expect(suggestion.relationship_evidence.candidates[0]?.memory.id).toBe(item.expectedPrimary);
        }
      }

      const secretBefore = await protocolState(client);
      const secret = await client.callTool({
        name: "memory.suggest_capture",
        arguments: {
          content: "github token is ghp_123456789012345678901234567890123456",
          kind: "note",
          scope: "project:nuzo",
          reason: "Protocol contract coverage for blocked capture evidence.",
          relationship_mode: "bounded",
        },
      });
      expect(secret.isError).toBe(true);
      const secretText = toolText(secret);
      expect(secretText).toContain("Memory content looks sensitive.");
      expect(secretText).not.toContain("relationship_mode");
      await expect(protocolState(client)).resolves.toEqual(secretBefore);
    } finally {
      await client.close();
      await runtime.close();
    }
  });

  it("applies confirmed capture decisions through the SDK without hidden writes", async () => {
    const directory = mkdtempSync(join(tmpdir(), "nuzo-mcp-confirm-capture-"));
    tempDirectories.push(directory);
    const runtime = createNuzoMcpServerRuntime({
      storePath: join(directory, "memories.sqlite"),
    });
    const client = new Client({
      name: "nuzo-confirm-capture-test",
      version: "0.0.0",
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    try {
      await Promise.all([
        runtime.server.connect(serverTransport),
        client.connect(clientTransport),
      ]);

      const created = parseToolJson(await client.callTool({
        name: "memory.confirm_capture",
        arguments: {
          decision: "create",
          content: "The user prefers concise final answers.",
          kind: "preference",
          scope: "user:default",
          tags: ["communication"],
          source: "test:capture-confirmed",
          reason: "The user confirmed a durable preference.",
          confirm: true,
          actor: "nuzo:cli",
        },
      })) as ConfirmCaptureOutput;
      expect(created).toMatchObject({
        decision: "create",
        status: "created",
        memory_writes: true,
        requires_confirmation: false,
        memory: {
          revision: 1,
          content: "The user prefers concise final answers.",
          source: "test:capture-confirmed",
        },
      });
      const createdId = created.memory?.id ?? "";
      const createdHistory = parseToolJson(await client.callTool({
        name: "memory.history",
        arguments: { id: createdId },
      })) as { events: Array<{ actor: string; event_type: string }> };
      expect(createdHistory.events[0]).toMatchObject({
        actor: "nuzo:mcp",
        event_type: "memory.created",
      });

      const duplicate = parseToolJson(await client.callTool({
        name: "memory.confirm_capture",
        arguments: {
          decision: "create",
          content: " the USER prefers concise final answers. ",
          kind: "note",
          scope: "user:default",
          tags: ["style"],
          source: "test:capture-confirmed",
          reason: "The user confirmed an equivalent draft.",
          confirm: true,
        },
      })) as ConfirmCaptureOutput;
      expect(duplicate).toMatchObject({
        decision: "create",
        status: "skipped",
        memory_writes: false,
        memory: {
          id: createdId,
          revision: 1,
        },
      });

      const updated = parseToolJson(await client.callTool({
        name: "memory.confirm_capture",
        arguments: {
          decision: "update",
          content: "The user prefers detailed final answers.",
          kind: "preference",
          scope: "user:default",
          tags: ["communication"],
          source: "test:capture-confirmed",
          reason: "The user confirmed a replacement preference.",
          confirm: true,
          target_memory_id: createdId,
          expected_revision: 1,
        },
      })) as ConfirmCaptureOutput;
      expect(updated).toMatchObject({
        decision: "update",
        status: "updated",
        memory_writes: true,
        memory: {
          id: createdId,
          revision: 2,
          content: "The user prefers detailed final answers.",
        },
      });

      const conflict = await client.callTool({
        name: "memory.confirm_capture",
        arguments: {
          decision: "update",
          content: "This stale confirmed update must not commit.",
          kind: "preference",
          scope: "user:default",
          source: "test:capture-confirmed",
          reason: "The user confirmed using a stale displayed revision.",
          confirm: true,
          target_memory_id: createdId,
          expected_revision: 1,
        },
      });
      expect(conflict.isError).toBe(true);
      expect(parseToolJson(conflict)).toMatchObject({
        code: "MEMORY_REVISION_CONFLICT",
        details: {
          id: createdId,
          expectedRevision: 1,
          currentRevision: 2,
        },
      });

      const beforeReadOnly = await protocolState(client);
      for (const decision of ["reject", "clarify"] as const) {
        const result = parseToolJson(await client.callTool({
          name: "memory.confirm_capture",
          arguments: {
            decision,
            content: "This draft should not write.",
            kind: "note",
            scope: "user:default",
            source: "test:capture-confirmed",
            reason: `The user chose ${decision}.`,
          },
        })) as ConfirmCaptureOutput;
        expect(result.memory_writes).toBe(false);
        expect(result.memory).toBeNull();
      }
      await expect(protocolState(client)).resolves.toEqual(beforeReadOnly);

      const blocked = await client.callTool({
        name: "memory.confirm_capture",
        arguments: {
          decision: "create",
          content: "github token is ghp_123456789012345678901234567890123456",
          kind: "note",
          scope: "user:default",
          source: "test:capture-confirmed",
          reason: "The user attempted to confirm an unsafe draft.",
          confirm: true,
        },
      });
      expect(blocked.isError).toBe(true);
      expect(toolText(blocked)).toContain("Memory content looks sensitive.");
      await expect(protocolState(client)).resolves.toEqual(beforeReadOnly);
    } finally {
      await client.close();
      await runtime.close();
    }
  });

  it("enforces authorized scopes through the MCP runtime", async () => {
    const directory = mkdtempSync(join(tmpdir(), "nuzo-mcp-protocol-"));
    tempDirectories.push(directory);
    const storePath = join(directory, "memories.sqlite");
    const seedDatabase = new SQLiteMemoryDatabase({ path: storePath });
    const seedService = createMemoryService({
      store: seedDatabase,
      searchIndex: seedDatabase,
      auditLog: seedDatabase,
      transactions: seedDatabase,
      clock: new SystemClock(),
      ids: new RandomIdGenerator(),
      policy: new DefaultPolicyEngine(new RegexSecretScanner()),
    });
    const forbidden = await seedService.remember({
      content: "Restricted protocol history must not reveal this synthetic global memory.",
      kind: "note",
      scope: "user:default",
      source: "test:forbidden-history",
    });
    seedDatabase.close();
    const runtime = createNuzoMcpServerRuntime({
      storePath,
      authorizedScopes: ["project:nuzo"],
    });
    const client = new Client({
      name: "nuzo-contract-test",
      version: "0.0.0",
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    try {
      await Promise.all([
        runtime.server.connect(serverTransport),
        client.connect(clientTransport),
      ]);

      const remembered = parseToolJson(await client.callTool({
        name: "memory.remember",
        arguments: {
          content: "Restricted MCP runtime can write its authorized project scope.",
          kind: "instruction",
          scope: "project:nuzo",
          source: "test:mcp-client",
        },
      })) as { created: boolean; id: string };
      expect(remembered.created).toBe(true);

      const allowedHistory = parseToolJson(await client.callTool({
        name: "memory.history",
        arguments: {
          id: remembered.id,
        },
      })) as { events: Array<{ memory_id: string }> };
      expect(allowedHistory.events).toMatchObject([
        {
          memory_id: remembered.id,
        },
      ]);

      const forbiddenHistory = await client.callTool({
        name: "memory.history",
        arguments: {
          id: forbidden.id,
        },
      });
      expect(forbiddenHistory.isError).toBe(true);
      expect(toolText(forbiddenHistory)).not.toContain("test:forbidden-history");
      expect(toolText(forbiddenHistory)).not.toContain("user:default");

      await client.callTool({
        name: "memory.export",
        arguments: {
          scope: "project:nuzo",
        },
      });

      await expectToolError(client.callTool({
        name: "memory.remember",
        arguments: {
          content: "Restricted MCP runtime cannot write global memory.",
          kind: "note",
          scope: "user:default",
          source: "test:mcp-client",
        },
      }));
      await expectToolError(client.callTool({
        name: "memory.list",
        arguments: {},
      }));
      await expectToolError(client.callTool({
        name: "memory.recall",
        arguments: {
          query: "authorized project scope",
          scope: "project:nuzo",
          include_global: true,
        },
      }));
      await expectToolError(client.callTool({
        name: "memory.suggest_capture",
        arguments: {
          content: "Restricted MCP runtime cannot suggest capture for global memory.",
          kind: "note",
          scope: "user:default",
          reason: "The inferred draft targets a forbidden scope.",
          relationship_mode: "bounded",
        },
      }));
      await expectToolError(client.callTool({
        name: "memory.audit",
        arguments: {},
      }));
      const scopedAudit = parseToolJson(await client.callTool({
        name: "memory.audit",
        arguments: {
          scope: "project:nuzo",
          event_type: ["memory.exported"],
        },
      })) as { events: Array<{ event_type: string; memory_id: string | null; payload: { scope?: string } }> };
      expect(scopedAudit.events).toMatchObject([
        {
          event_type: "memory.exported",
          memory_id: null,
          payload: {
            scope: "project:nuzo",
          },
        },
      ]);
    } finally {
      await client.close();
      await runtime.close();
    }
  });

  it("resolves published MCP runtime scope and restrictions from environment", async () => {
    const directory = mkdtempSync(join(tmpdir(), "nuzo-mcp-env-runtime-"));
    tempDirectories.push(directory);
    const storePath = join(directory, "memories.sqlite");
    const runtime = createNuzoMcpServerRuntime({
      projectPath: directory,
      environment: {
        NUZO_MEMORY_STORE: storePath,
        NUZO_MEMORY_SCOPE: "project:auto",
        NUZO_AUTHORIZED_SCOPES: "project:auto",
      },
    });
    const client = new Client({
      name: "nuzo-env-contract-test",
      version: "0.0.0",
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    try {
      await Promise.all([
        runtime.server.connect(serverTransport),
        client.connect(clientTransport),
      ]);

      const projectScope = projectScopeFromPath(directory);
      const tools = await client.listTools();
      expect(tools.tools.find((tool) => tool.name === "memory.remember")?.inputSchema)
        .toMatchObject({
          type: "object",
          properties: {
            scope: {
              default: projectScope,
              type: "string",
            },
          },
        });

      const remembered = parseToolJson(await client.callTool({
        name: "memory.remember",
        arguments: {
          content: "Published MCP env config writes to the resolved project scope by default.",
          kind: "instruction",
          source: "test:mcp-env",
        },
      })) as { created: boolean; id: string };
      expect(remembered.created).toBe(true);

      const listed = parseToolJson(await client.callTool({
        name: "memory.list",
        arguments: {
          scope: projectScope,
        },
      })) as { memories: Array<{ id: string; scope: string }> };
      expect(listed.memories).toEqual([
        expect.objectContaining({
          id: remembered.id,
          scope: projectScope,
        }),
      ]);

      await expectToolError(client.callTool({
        name: "memory.remember",
        arguments: {
          content: "Published MCP env config rejects forbidden global writes.",
          kind: "note",
          scope: "user:default",
        },
      }));
    } finally {
      await client.close();
      await runtime.close();
    }
  });

  it("defaults published host paths to project and user restricted scopes", async () => {
    const directory = mkdtempSync(join(tmpdir(), "nuzo-mcp-default-restricted-"));
    tempDirectories.push(directory);
    const storePath = join(directory, "memories.sqlite");
    const runtime = createNuzoMcpServerRuntime({
      storePath,
      projectPath: directory,
      defaultAuthorizationMode: "restricted",
    });
    const client = new Client({ name: "nuzo-restricted-default-test", version: "0.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    try {
      await Promise.all([
        runtime.server.connect(serverTransport),
        client.connect(clientTransport),
      ]);
      const projectScope = projectScopeFromPath(directory);
      const doctor = parseToolJson(await client.callTool({
        name: "memory.doctor",
        arguments: {},
      })) as {
        config: { project_scope: string; project_root_source: string };
        authorization: { mode: string; source: string; allowed_scopes: string[] };
      };
      expect(doctor).toMatchObject({
        config: {
          project_scope: projectScope,
          project_root_source: "option",
        },
        authorization: {
          mode: "restricted",
          source: "default",
          allowed_scopes: [projectScope, "user:default"],
        },
      });

      await expectToolError(client.callTool({
        name: "memory.remember",
        arguments: {
          content: "A restricted host must reject unrelated project scopes.",
          kind: "note",
          scope: "project:unrelated",
          source: "test:restricted-default",
        },
      }));
    } finally {
      await client.close();
      await runtime.close();
    }
  });

  it("paginates list, history, and export MCP responses with deterministic cursors", async () => {
    const directory = mkdtempSync(join(tmpdir(), "nuzo-mcp-pagination-"));
    tempDirectories.push(directory);
    const runtime = createNuzoMcpServerRuntime({
      storePath: join(directory, "memories.sqlite"),
    });
    const client = new Client({
      name: "nuzo-contract-test",
      version: "0.0.0",
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    try {
      await Promise.all([
        runtime.server.connect(serverTransport),
        client.connect(clientTransport),
      ]);

      const first = await rememberProtocolMemory(client, {
        content: "Pagination memory alpha.",
        kind: "note",
        scope: "project:nuzo",
        tags: ["paging"],
      });
      await rememberProtocolMemory(client, {
        content: "Pagination memory beta.",
        kind: "note",
        scope: "project:nuzo",
        tags: ["paging"],
      });
      await rememberProtocolMemory(client, {
        content: "Pagination memory gamma.",
        kind: "note",
        scope: "project:nuzo",
        tags: ["paging"],
      });

      const firstListPage = parseToolJson(await client.callTool({
        name: "memory.list",
        arguments: {
          scope: "project:nuzo",
          tags: ["paging"],
          limit: 2,
        },
      })) as { memories: Array<{ id: string }>; next_cursor: string | null; truncated: boolean; limit: number };
      expect(firstListPage.memories).toHaveLength(2);
      expect(firstListPage.next_cursor).toEqual(expect.any(String));
      expect(firstListPage.truncated).toBe(true);
      expect(firstListPage.limit).toBe(2);

      const secondListPage = parseToolJson(await client.callTool({
        name: "memory.list",
        arguments: {
          scope: "project:nuzo",
          tags: ["paging"],
          limit: 2,
          cursor: firstListPage.next_cursor,
        },
      })) as { memories: Array<{ id: string }>; next_cursor: string | null; truncated: boolean };
      expect(secondListPage.memories).toHaveLength(1);
      expect(secondListPage.next_cursor).toBeNull();
      expect(secondListPage.truncated).toBe(false);
      expect(new Set([
        ...firstListPage.memories.map((memory) => memory.id),
        ...secondListPage.memories.map((memory) => memory.id),
      ]).size).toBe(3);

      await client.callTool({
        name: "memory.update",
        arguments: {
          id: first.id,
          content: "Pagination memory alpha updated.",
        },
      });
      const firstHistoryPage = parseToolJson(await client.callTool({
        name: "memory.history",
        arguments: {
          id: first.id,
          limit: 1,
        },
      })) as { events: Array<{ id: string; event_type: string }>; next_cursor: string | null; truncated: boolean };
      expect(firstHistoryPage.events).toHaveLength(1);
      expect(firstHistoryPage.next_cursor).toEqual(expect.any(String));
      expect(firstHistoryPage.truncated).toBe(true);

      const secondHistoryPage = parseToolJson(await client.callTool({
        name: "memory.history",
        arguments: {
          id: first.id,
          limit: 1,
          cursor: firstHistoryPage.next_cursor,
        },
      })) as { events: Array<{ id: string; event_type: string }>; next_cursor: string | null; truncated: boolean };
      expect(secondHistoryPage.events).toHaveLength(1);
      expect(secondHistoryPage.next_cursor).toBeNull();
      expect(secondHistoryPage.truncated).toBe(false);
      expect([
        firstHistoryPage.events[0]?.event_type,
        secondHistoryPage.events[0]?.event_type,
      ]).toEqual(["memory.created", "memory.updated"]);

      const firstExportPage = parseToolJson(await client.callTool({
        name: "memory.export",
        arguments: {
          scope: "project:nuzo",
          tags: ["paging"],
          limit: 2,
        },
      })) as { document: { memories: unknown[] }; next_cursor: string | null; truncated: boolean };
      expect(firstExportPage.document.memories).toHaveLength(2);
      expect(firstExportPage.next_cursor).toEqual(expect.any(String));
      expect(firstExportPage.truncated).toBe(true);

      const secondExportPage = parseToolJson(await client.callTool({
        name: "memory.export",
        arguments: {
          scope: "project:nuzo",
          tags: ["paging"],
          limit: 2,
          cursor: firstExportPage.next_cursor,
        },
      })) as { document: { memories: unknown[] }; next_cursor: string | null; truncated: boolean };
      expect(secondExportPage.document.memories).toHaveLength(1);
      expect(secondExportPage.next_cursor).toBeNull();
      expect(secondExportPage.truncated).toBe(false);
    } finally {
      await client.close();
      await runtime.close();
    }
  });

});
