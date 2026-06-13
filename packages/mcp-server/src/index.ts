#!/usr/bin/env node
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  createMemoryService,
  DefaultPolicyEngine,
  RandomIdGenerator,
  RegexSecretScanner,
  SQLiteMemoryDatabase,
  SystemClock,
  type MemoryService,
} from "@nuzo/memory-core";
import { createMemoryToolHandlers } from "./handlers.js";
import type { RememberToolInput } from "./handlers.js";

const defaultStorePath = resolve(homedir(), ".nuzo", "memory", "memories.sqlite");

export interface NuzoMcpServerOptions {
  storePath?: string;
}

export function createNuzoMcpServer(options: NuzoMcpServerOptions = {}): McpServer {
  const database = openDatabase(options.storePath ?? defaultStorePath);
  const service = createService(database);
  const server = new McpServer({
    name: "nuzo",
    version: "0.0.0",
  });

  registerMemoryTools(server, service);
  return server;
}

export function registerMemoryTools(server: McpServer, service: MemoryService): void {
  const handlers = createMemoryToolHandlers(service);

  server.registerTool(
    "memory.remember",
    {
      description: "Store a local Nuzo memory.",
      inputSchema: {
        content: z.string().min(1),
        kind: z.enum(["preference", "project_decision", "fact", "instruction", "note"]),
        scope: z.string().default("user:default"),
        tags: z.array(z.string()).default([]),
        source: z.string().default("nuzo:mcp"),
        confidence: z.number().min(0).max(1).optional(),
      },
    },
    async (input) => {
      const rememberInput: RememberToolInput = {
        content: input.content,
        kind: input.kind,
        scope: input.scope,
        tags: input.tags,
        source: input.source,
      };
      if (input.confidence !== undefined) {
        rememberInput.confidence = input.confidence;
      }

      return jsonToolResult(await handlers.remember(rememberInput));
    },
  );

  server.registerTool(
    "memory.recall",
    {
      description: "Recall relevant local Nuzo memories.",
      inputSchema: {
        query: z.string().min(1),
        scope: z.string().default("user:default"),
        limit: z.number().int().min(1).max(50).default(8),
        include_global: z.boolean().default(false),
      },
    },
    async (input) => {
      return jsonToolResult(await handlers.recall(input));
    },
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const options: NuzoMcpServerOptions = {};
  if (process.env.NUZO_MEMORY_STORE !== undefined) {
    options.storePath = process.env.NUZO_MEMORY_STORE;
  }
  const server = createNuzoMcpServer(options);
  await server.connect(new StdioServerTransport());
}

function openDatabase(storePath: string): SQLiteMemoryDatabase {
  mkdirSync(dirname(storePath), { recursive: true });
  return new SQLiteMemoryDatabase({ path: storePath });
}

function createService(database: SQLiteMemoryDatabase): MemoryService {
  return createMemoryService({
    store: database,
    searchIndex: database,
    auditLog: database,
    clock: new SystemClock(),
    ids: new RandomIdGenerator(),
    policy: new DefaultPolicyEngine(new RegexSecretScanner()),
  });
}

function jsonToolResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}
