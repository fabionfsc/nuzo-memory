#!/usr/bin/env node
import { accessSync, constants, mkdirSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
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
  memoryScopePattern,
  memoryTagPattern,
  schemaVersion,
  type MemoryService,
  type MemoryExportDocument,
} from "@nuzo/memory-core";
import { createMemoryToolHandlers } from "./handlers.js";
import type {
  ExportToolInput,
  ForgetToolInput,
  ForgetManyToolInput,
  HistoryToolInput,
  ImportToolInput,
  ListToolInput,
  RecallHookToolInput,
  RememberToolInput,
  UpdateToolInput,
  MemoryDoctorDiagnostics,
} from "./handlers.js";

const defaultStorePath = resolve(homedir(), ".nuzo", "memory", "memories.sqlite");
const scopeSchema = z.string().regex(memoryScopePattern);
const tagSchema = z.string().regex(memoryTagPattern);

export interface NuzoMcpServerOptions {
  storePath?: string;
  doctorDiagnostics?: MemoryDoctorDiagnostics;
}

export interface NuzoMcpServerRuntime {
  server: McpServer;
  close(): void;
}

export function createNuzoMcpServer(options: NuzoMcpServerOptions = {}): McpServer {
  return createNuzoMcpServerRuntime(options).server;
}

export function createNuzoMcpServerRuntime(options: NuzoMcpServerOptions = {}): NuzoMcpServerRuntime {
  const storePath = options.storePath ?? defaultStorePath;
  const database = openDatabase(storePath);
  const service = createService(database);
  let closed = false;
  const server = new McpServer({
    name: "nuzo",
    version: "0.0.0",
  });

  registerMemoryTools(server, service, {
    storePath,
    doctorDiagnostics: options.doctorDiagnostics ?? {
      schema: {
        currentVersion: database.getSchemaVersion(),
        supportedVersion: schemaVersion,
      },
      writable: isStoreWritable(storePath),
    },
  });
  return {
    server,
    close: () => {
      if (!closed) {
        database.close();
        closed = true;
      }
    },
  };
}

