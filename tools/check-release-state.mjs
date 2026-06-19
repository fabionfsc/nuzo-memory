#!/usr/bin/env node
import {
  assertReleaseVersion,
  fail,
  packagePaths,
  pluginManifestPaths,
  readJson,
  readText,
  nuzoWorkspaceDependencies,
} from "./release-shared.mjs";

const rootPackage = readJson("package.json");
const version = process.argv[2] ?? rootPackage.version;
assertReleaseVersion(version);

for (const packagePath of packagePaths) {
  const pkg = readJson(packagePath);
  if (pkg.version !== version) {
    fail(`${packagePath} has version ${pkg.version}, expected ${version}`);
  }
  assertNuzoDependencies(packagePath, pkg, version);
}

for (const manifestPath of pluginManifestPaths) {
  const manifest = readJson(manifestPath);
  if (manifest.version !== version) {
    fail(`${manifestPath} has version ${manifest.version}, expected ${version}`);
  }
}

const lockfile = readJson("package-lock.json");
if (lockfile.version !== version) {
  fail(`package-lock.json has version ${lockfile.version}, expected ${version}`);
}
for (const packagePath of ["", ...packagePaths.filter((path) => path !== "package.json").map((path) => path.replace(/\/package\.json$/, ""))]) {
  const lockPackage = lockfile.packages?.[packagePath];
  if (lockPackage === undefined) {
    fail(`package-lock.json is missing packages[${JSON.stringify(packagePath)}]`);
  }
  if (lockPackage.version !== version) {
    fail(`package-lock.json packages[${JSON.stringify(packagePath)}] has version ${lockPackage.version}, expected ${version}`);
  }
  assertNuzoDependencies(`package-lock.json packages[${JSON.stringify(packagePath)}]`, lockPackage, version);
}

assertSourceVersion("packages/cli/src/index.ts", /\.version\("([^"]+)"\)/, version);
assertSourceVersion("packages/mcp-server/src/index.ts", /version: "([^"]+)"/, version);
assertChangelog(version);

console.log(`release state is consistent for ${version}`);

function assertNuzoDependencies(location, pkg, expectedVersion) {
  for (const section of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
    const dependencies = pkg[section];
    if (dependencies === undefined) {
      continue;
    }
    for (const [dependencyName, dependencyVersion] of Object.entries(dependencies)) {
      if (nuzoWorkspaceDependencies.has(dependencyName) && dependencyVersion !== expectedVersion) {
        fail(`${location} depends on ${dependencyName}@${dependencyVersion}, expected ${expectedVersion}`);
      }
    }
  }
}

function assertSourceVersion(relativePath, pattern, expectedVersion) {
  const content = readText(relativePath);
  const match = content.match(pattern);
  if (match === null) {
    fail(`${relativePath} does not contain the expected version literal`);
  }
  if (match[1] !== expectedVersion) {
    fail(`${relativePath} reports version ${match[1]}, expected ${expectedVersion}`);
  }
}

function assertChangelog(expectedVersion) {
  const changelog = readText("CHANGELOG.md");
  if (!changelog.includes("## [Unreleased]")) {
    fail("CHANGELOG.md must keep an [Unreleased] section");
  }
  if (expectedVersion === "0.0.0") {
    return;
  }
  if (!changelog.includes(`## [${expectedVersion}] - `)) {
    fail(`CHANGELOG.md must contain a dated ## [${expectedVersion}] - YYYY-MM-DD section`);
  }
}
