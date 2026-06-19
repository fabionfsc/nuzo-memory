#!/usr/bin/env node
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tarballsRoot = join(repositoryRoot, "build", "npm", "tarballs");
const corePackage = readJson(join(repositoryRoot, "packages", "core", "package.json"));
const mcpPackage = readJson(join(repositoryRoot, "packages", "mcp-server", "package.json"));
const coreTarball = join(tarballsRoot, tarballName(corePackage));
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
      mcpTarball,
    ],
    testRoot,
  );

  const installedCore = readJson(
    join(testRoot, "node_modules", "@nuzo", "memory-core", "package.json"),
  );
  const installedMcp = readJson(
    join(testRoot, "node_modules", "@nuzo", "mcp-server", "package.json"),
  );
  if (installedCore.version !== installedMcp.version) {
    fail("installed core and MCP package versions differ");
  }

  await assertMcpStarts(testRoot, storePath);
  console.log(`npm artifact validation passed: ${installedMcp.version}`);
} finally {
  rmSync(testRoot, { recursive: true, force: true });
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

function executableName() {
  return process.platform === "win32" ? "nuzo-mcp-server.cmd" : "nuzo-mcp-server";
}

function tarballName(pkg) {
  return `${pkg.name.replace(/^@/, "").replace("/", "-")}-${pkg.version}.tgz`;
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
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function fail(message) {
  throw new Error(`npm artifact validation failed: ${message}`);
}
