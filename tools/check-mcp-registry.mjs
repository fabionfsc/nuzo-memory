#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const server = readJson("server.json");
const rootPackage = readJson("package.json");
const registryPackage = readJson("packages/registry-server/package.json");
const expectedName = "io.github.fabionfsc/nuzo-memory";
const expectedPackage = "@nuzo/memory-mcp";
const expectedSchema = "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json";

assert(server.$schema === expectedSchema, "server.json must use the reviewed current Registry schema");
assert(server.name === expectedName, "server.json must use the canonical GitHub-authenticated name");
assert(server.version === rootPackage.version, "server.json must match the Nuzo release version");
assert(server.title === "Nuzo Memory", "server.json must keep the public Nuzo title");
assert(server.websiteUrl === "https://nuzo.com.br/", "server.json must link to the canonical site");
assert(server.repository?.url === "https://github.com/fabionfsc/nuzo-memory", "server.json must link to the canonical repository");
assert(server.repository?.source === "github", "server.json repository source must be github");
assert(server.repository?.id === "1266894494", "server.json must pin the stable GitHub repository ID");
assert(server.repository?.subfolder === "packages/mcp-server", "server.json must identify the MCP implementation boundary");
assert(server.remotes === undefined, "Nuzo must not advertise a remote MCP service");
assert(server._meta === undefined, "Nuzo must not add unnecessary Registry extension metadata");

assert(Array.isArray(server.packages) && server.packages.length === 1, "server.json must expose one local npm package");
const [pkg] = server.packages;
assert(pkg.registryType === "npm", "Registry package must use npm");
assert(pkg.registryBaseUrl === "https://registry.npmjs.org", "Registry package must use the official npm registry");
assert(pkg.identifier === expectedPackage, "Registry package identifier is incorrect");
assert(pkg.version === rootPackage.version, "Registry package version must match the Nuzo release");
assert(pkg.runtimeHint === "npx", "Registry package must declare the npx runtime");
assert(pkg.transport?.type === "stdio" && Object.keys(pkg.transport).length === 1, "Registry transport must be local stdio only");
assert(pkg.runtimeArguments === undefined, "The single-bin npm package must not need runtime arguments");
assert(pkg.packageArguments === undefined, "The Nuzo MCP server must not need package arguments");

const environmentNames = (pkg.environmentVariables ?? []).map((entry) => entry.name);
assert(
  JSON.stringify(environmentNames) === JSON.stringify([
    "NUZO_MEMORY_STORE",
    "NUZO_MEMORY_SCOPE",
    "NUZO_AUTHORIZED_SCOPES",
    "NUZO_PROJECT_ROOT",
  ]),
  "Registry environment variables must stay content-free and bounded",
);
assert(
  pkg.environmentVariables.every((entry) => entry.isSecret !== true && entry.isRequired !== true && entry.default === undefined),
  "Registry environment variables must remain optional and non-secret",
);

assert(registryPackage.private === true, "Registry source package must remain private");
assert(registryPackage.name === expectedPackage, "Registry source package name is incorrect");
assert(registryPackage.version === rootPackage.version, "Registry source package version must match the release");
assert(registryPackage.mcpName === expectedName, "npm mcpName must match server.json");
assert(
  JSON.stringify(registryPackage.bin) === JSON.stringify({ "memory-mcp": "dist/index.js" }),
  "Registry npm package must expose one npx-deterministic binary",
);

if (process.argv.includes("--official")) {
  const publisher = process.env.MCP_PUBLISHER ?? join(repositoryRoot, "build", "tools", "mcp-publisher");
  assert(existsSync(publisher), `official mcp-publisher not found: ${publisher}`);
  const result = spawnSync(publisher, ["validate", join(repositoryRoot, "server.json")], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  assert(result.status === 0, `official mcp-publisher validation failed with status ${result.status}`);
}

console.log(`MCP Registry contract passed: ${server.name}@${server.version}`);

function readJson(relativePath) {
  return JSON.parse(readFileSync(join(repositoryRoot, relativePath), "utf8"));
}

function assert(condition, message) {
  if (!condition) throw new Error(`MCP Registry validation failed: ${message}`);
}
