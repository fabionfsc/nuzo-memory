#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rootPackage = readJson("package.json");
const memoryPackage = readJson("packages/memory/package.json");

if (rootPackage.version !== memoryPackage.version) {
  fail("root and @nuzo/memory versions must match");
}

validateCodexMarketplace();
validateClaudeMarketplace();
console.log(`marketplace validation passed: nuzo@${rootPackage.version}`);

function validateCodexMarketplace() {
  const catalog = readJson(".agents/plugins/marketplace.json");
  if (catalog.name !== "nuzo-memory" || catalog.interface?.displayName !== "Nuzo Memory") {
    fail("Codex marketplace identity must remain nuzo-memory / Nuzo Memory");
  }
  if (!Array.isArray(catalog.plugins) || catalog.plugins.length !== 1) {
    fail("Codex marketplace must expose exactly one Nuzo plugin");
  }
  const plugin = catalog.plugins[0];
  if (plugin.name !== "nuzo") {
    fail("Codex marketplace plugin name must remain nuzo");
  }
  if (plugin.source?.source !== "local" || plugin.source?.path !== "./packages/codex-plugin") {
    fail("Codex marketplace must resolve the tracked Codex plugin source");
  }
  if (
    plugin.policy?.installation !== "AVAILABLE" ||
    plugin.policy?.authentication !== "ON_INSTALL" ||
    "products" in plugin.policy
  ) {
    fail("Codex marketplace policy must use the portable public defaults");
  }
  validateManifestVersion("packages/codex-plugin/.codex-plugin/plugin.json", "Codex");
}

function validateClaudeMarketplace() {
  const catalog = readJson(".claude-plugin/marketplace.json");
  if (catalog.name !== "nuzo-memory" || catalog.owner?.name !== "fabionfsc") {
    fail("Claude Code marketplace identity must remain nuzo-memory / fabionfsc");
  }
  if (!Array.isArray(catalog.plugins) || catalog.plugins.length !== 1) {
    fail("Claude Code marketplace must expose exactly one Nuzo plugin");
  }
  const plugin = catalog.plugins[0];
  if (plugin.name !== "nuzo" || plugin.source !== "./packages/claude-code-plugin") {
    fail("Claude Code marketplace must resolve the tracked Claude Code plugin source");
  }
  validateManifestVersion("packages/claude-code-plugin/.claude-plugin/plugin.json", "Claude Code");
}

function validateManifestVersion(path, host) {
  const manifest = readJson(path);
  if (manifest.version !== rootPackage.version) {
    fail(`${host} plugin version must match the repository version`);
  }
}

function readJson(relativePath) {
  const path = join(repositoryRoot, relativePath);
  if (!existsSync(path)) {
    fail(`missing ${relativePath}`);
  }
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    fail(`${relativePath} is not valid JSON: ${error instanceof Error ? error.message : error}`);
  }
}

function fail(message) {
  throw new Error(`marketplace validation failed: ${message}`);
}
