#!/usr/bin/env node
import {
  assertReleaseVersion,
  fail,
  packagePaths,
  readJson,
  readText,
  updateNuzoDependencyVersions,
  writeJson,
  writeText,
} from "./release-shared.mjs";

const version = process.argv[2];
assertReleaseVersion(version);

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

console.log(`prepared Nuzo release version ${version}`);

function replaceLiteralVersion(relativePath, pattern, replacement) {
  const content = readText(relativePath);
  if (!pattern.test(content)) {
    fail(`${relativePath} does not contain the expected version literal`);
  }
  writeText(relativePath, content.replace(pattern, replacement));
}
