#!/usr/bin/env node
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { assertMcpSessionContinuity } from "./mcp-session-continuity.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mcpPackage = JSON.parse(
  readFileSync(join(repositoryRoot, "packages", "mcp-server", "package.json"), "utf8"),
);
const packageSpec = process.argv[2] ?? `${mcpPackage.name}@${mcpPackage.version}`;
const testRoot = mkdtempSync(join(tmpdir(), "nuzo-published-mcp-"));
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

  const executable = join(testRoot, "node_modules", ".bin", executableName());
  await assertMcpSessionContinuity({
    cwd: testRoot,
    command: executable,
    memoryStore: storePath,
    label: `published ${packageSpec}`,
  });

  console.log(`published MCP session continuity passed: ${packageSpec}`);
} finally {
  rmSync(testRoot, { recursive: true, force: true });
}

function executableName() {
  return process.platform === "win32" ? "nuzo-mcp-server.cmd" : "nuzo-mcp-server";
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
