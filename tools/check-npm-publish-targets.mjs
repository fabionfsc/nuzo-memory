#!/usr/bin/env node
import { existsSync } from "node:fs";
import { assertReleaseVersion, fail, readJson } from "./release-shared.mjs";
import {
  inspectNpmPublishTarget,
  npmArtifactRootFromTarballs,
  npmArtifactTarballPath,
  verifyNpmArtifactManifest,
} from "./npm-artifact-integrity.mjs";
import {
  publishableNpmPackagesForVersion,
  retiredLegacyNpmPackagesForVersion,
} from "./npm-package-policy.mjs";

const version = process.argv[2];
const tarballsRoot = process.argv[3];
const expectedManifestSha256 = process.argv[4];
const expectedSourceCommit = process.argv[5];
assertReleaseVersion(version);

const publishPackages = publishableNpmPackagesForVersion(version);

if (tarballsRoot !== undefined) {
  try {
    if (expectedManifestSha256 === undefined || expectedSourceCommit === undefined) {
      throw new Error("external npm artifacts require an expected manifest SHA-256 and source commit");
    }
    const externalArtifact = npmArtifactRootFromTarballs(tarballsRoot);
    verifyNpmArtifactManifest({
      artifactRoot: externalArtifact.artifactRoot,
      version,
      packageNames: publishPackages.map((definition) => definition.name),
      expectedManifestSha256,
      expectedSourceCommit,
    });
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}

for (const definition of retiredLegacyNpmPackagesForVersion(version)) {
  if (existsSync(definition.packageJson)) {
    fail(`retired legacy npm package must not be staged after 0.9.0: ${definition.name}`);
  }
}

let unpublishedCount = 0;
let publishedCount = 0;

for (const definition of publishPackages) {
  const packageName = definition.name;
  if (tarballsRoot === undefined) {
    const pkg = readJson(definition.packageJson);
    if (pkg.name !== packageName) {
      fail(`${definition.packageJson} has package name ${pkg.name}, expected ${packageName}`);
    }
    if (pkg.version !== version) {
      fail(`${definition.packageJson} has version ${pkg.version}, expected ${version}`);
    }
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
