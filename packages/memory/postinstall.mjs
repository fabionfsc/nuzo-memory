#!/usr/bin/env node

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
  const candidates = receipt?.hosts.map((entry) => entry.host) ?? ["codex", "claude-code"];
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
  } catch (error) {
    if (receipt === null && error?.code === "HOST_UPDATE_NOT_INSTALLED") {
      console.log("First-time setup:\n  nuzo setup\n");
    } else {
      console.log("Managed host refresh needs attention.\nRun:\n  nuzo update --yes\n");
    }
  }
} catch {
  console.log("First-time setup:\n  nuzo setup\n");
}

function unsafeElevatedInstall() {
  return typeof process.getuid === "function" && process.getuid() === 0 &&
    typeof process.env.SUDO_USER === "string" && process.env.SUDO_USER !== "root";
}
