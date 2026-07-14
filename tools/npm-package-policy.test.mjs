import assert from "node:assert/strict";
import test from "node:test";

import {
  compareVersions,
  isAfterLegacyPackageCutoff,
  legacyPackageCutoff,
  npmPackageDefinitions,
  publishableNpmPackagesForVersion,
  retiredLegacyNpmPackagesForVersion,
} from "./npm-package-policy.mjs";

test("SemVer comparison preserves arbitrarily large numeric prerelease identifiers", () => {
  assert.equal(
    compareVersions(
      "1.1.0-99999999999999999999999999999999999998",
      "1.1.0-99999999999999999999999999999999999999",
    ),
    -1,
  );
  assert.equal(compareVersions("1.1.0+build.1", "1.1.0"), 0);
  assert.equal(
    compareVersions("9007199254740992.0.0", "9007199254740993.0.0"),
    -1,
  );
});

test("legacy transition packages remain staged through their final 0.9.0 release", () => {
  assert.equal(legacyPackageCutoff, "0.9.0");
  assert.equal(isAfterLegacyPackageCutoff("0.8.1"), false);
  assert.equal(isAfterLegacyPackageCutoff("0.9.0-beta.1"), false);
  assert.equal(isAfterLegacyPackageCutoff("0.9.0"), false);
  assert.deepEqual(packageNames(publishableNpmPackagesForVersion("0.9.0")), [
    "@nuzo/memory-core",
    "@nuzo/memory-cli",
    "@nuzo/memory",
    "@nuzo/mcp-server",
  ]);
  assert.deepEqual(retiredLegacyNpmPackagesForVersion("0.9.0"), []);
});

test("legacy transition package staging stops after 0.9.0", () => {
  assert.equal(isAfterLegacyPackageCutoff("0.9.1"), true);
  assert.equal(isAfterLegacyPackageCutoff("1.0.0-beta.1"), true);
  assert.equal(isAfterLegacyPackageCutoff("1.0.0"), true);
  assert.deepEqual(packageNames(publishableNpmPackagesForVersion("1.0.0")), [
    "@nuzo/memory-core",
    "@nuzo/memory",
  ]);
  assert.deepEqual(packageNames(retiredLegacyNpmPackagesForVersion("1.0.0")), [
    "@nuzo/memory-cli",
    "@nuzo/mcp-server",
  ]);
});

test("MCP Registry distribution starts with the 1.1.0 release", () => {
  assert.deepEqual(packageNames(publishableNpmPackagesForVersion("1.0.1")), [
    "@nuzo/memory-core",
    "@nuzo/memory",
  ]);
  assert.deepEqual(packageNames(publishableNpmPackagesForVersion("1.1.0")), [
    "@nuzo/memory-core",
    "@nuzo/memory",
    "@nuzo/memory-mcp",
  ]);
  assert.deepEqual(packageNames(publishableNpmPackagesForVersion("1.1.0-beta.1")), [
    "@nuzo/memory-core",
    "@nuzo/memory",
  ]);
  assert.deepEqual(packageNames(publishableNpmPackagesForVersion("1.1.1-beta.1")), [
    "@nuzo/memory-core",
    "@nuzo/memory",
    "@nuzo/memory-mcp",
  ]);
  assert.equal(
    npmPackageDefinitions.find((definition) => definition.name === "@nuzo/memory-mcp")?.manualFirstPublication,
    "1.1.0",
  );
});

function packageNames(definitions) {
  return definitions.map((definition) => definition.name);
}
