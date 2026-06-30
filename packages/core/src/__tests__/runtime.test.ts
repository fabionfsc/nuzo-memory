import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getDefaultStorePath,
  projectScopeFromPath,
  resolveNuzoRuntimeConfig,
} from "../runtime.js";

describe("projectScopeFromPath", () => {
  it("returns a stable project scope for an absolute path", () => {
    const scope = projectScopeFromPath("/example/workflows/cloudflare");

    expect(scope).toMatch(/^project:[a-f0-9]{16}$/);
    expect(projectScopeFromPath("/example/workflows/cloudflare")).toBe(scope);
  });

  it("normalizes relative paths before hashing", () => {
    expect(projectScopeFromPath(".")).toBe(projectScopeFromPath(resolve(".")));
  });

  it("uses the same scope through a filesystem symlink", () => {
    const directory = mkdtempSync(join(tmpdir(), "nuzo-project-scope-"));
    const link = `${directory}-link`;
    try {
      symlinkSync(directory, link, "dir");
      expect(projectScopeFromPath(link)).toBe(projectScopeFromPath(directory));
    } finally {
      rmSync(link, { force: true });
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

describe("resolveNuzoRuntimeConfig", () => {
  it("resolves built-in administrator defaults without config", () => {
    const home = mkdtempSync(join(tmpdir(), "nuzo-runtime-home-"));
    const cwd = mkdtempSync(join(tmpdir(), "nuzo-runtime-cwd-"));
    try {
      expect(resolveNuzoRuntimeConfig({ home, cwd, environment: {} })).toEqual({
        storePath: getDefaultStorePath(home),
        scope: "user:default",
        projectRoot: cwd,
        projectScope: projectScopeFromPath(cwd),
        authorizationMode: "administrator",
        recall: {
          limit: 8,
          includeGlobal: false,
        },
        privacy: {
          recordRecallEvents: false,
        },
        provenance: {
          projectRoot: "cwd",
          config: "defaults",
          store: "default",
          scope: "default",
          authorization: "default",
        },
        adjustments: [],
      });
    } finally {
      rmSync(home, { recursive: true, force: true });
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("discovers the nearest project config from nested directories", () => {
    const home = mkdtempSync(join(tmpdir(), "nuzo-runtime-home-"));
    const projectRoot = mkdtempSync(join(tmpdir(), "nuzo-runtime-project-"));
    const nested = join(projectRoot, "packages", "feature", "src");
    try {
      mkdirSync(nested, { recursive: true });
      writeUserConfig(home, {
        authorization: {
          mode: "restricted",
          allowed_scopes: ["project:auto"],
        },
      });
      writeProjectConfig(projectRoot, {
        recall: {
          limit: 3,
          include_global: true,
        },
        privacy: {
          allow_network: false,
          record_recall_events: true,
        },
      });

      expect(resolveNuzoRuntimeConfig({
        home,
        cwd: nested,
        environment: {},
        defaultAuthorizationMode: "restricted",
      })).toEqual({
        storePath: join(projectRoot, ".nuzo", "memory", "memories.sqlite"),
        scope: projectScopeFromPath(projectRoot),
        projectRoot,
        projectScope: projectScopeFromPath(projectRoot),
        authorizationMode: "restricted",
        authorizedScopes: [projectScopeFromPath(projectRoot)],
        recall: {
          limit: 3,
          includeGlobal: false,
        },
        privacy: {
          recordRecallEvents: true,
        },
        provenance: {
          projectRoot: "discovered",
          config: "project",
          store: "project",
          scope: "project",
          authorization: "user",
        },
        adjustments: ["include_global_disabled_by_authorization"],
      });
    } finally {
      rmSync(home, { recursive: true, force: true });
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("uses an explicit host project root even when the process cwd is a plugin directory", () => {
    const home = mkdtempSync(join(tmpdir(), "nuzo-runtime-home-"));
    const projectRoot = mkdtempSync(join(tmpdir(), "nuzo-runtime-project-"));
    const pluginRoot = mkdtempSync(join(tmpdir(), "nuzo-runtime-plugin-"));
    try {
      writeProjectConfig(projectRoot);
      const runtime = resolveNuzoRuntimeConfig({
        home,
        cwd: pluginRoot,
        environment: {
          NUZO_PROJECT_ROOT: projectRoot,
        },
        defaultAuthorizationMode: "restricted",
      });

      expect(runtime).toMatchObject({
        storePath: join(projectRoot, ".nuzo", "memory", "memories.sqlite"),
        scope: projectScopeFromPath(projectRoot),
        projectRoot,
        projectScope: projectScopeFromPath(projectRoot),
        authorizationMode: "restricted",
        authorizedScopes: [projectScopeFromPath(projectRoot), "user:default"],
        provenance: {
          projectRoot: "environment",
          config: "project",
          store: "project",
          scope: "project",
          authorization: "default",
        },
      });
    } finally {
      rmSync(home, { recursive: true, force: true });
      rmSync(projectRoot, { recursive: true, force: true });
      rmSync(pluginRoot, { recursive: true, force: true });
    }
  });

  it("resolves published environment overrides and restricted scopes", () => {
    const home = mkdtempSync(join(tmpdir(), "nuzo-runtime-env-home-"));
    const cwd = mkdtempSync(join(tmpdir(), "nuzo-runtime-env-project-"));
    try {
      const projectScope = projectScopeFromPath(cwd);
      expect(resolveNuzoRuntimeConfig({
        home,
        cwd,
        environment: {
          NUZO_MEMORY_STORE: "/tmp/nuzo-env.sqlite",
          NUZO_MEMORY_SCOPE: "project:auto",
          NUZO_AUTHORIZED_SCOPES: "project:auto,user:default,project:auto",
        },
      })).toMatchObject({
        storePath: "/tmp/nuzo-env.sqlite",
        scope: projectScope,
        projectRoot: cwd,
        projectScope,
        authorizationMode: "restricted",
        authorizedScopes: [projectScope, "user:default"],
        provenance: {
          projectRoot: "cwd",
          config: "defaults",
          store: "environment",
          scope: "environment",
          authorization: "environment",
        },
      });
    } finally {
      rmSync(home, { recursive: true, force: true });
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("selects the first allowed scope when only the built-in scope is incompatible", () => {
    const home = mkdtempSync(join(tmpdir(), "nuzo-runtime-home-"));
    const cwd = mkdtempSync(join(tmpdir(), "nuzo-runtime-cwd-"));
    try {
      const projectScope = projectScopeFromPath(cwd);
      expect(resolveNuzoRuntimeConfig({
        home,
        cwd,
        environment: {
          NUZO_AUTHORIZED_SCOPES: "project:auto",
        },
      })).toMatchObject({
        scope: projectScope,
        authorizationMode: "restricted",
        authorizedScopes: [projectScope],
        provenance: {
          scope: "authorization",
        },
      });
    } finally {
      rmSync(home, { recursive: true, force: true });
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("rejects explicit scopes outside the restricted allowlist", () => {
    const home = mkdtempSync(join(tmpdir(), "nuzo-runtime-home-"));
    const cwd = mkdtempSync(join(tmpdir(), "nuzo-runtime-cwd-"));
    try {
      expect(() => resolveNuzoRuntimeConfig({
        home,
        cwd,
        scope: "user:default",
        environment: {
          NUZO_AUTHORIZED_SCOPES: "project:auto",
        },
      })).toThrow("effective default scope is not included");
    } finally {
      rmSync(home, { recursive: true, force: true });
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("fails closed for empty or conflicting authorization environment", () => {
    const home = mkdtempSync(join(tmpdir(), "nuzo-runtime-home-"));
    const cwd = mkdtempSync(join(tmpdir(), "nuzo-runtime-cwd-"));
    try {
      expect(() => resolveNuzoRuntimeConfig({
        home,
        cwd,
        environment: { NUZO_AUTHORIZED_SCOPES: " " },
      })).toThrow("must not be empty");
      expect(() => resolveNuzoRuntimeConfig({
        home,
        cwd,
        environment: {
          NUZO_AUTHORIZATION_MODE: "administrator",
          NUZO_AUTHORIZED_SCOPES: "user:default",
        },
      })).toThrow("Administrator authorization cannot define");
    } finally {
      rmSync(home, { recursive: true, force: true });
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("allows trusted user config to opt a host into administrator mode", () => {
    const home = mkdtempSync(join(tmpdir(), "nuzo-runtime-home-"));
    const cwd = mkdtempSync(join(tmpdir(), "nuzo-runtime-cwd-"));
    try {
      writeUserConfig(home, {
        authorization: { mode: "administrator" },
      });
      expect(resolveNuzoRuntimeConfig({
        home,
        cwd,
        environment: {},
        defaultAuthorizationMode: "restricted",
      })).toMatchObject({
        authorizationMode: "administrator",
        provenance: {
          authorization: "user",
        },
      });
    } finally {
      rmSync(home, { recursive: true, force: true });
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("rejects repository-controlled authorization and symlinked .nuzo roots", () => {
    const home = mkdtempSync(join(tmpdir(), "nuzo-runtime-home-"));
    const projectRoot = mkdtempSync(join(tmpdir(), "nuzo-runtime-project-"));
    const outside = mkdtempSync(join(tmpdir(), "nuzo-runtime-outside-"));
    try {
      writeProjectConfig(projectRoot, {
        authorization: {
          mode: "administrator",
        },
      });
      expect(() => resolveNuzoRuntimeConfig({ home, cwd: projectRoot, environment: {} }))
        .toThrow("unsupported shape");

      rmSync(join(projectRoot, ".nuzo"), { recursive: true, force: true });
      mkdirSync(join(outside, "memory"), { recursive: true });
      writeFileSync(join(outside, "config.json"), `${JSON.stringify(projectConfig())}\n`, "utf8");
      symlinkSync(outside, join(projectRoot, ".nuzo"), "dir");
      expect(() => resolveNuzoRuntimeConfig({ home, cwd: projectRoot, environment: {} }))
        .toThrow("Project .nuzo must be a real directory");
    } finally {
      rmSync(home, { recursive: true, force: true });
      rmSync(projectRoot, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });
});

function writeUserConfig(
  home: string,
  overrides: Record<string, unknown> = {},
): void {
  mkdirSync(join(home, ".nuzo"), { recursive: true });
  writeFileSync(join(home, ".nuzo", "config.json"), `${JSON.stringify({
    version: 1,
    default_scope: "user:home",
    storage: {
      driver: "sqlite",
      path: "~/custom/memories.sqlite",
    },
    recall: {
      limit: 8,
      include_global: false,
    },
    privacy: {
      allow_network: false,
      record_recall_events: false,
    },
    ...overrides,
  })}\n`, "utf8");
}

function writeProjectConfig(
  projectRoot: string,
  overrides: Record<string, unknown> = {},
): void {
  mkdirSync(join(projectRoot, ".nuzo", "memory"), { recursive: true });
  writeFileSync(
    join(projectRoot, ".nuzo", "config.json"),
    `${JSON.stringify(projectConfig(overrides))}\n`,
    "utf8",
  );
}

function projectConfig(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 1,
    default_scope: "project:auto",
    storage: {
      driver: "sqlite",
      path: ".nuzo/memory/memories.sqlite",
    },
    ...overrides,
  };
}
