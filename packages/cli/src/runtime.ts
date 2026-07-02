import {
  createMemoryService,
  DefaultPolicyEngine,
  RandomIdGenerator,
  RegexSecretScanner,
  resolveNuzoRuntimeConfig,
  SQLiteMemoryDatabase,
  SystemClock,
  type MemoryScope,
  type NuzoRuntimeConfig,
  type SearchIndex,
} from "@nuzo/memory-core";
import { ensureStoreDirectory } from "./filesystem.js";

export interface GlobalOptions {
  store?: string;
  scope?: MemoryScope;
}

export function openDatabase(options: GlobalOptions): SQLiteMemoryDatabase;
export function openDatabase(storePath: string): SQLiteMemoryDatabase;
export function openDatabase(optionsOrPath: GlobalOptions | string): SQLiteMemoryDatabase {
  const storePath = typeof optionsOrPath === "string"
    ? optionsOrPath
    : resolveStorePath(optionsOrPath);
  ensureStoreDirectory(storePath);
  return new SQLiteMemoryDatabase({ path: storePath });
}

export function createService(database: SQLiteMemoryDatabase, searchIndex: SearchIndex = database) {
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

export function resolveStorePath(options: GlobalOptions): string {
  return resolveRuntimeConfig(options).storePath;
}

export function resolveScope(options: GlobalOptions): MemoryScope {
  return resolveRuntimeConfig(options).scope;
}

export function resolveRuntimeConfig(options: GlobalOptions): NuzoRuntimeConfig {
  return resolveNuzoRuntimeConfig({ ...options, authorizationMode: "administrator" });
}
