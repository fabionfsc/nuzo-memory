import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Command } from "commander";
import {
  createHybridSearchIndex,
  createLocalTransformersEmbeddingProvider,
  createSemanticSearch,
  backupSQLiteMemoryStore,
  NuzoMemoryError,
  inspectSQLiteMemoryStore,
  restoreSQLiteMemoryStore,
  semanticIndexPathFor,
  SQLiteMemoryDatabase,
  resolveAutomaticScope,
  type MemoryKind,
  type ListMemoriesInput,
  type ConfirmCaptureDecision,
  type ConfirmCaptureInput,
  type MemoryScope,
  type ForgetMemoryInput,
  type ForgetMemoriesInput,
  type UpdateMemoryInput,
  type ExportMemoriesInput,
  type ImportMemoriesInput,
  type AuditEventFilter,
  type MemoryEvent,
  type RetrievalMode,
  type SemanticFallbackMode,
  type NuzoConfig,
} from "@nuzo/memory-core";
import { runMemoryManager } from "./memory-manager.js";
import { TerminalMemoryManagerIO } from "./terminal-memory-manager.js";
import { formatExportDocument, readExportDocument } from "./export-document.js";
import { formatAuditEvent, formatCaptureSuggestion, formatConfirmCapture } from "./formatters.js";
import {
  createDoctorReport,
  formatFileSafety,
  formatGitTracking,
  formatIntegrityReport,
  formatSecretScan,
  toDoctorOutput,
  toIntegrityOutput,
} from "./doctor.js";
import { ensureStoreDirectory, writePrivateFile } from "./filesystem.js";
import { initializeMemory, type InitCommandOptions } from "./init-command.js";
import {
  createService,
  openDatabase,
  resolveRuntimeConfig,
  resolveScope,
  resolveStorePath,
  type GlobalOptions,
} from "./runtime.js";
import type { CliIO } from "./cli-io.js";
import { cliExitCodes, withErrorHandling } from "./errors.js";
import { registerSemanticCommands } from "./semantic-commands.js";
import {
  inferExportFormat,
  parseAuditEventType,
  parseConfidence,
  parseConfirmCaptureDecision,
  parseExportFormat,
  parseIsoDate,
  parsePositiveInteger,
  parseRelationshipMode,
  parseRetrievalMode,
  parseSemanticFallback,
  type ExportFormat,
} from "./parsers.js";

interface SuggestCaptureCommandOptions {
  kind: MemoryKind;
  tag?: string[];
  source: string;
  confidence?: number;
  relationshipMode?: "exact" | "bounded";
  reason: string;
  json: boolean;
}

interface ConfirmCaptureCommandOptions {
  decision: ConfirmCaptureDecision;
  kind: MemoryKind;
  tag?: string[];
  source: string;
  confidence?: number;
  reason: string;
  yes: boolean;
  actor: string;
  targetMemoryId?: string;
  expectedRevision?: number;
  json: boolean;
}

interface RecallCommandOptions {
  limit?: number;
  includeGlobal?: boolean;
  mode: RetrievalMode;
  semanticFallback?: SemanticFallbackMode;
  modelPath?: string;
  json: boolean;
}

