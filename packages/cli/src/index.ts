#!/usr/bin/env node
import {
  chmodSync,
  closeSync,
  constants,
  fstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Command, CommanderError, InvalidArgumentError } from "commander";
import {
  createMemoryService,
  createHybridSearchIndex,
  createLocalTransformersEmbeddingProvider,
  createSemanticSearch,
  clearSemanticIndex,
  DefaultPolicyEngine,
  backupSQLiteMemoryStore,
  embeddingProviderFingerprint,
  formatMemoryExportMarkdown,
  NuzoMemoryError,
  inspectLocalTransformersModel,
  inspectRuntimeFileSafety,
  inspectSQLiteMemoryStore,
  inspectSemanticIndex,
  localTransformersProviderDescriptor,
  provisionLocalTransformersModel,
  RandomIdGenerator,
  RegexSecretScanner,
  restoreSQLiteMemoryStore,
  rebuildSemanticIndex,
  semanticIndexPathFor,
  SQLiteMemoryDatabase,
  SystemClock,
  memoryEventTypes,
  getDefaultStorePath,
  projectScopeFromPath,
  resolveAutomaticScope,
  resolveNuzoRuntimeConfig,
  type MemoryKind,
  type ListMemoriesInput,
  type ConfirmCaptureDecision,
  type ConfirmCaptureInput,
  type ConfirmCaptureResult,
  type CaptureSuggestionResult,
  type MemoryRecord,
  type MemoryScope,
  type ForgetMemoryInput,
  type ForgetMemoriesInput,
  type UpdateMemoryInput,
  type MemoryExportDocument,
  type ExportMemoriesInput,
  type ImportMemoriesInput,
  type AuditEventFilter,
  type MemoryEvent,
  type RetrievalMode,
  type SearchIndex,
  type SemanticFallbackMode,
  type NuzoConfig,
  type NuzoRuntimeConfig,
  type SQLiteIntegrityReport,
  type RuntimeFileSafetyReport,
} from "@nuzo/memory-core";
import {
  defaultSetupHosts,
  detectHostBootstrapHosts,
  formatHostBootstrapResult,
  runHostBootstrap,
  supportedHostBootstrapHosts,
  type HostBootstrapHost,
} from "./host-bootstrap.js";
import { formatHostUpdateResult, runHostUpdate } from "./host-update.js";
import { runMemoryManager } from "./memory-manager.js";
import { TerminalMemoryManagerIO } from "./terminal-memory-manager.js";
import { recordManagedHosts } from "./managed-hosts.js";

export interface CliIO {
  stdout(message: string): void;
  stderr(message: string): void;
  readStdin?(): string;
}

const defaultIO: CliIO = {
  stdout: (message) => console.log(message),
  stderr: (message) => console.error(message),
  readStdin: () => readLineFromStdin(),
};

interface GlobalOptions {
  store?: string;
  scope?: MemoryScope;
}

interface InitCommandOptions {
  project: boolean;
}

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

export interface HostTargetCommandOptions {
  all: boolean;
  claudeCode: boolean;
  codex: boolean;
  dryRun: boolean;
  json: boolean;
  yes: boolean;
}

export type SetupCommandOptions = HostTargetCommandOptions;

interface DoctorReport {
  storePath: string;
  storeExists: boolean;
  storeDirectory: string;
  storeDirectoryExists: boolean;
  scope: MemoryScope;
  projectScope: `project:${string}`;
  authorizationMode: "administrator";
  provenance: NuzoRuntimeConfig["provenance"];
  adjustments: NuzoRuntimeConfig["adjustments"];
  network: "disabled";
  gitTracking: GitTrackingReport;
  integrity: SQLiteIntegrityReport;
  fileSafety: RuntimeFileSafetyReport;
  secretScan: DoctorSecretScanReport;
  warnings: string[];
}

type DoctorSecretScanReport =
  | { status: "not_requested"; scannedRecords: 0; flaggedRecords: 0; findingsByKind: Record<string, never> }
  | { status: "completed"; scannedRecords: number; flaggedRecords: number; findingsByKind: Record<string, number> };

type GitTrackingReport =
  | { status: "clean"; trackedFiles: string[] }
  | { status: "tracked"; trackedFiles: string[] }
  | { status: "unavailable"; reason: string; trackedFiles: [] }
  | { status: "skipped"; reason: string; trackedFiles: [] };

type ExportFormat = "json" | "markdown";

export const cliExitCodes = {
  success: 0,
  operationalError: 1,
  usageError: 2,
  internalError: 70,
} as const;

