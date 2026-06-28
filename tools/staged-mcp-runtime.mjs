import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

export function prepareStagedMcpRuntime(repositoryRoot, testRoot) {
  if (process.env.NUZO_USE_EXISTING_ARTIFACTS !== "1") {
    run("npm", ["run", "package:npm"], repositoryRoot);
  }

  const tarballsRoot = join(repositoryRoot, "build", "npm", "tarballs");
  const tarballs = readdirSync(tarballsRoot);
  const corePackage = readJson(join(repositoryRoot, "packages", "core", "package.json"));
  const memoryPackage = readJson(join(repositoryRoot, "packages", "memory", "package.json"));
  const coreTarball = findTarball(tarballs, tarballName(corePackage));
  const memoryTarball = findTarball(tarballs, tarballName(memoryPackage));
  const runtimeRoot = join(testRoot, "staged-runtime");
  mkdirSync(runtimeRoot, { recursive: true });
  run("npm", [
    "install",
    "--prefix",
    runtimeRoot,
    "--no-audit",
    "--no-fund",
    join(tarballsRoot, coreTarball),
    join(tarballsRoot, memoryTarball),
  ], repositoryRoot);

  return {
    command: process.execPath,
    args: [join(runtimeRoot, "node_modules", "@nuzo", "memory", "dist", "mcp-server", "index.js")],
    hook: {
      command: process.execPath,
      args: [join(runtimeRoot, "node_modules", "@nuzo", "memory", "dist", "mcp-server", "host-hook-cli.js")],
    },
  };
}

function findTarball(files, expectedName) {
  const matches = files.filter((file) => file === expectedName);
  if (matches.length !== 1) {
    throw new Error(`Expected one ${expectedName} tarball, found ${matches.length}.`);
  }
  return matches[0];
}

function tarballName(pkg) {
  return `${pkg.name.replace(/^@/, "").replace("/", "-")}-${pkg.version}.tgz`;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
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
