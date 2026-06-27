#!/usr/bin/env node
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { assertMcpSessionContinuity } from "./mcp-session-continuity.mjs";
import { prepareStagedMcpRuntime } from "./staged-mcp-runtime.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const generatedPluginRoot = join(repositoryRoot, "build", "plugins", "codex", "nuzo");
const testRoot = mkdtempSync(join(tmpdir(), "nuzo-codex-plugin-"));
const pluginRoot = join(testRoot, "plugin", "nuzo");
const storePath = join(testRoot, "memory", "codex-plugin.sqlite");

try {
  if (process.env.NUZO_USE_EXISTING_ARTIFACTS !== "1") {
    run("npm", ["run", "package:plugins"], repositoryRoot);
  }
  cpSync(generatedPluginRoot, pluginRoot, { recursive: true });

  const manifest = readJson(join(pluginRoot, ".codex-plugin", "plugin.json"));
  if (manifest.name !== "nuzo") {
    fail(`expected plugin name nuzo, got ${JSON.stringify(manifest.name)}`);
  }
  if (manifest.interface?.displayName !== "Nuzo") {
    fail(`expected displayName Nuzo, got ${JSON.stringify(manifest.interface?.displayName)}`);
  }

  const mcpConfigPath = join(pluginRoot, manifest.mcpServers.replace(/^\.\//, ""));
  const mcpConfig = readJson(mcpConfigPath);
  const server = mcpConfig.mcpServers?.nuzo;
  if (!server || typeof server.command !== "string" || !Array.isArray(server.args)) {
    fail("generated Codex plugin artifact does not define an nuzo MCP server");
  }

  const { sortedMemoryToolNames: expectedMcpTools } = await import(
    join(repositoryRoot, "packages", "mcp-server", "dist", "tool-contract.js")
  );

  const runtime = process.env.NUZO_PLUGIN_SMOKE_PUBLISHED === "1"
    ? { command: server.command, args: server.args }
    : prepareStagedMcpRuntime(repositoryRoot, testRoot);
  await assertMcpSessionContinuity({
    cwd: pluginRoot,
    command: runtime.command,
    args: runtime.args,
    memoryStore: storePath,
    label: "generated Codex plugin artifact",
    expectedToolNames: expectedMcpTools,
  });

  console.log(`Codex plugin artifact smoke passed: ${manifest.name}@${manifest.version}`);
} finally {
  rmSync(testRoot, { recursive: true, force: true });
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function fail(message) {
  throw new Error(`Codex plugin artifact smoke failed: ${message}`);
}