export function createProgram(io: CliIO = defaultIO): Command {
  const program = new Command()
    .configureOutput({
      writeOut: (message) => io.stdout(message.trimEnd()),
      writeErr: (message) => io.stderr(message.trimEnd()),
    })
    .exitOverride();

  program
    .name("nuzo")
    .description("Local-first, auditable memory for AI agents.")
    .version("0.9.1");

  program
    .command("setup")
    .description("Configure Nuzo for installed agent hosts.")
    .option("--codex", "Configure Codex only.", false)
    .option("--claude-code", "Configure Claude Code only.", false)
    .option("--all", "Configure every supported host.", false)
    .option("--dry-run", "Print the host setup plan without changing host configuration.", false)
    .option("--yes", "Confirm host setup non-interactively.", false)
    .option("--json", "Print JSON output for scripting.", false)
    .addHelpText("after", `

Examples:
  # Preview detected hosts before changing anything
  $ nuzo setup --dry-run

  # Configure Codex only
  $ nuzo setup --codex --yes

  # Configure Claude Code only
  $ nuzo setup --claude-code --yes

  # Configure both supported hosts
  $ nuzo setup --all --yes
`)
    .action(withErrorHandling(io, async (commandOptions: SetupCommandOptions) => {
      const detected = detectHostBootstrapHosts();
      const hosts = setupHostsFromOptions(commandOptions, detected, io);
      const result = runHostBootstrap(hosts, commandOptions);
      if (!commandOptions.dryRun) {
        recordManagedHosts(result.hosts.map(({ host }) => ({
          host,
          ...(host === "claude-code" ? { scope: "user" } : {}),
        })));
      }
      io.stdout(formatHostBootstrapResult(result, commandOptions.json));
    }));

  program
    .command("update")
    .description("Update every installed Nuzo host plugin without repeating setup.")
    .option("--codex", "Update the installed Codex plugin only.", false)
    .option("--claude-code", "Update the installed Claude Code plugin only.", false)
    .option("--all", "Update every supported installed host plugin.", false)
    .option("--dry-run", "Print the managed update plan without changing host configuration.", false)
    .option("--yes", "Confirm the managed update non-interactively.", false)
    .option("--json", "Print JSON output for scripting.", false)
    .addHelpText("after", `

Examples:
  # Preview updates for installed Codex and Claude Code plugins
  $ nuzo update --dry-run

  # Update every installed Nuzo host plugin
  $ nuzo update --yes

  # Update the installed Codex plugin only
  $ nuzo update --codex --yes

  # Update the installed Claude Code plugin only
  $ nuzo update --claude-code --yes
`)
    .action(withErrorHandling(io, async (commandOptions: HostTargetCommandOptions) => {
      const hosts = updateHostsFromOptions(commandOptions);
      const result = runHostUpdate(hosts, commandOptions);
      io.stdout(formatHostUpdateResult(result, commandOptions.json));
    }));

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
      const init = resolveInitContext(options, commandOptions);
      ensureStoreDirectory(init.storePath);
      if (!init.project) {
        ensurePrivateDirectory(join(dirname(init.storePath), "exports"));
        ensurePrivateDirectory(join(dirname(init.storePath), "logs"));
      }
      writeConfigIfMissing(
        init.configPath,
        init.configStorePath,
        init.scope,
        init.project,
      );
      if (init.projectRoot !== null) {
        ensureProjectGitIgnore(init.projectRoot);
      }

      const database = new SQLiteMemoryDatabase({ path: init.storePath });
      database.close();
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

  const semantic = memory.command("semantic").description("Manage the optional derived semantic index and local model.");

  semantic
    .command("status")
    .description("Inspect model and derived-index state without loading the model.")
    .option("--model-path <path>", "Pinned local semantic model directory.")
    .option("--json", "Print JSON output.", false)
    .action(withErrorHandling(io, async (commandOptions: { modelPath?: string; json: boolean }) => {
      const options = memory.opts<GlobalOptions>();
      const runtime = resolveRuntimeConfig(options);
      const database = openDatabase(runtime.storePath);
      try {
        const model = inspectLocalTransformersModel(commandOptions.modelPath);
        const index = await inspectSemanticIndex(
          semanticIndexPathFor(runtime.storePath),
          embeddingProviderFingerprint(localTransformersProviderDescriptor()),
          database,
        );
        const output = { model, index };
        if (commandOptions.json) io.stdout(JSON.stringify(output, null, 2));
        else {
          io.stdout(`Model: ${model.state} (${model.path})`);
          io.stdout(`Index: ${index.state} (${index.path})`);
          io.stdout(`Indexed: ${index.indexedMemories}/${index.activeMemories}`);
        }
      } finally {
        database.close();
      }
    }));

  semantic
    .command("provision")
    .description("Download and verify the pinned local model after explicit consent.")
    .option("--model-path <path>", "Pinned local semantic model directory.")
    .option("--allow-network", "Allow this command to download the pinned public model.", false)
    .option("--yes", "Confirm the model download.", false)
    .option("--json", "Print JSON output.", false)
    .action(withErrorHandling(io, async (commandOptions: { modelPath?: string; allowNetwork: boolean; yes: boolean; json: boolean }) => {
      if (!commandOptions.yes) {
        throw new NuzoMemoryError("SEMANTIC_PROVISION_CONFIRMATION_REQUIRED", "Model provisioning requires --yes.");
      }
      const result = await provisionLocalTransformersModel({
        ...(commandOptions.modelPath === undefined ? {} : { path: commandOptions.modelPath }),
        allowNetwork: commandOptions.allowNetwork,
      });
      if (commandOptions.json) io.stdout(JSON.stringify(result, null, 2));
      else {
        io.stdout(result.downloaded ? "Semantic model provisioned" : "Semantic model already ready");
        io.stdout(`Path: ${result.path}`);
        io.stdout(`Files: ${result.files}`);
        io.stdout(`Bytes: ${result.bytes}`);
      }
    }));

  semantic
    .command("rebuild")
    .description("Rebuild the derived semantic sidecar from active canonical memory.")
    .option("--model-path <path>", "Pinned local semantic model directory.")
    .option("--json", "Print JSON output.", false)
    .action(withErrorHandling(io, async (commandOptions: { modelPath?: string; json: boolean }) => {
      const options = memory.opts<GlobalOptions>();
      const runtime = resolveRuntimeConfig(options);
      const database = openDatabase(runtime.storePath);
      const provider = createLocalTransformersEmbeddingProvider({
        ...(commandOptions.modelPath === undefined ? {} : { modelPath: commandOptions.modelPath }),
      });
      try {
        const result = await rebuildSemanticIndex({
          path: semanticIndexPathFor(runtime.storePath),
          provider,
          memories: await createService(database).list({ includeArchived: false }),
        });
        if (commandOptions.json) io.stdout(JSON.stringify(result, null, 2));
        else {
          io.stdout("Semantic index rebuilt");
          io.stdout(`Path: ${result.path}`);
          io.stdout(`Indexed memories: ${result.indexedMemories}`);
        }
      } finally {
        await provider.dispose?.();
        database.close();
      }
    }));

  semantic
    .command("clear")
    .description("Delete only the derived semantic sidecar.")
    .option("--yes", "Confirm deletion of the derived sidecar.", false)
    .action(withErrorHandling(io, async (commandOptions: { yes: boolean }) => {
      if (!commandOptions.yes) {
        throw new NuzoMemoryError("SEMANTIC_CLEAR_CONFIRMATION_REQUIRED", "Clearing the semantic sidecar requires --yes.");
      }
      const runtime = resolveRuntimeConfig(memory.opts<GlobalOptions>());
      const removed = clearSemanticIndex(semanticIndexPathFor(runtime.storePath));
      io.stdout(removed ? "Semantic index cleared" : "Semantic index already absent");
    }));

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

  return program;
}

