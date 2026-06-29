import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { projectScopeFromPath } from "../runtime.js";

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
