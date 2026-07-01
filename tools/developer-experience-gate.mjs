#!/usr/bin/env node
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { assertMcpSessionContinuity } from "./mcp-session-continuity.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceVersion = readJson(join(repositoryRoot, "package.json")).version;
const baselineVersion = process.env.NUZO_DX_UPGRADE_FROM ?? "0.9.0";
const testRoot = mkdtempSync(join(tmpdir(), "nuzo-developer-experience-"));
const prefix = join(testRoot, "npm-prefix");
const fakeBin = join(testRoot, "fake-host-bin");
const statePath = join(testRoot, "host-state.json");
const managedHostsPath = join(testRoot, "managed-hosts.json");
const storePath = join(testRoot, "memory", "shared.sqlite");
const backupPath = join(testRoot, "memory", "shared.backup.sqlite");
const restoredPath = join(testRoot, "memory", "restored.sqlite");
const upgradeMemory = "The Nuzo developer experience gate preserves fake memory across package upgrades.";

try {
  mkdirSync(prefix, { recursive: true });
  mkdirSync(fakeBin, { recursive: true });
  mkdirSync(dirname(storePath), { recursive: true });
  chmodSync(dirname(storePath), 0o700);
  writeJson(statePath, initialHostState());
  installHostShims(fakeBin, statePath);

  const environment = {
    ...process.env,
    PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
    NUZO_DX_STATE: statePath,
    NUZO_MANAGED_HOSTS_PATH: managedHostsPath,
    NUZO_DOCTOR_SKIP_GIT: "1",
  };

  const baselineInstall = run("npm", [
    "install",
    "--global",
    "--prefix",
    prefix,
    "--no-audit",
    "--no-fund",
    "--foreground-scripts",
    `@nuzo/memory@${baselineVersion}`,
  ], repositoryRoot, environment);
  assertIncludes(baselineInstall.stdout, "Nuzo installed.", "global install notice");
  assertIncludes(baselineInstall.stdout, "nuzo setup", "global install setup guidance");
  assertNoHostMutations("npm install");

  let nuzo = installedBinary(prefix, "nuzo");
  let mcp = installedBinary(prefix, "nuzo-mcp-server");
  assertVersion(nuzo, baselineVersion, environment);

  const drySetup = runJson(nuzo, ["setup", "--all", "--dry-run", "--json"], testRoot, environment);
  assertHostPlan(drySetup, "planned");
  assertNoHostMutations("setup dry run");

  const setup = runJson(nuzo, ["setup", "--all", "--yes", "--json"], testRoot, environment);
  assertHostPlan(setup, "succeeded");
  assertSetupState(true);

  run(nuzo, ["memory", "--store", storePath, "init"], testRoot, environment);
  run(nuzo, [
    "memory", "--store", storePath, "remember", upgradeMemory,
    "--kind", "project_decision", "--tag", "dx-gate", "--source", "test:dx-baseline",
  ], testRoot, environment);

  const corePackage = readJson(join(repositoryRoot, "packages", "core", "package.json"));
  const memoryPackage = readJson(join(repositoryRoot, "packages", "memory", "package.json"));
  const tarballs = join(repositoryRoot, "build", "npm", "tarballs");
  const stagedInstall = run("npm", [
    "install",
    "--global",
    "--prefix",
    prefix,
    "--no-audit",
    "--no-fund",
    "--foreground-scripts",
    join(tarballs, tarballName(corePackage)),
    join(tarballs, tarballName(memoryPackage)),
  ], repositoryRoot, environment);
  assertIncludes(stagedInstall.stdout, "Nuzo installed.", "staged upgrade notice");
  assertIncludes(
    stagedInstall.stdout,
    "Managed Nuzo plugins refreshed automatically",
    "staged upgrade automatic managed plugin refresh",
  );

  nuzo = installedBinary(prefix, "nuzo");
  mcp = installedBinary(prefix, "nuzo-mcp-server");
  assertVersion(nuzo, sourceVersion, environment);
  assertSetupState();
  assertManagedUpdateState();
  assertManagedHostsReceipt();

  const beforeUpdateMutations = hostState().mutations.length;
  const dryUpdate = runJson(nuzo, ["update", "--all", "--dry-run", "--json"], testRoot, environment);
  assertHostPlan(dryUpdate, "planned");
  if (hostState().mutations.length !== beforeUpdateMutations) {
    fail("update dry run changed host state");
  }

  const recalledAfterUpgrade = run(nuzo, [
    "memory", "--store", storePath, "recall", "package upgrades preserve memory",
  ], testRoot, environment);
  assertIncludes(recalledAfterUpgrade.stdout, upgradeMemory, "memory after package upgrade");

  await assertMcpSessionContinuity({
    cwd: testRoot,
    command: mcp,
    memoryStore: storePath,
    label: "1.0.0 developer experience gate",
  });

  const cliList = run(nuzo, [
    "memory", "--store", storePath, "list", "--all-scopes", "--include-archived",
  ], testRoot, environment);
  assertIncludes(cliList.stdout, upgradeMemory, "CLI view of the shared host store");
  assertIncludes(cliList.stdout, "MCP session continuity smoke", "host memory in CLI administration");

  const doctor = run(nuzo, ["memory", "--store", storePath, "doctor", "--json"], testRoot, environment);
  const doctorOutput = JSON.parse(doctor.stdout);
  if (doctorOutput.status !== "ok" || doctorOutput.integrity?.ok !== true) {
    fail(`doctor did not report a healthy shared store: ${doctor.stdout}`);
  }
  if (doctor.stdout.includes(upgradeMemory)) {
    fail("doctor exposed memory content");
  }

  run(nuzo, [
    "memory", "--store", storePath, "backup", "--path", backupPath, "--overwrite", "--json",
  ], testRoot, environment);
  const restored = run(nuzo, [
    "memory", "--store", restoredPath, "restore", backupPath, "--yes", "--json",
  ], testRoot, environment);
  const restoredOutput = JSON.parse(restored.stdout);
  if (restoredOutput.integrity?.ok !== true) {
    fail(`restored store failed integrity validation: ${restored.stdout}`);
  }
  const restoredRecall = run(nuzo, [
    "memory", "--store", restoredPath, "recall", "package upgrades preserve memory",
  ], testRoot, environment);
  assertIncludes(restoredRecall.stdout, upgradeMemory, "memory after recovery");

  console.log(
    `Nuzo 1.0.0 developer experience gate passed: ${baselineVersion} -> ${sourceVersion}; setup/update for Codex and Claude Code; shared CLI/MCP store; confirmed create/update/forget; recovery.`,
  );
} finally {
  rmSync(testRoot, { recursive: true, force: true });
}

