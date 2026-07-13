export const legacyPackageCutoff = "0.9.0";

export const npmPackageDefinitions = [
  {
    name: "@nuzo/memory-core",
    source: "packages/core",
    output: "memory-core",
    packageJson: "build/npm/packages/memory-core/package.json",
    kind: "source",
  },
  {
    name: "@nuzo/memory-cli",
    source: "packages/cli",
    output: "memory-cli",
    packageJson: "build/npm/packages/memory-cli/package.json",
    kind: "source",
    legacy: true,
  },
  {
    name: "@nuzo/memory",
    source: "packages/memory",
    output: "memory",
    packageJson: "build/npm/packages/memory/package.json",
    kind: "unified",
  },
  {
    name: "@nuzo/memory-mcp",
    source: "packages/registry-server",
    output: "memory-mcp",
    packageJson: "build/npm/packages/memory-mcp/package.json",
    kind: "registry",
    introduced: "1.1.0",
    manualFirstPublication: "1.1.0",
  },
  {
    name: "@nuzo/mcp-server",
    source: "packages/mcp-server",
    output: "mcp-server",
    packageJson: "build/npm/packages/mcp-server/package.json",
    kind: "source",
    legacy: true,
  },
];

export function publishableNpmPackagesForVersion(version) {
  return npmPackageDefinitions.filter((definition) =>
    (definition.legacy !== true || !isAfterLegacyPackageCutoff(version)) &&
    (definition.introduced === undefined || isAtLeastVersion(version, definition.introduced))
  );
}

export function retiredLegacyNpmPackagesForVersion(version) {
  if (!isAfterLegacyPackageCutoff(version)) {
    return [];
  }
  return npmPackageDefinitions.filter((definition) => definition.legacy === true);
}

export function isAfterLegacyPackageCutoff(version) {
  return compareVersions(version, legacyPackageCutoff) > 0;
}

export function isAtLeastVersion(version, minimum) {
  return compareVersions(version, minimum) >= 0;
}

export function compareVersions(left, right) {
  const leftVersion = parseComparableVersion(left);
  const rightVersion = parseComparableVersion(right);
  for (let index = 0; index < 3; index += 1) {
    const difference = leftVersion.core[index] - rightVersion.core[index];
    if (difference !== 0) return difference;
  }
  if (leftVersion.prerelease === null && rightVersion.prerelease === null) return 0;
  if (leftVersion.prerelease === null) return 1;
  if (rightVersion.prerelease === null) return -1;

  const length = Math.max(leftVersion.prerelease.length, rightVersion.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = leftVersion.prerelease[index];
    const rightPart = rightVersion.prerelease[index];
    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;
    if (leftPart === rightPart) continue;
    const leftNumeric = /^\d+$/u.test(leftPart);
    const rightNumeric = /^\d+$/u.test(rightPart);
    if (leftNumeric && rightNumeric) return Number(leftPart) - Number(rightPart);
    if (leftNumeric) return -1;
    if (rightNumeric) return 1;
    return leftPart < rightPart ? -1 : 1;
  }
  return 0;
}

function parseComparableVersion(version) {
  const withoutBuild = version.split("+", 1)[0];
  const prereleaseSeparator = withoutBuild.indexOf("-");
  const core = (prereleaseSeparator === -1
    ? withoutBuild
    : withoutBuild.slice(0, prereleaseSeparator)).split(".").map(Number);
  const prerelease = prereleaseSeparator === -1
    ? null
    : withoutBuild.slice(prereleaseSeparator + 1).split(".");
  return { core, prerelease };
}
