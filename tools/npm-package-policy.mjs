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
    definition.legacy !== true || !isAfterLegacyPackageCutoff(version)
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
  const leftParts = left.split("-", 1)[0].split(".").map(Number);
  const rightParts = right.split("-", 1)[0].split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    const difference = leftParts[index] - rightParts[index];
    if (difference !== 0) return difference;
  }
  return 0;
}