function initialHostState() {
  return {
    marketplaces: { codex: false, claude: false },
    plugins: { codex: false, claude: false },
    claudeScope: null,
    mutations: [],
  };
}

function installHostShims(bin, state) {
  const shim = join(bin, "host-shim.mjs");
  writeFileSync(shim, hostShimSource(), "utf8");
  for (const host of ["codex", "claude"]) {
    const path = join(bin, host);
    writeFileSync(path, `#!/bin/sh\nexec "${process.execPath}" "${shim}" ${host} "$@"\n`, "utf8");
    chmodSync(path, 0o755);
  }
  process.env.NUZO_DX_STATE = state;
}

function hostShimSource() {
  return String.raw`import { readFileSync, writeFileSync } from "node:fs";
const [host, ...args] = process.argv.slice(2);
const path = process.env.NUZO_DX_STATE;
const state = JSON.parse(readFileSync(path, "utf8"));
const save = () => writeFileSync(path, JSON.stringify(state, null, 2) + "\n");
const mutate = (name) => { state.mutations.push(host + ":" + name); save(); };
if (args.length === 1 && args[0] === "--version") {
  console.log(host + "-dx-shim 1.0.0");
  process.exit(0);
}
if (args.join(" ") === "plugin list --json") {
  if (host === "codex") {
    console.log(JSON.stringify({ installed: state.plugins.codex ? [{ pluginId: "nuzo@nuzo-memory", installed: true, enabled: true }] : [] }));
  } else {
    console.log(JSON.stringify(state.plugins.claude ? [{ id: "nuzo@nuzo-memory", scope: state.claudeScope, enabled: true }] : []));
  }
  process.exit(0);
}
const command = args.join(" ");
if (host === "codex" && command === "plugin marketplace add fabionfsc/nuzo-memory") {
  state.marketplaces.codex = true; mutate("marketplace-add"); process.exit(0);
}
if (host === "codex" && command === "plugin marketplace upgrade nuzo-memory") {
  mutate("marketplace-upgrade"); process.exit(0);
}
if (host === "codex" && command === "plugin add nuzo@nuzo-memory") {
  state.plugins.codex = true; mutate("plugin-add"); process.exit(0);
}
if (host === "claude" && command === "plugin marketplace add fabionfsc/nuzo-memory") {
  state.marketplaces.claude = true; mutate("marketplace-add"); process.exit(0);
}
if (host === "claude" && command === "plugin marketplace update nuzo-memory") {
  mutate("marketplace-update"); process.exit(0);
}
if (host === "claude" && command === "plugin install nuzo@nuzo-memory --scope user") {
  state.plugins.claude = true; state.claudeScope = "user"; mutate("plugin-install:user"); process.exit(0);
}
if (host === "claude" && command === "plugin update nuzo@nuzo-memory --scope user") {
  mutate("plugin-update:user"); process.exit(0);
}
console.error("unexpected " + host + " command: " + command);
process.exit(2);
`;
}

