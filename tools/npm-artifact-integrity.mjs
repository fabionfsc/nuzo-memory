import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

export function npmArtifactTarballPath(packageName, version, tarballsRoot = join("build", "npm", "tarballs")) {
  const filename = `${packageName.replace(/^@/u, "").replaceAll("/", "-")}-${version}.tgz`;
  return join(tarballsRoot, filename);
}

export function npmArtifactIntegrity(tarballPath) {
  const digest = createHash("sha512").update(readFileSync(tarballPath)).digest("base64");
  return `sha512-${digest}`;
}

export function inspectNpmPublishTarget({
  packageName,
  version,
  tarballPath,
  runNpmView = defaultNpmView,
}) {
  const localIntegrity = npmArtifactIntegrity(tarballPath);
  const result = runNpmView(packageName, version);
  if (result.error) {
    throw result.error;
  }

  if (result.status === 0) {
    const metadata = parseMetadata(result.stdout, packageName, version);
    if (metadata.version !== version) {
      throw new Error(
        `npm registry returned version ${JSON.stringify(metadata.version)} for ${packageName}@${version}`,
      );
    }
    if (metadata["dist.integrity"] !== localIntegrity) {
      throw new Error(
        `published artifact integrity mismatch for ${packageName}@${version}: ` +
          `registry=${JSON.stringify(metadata["dist.integrity"])} local=${localIntegrity}`,
      );
    }
    return { status: "published-identical", integrity: localIntegrity };
  }

  const stderr = result.stderr ?? "";
  if (stderr.includes("E404")) {
    return { status: "unpublished", integrity: localIntegrity };
  }
  throw new Error(
    `could not verify ${packageName}@${version} publish target: ${stderr.trim() || `npm exited ${result.status}`}`,
  );
}

function defaultNpmView(packageName, version) {
  return spawnSync(
    "npm",
    ["view", `${packageName}@${version}`, "version", "dist.integrity", "--json"],
    { encoding: "utf8" },
  );
}

function parseMetadata(stdout, packageName, version) {
  try {
    const metadata = JSON.parse(stdout);
    if (metadata === null || typeof metadata !== "object" || Array.isArray(metadata)) {
      throw new Error("metadata is not an object");
    }
    return metadata;
  } catch (error) {
    throw new Error(
      `could not parse npm metadata for ${packageName}@${version}: ${error.message}`,
      { cause: error },
    );
  }
}
