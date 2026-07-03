import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";
import { createNuzoMcpServerRuntime } from "../index.js";
import {
  expectToolError,
  parseToolJson,
} from "./protocol-test-utils.js";

let tempDirectories: string[] = [];

afterEach(() => {
  for (const directory of tempDirectories) {
    rmSync(directory, { recursive: true, force: true });
  }
  tempDirectories = [];
});

describe("MCP protocol error contracts", () => {
  it("returns structured update revision conflicts through the SDK", async () => {
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

      const remembered = parseToolJson(await client.callTool({
        name: "memory.remember",
        arguments: {
          content: "MCP update conflicts should stay structured.",
          kind: "instruction",
          scope: "project:nuzo",
          source: "test:mcp-client",
        },
      })) as { id: string };

      await client.callTool({
        name: "memory.update",
        arguments: {
          id: remembered.id,
          expected_revision: 1,
          content: "The first MCP update wins.",
        },
      });

      const conflict = await client.callTool({
        name: "memory.update",
        arguments: {
          id: remembered.id,
          expected_revision: 1,
          content: "This stale MCP update must not commit.",
        },
      });
      expect(conflict.isError).toBe(true);
      expect(parseToolJson(conflict)).toMatchObject({
        code: "MEMORY_REVISION_CONFLICT",
        message: "Memory changed before this operation could commit.",
        details: {
          id: remembered.id,
          expectedRevision: 1,
          currentRevision: 2,
        },
      });
    } finally {
      await client.close();
      await runtime.close();
    }
  });

  it("returns one structured Nuzo domain-error envelope across MCP tools", async () => {
    const directory = mkdtempSync(join(tmpdir(), "nuzo-mcp-error-envelope-"));
    tempDirectories.push(directory);
    const runtime = createNuzoMcpServerRuntime({
      storePath: join(directory, "memories.sqlite"),
      authorizedScopes: ["project:nuzo"],
    });
    const client = new Client({
      name: "nuzo-error-contract-test",
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
          content: "Structured error tests use an authorized project memory.",
          kind: "instruction",
          scope: "project:nuzo",
          source: "test:mcp-client",
        },
      })) as { id: string };

      const cases = [
        {
          label: "policy validation from remember",
          call: () => client.callTool({
            name: "memory.remember",
            arguments: {
              content: "github token is ghp_123456789012345678901234567890123456",
              kind: "note",
              scope: "project:nuzo",
            },
          }),
          code: "MEMORY_SECRET_DETECTED",
          details: {
            findings: expect.any(Array),
          },
        },
        {
          label: "authorization from list",
          call: () => client.callTool({
            name: "memory.list",
            arguments: {},
          }),
          code: "MEMORY_SCOPE_REQUIRED",
        },
        {
          label: "authorization from recall include_global",
          call: () => client.callTool({
            name: "memory.recall",
            arguments: {
              query: "authorized project memory",
              scope: "project:nuzo",
              include_global: true,
            },
          }),
          code: "MEMORY_SCOPE_FORBIDDEN",
          details: {
            scope: "user:default",
          },
        },
        {
          label: "destructive confirmation from forget",
          call: () => client.callTool({
            name: "memory.forget",
            arguments: {
              id: remembered.id,
              mode: "delete",
            },
          }),
          code: "MEMORY_DELETE_CONFIRMATION_REQUIRED",
          details: {
            id: remembered.id,
          },
        },
        {
          label: "semantic state from recall",
          call: () => client.callTool({
            name: "memory.recall",
            arguments: {
              query: "authorized project memory",
              scope: "project:nuzo",
              retrieval_mode: "semantic",
            },
          }),
          code: "SEMANTIC_INDEX_MISSING",
        },
      ];

      for (const item of cases) {
        const result = await item.call();
        expect(result.isError, item.label).toBe(true);
        const error = parseToolJson(result) as {
          code: string;
          message: string;
          details?: Record<string, unknown>;
        };
        expect(error, item.label).toMatchObject({
          code: item.code,
          message: expect.any(String),
        });
        expect(error.message.length, item.label).toBeGreaterThan(0);
        if (item.details !== undefined) {
          expect(error.details, item.label).toMatchObject(item.details);
        }
      }
    } finally {
      await client.close();
      await runtime.close();
    }
  });

  it("rejects invalid arguments through the registered MCP schema", async () => {
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

      const result = await client.callTool({
        name: "memory.remember",
        arguments: {
          content: "",
          kind: "unsupported",
        },
      });

      expect(result.isError).toBe(true);
      expect(result.content).toEqual([
        expect.objectContaining({
          type: "text",
        }),
      ]);
    } finally {
      await client.close();
      await runtime.close();
    }
  });

  it("rejects invalid scope and tag shapes through the registered MCP schema", async () => {
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

      await expectToolError(client.callTool({
        name: "memory.list",
        arguments: {
          scope: "invalid",
        },
      }));
      await expectToolError(client.callTool({
        name: "memory.remember",
        arguments: {
          content: "Invalid tag should be rejected by the MCP schema.",
          kind: "note",
          tags: ["Invalid Tag"],
        },
      }));
      await expectToolError(client.callTool({
        name: "memory.suggest_capture",
        arguments: {
          content: "Invalid relationship mode should be rejected by the MCP schema.",
          kind: "note",
          reason: "The mode is outside the public contract.",
          relationship_mode: "fuzzy",
        },
      }));
      await expectToolError(client.callTool({
        name: "memory.import",
        arguments: {
          document: {
            format: "nuzo-memory-export",
            version: 1,
            exported_at: "2026-06-19T00:00:00.000Z",
            memories: [
              {
                scope: "project:nuzo",
                kind: "note",
                content: "Invalid imported tag should be rejected before handlers run.",
                tags: ["invalid/tag"],
                source: "test:mcp-client",
                confidence: 1,
                created_at: "2026-06-19T00:00:00.000Z",
                updated_at: "2026-06-19T00:00:00.000Z",
                last_used_at: null,
                archived_at: null,
              },
            ],
          },
        },
      }));
    } finally {
      await client.close();
      await runtime.close();
    }
  });
});
