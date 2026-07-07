import { spawnSync, type SpawnSyncOptions } from "node:child_process";

export type HostIntegrationSupport =
  | "managed"
  | "manual-mcp"
  | "research";

export interface HostDetectionCommand {
  command: string;
  args: string[];
}

export interface HostIntegration {
  slug: string;
  displayName: string;
  support: HostIntegrationSupport;
  detection: HostDetectionCommand[];
  setupCommand: string | null;
  docsPath: string;
  summary: string;
  nextStep: string;
}

export interface HostIntegrationStatus extends HostIntegration {
  detected: boolean;
}

interface CommandRunner {
  (command: string, args: string[], options?: SpawnSyncOptions): {
    error?: Error;
    status: number | null;
    stderr?: Buffer | string;
    stdout?: Buffer | string;
  };
}

const hostIntegrations: HostIntegration[] = [
  {
    slug: "codex",
    displayName: "Codex",
    support: "managed",
    detection: [{ command: "codex", args: ["--version"] }],
    setupCommand: "nuzo setup --codex --yes",
    docsPath: "docs/operations/codex-plugin.md",
    summary: "Managed Nuzo plugin with MCP server, skill, and read-only recall hooks.",
    nextStep: "Run nuzo setup --codex --yes.",
  },
  {
    slug: "claude-code",
    displayName: "Claude Code",
    support: "managed",
    detection: [{ command: "claude", args: ["--version"] }],
    setupCommand: "nuzo setup --claude-code --yes",
    docsPath: "docs/operations/claude-code-plugin.md",
    summary: "Managed Nuzo plugin with MCP server, skill, and lifecycle hooks.",
    nextStep: "Run nuzo setup --claude-code --yes.",
  },
  {
    slug: "generic-mcp",
    displayName: "Generic MCP host",
    support: "manual-mcp",
    detection: [],
    setupCommand: null,
    docsPath: "docs/spec/tools.md",
    summary: "Any host that can launch a local stdio MCP server can use nuzo-mcp-server manually.",
    nextStep: "Configure the host to run: nuzo-mcp-server.",
  },
  {
    slug: "opencode",
    displayName: "OpenCode",
    support: "research",
    detection: [{ command: "opencode", args: ["--version"] }],
    setupCommand: null,
    docsPath: "docs/architecture/agent-host-compatibility.md",
    summary: "Candidate host for future validation through the generic MCP path.",
    nextStep: "Use the generic MCP path until a Nuzo-managed adapter is validated.",
  },
  {
    slug: "gemini-cli",
    displayName: "Gemini CLI",
    support: "research",
    detection: [{ command: "gemini", args: ["--version"] }],
    setupCommand: null,
    docsPath: "docs/architecture/agent-host-compatibility.md",
    summary: "Candidate host for future validation through the generic MCP path.",
    nextStep: "Use the generic MCP path until a Nuzo-managed adapter is validated.",
  },
  {
    slug: "cursor",
    displayName: "Cursor",
    support: "research",
    detection: [{ command: "cursor", args: ["--version"] }],
    setupCommand: null,
    docsPath: "docs/architecture/agent-host-compatibility.md",
    summary: "Candidate host for future validation through the generic MCP path.",
    nextStep: "Use the generic MCP path until a Nuzo-managed adapter is validated.",
  },
  {
    slug: "windsurf",
    displayName: "Windsurf",
    support: "research",
    detection: [{ command: "windsurf", args: ["--version"] }],
    setupCommand: null,
    docsPath: "docs/architecture/agent-host-compatibility.md",
    summary: "Candidate host for future validation through the generic MCP path.",
    nextStep: "Use the generic MCP path until a Nuzo-managed adapter is validated.",
  },
  {
    slug: "vscode-copilot",
    displayName: "VS Code Copilot",
    support: "research",
    detection: [{ command: "code", args: ["--version"] }],
    setupCommand: null,
    docsPath: "docs/architecture/agent-host-compatibility.md",
    summary: "Candidate host for future validation through the generic MCP path.",
    nextStep: "Use the generic MCP path until a Nuzo-managed adapter is validated.",
  },
];

export function listHostIntegrations(): HostIntegration[] {
  return hostIntegrations.map((host) => ({
    ...host,
    detection: host.detection.map((command) => ({ ...command, args: [...command.args] })),
  }));
}

export function detectHostIntegrations(
  runner: CommandRunner = spawnSync,
): HostIntegrationStatus[] {
  return listHostIntegrations().map((host) => ({
    ...host,
    detected: detectHost(host, runner),
  }));
}

export function formatHostIntegrationStatus(
  hosts: HostIntegrationStatus[],
  json: boolean,
): string {
  if (json) {
    return JSON.stringify({
      hosts: hosts.map((host) => ({
        slug: host.slug,
        display_name: host.displayName,
        support: host.support,
        detected: host.detected,
        setup_command: host.setupCommand,
        docs_path: host.docsPath,
        summary: host.summary,
        next_step: host.nextStep,
      })),
      support_levels: supportLevelDescriptions(),
    }, null, 2);
  }

  const groups: Array<[HostIntegrationSupport, string]> = [
    ["managed", "Managed setup"],
    ["manual-mcp", "Manual MCP"],
    ["research", "Research candidates"],
  ];
  const lines = [
    "Nuzo host integrations",
    "This command is read-only. It does not change host configuration.",
  ];

  for (const [support, title] of groups) {
    const group = hosts.filter((host) => host.support === support);
    if (group.length === 0) continue;
    lines.push("", `${title}:`);
    for (const host of group) {
      lines.push(`- ${host.displayName} (${host.slug}): ${host.detected ? "detected" : "not detected"}`);
      lines.push(`  ${host.summary}`);
      if (host.setupCommand !== null) lines.push(`  Setup: ${host.setupCommand}`);
      lines.push(`  Next: ${host.nextStep}`);
      lines.push(`  Docs: ${host.docsPath}`);
    }
  }

  return lines.join("\n");
}

function detectHost(host: HostIntegration, runner: CommandRunner): boolean {
  if (host.detection.length === 0) return false;
  return host.detection.some((probe) => {
    const result = runner(probe.command, probe.args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return !result.error && result.status === 0;
  });
}

function supportLevelDescriptions(): Record<HostIntegrationSupport, string> {
  return {
    managed: "Nuzo can configure this host through nuzo setup.",
    "manual-mcp": "The host can use Nuzo when the user manually configures the stdio MCP server.",
    research: "Candidate for future validation; not a supported managed setup target yet.",
  };
}
