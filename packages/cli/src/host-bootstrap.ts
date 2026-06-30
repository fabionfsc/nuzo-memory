import { readFileSync } from "node:fs";
import { spawnSync, type SpawnSyncOptions } from "node:child_process";
import { NuzoMemoryError } from "@nuzo/memory-core";

export type HostBootstrapHost = "codex" | "claude-code";

export interface HostBootstrapCommand {
  command: string;
  args: string[];
  purpose: string;
}

export interface HostBootstrapStep extends HostBootstrapCommand {
  status: "planned" | "skipped" | "succeeded";
}

export interface HostBootstrapResult {
  dryRun: boolean;
  hosts: Array<{
    host: HostBootstrapHost;
    detected: boolean;
    steps: HostBootstrapStep[];
  }>;
}

export interface HostBootstrapOptions {
  dryRun: boolean;
  json: boolean;
  yes: boolean;
}

interface CommandRunner {
  (command: string, args: string[], options?: SpawnSyncOptions): {
    error?: Error;
    status: number | null;
    stderr?: Buffer | string;
    stdout?: Buffer | string;
  };
}

const marketplaceSource = "fabionfsc/nuzo-memory";
const pluginId = "nuzo@nuzo-memory";
const supportedHosts: HostBootstrapHost[] = ["codex", "claude-code"];

export function parseHostBootstrapHost(value: string): HostBootstrapHost {
  if (value === "codex" || value === "claude-code") {
    return value;
  }
  throw new NuzoMemoryError(
    "HOST_BOOTSTRAP_UNKNOWN_HOST",
    "Host must be codex or claude-code.",
  );
}

export function supportedHostBootstrapHosts(): HostBootstrapHost[] {
  return [...supportedHosts];
}

export function detectHostBootstrapHosts(
  runner: CommandRunner = spawnSync,
): Record<HostBootstrapHost, boolean> {
  return {
    codex: commandAvailable("codex", runner),
    "claude-code": commandAvailable("claude", runner),
  };
}

export function createHostBootstrapPlan(
  hosts: HostBootstrapHost[],
  detected: Record<HostBootstrapHost, boolean>,
): HostBootstrapResult {
  return {
    dryRun: true,
    hosts: uniqueHosts(hosts).map((host) => ({
      host,
      detected: detected[host],
      steps: hostBootstrapCommands(host).map((step) => ({
        ...step,
        status: "planned",
      })),
    })),
  };
}

export function runHostBootstrap(
  hosts: HostBootstrapHost[],
  options: HostBootstrapOptions,
  runner: CommandRunner = spawnSync,
): HostBootstrapResult {
  const detected = detectHostBootstrapHosts(runner);
  const selectedHosts = uniqueHosts(hosts);
  const result = createHostBootstrapPlan(selectedHosts, detected);
  result.dryRun = options.dryRun;

  if (selectedHosts.length === 0) {
    throw new NuzoMemoryError(
      "HOST_BOOTSTRAP_NO_HOSTS",
      "No supported host was selected.",
    );
  }

  if (!options.dryRun) {
    for (const host of selectedHosts) {
      if (!detected[host]) {
        throw new NuzoMemoryError(
          "HOST_BOOTSTRAP_HOST_UNAVAILABLE",
          `${hostDisplayName(host)} CLI was not found in PATH.`,
          { host },
        );
      }
    }
  }

  if (!options.dryRun && !options.yes && !confirmHostBootstrap(result)) {
    throw new NuzoMemoryError(
      "HOST_BOOTSTRAP_CONFIRMATION_REQUIRED",
      "Host installation requires explicit confirmation. Re-run with --yes to confirm non-interactively.",
    );
  }

  if (options.dryRun) {
    return result;
  }

  for (const hostResult of result.hosts) {
    for (const step of hostResult.steps) {
      runStep(step, runner);
      step.status = "succeeded";
    }
  }

  return result;
}

