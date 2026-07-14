import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  npmArtifactIntegrity,
  npmArtifactSha256,
  npmArtifactTarballPath,
} from "./npm-artifact-integrity.mjs";
import { publishableNpmPackagesForVersion } from "./npm-package-policy.mjs";

const repositoryRoot = resolve(import.meta.dirname, "..");
const sourceCommit = "a".repeat(40);

test("external target checker validates retained artifacts without staging packages", (context) => {
  const fixture = createFixture(context, "1.1.0");
  const result = runTool(fixture, "check-npm-publish-targets.mjs", [
    "1.1.0",
    fixture.tarballsRoot,
    fixture.manifestSha256,
    sourceCommit,
  ]);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /3 npm publish target\(s\) are available/u);
});

test("external target checker rejects an unbound sibling directory", (context) => {
  const fixture = createFixture(context, "1.1.0");
  const unbound = join(fixture.artifactRoot, "unbound");
  mkdirSync(unbound);
  const result = runTool(fixture, "check-npm-publish-targets.mjs", [
    "1.1.0",
    unbound,
    fixture.manifestSha256,
    sourceCommit,
  ]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /manifest-bound tarballs sibling/u);
});

test("external tools reject a wrong manifest hash or source commit before npm access", (context) => {
  const fixture = createFixture(context, "1.1.0");
  for (const [filename, args, expected] of [
    [
      "check-npm-publish-targets.mjs",
      ["1.1.0", fixture.tarballsRoot, "0".repeat(64), sourceCommit],
      /manifest checksum mismatch/u,
    ],
    [
      "publish-npm-artifacts.mjs",
      ["1.1.0", "publish", fixture.tarballsRoot, fixture.manifestSha256, "b".repeat(40)],
      /source commit mismatch/u,
    ],
  ]) {
    const result = runTool(fixture, filename, args);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, expected);
  }
});

test("external publisher uses retained tarballs and defers build-equivalent first publication", (context) => {
  const version = "1.1.0+build.1";
  const fixture = createFixture(context, version);
  const result = runTool(fixture, "publish-npm-artifacts.mjs", [
    version,
    "publish",
    fixture.tarballsRoot,
    fixture.manifestSha256,
    sourceCommit,
  ]);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /defer @nuzo\/memory-mcp@1\.1\.0\+build\.1/u);
  const calls = fixture.readCalls();
  const publishCalls = calls.filter((args) => args[0] === "publish");
  assert.equal(publishCalls.length, 2);
  for (const args of publishCalls) {
    assert.equal(dirname(args[1]), fixture.tarballsRoot);
    assert.deepEqual(args.slice(2), ["--access", "public", "--provenance"]);
  }
});

function createFixture(context, version) {
  const root = mkdtempSync(join(tmpdir(), "nuzo-external-artifacts-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  const artifactRoot = join(root, "candidate");
  const tarballsRoot = join(artifactRoot, "tarballs");
  const binRoot = join(root, "bin");
  const logPath = join(root, "npm-calls.jsonl");
  mkdirSync(tarballsRoot, { recursive: true });
  mkdirSync(binRoot);

  const packages = publishableNpmPackagesForVersion(version).map((definition) => {
    const tarballPath = npmArtifactTarballPath(definition.name, version, tarballsRoot);
    writeFileSync(tarballPath, `retained bytes for ${definition.name}@${version}\n`, "utf8");
    return {
      name: definition.name,
      version,
      filename: tarballPath.slice(tarballsRoot.length + 1),
      size: statSync(tarballPath).size,
      integrity: npmArtifactIntegrity(tarballPath),
      sha256: npmArtifactSha256(tarballPath),
    };
  });
  const manifestPath = join(artifactRoot, "artifact-manifest.json");
  writeFileSync(manifestPath, `${JSON.stringify({
    schemaVersion: 1,
    version,
    sourceCommit,
    packages,
  }, null, 2)}\n`, "utf8");

  const fakeNpm = join(binRoot, "npm");
  writeFileSync(fakeNpm, `#!/usr/bin/env node
import { appendFileSync } from "node:fs";
const args = process.argv.slice(2);
appendFileSync(process.env.NPM_FAKE_LOG, JSON.stringify(args) + "\\n");
if (args[0] === "view") {
  process.stderr.write("npm error code E404\\n");
  process.exit(1);
}
`, "utf8");
  chmodSync(fakeNpm, 0o755);

  return {
    root,
    artifactRoot,
    tarballsRoot,
    binRoot,
    logPath,
    manifestSha256: npmArtifactSha256(manifestPath),
    readCalls() {
      return readFileSync(logPath, "utf8")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line));
    },
  };
}

function runTool(fixture, filename, args) {
  return spawnSync(process.execPath, [join(repositoryRoot, "tools", filename), ...args], {
    cwd: fixture.root,
    encoding: "utf8",
    env: {
      ...process.env,
      NPM_FAKE_LOG: fixture.logPath,
      PATH: `${fixture.binRoot}:${process.env.PATH}`,
    },
  });
}
