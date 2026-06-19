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

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = join(repositoryRoot, "build", "npm");
const packagesRoot = join(outputRoot, "packages");
const tarballsRoot = join(outputRoot, "tarballs");

const definitions = [
  {
    source: "packages/core",
    output: "memory-core",
  },
  {
    source: "packages/cli",
    output: "memory-cli",
  },
  {
    source: "packages/mcp-server",
    output: "mcp-server",
  },
];

rmSync(outputRoot, { recursive: true, force: true });
mkdirSync(packagesRoot, { recursive: true });
mkdirSync(tarballsRoot, { recursive: true });

const sourcePackages = new Map(
  definitions.map((definition) => {
    const sourceRoot = join(repositoryRoot, definition.source);
    return [definition.output, readJson(join(sourceRoot, "package.json"))];
  }),
);

const versions = new Set([...sourcePackages.values()].map((pkg) => pkg.version));
if (versions.size !== 1) {
  fail("publishable Nuzo packages must use the same version");
}

for (const definition of definitions) {
  const sourceRoot = join(repositoryRoot, definition.source);
  const destination = join(packagesRoot, definition.output);
  const sourcePackage = sourcePackages.get(definition.output);
  const publishPackage = createPublishPackage(sourcePackage);

  mkdirSync(destination, { recursive: true });
  cpSync(join(sourceRoot, "dist"), join(destination, "dist"), { recursive: true });
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

  return publishPackage;
}

function sourceDirectoryFor(name) {
  if (name === "@nuzo/memory-core") {
    return "packages/core";
  }
  if (name === "@nuzo/memory-cli") {
    return "packages/cli";
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
  if (pkg.name === "@nuzo/memory-cli") {
    if (pkg.dependencies?.["@nuzo/memory-core"] !== pkg.version) {
      fail("@nuzo/memory-cli must pin @nuzo/memory-core to the same version");
    }
    if (pkg.bin?.nuzo !== "dist/index.js") {
      fail("@nuzo/memory-cli must expose the nuzo binary");
    }
  }

  for (const requiredPath of ["dist/index.js", "README.md", "LICENSE"]) {
    if (!existsSync(join(root, requiredPath))) {
      fail(`${pkg.name} staged package is missing ${requiredPath}`);
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