if (isMain()) {
  process.exitCode = await runCliProcess(process.argv);
}

export async function runCliProcess(
  argv: string[],
  io: CliIO = defaultIO,
): Promise<number> {
  process.exitCode = cliExitCodes.success;
  const program = createProgram(io);

  try {
    await program.parseAsync(argv, { from: "node" });
    return process.exitCode === cliExitCodes.operationalError
      ? cliExitCodes.operationalError
      : cliExitCodes.success;
  } catch (error) {
    if (error instanceof CommanderError) {
      if (
        error.code === "commander.helpDisplayed" ||
        error.code === "commander.version"
      ) {
        return cliExitCodes.success;
      }
      return cliExitCodes.usageError;
    }

    io.stderr("NUZO_INTERNAL_ERROR: Unexpected CLI failure.");
    return cliExitCodes.internalError;
  }
}

function withErrorHandling<Args extends unknown[]>(io: CliIO, action: (...args: Args) => Promise<void>) {
  return async (...args: Args): Promise<void> => {
    try {
      await action(...args);
    } catch (error) {
      if (error instanceof NuzoMemoryError) {
        io.stderr(`${error.code}: ${error.message}`);
        process.exitCode = cliExitCodes.operationalError;
        return;
      }

      throw error;
    }
  };
}

function openDatabase(options: GlobalOptions): SQLiteMemoryDatabase;
function openDatabase(storePath: string): SQLiteMemoryDatabase;
function openDatabase(optionsOrPath: GlobalOptions | string): SQLiteMemoryDatabase {
  const storePath = typeof optionsOrPath === "string"
    ? optionsOrPath
    : resolveStorePath(optionsOrPath);
  ensureStoreDirectory(storePath);
  return new SQLiteMemoryDatabase({ path: storePath });
}

function createService(database: SQLiteMemoryDatabase, searchIndex: SearchIndex = database) {
  return createMemoryService({
    store: database,
    searchIndex,
    auditLog: database,
    clock: new SystemClock(),
    ids: new RandomIdGenerator(),
    policy: new DefaultPolicyEngine(new RegexSecretScanner()),
    transactions: database,
  });
}

function resolveStorePath(options: GlobalOptions): string {
  return resolveRuntimeConfig(options).storePath;
}