export function registerMemoryTools(
  server: McpServer,
  service: MemoryService,
  options: NuzoMcpServerOptions = {},
): void {
  const handlerOptions = {
    ...(options.storePath === undefined ? {} : { storePath: options.storePath }),
    ...(options.doctorDiagnostics === undefined
      ? {}
      : { doctorDiagnostics: options.doctorDiagnostics }),
  };
  const handlers = createMemoryToolHandlers(service, handlerOptions);

  server.registerTool(
    "memory.remember",
    {
      description: "Store a local Nuzo memory.",
      inputSchema: {
        content: z.string().min(1),
        kind: z.enum(["preference", "project_decision", "fact", "instruction", "note"]),
        scope: scopeSchema.default("user:default"),
        tags: z.array(tagSchema).default([]),
        source: z.string().min(1).default("nuzo:mcp"),
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
        scope: scopeSchema.default("user:default"),
        limit: z.number().int().min(1).max(50).default(8),
        include_global: z.boolean().default(false),
      },
    },
    async (input) => {
      return jsonToolResult(await handlers.recall(input));
    },
  );

  server.registerTool(
    "memory.recall_hook",
    {
      description: "Prototype read-only recall entrypoint for host lifecycle hooks. It never captures or creates memories.",
      inputSchema: {
        task_context: z.string().min(1),
        project_scope: scopeSchema.optional(),
        limit: z.number().int().min(1).max(8).default(5),
      },
    },
    async (input) => {
      const recallHookInput: RecallHookToolInput = {
        task_context: input.task_context,
        limit: input.limit,
      };
      if (input.project_scope !== undefined) {
        recallHookInput.project_scope = input.project_scope;
      }

      return jsonToolResult(await handlers.recallHook(recallHookInput));
    },
  );

  server.registerTool(
    "memory.list",
    {
      description: "List local Nuzo memories.",
      inputSchema: {
        scope: scopeSchema.optional(),
        tags: z.array(tagSchema).default([]),
        include_archived: z.boolean().default(false),
      },
    },
    async (input) => {
      const listInput: ListToolInput = {
        tags: input.tags,
        include_archived: input.include_archived,
      };
      if (input.scope !== undefined) {
        listInput.scope = input.scope;
      }

      return jsonToolResult(await handlers.list(listInput));
    },
  );

  server.registerTool(
    "memory.update",
    {
      description: "Update a local Nuzo memory.",
      inputSchema: {
        id: z.string().min(1),
        content: z.string().optional(),
        kind: z.enum(["preference", "project_decision", "fact", "instruction", "note"]).optional(),
        scope: scopeSchema.optional(),
        tags: z.array(tagSchema).optional(),
        confidence: z.number().min(0).max(1).optional(),
      },
    },
    async (input) => {
      const updateInput: UpdateToolInput = {
        id: input.id,
      };
      if (input.content !== undefined) {
        updateInput.content = input.content;
      }
      if (input.kind !== undefined) {
        updateInput.kind = input.kind;
      }
      if (input.scope !== undefined) {
        updateInput.scope = input.scope;
      }
      if (input.tags !== undefined) {
        updateInput.tags = input.tags;
      }
      if (input.confidence !== undefined) {
        updateInput.confidence = input.confidence;
      }

      return jsonToolResult(await handlers.update(updateInput));
    },
  );

  server.registerTool(
    "memory.history",
    {
      description: "List audit events for one Nuzo memory ID.",
      inputSchema: {
        id: z.string().min(1),
      },
    },
    async (input) => {
      const historyInput: HistoryToolInput = {
        id: input.id,
      };
      return jsonToolResult(await handlers.history(historyInput));
    },
  );

  server.registerTool(
    "memory.forget",
    {
      description: "Archive or delete a local Nuzo memory.",
      inputSchema: {
        id: z.string().min(1),
        mode: z.enum(["archive", "delete"]).default("archive"),
        confirm: z.boolean().default(false),
        reason: z.string().optional(),
      },
    },
    async (input) => {
      const forgetInput: ForgetToolInput = {
        id: input.id,
        mode: input.mode,
        confirm: input.confirm,
      };
      if (input.reason !== undefined) {
        forgetInput.reason = input.reason;
      }

      return jsonToolResult(await handlers.forget(forgetInput));
    },
  );

  server.registerTool(
    "memory.forget_many",
    {
      description: "Preview or apply a filtered bulk archive/delete operation.",
      inputSchema: {
        scope: scopeSchema.optional(),
        tags: z.array(tagSchema).default([]),
        all: z.boolean().default(false),
        mode: z.enum(["archive", "delete"]).default("archive"),
        confirm: z.boolean().default(false),
        dry_run: z.boolean().default(true),
        reason: z.string().optional(),
      },
    },
    async (input) => {
      const forgetInput: ForgetManyToolInput = {
        tags: input.tags,
        all: input.all,
        mode: input.mode,
        confirm: input.confirm,
        dry_run: input.dry_run,
      };
      if (input.scope !== undefined) {
        forgetInput.scope = input.scope;
      }
      if (input.reason !== undefined) {
        forgetInput.reason = input.reason;
      }

      return jsonToolResult(await handlers.forgetMany(forgetInput));
    },
  );

  server.registerTool(
    "memory.export",
    {
      description: "Export local Nuzo memories as a versioned JSON document.",
      inputSchema: {
        scope: scopeSchema.optional(),
        tags: z.array(tagSchema).default([]),
        include_archived: z.boolean().default(false),
      },
    },
    async (input) => {
      const exportInput: ExportToolInput = {
        tags: input.tags,
        include_archived: input.include_archived,
      };
      if (input.scope !== undefined) {
        exportInput.scope = input.scope;
      }

      return jsonToolResult(await handlers.exportMemories(exportInput));
    },
  );

  server.registerTool(
    "memory.import",
    {
      description: "Import local Nuzo memories from a versioned JSON document.",
      inputSchema: {
        document: z.object({
          format: z.literal("nuzo-memory-export"),
          version: z.literal(1),
          exported_at: z.string(),
          memories: z.array(
            z.object({
              scope: scopeSchema,
              kind: z.enum(["preference", "project_decision", "fact", "instruction", "note"]),
              content: z.string(),
              tags: z.array(tagSchema),
              source: z.string().min(1),
              confidence: z.number().min(0).max(1),
              created_at: z.string(),
              updated_at: z.string(),
              last_used_at: z.string().nullable(),
              archived_at: z.string().nullable(),
            }),
          ),
        }),
        scope: scopeSchema.optional(),
        dry_run: z.boolean().default(false),
      },
    },
    async (input) => {
      const importInput: ImportToolInput = {
        document: input.document as MemoryExportDocument,
        dry_run: input.dry_run,
      };
      if (input.scope !== undefined) {
        importInput.scope = input.scope;
      }

      return jsonToolResult(await handlers.importMemories(importInput));
    },
  );

  server.registerTool(
    "memory.doctor",
    {
      description: "Report the local Nuzo MCP memory environment.",
      inputSchema: {},
    },
    async () => {
      return jsonToolResult(await handlers.doctor());
    },
  );
}

if (isMainModule()) {
  const options: NuzoMcpServerOptions = {};
  if (process.env.NUZO_MEMORY_STORE !== undefined) {
    options.storePath = process.env.NUZO_MEMORY_STORE;
  }
  const runtime = createNuzoMcpServerRuntime(options);
  const closeRuntime = () => {
    runtime.close();
  };
  process.once("SIGINT", () => {
    closeRuntime();
    process.exit(130);
  });
  process.once("SIGTERM", () => {
    closeRuntime();
    process.exit(143);
  });
  process.once("beforeExit", closeRuntime);

  await runtime.server.connect(new StdioServerTransport());
}

function isMainModule(): boolean {
  const entrypoint = process.argv[1];
  if (entrypoint === undefined) {
    return false;
  }

  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(entrypoint);
  } catch {
    return false;
  }
}

function openDatabase(storePath: string): SQLiteMemoryDatabase {
  mkdirSync(dirname(storePath), { recursive: true });
  return new SQLiteMemoryDatabase({ path: storePath });
}

function isStoreWritable(storePath: string): boolean {
  try {
    accessSync(dirname(storePath), constants.W_OK);
    accessSync(storePath, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function createService(database: SQLiteMemoryDatabase): MemoryService {
  return createMemoryService({
    store: database,
    searchIndex: database,
    auditLog: database,
    clock: new SystemClock(),
    ids: new RandomIdGenerator(),
    policy: new DefaultPolicyEngine(new RegexSecretScanner()),
    transactions: database,
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
