import { mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

export function prepareStagedMcpRuntime(repositoryRoot, testRoot) {
  if (process.env.NUZO_USE_EXISTING_ARTIFACTS !== "1") {
    run("npm", ["run", "package:npm"], repositoryRoot);
  }

  const tarballsRoot = join(repositoryRoot, "build", "npm", "tarballs");
  const tarballs = readdirSync(tarballsRoot);
  const coreTarball = findTarball(tarballs, "nuzo-memory-core-");
  const mcpTarball = findTarball(tarballs, "nuzo-mcp-server-");
  const runtimeRoot = join(testRoot, "staged-runtime");
  mkdirSync(runtimeRoot, { recursive: true });
  run("npm", [
    "install",
    "--prefix",
    runtimeRoot,
    "--no-audit",
    "--no-fund",
    join(tarballsRoot, coreTarball),
    join(tarballsRoot, mcpTarball),
  ], repositoryRoot);

  return {
    command: process.execPath,
    args: [join(runtimeRoot, "node_modules", "@nuzo", "mcp-server", "dist", "index.js")],
  };
}

function findTarball(files, prefix) {
  const matches = files.filter((file) => file.startsWith(prefix) && file.endsWith(".tgz"));
  if (matches.length !== 1) {
    throw new Error(`Expected one ${prefix} tarball, found ${matches.length}.`);
  }
  return matches[0];
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
    throw new Error(`${command} ${args.join(" ")} exited with ${result.status ?? 1}.`);
  }
}
