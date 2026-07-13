import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  inspectNpmPublishTarget,
  npmArtifactIntegrity,
  npmArtifactRootFromTarballs,
  npmArtifactSha256,
  npmArtifactTarballPath,
  verifyNpmArtifactManifest,
} from "./npm-artifact-integrity.mjs";

const packageName = "@nuzo/memory-core";
const version = "1.1.0";

test("npm artifact target reports an unpublished version", (context) => {
  const tarballPath = createTarball(context);
  const state = inspectNpmPublishTarget({
    packageName,
    version,
    tarballPath,
    runNpmView: () => ({ status: 1, stdout: "", stderr: "npm error code E404" }),
  });

  assert.deepEqual(state, {
    status: "unpublished",
    integrity: npmArtifactIntegrity(tarballPath),
  });
});

test("npm artifact target accepts an existing identical tarball", (context) => {
  const tarballPath = createTarball(context);
  const integrity = npmArtifactIntegrity(tarballPath);
  const state = inspectNpmPublishTarget({
    packageName,
    version,
    tarballPath,
    runNpmView: () => ({
      status: 0,
      stdout: JSON.stringify({ version, "dist.integrity": integrity }),
      stderr: "",
    }),
  });

  assert.deepEqual(state, { status: "published-identical", integrity });
});

test("npm artifact target rejects an existing divergent tarball", (context) => {
  const tarballPath = createTarball(context);

  assert.throws(
    () => inspectNpmPublishTarget({
      packageName,
      version,
      tarballPath,
      runNpmView: () => ({
        status: 0,
        stdout: JSON.stringify({ version, "dist.integrity": "sha512-different" }),
        stderr: "",
      }),
    }),
    /published artifact integrity mismatch/u,
  );
});

test("npm artifact target fails closed on a registry error", (context) => {
  const tarballPath = createTarball(context);

  assert.throws(
    () => inspectNpmPublishTarget({
      packageName,
      version,
      tarballPath,
      runNpmView: () => ({ status: 1, stdout: "", stderr: "npm error code E500" }),
    }),
    /could not verify .*E500/u,
  );
});

test("npm artifact tarball path matches npm pack naming", () => {
  assert.equal(
    npmArtifactTarballPath("@nuzo/memory-mcp", "1.1.0"),
    join("build", "npm", "tarballs", "nuzo-memory-mcp-1.1.0.tgz"),
  );
});

test("external npm artifacts require the manifest-bound tarballs sibling", (context) => {
  const artifactRoot = mkdtempSync(join(tmpdir(), "nuzo-artifact-path-"));
  context.after(() => rmSync(artifactRoot, { recursive: true, force: true }));

  assert.deepEqual(npmArtifactRootFromTarballs(join(artifactRoot, "tarballs")), {
    artifactRoot,
    tarballsRoot: join(artifactRoot, "tarballs"),
  });
  assert.throws(
    () => npmArtifactRootFromTarballs(join(artifactRoot, "unbound")),
    /manifest-bound tarballs sibling/u,
  );
});

test("npm artifact manifest binds the exact package bytes", (context) => {
  const artifactRoot = createArtifactRoot(context);
  const result = verifyNpmArtifactManifest({
    artifactRoot,
    version,
    packageNames: [packageName],
  });

  assert.match(result.manifestSha256, /^[0-9a-f]{64}$/u);
  assert.equal(
    verifyNpmArtifactManifest({
      artifactRoot,
      version,
      packageNames: [packageName],
      expectedManifestSha256: result.manifestSha256,
    }).manifestSha256,
    result.manifestSha256,
  );
});

test("npm artifact manifest rejects a changed tarball", (context) => {
  const artifactRoot = createArtifactRoot(context);
  const tarballPath = npmArtifactTarballPath(packageName, version, join(artifactRoot, "tarballs"));
  writeFileSync(tarballPath, "changed after review", "utf8");

  assert.throws(
    () => verifyNpmArtifactManifest({
      artifactRoot,
      version,
      packageNames: [packageName],
    }),
    /npm artifact (size|checksum) mismatch/u,
  );
});

test("npm artifact manifest rejects a different reviewed manifest", (context) => {
  const artifactRoot = createArtifactRoot(context);

  assert.throws(
    () => verifyNpmArtifactManifest({
      artifactRoot,
      version,
      packageNames: [packageName],
      expectedManifestSha256: "0".repeat(64),
    }),
    /npm artifact manifest checksum mismatch/u,
  );
});

test("npm artifact manifest binds the expected source commit", (context) => {
  const sourceCommit = "1".repeat(40);
  const artifactRoot = createArtifactRoot(context, { sourceCommit });

  assert.equal(
    verifyNpmArtifactManifest({
      artifactRoot,
      version,
      packageNames: [packageName],
      expectedSourceCommit: sourceCommit,
    }).manifest.sourceCommit,
    sourceCommit,
  );
  assert.throws(
    () => verifyNpmArtifactManifest({
      artifactRoot,
      version,
      packageNames: [packageName],
      expectedSourceCommit: "2".repeat(40),
    }),
    /npm artifact source commit mismatch/u,
  );
});

function createTarball(context) {
  const directory = mkdtempSync(join(tmpdir(), "nuzo-integrity-"));
  const tarballPath = join(directory, "synthetic.tgz");
  writeFileSync(tarballPath, "synthetic npm tarball fixture", "utf8");
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  return tarballPath;
}

function createArtifactRoot(context, { sourceCommit = null } = {}) {
  const artifactRoot = mkdtempSync(join(tmpdir(), "nuzo-artifact-manifest-"));
  const tarballsRoot = join(artifactRoot, "tarballs");
  mkdirSync(tarballsRoot);
  const tarballPath = npmArtifactTarballPath(packageName, version, tarballsRoot);
  writeFileSync(tarballPath, "reviewed synthetic npm tarball", "utf8");
  writeFileSync(
    join(artifactRoot, "artifact-manifest.json"),
    `${JSON.stringify({
      schemaVersion: 1,
      version,
      sourceCommit,
      packages: [{
        name: packageName,
        version,
        filename: tarballPath.split(/[\\/]/u).at(-1),
        size: statSync(tarballPath).size,
        integrity: npmArtifactIntegrity(tarballPath),
        sha256: npmArtifactSha256(tarballPath),
      }],
    }, null, 2)}\n`,
    "utf8",
  );
  context.after(() => rmSync(artifactRoot, { recursive: true, force: true }));
  return artifactRoot;
}
