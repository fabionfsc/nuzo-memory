#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { assertReleaseVersion, fail, readJson } from "./release-shared.mjs";

const version = process.argv[2];
assertReleaseVersion(version);

const publishPackages = [
  ["@nuzo/memory-core", "build/npm/packages/memory-core/package.json"],
  ["@nuzo/memory-cli", "build/npm/packages/memory-cli/package.json"],
  ["@nuzo/mcp-server", "build/npm/packages/mcp-server/package.json"],
];

for (const [packageName, packagePath] of publishPackages) {
  const pkg = readJson(packagePath);
  if (pkg.name !== packageName) {
    fail(`${packagePath} has package name ${pkg.name}, expected ${packageName}`);
  }
  if (pkg.version !== version) {
    fail(`${packagePath} has version ${pkg.version}, expected ${version}`);
  }

  const view = spawnSync("npm", ["view", `${packageName}@${version}`, "version"], {
    encoding: "utf8",
  });
  if (view.status === 0) {
    fail(`${packageName}@${version} is already published`);
  }
  if (!view.stderr.includes("E404")) {
    fail(`could not verify ${packageName}@${version} publish target: ${view.stderr.trim()}`);
  }
}

console.log(`npm publish targets are available for ${version}`);
