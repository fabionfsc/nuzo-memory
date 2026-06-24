#!/usr/bin/env node
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = join(repositoryRoot, "build", "plugins");
const mcpPackage = readJson(join(repositoryRoot, "packages", "mcp-server", "package.json"));
const packageSpec = `${mcpPackage.name}@${mcpPackage.version}`;

if (mcpPackage.version === "0.0.0") {
  console.warn("Packaging pre-release plugin artifacts against unpublished MCP version 0.0.0.");
}

rmSync(outputRoot, { recursive: true, force: true });

const artifacts = [
  {
    host: "codex",
    source: join(repositoryRoot, "packages", "codex-plugin"),
    destination: join(outputRoot, "codex", "nuzo"),
    include: [".codex-plugin", "skills"],
    mcp: {
      mcpServers: {
        nuzo: {
          command: "npm",
          args: ["exec", "--yes", `--package=${packageSpec}`, "--", "nuzo-mcp-server"],
        },
      },
    },
    validator: "validate-codex-plugin.py",
  },
  {
    host: "claude-code",
    source: join(repositoryRoot, "packages", "claude-code-plugin"),
    destination: join(outputRoot, "claude-code", "nuzo"),
    include: [".claude-plugin", "skills"],
    mcp: {
      mcpServers: {
        nuzo: {
          command: "npm",
          args: ["exec", "--yes", `--package=${packageSpec}`, "--", "nuzo-mcp-server"],
          cwd: "${CLAUDE_PLUGIN_ROOT}",
        },
      },
    },
    validator: "validate-claude-code-plugin.py",
  },
];

for (const artifact of artifacts) {
  mkdirSync(artifact.destination, { recursive: true });
  for (const path of artifact.include) {
    cpSync(join(artifact.source, path), join(artifact.destination, path), {
      recursive: true,
    });
  }
  cpSync(join(repositoryRoot, "LICENSE"), join(artifact.destination, "LICENSE"));
  writeFileSync(
    join(artifact.destination, ".mcp.json"),
    `${JSON.stringify(artifact.mcp, null, 2)}\n`,
    "utf8",
  );

  runValidator(artifact.validator, artifact.destination);
  console.log(`packaged ${artifact.host}: ${artifact.destination}`);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function runValidator(script, pluginRoot) {
  const result = spawnSync(
    "python3",
    [join(repositoryRoot, "tools", script), "--release", pluginRoot],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      stdio: "inherit",
    },
  );
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
