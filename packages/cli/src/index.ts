#!/usr/bin/env node
import { mkdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { Command } from "commander";
import {
  createMemoryService,
  DefaultPolicyEngine,
  RandomIdGenerator,
  RegexSecretScanner,
  SQLiteMemoryDatabase,
  SystemClock,
  type MemoryKind,
  type ListMemoriesInput,
  type MemoryScope,
  type ForgetMemoryInput,
} from "@nuzo/memory-core";

const defaultStorePath = resolve(homedir(), ".nuzo", "memory", "memories.sqlite");

interface GlobalOptions {
  store?: string;
  scope?: MemoryScope;
}

const program = new Command();

program
  .name("nuzo")
  .description("Local-first, auditable memory for AI agents.")
  .version("0.0.0");

const memory = program.command("memory").description("Manage local Nuzo Memory stores.");

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
    console.log("Nuzo Memory initialized");
    console.log(`Store: ${storePath}`);
    console.log(`Scope: ${options.scope ?? "user:default"}`);
    console.log("Network: disabled");
  });

memory
  .command("remember")
  .description("Store a memory.")
  .argument("<content>", "Memory content.")
  .requiredOption("--kind <kind>", "Memory kind.")
  .option("--tag <tag...>", "Memory tag. Can be used multiple times.")
  .option("--source <source>", "Memory source.", "nuzo:cli")
  .action(async (content: string, commandOptions: { kind: MemoryKind; tag?: string[]; source: string }) => {
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
      console.log(saved.id);
    } finally {
      database.close();
    }
  });

memory
  .command("recall")
  .description("Recall relevant memories.")
  .argument("<query>", "Recall query.")
  .option("--limit <number>", "Maximum number of results.", parsePositiveInteger, 8)
  .option("--include-global", "Include user:default alongside the selected scope.", false)
  .action(async (query: string, commandOptions: { limit: number; includeGlobal: boolean }) => {
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
        console.log(`${result.memory.id}\t${result.score.toPrecision(4)}\t${result.memory.content}`);
      }
    } finally {
      database.close();
    }
  });

memory
  .command("list")
  .description("List memories.")
  .option("--tag <tag...>", "Filter by tag.")
  .option("--include-archived", "Include archived memories.", false)
  .action(async (commandOptions: { tag?: string[]; includeArchived: boolean }) => {
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
        console.log(`${item.id}\t${item.kind}${archived}\t${item.content}`);
      }
    } finally {
      database.close();
    }
  });

memory
  .command("forget")
  .description("Archive or delete a memory.")
  .argument("<id>", "Memory ID.")
  .option("--delete", "Hard delete instead of archive.", false)
  .option("--yes", "Confirm hard delete.", false)
  .option("--reason <reason>", "Reason for forgetting.")
  .action(async (id: string, commandOptions: { delete: boolean; yes: boolean; reason?: string }) => {
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
      console.log(commandOptions.delete ? "Deleted" : "Archived");
    } finally {
      database.close();
    }
  });

memory
  .command("doctor")
  .description("Check the local memory environment.")
  .action(() => {
    const options = memory.opts<GlobalOptions>();
    const storePath = resolveStorePath(options);
    const exists = pathExists(storePath);
    console.log(`Store: ${storePath}`);
    console.log(`Exists: ${exists ? "yes" : "no"}`);
    console.log(`Scope: ${options.scope ?? "user:default"}`);
    console.log("Network: disabled");
  });

await program.parseAsync();

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

function parsePositiveInteger(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error("Expected a positive integer.");
  }
  return parsed;
}
