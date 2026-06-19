#!/usr/bin/env node
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tarballsRoot = join(repositoryRoot, "build", "npm", "tarballs");
const corePackage = readJson(join(repositoryRoot, "packages", "core", "package.json"));
const cliPackage = readJson(join(repositoryRoot, "packages", "cli", "package.json"));
const mcpPackage = readJson(join(repositoryRoot, "packages", "mcp-server", "package.json"));
const coreTarball = join(tarballsRoot, tarballName(corePackage));
const cliTarball = join(tarballsRoot, tarballName(cliPackage));
const mcpTarball = join(tarballsRoot, tarballName(mcpPackage));
const testRoot = mkdtempSync(join(tmpdir(), "nuzo-npm-artifacts-"));
const storePath = join(testRoot, "memory", "memories.sqlite");

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
      cliTarball,
      mcpTarball,
    ],
    testRoot,
  );

  const installedCore = readJson(
    join(testRoot, "node_modules", "@nuzo", "memory-core", "package.json"),
  );
  const installedCli = readJson(
    join(testRoot, "node_modules", "@nuzo", "memory-cli", "package.json"),
  );
  const installedMcp = readJson(
    join(testRoot, "node_modules", "@nuzo", "mcp-server", "package.json"),
  );
  if (
    installedCore.version !== installedCli.version ||
    installedCore.version !== installedMcp.version
  ) {
    fail("installed core, CLI, and MCP package versions differ");
  }

  assertCliWorkflow(testRoot, storePath);
  await assertMcpStarts(testRoot, storePath);
  console.log(`npm artifact validation passed: ${installedMcp.version}`);
} finally {
  rmSync(testRoot, { recursive: true, force: true });
}

function assertCliWorkflow(cwd, memoryStore) {
  const executable = join(cwd, "node_modules", ".bin", cliExecutableName());
  run(executable, ["memory", "--store", memoryStore, "init"], cwd);
  run(
    executable,
    [
      "memory",
      "--store",
      memoryStore,
      "remember",
      "The artifact test uses local SQLite memory.",
      "--kind",
      "project_decision",
      "--tag",
      "artifact-test",
    ],
    cwd,
  );
  const recall = run(
    executable,
    ["memory", "--store", memoryStore, "recall", "local SQLite"],
    cwd,
  );
  if (!recall.stdout.includes("artifact test uses local SQLite memory")) {
    fail(
      `installed nuzo binary could not recall the staged test memory: ${JSON.stringify({
        stdout: recall.stdout,
        stderr: recall.stderr,
      })}`,
    );
  }
  const doctor = run(
    executable,
    ["memory", "--store", memoryStore, "doctor"],
    cwd,
    { NUZO_DOCTOR_SKIP_GIT: "1" },
  );
  if (!doctor.stdout.includes("Status: ok")) {
    fail("installed nuzo binary doctor did not report a healthy temporary store");
  }

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
    ["memory", "recall", "test", "--limit", "0"],
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

function assertMcpStarts(cwd, memoryStore) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(
      join(cwd, "node_modules", ".bin", executableName()),
      [],
      {
        cwd,
        env: {
          ...process.env,
          NUZO_MEMORY_STORE: memoryStore,
        },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    let stderr = "";
    let settled = false;

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.once("error", (error) => finish(error));
    child.once("exit", (code, signal) => {
      if (!settled) {
        finish(new Error(`MCP server exited early (${code ?? signal}): ${stderr}`));
      }
    });

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      finish();
    }, 750);

    function finish(error) {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      if (!child.killed) {
        child.kill("SIGTERM");
      }
      if (error) {
        reject(error);
      } else {
        resolvePromise();
      }
    }
  });
}

function cliExecutableName() {
  return process.platform === "win32" ? "nuzo.cmd" : "nuzo";
}

function executableName() {
  return process.platform === "win32" ? "nuzo-mcp-server.cmd" : "nuzo-mcp-server";
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
