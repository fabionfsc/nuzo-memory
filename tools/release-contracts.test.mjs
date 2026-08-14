import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  isLocalDependencyReference,
  isSensitiveRehearsalPath,
  isValidReleaseVersion,
  publicReleaseReferencePaths,
  replaceCurrentPackageVersionBlock,
} from "./release-shared.mjs";
import { readTrackedMemoryToolNames } from "./mcp-tool-contract-source.mjs";

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
  assert.match(workflow, /actions: read/);
  assert.match(workflow, /environment: npm-publish/);
  assert.match(workflow, /npm install --global "npm@11\.5\.1"/);
  assert.match(workflow, /PACKAGE_VERSION: \$\{\{ inputs\.package_version \}\}/);
  assert.match(workflow, /npm run release:check -- "\$PACKAGE_VERSION"/);
  assert.match(
    workflow,
    /node tools\/publish-npm-artifacts\.mjs "\$PACKAGE_VERSION" publish build\/reviewed-npm\/tarballs "\$EXPECTED_MANIFEST_SHA256" "\$GITHUB_SHA"/,
  );
  assert.match(workflow, /node tools\/publish-npm-artifacts\.mjs "\$PACKAGE_VERSION" dry-run/);
  assert.match(workflow, /artifact_manifest_sha256:/);
  assert.match(workflow, /reviewed_run_id:/);
  assert.match(workflow, /GITHUB_TOKEN: \$\{\{ github\.token \}\}/);
  assert.match(workflow, /GH_TOKEN: \$\{\{ github\.token \}\}/);
  assert.match(
    workflow,
    /ARTIFACT_ID: \$\{\{ steps\.reviewed-run\.outputs\.artifact_id \}\}/,
  );
  assert.match(
    workflow,
    /node tools\/verify-npm-artifact-manifest\.mjs "\$PACKAGE_VERSION" "\$EXPECTED_MANIFEST_SHA256" build\/reviewed-npm "\$GITHUB_SHA"/,
  );
  assert.match(
    workflow,
    /node tools\/verify-reviewed-npm-run\.mjs "\$PACKAGE_VERSION" "\$REVIEWED_RUN_ID" "\$GITHUB_SHA"/,
  );
  assert.match(
    workflow,
    /gh api "\/repos\/\$GITHUB_REPOSITORY\/actions\/artifacts\/\$ARTIFACT_ID\/zip"/,
  );
  assert.match(workflow, /build\/reviewed-npm\/tarballs/);
  assert.match(
    workflow,
    /node tools\/check-npm-publish-targets\.mjs "\$PACKAGE_VERSION" build\/reviewed-npm\/tarballs "\$EXPECTED_MANIFEST_SHA256" "\$GITHUB_SHA"/,
  );
  assert.match(
    workflow,
    /actions\/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7\.0\.1/,
  );
  assert.match(workflow, /build\/npm\/artifact-manifest\.json/);
  assert.match(workflow, /build\/npm\/tarballs\/\*\.tgz/);
  assert.doesNotMatch(workflow, /NODE_AUTH_TOKEN|NPM_TOKEN/);
  assert.doesNotMatch(workflow, /run:[^\n]*\$\{\{ inputs\./u);
  assert.doesNotMatch(workflow, /pull_request:/);
  const reviewIndex = workflow.indexOf("node tools/verify-reviewed-npm-run.mjs");
  const downloadIndex = workflow.indexOf("gh api \"/repos/$GITHUB_REPOSITORY/actions/artifacts/$ARTIFACT_ID/zip\"");
  const retainedVerifyIndex = workflow.indexOf(
    "node tools/verify-npm-artifact-manifest.mjs \"$PACKAGE_VERSION\" \"$EXPECTED_MANIFEST_SHA256\" build/reviewed-npm \"$GITHUB_SHA\"",
  );
  const publishIndex = workflow.indexOf(
    "node tools/publish-npm-artifacts.mjs \"$PACKAGE_VERSION\" publish build/reviewed-npm/tarballs",
  );
  assert.ok(reviewIndex >= 0 && reviewIndex < downloadIndex);
  assert.ok(downloadIndex < retainedVerifyIndex);
  assert.ok(retainedVerifyIndex < publishIndex);
  const publisher = readFileSync(
    join(repositoryRoot, "tools", "publish-npm-artifacts.mjs"),
    "utf8",
  );
  assert.match(
    publisher,
    /compareVersions\(version, definition\.manualFirstPublication\) === 0/,
  );
  assert.match(publisher, /expectedManifestSha256/);
  assert.match(publisher, /expectedSourceCommit/);
  assert.match(publisher, /npm requires an authenticated first publication/);
  assert.match(publisher, /npmArtifactTarballPath/);
  assert.match(publisher, /inspectNpmPublishTarget/);
  assert.doesNotMatch(publisher, /"publish",\s*packageRoot/u);
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

test("published Registry smoke reads the tracked MCP contract without build output", () => {
  const script = readFileSync(
    join(repositoryRoot, "tools", "smoke-published-registry.mjs"),
    "utf8",
  );

  assert.equal(readTrackedMemoryToolNames().length, 19);
  assert.match(script, /readTrackedMemoryToolNames/u);
  assert.doesNotMatch(script, /packages.*mcp-server.*dist|tool-contract\.js/u);
});

test("tracked MCP contract parser matches compiled sorted tool names when built", async (context) => {
  const compiledContract = join(
    repositoryRoot,
    "packages",
    "mcp-server",
    "dist",
    "tool-contract.js",
  );
  if (!existsSync(compiledContract)) {
    context.skip("MCP server build output is not present");
    return;
  }

  const { sortedMemoryToolNames } = await import(pathToFileURL(compiledContract).href);
  assert.deepEqual(readTrackedMemoryToolNames(), sortedMemoryToolNames);
});

test("published host canary suppresses npm warnings without ignoring hook stderr", () => {
  const script = readFileSync(
    join(repositoryRoot, "tools", "host-nuzo37-canary.mjs"),
    "utf8",
  );

  assert.match(script, /NUZO_PLUGIN_SMOKE_PUBLISHED === "1"/);
  assert.match(script, /NPM_CONFIG_LOGLEVEL: "error"/);
  assert.match(script, /result\.status !== 0 \|\| result\.stderr !== ""/);
  assert.match(script, /publishedMode\s*\? createPublishedFixture\(\)/);
  assert.match(script, /function createPublishedFixture\(\)/);
  assert.match(script, /@nuzo\/memory@\$\{/);
  assert.match(script, /readPublishedHistory\(fixture\.cli, canary\.id\)/);
  assert.match(script, /cwd: repositoryRoot/);
});

test("host plugin runtimes are isolated from the user's npm workspace", () => {
  const script = readFileSync(
    join(repositoryRoot, "tools", "package-host-plugins.mjs"),
    "utf8",
  );

  assert.match(script, /--prefix=\$\{pluginRoot\}/);
  assert.match(script, /host: "codex"[\s\S]*?cwd: "\."/u);
  assert.match(script, /host: "claude-code"[\s\S]*?cwd: pluginRoot/u);
});

test("MCP Registry validation uses a checksum-pinned official publisher", () => {
  const installer = readFileSync(
    join(repositoryRoot, "tools", "install-mcp-publisher.sh"),
    "utf8",
  );
  const workflow = readFileSync(
    join(repositoryRoot, ".github", "workflows", "ci.yml"),
    "utf8",
  );

  assert.match(installer, /version=1\.8\.1/);
  assert.match(installer, /checksum=a06c9096dcb9727c13555b6be26c7effa707b01f06a4c561ba7a3635443cf2cc/);
  assert.match(installer, /sha256sum --check --status/);
  assert.doesNotMatch(installer, /releases\/latest/);
  assert.match(workflow, /npm run registry:validate/);
});

test("MCP Registry manifest and npm ownership metadata stay aligned", () => {
  const server = JSON.parse(readFileSync(join(repositoryRoot, "server.json"), "utf8"));
  const pkg = JSON.parse(readFileSync(
    join(repositoryRoot, "packages", "registry-server", "package.json"),
    "utf8",
  ));
  const mcpServerPkg = JSON.parse(readFileSync(
    join(repositoryRoot, "packages", "mcp-server", "package.json"),
    "utf8",
  ));

  assert.equal(server.name, "io.github.fabionfsc/nuzo-memory");
  assert.equal(pkg.mcpName, server.name);
  assert.equal(server.packages[0].identifier, pkg.name);
  assert.deepEqual(pkg.bin, { "memory-mcp": "dist/index.js" });
  const registrySdkSpec = pkg.dependencies?.["@modelcontextprotocol/sdk"];
  const registryZodSpec = pkg.dependencies?.zod;
  assert.match(registrySdkSpec ?? "", /\S/, "registry-server must depend on @modelcontextprotocol/sdk");
  assert.match(registryZodSpec ?? "", /\S/, "registry-server must depend on zod");
  assert.equal(
    registrySdkSpec,
    mcpServerPkg.dependencies?.["@modelcontextprotocol/sdk"],
    "registry-server must pin the same @modelcontextprotocol/sdk range as the mcp-server build it repackages",
  );
  assert.equal(
    registryZodSpec,
    mcpServerPkg.dependencies?.zod,
    "registry-server must pin the same zod range as the mcp-server build it repackages",
  );
  const verifier = readFileSync(
    join(repositoryRoot, "tools", "verify-mcp-registry-listing.mjs"),
    "utf8",
  );
  assert.match(verifier, /io\.modelcontextprotocol\.registry\/official/);
  assert.match(verifier, /official\?\.status === "active"/);
  assert.match(verifier, /official\?\.isLatest === true/);
  assert.match(verifier, /const serverName = "io\.github\.fabionfsc\/nuzo-memory"/);
  assert.match(verifier, /const version = process\.argv\[2\]/);
  assert.doesNotMatch(verifier, /process\.argv\[2\] \?\? manifest\.name/);
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

test("changelog uses dated release sections without an Unreleased placeholder", () => {
  const changelog = readFileSync(join(repositoryRoot, "CHANGELOG.md"), "utf8");
  const check = readFileSync(join(repositoryRoot, "tools", "check-release-state.mjs"), "utf8");
  const rehearse = readFileSync(join(repositoryRoot, "tools", "rehearse-release.mjs"), "utf8");

  assert.doesNotMatch(changelog, /^## \[Unreleased\]$/mu);
  assert.match(check, /must not contain an \[Unreleased\] section/);
  assert.match(rehearse, /firstReleaseSection/);
});

test("release preparation preserves stable versioning policy references", () => {
  const source = [
    "Packages currently use:",
    "",
    "```text",
    "1.0.0",
    "```",
    "",
    "For Nuzo before `1.0.0`:",
    "After `1.0.0`:",
  ].join("\n");

  const prepared = replaceCurrentPackageVersionBlock(source, "1.0.0", "1.0.1");
  assert.notEqual(prepared, null);
  assert.match(prepared, /```text\n1\.0\.1\n```/u);
  assert.match(prepared, /For Nuzo before `1\.0\.0`:/u);
  assert.match(prepared, /After `1\.0\.0`:/u);
  assert.equal(replaceCurrentPackageVersionBlock(source, "0.9.1", "1.0.0"), null);
});
