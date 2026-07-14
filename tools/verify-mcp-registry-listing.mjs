#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isValidReleaseVersion } from "./release-shared.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = readJson("server.json");
const serverName = "io.github.fabionfsc/nuzo-memory";
const version = process.argv[2];

assert(version !== undefined, "usage: npm run registry:verify -- <version>");
assert(isValidReleaseVersion(version), "version must be strict SemVer");
assert(manifest.name === serverName, "server.json name does not match the canonical Registry name");
assert(manifest.version === version, "requested version does not match server.json");
const endpoint = new URL(
  `/v0.1/servers/${encodeURIComponent(serverName)}/versions/${encodeURIComponent(version)}`,
  "https://registry.modelcontextprotocol.io",
);

const response = await fetch(endpoint, {
  headers: { accept: "application/json" },
  signal: AbortSignal.timeout(15_000),
});
if (!response.ok) {
  throw new Error(`MCP Registry listing lookup failed: HTTP ${response.status} ${endpoint}`);
}
const payload = await response.json();
const server = payload.server;
const official = payload._meta?.["io.modelcontextprotocol.registry/official"];

assert(server?.name === manifest.name, "listing name does not match server.json");
assert(server?.version === manifest.version, "listing version does not match server.json");
assert(server?.$schema === manifest.$schema, "listing schema does not match server.json");
assert(server?.repository?.url === manifest.repository.url, "listing repository URL does not match");
assert(server?.packages?.length === 1, "listing must expose exactly one package");
assert(server.packages[0]?.identifier === "@nuzo/memory-mcp", "listing package identifier does not match");
assert(server.packages[0]?.version === manifest.version, "listing package version does not match");
assert(server.packages[0]?.transport?.type === "stdio", "listing must expose stdio transport");
assert(official?.status === "active", "listing is not active");
assert(official?.isLatest === true, "listing is not the latest Nuzo Registry version");
assert(typeof official?.publishedAt === "string", "listing has no publication timestamp");

console.log(`MCP Registry listing verified: ${server.name}@${server.version}`);
console.log(endpoint.href);

function readJson(relativePath) {
  return JSON.parse(readFileSync(join(repositoryRoot, relativePath), "utf8"));
}

function assert(condition, message) {
  if (!condition) throw new Error(`MCP Registry listing verification failed: ${message}`);
}
