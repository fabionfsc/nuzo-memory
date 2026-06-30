#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { assertReleaseVersion, fail } from "./release-shared.mjs";
import {
  publishableNpmPackagesForVersion,
  retiredLegacyNpmPackagesForVersion,
} from "./npm-package-policy.mjs";

const version = process.argv[2];
const mode = process.argv[3] ?? "publish";
assertReleaseVersion(version);

if (!["dry-run", "publish"].includes(mode)) {
  fail(`unsupported npm publish mode: ${mode}`);
}

const publishPackages = publishableNpmPackagesForVersion(version)
  .map((definition) => [definition.name, definition.output]);

for (const definition of retiredLegacyNpmPackagesForVersion(version)) {
  const retiredPackageJson = join("build", "npm", "packages", definition.output, "package.json");
  if (existsSync(retiredPackageJson)) {
    fail(`retired legacy npm package must not be staged after 0.9.0: ${definition.name}`);
  }
}

let published = 0;
let skipped = 0;

for (const [packageName, packageDirectory] of publishPackages) {
  const packageRoot = join("build", "npm", "packages", packageDirectory);
  const pkg = readJson(join(packageRoot, "package.json"));
  if (pkg.name !== packageName) {
    fail(`${packageRoot}/package.json has package name ${pkg.name}, expected ${packageName}`);
  }
  if (pkg.version !== version) {
    fail(`${packageRoot}/package.json has version ${pkg.version}, expected ${version}`);
  }

  if (awaitPackageExists(packageName, version)) {
    skipped += 1;
    console.log(`skip ${packageName}@${version}: already published`);
    continue;
  }

  const args = [
    "publish",
    packageRoot,
    "--access",
    "public",
    ...(mode === "dry-run" ? ["--dry-run"] : ["--provenance"]),
  ];
  run("npm", args);
  published += 1;
}

console.log(`${mode} complete: ${published} package(s) processed, ${skipped} skipped`);

function awaitPackageExists(packageName, packageVersion) {
  const view = spawnSync("npm", ["view", `${packageName}@${packageVersion}`, "version"], {
    encoding: "utf8",
  });
  if (view.status === 0) {
    return true;
  }
  if (view.stderr.includes("E404")) {
    return false;
  }
  fail(`could not verify ${packageName}@${packageVersion}: ${view.stderr.trim()}`);
}

function run(command, args) {
  const result = spawnSync(command, args, {
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
