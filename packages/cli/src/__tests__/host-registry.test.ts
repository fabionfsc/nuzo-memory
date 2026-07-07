import { describe, expect, it } from "vitest";
import {
  detectHostIntegrations,
  formatHostIntegrationStatus,
  listHostIntegrations,
} from "../host-registry.js";

describe("host integration registry", () => {
  it("keeps managed setup hosts separate from future research candidates", () => {
    const hosts = listHostIntegrations();

    expect(hosts.filter((host) => host.support === "managed").map((host) => host.slug)).toEqual([
      "codex",
      "claude-code",
    ]);
    expect(hosts.find((host) => host.slug === "generic-mcp")).toMatchObject({
      support: "manual-mcp",
      setupCommand: null,
    });
    expect(hosts.filter((host) => host.support === "research").map((host) => host.slug)).toEqual([
      "opencode",
      "gemini-cli",
      "cursor",
      "windsurf",
      "vscode-copilot",
    ]);
  });

  it("detects host CLIs without treating generic MCP as installed", () => {
    const calls: Array<[string, string[]]> = [];
    const detected = detectHostIntegrations((command, args) => {
      calls.push([command, args]);
      return { status: command === "codex" || command === "opencode" ? 0 : 1 };
    });

    expect(calls).toContainEqual(["codex", ["--version"]]);
    expect(calls).toContainEqual(["claude", ["--version"]]);
    expect(calls).toContainEqual(["opencode", ["--version"]]);
    expect(detected.find((host) => host.slug === "codex")).toMatchObject({ detected: true });
    expect(detected.find((host) => host.slug === "opencode")).toMatchObject({ detected: true });
    expect(detected.find((host) => host.slug === "generic-mcp")).toMatchObject({ detected: false });
  });

  it("formats human and JSON integration status", () => {
    const statuses = detectHostIntegrations((command) => ({ status: command === "claude" ? 0 : 1 }));
    const text = formatHostIntegrationStatus(statuses, false);

    expect(text).toContain("Nuzo host integrations");
    expect(text).toContain("This command is read-only.");
    expect(text).toContain("Managed setup:");
    expect(text).toContain("Claude Code (claude-code): detected");
    expect(text).toContain("Research candidates:");
    expect(text).toContain("OpenCode (opencode): not detected");

    const json = JSON.parse(formatHostIntegrationStatus(statuses, true)) as {
      hosts: Array<{ slug: string; support: string; detected: boolean; setup_command: string | null }>;
      support_levels: Record<string, string>;
    };
    expect(json.hosts.find((host) => host.slug === "claude-code")).toMatchObject({
      support: "managed",
      detected: true,
      setup_command: "nuzo setup --claude-code --yes",
    });
    expect(json.support_levels.research).toContain("Candidate for future validation");
  });
});
