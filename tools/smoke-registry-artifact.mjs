#!/usr/bin/env node
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { assertMcpSessionContinuity } from "./mcp-session-continuity.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const testRoot = mkdtempSync(join(tmpdir(), "nuzo-registry-artifact-"));
const registryPackage = readJson(join(repositoryRoot, "packages", "registry-server", "package.json"));
const corePackage = readJson(join(repositoryRoot, "packages", "core", "package.json"));
const tarball = join(
  repositoryRoot,
  "build",
  "npm",
  "tarballs",
  `${registryPackage.name.replace(/^@/u, "").replace("/", "-")}-${registryPackage.version}.tgz`,
);
const coreTarball = join(
  repositoryRoot,
  "build",
  "npm",
  "tarballs",
  `${corePackage.name.replace(/^@/u, "").replace("/", "-")}-${corePackage.version}.tgz`,
);

try {
  run("npm", ["init", "--yes"], testRoot);
  run("npm", ["install", "--no-audit", "--no-fund", coreTarball, tarball], testRoot);
  const { sortedMemoryToolNames } = await import(pathToFileURL(
    join(repositoryRoot, "packages", "mcp-server", "dist", "tool-contract.js"),
  ).href);
  await assertMcpSessionContinuity({
    cwd: testRoot,
    command: process.platform === "win32" ? "npx.cmd" : "npx",
    args: [
      "--yes",
      "--offline",
      `--package=${registryPackage.name}@${registryPackage.version}`,
      "--",
      "memory-mcp",
    ],
    memoryStore: join(testRoot, "memory", "registry.sqlite"),
    label: "npx MCP Registry artifact",
    expectedToolNames: sortedMemoryToolNames,
  });
  console.log(`MCP Registry npx smoke passed: ${registryPackage.name}@${registryPackage.version}`);
} finally {
  rmSync(testRoot, { recursive: true, force: true });
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }
}
