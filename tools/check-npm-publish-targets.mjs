#!/usr/bin/env node
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { assertReleaseVersion, fail, readJson } from "./release-shared.mjs";
import {
  publishableNpmPackagesForVersion,
  retiredLegacyNpmPackagesForVersion,
} from "./npm-package-policy.mjs";

const version = process.argv[2];
assertReleaseVersion(version);

const publishPackages = publishableNpmPackagesForVersion(version)
  .map((definition) => [definition.name, definition.packageJson]);

for (const definition of retiredLegacyNpmPackagesForVersion(version)) {
  if (existsSync(definition.packageJson)) {
    fail(`retired legacy npm package must not be staged after 0.9.0: ${definition.name}`);
  }
}

let unpublishedCount = 0;
let publishedCount = 0;

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
    publishedCount += 1;
    console.log(`${packageName}@${version} is already published; retry will skip it`);
    continue;
  }
  if (!view.stderr.includes("E404")) {
    fail(`could not verify ${packageName}@${version} publish target: ${view.stderr.trim()}`);
  }
  unpublishedCount += 1;
  console.log(`${packageName}@${version} is available`);
}

if (unpublishedCount === 0) {
  console.log(`all npm publish targets already exist for ${version}`);
} else {
  console.log(`${unpublishedCount} npm publish target(s) are available for ${version}; ${publishedCount} already published`);
}
