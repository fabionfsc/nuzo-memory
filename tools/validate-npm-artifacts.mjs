#!/usr/bin/env node
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from "@modelcontextprotocol/sdk/client/stdio.js";
import { assertCliSessionContinuity } from "./cli-session-continuity.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { sortedMemoryToolNames: expectedMcpTools } = await import(
  join(repositoryRoot, "packages", "mcp-server", "dist", "tool-contract.js")
);
const tarballsRoot = join(repositoryRoot, "build", "npm", "tarballs");
const corePackage = readJson(join(repositoryRoot, "packages", "core", "package.json"));
const cliPackage = readJson(join(repositoryRoot, "packages", "cli", "package.json"));
const mcpPackage = readJson(join(repositoryRoot, "packages", "mcp-server", "package.json"));
const coreTarball = join(tarballsRoot, tarballName(corePackage));
const cliTarball = join(tarballsRoot, tarballName(cliPackage));
const mcpTarball = join(tarballsRoot, tarballName(mcpPackage));
const testRoot = mkdtempSync(join(tmpdir(), "nuzo-npm-artifacts-"));
const cliStorePath = join(testRoot, "memory", "cli.sqlite");
const mcpStorePath = join(testRoot, "memory", "mcp.sqlite");

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

  assertCliWorkflow(testRoot, cliStorePath);
  await assertMcpProtocol(testRoot, mcpStorePath);
  console.log(`npm artifact validation passed: ${installedMcp.version}`);
} finally {
  rmSync(testRoot, { recursive: true, force: true });
}

function assertCliWorkflow(cwd, memoryStore) {
  const executable = join(cwd, "node_modules", ".bin", cliExecutableName());
  assertCliSessionContinuity({
    cwd,
    executable,
    memoryStore,
    label: "installed nuzo binary",
  });

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
    ["memory", "recall", "test", "--limit", "8items"],
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

async function assertMcpProtocol(cwd, memoryStore) {
  const client = new Client({
    name: "nuzo-installed-artifact-test",
    version: "0.0.0",
  });
  const transport = new StdioClientTransport({
    command: join(cwd, "node_modules", ".bin", executableName()),
    cwd,
    env: {
      ...getDefaultEnvironment(),
      NUZO_MEMORY_STORE: memoryStore,
    },
    stderr: "pipe",
  });
  let stderr = "";
  transport.stderr?.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  try {
    await client.connect(transport);
    const tools = await client.listTools();
    const names = tools.tools.map((tool) => tool.name).sort();
    if (JSON.stringify(names) !== JSON.stringify(expectedMcpTools)) {
      fail(`installed MCP tool set mismatch: ${JSON.stringify(names)}`);
    }

    const doctor = parseToolJson(await client.callTool({
      name: "memory.doctor",
      arguments: {},
    }));
    if (doctor.ok !== true || doctor.store?.readable !== true) {
      fail(`installed MCP doctor failed: ${JSON.stringify(doctor)}`);
    }

    const suggestion = parseToolJson(await client.callTool({
      name: "memory.suggest_capture",
      arguments: {
        content: "Installed MCP lifecycle memory survives into recall hooks.",
        kind: "instruction",
        scope: "project:installed-artifact",
        tags: ["artifact-test"],
        source: "test:installed-mcp",
        confidence: 0.8,
        reason: "Validates installed MCP capture suggestion before confirmed write.",
      },
    }));
    if (
      suggestion.status !== "ready" ||
      suggestion.memory_writes !== false ||
      suggestion.requires_confirmation !== true ||
      suggestion.duplicate !== null
    ) {
      fail(`installed MCP suggest_capture failed: ${JSON.stringify(suggestion)}`);
    }

    const beforeRemember = parseToolJson(await client.callTool({
      name: "memory.recall_hook",
      arguments: {
        task_context: "installed MCP lifecycle memory",
        project_scope: "project:installed-artifact",
      },
    }));
    if (beforeRemember.results.length !== 0) {
      fail(`installed MCP suggest_capture wrote before confirmation: ${JSON.stringify(beforeRemember)}`);
    }

    await client.callTool({
      name: "memory.remember",
      arguments: {
        content: suggestion.draft.content,
        kind: suggestion.draft.kind,
        scope: suggestion.draft.scope,
        tags: suggestion.draft.tags,
        source: "test:confirmed-installed-mcp",
        confidence: suggestion.draft.confidence,
      },
    });

    const recalled = parseToolJson(await client.callTool({
      name: "memory.recall_hook",
      arguments: {
        task_context: "installed MCP lifecycle recall hooks",
        project_scope: "project:installed-artifact",
        limit: 5,
      },
    }));
    if (
      recalled.mode !== "read_only" ||
      recalled.memory_writes !== false ||
      recalled.results.length !== 1 ||
      recalled.results[0]?.content !== "Installed MCP lifecycle memory survives into recall hooks."
    ) {
      fail(`installed MCP recall_hook lifecycle failed: ${JSON.stringify(recalled)}`);
    }
  } catch (error) {
    throw new Error(
      `installed MCP protocol validation failed: ${error instanceof Error ? error.message : String(error)}; stderr=${JSON.stringify(stderr)}`,
    );
  } finally {
    await client.close();
  }
}

function cliExecutableName() {
  return process.platform === "win32" ? "nuzo.cmd" : "nuzo";
}

function executableName() {
  return process.platform === "win32" ? "nuzo-mcp-server.cmd" : "nuzo-mcp-server";
}

function parseToolJson(result) {
  const text = result.content?.find((item) => item.type === "text");
  if (text === undefined || typeof text.text !== "string") {
    fail("installed MCP tool result did not contain text JSON");
  }
  return JSON.parse(text.text);
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
