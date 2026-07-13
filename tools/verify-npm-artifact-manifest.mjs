#!/usr/bin/env node
import { resolve } from "node:path";
import { assertReleaseVersion, fail } from "./release-shared.mjs";
import { verifyNpmArtifactManifest } from "./npm-artifact-integrity.mjs";
import { publishableNpmPackagesForVersion } from "./npm-package-policy.mjs";

const version = process.argv[2];
const expectedManifestSha256 = process.argv[3] || undefined;
const artifactRoot = resolve(process.argv[4] ?? "build/npm");

assertReleaseVersion(version);
if (
  process.argv[3] !== undefined &&
  !/^[0-9a-f]{64}$/u.test(process.argv[3])
) {
  fail("expected npm artifact manifest SHA-256 must contain 64 lowercase hexadecimal characters");
}

try {
  const result = verifyNpmArtifactManifest({
    artifactRoot,
    version,
    packageNames: publishableNpmPackagesForVersion(version).map((definition) => definition.name),
    expectedManifestSha256,
  });
  console.log(`npm artifact manifest verified: ${version} sha256:${result.manifestSha256}`);
  if (result.manifest.sourceCommit !== null) {
    console.log(`source commit: ${result.manifest.sourceCommit}`);
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
