import { NuzoMemoryError } from "@nuzo/memory-core";
import {
  defaultSetupHosts,
  supportedHostBootstrapHosts,
  type HostBootstrapHost,
} from "./host-bootstrap.js";
import { defaultIO, readLineFromStdin, type CliIO } from "./cli-io.js";

export interface HostTargetCommandOptions {
  all: boolean;
  claudeCode: boolean;
  codex: boolean;
  dryRun: boolean;
  json: boolean;
  yes: boolean;
}

export type SetupCommandOptions = HostTargetCommandOptions;

export function setupHostsFromOptions(
  options: SetupCommandOptions,
  detected: Record<HostBootstrapHost, boolean>,
  io: CliIO = defaultIO,
): HostBootstrapHost[] {
  const hosts = hostsFromTargetOptions(options, "HOST_BOOTSTRAP_TARGET_CONFLICT");
  if (hosts.length > 0) return hosts;
  const defaults = defaultSetupHosts(detected);
  if (options.dryRun || options.json || options.yes || defaults.length < 2) return defaults;
  return chooseSetupHostsInteractively(defaults, io);
}

export function updateHostsFromOptions(options: HostTargetCommandOptions): HostBootstrapHost[] {
  const hosts = hostsFromTargetOptions(options, "HOST_UPDATE_TARGET_CONFLICT");
  return hosts.length > 0 ? hosts : supportedHostBootstrapHosts();
}

function hostsFromTargetOptions(
  options: Pick<HostTargetCommandOptions, "all" | "claudeCode" | "codex">,
  conflictCode: string,
): HostBootstrapHost[] {
  const selected: HostBootstrapHost[] = [];
  if (options.codex) selected.push("codex");
  if (options.claudeCode) selected.push("claude-code");

  if (options.all && selected.length > 0) {
    throw new NuzoMemoryError(
      conflictCode,
      "Use --codex, --claude-code, or --all, not multiple target styles.",
    );
  }

  if (options.all) return supportedHostBootstrapHosts();
  return selected;
}

function chooseSetupHostsInteractively(hosts: HostBootstrapHost[], io: CliIO): HostBootstrapHost[] {
  const choices = hosts.filter((host) => host === "codex" || host === "claude-code");
  if (choices.length < 2) return hosts;

  io.stdout([
    "Nuzo detected multiple supported hosts.",
    "Choose which host plugins to configure:",
    "  1) Codex",
    "  2) Claude Code",
    "  3) Both",
    "Selection [3]:",
  ].join("\n"));
  const answer = (io.readStdin?.() ?? readLineFromStdin()).trim().toLowerCase();
  if (answer === "" || answer === "3" || answer === "both" || answer === "all") return choices;
  if (answer === "1" || answer === "codex") return ["codex"];
  if (answer === "2" || answer === "claude" || answer === "claude-code") return ["claude-code"];
  throw new NuzoMemoryError(
    "HOST_BOOTSTRAP_TARGET_INVALID",
    "Choose 1 for Codex, 2 for Claude Code, or 3 for both.",
  );
}
