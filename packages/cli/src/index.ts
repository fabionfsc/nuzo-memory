#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Command, CommanderError, InvalidArgumentError } from "commander";
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
  type ForgetMemoriesInput,
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

interface InitCommandOptions {
  project: boolean;
}

interface NuzoConfig {
  version: 1;
  default_scope: MemoryScope;
  storage: {
    driver: "sqlite";
    path: string;
  };
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
    .version("0.0.0");

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
        mkdirSync(join(dirname(init.storePath), "exports"), { recursive: true });
        mkdirSync(join(dirname(init.storePath), "logs"), { recursive: true });
      }
      writeConfigIfMissing(
        init.configPath,
        init.configStorePath,
        init.scope,
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
          scope: resolveScope(options),
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
          scope: resolveScope(options),
        };
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
          forgetInput.scope = commandOptions.scope;
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
    .action(withErrorHandling(io, async () => {
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
    transactions: database,
  });
}

function resolveStorePath(options: GlobalOptions): string {
  if (options.store !== undefined) {
    return resolve(options.store);
  }
  return readProjectConfig()?.storage.path ?? defaultStorePath;
}

function resolveScope(options: GlobalOptions): MemoryScope {
  if (options.scope !== undefined) {
    return options.scope;
  }
  return readProjectConfig()?.default_scope ?? "user:default";
}

function readProjectConfig(): NuzoConfig | null {
  const projectRoot = realpathSync(process.cwd());
  const configPath = join(projectRoot, ".nuzo", "config.json");
  if (!pathExists(configPath)) {
    return null;
  }

  let value: unknown;
  try {
    value = JSON.parse(readFileSync(configPath, "utf8"));
  } catch {
    throw new NuzoMemoryError(
      "MEMORY_CONFIG_INVALID",
      "Project Nuzo config is not valid JSON.",
      { path: configPath },
    );
  }

  if (
    !isRecord(value) ||
    value.version !== 1 ||
    typeof value.default_scope !== "string" ||
    !isRecord(value.storage) ||
    value.storage.driver !== "sqlite" ||
    typeof value.storage.path !== "string"
  ) {
    throw new NuzoMemoryError(
      "MEMORY_CONFIG_INVALID",
      "Project Nuzo config has an unsupported shape.",
      { path: configPath },
    );
  }

  return {
    version: 1,
    default_scope: value.default_scope as MemoryScope,
    storage: {
      driver: "sqlite",
      path: resolve(projectRoot, value.storage.path),
    },
  };
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
      scope: projectScope(projectRoot),
      storePath: join(nuzoRoot, "memory", "memories.sqlite"),
    };
  }

  const storePath = resolve(options.store ?? defaultStorePath);
  const configRoot = storePath === defaultStorePath
    ? dirname(dirname(storePath))
    : dirname(storePath);
  return {
    configPath: join(configRoot, "config.json"),
    configStorePath: storePath,
    project: false,
    projectRoot: null,
    scope: options.scope ?? "user:default",
    storePath,
  };
}

function projectScope(projectRoot: string): MemoryScope {
  const digest = createHash("sha256").update(projectRoot).digest("hex").slice(0, 16);
  return `project:${digest}`;
}

function ensureStoreDirectory(storePath: string): void {
  mkdirSync(dirname(storePath), { recursive: true });
}

function writeConfigIfMissing(
  configPath: string,
  configStorePath: string,
  scope: MemoryScope,
): void {
  if (pathExists(configPath)) {
    return;
  }

  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(
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
    }, null, 2)}\n`,
    "utf8",
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
    scope: resolveScope(options),
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

  throw new InvalidArgumentError("Expected export format to be json or markdown.");
}

function parsePositiveInteger(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new InvalidArgumentError("Expected a positive integer.");
  }
  return parsed;
}

function parseConfidence(value: string): number {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new InvalidArgumentError("Expected a number between 0 and 1.");
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