function resolveScope(options: GlobalOptions): MemoryScope {
  return resolveRuntimeConfig(options).scope;
}

function resolveRuntimeConfig(options: GlobalOptions): NuzoRuntimeConfig {
  return resolveNuzoRuntimeConfig({
    ...options,
    authorizationMode: "administrator",
  });
}

function resolveInitContext(
  options: GlobalOptions,
  commandOptions: InitCommandOptions,
): {
  configPath: string;
  configStorePath: string;
  project: boolean;
  projectRoot: string | null;
  scope: MemoryScope;
  storePath: string;
} {
  if (commandOptions.project) {
    if (options.store !== undefined) {
      throw new NuzoMemoryError(
        "MEMORY_INIT_STORE_CONFLICT",
        "Project init cannot be combined with a custom --store path.",
      );
    }

    const projectRoot = realpathSync(process.cwd());
    const nuzoRoot = join(projectRoot, ".nuzo");
    return {
      configPath: join(nuzoRoot, "config.json"),
      configStorePath: ".nuzo/memory/memories.sqlite",
      project: true,
      projectRoot,
      scope: projectScopeFromPath(projectRoot),
      storePath: join(nuzoRoot, "memory", "memories.sqlite"),
    };
  }

  const runtimeConfig = resolveRuntimeConfig(options);
  const defaultStorePath = getDefaultStorePath();
  const storePath = runtimeConfig.storePath;
  const configRoot = storePath === defaultStorePath
    ? dirname(dirname(storePath))
    : dirname(storePath);
  return {
    configPath: join(configRoot, "config.json"),
    configStorePath: storePath,
    project: false,
    projectRoot: null,
    scope: runtimeConfig.scope,
    storePath,
  };
}

function ensureStoreDirectory(storePath: string): void {
  mkdirSync(dirname(storePath), { recursive: true, mode: 0o700 });
}

function ensurePrivateDirectory(path: string): void {
  const existed = pathExists(path);
  mkdirSync(path, { recursive: true, mode: 0o700 });
  if (!existed) {
    chmodSync(path, 0o700);
  }
}

function writeConfigIfMissing(
  configPath: string,
  configStorePath: string,
  scope: MemoryScope,
  project: boolean,
): void {
  if (pathExists(configPath)) {
    return;
  }

  mkdirSync(dirname(configPath), { recursive: true, mode: 0o700 });
  writePrivateFile(
    configPath,
    `${JSON.stringify({
      version: 1,
      default_scope: scope,
      storage: {
        driver: "sqlite",
        path: configStorePath,
      },
      recall: {
        limit: 8,
        include_global: true,
      },
      privacy: {
        allow_network: false,
        record_recall_events: false,
      },
      ...(project
        ? {}
        : {
            authorization: {
              mode: "restricted",
              allowed_scopes: [
                "project:auto",
                scope,
                ...(scope === "user:default" ? [] : ["user:default"]),
              ],
            },
          }),
    }, null, 2)}\n`,
  );
}

function ensureProjectGitIgnore(projectRoot: string): void {
  const path = join(projectRoot, ".gitignore");
  const rules = [
    ".nuzo/memory/",
    ".nuzo/**/*.sqlite",
    ".nuzo/**/*.sqlite-*",
  ];
  const existing = pathExists(path) ? readFileSync(path, "utf8") : "";
  const lines = new Set(existing.split(/\r?\n/));
  const missing = rules.filter((rule) => !lines.has(rule));
  if (missing.length === 0) {
    return;
  }

  const separator = existing.length > 0 && !existing.endsWith("\n") ? "\n" : "";
  writeFileSync(path, `${existing}${separator}${missing.join("\n")}\n`, "utf8");
}

function pathExists(path: string): boolean {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
}

