import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const packagePaths = [
  "package.json",
  "packages/claude-code-plugin/package.json",
  "packages/cli/package.json",
  "packages/codex-plugin/package.json",
  "packages/core/package.json",
  "packages/memory/package.json",
  "packages/mcp-server/package.json",
];

export const pluginManifestPaths = [
  "packages/claude-code-plugin/.claude-plugin/plugin.json",
  "packages/codex-plugin/.codex-plugin/plugin.json",
];

export const pluginRuntimeConfigPaths = [
  "packages/claude-code-plugin/.mcp.json",
  "packages/claude-code-plugin/hooks/hooks.json",
  "packages/codex-plugin/.mcp.json",
  "packages/codex-plugin/hooks/hooks.json",
];

export const publicReleaseReferencePaths = [
  "AGENTS.md",
  "README.md",
  "docs/getting-started/clean-install.md",
  "docs/getting-started/index.md",
  "docs/index.md",
  "docs/operations/claude-code-plugin.md",
  "docs/operations/codex-plugin.md",
  "docs/operations/local-cli.md",
  "docs/operations/npm-publishing.md",
  "docs/operations/optional-semantics.md",
  "docs/operations/versioning.md",
];

export const nuzoWorkspaceDependencies = new Set([
  "@nuzo/memory-core",
  "@nuzo/memory-cli",
  "@nuzo/memory",
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
  if (version.length > 128) {
    fail("release version is too long");
  }
  if (version.startsWith("v")) {
    fail("release version must not include the v tag prefix");
  }
  if (
    !isValidReleaseVersion(version)
  ) {
    fail(`invalid SemVer version: ${version}`);
  }
}

export function isValidReleaseVersion(version) {
  return /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(
    version,
  );
}

export function isLocalDependencyReference(spec) {
  return (
    typeof spec !== "string" ||
    /^(?:file|link|workspace):/i.test(spec) ||
    spec.startsWith(".") ||
    spec.startsWith("/")
  );
}

export function isSensitiveRehearsalPath(relativePath) {
  const segments = relativePath.split(/[\\/]/);
  const name = basename(relativePath);
  if (
    name === "AGENTS.local.md" ||
    name === ".npmrc" ||
    name === ".env" ||
    (name.startsWith(".env.") && name !== ".env.example") ||
    name.startsWith("npm-debug.log") ||
    name.endsWith(".sqlite") ||
    name.includes(".sqlite-") ||
    name.endsWith(".memory.export.json") ||
    name.endsWith(".memory.export.md")
  ) {
    return true;
  }
  return segments[0] === ".nuzo" && segments[1] === "memory";
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

export function assertReleaseFileListsAreComplete() {
  assertSameSet("release package paths", packagePaths, discoverPackagePaths());
  assertSameSet("plugin manifest paths", pluginManifestPaths, discoverPluginManifestPaths());
}

function discoverPackagePaths() {
  const paths = ["package.json"];
  for (const directoryName of readdirSync(join(repositoryRoot, "packages")).sort()) {
    const packageJsonPath = join("packages", directoryName, "package.json");
    if (isFile(packageJsonPath)) {
      paths.push(packageJsonPath);
    }
  }
  return paths;
}

function discoverPluginManifestPaths() {
  const paths = [];
  for (const directoryName of readdirSync(join(repositoryRoot, "packages")).sort()) {
    for (const manifestDirectory of [".claude-plugin", ".codex-plugin"]) {
      const manifestPath = join("packages", directoryName, manifestDirectory, "plugin.json");
      if (isFile(manifestPath)) {
        paths.push(manifestPath);
      }
    }
  }
  return paths;
}

function isFile(relativePath) {
  try {
    return statSync(join(repositoryRoot, relativePath)).isFile();
  } catch (error) {
    if (error?.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function assertSameSet(label, configured, discovered) {
  const configuredSet = new Set(configured);
  const discoveredSet = new Set(discovered);
  const missing = discovered.filter((path) => !configuredSet.has(path));
  const stale = configured.filter((path) => !discoveredSet.has(path));
  if (missing.length > 0 || stale.length > 0) {
    fail(
      `${label} are out of date` +
        formatPathList("missing", missing) +
        formatPathList("stale", stale),
    );
  }
}

function formatPathList(label, paths) {
  return paths.length === 0 ? "" : `; ${label}: ${paths.join(", ")}`;
}

export function fail(message) {
  console.error(`release validation failed: ${message}`);
  process.exit(1);
}
