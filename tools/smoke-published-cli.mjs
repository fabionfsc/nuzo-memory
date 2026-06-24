#!/usr/bin/env node
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { assertCliSessionContinuity } from "./cli-session-continuity.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cliPackage = JSON.parse(
  readFileSync(join(repositoryRoot, "packages", "cli", "package.json"), "utf8"),
);
const packageSpec = process.argv[2] ?? `${cliPackage.name}@${cliPackage.version}`;
const testRoot = mkdtempSync(join(tmpdir(), "nuzo-published-cli-"));
const storePath = join(testRoot, "memory", "session-continuity.sqlite");

try {
  run(
    "npm",
    [
      "install",
      "--ignore-scripts=false",
      "--no-audit",
      "--no-fund",
      "--prefix",
      testRoot,
      packageSpec,
    ],
    repositoryRoot,
  );

  const executable = join(testRoot, "node_modules", ".bin", cliExecutableName());
  assertCliSessionContinuity({
    cwd: testRoot,
    executable,
    memoryStore: storePath,
    label: `published ${packageSpec}`,
  });

  const version = run(executable, ["--version"], testRoot).stdout.trim();
  console.log(`published CLI session continuity passed: ${packageSpec} (${version})`);
} finally {
  rmSync(testRoot, { recursive: true, force: true });
}

function cliExecutableName() {
  return process.platform === "win32" ? "nuzo.cmd" : "nuzo";
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.stderr.write(result.stdout);
    process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }
  return result;
}