async function createDoctorReport(options: GlobalOptions, scanSecrets = false): Promise<DoctorReport> {
  const runtime = resolveRuntimeConfig(options);
  const storePath = runtime.storePath;
  const storeDirectory = dirname(storePath);
  const gitTracking = findTrackedMemoryFiles();
  const integrity = inspectSQLiteMemoryStore(storePath);
  const fileSafety = inspectRuntimeFileSafety({
    storePath,
    projectRoot: runtime.projectRoot,
    home: process.env.HOME ?? homedir(),
  });
  let secretScan: DoctorSecretScanReport = {
    status: "not_requested",
    scannedRecords: 0,
    flaggedRecords: 0,
    findingsByKind: {},
  };
  const warnings: string[] = [];

  if (!pathExists(storePath)) {
    warnings.push("memory store has not been initialized");
  }
  if (!pathExists(storeDirectory)) {
    warnings.push("memory store directory does not exist");
  }
  if (gitTracking.status === "tracked") {
    warnings.push(`${gitTracking.trackedFiles.length} local memory file(s) are tracked by Git`);
  }
  if (gitTracking.status === "unavailable") {
    warnings.push(`Git tracking check unavailable: ${gitTracking.reason}`);
  }
  if (pathExists(storePath) && !integrity.ok) {
    for (const error of integrity.errors) {
      warnings.push(`Memory integrity: ${error}`);
    }
  }
  if (pathExists(storePath)) {
    const database = new SQLiteMemoryDatabase({ path: storePath, readonly: true });
    try {
      const legacyProjectMemories = await database.list({
        scope: "project:auto",
        includeArchived: false,
      });
      if (legacyProjectMemories.length > 0) {
        warnings.push(
          `${legacyProjectMemories.length} active legacy project:auto memory(s) require scope review`,
        );
      }
      if (scanSecrets) secretScan = await scanActiveMemorySecrets(database);
    } finally {
      database.close();
    }
  }
  if (fileSafety.unsafe.length > 0) {
    warnings.push(`${fileSafety.unsafe.length} runtime path permission, ownership, or symlink finding(s)`);
  }
  if (fileSafety.staleArtifacts.length > 0) {
    warnings.push(`${fileSafety.staleArtifacts.length} stale runtime artifact(s) require review`);
  }
  if (fileSafety.unexpectedFiles.length > 0) {
    warnings.push(`${fileSafety.unexpectedFiles.length} unexpected file(s) exist in Nuzo runtime directories`);
  }
  if (secretScan.status === "completed" && secretScan.flaggedRecords > 0) {
    warnings.push(`${secretScan.flaggedRecords} active memory record(s) matched high-confidence secret patterns`);
  }

  return {
    storePath,
    storeExists: pathExists(storePath),
    storeDirectory,
    storeDirectoryExists: pathExists(storeDirectory),
    scope: runtime.scope,
    projectScope: runtime.projectScope,
    authorizationMode: "administrator",
    provenance: runtime.provenance,
    adjustments: runtime.adjustments,
    network: "disabled",
    gitTracking,
    integrity,
    fileSafety,
    secretScan,
    warnings,
  };
}

async function scanActiveMemorySecrets(database: SQLiteMemoryDatabase): Promise<DoctorSecretScanReport> {
  const memories = await database.list({ includeArchived: false });
  const scanner = new RegexSecretScanner();
  const findingsByKind: Record<string, number> = {};
  let flaggedRecords = 0;
  for (const memory of memories) {
    const result = await scanner.scan(memory.content);
    if (!result.ok) flaggedRecords += 1;
    for (const finding of result.findings) {
      findingsByKind[finding.kind] = (findingsByKind[finding.kind] ?? 0) + 1;
    }
  }
  return { status: "completed", scannedRecords: memories.length, flaggedRecords, findingsByKind };
}

function findTrackedMemoryFiles(cwd = process.cwd()): GitTrackingReport {
  if (process.env.NUZO_DOCTOR_SKIP_GIT === "1") {
    return {
      status: "skipped",
      reason: "NUZO_DOCTOR_SKIP_GIT=1",
      trackedFiles: [],
    };
  }

  const result = spawnSync("git", [
    "ls-files",
    "-z",
    "--",
    ".nuzo",
    "*.sqlite",
    "*.sqlite-*",
    "*.memory.export.md",
    "*.memory.export.json",
    "memories.sqlite",
    "memories.sqlite-*",
  ], {
    cwd,
    encoding: "utf8",
  });

  if (result.error) {
    return {
      status: "unavailable",
      reason: result.error.message,
      trackedFiles: [],
    };
  }

  if (result.status !== 0) {
    const reason = result.stderr.trim().split(/\r?\n/)[0] || "not a Git worktree";
    return {
      status: "unavailable",
      reason,
      trackedFiles: [],
    };
  }

  const trackedFiles = result.stdout.split("\0").filter(Boolean);
  return trackedFiles.length === 0
    ? { status: "clean", trackedFiles }
    : { status: "tracked", trackedFiles };
}

function formatGitTracking(report: GitTrackingReport): string {
  if (report.status === "skipped") {
    return `Git tracking: skipped (${report.reason})`;
  }

  if (report.status === "unavailable") {
    return `Git tracking: unavailable (${report.reason})`;
  }

  if (report.status === "tracked") {
    return `Git tracking: warning (${report.trackedFiles.length} local memory file(s) tracked)`;
  }

  return "Git tracking: clean";
}

function formatFileSafety(report: RuntimeFileSafetyReport): string {
  if (report.permissionSemantics === "not_supported") return "File safety: permission semantics not supported on this platform";
  const findings = report.unsafe.length + report.staleArtifacts.length + report.unexpectedFiles.length;
  return findings === 0
    ? `File safety: clean (${report.inspectedPaths} path(s) inspected)`
    : `File safety: warning (${findings} finding(s))`;
}

function formatSecretScan(report: DoctorSecretScanReport): string {
  return report.status === "not_requested"
    ? "Secret scan: not requested (use --scan-secrets for an explicit active-record scan)"
    : `Secret scan: ${report.flaggedRecords} flagged of ${report.scannedRecords} active record(s)`;
}

