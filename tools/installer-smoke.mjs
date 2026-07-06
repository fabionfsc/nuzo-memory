#!/usr/bin/env node
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { isValidReleaseVersion } from "./release-shared.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const releaseVersion = JSON.parse(readFileSync(join(repositoryRoot, "package.json"), "utf8")).version;
if (!isValidReleaseVersion(releaseVersion)) {
  throw new Error(`package.json contains an invalid release version: ${String(releaseVersion)}`);
}
const runId = `nuzo-installer-smoke-${Date.now()}-${process.pid}`;
const tempRoot = mkdtempSync(join(tmpdir(), `${runId}-`));
const label = `nuzo.installer-smoke=${runId}`;

const scenarios = [
  {
    name: "alpine help output",
    image: "alpine:3.20",
    command: "sh docs/install.sh --help",
    expectedStatus: 0,
    expectedOutput: ["Install Nuzo using npm.", "nuzo setup"],
  },
  {
    name: "ubuntu missing node fails clearly",
    image: "ubuntu:24.04",
    command: "PATH=/usr/bin:/bin sh docs/install.sh",
    expectedStatus: 1,
    expectedOutput: ["ERROR: node is required to install Nuzo."],
  },
  {
    name: "debian unsupported node fails clearly",
    image: "debian:12",
    fake: { node: "unsupported", npm: "supported", nuzo: "supported" },
    command: "PATH=/smoke/bin:/usr/bin:/bin sh docs/install.sh",
    expectedStatus: 1,
    expectedOutput: ["ERROR: Nuzo requires Node.js 22 LTS or 24 LTS."],
  },
  {
    name: "alpine unsupported npm fails clearly",
    image: "alpine:3.20",
    fake: { node: "supported", npm: "unsupported", nuzo: "supported" },
    command: "PATH=/smoke/bin:/usr/bin:/bin sh docs/install.sh",
    expectedStatus: 1,
    expectedOutput: ["ERROR: Nuzo requires npm 10 or newer."],
  },
  {
    name: "ubuntu invalid version fails before npm",
    image: "ubuntu:24.04",
    fake: { node: "supported", npm: "supported", nuzo: "supported" },
    command: "PATH=/smoke/bin:/usr/bin:/bin sh docs/install.sh --version 1.0",
    expectedStatus: 1,
    expectedOutput: ["ERROR: Invalid Nuzo version: 1.0."],
    forbiddenOutput: ["npm install"],
  },
  {
    name: "node 22 bookworm installs verified latest tarball",
    image: "node:22-bookworm",
    fake: { npm: "supported", nuzo: "supported" },
    command: "PATH=/smoke/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin sh docs/install.sh",
    expectedStatus: 0,
    expectedOutput: [
      "==> Resolving @nuzo/memory@latest from npm",
      `==> Downloading @nuzo/memory@${releaseVersion}`,
      "==> Verifying npm package integrity",
      `==> Installing verified @nuzo/memory@${releaseVersion} with npm`,
      "npm install --global /tmp/",
      "==> Validating Nuzo",
      "Nuzo installed.",
      "nuzo setup",
    ],
    forbiddenOutput: ["nuzo setup invoked"],
  },
  {
    name: "node 24 alpine installs verified pinned tarball",
    image: "node:24-alpine",
    fake: { npm: "supported", nuzo: "supported" },
    command: `PATH=/smoke/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin sh docs/install.sh --version ${releaseVersion}`,
    expectedStatus: 0,
    expectedOutput: [
      `==> Resolving @nuzo/memory@${releaseVersion} from npm`,
      `==> Downloading @nuzo/memory@${releaseVersion}`,
      "==> Verifying npm package integrity",
      `==> Installing verified @nuzo/memory@${releaseVersion} with npm`,
      "npm install --global /tmp/",
      releaseVersion,
    ],
    forbiddenOutput: ["nuzo setup invoked"],
  },
  {
    name: "node 22 bookworm real npm install pinned release",
    image: "node:22-bookworm",
    network: "default",
    command: `sh docs/install.sh --version ${releaseVersion} && nuzo --version`,
    expectedStatus: 0,
    expectedOutput: [
      `==> Resolving @nuzo/memory@${releaseVersion} from npm`,
      `==> Downloading @nuzo/memory@${releaseVersion}`,
      "==> Verifying npm package integrity",
      `==> Installing verified @nuzo/memory@${releaseVersion} with npm`,
      "==> Validating Nuzo",
      "Nuzo installed.",
      "nuzo setup",
      releaseVersion,
    ],
  },
  {
    name: "node 24 alpine real npm install pinned release",
    image: "node:24-alpine",
    network: "default",
    command: `sh docs/install.sh --version ${releaseVersion} && nuzo --version`,
    expectedStatus: 0,
    expectedOutput: [
      `==> Resolving @nuzo/memory@${releaseVersion} from npm`,
      `==> Downloading @nuzo/memory@${releaseVersion}`,
      "==> Verifying npm package integrity",
      `==> Installing verified @nuzo/memory@${releaseVersion} with npm`,
      "==> Validating Nuzo",
      "Nuzo installed.",
      "nuzo setup",
      releaseVersion,
    ],
  },
];

try {
  requireDocker();
  for (const scenario of scenarios) {
    runScenario(scenario);
  }
  cleanupSmokeContainers();
  console.log(`installer smoke passed: ${scenarios.length} Docker scenario(s)`);
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}

