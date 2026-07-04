#!/usr/bin/env node
import { delimiter, isAbsolute, relative, resolve, sep } from "node:path";

try {
  if (process.env.NUZO_SKIP_POSTINSTALL === "1") process.exit(0);

  console.log("\nNuzo installed.\n");
  if (process.env.NUZO_SKIP_HOST_UPDATE === "1") {
    console.log("Managed host refresh skipped (NUZO_SKIP_HOST_UPDATE=1).\nRun when ready:\n  nuzo update --yes\n");
    process.exit(0);
  }

  if (unsafeElevatedInstall()) {
    console.log("Managed host refresh skipped because npm is running under a different elevated user.\nRun as the host owner:\n  nuzo update --yes\n");
    process.exit(0);
  }

  const [{ readManagedHostsReceipt, recordManagedHosts }, { runHostUpdate }] = await Promise.all([
    import("./dist/cli/managed-hosts.js"),
    import("./dist/cli/host-update.js"),
  ]);
  const receipt = readManagedHostsReceipt();
  if (receipt === null || receipt.hosts.length === 0) {
    console.log(
      "Automatic host refresh skipped because no managed-host receipt exists.\n" +
      "First-time setup:\n  nuzo setup\n" +
      "Existing managed installation:\n  nuzo update --yes\n",
    );
    process.exit(0);
  }
  const candidates = receipt.hosts.map((entry) => entry.host);
  const originalPath = process.env.PATH;
  process.env.PATH = trustedHostPath(originalPath);
  try {
    const result = runHostUpdate(candidates, { dryRun: false, json: false, yes: true });
    const refreshed = result.hosts.filter((host) => host.installed);
    if (refreshed.length === 0) throw new Error("No managed Nuzo plugin is installed.");
    recordManagedHosts(refreshed.map((host) => ({
      host: host.host,
      ...(host.scope === undefined ? {} : { scope: host.scope }),
    })));
    console.log("Managed Nuzo plugins refreshed automatically:");
    for (const host of refreshed) {
      const name = host.host === "codex" ? "Codex" : "Claude Code";
      console.log(`  - ${name}${host.scope === undefined ? "" : ` (${host.scope} scope)`}`);
    }
    console.log("Start a new host session to load the updated plugin.\n");
  } catch {
    console.log("Managed host refresh needs attention.\nRun:\n  nuzo update --yes\n");
  } finally {
    if (originalPath === undefined) delete process.env.PATH;
    else process.env.PATH = originalPath;
  }
} catch {
  console.log("First-time setup:\n  nuzo setup\n");
}

function unsafeElevatedInstall() {
  return typeof process.getuid === "function" && process.getuid() === 0 &&
    typeof process.env.SUDO_USER === "string" && process.env.SUDO_USER !== "root";
}

function trustedHostPath(value) {
  const untrustedRoots = [process.env.INIT_CWD, process.env.npm_config_local_prefix]
    .filter((entry) => typeof entry === "string" && isAbsolute(entry))
    .map((entry) => resolve(entry));
  return String(value ?? "")
    .split(delimiter)
    .filter((entry) => isTrustedPathEntry(entry, untrustedRoots))
    .join(delimiter);
}

function isTrustedPathEntry(entry, untrustedRoots) {
  if (!entry || !isAbsolute(entry) || isNpmLocalBin(entry)) return false;
  const candidate = resolve(entry);
  return !untrustedRoots.some((root) => {
    const pathFromRoot = relative(root, candidate);
    return pathFromRoot === "" || (!pathFromRoot.startsWith(`..${sep}`) && pathFromRoot !== "..");
  });
}

function isNpmLocalBin(entry) {
  const normalized = entry.replaceAll("\\", "/").replace(/\/+$/u, "").toLowerCase();
  return normalized.endsWith("/node_modules/.bin") || normalized.includes("/node_modules/.bin/");
}