function formatIntegrityReport(report: SQLiteIntegrityReport): string {
  const lines = [
    `Store: ${report.path}`,
    `Status: ${report.ok ? "ok" : "failed"}`,
    `Schema: ${report.schemaVersion ?? "unknown"} (supported ${report.supportedSchemaVersion})`,
    `SQLite integrity: ${report.integrityCheck}`,
    `Foreign key violations: ${report.foreignKeyViolations}`,
    `Memories: ${report.memoryCount}`,
    `Active memories: ${report.activeMemoryCount}`,
    `FTS rows: ${report.ftsRowCount}`,
    `Missing FTS rows: ${report.missingFtsRows}`,
    `Orphan FTS rows: ${report.orphanFtsRows}`,
  ];
  for (const error of report.errors) {
    lines.push(`Error: ${error}`);
  }
  return lines.join("\n");
}

function toIntegrityOutput(report: SQLiteIntegrityReport) {
  return {
    ok: report.ok,
    path: report.path,
    schema_version: report.schemaVersion,
    supported_schema_version: report.supportedSchemaVersion,
    integrity_check: report.integrityCheck,
    foreign_key_violations: report.foreignKeyViolations,
    memory_count: report.memoryCount,
    active_memory_count: report.activeMemoryCount,
    fts_row_count: report.ftsRowCount,
    missing_fts_rows: report.missingFtsRows,
    orphan_fts_rows: report.orphanFtsRows,
    errors: report.errors,
  };
}

function toDoctorOutput(report: DoctorReport) {
  return {
    store_path: report.storePath,
    store_exists: report.storeExists,
    store_directory: report.storeDirectory,
    store_directory_exists: report.storeDirectoryExists,
    scope: report.scope,
    project_scope: report.projectScope,
    authorization: {
      mode: report.authorizationMode,
      source: "local_cli",
      allowed_scopes: null,
    },
    config: {
      project_root_source: report.provenance.projectRoot,
      config_source: report.provenance.config,
      store_source: report.provenance.store,
      scope_source: report.provenance.scope,
      adjustments: report.adjustments,
    },
    network: report.network,
    integrity: toIntegrityOutput(report.integrity),
    file_safety: {
      permission_semantics: report.fileSafety.permissionSemantics,
      inspected_paths: report.fileSafety.inspectedPaths,
      unsafe: report.fileSafety.unsafe.map((finding) => ({
        path: finding.path,
        type: finding.type,
        reason: finding.reason,
        actual_mode: finding.actualMode,
        expected_mode: finding.expectedMode,
      })),
      stale_artifacts: report.fileSafety.staleArtifacts,
      unexpected_files: report.fileSafety.unexpectedFiles,
    },
    secret_scan: {
      status: report.secretScan.status,
      scanned_records: report.secretScan.scannedRecords,
      flagged_records: report.secretScan.flaggedRecords,
      findings_by_kind: report.secretScan.findingsByKind,
    },
    git_tracking: report.gitTracking,
    warnings: report.warnings,
    status: report.warnings.length === 0 ? "ok" : "warning",
  };
}

function readExportDocument(path: string): MemoryExportDocument {
  let descriptor: number | null = null;
  try {
    descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const stats = fstatSync(descriptor);
    if (!stats.isFile()) {
      throw new NuzoMemoryError(
        "MEMORY_EXPORT_READ_FAILED",
        "Memory export path is not a file.",
        { path },
      );
    }
    if (stats.size > 10 * 1024 * 1024) {
      throw new NuzoMemoryError(
        "MEMORY_EXPORT_TOO_LARGE",
        "Memory export file is too large.",
        { maxBytes: 10 * 1024 * 1024, path },
      );
    }
    return JSON.parse(readFileSync(descriptor, "utf8")) as MemoryExportDocument;
  } catch (error) {
    if (error instanceof NuzoMemoryError) {
      throw error;
    }
    if (error instanceof SyntaxError) {
      throw new NuzoMemoryError("MEMORY_EXPORT_INVALID", "Memory export JSON is invalid.", {
        path,
      });
    }
    throw new NuzoMemoryError("MEMORY_EXPORT_READ_FAILED", "Memory export file could not be read.", {
      path,
    });
  } finally {
    if (descriptor !== null) closeSync(descriptor);
  }
}

function formatExportDocument(document: MemoryExportDocument, format: ExportFormat): string {
  if (format === "markdown") {
    return formatMemoryExportMarkdown(document);
  }

  return `${JSON.stringify(document, null, 2)}\n`;
}

