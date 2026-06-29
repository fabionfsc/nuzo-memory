#!/usr/bin/env node
import {
  assertReleaseVersion,
  fail,
  packagePaths,
  pluginManifestPaths,
  pluginRuntimeConfigPaths,
  publicReleaseReferencePaths,
  readJson,
  readText,
  updateNuzoDependencyVersions,
  writeJson,
  writeText,
} from "./release-shared.mjs";

const version = process.argv[2];
assertReleaseVersion(version);
const currentVersion = readJson("package.json").version;

if (version === "0.0.0") {
  fail("0.0.0 is reserved for unreleased development state");
}

const changelog = readText("CHANGELOG.md");
if (!changelog.includes(`## [${version}] - `)) {
  fail(`CHANGELOG.md must contain a dated ## [${version}] - YYYY-MM-DD section before preparing release`);
}

for (const packagePath of packagePaths) {
  const pkg = readJson(packagePath);
  pkg.version = version;
  updateNuzoDependencyVersions(pkg, version);
  writeJson(packagePath, pkg);
}

for (const manifestPath of pluginManifestPaths) {
  const manifest = readJson(manifestPath);
  manifest.version = version;
  writeJson(manifestPath, manifest);
}

for (const runtimeConfigPath of pluginRuntimeConfigPaths) {
  const content = readText(runtimeConfigPath);
  const currentSpec = `@nuzo/memory@${currentVersion}`;
  if (!content.includes(currentSpec)) {
    fail(`${runtimeConfigPath} does not contain the expected runtime package ${currentSpec}`);
  }
  writeText(runtimeConfigPath, content.replaceAll(currentSpec, `@nuzo/memory@${version}`));
}

const lockfile = readJson("package-lock.json");
lockfile.version = version;
for (const [packagePath, pkg] of Object.entries(lockfile.packages ?? {})) {
  if (packagePath === "" || packagePath.startsWith("packages/")) {
    pkg.version = version;
    updateNuzoDependencyVersions(pkg, version);
  }
}
writeJson("package-lock.json", lockfile);

replaceLiteralVersion("packages/cli/src/index.ts", /\.version\("([^"]+)"\)/, `.version("${version}")`);
replaceLiteralVersion(
  "packages/mcp-server/src/index.ts",
  /version: "([^"]+)"/,
  `version: "${version}"`,
);
for (const relativePath of publicReleaseReferencePaths) {
  replacePublicReleaseReference(relativePath, currentVersion, version);
}

console.log(`prepared Nuzo release version ${version}`);

function replaceLiteralVersion(relativePath, pattern, replacement) {
  const content = readText(relativePath);
  if (!pattern.test(content)) {
    fail(`${relativePath} does not contain the expected version literal`);
  }
  writeText(relativePath, content.replace(pattern, replacement));
}

function replacePublicReleaseReference(relativePath, fromVersion, toVersion) {
  const content = readText(relativePath);
  const next = content
    .replaceAll(fromVersion, toVersion)
    .replaceAll(`v${fromVersion}`, `v${toVersion}`)
    .replaceAll(`release-v${fromVersion}`, `release-v${toVersion}`);
  if (next !== content) {
    writeText(relativePath, next);
  }
}
