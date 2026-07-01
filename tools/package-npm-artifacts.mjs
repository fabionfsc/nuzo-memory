#!/usr/bin/env node
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { isLocalDependencyReference } from "./release-shared.mjs";
import {
  isAtLeastVersion,
  npmPackageDefinitions,
  publishableNpmPackagesForVersion,
  retiredLegacyNpmPackagesForVersion,
} from "./npm-package-policy.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = join(repositoryRoot, "build", "npm");
const packagesRoot = join(outputRoot, "packages");
const tarballsRoot = join(outputRoot, "tarballs");

rmSync(outputRoot, { recursive: true, force: true });
mkdirSync(packagesRoot, { recursive: true });
mkdirSync(tarballsRoot, { recursive: true });

const sourcePackages = new Map(
  npmPackageDefinitions.map((definition) => {
    const sourceRoot = join(repositoryRoot, definition.source);
    return [definition.output, readJson(join(sourceRoot, "package.json"))];
  }),
);

const versions = new Set([...sourcePackages.values()].map((pkg) => pkg.version));
if (versions.size !== 1) {
  fail("publishable Nuzo packages must use the same version");
}
const [packageVersion] = versions;
const definitions = publishableNpmPackagesForVersion(packageVersion);
const retiredLegacyDefinitions = retiredLegacyNpmPackagesForVersion(packageVersion);
if (retiredLegacyDefinitions.length > 0) {
  for (const definition of retiredLegacyDefinitions) {
    const retiredPath = join(packagesRoot, definition.output);
    if (existsSync(retiredPath)) {
      fail(`retired legacy package must not be staged after 0.9.0: ${definition.name}`);
    }
  }
}

for (const definition of definitions) {
  const sourceRoot = join(repositoryRoot, definition.source);
  const destination = join(packagesRoot, definition.output);
  const sourcePackage = sourcePackages.get(definition.output);
  const publishPackage = createPublishPackage(sourcePackage);

  mkdirSync(destination, { recursive: true });
  if (definition.kind === "unified") {
    cpSync(join(repositoryRoot, "packages", "cli", "dist"), join(destination, "dist", "cli"), {
      recursive: true,
    });
    cpSync(join(repositoryRoot, "packages", "mcp-server", "dist"), join(destination, "dist", "mcp-server"), {
      recursive: true,
    });
  } else {
    cpSync(join(sourceRoot, "dist"), join(destination, "dist"), { recursive: true });
  }
  if (definition.name === "@nuzo/memory") {
    cpSync(join(sourceRoot, "postinstall.mjs"), join(destination, "postinstall.mjs"));
  }
  cpSync(join(sourceRoot, "README.md"), join(destination, "README.md"));
  cpSync(join(repositoryRoot, "LICENSE"), join(destination, "LICENSE"));
  writeFileSync(
    join(destination, "package.json"),
    `${JSON.stringify(publishPackage, null, 2)}\n`,
    "utf8",
  );

  validateStagedPackage(destination, publishPackage);
  pack(destination);
}

console.log(`npm artifacts ready: ${outputRoot}`);

function createPublishPackage(sourcePackage) {
  if (sourcePackage.private !== true) {
    fail(`${sourcePackage.name} source package must remain private`);
  }

  const publishPackage = structuredClone(sourcePackage);
  delete publishPackage.private;
  delete publishPackage.scripts;
  delete publishPackage.devDependencies;

  publishPackage.files = ["dist", "README.md", "LICENSE"];
  publishPackage.publishConfig = {
    access: "public",
  };
  publishPackage.repository = {
    type: "git",
    url: "git+https://github.com/fabionfsc/nuzo-memory.git",
    directory: sourceDirectoryFor(sourcePackage.name),
  };
  publishPackage.homepage = "https://nuzo.com.br/";
  publishPackage.bugs = {
    url: "https://github.com/fabionfsc/nuzo-memory/issues",
  };

  if (publishPackage.dependencies?.["@nuzo/memory-core"]) {
    publishPackage.dependencies["@nuzo/memory-core"] = sourcePackage.version;
  }
  if (publishPackage.name === "@nuzo/memory") {
    publishPackage.files.push("postinstall.mjs");
    publishPackage.scripts = {
      postinstall: "node postinstall.mjs",
    };
  }
  rejectLocalDependencyReferences(publishPackage);

  return publishPackage;
}

function rejectLocalDependencyReferences(pkg) {
  for (const section of [
    "dependencies",
    "optionalDependencies",
    "peerDependencies",
  ]) {
    for (const [name, spec] of Object.entries(pkg[section] ?? {})) {
      if (isLocalDependencyReference(spec)) {
        fail(`${pkg.name} contains non-publishable ${section} reference ${name}@${spec}`);
      }
    }
  }
}

function sourceDirectoryFor(name) {
  if (name === "@nuzo/memory-core") {
    return "packages/core";
  }
  if (name === "@nuzo/memory-cli") {
    return "packages/cli";
  }
  if (name === "@nuzo/memory") {
    return "packages/memory";
  }
  if (name === "@nuzo/mcp-server") {
    return "packages/mcp-server";
  }
  fail(`unsupported publish package: ${name}`);
}