function assertNoHostMutations(label) {
  if (hostState().mutations.length !== 0) fail(`${label} changed host configuration`);
}

function assertSetupState(requireOnlySetupMutations = false) {
  const state = hostState();
  if (
    state.marketplaces.codex !== true ||
    state.marketplaces.claude !== true ||
    state.plugins.codex !== true ||
    state.plugins.claude !== true ||
    state.claudeScope !== "user"
  ) {
    fail(`setup did not configure both hosts: ${JSON.stringify(state)}`);
  }
  const expectedSetup = [
    "codex:marketplace-add",
    "codex:plugin-add",
    "claude:marketplace-add",
    "claude:plugin-install:user",
  ];
  if (
    !expectedSetup.every((item, index) => state.mutations[index] === item) ||
    (requireOnlySetupMutations && state.mutations.length !== expectedSetup.length)
  ) {
    fail(`setup was repeated or incomplete: ${JSON.stringify(state.mutations)}`);
  }
}

function assertManagedUpdateState() {
  assertSetupState();
  const mutations = hostState().mutations;
  for (const expected of [
    "codex:marketplace-upgrade",
    "codex:plugin-add",
    "claude:marketplace-update",
    "claude:plugin-update:user",
  ]) {
    if (!mutations.includes(expected)) fail(`managed update missed ${expected}`);
  }
}

function assertManagedHostsReceipt() {
  const receipt = readJson(managedHostsPath);
  const hosts = receipt.hosts?.map((entry) => `${entry.host}:${entry.scope ?? ""}`).sort();
  const expected = ["claude-code:user", "codex:"];
  if (
    receipt.format !== "nuzo-managed-hosts" ||
    receipt.version !== 1 ||
    JSON.stringify(hosts) !== JSON.stringify(expected)
  ) {
    fail(`managed host receipt is incomplete: ${JSON.stringify(receipt)}`);
  }
}

function assertHostPlan(output, status) {
  if (output.hosts?.length !== 2) fail(`expected two hosts: ${JSON.stringify(output)}`);
  for (const host of output.hosts) {
    if (host.detected !== true || host.steps?.length !== 2) {
      fail(`host plan is incomplete: ${JSON.stringify(host)}`);
    }
    if (host.steps.some((step) => step.status !== status)) {
      fail(`host plan status is not ${status}: ${JSON.stringify(host)}`);
    }
  }
}

function assertVersion(command, version, environment) {
  const result = run(command, ["--version"], testRoot, environment);
  if (result.stdout.trim() !== version) {
    fail(`installed CLI version is ${JSON.stringify(result.stdout.trim())}, expected ${version}`);
  }
}

function installedBinary(root, name) {
  return join(root, "bin", name);
}

function tarballName(pkg) {
  return `${pkg.name.replace("@", "").replace("/", "-")}-${pkg.version}.tgz`;
}

function hostState() {
  return readJson(statePath);
}

function runJson(command, args, cwd, environment) {
  return JSON.parse(run(command, args, cwd, environment).stdout);
}

function run(command, args, cwd, environment) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: environment,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stderr.write(result.stdout);
    process.stderr.write(result.stderr);
    fail(`${command} ${args.join(" ")} exited with ${result.status}`);
  }
  return result;
}

function assertIncludes(content, expected, label) {
  if (!content.includes(expected)) fail(`${label} is missing ${JSON.stringify(expected)}`);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function fail(message) {
  throw new Error(`Nuzo 1.0.0 developer experience gate failed: ${message}`);
}
