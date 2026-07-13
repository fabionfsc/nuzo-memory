#!/usr/bin/env node
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { assertMcpSessionContinuity } from "./mcp-session-continuity.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { sortedMemoryToolNames: expectedMcpTools } = await import(
  pathToFileURL(join(repositoryRoot, "packages", "mcp-server", "dist", "tool-contract.js")).href
);
const registryPackage = JSON.parse(
  readFileSync(join(repositoryRoot, "packages", "registry-server", "package.json"), "utf8"),
);
const packageSpec = process.argv[2] ?? `${registryPackage.name}@${registryPackage.version}`;
const testRoot = mkdtempSync(join(tmpdir(), "nuzo-published-registry-"));

try {
  const metadata = JSON.parse(capture("npm", [
    "view",
    packageSpec,
    "mcpName",
    "bin",
    "version",
    "--json",
  ], repositoryRoot).stdout);
  if (
    metadata.mcpName !== "io.github.fabionfsc/nuzo-memory" ||
    JSON.stringify(metadata.bin) !== JSON.stringify({ "memory-mcp": "dist/index.js" }) ||
    metadata.version !== registryPackage.version
  ) {
    throw new Error(`published Registry metadata mismatch: ${JSON.stringify(metadata)}`);
  }

  await assertMcpSessionContinuity({
    cwd: testRoot,
    command: process.platform === "win32" ? "npx.cmd" : "npx",
    args: ["--yes", packageSpec],
    memoryStore: join(testRoot, "memory", "registry.sqlite"),
    label: `published MCP Registry ${packageSpec}`,
    expectedToolNames: expectedMcpTools,
  });
  console.log(`published MCP Registry smoke passed: ${packageSpec}`);
} finally {
  rmSync(testRoot, { recursive: true, force: true });
}

function capture(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }
  return result;
}
