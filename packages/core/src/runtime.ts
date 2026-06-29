import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { NuzoMemoryError } from "./errors.js";
import type { Clock, IdGenerator } from "./ports.js";
import { memoryLimits, memoryScopePattern } from "./policy.js";
import type { MemoryScope } from "./types.js";

export interface NuzoConfig {
  version: 1;
  default_scope: MemoryScope;
  storage: {
    driver: "sqlite";
    path: string;
  };
  recall: {
    limit: number;
    include_global: boolean;
  };
  privacy: {
    allow_network: false;
    record_recall_events: boolean;
  };
}

export interface NuzoRuntimeConfigOptions {
  store?: string;
  scope?: MemoryScope;
  cwd?: string;
  home?: string;
  environment?: Record<string, string | undefined>;
}

export interface NuzoRuntimeConfig {
  storePath: string;
  scope: MemoryScope;
  authorizedScopes?: readonly MemoryScope[];
  recall: {
    limit: number;
    includeGlobal: boolean;
  };
  privacy: {
    recordRecallEvents: boolean;
  };
}

export function getDefaultStorePath(home: string = homedir()): string {
  return resolve(home, ".nuzo", "memory", "memories.sqlite");
}

export function resolveNuzoRuntimeConfig(options: NuzoRuntimeConfigOptions = {}): NuzoRuntimeConfig {
  const home = options.home ?? homedir();
  const cwd = options.cwd ?? process.cwd();
  const environment = options.environment ?? process.env;
  const projectConfig = readProjectConfig(cwd);
  const activeConfig = projectConfig ?? readUserConfig(home);
  const storeOption = options.store ?? environment.NUZO_MEMORY_STORE;
  const scopeOption = options.scope ?? readEnvironmentScope(environment);
  const authorizedScopes = readEnvironmentAuthorizedScopes(environment);
  const config: NuzoRuntimeConfig = {
    storePath: storeOption !== undefined
      ? resolve(storeOption)
      : activeConfig?.storage.path ?? getDefaultStorePath(home),
    scope: resolveAutomaticScope(scopeOption ?? activeConfig?.default_scope ?? "user:default", cwd),
    recall: {
      limit: activeConfig?.recall.limit ?? 8,
      includeGlobal: activeConfig?.recall.include_global ?? false,
    },
    privacy: {
      recordRecallEvents: activeConfig?.privacy.record_recall_events ?? false,
    },
  };
  if (authorizedScopes !== undefined) {
    config.authorizedScopes = [
      ...new Set(authorizedScopes.map((scope) => resolveAutomaticScope(scope, cwd))),
    ];
  }
  return config;
}

export function resolveAutomaticScope(scope: MemoryScope, cwd: string = process.cwd()): MemoryScope {
  return scope === "project:auto"
    ? projectScopeFromPath(realpathSync(cwd))
    : scope;
}

export function projectScopeFromPath(path: string): `project:${string}` {
  const resolvedPath = resolve(path);
  let normalizedPath = resolvedPath;
  try {
    normalizedPath = realpathSync.native(resolvedPath);
  } catch {
    // Host project paths can be supplied before the directory exists.
  }
  const digest = createHash("sha256").update(normalizedPath).digest("hex").slice(0, 16);
  return `project:${digest}`;
}

function readEnvironmentScope(environment: Record<string, string | undefined>): MemoryScope | undefined {
  const scope = environment.NUZO_MEMORY_SCOPE;
  if (scope === undefined || scope.trim().length === 0) {
    return undefined;
  }
  assertScope(scope, "NUZO_MEMORY_SCOPE");
  return scope as MemoryScope;
}

function readEnvironmentAuthorizedScopes(
  environment: Record<string, string | undefined>,
): readonly MemoryScope[] | undefined {
  const raw = environment.NUZO_AUTHORIZED_SCOPES;
  if (raw === undefined || raw.trim().length === 0) {
    return undefined;
  }
  const scopes = raw.split(",").map((scope) => scope.trim()).filter((scope) => scope.length > 0);
  if (scopes.length === 0) {
    return undefined;
  }
  for (const scope of scopes) {
    assertScope(scope, "NUZO_AUTHORIZED_SCOPES");
  }
  return [...new Set(scopes)] as MemoryScope[];
}

function assertScope(scope: string, source: string): void {
  if (scope.length > memoryLimits.scopeLength || !memoryScopePattern.test(scope)) {
    throw new NuzoMemoryError(
      "MEMORY_CONFIG_INVALID",
      `${source} contains an invalid Nuzo memory scope.`,
      { scope },
    );
  }
}

function readUserConfig(home: string): NuzoConfig | null {
  const configPath = join(home, ".nuzo", "config.json");
  if (!existsSync(configPath)) {
    return null;
  }
  return parseConfig(configPath, false, home);
}