function requireDocker() {
  const result = spawnSync("docker", ["version", "--format", "{{.Server.Version}}"], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`Docker is required for installer smoke tests.\n${result.stderr || result.stdout}`);
  }
}

function runScenario(scenario) {
  const smokeRoot = join(tempRoot, safeName(scenario.name));
  const fakeBin = join(smokeRoot, "bin");
  writeFakes(fakeBin, scenario.fake ?? {});

  const args = [
    "run",
    "--rm",
    "--label",
    label,
    "--network",
    scenario.network ?? "none",
    "--volume",
    `${repositoryRoot}:/work:ro`,
    "--volume",
    `${fakeBin}:/smoke/bin:ro`,
    "--workdir",
    "/work",
    scenario.image,
    "sh",
    "-c",
    scenario.command,
  ];

  const result = spawnSync("docker", args, {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  const output = `${result.stdout}${result.stderr}`;
  if (result.status !== scenario.expectedStatus) {
    failScenario(scenario, `expected exit ${scenario.expectedStatus}, got ${result.status}`, output);
  }
  for (const expected of scenario.expectedOutput ?? []) {
    if (!output.includes(expected)) {
      failScenario(scenario, `missing expected output: ${expected}`, output);
    }
  }
  for (const forbidden of scenario.forbiddenOutput ?? []) {
    if (output.includes(forbidden)) {
      failScenario(scenario, `forbidden output present: ${forbidden}`, output);
    }
  }
  console.log(`pass\t${scenario.name}`);
}

function writeFakes(fakeBin, fake = {}) {
  mkdirSync(fakeBin, { recursive: true });
  writeFileSync(join(fakeBin, ".keep"), "");
  const fakePackage = "fake nuzo package\n";
  const fakePackagePath = join(fakeBin, "nuzo-memory.tgz");
  const fakeIntegrity = `sha512-${createHash("sha512").update(fakePackage).digest("base64")}`;
  writeFileSync(fakePackagePath, fakePackage);
  if (fake.node === "supported") {
    writeExecutable(join(fakeBin, "node"), [
      "#!/bin/sh",
      "if [ \"$1\" = \"-e\" ]; then exit 0; fi",
      "printf 'v22.0.0\\n'",
    ]);
  } else if (fake.node === "unsupported") {
    writeExecutable(join(fakeBin, "node"), [
      "#!/bin/sh",
      "if [ \"$1\" = \"-e\" ]; then exit 1; fi",
      "printf 'v20.0.0\\n'",
    ]);
  }

  if (fake.npm === "supported") {
    writeExecutable(join(fakeBin, "npm"), [
      "#!/bin/sh",
      "if [ \"$1\" = \"-v\" ]; then printf '10.0.0\\n'; exit 0; fi",
      "if [ \"$1\" = \"view\" ]; then",
      "cat <<'EOF'",
      "{",
      `  "version": "${releaseVersion}",`,
      "  \"dist.tarball\": \"https://registry.npmjs.org/@nuzo/memory/-/memory-fake.tgz\",",
      `  "dist.integrity": "${fakeIntegrity}"`,
      "}",
      "EOF",
      "exit 0",
      "fi",
      "printf 'npm %s\\n' \"$*\"",
      "exit 0",
    ]);
    writeExecutable(join(fakeBin, "curl"), [
      "#!/bin/sh",
      "output=''",
      "while [ \"$#\" -gt 0 ]; do",
      "  case \"$1\" in",
      "    -o) output=\"$2\"; shift ;;",
      "  esac",
      "  shift",
      "done",
      "[ -n \"$output\" ] || exit 1",
      "cp /smoke/bin/nuzo-memory.tgz \"$output\"",
    ]);
  } else if (fake.npm === "unsupported") {
    writeExecutable(join(fakeBin, "npm"), [
      "#!/bin/sh",
      "if [ \"$1\" = \"-v\" ]; then printf '9.9.9\\n'; exit 0; fi",
      "printf 'npm %s\\n' \"$*\"",
      "exit 0",
    ]);
  }

  if (fake.nuzo === "supported") {
    writeExecutable(join(fakeBin, "nuzo"), [
      "#!/bin/sh",
      "if [ \"$1\" = \"setup\" ]; then printf 'nuzo setup invoked\\n'; exit 1; fi",
      `printf '${releaseVersion}\\n'`,
    ]);
  }
}

function writeExecutable(path, lines) {
  writeFileSync(path, `${lines.join("\n")}\n`, { mode: 0o755 });
}

function cleanupSmokeContainers() {
  const result = spawnSync("docker", [
    "ps",
    "-aq",
    "--filter",
    `label=${label}`,
  ], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`Could not list smoke containers.\n${result.stderr || result.stdout}`);
  }
  const ids = result.stdout.trim().split(/\s+/u).filter(Boolean);
  if (ids.length === 0) {
    return;
  }
  const remove = spawnSync("docker", ["rm", "-f", ...ids], { encoding: "utf8" });
  if (remove.status !== 0) {
    throw new Error(`Could not remove smoke containers.\n${remove.stderr || remove.stdout}`);
  }
}

function safeName(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "");
}

function failScenario(scenario, message, output) {
  throw new Error([
    `installer smoke failed: ${scenario.name}`,
    message,
    "--- output ---",
    output,
  ].join("\n"));
}
