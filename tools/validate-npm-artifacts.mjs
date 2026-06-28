#!/usr/bin/env node
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { assertCliSessionContinuity } from "./cli-session-continuity.mjs";
import { assertMcpSessionContinuity } from "./mcp-session-continuity.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { sortedMemoryToolNames: expectedMcpTools } = await import(
  join(repositoryRoot, "packages", "mcp-server", "dist", "tool-contract.js")
);
const tarballsRoot = join(repositoryRoot, "build", "npm", "tarballs");
const corePackage = readJson(join(repositoryRoot, "packages", "core", "package.json"));
const memoryPackage = readJson(join(repositoryRoot, "packages", "memory", "package.json"));
const coreTarball = join(tarballsRoot, tarballName(corePackage));
const memoryTarball = join(tarballsRoot, tarballName(memoryPackage));
const testRoot = mkdtempSync(join(tmpdir(), "nuzo-npm-artifacts-"));
const cliStorePath = join(testRoot, "memory", "cli.sqlite");
const mcpStorePath = join(testRoot, "memory", "mcp.sqlite");

try {
  run("npm", ["init", "--yes"], testRoot);
  run(
    "npm",
    [
      "install",
      "--ignore-scripts=false",
      "--no-audit",
      "--no-fund",
      coreTarball,
      memoryTarball,
    ],
    testRoot,
  );

  const installedCore = readJson(
    join(testRoot, "node_modules", "@nuzo", "memory-core", "package.json"),
  );
  const installedMemory = readJson(
    join(testRoot, "node_modules", "@nuzo", "memory", "package.json"),
  );
  if (installedCore.version !== installedMemory.version) {
    fail("installed core and memory package versions differ");
  }

  assertCliWorkflow(testRoot, cliStorePath);
  await assertMcpProtocol(testRoot, mcpStorePath);
  assertHostHookDoctor(testRoot, mcpStorePath);
  console.log(`npm artifact validation passed: ${installedMemory.version}`);
} finally {
  rmSync(testRoot, { recursive: true, force: true });
}

function assertCliWorkflow(cwd, memoryStore) {
  const executable = join(cwd, "node_modules", ".bin", cliExecutableName());
  assertCliSessionContinuity({
    cwd,
    executable,
    memoryStore,
    label: "installed nuzo binary",
  });

  assertCliExit(
    executable,
    [
      "memory",
      "--store",
      memoryStore,
      "remember",
      "Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456",
      "--kind",
      "note",
    ],
    cwd,
    1,
    "MEMORY_SECRET_DETECTED",
  );
  assertCliExit(
    executable,
    ["memory", "recall", "test", "--limit", "8items"],
    cwd,
    2,
    "Expected a positive integer.",
  );
  assertCliExit(
    executable,
    ["memory", "--store", cwd, "init"],
    cwd,
    70,
    "NUZO_INTERNAL_ERROR",
  );
}

function assertCliExit(executable, args, cwd, expectedStatus, expectedError) {
  const result = spawnSync(executable, args, {
    cwd,
    encoding: "utf8",
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== expectedStatus) {
    fail(
      `installed nuzo binary exit mismatch: expected ${expectedStatus}, got ${result.status}; stderr=${JSON.stringify(result.stderr)}`,
    );
  }
  if (!result.stderr.includes(expectedError) || result.stderr.includes("\n    at ")) {
    fail(
      `installed nuzo binary stderr contract failed: ${JSON.stringify(result.stderr)}`,
    );
  }
}

async function assertMcpProtocol(cwd, memoryStore) {
  await assertMcpSessionContinuity({
    cwd,
    command: join(cwd, "node_modules", ".bin", executableName()),
    memoryStore,
    label: "installed MCP",
    expectedToolNames: expectedMcpTools,
  });
}

function cliExecutableName() {
  return process.platform === "win32" ? "nuzo.cmd" : "nuzo";
}

function executableName() {
  return process.platform === "win32" ? "nuzo-mcp-server.cmd" : "nuzo-mcp-server";
}

function assertHostHookDoctor(cwd, memoryStore) {
  const executable = join(
    cwd,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "nuzo-memory-hook.cmd" : "nuzo-memory-hook",
  );
  const result = spawnSync(executable, ["--doctor"], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, NUZO_MEMORY_STORE: memoryStore },
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    fail(`installed host hook doctor failed: ${JSON.stringify(result.stderr)}`);
  }
  const report = JSON.parse(result.stdout);
  if (
    report.status !== "ready" ||
    report.mode !== "read_only" ||
    !report.supported_events?.includes("SessionStart") ||
    !report.supported_events?.includes("UserPromptSubmit")
  ) {
    fail(`installed host hook doctor returned unexpected output: ${result.stdout}`);
  }
}

function tarballName(pkg) {
  return `${pkg.name.replace(/^@/, "").replace("/", "-")}-${pkg.version}.tgz`;
}

function run(command, args, cwd, env = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      ...env,
    },
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

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function fail(message) {
  throw new Error(`npm artifact validation failed: ${message}`);
}
