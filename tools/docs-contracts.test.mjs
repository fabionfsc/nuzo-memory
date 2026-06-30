import assert from "node:assert/strict";
import test from "node:test";

import { publicReleaseReferencePaths, readJson, readText } from "./release-shared.mjs";
import { compareVersions } from "./npm-package-policy.mjs";

const currentVersion = readJson("package.json").version;
const userEntryPoints = [
  "README.md",
  "docs/index.md",
  "docs/getting-started/index.md",
  "docs/getting-started/clean-install.md",
  "docs/operations/local-cli.md",
  "docs/operations/codex-plugin.md",
  "docs/operations/claude-code-plugin.md",
  "packages/memory/README.md",
];

test("current public entry points stay aligned with the repository release", () => {
  for (const path of userEntryPoints.filter((path) => path !== "packages/memory/README.md")) {
    assert.match(readText(path), new RegExp(escapeRegExp(currentVersion)), path);
  }
  assert.ok(
    publicReleaseReferencePaths.includes("docs/operations/local-cli.md"),
    "versioned CLI guidance must be covered by release preparation",
  );
});

test("user onboarding exposes host bootstrap only after its public release", () => {
  const commands = [
    "nuzo setup",
    "nuzo host install codex",
    "nuzo host install claude-code",
    "nuzo host install --all",
  ];
  if (compareVersions(currentVersion, "0.9.0") < 0) {
    for (const path of userEntryPoints) {
      const content = readText(path);
      for (const command of commands) {
        assert.doesNotMatch(content, new RegExp(escapeRegExp(command)), `${path}: ${command}`);
      }
    }
    return;
  }

  for (const path of [
    "README.md",
    "docs/index.md",
    "docs/getting-started/index.md",
    "packages/memory/README.md",
  ]) {
    const content = readText(path);
    for (const command of commands) {
      assert.match(content, new RegExp(escapeRegExp(command)), `${path}: ${command}`);
    }
  }
});

test("unreleased recovery commands stay out of current user guidance", () => {
  if (compareVersions(currentVersion, "0.9.0") >= 0) return;
  for (const path of userEntryPoints) {
    const content = readText(path);
    for (const command of [
      "nuzo memory integrity",
      "nuzo memory backup",
      "nuzo memory restore",
    ]) {
      assert.doesNotMatch(content, new RegExp(escapeRegExp(command)), `${path}: ${command}`);
    }
  }
});

test("public MCP tool count and names derive from the runtime contract", () => {
  const source = readText("packages/mcp-server/src/tool-contract.ts");
  const names = [...source.matchAll(/^\s*"(memory\.[^"]+)",?$/gmu)].map((match) => match[1]);
  assert.ok(names.length > 0, "tool contract must expose at least one memory tool");

  assert.match(readText("docs/index.md"), new RegExp(`<strong>${names.length}</strong> MCP tools`));
  assert.match(readText("docs/getting-started/index.md"), new RegExp(`${names.length} Nuzo memory tools`));
  const toolSpec = readText("docs/spec/tools.md");
  for (const name of names) {
    assert.match(toolSpec, new RegExp("`" + escapeRegExp(name) + "`"), name);
  }
});

test("normal installation recommends only the unified runtime package", () => {
  for (const path of userEntryPoints) {
    const content = readText(path);
    assert.doesNotMatch(content, /npm install --global @nuzo\/memory-cli/u, path);
    assert.doesNotMatch(content, /--package=@nuzo\/mcp-server/u, path);
  }
});

test("legacy npm READMEs define the 0.9.0 cutoff and unified replacement", () => {
  for (const path of ["packages/cli/README.md", "packages/mcp-server/README.md"]) {
    const content = readText(path);
    assert.match(content, /New installs should use `@nuzo\/memory`/u, path);
    assert.match(content, /Version `0\.9\.0` is the planned final release/u, path);
  }
});

test("supported Node lines stay visible in first-use documentation", () => {
  const workflow = readText(".github/workflows/ci.yml");
  for (const version of ["22", "24"]) {
    assert.match(workflow, new RegExp(`- "${version}"`), `CI Node ${version}`);
    for (const path of ["README.md", "docs/getting-started/index.md", "docs/operations/runtime-support.md"]) {
      assert.match(readText(path), new RegExp(`${version} LTS`), `${path}: Node ${version}`);
    }
  }
});

test("primary install navigation excludes maintainer and historical evidence", () => {
  const navigation = readText("mkdocs.yml");
  const start = navigation.indexOf("  - Install And Use:");
  const end = navigation.indexOf("  - Product:", start);
  assert.ok(start >= 0 && end > start, "Install And Use navigation section must exist");
  const installNavigation = navigation.slice(start, end);
  for (const maintainerPage of ["Release Checklist", "Benchmark", "Documentation Audit", "GitHub Pages"]) {
    assert.doesNotMatch(installNavigation, new RegExp(maintainerPage), maintainerPage);
  }
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