function formatCaptureSuggestion(
  suggestion: CaptureSuggestionResult,
  json: boolean,
): string {
  const output = toCaptureSuggestionOutput(suggestion);
  if (json) {
    return JSON.stringify(output, null, 2);
  }

  const lines = [
    `Status: ${output.status}`,
    "Memory writes: no",
    "Requires confirmation: yes",
    `Content: ${output.draft.content}`,
    `Kind: ${output.draft.kind}`,
    `Scope: ${output.draft.scope}`,
    `Tags: ${output.draft.tags.length > 0 ? output.draft.tags.join(", ") : "none"}`,
    `Source: ${output.draft.source}`,
    `Confidence: ${output.draft.confidence}`,
    `Reason: ${output.draft.reason}`,
  ];
  if (output.duplicate !== null) {
    lines.push(`Duplicate: ${output.duplicate.id}`);
  }
  if ("relationship_mode" in output && output.relationship_mode === "bounded") {
    lines.push(`Relationship: ${output.relationship}`);
    lines.push(`Relationship reason: ${output.relationship_evidence.reason}`);
    if (output.relationship_evidence.primary_memory_id !== null) {
      lines.push(`Primary memory: ${output.relationship_evidence.primary_memory_id}`);
    }
  }

  return lines.join("\n");
}

function toCaptureSuggestionOutput(suggestion: CaptureSuggestionResult) {
  const output = {
    status: suggestion.status,
    memory_writes: false,
    requires_confirmation: true,
    draft: {
      content: suggestion.draft.content,
      kind: suggestion.draft.kind,
      scope: suggestion.draft.scope,
      tags: suggestion.draft.tags,
      source: suggestion.draft.source,
      confidence: suggestion.draft.confidence,
      reason: suggestion.draft.reason,
    },
    duplicate: suggestion.duplicate ? toCliMemoryRecord(suggestion.duplicate) : null,
  };
  if (suggestion.relationshipMode === "bounded" && suggestion.relationship && suggestion.relationshipEvidence) {
    return {
      ...output,
      relationship_mode: suggestion.relationshipMode,
      relationship: suggestion.relationship,
      relationship_evidence: {
        version: suggestion.relationshipEvidence.version,
        primary_memory_id: suggestion.relationshipEvidence.primaryMemoryId,
        candidate_limit: suggestion.relationshipEvidence.candidateLimit,
        returned_limit: suggestion.relationshipEvidence.returnedLimit,
        evaluated_count: suggestion.relationshipEvidence.evaluatedCount,
        search_exhaustive: suggestion.relationshipEvidence.searchExhaustive,
        evidence_truncated: suggestion.relationshipEvidence.evidenceTruncated,
        reason: suggestion.relationshipEvidence.reason,
        candidates: suggestion.relationshipEvidence.candidates.map((candidate) => ({
          memory: toCliMemoryRecord(candidate.memory),
          matched_terms: candidate.matchedTerms,
          matched_tags: candidate.matchedTags,
          reason: candidate.reason,
        })),
      },
    };
  }
  return output;
}

function formatConfirmCapture(
  result: ConfirmCaptureResult,
  json: boolean,
): string {
  const output = toConfirmCaptureOutput(result);
  if (json) {
    return JSON.stringify(output, null, 2);
  }

  const lines = [
    `Decision: ${output.decision}`,
    `Status: ${output.status}`,
    `Memory writes: ${output.memory_writes ? "yes" : "no"}`,
    "Requires confirmation: no",
    `Reason: ${output.reason}`,
  ];
  if (output.memory !== null) {
    lines.push(`Memory: ${output.memory.id}`);
  }
  return lines.join("\n");
}

function toConfirmCaptureOutput(result: ConfirmCaptureResult) {
  return {
    decision: result.decision,
    status: result.status,
    memory_writes: result.memoryWrites,
    requires_confirmation: false,
    reason: result.reason,
    memory: result.memory ? toCliMemoryRecord(result.memory) : null,
  };
}

function toCliMemoryRecord(memory: MemoryRecord) {
  return {
    id: memory.id,
    revision: memory.revision,
    content: memory.content,
    kind: memory.kind,
    scope: memory.scope,
    tags: memory.tags,
    source: memory.source,
    confidence: memory.confidence,
    created_at: memory.createdAt.toISOString(),
    updated_at: memory.updatedAt.toISOString(),
    last_used_at: memory.lastUsedAt?.toISOString() ?? null,
    archived_at: memory.archivedAt?.toISOString() ?? null,
  };
}

function formatAuditEvent(event: MemoryEvent): string {
  return [
    event.createdAt.toISOString(),
    event.id,
    event.memoryId ?? "global",
    event.eventType,
    event.actor,
    JSON.stringify(event.payload),
  ].join("\t");
}

function inferExportFormat(path?: string): ExportFormat {
  if (path?.toLowerCase().endsWith(".md")) {
    return "markdown";
  }

  return "json";
}

function parseExportFormat(value: string): ExportFormat {
  if (value === "json" || value === "markdown") {
    return value;
  }

  throw new InvalidArgumentError("Expected export format to be json or markdown.");
}

function parsePositiveInteger(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new InvalidArgumentError("Expected a positive integer.");
  }
  return parsed;
}

