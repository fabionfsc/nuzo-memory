import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
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

export function npmArtifactSha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function verifyNpmArtifactManifest({
  artifactRoot,
  version,
  packageNames,
  expectedManifestSha256,
}) {
  const manifestPath = join(artifactRoot, "artifact-manifest.json");
  const manifestSha256 = npmArtifactSha256(manifestPath);
  if (
    expectedManifestSha256 !== undefined &&
    manifestSha256 !== expectedManifestSha256
  ) {
    throw new Error(
      `npm artifact manifest checksum mismatch: expected=${expectedManifestSha256} actual=${manifestSha256}`,
    );
  }

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest.schemaVersion !== 1 || manifest.version !== version) {
    throw new Error(`npm artifact manifest does not describe release ${version}`);
  }
  if (
    manifest.sourceCommit !== null &&
    !/^[0-9a-f]{40}$/u.test(manifest.sourceCommit)
  ) {
    throw new Error("npm artifact manifest sourceCommit must be a full Git commit or null");
  }
  if (!Array.isArray(manifest.packages)) {
    throw new Error("npm artifact manifest packages must be an array");
  }

  const expectedNames = [...packageNames].sort();
  const actualNames = manifest.packages.map((entry) => entry.name).sort();
  if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
    throw new Error(
      `npm artifact manifest package set mismatch: expected=${expectedNames.join(",")} actual=${actualNames.join(",")}`,
    );
  }

  for (const entry of manifest.packages) {
    const tarballPath = npmArtifactTarballPath(entry.name, version, join(artifactRoot, "tarballs"));
    const expectedFilename = tarballPath.split(/[\\/]/u).at(-1);
    if (entry.version !== version || entry.filename !== expectedFilename) {
      throw new Error(`npm artifact manifest metadata mismatch for ${entry.name}`);
    }
    if (entry.size !== statSync(tarballPath).size) {
      throw new Error(`npm artifact size mismatch for ${entry.name}@${version}`);
    }
    const integrity = npmArtifactIntegrity(tarballPath);
    const sha256 = npmArtifactSha256(tarballPath);
    if (entry.integrity !== integrity || entry.sha256 !== sha256) {
      throw new Error(`npm artifact checksum mismatch for ${entry.name}@${version}`);
    }
  }

  return { manifest, manifestPath, manifestSha256 };
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
