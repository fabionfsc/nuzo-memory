import { readFileSync } from "node:fs";
import { spawnSync, type SpawnSyncOptions } from "node:child_process";
import { NuzoMemoryError } from "@nuzo/memory-core";
import type { HostBootstrapHost, HostBootstrapOptions } from "./host-bootstrap.js";

interface CommandRunner {
  (command: string, args: string[], options?: SpawnSyncOptions): {
    error?: Error;
    status: number | null;
    stderr?: Buffer | string;
    stdout?: Buffer | string;
  };
}

interface HostUpdateStep {
  command: string;
  args: string[];
  purpose: string;
  status: "planned" | "succeeded" | "skipped";
}

export interface HostUpdateResult {
  dryRun: boolean;
  hosts: Array<{
    host: HostBootstrapHost;
    detected: boolean;
    installed: boolean;
    scope?: string;
    steps: HostUpdateStep[];
  }>;
}

const pluginId = "nuzo@nuzo-memory";

export function runHostUpdate(
  hosts: HostBootstrapHost[],
  options: HostBootstrapOptions,
  runner: CommandRunner = spawnSync,
): HostUpdateResult {
  const result: HostUpdateResult = {
    dryRun: options.dryRun,
    hosts: uniqueHosts(hosts).map((host) => inspectHost(host, runner)),
  };

  if (result.hosts.length === 0) {
    throw new NuzoMemoryError("HOST_UPDATE_NO_HOSTS", "No supported host was selected.");
  }
  if (!result.hosts.some((host) => host.detected)) {
    const missing = result.hosts[0]!;
    throw new NuzoMemoryError(
      "HOST_UPDATE_HOST_UNAVAILABLE",
      `${displayName(missing.host)} CLI was not found in PATH.`,
    );
  }
  if (!result.hosts.some((host) => host.installed)) {
    throw new NuzoMemoryError(
      "HOST_UPDATE_NOT_INSTALLED",
      "No managed Nuzo host plugin is installed. Run nuzo setup first.",
    );
  }
  if (!options.dryRun && !options.yes && !confirmUpdate(result)) {
    throw new NuzoMemoryError(
      "HOST_UPDATE_CONFIRMATION_REQUIRED",
      "Host update requires explicit confirmation. Re-run with --yes to confirm non-interactively.",
    );
  }
  if (options.dryRun) return result;

  for (const host of result.hosts.filter((candidate) => candidate.installed)) {
    for (const step of host.steps) {
      runStep(step, runner);
      step.status = "succeeded";
    }
  }
  return result;
}

export function formatHostUpdateResult(result: HostUpdateResult, json: boolean): string {
  if (json) {
    return JSON.stringify({
      dry_run: result.dryRun,
      hosts: result.hosts.map((host) => ({
        host: host.host,
        detected: host.detected,
        installed: host.installed,
        scope: host.scope,
        steps: host.steps,
      })),
      next_steps: result.dryRun
        ? ["Run nuzo update --yes to update every installed Nuzo host plugin."]
        : ["Start a new host session so the updated plugin and MCP server are loaded."],
    }, null, 2);
  }

  const lines = [
    result.dryRun ? "Nuzo host update plan" : "Nuzo host update completed",
    "Only already-installed Nuzo plugins are updated; setup is not repeated.",
  ];
  for (const host of result.hosts) {
    const state = !host.detected ? "not detected" : host.installed ? "installed" : "not installed";
    lines.push(`${displayName(host.host)}: ${state}`);
    for (const step of host.steps) {
      lines.push(`- ${step.status}: ${shellCommand(step)}`);
      lines.push(`  Purpose: ${step.purpose}`);
    }
  }
  lines.push(result.dryRun
    ? "Next: Run nuzo update --yes to apply this plan."
    : "Next: Start a new host session so the updated plugin and MCP server are loaded.");
  return lines.join("\n");
}

function inspectHost(host: HostBootstrapHost, runner: CommandRunner): HostUpdateResult["hosts"][number] {
  const command = host === "codex" ? "codex" : "claude";
  const detected = commandAvailable(command, runner);
  if (!detected) return { host, detected, installed: false, steps: [] };

  const list = runner(command, ["plugin", "list", "--json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const plugin = list.status === 0 ? findPlugin(parseJson(list.stdout), pluginId) : undefined;
  const installed = plugin !== undefined;
  const scope = typeof plugin?.scope === "string" ? plugin.scope : undefined;
  return {
    host,
    detected,
    installed,
    ...(scope === undefined ? {} : { scope }),
    steps: installed ? updateCommands(host, scope).map((step) => ({ ...step, status: "planned" })) : [],
  };
}

function updateCommands(host: HostBootstrapHost, scope?: string): Omit<HostUpdateStep, "status">[] {
  if (host === "codex") {
    return [
      {
        command: "codex",
        args: ["plugin", "marketplace", "upgrade", "nuzo-memory"],
        purpose: "Refresh the Nuzo Codex marketplace checkout.",
      },
      {
        command: "codex",
        args: ["plugin", "add", pluginId],
        purpose: "Activate the latest Nuzo Codex plugin from the managed marketplace.",
      },
    ];
  }
  return [
    {
      command: "claude",
      args: ["plugin", "marketplace", "update", "nuzo-memory"],
      purpose: "Refresh the Nuzo Claude Code marketplace checkout.",
    },
    {
      command: "claude",
      args: ["plugin", "update", pluginId, "--scope", scope ?? "user"],
      purpose: "Update the installed Nuzo Claude Code plugin in its existing scope.",
    },
  ];
}

function findPlugin(value: unknown, id: string): Record<string, unknown> | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findPlugin(item, id);
      if (found) return found;
    }
    return undefined;
  }
  if (!value || typeof value !== "object") return undefined;
  const object = value as Record<string, unknown>;
  if (object.id === id || object.pluginId === id || object.name === id) return object;
  for (const item of Object.values(object)) {
    const found = findPlugin(item, id);
    if (found) return found;
  }
  return undefined;
}

function parseJson(value: Buffer | string | undefined): unknown {
  try {
    return JSON.parse(String(value ?? ""));
  } catch {
    return undefined;
  }
}

function commandAvailable(command: string, runner: CommandRunner): boolean {
  const result = runner(command, ["--version"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return !result.error && result.status === 0;
}

function confirmUpdate(result: HostUpdateResult): boolean {
  process.stdout.write(`${formatHostUpdateResult(result, false)}\nProceed? Type yes to continue: `);
  try {
    return readFileSync(0, "utf8").trim().toLowerCase() === "yes";
  } catch {
    return false;
  }
}

function runStep(step: HostUpdateStep, runner: CommandRunner): void {
  const result = runner(step.command, step.args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (!result.error && result.status === 0) return;
  const detail = String(result.stderr ?? result.stdout ?? result.error?.message ?? "command failed").trim();
  throw new NuzoMemoryError("HOST_UPDATE_FAILED", `${shellCommand(step)} failed: ${detail}`);
}

function shellCommand(step: Pick<HostUpdateStep, "command" | "args">): string {
  return [step.command, ...step.args].join(" ");
}

function displayName(host: HostBootstrapHost): string {
  return host === "codex" ? "Codex" : "Claude Code";
}

function uniqueHosts(hosts: HostBootstrapHost[]): HostBootstrapHost[] {
  return (["codex", "claude-code"] as HostBootstrapHost[]).filter((host) => hosts.includes(host));
}
