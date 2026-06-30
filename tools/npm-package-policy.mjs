export const legacyPackageCutoff = "0.9.0";

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
