import type { Command } from "commander";
import { withErrorHandling } from "./errors.js";
import {
  detectHostBootstrapHosts,
  formatHostBootstrapResult,
  runHostBootstrap,
} from "./host-bootstrap.js";
import { formatHostUpdateResult, runHostUpdate } from "./host-update.js";
import { recordManagedHosts } from "./managed-hosts.js";
import {
  setupHostsFromOptions,
  updateHostsFromOptions,
  type HostTargetCommandOptions,
  type SetupCommandOptions,
} from "./host-targets.js";
import type { CliIO } from "./cli-io.js";

export function registerHostCommands(program: Command, io: CliIO): void {
  program
    .command("setup")
    .description("Configure Nuzo for installed agent hosts.")
    .option("--codex", "Configure Codex only.", false)
    .option("--claude-code", "Configure Claude Code only.", false)
    .option("--all", "Configure every supported host.", false)
    .option("--dry-run", "Print the host setup plan without changing host configuration.", false)
    .option("--yes", "Confirm host setup non-interactively.", false)
    .option("--json", "Print JSON output for scripting.", false)
    .addHelpText("after", `

Examples:
  # Preview detected hosts before changing anything
  $ nuzo setup --dry-run

  # Configure Codex only
  $ nuzo setup --codex --yes

  # Configure Claude Code only
  $ nuzo setup --claude-code --yes

  # Configure both supported hosts
  $ nuzo setup --all --yes
`)
    .action(withErrorHandling(io, async (commandOptions: SetupCommandOptions) => {
      const detected = detectHostBootstrapHosts();
      const hosts = setupHostsFromOptions(commandOptions, detected, io);
      const result = runHostBootstrap(hosts, commandOptions);
      if (!commandOptions.dryRun) {
        recordManagedHosts(result.hosts.map(({ host }) => ({
          host,
          ...(host === "claude-code" ? { scope: "user" } : {}),
        })));
      }
      io.stdout(formatHostBootstrapResult(result, commandOptions.json));
    }));

  program
    .command("update")
    .description("Update every installed Nuzo host plugin without repeating setup.")
    .option("--codex", "Update the installed Codex plugin only.", false)
    .option("--claude-code", "Update the installed Claude Code plugin only.", false)
    .option("--all", "Update every supported installed host plugin.", false)
    .option("--dry-run", "Print the managed update plan without changing host configuration.", false)
    .option("--yes", "Confirm the managed update non-interactively.", false)
    .option("--json", "Print JSON output for scripting.", false)
    .addHelpText("after", `

Examples:
  # Preview updates for installed Codex and Claude Code plugins
  $ nuzo update --dry-run

  # Update every installed Nuzo host plugin
  $ nuzo update --yes

  # Update the installed Codex plugin only
  $ nuzo update --codex --yes

  # Update the installed Claude Code plugin only
  $ nuzo update --claude-code --yes
`)
    .action(withErrorHandling(io, async (commandOptions: HostTargetCommandOptions) => {
      const hosts = updateHostsFromOptions(commandOptions);
      const result = runHostUpdate(hosts, commandOptions);
      io.stdout(formatHostUpdateResult(result, commandOptions.json));
    }));
}
