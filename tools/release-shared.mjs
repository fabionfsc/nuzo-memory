import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const packagePaths = [
  "package.json",
  "packages/claude-code-plugin/package.json",
  "packages/cli/package.json",
  "packages/codex-plugin/package.json",
  "packages/core/package.json",
  "packages/mcp-server/package.json",
];

export const nuzoWorkspaceDependencies = new Set([
  "@nuzo/memory-core",
  "@nuzo/memory-cli",
  "@nuzo/mcp-server",
  "@nuzo/codex-plugin",
  "@nuzo/claude-code-plugin",
]);

export function readText(relativePath) {
  return readFileSync(join(repositoryRoot, relativePath), "utf8");
}

export function writeText(relativePath, content) {
  writeFileSync(join(repositoryRoot, relativePath), content, "utf8");
}

export function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

export function writeJson(relativePath, value) {
  writeText(relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function assertReleaseVersion(version) {
  if (typeof version !== "string" || version.length === 0) {
    fail("missing release version");
  }
  if (version.startsWith("v")) {
    fail("release version must not include the v tag prefix");
  }
  if (
    !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(
      version,
    )
  ) {
    fail(`invalid SemVer version: ${version}`);
  }
}

export function updateNuzoDependencyVersions(pkg, version) {
  for (const section of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
    const dependencies = pkg[section];
    if (dependencies === undefined) {
      continue;
    }
    for (const dependencyName of Object.keys(dependencies)) {
      if (nuzoWorkspaceDependencies.has(dependencyName)) {
        dependencies[dependencyName] = version;
      }
    }
  }
}

export function fail(message) {
  console.error(`release validation failed: ${message}`);
  process.exit(1);
}
