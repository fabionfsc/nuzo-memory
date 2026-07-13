import assert from "node:assert/strict";
import { rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  inspectNpmPublishTarget,
  npmArtifactIntegrity,
  npmArtifactTarballPath,
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

function createTarball(context) {
  const tarballPath = join(tmpdir(), `nuzo-integrity-${process.pid}-${Date.now()}-${Math.random()}.tgz`);
  writeFileSync(tarballPath, "synthetic npm tarball fixture", "utf8");
  context.after(() => rmSync(tarballPath, { force: true }));
  return tarballPath;
}
