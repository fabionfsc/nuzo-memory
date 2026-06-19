import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";
import { createNuzoMcpServerRuntime } from "../index.js";

const expectedTools = [
  "memory.doctor",
  "memory.export",
  "memory.forget",
  "memory.forget_many",
  "memory.history",
  "memory.import",
  "memory.list",
  "memory.recall",
  "memory.recall_hook",
  "memory.remember",
  "memory.update",
];

let tempDirectories: string[] = [];

afterEach(() => {
  for (const directory of tempDirectories) {
    rmSync(directory, { recursive: true, force: true });
  }
  tempDirectories = [];
});

describe("MCP protocol contract", () => {
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
      expect(tools.tools.map((tool) => tool.name).sort()).toEqual(expectedTools);
      expect(tools.tools.find((tool) => tool.name === "memory.remember")?.inputSchema)
        .toMatchObject({
          type: "object",
          required: ["content", "kind"],
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

      const history = parseToolJson(await client.callTool({
        name: "memory.history",
        arguments: {
          id: remembered.id,
        },
      })) as { events: Array<{ event_type: string; memory_id: string }> };
      expect(history.events.map((event) => event.event_type)).toEqual([
        "memory.created",
        "memory.recalled",
      ]);
      expect(history.events.every((event) => event.memory_id === remembered.id)).toBe(true);

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
        ok: true,
        schema: {
          current_version: 1,
          status: "current",
          supported_version: 1,
        },
        store: {
          writable_check: "writable",
        },
      });
      expect([...doctor.tools].sort()).toEqual(expectedTools);
    } finally {
      await client.close();
      runtime.close();
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
      runtime.close();
    }
  });
});

function parseToolJson(result: Awaited<ReturnType<Client["callTool"]>>): unknown {
  const text = result.content.find(
    (item): item is Extract<typeof item, { type: "text" }> => item.type === "text",
  );
  if (!text) {
    throw new Error("Expected MCP tool result to contain text JSON.");
  }
  return JSON.parse(text.text);
}
