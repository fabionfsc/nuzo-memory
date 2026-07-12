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
  "docs/getting-started/sixty-second-demo.md",
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
    "nuzo setup --codex",
    "nuzo setup --claude-code",
    "nuzo setup --all",
    "nuzo update",
  ];
  if (compareVersions(currentVersion, "0.9.0") < 0) {
    for (const path of userEntryPoints) {
      const content = readText(path);
      const documentsPreview = commands.some((command) => content.includes(command));
      if (documentsPreview) {
        assert.match(content, /Upcoming In 0\.9\.0/u, `${path}: preview heading`);
        assert.match(
          content,
          new RegExp(`not available in the current ${escapeRegExp(currentVersion)} release`, "iu"),
          `${path}: preview warning`,
        );
      }
      for (const command of commands) {
        if (content.includes(command)) {
          assert.ok(documentsPreview, `${path}: ${command}`);
        }
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
    const requiredCommands = path === "packages/memory/README.md"
      ? ["nuzo setup", "nuzo update"]
      : commands;
    for (const command of requiredCommands) {
      assert.match(content, new RegExp(escapeRegExp(command)), `${path}: ${command}`);
    }
    assert.match(content, /nuzo memory manage/u, `${path}: nuzo memory manage`);
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
  assert.match(readText("docs/getting-started/clean-install.md"), new RegExp(`${names.length} public memory tools`));
  const toolSpec = readText("docs/spec/tools.md");
  for (const name of names) {
    assert.match(toolSpec, new RegExp("`" + escapeRegExp(name) + "`"), name);
  }
});

test("public audit event filters derive from the core event contract", () => {
  const source = readText("packages/core/src/types.ts");
  const eventArray = source.match(/export const memoryEventTypes = \[([\s\S]*?)\] as const/u)?.[1] ?? "";
  const eventTypes = [...eventArray.matchAll(/"(memory\.[^"]+)"/gu)].map((match) => match[1]);
  assert.ok(eventTypes.length > 0, "core must expose at least one memory event type");

  const toolSpec = readText("docs/spec/tools.md");
  const auditStart = toolSpec.indexOf("### `memory.audit`");
  const auditEnd = toolSpec.indexOf("### `memory.forget`", auditStart);
  assert.ok(auditStart >= 0 && auditEnd > auditStart, "memory.audit documentation section must exist");
  const auditSpec = toolSpec.slice(auditStart, auditEnd);
  assert.match(auditSpec, new RegExp(`at most ${eventTypes.length} values`, "u"));
  for (const eventType of eventTypes) {
    assert.match(auditSpec, new RegExp("`" + escapeRegExp(eventType) + "`", "u"), eventType);
  }
});

test("normal installation recommends only the unified runtime package", () => {
  for (const path of userEntryPoints) {
    const content = readText(path);
    assert.doesNotMatch(content, /npm install --global @nuzo\/memory-cli/u, path);
    assert.doesNotMatch(content, /--package=@nuzo\/mcp-server/u, path);
  }
});

test("legacy npm READMEs identify their deprecation and unified replacement", () => {
  for (const path of ["packages/cli/README.md", "packages/mcp-server/README.md"]) {
    const content = readText(path);
    assert.match(content, /New installs should use `@nuzo\/memory`/u, path);
    assert.match(content, /every\s+published version is deprecated/u, path);
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

test("supported OS artifact matrix stays visible in CI and runtime docs", () => {
  const workflow = readText(".github/workflows/ci.yml");
  const runtimeSupport = readText("docs/operations/runtime-support.md");
  for (const os of ["ubuntu-latest", "macos-15-intel", "windows-latest"]) {
    assert.match(workflow, new RegExp(`- ${escapeRegExp(os)}`), `CI OS ${os}`);
  }
  for (const label of ["Linux x64", "macOS x64", "Windows x64"]) {
    assert.match(runtimeSupport, new RegExp(escapeRegExp(label)), `runtime support ${label}`);
  }
  assert.match(workflow, /npm run smoke:os-artifacts/u);
  assert.match(readText("docs/operations/testing-strategy.md"), /npm run smoke:os-artifacts/u);
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

test("published installer verifies npm package integrity before install", () => {
  const installer = readText("docs/install.sh");
  assert.match(installer, /npm view "\$package_spec" version dist\.tarball dist\.integrity --json/u);
  assert.match(installer, /Verifying npm package integrity/u);
  assert.match(installer, /npm install --global "\$archive_path"/u);
  assert.match(readText("docs/getting-started/index.md"), /verifies its npm integrity metadata/u);
});

test("memory governance contract stays visible and sliced for implementation", () => {
  const navigation = readText("mkdocs.yml");
  const memoryModel = readText("docs/spec/memory-model.md");
  const trustBoundary = readText("docs/architecture/memory-trust-boundary.md");
  const governance = readText("docs/spec/memory-governance.md");

  assert.match(navigation, /Memory Governance: spec\/memory-governance\.md/u);
  assert.match(memoryModel, /\[Memory Governance\]\(memory-governance\.md\)/u);
  assert.match(trustBoundary, /\[Memory Governance\]\(\.\.\/spec\/memory-governance\.md\)/u);

  for (const required of [
    "Durability Classes",
    "Scope Granularity",
    "Provenance",
    "Confidence State",
    "Review And Expiry",
    "Challenge Flow",
    "Recall Rendering",
    "Compatibility Plan",
    "Test Plan",
    "Structured provenance",
    "Review metadata",
    "Challenge flow",
  ]) {
    assert.match(governance, new RegExp(escapeRegExp(required), "u"), required);
  }

  for (const field of ["review_after", "expires_at", "user_confirmed", "needs_review", "superseded"]) {
    assert.match(governance, new RegExp("`" + escapeRegExp(field) + "`", "u"), field);
  }
});

test("public adoption path is discoverable, disposable, and safely routed", () => {
  const readme = readText("README.md");
  const home = readText("docs/index.md");
  const navigation = readText("mkdocs.yml");
  const demo = readText("docs/getting-started/sixty-second-demo.md");
  const why = readText("docs/product/why-nuzo.md");
  const comparison = readText("docs/product/competitive-landscape.md");
  const feedback = readText("docs/operations/feedback.md");
  const launch = readText("docs/operations/public-launch.md");
  const roadmap = readText("docs/operations/roadmap.md");
  const installForm = readText(".github/ISSUE_TEMPLATE/installation-feedback.yml");

  for (const content of [readme, home, navigation]) {
    assert.match(content, /60-[Ss]econd [Dd]emo/u);
    assert.match(content, /Why Nuzo\?/u);
  }
  for (const command of [
    "@nuzo/memory@1.0.0",
    "nuzo memory --store",
    "remember",
    "recall",
    "list --tag demo",
    "audit",
    "rm -rf",
  ]) {
    assert.match(demo, new RegExp(escapeRegExp(command), "u"), `demo: ${command}`);
  }
  for (const alternative of ["AGENTS.md", "MEMORY.md", "Native Assistant Memory", "Wrong Choice"]) {
    assert.match(why, new RegExp(escapeRegExp(alternative), "iu"), alternative);
  }
  for (const product of ["Mem0", "Zep", "Letta", "Nuzo"]) {
    assert.match(comparison, new RegExp(escapeRegExp(product), "u"), product);
  }
  assert.match(comparison, /Last reviewed: \d{4}-\d{2}-\d{2}/u);
  assert.match(feedback, /Do not attach a SQLite store/u);
  assert.match(launch, /does not authorize a new npm release/u);
  for (const issue of ["#314", "#315", "#316"]) {
    assert.match(launch, new RegExp(escapeRegExp(issue), "u"), issue);
  }
  assert.match(roadmap, /repository adoption surface is implemented/u);
  assert.match(installForm, /I used fake data/u);
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