function parseIsoDate(value: string, field: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new InvalidArgumentError(`Expected ${field} to be an ISO timestamp.`);
  }
  return parsed;
}

function parseAuditEventType(value: string, previous: MemoryEvent["eventType"][] = []): MemoryEvent["eventType"][] {
  if (!memoryEventTypes.includes(value as MemoryEvent["eventType"])) {
    throw new InvalidArgumentError(`Expected audit event type to be one of: ${memoryEventTypes.join(", ")}.`);
  }
  return [...previous, value as MemoryEvent["eventType"]];
}

function parseConfidence(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new InvalidArgumentError("Expected a number between 0 and 1.");
  }
  return parsed;
}

function parseRelationshipMode(value: string): "exact" | "bounded" {
  if (value === "exact" || value === "bounded") {
    return value;
  }
  throw new InvalidArgumentError("Expected relationship mode to be exact or bounded.");
}

export function setupHostsFromOptions(
  options: SetupCommandOptions,
  detected: Record<HostBootstrapHost, boolean>,
  io: CliIO = defaultIO,
): HostBootstrapHost[] {
  const hosts = hostsFromTargetOptions(options, "HOST_BOOTSTRAP_TARGET_CONFLICT");
  if (hosts.length > 0) return hosts;
  const defaults = defaultSetupHosts(detected);
  if (options.dryRun || options.json || options.yes || defaults.length < 2) return defaults;
  return chooseSetupHostsInteractively(defaults, io);
}

function updateHostsFromOptions(options: HostTargetCommandOptions): HostBootstrapHost[] {
  const hosts = hostsFromTargetOptions(options, "HOST_UPDATE_TARGET_CONFLICT");
  return hosts.length > 0 ? hosts : supportedHostBootstrapHosts();
}

function hostsFromTargetOptions(
  options: Pick<HostTargetCommandOptions, "all" | "claudeCode" | "codex">,
  conflictCode: string,
): HostBootstrapHost[] {
  const selected: HostBootstrapHost[] = [];
  if (options.codex) selected.push("codex");
  if (options.claudeCode) selected.push("claude-code");

  if (options.all && selected.length > 0) {
    throw new NuzoMemoryError(
      conflictCode,
      "Use --codex, --claude-code, or --all, not multiple target styles.",
    );
  }

  if (options.all) return supportedHostBootstrapHosts();
  return selected;
}

function chooseSetupHostsInteractively(
  hosts: HostBootstrapHost[],
  io: CliIO,
): HostBootstrapHost[] {
  const choices = hosts.filter((host) => host === "codex" || host === "claude-code");
  if (choices.length < 2) return hosts;

  io.stdout([
    "Nuzo detected multiple supported hosts.",
    "Choose which host plugins to configure:",
    "  1) Codex",
    "  2) Claude Code",
    "  3) Both",
    "Selection [3]:",
  ].join("\n"));
  const answer = (io.readStdin?.() ?? readLineFromStdin()).trim().toLowerCase();
  if (answer === "" || answer === "3" || answer === "both" || answer === "all") return choices;
  if (answer === "1" || answer === "codex") return ["codex"];
  if (answer === "2" || answer === "claude" || answer === "claude-code") return ["claude-code"];
  throw new NuzoMemoryError(
    "HOST_BOOTSTRAP_TARGET_INVALID",
    "Choose 1 for Codex, 2 for Claude Code, or 3 for both.",
  );
}

function parseRetrievalMode(value: string): RetrievalMode {
  if (value !== "fts" && value !== "semantic" && value !== "hybrid") {
    throw new InvalidArgumentError("Retrieval mode must be fts, semantic, or hybrid.");
  }
  return value;
}

function readLineFromStdin(): string {
  const chunks: Buffer[] = [];
  const buffer = Buffer.alloc(1);
  while (true) {
    const bytesRead = readSync(0, buffer, 0, 1, null);
    if (bytesRead === 0) break;
    chunks.push(Buffer.from(buffer.subarray(0, bytesRead)));
    if (buffer[0] === 10) break;
  }
  return Buffer.concat(chunks).toString("utf8");
}

function parseSemanticFallback(value: string): SemanticFallbackMode {
  if (value !== "error" && value !== "fts") {
    throw new InvalidArgumentError("Semantic fallback must be error or fts.");
  }
  return value;
}

function parseConfirmCaptureDecision(value: string): ConfirmCaptureDecision {
  if (
    value === "create" ||
    value === "update" ||
    value === "keep_separate" ||
    value === "clarify" ||
    value === "reject"
  ) {
    return value;
  }
  throw new InvalidArgumentError(
    "Expected capture decision to be create, update, keep_separate, clarify, or reject.",
  );
}

function isMain(): boolean {
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

function writePrivateFile(path: string, content: string): void {
  writeFileSync(path, content, {
    encoding: "utf8",
    mode: 0o600,
  });
  chmodSync(path, 0o600);
}
