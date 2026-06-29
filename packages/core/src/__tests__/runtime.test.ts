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
  it("resolves built-in defaults without config", () => {
    const home = mkdtempSync(join(tmpdir(), "nuzo-runtime-home-"));
    const cwd = mkdtempSync(join(tmpdir(), "nuzo-runtime-cwd-"));
    try {
      expect(resolveNuzoRuntimeConfig({ home, cwd, environment: {} })).toEqual({
        storePath: getDefaultStorePath(home),
        scope: "user:default",
        recall: {
          limit: 8,
          includeGlobal: false,
        },
        privacy: {
          recordRecallEvents: false,
        },
      });
    } finally {
      rmSync(home, { recursive: true, force: true });
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("uses project config before user config and resolves project:auto", () => {
    const home = mkdtempSync(join(tmpdir(), "nuzo-runtime-home-"));
    const cwd = mkdtempSync(join(tmpdir(), "nuzo-runtime-project-"));
    try {
      mkdirSync(join(home, ".nuzo"), { recursive: true });
      writeFileSync(join(home, ".nuzo", "config.json"), `${JSON.stringify({
        version: 1,
        default_scope: "user:home",
        storage: {
          driver: "sqlite",
          path: "~/custom/memories.sqlite",
        },
      })}\n`, "utf8");

      mkdirSync(join(cwd, ".nuzo", "memory"), { recursive: true });
      writeFileSync(join(cwd, ".nuzo", "config.json"), `${JSON.stringify({
        version: 1,
        default_scope: "project:auto",
        storage: {
          driver: "sqlite",
          path: ".nuzo/memory/memories.sqlite",
        },
        recall: {
          limit: 3,
          include_global: true,
        },
        privacy: {
          allow_network: false,
          record_recall_events: true,
        },
      })}\n`, "utf8");

      expect(resolveNuzoRuntimeConfig({ home, cwd, environment: {} })).toEqual({
        storePath: join(cwd, ".nuzo", "memory", "memories.sqlite"),
        scope: projectScopeFromPath(cwd),
        recall: {
          limit: 3,
          includeGlobal: true,
        },
        privacy: {
          recordRecallEvents: true,
        },
      });
    } finally {
      rmSync(home, { recursive: true, force: true });
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("resolves published runtime environment overrides and restricted scopes", () => {
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
      })).toEqual({
        storePath: "/tmp/nuzo-env.sqlite",
        scope: projectScope,
        authorizedScopes: [projectScope, "user:default"],
        recall: {
          limit: 8,
          includeGlobal: false,
        },
        privacy: {
          recordRecallEvents: false,
        },
      });
    } finally {
      rmSync(home, { recursive: true, force: true });
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
