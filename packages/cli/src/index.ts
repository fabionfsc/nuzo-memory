#!/usr/bin/env node
import { mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import {
  createMemoryService,
  DefaultPolicyEngine,
  formatMemoryExportMarkdown,
  NuzoMemoryError,
  RandomIdGenerator,
  RegexSecretScanner,
  SQLiteMemoryDatabase,
  SystemClock,
  type MemoryKind,
  type ListMemoriesInput,
  type MemoryScope,
  type ForgetMemoryInput,
  type UpdateMemoryInput,
  type MemoryExportDocument,
  type ExportMemoriesInput,
  type ImportMemoriesInput,
} from "@nuzo/memory-core";

const defaultStorePath = resolve(homedir(), ".nuzo", "memory", "memories.sqlite");

export interface CliIO {
  stdout(message: string): void;
  stderr(message: string): void;
}

const defaultIO: CliIO = {
  stdout: (message) => console.log(message),
  stderr: (message) => console.error(message),
};

interface GlobalOptions {
  store?: string;
  scope?: MemoryScope;
}

interface DoctorReport {
  storePath: string;
  storeExists: boolean;
  storeDirectory: string;
  storeDirectoryExists: boolean;
  scope: MemoryScope;
  network: "disabled";
  gitTracking: GitTrackingReport;
  warnings: string[];
}

type GitTrackingReport =
  | { status: "clean"; trackedFiles: string[] }
  | { status: "tracked"; trackedFiles: string[] }
  | { status: "unavailable"; reason: string; trackedFiles: [] }
  | { status: "skipped"; reason: string; trackedFiles: [] };

type ExportFormat = "json" | "markdown";

export function createProgram(io: CliIO = defaultIO): Command {
  const program = new Command();

  program
    .name("nuzo")
    .description("Local-first, auditable memory for AI agents.")
    .version("0.0.0");

  const memory = program.command("memory").description("Manage local Nuzo stores.");

  memory
    .option("--store <path>", "Path to the SQLite memory store.", defaultStorePath)
    .option("--scope <scope>", "Memory scope.", "user:default");

  memory
    .command("init")
    .description("Initialize the local memory store.")
    .action(() => {
      const options = memory.opts<GlobalOptions>();
      const storePath = resolveStorePath(options);
      ensureStoreDirectory(storePath);
      const database = new SQLiteMemoryDatabase({ path: storePath });
      database.close();
      io.stdout("Nuzo initialized");
      io.stdout(`Store: ${storePath}`);
      io.stdout(`Scope: ${options.scope ?? "user:default"}`);
      io.stdout("Network: disabled");
    });

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
          scope: options.scope ?? "user:default",
          tags: commandOptions.tag ?? [],
          source: commandOptions.source,
        });
        io.stdout(saved.id);
      } finally {
        database.close();
      }
    }));

  memory
    .command("recall")
    .description("Recall relevant memories.")
    .argument("<query>", "Recall query.")
    .option("--limit <number>", "Maximum number of results.", parsePositiveInteger, 8)
    .option("--include-global", "Include user:default alongside the selected scope.", false)
    .action(withErrorHandling(io, async (query: string, commandOptions: { limit: number; includeGlobal: boolean }) => {
      const options = memory.opts<GlobalOptions>();
      const database = openDatabase(options);
      try {
        const service = createService(database);
        const results = await service.recall({
          query,
          scope: options.scope ?? "user:default",
          limit: commandOptions.limit,
          includeGlobal: commandOptions.includeGlobal,
        });

        for (const result of results) {
          io.stdout(`${result.memory.id}\t${result.score.toPrecision(4)}\t${result.memory.content}`);
        }
      } finally {
        database.close();
      }
    }));

  memory
    .command("list")
    .description("List memories.")
    .option("--tag <tag...>", "Filter by tag.")
    .option("--include-archived", "Include archived memories.", false)
    .action(withErrorHandling(io, async (commandOptions: { tag?: string[]; includeArchived: boolean }) => {
      const options = memory.opts<GlobalOptions>();
      const database = openDatabase(options);
      try {
        const service = createService(database);
        const listInput: ListMemoriesInput = {
          includeArchived: commandOptions.includeArchived,
        };
        if (options.scope) {
          listInput.scope = options.scope;
        }
        if (commandOptions.tag) {
          listInput.tags = commandOptions.tag;
        }

        const memories = await service.list(listInput);

        for (const item of memories) {
          const archived = item.archivedAt ? " archived" : "";
          io.stdout(`${item.id}\t${item.kind}${archived}\t${item.content}`);
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
    .action(withErrorHandling(io, async (
      id: string,
      commandOptions: {
        content?: string;
        kind?: MemoryKind;
        scope?: MemoryScope;
        tag?: string[];
        confidence?: number;
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
        if (commandOptions.content !== undefined) {
          updateInput.content = commandOptions.content;
        }
        if (commandOptions.kind !== undefined) {
          updateInput.kind = commandOptions.kind;
        }
        if (commandOptions.scope !== undefined) {
          updateInput.scope = commandOptions.scope;
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
    .action(withErrorHandling(io, async (id: string, commandOptions: { archive: boolean; delete: boolean; yes: boolean; reason?: string }) => {
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
          scope: options.scope ?? "user:default",
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
          writeFileSync(exportPath, output, "utf8");
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
          importInput.scope = commandOptions.scope;
        }

        const result = await service.importMemories(importInput);
        const skipped = result.skipped > 0 ? `, skipped ${result.skipped}` : "";
        io.stdout(`${result.dryRun ? "Would import" : "Imported"} ${result.imported} memories${skipped}`);
      } finally {
        database.close();
      }
    }));

  memory
    .command("doctor")
    .description("Check the local memory environment.")
    .action(() => {
      const options = memory.opts<GlobalOptions>();
      const report = createDoctorReport(options);
      io.stdout(`Store: ${report.storePath}`);
      io.stdout(`Store exists: ${report.storeExists ? "yes" : "no"}`);
      io.stdout(`Store directory: ${report.storeDirectory}`);
      io.stdout(`Store directory exists: ${report.storeDirectoryExists ? "yes" : "no"}`);
      io.stdout(`Scope: ${report.scope}`);
      io.stdout(`Network: ${report.network}`);
      io.stdout(formatGitTracking(report.gitTracking));
      if (report.gitTracking.status === "tracked") {
        for (const trackedFile of report.gitTracking.trackedFiles) {
          io.stdout(`Tracked memory file: ${trackedFile}`);
        }
      }
      for (const warning of report.warnings) {
        io.stdout(`Warning: ${warning}`);
      }
      io.stdout(`Status: ${report.warnings.length === 0 ? "ok" : "warning"}`);
    });

  return program;
}

if (isMain()) {
  await createProgram().parseAsync();
}

function withErrorHandling<Args extends unknown[]>(io: CliIO, action: (...args: Args) => Promise<void>) {
  return async (...args: Args): Promise<void> => {
    try {
      await action(...args);
    } catch (error) {
      if (error instanceof NuzoMemoryError) {
        io.stderr(`${error.code}: ${error.message}`);
        process.exitCode = 1;
        return;
      }

      throw error;
    }
  };
}

function openDatabase(options: GlobalOptions): SQLiteMemoryDatabase {
  const storePath = resolveStorePath(options);
  ensureStoreDirectory(storePath);
  return new SQLiteMemoryDatabase({ path: storePath });
}

function createService(database: SQLiteMemoryDatabase) {
  return createMemoryService({
    store: database,
    searchIndex: database,
    auditLog: database,
    clock: new SystemClock(),
    ids: new RandomIdGenerator(),
    policy: new DefaultPolicyEngine(new RegexSecretScanner()),
  });
}

function resolveStorePath(options: GlobalOptions): string {
  return resolve(options.store ?? defaultStorePath);
}

function ensureStoreDirectory(storePath: string): void {
  mkdirSync(dirname(storePath), { recursive: true });
}

function pathExists(path: string): boolean {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
}

function createDoctorReport(options: GlobalOptions): DoctorReport {
  const storePath = resolveStorePath(options);
  const storeDirectory = dirname(storePath);
  const gitTracking = findTrackedMemoryFiles();
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

  return {
    storePath,
    storeExists: pathExists(storePath),
    storeDirectory,
    storeDirectoryExists: pathExists(storeDirectory),
    scope: options.scope ?? "user:default",
    network: "disabled",
    gitTracking,
    warnings,
  };
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

function readExportDocument(path: string): MemoryExportDocument {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as MemoryExportDocument;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new NuzoMemoryError("MEMORY_EXPORT_INVALID", "Memory export JSON is invalid.", {
        path,
      });
    }
    throw error;
  }
}

function formatExportDocument(document: MemoryExportDocument, format: ExportFormat): string {
  if (format === "markdown") {
    return formatMemoryExportMarkdown(document);
  }

  return `${JSON.stringify(document, null, 2)}\n`;
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

  throw new Error("Expected export format to be json or markdown.");
}

function parsePositiveInteger(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error("Expected a positive integer.");
  }
  return parsed;
}

function parseConfidence(value: string): number {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new Error("Expected a number between 0 and 1.");
  }
  return parsed;
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