export function formatHostBootstrapResult(
  result: HostBootstrapResult,
  json: boolean,
): string {
  if (json) {
    return JSON.stringify({
      dry_run: result.dryRun,
      hosts: result.hosts.map((host) => ({
        host: host.host,
        detected: host.detected,
        steps: host.steps.map((step) => ({
          command: step.command,
          args: step.args,
          purpose: step.purpose,
          status: step.status,
        })),
      })),
      next_steps: hostBootstrapNextSteps(result),
    }, null, 2);
  }

  const lines: string[] = [
    result.dryRun ? "Nuzo host setup plan" : "Nuzo host setup completed",
    "Nuzo will install host plugins only after explicit confirmation. npm install does not change Codex or Claude Code configuration.",
  ];
  for (const host of result.hosts) {
    lines.push(`${hostDisplayName(host.host)}: ${host.detected ? "detected" : "not detected"}`);
    for (const step of host.steps) {
      lines.push(`- ${step.status}: ${shellCommand(step)}`);
      lines.push(`  Purpose: ${step.purpose}`);
    }
  }
  lines.push(...hostBootstrapNextSteps(result).map((step, index) => index === 0 ? `Next: ${step}` : `      ${step}`));
  return lines.join("\n");
}

export function defaultSetupHosts(
  detected: Record<HostBootstrapHost, boolean>,
): HostBootstrapHost[] {
  const available = supportedHosts.filter((host) => detected[host]);
  return available.length > 0 ? available : supportedHostBootstrapHosts();
}

function hostBootstrapCommands(host: HostBootstrapHost): HostBootstrapCommand[] {
  if (host === "codex") {
    return [
      {
        command: "codex",
        args: ["plugin", "marketplace", "add", marketplaceSource],
        purpose: "Add the Nuzo Codex marketplace.",
      },
      {
        command: "codex",
        args: ["plugin", "add", pluginId],
        purpose: "Install the Nuzo Codex plugin.",
      },
    ];
  }

  return [
    {
      command: "claude",
      args: ["plugin", "marketplace", "add", marketplaceSource],
      purpose: "Add the Nuzo Claude Code marketplace.",
    },
    {
      command: "claude",
      args: ["plugin", "install", pluginId, "--scope", "user"],
      purpose: "Install the Nuzo Claude Code plugin for the user scope.",
    },
  ];
}

function hostBootstrapNextSteps(result: HostBootstrapResult): string[] {
  if (result.dryRun) {
    return [
      "Re-run with --yes to apply this plan, or choose one host explicitly:",
      "Codex only: nuzo setup --codex --yes",
      "Claude Code only: nuzo setup --claude-code --yes",
      "Both hosts: nuzo setup --all --yes",
      "Compatibility aliases remain available under nuzo host install.",
    ];
  }

  return [
    "Review and trust the installed plugin hooks in each host.",
    "Start a new Codex or Claude Code session so the plugin and MCP server are loaded.",
    "Run nuzo memory doctor, or use memory.doctor from the host, to verify runtime health.",
    "For future upgrades, run nuzo update --yes; do not repeat setup.",
  ];
}

function commandAvailable(command: string, runner: CommandRunner): boolean {
  const result = runner(command, ["--version"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return !result.error && result.status === 0;
}

function confirmHostBootstrap(result: HostBootstrapResult): boolean {
  process.stdout.write(`${formatHostBootstrapResult(result, false)}\nProceed? Type yes to continue: `);
  try {
    return readFileSync(0, "utf8").trim().toLowerCase() === "yes";
  } catch {
    return false;
  }
}

function hostDisplayName(host: HostBootstrapHost): string {
  return host === "codex" ? "Codex" : "Claude Code";
}

function runStep(step: HostBootstrapStep, runner: CommandRunner): void {
  const result = runner(step.command, step.args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error || result.status !== 0) {
    const stderr = String(result.stderr ?? "").trim();
    const stdout = String(result.stdout ?? "").trim();
    const detail = stderr || stdout || result.error?.message || "command failed";
    throw new NuzoMemoryError(
      "HOST_BOOTSTRAP_FAILED",
      `${shellCommand(step)} failed: ${detail}`,
    );
  }
}

function shellCommand(step: HostBootstrapCommand): string {
  return [step.command, ...step.args.map(shellQuote)].join(" ");
}

function shellQuote(value: string): string {
  return /^[A-Za-z0-9_./:@=-]+$/.test(value)
    ? value
    : `'${value.replaceAll("'", "'\\''")}'`;
}

function uniqueHosts(hosts: HostBootstrapHost[]): HostBootstrapHost[] {
  return supportedHosts.filter((host) => hosts.includes(host));
}
