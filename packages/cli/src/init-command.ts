import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  getDefaultStorePath,
  NuzoMemoryError,
  projectScopeFromPath,
  SQLiteMemoryDatabase,
  type MemoryScope,
} from "@nuzo/memory-core";
import {
  ensurePrivateDirectory,
  ensureStoreDirectory,
  pathExists,
  writePrivateFile,
} from "./filesystem.js";
import { resolveRuntimeConfig, type GlobalOptions } from "./runtime.js";

export interface InitCommandOptions {
  project: boolean;
}

export function initializeMemory(options: GlobalOptions, commandOptions: InitCommandOptions) {
  const init = resolveInitContext(options, commandOptions);
  ensureStoreDirectory(init.storePath);
  if (!init.project) {
    ensurePrivateDirectory(join(dirname(init.storePath), "exports"));
    ensurePrivateDirectory(join(dirname(init.storePath), "logs"));
  }
  writeConfigIfMissing(init.configPath, init.configStorePath, init.scope, init.project);
  if (init.projectRoot !== null) ensureProjectGitIgnore(init.projectRoot);

  const database = new SQLiteMemoryDatabase({ path: init.storePath });
  database.close();
  return { storePath: init.storePath, scope: init.scope };
}

function resolveInitContext(options: GlobalOptions, commandOptions: InitCommandOptions) {
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
  const configRoot = storePath === defaultStorePath ? dirname(dirname(storePath)) : dirname(storePath);
  return {
    configPath: join(configRoot, "config.json"),
    configStorePath: storePath,
    project: false,
    projectRoot: null,
    scope: runtimeConfig.scope,
    storePath,
  };
}

function writeConfigIfMissing(
  configPath: string,
  configStorePath: string,
  scope: MemoryScope,
  project: boolean,
): void {
  if (pathExists(configPath)) return;

  mkdirSync(dirname(configPath), { recursive: true, mode: 0o700 });
  writePrivateFile(
    configPath,
    `${JSON.stringify({
      version: 1,
      default_scope: scope,
      storage: { driver: "sqlite", path: configStorePath },
      recall: { limit: 8, include_global: true },
      privacy: { allow_network: false, record_recall_events: false },
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
  const rules = [".nuzo/memory/", ".nuzo/**/*.sqlite", ".nuzo/**/*.sqlite-*"];
  const existing = pathExists(path) ? readFileSync(path, "utf8") : "";
  const lines = new Set(existing.split(/\r?\n/));
  const missing = rules.filter((rule) => !lines.has(rule));
  if (missing.length === 0) return;

  const separator = existing.length > 0 && !existing.endsWith("\n") ? "\n" : "";
  writeFileSync(path, `${existing}${separator}${missing.join("\n")}\n`, "utf8");
}
