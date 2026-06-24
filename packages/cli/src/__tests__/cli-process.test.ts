import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { cliExitCodes } from "../index.js";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const entrypoint = join(packageRoot, "dist", "index.js");
const cliPackage = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")) as {
  version: string;
};
let tempDirectories: string[] = [];

afterEach(() => {
  for (const directory of tempDirectories) {
    rmSync(directory, { recursive: true, force: true });
  }
  tempDirectories = [];
});

describe("nuzo CLI process contract", () => {
  it("returns success for version output", () => {
    const result = runProcess(["--version"]);

    expect(result.status).toBe(cliExitCodes.success);
    expect(result.stdout.trim()).toBe(cliPackage.version);
    expect(result.stderr).toBe("");
  });

  it("returns the operational code for policy errors", () => {
    const store = createStorePath();
    const result = runProcess([
      "memory",
      "--store",
      store,
      "remember",
      "Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456",
      "--kind",
      "note",
    ]);

    expect(result.status).toBe(cliExitCodes.operationalError);
    expect(result.stderr.trim()).toBe(
      "MEMORY_SECRET_DETECTED: Memory content looks sensitive.",
    );
    expect(result.stderr).not.toContain("at ");
  });

  it("returns the usage code for invalid command arguments", () => {
    const result = runProcess([
      "memory",
      "recall",
      "test",
      "--limit",
      "8items",
    ]);

    expect(result.status).toBe(cliExitCodes.usageError);
    expect(result.stderr).toContain("Expected a positive integer.");
    expect(result.stderr).not.toContain("at ");
  });

  it("returns the internal code without exposing a stack trace", () => {
    const directory = mkdtempSync(join(tmpdir(), "nuzo-cli-process-"));
    tempDirectories.push(directory);
    const result = runProcess([
      "memory",
      "--store",
      directory,
      "init",
    ]);

    expect(result.status).toBe(cliExitCodes.internalError);
    expect(result.stderr.trim()).toBe(
      "NUZO_INTERNAL_ERROR: Unexpected CLI failure.",
    );
    expect(result.stderr).not.toContain("at ");
  });
});

function createStorePath(): string {
  const directory = mkdtempSync(join(tmpdir(), "nuzo-cli-process-"));
  tempDirectories.push(directory);
  return join(directory, "memories.sqlite");
}

function runProcess(args: string[]) {
  return spawnSync(process.execPath, [entrypoint, ...args], {
    encoding: "utf8",
  });
}