function readProjectConfig(cwd: string): NuzoConfig | null {
  const projectRoot = realpathSync(cwd);
  const configPath = join(projectRoot, ".nuzo", "config.json");
  if (!existsSync(configPath)) {
    return null;
  }

  const nuzoRoot = join(projectRoot, ".nuzo");
  const storeDirectory = join(nuzoRoot, "memory");
  const storePath = join(storeDirectory, "memories.sqlite");
  assertProjectPathIsLocal(nuzoRoot, nuzoRoot, configPath);
  assertProjectPathIsLocal(configPath, nuzoRoot, configPath);
  if (existsSync(storeDirectory)) {
    assertProjectPathIsLocal(storeDirectory, nuzoRoot, configPath);
  }
  if (existsSync(storePath)) {
    assertProjectPathIsLocal(storePath, nuzoRoot, configPath);
  }

  return parseConfig(configPath, true, homedir(), storePath);
}

function parseConfig(
  configPath: string,
  project: boolean,
  home: string,
  projectStorePath?: string,
): NuzoConfig {
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(configPath, "utf8"));
  } catch {
    throw new NuzoMemoryError(
      "MEMORY_CONFIG_INVALID",
      "Nuzo config is not valid JSON.",
      { path: configPath },
    );
  }

  if (
    !isRecord(value) ||
    value.version !== 1 ||
    typeof value.default_scope !== "string" ||
    value.default_scope.length > memoryLimits.scopeLength ||
    !memoryScopePattern.test(value.default_scope) ||
    !isRecord(value.storage) ||
    value.storage.driver !== "sqlite" ||
    typeof value.storage.path !== "string" ||
    (project && value.storage.path !== ".nuzo/memory/memories.sqlite") ||
    (!project &&
      !isAbsolute(value.storage.path) &&
      !value.storage.path.startsWith("~/"))
  ) {
    throwConfigShape(configPath);
  }

  const recall = value.recall === undefined
    ? { limit: 8, include_global: false }
    : parseRecallConfig(value.recall, configPath);
  const privacy = value.privacy === undefined
    ? { allow_network: false as const, record_recall_events: false }
    : parsePrivacyConfig(value.privacy, configPath);

  return {
    version: 1,
    default_scope: value.default_scope as MemoryScope,
    storage: {
      driver: "sqlite",
      path: project ? projectStorePath! : resolveUserStoragePath(value.storage.path, home),
    },
    recall,
    privacy,
  };
}

function resolveUserStoragePath(path: string, home: string): string {
  return path.startsWith("~/")
    ? resolve(home, path.slice(2))
    : resolve(path);
}

function parseRecallConfig(
  value: unknown,
  configPath: string,
): NuzoConfig["recall"] {
  if (
    !isRecord(value) ||
    typeof value.limit !== "number" ||
    !Number.isInteger(value.limit) ||
    value.limit < 1 ||
    value.limit > 50 ||
    typeof value.include_global !== "boolean"
  ) {
    throwConfigShape(configPath);
  }
  return {
    limit: value.limit,
    include_global: value.include_global,
  };
}

function parsePrivacyConfig(
  value: unknown,
  configPath: string,
): NuzoConfig["privacy"] {
  if (
    !isRecord(value) ||
    value.allow_network !== false ||
    typeof value.record_recall_events !== "boolean"
  ) {
    throwConfigShape(configPath);
  }
  return {
    allow_network: false,
    record_recall_events: value.record_recall_events,
  };
}

function throwConfigShape(configPath: string): never {
  throw new NuzoMemoryError(
    "MEMORY_CONFIG_INVALID",
    "Nuzo config has an unsupported shape.",
    { path: configPath },
  );
}

function assertProjectPathIsLocal(path: string, nuzoRoot: string, configPath: string): void {
  let resolvedPath: string;
  let resolvedRoot: string;
  try {
    resolvedPath = realpathSync(path);
    resolvedRoot = realpathSync(nuzoRoot);
  } catch {
    throw new NuzoMemoryError(
      "MEMORY_CONFIG_INVALID",
      "Project Nuzo config resolves through an invalid local path.",
      { path: configPath },
    );
  }

  const relativePath = relative(resolvedRoot, resolvedPath);
  if (
    relativePath === ".." ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  ) {
    throw new NuzoMemoryError(
      "MEMORY_CONFIG_INVALID",
      "Project Nuzo config must keep storage inside the project .nuzo directory.",
      { path: configPath },
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

export class RandomIdGenerator implements IdGenerator {
  memoryId(): string {
    return `mem_${randomUUID()}`;
  }

  eventId(): string {
    return `evt_${randomUUID()}`;
  }
}
