import { existsSync, readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { NuzoMemoryError } from "./errors.js";
import { memoryLimits, memoryScopePattern } from "./policy.js";
import type { NuzoAuthorizationConfig, NuzoConfig } from "./runtime.js";
import type { MemoryScope } from "./types.js";

export function assertScope(scope: string, source: string): void {
  if (
    scope.trim().length === 0 ||
    scope.length > memoryLimits.scopeLength ||
    !memoryScopePattern.test(scope)
  ) {
    throw new NuzoMemoryError(
      "MEMORY_CONFIG_INVALID",
      `${source} contains an invalid Nuzo memory scope.`,
      { scope },
    );
  }
}

export function readUserConfig(home: string): NuzoConfig | null {
  const configPath = join(home, ".nuzo", "config.json");
  if (!existsSync(configPath)) {
    return null;
  }
  return parseConfig(configPath, false, home);
}

export function readUserAuthorization(home: string): NuzoAuthorizationConfig | undefined {
  const configPath = join(home, ".nuzo", "config.json");
  if (!existsSync(configPath)) {
    return undefined;
  }
  try {
    const value = JSON.parse(readFileSync(configPath, "utf8"));
    if (!isRecord(value)) {
      return undefined;
    }
    return parseAuthorizationConfig(value.authorization, configPath, false);
  } catch (error) {
    if (error instanceof NuzoMemoryError) {
      throw error;
    }
    // Project data configuration remains independent from malformed unrelated
    // user settings. Host defaults remain restricted when no trusted policy can
    // be read.
    return undefined;
  }
}

export function readProjectConfig(projectRoot: string): NuzoConfig | null {
  const configPath = join(projectRoot, ".nuzo", "config.json");
  if (!existsSync(configPath)) {
    return null;
  }

  const nuzoRoot = join(projectRoot, ".nuzo");
  const storeDirectory = join(nuzoRoot, "memory");
  const storePath = join(storeDirectory, "memories.sqlite");
  assertProjectNuzoRoot(nuzoRoot, projectRoot, configPath);
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
      !value.storage.path.startsWith("~/")) ||
    (project && value.authorization !== undefined)
  ) {
    throwConfigShape(configPath);
  }

  const recall = value.recall === undefined
    ? { limit: 8, include_global: false }
    : parseRecallConfig(value.recall, configPath);
  const privacy = value.privacy === undefined
    ? { allow_network: false as const, record_recall_events: false }
    : parsePrivacyConfig(value.privacy, configPath);
  const authorization = parseAuthorizationConfig(value.authorization, configPath, project);

  return {
    version: 1,
    default_scope: value.default_scope as MemoryScope,
    storage: {
      driver: "sqlite",
      path: project ? projectStorePath! : resolveUserStoragePath(value.storage.path, home),
    },
    recall,
    privacy,
    ...(authorization === undefined ? {} : { authorization }),
  };
}

function parseAuthorizationConfig(
  value: unknown,
  configPath: string,
  project: boolean,
): NuzoAuthorizationConfig | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (project || !isRecord(value)) {
    throwConfigShape(configPath);
  }
  if (value.mode === "administrator") {
    if (value.allowed_scopes !== undefined) {
      throwConfigShape(configPath);
    }
    return { mode: "administrator" };
  }
  if (
    value.mode !== "restricted" ||
    !Array.isArray(value.allowed_scopes) ||
    value.allowed_scopes.length === 0 ||
    !value.allowed_scopes.every((scope) => typeof scope === "string")
  ) {
    throwConfigShape(configPath);
  }
  for (const scope of value.allowed_scopes) {
    assertScope(scope, "authorization.allowed_scopes");
  }
  return {
    mode: "restricted",
    allowed_scopes: [...new Set(value.allowed_scopes)] as MemoryScope[],
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

function assertProjectNuzoRoot(nuzoRoot: string, projectRoot: string, configPath: string): void {
  try {
    if (realpathSync(nuzoRoot) !== join(realpathSync(projectRoot), ".nuzo")) {
      throw new Error("symlinked .nuzo root");
    }
  } catch {
    throw new NuzoMemoryError(
      "MEMORY_CONFIG_INVALID",
      "Project .nuzo must be a real directory inside the project root.",
      { path: configPath },
    );
  }
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
