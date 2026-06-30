import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { NuzoMemoryError } from "./errors.js";
import type { Clock, IdGenerator } from "./ports.js";
import { memoryLimits, memoryScopePattern } from "./policy.js";
import type { MemoryScope } from "./types.js";

export type NuzoAuthorizationMode = "administrator" | "restricted";

export interface NuzoAuthorizationConfig {
  mode: NuzoAuthorizationMode;
  allowed_scopes?: readonly MemoryScope[];
}

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
  authorization?: NuzoAuthorizationConfig;
}

export interface NuzoRuntimeConfigOptions {
  store?: string;
  scope?: MemoryScope;
  cwd?: string;
  projectRoot?: string;
  home?: string;
  environment?: Record<string, string | undefined>;
  authorizationMode?: NuzoAuthorizationMode;
  authorizedScopes?: readonly MemoryScope[];
  defaultAuthorizationMode?: NuzoAuthorizationMode;
}

export interface NuzoRuntimeConfigProvenance {
  projectRoot: "option" | "environment" | "discovered" | "cwd";
  config: "project" | "user" | "defaults";
  store: "option" | "environment" | "project" | "user" | "default";
  scope: "option" | "environment" | "project" | "user" | "default" | "authorization";
  authorization: "option" | "environment" | "user" | "default";
}

export type NuzoRuntimeAdjustment = "include_global_disabled_by_authorization";

export interface NuzoRuntimeConfig {
  storePath: string;
  scope: MemoryScope;
  projectRoot: string;
  projectScope: `project:${string}`;
  authorizationMode: NuzoAuthorizationMode;
  authorizedScopes?: readonly MemoryScope[];
  recall: {
    limit: number;
    includeGlobal: boolean;
  };
  privacy: {
    recordRecallEvents: boolean;
  };
  provenance: NuzoRuntimeConfigProvenance;
  adjustments: readonly NuzoRuntimeAdjustment[];
}

interface ProjectContext {
  root: string;
  source: NuzoRuntimeConfigProvenance["projectRoot"];
}

interface AuthorizationResolution {
  mode: NuzoAuthorizationMode;
  allowedScopes?: readonly MemoryScope[];
  source: NuzoRuntimeConfigProvenance["authorization"];
}

const defaultRestrictedScopes: readonly MemoryScope[] = ["project:auto", "user:default"];

export function getDefaultStorePath(home: string = homedir()): string {
  return resolve(home, ".nuzo", "memory", "memories.sqlite");
}

export function resolveNuzoRuntimeConfig(options: NuzoRuntimeConfigOptions = {}): NuzoRuntimeConfig {
  const home = options.home ?? homedir();
  const environment = options.environment ?? process.env;
  const cwd = canonicalDirectory(options.cwd ?? process.cwd(), "working directory");
  const project = resolveProjectContext(options, environment, cwd);
  const projectConfig = readProjectConfig(project.root);
  const userConfig = projectConfig === null ? readUserConfig(home) : null;
  const activeConfig = projectConfig ?? userConfig;
  const configSource: NuzoRuntimeConfigProvenance["config"] = projectConfig !== null
    ? "project"
    : userConfig !== null
      ? "user"
      : "defaults";

  const storeResolution = resolveStorePath(options.store, environment, activeConfig, configSource, home);
  const scopeResolution = resolveScope(options.scope, environment, activeConfig, configSource);
  const userAuthorization = options.defaultAuthorizationMode === undefined
    ? undefined
    : projectConfig?.authorization ?? userConfig?.authorization ?? readUserAuthorization(home);
  const authorization = resolveAuthorization(options, environment, userAuthorization, project.root);
  let scope = resolveAutomaticScope(scopeResolution.scope, project.root);
  let scopeSource = scopeResolution.source;

  if (
    authorization.mode === "restricted" &&
    !authorization.allowedScopes?.includes(scope)
  ) {
    if (scopeSource !== "default") {
      throw new NuzoMemoryError(
        "MEMORY_CONFIG_INVALID",
        "The effective default scope is not included in the restricted authorization allowlist.",
        { scope },
      );
    }
    scope = authorization.allowedScopes?.[0] as MemoryScope;
    scopeSource = "authorization";
  }

  const recallDefaults = activeConfig?.recall ?? { limit: 8, include_global: false };
  const adjustments: NuzoRuntimeAdjustment[] = [];
  let includeGlobal = recallDefaults.include_global;
  if (
    authorization.mode === "restricted" &&
    includeGlobal &&
    !authorization.allowedScopes?.includes("user:default")
  ) {
    includeGlobal = false;
    adjustments.push("include_global_disabled_by_authorization");
  }

  const config: NuzoRuntimeConfig = {
    storePath: storeResolution.path,
    scope,
    projectRoot: project.root,
    projectScope: projectScopeFromPath(project.root),
    authorizationMode: authorization.mode,
    recall: {
      limit: recallDefaults.limit,
      includeGlobal,
    },
    privacy: {
      recordRecallEvents: activeConfig?.privacy.record_recall_events ?? false,
    },
    provenance: {
      projectRoot: project.source,
      config: configSource,
      store: storeResolution.source,
      scope: scopeSource,
      authorization: authorization.source,
    },
    adjustments,
  };
  if (authorization.allowedScopes !== undefined) {
    config.authorizedScopes = authorization.allowedScopes;
  }
  return config;
}

