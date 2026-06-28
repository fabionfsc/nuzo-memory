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
  NuzoMemoryError,
  memoryLimits,
  memoryEventTypes,
  memoryScopePattern,
  memoryTagPattern,
  projectScopeFromPath,
  schemaVersion,
  type MemoryService,
  type MemoryExportDocument,
  type MemoryScope,
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
  SuggestCaptureToolInput,
  UpdateToolInput,
  MemoryDoctorDiagnostics,
  AuditToolInput,
} from "./handlers.js";

const defaultStorePath = resolve(homedir(), ".nuzo", "memory", "memories.sqlite");
const scopeSchema = z.string().max(memoryLimits.scopeLength).regex(memoryScopePattern);
const tagSchema = z.string().regex(memoryTagPattern);
const memoryIdSchema = z.string().min(1).max(memoryLimits.identifierLength);
const exportDateSchema = z.string().max(memoryLimits.dateLength);
const eventTypeSchema = z.enum(memoryEventTypes);

export interface NuzoMcpServerOptions {
  storePath?: string;
  authorizedScopes?: readonly MemoryScope[];
  doctorDiagnostics?: MemoryDoctorDiagnostics;
  projectPath?: string;
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
  const serviceOptions: Pick<NuzoMcpServerOptions, "authorizedScopes"> = {};
  if (options.authorizedScopes !== undefined) {
    serviceOptions.authorizedScopes = options.authorizedScopes;
  }
  const service = createService(database, serviceOptions);
  let closed = false;
  const server = new McpServer({
    name: "nuzo",
    version: "0.5.0",
  });

