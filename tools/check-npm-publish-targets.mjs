#!/usr/bin/env node
import { existsSync } from "node:fs";
import { assertReleaseVersion, fail, readJson } from "./release-shared.mjs";
import {
  inspectNpmPublishTarget,
  npmArtifactTarballPath,
} from "./npm-artifact-integrity.mjs";
import {
  publishableNpmPackagesForVersion,
  retiredLegacyNpmPackagesForVersion,
} from "./npm-package-policy.mjs";

const version = process.argv[2];
const tarballsRoot = process.argv[3];
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

  const tarballPath = npmArtifactTarballPath(
    packageName,
    version,
    tarballsRoot,
  );
  let target;
  try {
    target = inspectNpmPublishTarget({ packageName, version, tarballPath });
  } catch (error) {
    fail(error.message);
  }
  if (target.status === "published-identical") {
    publishedCount += 1;
    console.log(
      `${packageName}@${version} is already published with matching integrity ${target.integrity}; retry will skip it`,
    );
    continue;
  }
  unpublishedCount += 1;
  console.log(`${packageName}@${version} is available; candidate integrity ${target.integrity}`);
}

if (unpublishedCount === 0) {
  console.log(`all npm publish targets already exist for ${version}`);
} else {
  console.log(`${unpublishedCount} npm publish target(s) are available for ${version}; ${publishedCount} already published`);
}
