#!/usr/bin/env node
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { spawnSync } from "node:child_process";
import {
  assertReleaseVersion,
  fail,
  isSensitiveRehearsalPath,
  packagePaths,
  pluginManifestPaths,
  pluginRuntimeConfigPaths,
  publicReleaseReferencePaths,
  repositoryRoot,
} from "./release-shared.mjs";

const version = process.argv[2];
assertReleaseVersion(version);
if (version === "0.0.0") {
  fail("0.0.0 is reserved for unreleased development state");
}

const rehearsalParent = mkdtempSync(join(tmpdir(), "nuzo-release-rehearsal-"));
const rehearsalRoot = join(rehearsalParent, "repository");
const protectedFiles = [
  ...packagePaths,
  ...pluginManifestPaths,
  ...pluginRuntimeConfigPaths,
  ...publicReleaseReferencePaths,
  "package-lock.json",
  "packages/cli/src/index.ts",
  "packages/mcp-server/src/index.ts",
  "CHANGELOG.md",
];
const sourceSnapshot = snapshotFiles(repositoryRoot, protectedFiles);

try {
  cpSync(repositoryRoot, rehearsalRoot, {
    recursive: true,
    filter: shouldCopy,
  });
  addSyntheticChangelogSection(rehearsalRoot, version);

  run("npm", ["ci", "--no-audit", "--no-fund"], rehearsalRoot);
  run("npm", ["run", "release:prepare", "--", version], rehearsalRoot);
  run("npm", ["run", "release:check", "--", version], rehearsalRoot);
  run("npm", ["run", "package:plugins"], rehearsalRoot);
  run("npm", ["run", "validate:npm"], rehearsalRoot);

  const sourceAfter = snapshotFiles(repositoryRoot, protectedFiles);
  if (JSON.stringify(sourceAfter) !== JSON.stringify(sourceSnapshot)) {
    throw new Error("source release files changed during rehearsal");
  }

  console.log(`release rehearsal passed for ${version}`);
} finally {
  rmSync(rehearsalParent, { recursive: true, force: true });
}

function shouldCopy(source) {
  if (source === repositoryRoot) {
    return true;
  }

  const path = relative(repositoryRoot, source);
  const segments = path.split(/[\\/]/);
  if (isSensitiveRehearsalPath(path)) {
    return false;
  }
  if (
    segments.includes(".git") ||
    segments.includes("node_modules") ||
    segments.includes("build") ||
    segments.includes("site") ||
    segments.some((segment) => segment === "dist") ||
    segments.some((segment) => segment.startsWith(".venv"))
  ) {
    return false;
  }
  return true;
}

function addSyntheticChangelogSection(root, targetVersion) {
  const path = join(root, "CHANGELOG.md");
  const changelog = readFileSync(path, "utf8");
  const marker = "## [Unreleased]";
  const markerIndex = changelog.indexOf(marker);
  if (markerIndex === -1) {
    throw new Error("CHANGELOG.md must contain an [Unreleased] section");
  }
  if (changelog.includes(`## [${targetVersion}] - `)) {
    throw new Error(`CHANGELOG.md already contains release ${targetVersion}`);
  }

  const nextSection = changelog.indexOf("\n## [", markerIndex + marker.length);
  const insertionIndex = nextSection === -1 ? changelog.length : nextSection;
  const date = new Date().toISOString().slice(0, 10);
  const section = `\n## [${targetVersion}] - ${date}\n\nRelease rehearsal only.\n`;
  writeFileSync(
    path,
    `${changelog.slice(0, insertionIndex).trimEnd()}\n${section}${changelog.slice(insertionIndex).trimStart()}`,
    "utf8",
  );
}

function snapshotFiles(root, paths) {
  return Object.fromEntries(paths.map((path) => {
    const content = readFileSync(join(root, path));
    return [
      path,
      createHash("sha256").update(content).digest("hex"),
    ];
  }));
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    throw new Error(`${command} ${args.join(" ")} failed`);
  }
}
