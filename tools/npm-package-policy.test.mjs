import assert from "node:assert/strict";
import test from "node:test";

import {
  isAfterLegacyPackageCutoff,
  legacyPackageCutoff,
  publishableNpmPackagesForVersion,
  retiredLegacyNpmPackagesForVersion,
} from "./npm-package-policy.mjs";

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

function packageNames(definitions) {
  return definitions.map((definition) => definition.name);
}
