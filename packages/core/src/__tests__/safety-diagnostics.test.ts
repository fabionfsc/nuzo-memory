import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { inspectRuntimeFileSafety } from "../safety-diagnostics.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

describe("runtime file safety diagnostics", () => {
  it.skipIf(process.platform === "win32")("reports unsafe permissions, symlinks, stale artifacts, and unexpected files", () => {
    const root = mkdtempSync(join(tmpdir(), "nuzo-safety-"));
    roots.push(root);
    const home = join(root, "home");
    const projectRoot = join(root, "project");
    const memoryRoot = join(home, ".nuzo", "memory");
    mkdirSync(join(home, ".nuzo", "models", ".nuzo-semantic-model-stale"), { recursive: true, mode: 0o700 });
    mkdirSync(join(memoryRoot, "exports"), { recursive: true, mode: 0o700 });
    mkdirSync(join(projectRoot, ".nuzo"), { recursive: true, mode: 0o700 });
    const storePath = join(memoryRoot, "memories.sqlite");
    writeFileSync(storePath, "fixture", { mode: 0o600 });
    writeFileSync(join(memoryRoot, "exports", "unsafe.memory.export.json"), "{}", { mode: 0o644 });
    writeFileSync(join(home, ".nuzo", "unexpected.txt"), "fixture", { mode: 0o600 });
    symlinkSync(storePath, join(memoryRoot, "memories.semantic.sqlite"));

    const report = inspectRuntimeFileSafety({ storePath, projectRoot, home });

    expect(report.unexpectedFiles).toEqual([join(home, ".nuzo", "unexpected.txt")]);
    expect(report.staleArtifacts).toContain(join(home, ".nuzo", "models", ".nuzo-semantic-model-stale"));
    expect(report.unsafe).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: join(memoryRoot, "exports", "unsafe.memory.export.json"), reason: "permissions" }),
      expect.objectContaining({ path: join(memoryRoot, "memories.semantic.sqlite"), reason: "symlink" }),
    ]));
  });

  it("accepts owner-only synthetic runtime files", () => {
    const root = mkdtempSync(join(tmpdir(), "nuzo-safety-clean-"));
    roots.push(root);
    const home = join(root, "home");
    const projectRoot = join(root, "project");
    const memoryRoot = join(home, ".nuzo", "memory");
    mkdirSync(memoryRoot, { recursive: true, mode: 0o700 });
    mkdirSync(join(projectRoot, ".nuzo"), { recursive: true, mode: 0o700 });
    const storePath = join(memoryRoot, "memories.sqlite");
    writeFileSync(storePath, "fixture", { mode: 0o600 });
    writeFileSync(join(home, ".nuzo", "managed-hosts.json"), "{}", { mode: 0o600 });
    chmodSync(join(home, ".nuzo"), 0o700);

    const report = inspectRuntimeFileSafety({ storePath, projectRoot, home });

    expect(report.unsafe).toEqual([]);
    expect(report.staleArtifacts).toEqual([]);
    expect(report.unexpectedFiles).toEqual([]);
  });
});