  registerMemoryTools(server, service, {
    storePath,
    ...(options.projectPath === undefined ? {} : { projectPath: options.projectPath }),
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
    projectScope: projectScopeFromPath(
      options.projectPath ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd(),
    ),
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
        content: z.string().min(1).max(memoryLimits.contentLength),
        kind: z.enum(["preference", "project_decision", "fact", "instruction", "note"]),
        scope: scopeSchema.default("user:default"),
        tags: z.array(tagSchema).max(memoryLimits.tags).default([]),
        source: z.string().min(1).max(memoryLimits.sourceLength).default("nuzo:mcp"),
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
        query: z.string().min(1).max(memoryLimits.queryLength),
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
        task_context: z.string().min(1).max(8000),
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
    "memory.suggest_capture",
    {
      description: "Validate a proposed capture draft without creating memory. Confirmed writes still use memory.remember.",
      inputSchema: {
        content: z.string().min(1).max(memoryLimits.contentLength),
        kind: z.enum(["preference", "project_decision", "fact", "instruction", "note"]),
        scope: scopeSchema.default("user:default"),
        tags: z.array(tagSchema).max(memoryLimits.tags).default([]),
        source: z.string().min(1).max(memoryLimits.sourceLength).default("nuzo:capture-suggestion"),
        confidence: z.number().min(0).max(1).optional(),
        reason: z.string().min(1).max(memoryLimits.reasonLength),
      },
    },
    async (input) => {
      const suggestInput: SuggestCaptureToolInput = {
        content: input.content,
        kind: input.kind,
        scope: input.scope,
        tags: input.tags,
        source: input.source,
        reason: input.reason,
      };
      if (input.confidence !== undefined) {
        suggestInput.confidence = input.confidence;
      }

      return jsonToolResult(await handlers.suggestCapture(suggestInput));
    },
  );

  server.registerTool(
    "memory.list",
    {
      description: "List local Nuzo memories.",
      inputSchema: {
        scope: scopeSchema.optional(),
        tags: z.array(tagSchema).max(memoryLimits.tags).default([]),
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
        id: memoryIdSchema,
        expected_revision: z.number().int().min(1).optional(),
        content: z.string().max(memoryLimits.contentLength).optional(),
        kind: z.enum(["preference", "project_decision", "fact", "instruction", "note"]).optional(),
        scope: scopeSchema.optional(),
        tags: z.array(tagSchema).max(memoryLimits.tags).optional(),
        confidence: z.number().min(0).max(1).optional(),
      },
    },
    async (input) => {
      const updateInput: UpdateToolInput = {
        id: input.id,
      };
      if (input.expected_revision !== undefined) {
        updateInput.expected_revision = input.expected_revision;
      }
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

      try {
        return jsonToolResult(await handlers.update(updateInput));
      } catch (error) {
        return jsonErrorToolResult(error);
      }
    },
  );

  server.registerTool(
    "memory.history",
    {
      description: "List audit events for one Nuzo memory ID.",
      inputSchema: {
        id: memoryIdSchema,
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
    "memory.audit",
    {
      description: "List bounded store-wide Nuzo audit events without memory content.",
      inputSchema: {
        memory_id: memoryIdSchema.optional(),
        event_type: z.array(eventTypeSchema).max(16).default([]),
        actor: z.string().min(1).max(memoryLimits.actorLength).optional(),
        scope: scopeSchema.optional(),
        since: exportDateSchema.optional(),
        until: exportDateSchema.optional(),
        limit: z.number().int().min(1).max(200).default(50),
      },
    },
    async (input) => {
      const auditInput: AuditToolInput = {
        event_type: input.event_type,
        limit: input.limit,
      };
      if (input.memory_id !== undefined) {
        auditInput.memory_id = input.memory_id;
      }
      if (input.actor !== undefined) {
        auditInput.actor = input.actor;
      }
      if (input.scope !== undefined) {
        auditInput.scope = input.scope;
      }
      if (input.since !== undefined) {
        auditInput.since = input.since;
      }
      if (input.until !== undefined) {
        auditInput.until = input.until;
      }

      return jsonToolResult(await handlers.audit(auditInput));
    },
  );

  server.registerTool(
    "memory.forget",
    {
      description: "Archive or delete a local Nuzo memory.",
      inputSchema: {
        id: memoryIdSchema,
        expected_revision: z.number().int().min(1).optional(),
        mode: z.enum(["archive", "delete"]).default("archive"),
        confirm: z.boolean().default(false),
        reason: z.string().max(memoryLimits.reasonLength).optional(),
      },
    },
    async (input) => {
      const forgetInput: ForgetToolInput = {
        id: input.id,
        mode: input.mode,
        confirm: input.confirm,
      };
      if (input.expected_revision !== undefined) {
        forgetInput.expected_revision = input.expected_revision;
      }
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
        tags: z.array(tagSchema).max(memoryLimits.tags).default([]),
        all: z.boolean().default(false),
        mode: z.enum(["archive", "delete"]).default("archive"),
        confirm: z.boolean().default(false),
        dry_run: z.boolean().default(true),
        reason: z.string().max(memoryLimits.reasonLength).optional(),
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
        tags: z.array(tagSchema).max(memoryLimits.tags).default([]),
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
          exported_at: exportDateSchema,
          memories: z.array(
            z.object({
              scope: scopeSchema,
              kind: z.enum(["preference", "project_decision", "fact", "instruction", "note"]),
              content: z.string().max(memoryLimits.contentLength),
              tags: z.array(tagSchema).max(memoryLimits.tags),
              source: z.string().min(1).max(memoryLimits.sourceLength),
              confidence: z.number().min(0).max(1),
              created_at: exportDateSchema,
              updated_at: exportDateSchema,
              last_used_at: exportDateSchema.nullable(),
              archived_at: exportDateSchema.nullable(),
            }),
          ).max(memoryLimits.importItems),
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
  mkdirSync(dirname(storePath), { recursive: true, mode: 0o700 });
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

function createService(
  database: SQLiteMemoryDatabase,
  options: Pick<NuzoMcpServerOptions, "authorizedScopes"> = {},
): MemoryService {
  return createMemoryService({
    store: database,
    searchIndex: database,
    auditLog: database,
    clock: new SystemClock(),
    ids: new RandomIdGenerator(),
    policy: new DefaultPolicyEngine(new RegexSecretScanner(), toPolicyOptions(options)),
    transactions: database,
  });
}

function toPolicyOptions(
  options: Pick<NuzoMcpServerOptions, "authorizedScopes">,
) {
  const policyOptions: {
    allowedScopes?: readonly MemoryScope[];
  } = {};
  if (options.authorizedScopes !== undefined) {
    policyOptions.allowedScopes = options.authorizedScopes;
  }
  return policyOptions;
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

function jsonErrorToolResult(error: unknown) {
  if (error instanceof NuzoMemoryError) {
    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            code: error.code,
            message: error.message,
            details: error.details,
          }, null, 2),
        },
      ],
    };
  }
  throw error;
}
