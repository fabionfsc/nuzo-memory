#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { assertReleaseVersion, fail } from "./release-shared.mjs";
import {
  inspectNpmPublishTarget,
  npmArtifactRootFromTarballs,
  npmArtifactTarballPath,
  verifyNpmArtifactManifest,
} from "./npm-artifact-integrity.mjs";
import {
  publishableNpmPackagesForVersion,
  compareVersions,
  retiredLegacyNpmPackagesForVersion,
} from "./npm-package-policy.mjs";

const version = process.argv[2];
const mode = process.argv[3] ?? "publish";
const tarballsRoot = process.argv[4];
const expectedManifestSha256 = process.argv[5];
const expectedSourceCommit = process.argv[6];
assertReleaseVersion(version);

if (!["dry-run", "publish"].includes(mode)) {
  fail(`unsupported npm publish mode: ${mode}`);
}

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
  const retiredPackageJson = join("build", "npm", "packages", definition.output, "package.json");
  if (existsSync(retiredPackageJson)) {
    fail(`retired legacy npm package must not be staged after 0.9.0: ${definition.name}`);
  }
}

let published = 0;
let skipped = 0;

for (const definition of publishPackages) {
  const packageName = definition.name;
  const packageDirectory = definition.output;
  const packageRoot = join("build", "npm", "packages", packageDirectory);
  const tarballPath = npmArtifactTarballPath(packageName, version, tarballsRoot);
  if (tarballsRoot === undefined) {
    const pkg = readJson(join(packageRoot, "package.json"));
    if (pkg.name !== packageName) {
      fail(`${packageRoot}/package.json has package name ${pkg.name}, expected ${packageName}`);
    }
    if (pkg.version !== version) {
      fail(`${packageRoot}/package.json has version ${pkg.version}, expected ${version}`);
    }
  }

  let target;
  try {
    target = inspectNpmPublishTarget({ packageName, version, tarballPath });
  } catch (error) {
    fail(error.message);
  }
  if (target.status === "published-identical") {
    skipped += 1;
    console.log(
      `skip ${packageName}@${version}: already published with matching integrity ${target.integrity}`,
    );
    continue;
  }

  if (
    mode === "publish" &&
    definition.manualFirstPublication !== undefined &&
    compareVersions(version, definition.manualFirstPublication) === 0
  ) {
    skipped += 1;
    console.log(
      `defer ${packageName}@${version}: npm requires an authenticated first publication before trusted publishing can be configured`,
    );
    continue;
  }

  const args = [
    "publish",
    tarballPath,
    "--access",
    "public",
    ...(mode === "dry-run" ? ["--dry-run"] : ["--provenance"]),
  ];
  run("npm", args);
  published += 1;
}

console.log(`${mode} complete: ${published} package(s) processed, ${skipped} skipped`);

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
