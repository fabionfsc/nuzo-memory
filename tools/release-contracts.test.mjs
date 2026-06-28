import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  isLocalDependencyReference,
  isSensitiveRehearsalPath,
  isValidReleaseVersion,
  publicReleaseReferencePaths,
} from "./release-shared.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("release version validation accepts strict SemVer", () => {
  for (const version of [
    "0.1.0",
    "1.0.0",
    "1.0.0-alpha.1",
    "1.0.0-alpha-1+build.7",
  ]) {
    assert.equal(isValidReleaseVersion(version), true, version);
  }
});

for (const version of [
  "v1.0.0",
  "1.0",
  "1.0.0-01",
  "1.0.0-alpha..1",
  "1.0.0+build..1",
]) {
  test(`release version validation rejects ${version}`, () => {
    assert.equal(isValidReleaseVersion(version), false);
  });
}

test("manual release input is quoted through an environment variable", () => {
  const workflow = readFileSync(
    join(repositoryRoot, ".github", "workflows", "ci.yml"),
    "utf8",
  );

  assert.match(
    workflow,
    /RELEASE_REHEARSAL_VERSION: \$\{\{ inputs\.release_rehearsal_version \}\}/,
  );
  assert.match(
    workflow,
    /npm run release:rehearse -- "\$RELEASE_REHEARSAL_VERSION"/,
  );
  assert.doesNotMatch(
    workflow,
    /run:.*\$\{\{ inputs\.release_rehearsal_version \}\}/,
  );
});

test("npm release workflow uses manual OIDC publishing without tokens", () => {
  const workflow = readFileSync(
    join(repositoryRoot, ".github", "workflows", "release-npm.yml"),
    "utf8",
  );

  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /environment: npm-publish/);
  assert.match(workflow, /npm install --global "npm@\^11\.5\.1"/);
  assert.match(workflow, /PACKAGE_VERSION: \$\{\{ inputs\.package_version \}\}/);
  assert.match(workflow, /npm run release:check -- "\$PACKAGE_VERSION"/);
  assert.match(workflow, /node tools\/publish-npm-artifacts\.mjs "\$PACKAGE_VERSION" publish/);
  assert.match(workflow, /node tools\/publish-npm-artifacts\.mjs "\$PACKAGE_VERSION" dry-run/);
  assert.doesNotMatch(workflow, /NODE_AUTH_TOKEN|NPM_TOKEN/);
  assert.doesNotMatch(workflow, /pull_request:/);
});

test("local npm credentials and debug logs are ignored", () => {
  const gitignore = readFileSync(join(repositoryRoot, ".gitignore"), "utf8");

  assert.match(gitignore, /^\.npmrc$/m);
  assert.match(gitignore, /^npm-debug\.log\*$/m);
});

test("release rehearsal excludes local secrets and memory artifacts", () => {
  for (const path of [
    ".npmrc",
    ".env",
    ".env.local",
    "AGENTS.local.md",
    "npm-debug.log",
    ".nuzo/memory/memories.sqlite",
    "backup.memory.export.json",
  ]) {
    assert.equal(isSensitiveRehearsalPath(path), true, path);
  }
  for (const path of [".env.example", "docs/example.md", "packages/core/package.json"]) {
    assert.equal(isSensitiveRehearsalPath(path), false, path);
  }
});

test("npm staging rejects local dependency references", () => {
  for (const spec of [
    "file:../core",
    "link:../core",
    "workspace:*",
    "../core",
    "/tmp/core",
  ]) {
    assert.equal(isLocalDependencyReference(spec), true, spec);
  }
  for (const spec of ["0.1.0", "^1.2.3", "git+https://github.com/example/repo.git"]) {
    assert.equal(isLocalDependencyReference(spec), false, spec);
  }
});

test("npm artifact validation reuses the MCP tool contract", () => {
  const script = readFileSync(
    join(repositoryRoot, "tools", "validate-npm-artifacts.mjs"),
    "utf8",
  );

  assert.match(script, /tool-contract\.js/);
  assert.doesNotMatch(script, /const expectedMcpTools = \[/);
});

test("release tooling covers public release version references", () => {
  for (const path of publicReleaseReferencePaths) {
    assert.doesNotThrow(() => readFileSync(join(repositoryRoot, path), "utf8"), path);
  }

  const prepare = readFileSync(join(repositoryRoot, "tools", "prepare-release.mjs"), "utf8");
  const check = readFileSync(join(repositoryRoot, "tools", "check-release-state.mjs"), "utf8");
  const rehearse = readFileSync(join(repositoryRoot, "tools", "rehearse-release.mjs"), "utf8");

  assert.match(prepare, /publicReleaseReferencePaths/);
  assert.match(check, /publicReleaseReferencePaths/);
  assert.match(rehearse, /publicReleaseReferencePaths/);
});
