#!/usr/bin/env node
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { assertMcpSessionContinuity } from "./mcp-session-continuity.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const generatedPluginRoot = join(repositoryRoot, "build", "plugins", "claude-code", "nuzo");
const testRoot = mkdtempSync(join(tmpdir(), "nuzo-claude-code-plugin-"));
const pluginRoot = join(testRoot, "plugin", "nuzo");
const storePath = join(testRoot, "memory", "claude-code-plugin.sqlite");

try {
  run("npm", ["run", "package:plugins"], repositoryRoot);
  cpSync(generatedPluginRoot, pluginRoot, { recursive: true });

  const manifest = readJson(join(pluginRoot, ".claude-plugin", "plugin.json"));
  if (manifest.name !== "nuzo") {
    fail(`expected plugin name nuzo, got ${JSON.stringify(manifest.name)}`);
  }
  if (manifest.displayName !== "Nuzo") {
    fail(`expected displayName Nuzo, got ${JSON.stringify(manifest.displayName)}`);
  }
  if (!existsSync(join(pluginRoot, manifest.skills.replace(/^\.\//, "")))) {
    fail(`skills target does not exist: ${manifest.skills}`);
  }

  const mcpConfigPath = join(pluginRoot, manifest.mcpServers.replace(/^\.\//, ""));
  const mcpConfig = readJson(mcpConfigPath);
  const server = mcpConfig.mcpServers?.nuzo;
  if (!server || typeof server.command !== "string" || !Array.isArray(server.args)) {
    fail("generated Claude Code plugin artifact does not define an nuzo MCP server");
  }
  if (server.cwd !== "${CLAUDE_PLUGIN_ROOT}") {
    fail(`expected release cwd placeholder, got ${JSON.stringify(server.cwd)}`);
  }

  const { sortedMemoryToolNames: expectedMcpTools } = await import(
    join(repositoryRoot, "packages", "mcp-server", "dist", "tool-contract.js")
  );

  await assertMcpSessionContinuity({
    cwd: pluginRoot,
    command: server.command,
    args: server.args,
    memoryStore: storePath,
    label: "generated Claude Code plugin artifact",
    expectedToolNames: expectedMcpTools,
  });

  console.log(`Claude Code plugin artifact smoke passed: ${manifest.name}@${manifest.version}`);
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
  throw new Error(`Claude Code plugin artifact smoke failed: ${message}`);
}
