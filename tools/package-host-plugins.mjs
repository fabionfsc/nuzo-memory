#!/usr/bin/env node
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = join(repositoryRoot, "build", "plugins");
const memoryPackage = readJson(join(repositoryRoot, "packages", "memory", "package.json"));
const packageSpec = `${memoryPackage.name}@${memoryPackage.version}`;
const hookCommand = `npm exec --yes --package=${packageSpec} -- nuzo-memory-hook`;

if (memoryPackage.version === "0.0.0") {
  console.warn("Packaging pre-release plugin artifacts against unpublished Nuzo package version 0.0.0.");
}

rmSync(outputRoot, { recursive: true, force: true });

const artifacts = [
  {
    host: "codex",
    source: join(repositoryRoot, "packages", "codex-plugin"),
    destination: join(outputRoot, "codex", "nuzo"),
    include: [".codex-plugin", "skills", "hooks"],
    includeHookDescription: false,
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
    include: [".claude-plugin", "skills", "hooks"],
    includeHookDescription: true,
    mcp: {
      mcpServers: {
        nuzo: {
          command: "npm",
          args: ["exec", "--yes", `--package=${packageSpec}`, "--", "nuzo-mcp-server"],
          cwd: "${CLAUDE_PLUGIN_ROOT}",
          env: {
            NUZO_PROJECT_ROOT: "${CLAUDE_PROJECT_DIR}",
          },
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
  writeFileSync(
    join(artifact.destination, "hooks", "hooks.json"),
    `${JSON.stringify(createReleaseHooks(hookCommand, artifact.includeHookDescription), null, 2)}\n`,
    "utf8",
  );

  runValidator(artifact.validator, artifact.destination);
  console.log(`packaged ${artifact.host}: ${artifact.destination}`);
}

function createReleaseHooks(command, includeDescription) {
  const handler = {
    type: "command",
    command,
    timeout: 10,
  };
  return {
    ...(includeDescription
      ? { description: "Recall relevant Nuzo memory at session start and before each user prompt." }
      : {}),
    hooks: {
      SessionStart: [
        {
          matcher: "startup|resume|clear|compact",
          hooks: [handler],
        },
      ],
      UserPromptSubmit: [
        {
          hooks: [handler],
        },
      ],
    },
  };
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