function validateStagedPackage(root, pkg) {
  if (pkg.private !== undefined) {
    fail(`${pkg.name} staged package must not contain private`);
  }
  if (pkg.version === "0.0.0") {
    console.warn(`Packaging pre-release npm artifact ${pkg.name}@0.0.0.`);
  }
  if (pkg.name === "@nuzo/mcp-server") {
    if (pkg.dependencies?.["@nuzo/memory-core"] !== pkg.version) {
      fail("@nuzo/mcp-server must pin @nuzo/memory-core to the same version");
    }
    if (pkg.bin?.["nuzo-mcp-server"] !== "dist/index.js") {
      fail("@nuzo/mcp-server must expose the nuzo-mcp-server binary");
    }
  }
  if (pkg.name === "@nuzo/memory") {
    if (pkg.dependencies?.["@nuzo/memory-core"] !== pkg.version) {
      fail("@nuzo/memory must pin @nuzo/memory-core to the same version");
    }
    if (pkg.bin?.nuzo !== "dist/cli/index.js") {
      fail("@nuzo/memory must expose the nuzo binary");
    }
    if (pkg.bin?.["nuzo-mcp-server"] !== "dist/mcp-server/index.js") {
      fail("@nuzo/memory must expose the nuzo-mcp-server binary");
    }
    if (pkg.bin?.["nuzo-memory-hook"] !== "dist/mcp-server/host-hook-cli.js") {
      fail("@nuzo/memory must expose the nuzo-memory-hook binary");
    }
    if (pkg.scripts?.postinstall !== "node postinstall.mjs") {
      fail("@nuzo/memory must expose the postinstall guidance script");
    }
  }
  if (pkg.name === "@nuzo/memory-cli") {
    if (pkg.dependencies?.["@nuzo/memory-core"] !== pkg.version) {
      fail("@nuzo/memory-cli must pin @nuzo/memory-core to the same version");
    }
    if (pkg.bin?.nuzo !== "dist/index.js") {
      fail("@nuzo/memory-cli must expose the nuzo binary");
    }
  }

  const requiredPaths = pkg.name === "@nuzo/memory"
    ? ["dist/cli/index.js", "dist/mcp-server/index.js", "dist/mcp-server/host-hook-cli.js", "postinstall.mjs", "README.md", "LICENSE"]
    : ["dist/index.js", "README.md", "LICENSE"];
  for (const requiredPath of requiredPaths) {
    if (!existsSync(join(root, requiredPath))) {
      fail(`${pkg.name} staged package is missing ${requiredPath}`);
    }
  }
  validateStagedReadme(root, pkg);
}

function validateStagedReadme(root, pkg) {
  const readme = readFileSync(join(root, "README.md"), "utf8");
  const readmeLines = readme.split(/\r?\n/u);
  if (!readmeLines.includes("Documentation: https://nuzo.com.br/")) {
    fail(`${pkg.name} staged README must link to the public documentation`);
  }
  if (pkg.name === "@nuzo/memory") {
    for (const requiredText of [
      "npm install --global @nuzo/memory",
      "nuzo setup",
      "nuzo memory manage",
      "automatically refreshes",
      "Verify Memory Across Sessions",
    ]) {
      if (!readme.includes(requiredText)) {
        fail(`${pkg.name} staged README is missing user onboarding: ${requiredText}`);
      }
    }
    const hostBootstrapCommands = ["nuzo setup"];
    if (isAtLeastVersion(pkg.version, "0.9.0")) {
      for (const command of hostBootstrapCommands) {
        if (!readme.includes(command)) {
          fail(`${pkg.name}@${pkg.version} README must document released command: ${command}`);
        }
      }
    } else if (hostBootstrapCommands.some((command) => readme.includes(command))) {
      if (
        !readme.includes("Upcoming In 0.9.0") ||
        !readme.includes(`not available in the current ${pkg.version} release`)
      ) {
        fail(`${pkg.name}@${pkg.version} README must clearly mark preview host commands as unreleased`);
      }
    }
  }
  if (["@nuzo/memory-cli", "@nuzo/mcp-server"].includes(pkg.name)) {
    if (
      !readme.includes("New installs should use `@nuzo/memory`") ||
      !readme.includes("Version `0.9.0` is the planned final release")
    ) {
      fail(`${pkg.name} staged README must document its replacement and final release`);
    }
  }
}

function pack(packageRoot) {
  const result = spawnSync(
    "npm",
    ["pack", "--json", "--pack-destination", tarballsRoot],
    {
      cwd: packageRoot,
      encoding: "utf8",
      shell: process.platform === "win32",
    },
  );
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }

  const report = JSON.parse(result.stdout);
  if (!Array.isArray(report) || report.length !== 1) {
    fail(`unexpected npm pack report for ${packageRoot}`);
  }
  const files = report[0].files.map((file) => file.path);
  const forbidden = files.filter(
    (path) =>
      path.startsWith("src/") ||
      path.startsWith("node_modules/") ||
      path.includes("__tests__") ||
      path.includes(".test.") ||
      path.includes(".env") ||
      path.includes(".sqlite") ||
      path.includes("memory.export"),
  );
  if (forbidden.length > 0) {
    fail(`forbidden npm package files: ${forbidden.join(", ")}`);
  }

  console.log(`packed ${report[0].name}@${report[0].version}: ${report[0].filename}`);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function fail(message) {
  console.error(`npm packaging failed: ${message}`);
  process.exit(1);
}