export function registerMemoryCommands(program: Command, io: CliIO): void {
  const memory = program.command("memory").description("Manage local Nuzo stores.");

  memory
    .option("--store <path>", "Path to the SQLite memory store.")
    .option("--scope <scope>", "Memory scope.");

  memory
    .command("init")
    .description("Initialize the local memory store.")
    .option("--project", "Initialize project-local memory in .nuzo/memory.", false)
    .action(withErrorHandling(io, async (commandOptions: InitCommandOptions) => {
      const options = memory.opts<GlobalOptions>();
      const init = initializeMemory(options, commandOptions);
      io.stdout("Nuzo initialized");
      io.stdout(`Store: ${init.storePath}`);
      io.stdout(`Scope: ${init.scope}`);
      io.stdout("Network: disabled");
    }));

  memory
    .command("remember")
    .description("Store a memory.")
    .argument("<content>", "Memory content.")
    .requiredOption("--kind <kind>", "Memory kind.")
    .option("--tag <tag...>", "Memory tag. Can be used multiple times.")
    .option("--source <source>", "Memory source.", "nuzo:cli")
    .action(withErrorHandling(io, async (content: string, commandOptions: { kind: MemoryKind; tag?: string[]; source: string }) => {
      const options = memory.opts<GlobalOptions>();
      const database = openDatabase(options);
      try {
        const service = createService(database);
        const saved = await service.remember({
          content,
          kind: commandOptions.kind,
          scope: resolveScope(options),
          tags: commandOptions.tag ?? [],
          source: commandOptions.source,
        });
        io.stdout(saved.id);
      } finally {
        database.close();
      }
    }));

  memory
    .command("suggest-capture")
    .description("Validate a capture draft without storing memory.")
    .argument("<content>", "Proposed memory content.")
    .requiredOption("--kind <kind>", "Memory kind.")
    .requiredOption("--reason <reason>", "Reason the draft may be worth remembering.")
    .option("--tag <tag...>", "Memory tag. Can be used multiple times.")
    .option("--source <source>", "Capture suggestion source.", "nuzo:cli:capture-suggestion")
    .option("--confidence <number>", "Capture confidence between 0 and 1.", parseConfidence)
    .option("--relationship-mode <mode>", "Capture relationship mode: exact or bounded.", parseRelationshipMode)
    .option("--json", "Print JSON output for scripting.", false)
    .action(withErrorHandling(io, async (
      content: string,
      commandOptions: SuggestCaptureCommandOptions,
    ) => {
      const options = memory.opts<GlobalOptions>();
      const database = openDatabase(options);
      try {
        const service = createService(database);
        const suggestionInput = {
          content,
          kind: commandOptions.kind,
          scope: resolveScope(options),
          tags: commandOptions.tag ?? [],
          source: commandOptions.source,
          reason: commandOptions.reason,
          ...(commandOptions.confidence === undefined ? {} : { confidence: commandOptions.confidence }),
          ...(commandOptions.relationshipMode === undefined ? {} : { relationshipMode: commandOptions.relationshipMode }),
        };
        const suggestion = await service.suggestCapture(suggestionInput);
        io.stdout(formatCaptureSuggestion(suggestion, commandOptions.json));
      } finally {
        database.close();
      }
    }));

  memory
    .command("confirm-capture")
    .description("Apply an explicit user decision for a validated capture draft.")
    .argument("<content>", "Confirmed or rejected memory content.")
    .requiredOption("--decision <decision>", "Decision: create, update, keep_separate, clarify, or reject.", parseConfirmCaptureDecision)
    .requiredOption("--kind <kind>", "Memory kind.")
    .requiredOption("--reason <reason>", "Reason for the confirmed decision.")
    .option("--tag <tag...>", "Memory tag. Can be used multiple times.")
    .option("--source <source>", "Confirmed capture source.", "nuzo:cli:capture-confirmed")
    .option("--confidence <number>", "Capture confidence between 0 and 1.", parseConfidence)
    .option("--target-memory-id <id>", "Existing memory ID for update decisions.")
    .option("--expected-revision <number>", "Displayed memory revision for update decisions.", parsePositiveInteger)
    .option("--actor <actor>", "Audit actor.", "nuzo:cli")
    .option("--yes", "Explicitly confirm create, keep-separate, or update writes.", false)
    .option("--json", "Print JSON output for scripting.", false)
    .action(withErrorHandling(io, async (
      content: string,
      commandOptions: ConfirmCaptureCommandOptions,
    ) => {
      const options = memory.opts<GlobalOptions>();
      const database = openDatabase(options);
      try {
        const service = createService(database);
        const confirmInput: ConfirmCaptureInput = {
          decision: commandOptions.decision,
          content,
          kind: commandOptions.kind,
          scope: resolveScope(options),
          tags: commandOptions.tag ?? [],
          source: commandOptions.source,
          reason: commandOptions.reason,
          confirm: commandOptions.yes,
          actor: commandOptions.actor,
        };
        if (commandOptions.confidence !== undefined) {
          confirmInput.confidence = commandOptions.confidence;
        }
        if (commandOptions.targetMemoryId !== undefined) {
          confirmInput.targetMemoryId = commandOptions.targetMemoryId;
        }
        if (commandOptions.expectedRevision !== undefined) {
          confirmInput.expectedRevision = commandOptions.expectedRevision;
        }
        const result = await service.confirmCapture(confirmInput);
        io.stdout(formatConfirmCapture(result, commandOptions.json));
      } finally {
        database.close();
      }
    }));

  memory
    .command("recall")
    .description("Recall relevant memories.")
    .argument("<query>", "Recall query.")
    .option("--limit <number>", "Maximum number of results.", parsePositiveInteger)
    .option("--include-global", "Include user:default alongside the selected scope.")
    .option("--no-include-global", "Exclude user:default from the selected scope.")
    .option("--mode <mode>", "Retrieval mode: fts, semantic, or hybrid.", parseRetrievalMode, "fts")
    .option("--semantic-fallback <mode>", "Semantic-only fallback: error or fts.", parseSemanticFallback)
    .option("--model-path <path>", "Pinned local semantic model directory.")
    .option("--json", "Print results and retrieval diagnostics as JSON.", false)
    .action(withErrorHandling(io, async (
      query: string,
      commandOptions: RecallCommandOptions,
    ) => {
      const options = memory.opts<GlobalOptions>();
      const runtime = resolveRuntimeConfig(options);
      const database = openDatabase(runtime.storePath);
      const provider = createLocalTransformersEmbeddingProvider({
        ...(commandOptions.modelPath === undefined ? {} : { modelPath: commandOptions.modelPath }),
      });
      try {
        const searchIndex = createHybridSearchIndex({
          fts: database,
          semantic: createSemanticSearch({
            path: semanticIndexPathFor(runtime.storePath),
            provider,
            store: database,
            similarityFloor: 0.34,
          }),
        });
        const service = createService(database, searchIndex);
        const response = await service.recallDetailed({
          query,
          scope: runtime.scope,
          limit: commandOptions.limit ?? runtime.recall.limit,
          includeGlobal: commandOptions.includeGlobal ?? runtime.recall.includeGlobal,
          recordUsage: runtime.privacy.recordRecallEvents,
          retrievalMode: commandOptions.mode,
          ...(commandOptions.semanticFallback === undefined
            ? {}
            : { semanticFallback: commandOptions.semanticFallback }),
        });

        if (commandOptions.json) {
          io.stdout(JSON.stringify(response, null, 2));
        } else {
          for (const result of response.results) {
            io.stdout(`${result.memory.id}\t${result.score.toPrecision(4)}\t${result.memory.content}`);
          }
          if (response.diagnostics.semanticFallbackCode !== null) {
            io.stderr(`Semantic fallback: ${response.diagnostics.semanticFallbackCode}`);
          }
        }
      } finally {
        await provider.dispose?.();
        database.close();
      }
    }));

  registerSemanticCommands(memory, io);

  memory
    .command("manage")
    .description("Open the interactive terminal memory manager.")
    .option("--all-scopes", "Manage every authorized local scope.", false)
    .action(withErrorHandling(io, async (commandOptions: { allScopes: boolean }) => {
      const options = memory.opts<GlobalOptions>();
      if (commandOptions.allScopes && options.scope !== undefined) {
        throw new NuzoMemoryError(
          "MEMORY_SCOPE_CONFLICT",
          "Manage --all-scopes cannot be combined with --scope.",
        );
      }

      const database = openDatabase(options);
      const service = createService(database);
      const managerIO = new TerminalMemoryManagerIO();
      const scope = commandOptions.allScopes ? undefined : resolveScope(options);
      try {
        await runMemoryManager({
          service,
          io: managerIO,
          ...(scope === undefined ? {} : { scope }),
          transfers: {
            exportJson: async (path, includeArchived) => {
              const document = await service.exportMemories({
                actor: "nuzo:cli-manager",
                includeArchived,
                ...(scope === undefined ? {} : { scope }),
              });
              const exportPath = resolve(path);
              ensureStoreDirectory(exportPath);
              writePrivateFile(exportPath, formatExportDocument(document, "json"));
              return document.memories.length;
            },
            importJson: async (path, dryRun) => {
              const document = readExportDocument(resolve(path));
              const result = await service.importMemories({
                document,
                actor: "nuzo:cli-manager",
                dryRun,
                ...(scope === undefined ? {} : { scope }),
              });
              return { imported: result.imported, skipped: result.skipped };
            },
          },
        });
      } finally {
        managerIO.close();
        database.close();
      }
    }));

  memory
    .command("list")
    .description("List memories.")
    .option("--tag <tag...>", "Filter by tag.")
    .option("--all-scopes", "List every authorized local scope.", false)
    .option("--include-archived", "Include archived memories.", false)
    .action(withErrorHandling(io, async (commandOptions: {
      tag?: string[];
      allScopes: boolean;
      includeArchived: boolean;
    }) => {
      const options = memory.opts<GlobalOptions>();
      if (commandOptions.allScopes && options.scope !== undefined) {
        throw new NuzoMemoryError(
          "MEMORY_SCOPE_CONFLICT",
          "List --all-scopes cannot be combined with --scope.",
        );
      }
      const database = openDatabase(options);
      try {
        const service = createService(database);
        const listInput: ListMemoriesInput = {
          includeArchived: commandOptions.includeArchived,
        };
        if (!commandOptions.allScopes) {
          listInput.scope = resolveScope(options);
        }
        if (commandOptions.tag) {
          listInput.tags = commandOptions.tag;
        }

        const memories = await service.list(listInput);

        for (const item of memories) {
          const archived = item.archivedAt ? " archived" : "";
          io.stdout(`${item.id}\trev=${item.revision}\tscope=${item.scope}\t${item.kind}${archived}\t${item.content}`);
        }
      } finally {
        database.close();
      }
    }));

  memory
    .command("update")
    .description("Update a memory.")
    .argument("<id>", "Memory ID.")
    .option("--content <content>", "Replacement memory content.")
    .option("--kind <kind>", "Replacement memory kind.")
    .option("--scope <scope>", "Replacement memory scope.")
    .option("--tag <tag...>", "Replacement memory tags.")
    .option("--confidence <number>", "Replacement confidence between 0 and 1.", parseConfidence)
    .option("--expected-revision <number>", "Only update if the memory is still at this revision.", parsePositiveInteger)
    .action(withErrorHandling(io, async (
      id: string,
      commandOptions: {
        content?: string;
        kind?: MemoryKind;
        scope?: MemoryScope;
        tag?: string[];
        confidence?: number;
        expectedRevision?: number;
      },
    ) => {
      const options = memory.opts<GlobalOptions>();
      const database = openDatabase(options);
      try {
        const service = createService(database);
        const updateInput: UpdateMemoryInput = {
          id,
          actor: "nuzo:cli",
        };
        if (commandOptions.expectedRevision !== undefined) {
          updateInput.expectedRevision = commandOptions.expectedRevision;
        }
        if (commandOptions.content !== undefined) {
          updateInput.content = commandOptions.content;
        }
        if (commandOptions.kind !== undefined) {
          updateInput.kind = commandOptions.kind;
        }
        if (commandOptions.scope !== undefined) {
          updateInput.scope = resolveAutomaticScope(commandOptions.scope);
        }
        if (commandOptions.tag !== undefined) {
          updateInput.tags = commandOptions.tag;
        }
        if (commandOptions.confidence !== undefined) {
          updateInput.confidence = commandOptions.confidence;
        }

        const updated = await service.update(updateInput);
        io.stdout(updated.id);
      } finally {
        database.close();
      }
    }));

  memory
    .command("forget")
    .description("Archive or delete a memory.")
    .argument("<id>", "Memory ID.")
    .option("--archive", "Archive the memory. This is the default.", false)
    .option("--delete", "Hard delete instead of archive.", false)
    .option("--yes", "Confirm hard delete.", false)
    .option("--reason <reason>", "Reason for forgetting.")
    .option("--expected-revision <number>", "Only forget if the memory is still at this revision.", parsePositiveInteger)
    .action(withErrorHandling(io, async (id: string, commandOptions: {
      archive: boolean;
      delete: boolean;
      yes: boolean;
      reason?: string;
      expectedRevision?: number;
    }) => {
      if (commandOptions.archive && commandOptions.delete) {
        throw new NuzoMemoryError(
          "MEMORY_FORGET_MODE_CONFLICT",
          "Choose either --archive or --delete, not both.",
          { id },
        );
      }

      const options = memory.opts<GlobalOptions>();
      const database = openDatabase(options);
      try {
        const service = createService(database);
        const forgetInput: ForgetMemoryInput = {
          id,
          mode: commandOptions.delete ? "delete" : "archive",
          confirm: commandOptions.yes,
          actor: "nuzo:cli",
        };
        if (commandOptions.expectedRevision !== undefined) {
          forgetInput.expectedRevision = commandOptions.expectedRevision;
        }
        if (commandOptions.reason) {
          forgetInput.reason = commandOptions.reason;
        }

        await service.forget(forgetInput);
        io.stdout(commandOptions.delete ? "Deleted" : "Archived");
      } finally {
        database.close();
      }
    }));

  memory
    .command("history")
    .description("List audit events for a memory.")
    .argument("<id>", "Memory ID.")
    .action(withErrorHandling(io, async (id: string) => {
      const options = memory.opts<GlobalOptions>();
      const database = openDatabase(options);
      try {
        const service = createService(database);
        const events = await service.history(id);
        for (const event of events) {
          io.stdout([
            event.createdAt.toISOString(),
            event.eventType,
            event.actor,
            JSON.stringify(event.payload),
          ].join("\t"));
        }
      } finally {
        database.close();
      }
    }));

  memory
    .command("audit")
    .description("List bounded store-wide audit events.")
    .option("--memory-id <id>", "Filter by memory ID.")
    .option("--event-type <event-type...>", "Filter by audit event type.", parseAuditEventType)
    .option("--actor <actor>", "Filter by actor.")
    .option("--scope <scope>", "Filter by memory scope.")
    .option("--since <iso-date>", "Include events at or after this ISO timestamp.")
    .option("--until <iso-date>", "Include events at or before this ISO timestamp.")
    .option("--limit <number>", "Maximum number of events.", parsePositiveInteger)
    .action(withErrorHandling(io, async (commandOptions: {
      memoryId?: string;
      eventType?: MemoryEvent["eventType"][];
      actor?: string;
      scope?: MemoryScope;
      since?: string;
      until?: string;
      limit?: number;
    }) => {
      const options = memory.opts<GlobalOptions>();
      const database = openDatabase(options);
      try {
        const service = createService(database);
        const auditInput: AuditEventFilter = {
          limit: commandOptions.limit ?? 50,
        };
        if (commandOptions.memoryId !== undefined) {
          auditInput.memoryId = commandOptions.memoryId;
        }
        if (commandOptions.eventType !== undefined) {
          auditInput.eventTypes = commandOptions.eventType;
        }
        if (commandOptions.actor !== undefined) {
          auditInput.actor = commandOptions.actor;
        }
        const scope = commandOptions.scope ?? options.scope;
        if (scope !== undefined) {
          auditInput.scope = resolveAutomaticScope(scope);
        }
        if (commandOptions.since !== undefined) {
          auditInput.since = parseIsoDate(commandOptions.since, "since");
        }
        if (commandOptions.until !== undefined) {
          auditInput.until = parseIsoDate(commandOptions.until, "until");
        }

        const events = await service.audit(auditInput);
        for (const event of events) {
          io.stdout(formatAuditEvent(event));
        }
      } finally {
        database.close();
      }
    }));

  memory
    .command("forget-many")
    .description("Preview or apply a filtered bulk archive/delete operation.")
    .option("--scope <scope>", "Select one memory scope.")
    .option("--tag <tag...>", "Select memories containing every tag.")
    .option("--all", "Select all active memories.", false)
    .option("--delete", "Hard delete instead of archive.", false)
    .option("--apply", "Apply the operation. The default is dry-run.", false)
    .option("--yes", "Confirm hard delete.", false)
    .option("--reason <reason>", "Reason for forgetting.")
    .action(withErrorHandling(io, async (commandOptions: {
      scope?: MemoryScope;
      tag?: string[];
      all: boolean;
      delete: boolean;
      apply: boolean;
      yes: boolean;
      reason?: string;
    }) => {
      const options = memory.opts<GlobalOptions>();
      const database = openDatabase(options);
      try {
        const service = createService(database);
        const forgetInput: ForgetMemoriesInput = {
          tags: commandOptions.tag ?? [],
          all: commandOptions.all,
          mode: commandOptions.delete ? "delete" : "archive",
          confirm: commandOptions.yes,
          dryRun: !commandOptions.apply,
          actor: "nuzo:cli",
        };
        if (commandOptions.scope !== undefined) {
          forgetInput.scope = resolveAutomaticScope(commandOptions.scope);
        }
        if (commandOptions.reason !== undefined) {
          forgetInput.reason = commandOptions.reason;
        }

        const result = await service.forgetMany(forgetInput);
        io.stdout([
          result.dryRun ? "Preview" : "Applied",
          `matched=${result.matched}`,
          `affected=${result.affected}`,
          `mode=${result.mode}`,
        ].join("\t"));
        for (const id of result.ids) {
          io.stdout(id);
        }
      } finally {
        database.close();
      }
    }));

  memory
    .command("export")
    .description("Export memories as a versioned document.")
    .option("--path <path>", "Write export output to a file instead of stdout.")
    .option("--format <format>", "Export format: json or markdown.", parseExportFormat)
    .option("--tag <tag...>", "Filter by tag.")
    .option("--include-archived", "Include archived memories.", false)
    .action(withErrorHandling(io, async (commandOptions: {
      path?: string;
      format?: ExportFormat;
      tag?: string[];
      includeArchived: boolean;
    }) => {
      const options = memory.opts<GlobalOptions>();
      const database = openDatabase(options);
      try {
        const service = createService(database);
        const exportInput: ExportMemoriesInput = {
          actor: "nuzo:cli",
          scope: resolveScope(options),
          includeArchived: commandOptions.includeArchived,
        };
        if (commandOptions.tag !== undefined) {
          exportInput.tags = commandOptions.tag;
        }

        const document = await service.exportMemories(exportInput);
        const format = commandOptions.format ?? inferExportFormat(commandOptions.path);
        const output = formatExportDocument(document, format);

        if (commandOptions.path) {
          const exportPath = resolve(commandOptions.path);
          ensureStoreDirectory(exportPath);
          writePrivateFile(exportPath, output);
          io.stdout(`Exported ${document.memories.length} memories to ${exportPath}`);
          return;
        }

        io.stdout(output.trimEnd());
      } finally {
        database.close();
      }
    }));

  memory
    .command("import")
    .description("Import memories from a versioned JSON document.")
    .argument("<path>", "Path to a Nuzo memory export JSON file.")
    .option("--dry-run", "Validate and count memories without writing.", false)
    .option("--scope <scope>", "Override imported memory scope.")
    .action(withErrorHandling(io, async (path: string, commandOptions: { dryRun: boolean; scope?: MemoryScope }) => {
      const options = memory.opts<GlobalOptions>();
      const database = openDatabase(options);
      try {
        const service = createService(database);
        const document = readExportDocument(resolve(path));
        const importInput: ImportMemoriesInput = {
          document,
          actor: "nuzo:cli",
          dryRun: commandOptions.dryRun,
        };
        if (commandOptions.scope !== undefined) {
          importInput.scope = resolveAutomaticScope(commandOptions.scope);
        }

        const result = await service.importMemories(importInput);
        const skipped = result.skipped > 0 ? `, skipped ${result.skipped}` : "";
        io.stdout(`${result.dryRun ? "Would import" : "Imported"} ${result.imported} memories${skipped}`);
      } finally {
        database.close();
      }
    }));

  memory
    .command("integrity")
    .description("Validate SQLite store integrity, schema, FTS, and counts without writing.")
    .option("--json", "Print JSON output for scripting.", false)
    .action(withErrorHandling(io, async (commandOptions: { json: boolean }) => {
      const options = memory.opts<GlobalOptions>();
      const report = inspectSQLiteMemoryStore(resolveStorePath(options));
      if (commandOptions.json) {
        io.stdout(JSON.stringify(toIntegrityOutput(report), null, 2));
      } else {
        io.stdout(formatIntegrityReport(report));
      }
      if (!report.ok) {
        process.exitCode = cliExitCodes.operationalError;
      }
    }));

  memory
    .command("backup")
    .description("Create a WAL-safe SQLite backup of the selected memory store.")
    .requiredOption("--path <path>", "Destination SQLite backup path.")
    .option("--overwrite", "Replace an existing backup path.", false)
    .option("--json", "Print JSON output for scripting.", false)
    .action(withErrorHandling(io, async (commandOptions: {
      path: string;
      overwrite: boolean;
      json: boolean;
    }) => {
      const options = memory.opts<GlobalOptions>();
      const result = await backupSQLiteMemoryStore({
        sourcePath: resolveStorePath(options),
        backupPath: resolve(commandOptions.path),
        overwrite: commandOptions.overwrite,
      });
      if (commandOptions.json) {
        io.stdout(JSON.stringify({
          source_path: result.sourcePath,
          backup_path: result.backupPath,
          pages: result.pages,
          remaining_pages: result.remainingPages,
          integrity: toIntegrityOutput(result.report),
        }, null, 2));
      } else {
        io.stdout(`Backed up ${result.report.memoryCount} memories to ${result.backupPath}`);
        io.stdout(`Integrity: ${result.report.ok ? "ok" : "failed"}`);
      }
    }));

  memory
    .command("restore")
    .description("Restore the selected memory store from a validated SQLite backup.")
    .argument("<path>", "Source SQLite backup path.")
    .option("--yes", "Confirm replacement of the selected memory store.", false)
    .option("--json", "Print JSON output for scripting.", false)
    .action(withErrorHandling(io, async (path: string, commandOptions: {
      yes: boolean;
      json: boolean;
    }) => {
      const options = memory.opts<GlobalOptions>();
      const result = restoreSQLiteMemoryStore({
        backupPath: resolve(path),
        targetPath: resolveStorePath(options),
        overwrite: commandOptions.yes,
      });
      if (commandOptions.json) {
        io.stdout(JSON.stringify({
          backup_path: result.backupPath,
          target_path: result.targetPath,
          integrity: toIntegrityOutput(result.report),
        }, null, 2));
      } else {
        io.stdout(`Restored ${result.report.memoryCount} memories to ${result.targetPath}`);
        io.stdout(`Integrity: ${result.report.ok ? "ok" : "failed"}`);
      }
    }));

  memory
    .command("doctor")
    .description("Check the local memory environment.")
    .option("--scan-secrets", "Explicitly scan active memory records for high-confidence secret patterns.", false)
    .option("--json", "Print JSON output for scripting.", false)
    .action(withErrorHandling(io, async (commandOptions: { json: boolean; scanSecrets: boolean }) => {
      const options = memory.opts<GlobalOptions>();
      const report = await createDoctorReport(options, commandOptions.scanSecrets);
      if (commandOptions.json) {
        io.stdout(JSON.stringify(toDoctorOutput(report), null, 2));
        return;
      }
      io.stdout(`Store: ${report.storePath}`);
      io.stdout(`Store exists: ${report.storeExists ? "yes" : "no"}`);
      io.stdout(`Store directory: ${report.storeDirectory}`);
      io.stdout(`Store directory exists: ${report.storeDirectoryExists ? "yes" : "no"}`);
      io.stdout(`Scope: ${report.scope}`);
      io.stdout(`Project scope: ${report.projectScope}`);
      io.stdout("Authorization: administrator (local CLI)");
      io.stdout(`Config source: ${report.provenance.config}`);
      io.stdout(`Store source: ${report.provenance.store}`);
      io.stdout(`Scope source: ${report.provenance.scope}`);
      io.stdout(`Network: ${report.network}`);
      io.stdout(`Integrity: ${report.integrity.ok ? "ok" : report.storeExists ? "failed" : "missing"}`);
      io.stdout(formatFileSafety(report.fileSafety));
      io.stdout(formatSecretScan(report.secretScan));
      io.stdout(formatGitTracking(report.gitTracking));
      if (report.gitTracking.status === "tracked") {
        for (const trackedFile of report.gitTracking.trackedFiles) {
          io.stdout(`Tracked memory file: ${trackedFile}`);
        }
      }
      for (const finding of report.fileSafety.unsafe) {
        const mode = finding.actualMode === null ? "n/a" : finding.actualMode.toString(8).padStart(3, "0");
        io.stdout(`Unsafe runtime path: ${finding.path} (${finding.reason}; mode ${mode})`);
      }
      for (const path of report.fileSafety.staleArtifacts) io.stdout(`Stale runtime artifact: ${path}`);
      for (const path of report.fileSafety.unexpectedFiles) io.stdout(`Unexpected runtime file: ${path}`);
      for (const warning of report.warnings) {
        io.stdout(`Warning: ${warning}`);
      }
      io.stdout(`Status: ${report.warnings.length === 0 ? "ok" : "warning"}`);
    }));

}