export function resolveAutomaticScope(scope: MemoryScope, projectRoot: string = process.cwd()): MemoryScope {
  return scope === "project:auto"
    ? projectScopeFromPath(projectRoot)
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

function resolveProjectContext(
  options: NuzoRuntimeConfigOptions,
  environment: Record<string, string | undefined>,
  cwd: string,
): ProjectContext {
  if (options.projectRoot !== undefined) {
    return {
      root: canonicalDirectory(options.projectRoot, "project root"),
      source: "option",
    };
  }
  if (environment.NUZO_PROJECT_ROOT !== undefined) {
    if (environment.NUZO_PROJECT_ROOT.trim().length === 0) {
      throw new NuzoMemoryError(
        "MEMORY_CONFIG_INVALID",
        "NUZO_PROJECT_ROOT must not be empty.",
      );
    }
    return {
      root: canonicalDirectory(environment.NUZO_PROJECT_ROOT, "NUZO_PROJECT_ROOT"),
      source: "environment",
    };
  }

  const discovered = discoverProjectRoot(cwd);
  return discovered === null
    ? { root: cwd, source: "cwd" }
    : { root: discovered, source: "discovered" };
}

function discoverProjectRoot(cwd: string): string | null {
  let candidate = cwd;
  while (true) {
    if (existsSync(join(candidate, ".nuzo", "config.json"))) {
      return candidate;
    }
    const parent = dirname(candidate);
    if (parent === candidate) {
      return null;
    }
    candidate = parent;
  }
}

function canonicalDirectory(path: string, source: string): string {
  try {
    const canonical = realpathSync(path);
    if (!statSync(canonical).isDirectory()) {
      throw new Error("not a directory");
    }
    return canonical;
  } catch {
    throw new NuzoMemoryError(
      "MEMORY_CONFIG_INVALID",
      `${source} must resolve to an existing directory.`,
      { path },
    );
  }
}

function resolveStorePath(
  option: string | undefined,
  environment: Record<string, string | undefined>,
  activeConfig: NuzoConfig | null,
  configSource: NuzoRuntimeConfigProvenance["config"],
  home: string,
): { path: string; source: NuzoRuntimeConfigProvenance["store"] } {
  if (option !== undefined) {
    return { path: resolveNonEmptyPath(option, "store option"), source: "option" };
  }
  if (environment.NUZO_MEMORY_STORE !== undefined) {
    return {
      path: resolveNonEmptyPath(environment.NUZO_MEMORY_STORE, "NUZO_MEMORY_STORE"),
      source: "environment",
    };
  }
  if (activeConfig !== null) {
    return {
      path: activeConfig.storage.path,
      source: configSource as "project" | "user",
    };
  }
  return { path: getDefaultStorePath(home), source: "default" };
}

function resolveNonEmptyPath(path: string, source: string): string {
  if (path.trim().length === 0) {
    throw new NuzoMemoryError("MEMORY_CONFIG_INVALID", `${source} must not be empty.`);
  }
  return resolve(path);
}

function resolveScope(
  option: MemoryScope | undefined,
  environment: Record<string, string | undefined>,
  activeConfig: NuzoConfig | null,
  configSource: NuzoRuntimeConfigProvenance["config"],
): { scope: MemoryScope; source: NuzoRuntimeConfigProvenance["scope"] } {
  if (option !== undefined) {
    assertScope(option, "scope option");
    return { scope: option, source: "option" };
  }
  if (environment.NUZO_MEMORY_SCOPE !== undefined) {
    const scope = environment.NUZO_MEMORY_SCOPE;
    assertScope(scope, "NUZO_MEMORY_SCOPE");
    return { scope: scope as MemoryScope, source: "environment" };
  }
  if (activeConfig !== null) {
    return {
      scope: activeConfig.default_scope,
      source: configSource as "project" | "user",
    };
  }
  return { scope: "user:default", source: "default" };
}

function resolveAuthorization(
  options: NuzoRuntimeConfigOptions,
  environment: Record<string, string | undefined>,
  userAuthorization: NuzoAuthorizationConfig | undefined,
  projectRoot: string,
): AuthorizationResolution {
  if (options.authorizationMode !== undefined || options.authorizedScopes !== undefined) {
    const mode = options.authorizationMode ?? "restricted";
    return createAuthorizationResolution(mode, options.authorizedScopes, "option", projectRoot);
  }

  const environmentMode = readEnvironmentAuthorizationMode(environment);
  const environmentScopes = readEnvironmentAuthorizedScopes(environment);
  if (environmentMode !== undefined || environmentScopes !== undefined) {
    return createAuthorizationResolution(
      environmentMode ?? "restricted",
      environmentScopes,
      "environment",
      projectRoot,
    );
  }

  if (userAuthorization !== undefined) {
    return createAuthorizationResolution(
      userAuthorization.mode,
      userAuthorization.allowed_scopes,
      "user",
      projectRoot,
    );
  }

  return createAuthorizationResolution(
    options.defaultAuthorizationMode ?? "administrator",
    undefined,
    "default",
    projectRoot,
  );
}

function createAuthorizationResolution(
  mode: NuzoAuthorizationMode,
  scopes: readonly MemoryScope[] | undefined,
  source: NuzoRuntimeConfigProvenance["authorization"],
  projectRoot: string,
): AuthorizationResolution {
  if (mode === "administrator") {
    if (scopes !== undefined) {
      throw new NuzoMemoryError(
        "MEMORY_CONFIG_INVALID",
        "Administrator authorization cannot define an allowed scope list.",
      );
    }
    return { mode, source };
  }

  const requestedScopes = scopes ?? defaultRestrictedScopes;
  if (requestedScopes.length === 0) {
    throw new NuzoMemoryError(
      "MEMORY_CONFIG_INVALID",
      "Restricted authorization requires at least one allowed scope.",
    );
  }
  const allowedScopes = requestedScopes.map((scope) => {
    assertScope(scope, "authorized scope");
    return resolveAutomaticScope(scope, projectRoot);
  });
  return {
    mode,
    allowedScopes: [...new Set(allowedScopes)],
    source,
  };
}

function readEnvironmentAuthorizationMode(
  environment: Record<string, string | undefined>,
): NuzoAuthorizationMode | undefined {
  const mode = environment.NUZO_AUTHORIZATION_MODE;
  if (mode === undefined) {
    return undefined;
  }
  if (mode !== "administrator" && mode !== "restricted") {
    throw new NuzoMemoryError(
      "MEMORY_CONFIG_INVALID",
      "NUZO_AUTHORIZATION_MODE must be administrator or restricted.",
    );
  }
  return mode;
}

function readEnvironmentAuthorizedScopes(
  environment: Record<string, string | undefined>,
): readonly MemoryScope[] | undefined {
  const raw = environment.NUZO_AUTHORIZED_SCOPES;
  if (raw === undefined) {
    return undefined;
  }
  if (raw.trim().length === 0) {
    throw new NuzoMemoryError(
      "MEMORY_CONFIG_INVALID",
      "NUZO_AUTHORIZED_SCOPES must not be empty when it is defined.",
    );
  }
  const scopes = raw.split(",").map((scope) => scope.trim()).filter(Boolean);
  for (const scope of scopes) {
    assertScope(scope, "NUZO_AUTHORIZED_SCOPES");
  }
  return [...new Set(scopes)] as MemoryScope[];
}

function assertScope(scope: string, source: string): void {
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

function readUserConfig(home: string): NuzoConfig | null {
  const configPath = join(home, ".nuzo", "config.json");
  if (!existsSync(configPath)) {
    return null;
  }
  return parseConfig(configPath, false, home);
}

function readUserAuthorization(home: string): NuzoAuthorizationConfig | undefined {
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

function readProjectConfig(projectRoot: string): NuzoConfig | null {
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
