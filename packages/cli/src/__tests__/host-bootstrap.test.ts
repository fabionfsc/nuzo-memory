import { describe, expect, it } from "vitest";
import {
  createHostBootstrapPlan,
  defaultSetupHosts,
  detectHostBootstrapHosts,
  formatHostBootstrapResult,
  runHostBootstrap,
  type HostBootstrapHost,
} from "../host-bootstrap.js";

describe("host bootstrap", () => {
  it("detects supported host CLIs", () => {
    const calls: string[] = [];
    const detected = detectHostBootstrapHosts((command) => {
      calls.push(command);
      return { status: command === "codex" ? 0 : 1 };
    });

    expect(calls).toEqual(["codex", "claude"]);
    expect(detected).toEqual({
      codex: true,
      "claude-code": false,
    });
  });

  it("defaults setup to detected hosts", () => {
    expect(defaultSetupHosts({
      codex: true,
      "claude-code": false,
    })).toEqual(["codex"]);
    expect(defaultSetupHosts({
      codex: false,
      "claude-code": false,
    })).toEqual(["codex", "claude-code"]);
  });

  it("builds an explicit dry-run plan for Codex and Claude Code", () => {
    const plan = createHostBootstrapPlan(["codex", "claude-code"], {
      codex: true,
      "claude-code": true,
    });

    expect(formatHostBootstrapResult(plan, false)).toBe([
      "Nuzo host setup plan",
      "Nuzo will install host plugins only after explicit confirmation. npm install does not change Codex or Claude Code configuration.",
      "Codex: detected",
      "- planned: codex plugin marketplace add fabionfsc/nuzo-memory",
      "  Purpose: Add the Nuzo Codex marketplace.",
      "- planned: codex plugin add nuzo@nuzo-memory",
      "  Purpose: Install the Nuzo Codex plugin.",
      "Claude Code: detected",
      "- planned: claude plugin marketplace add fabionfsc/nuzo-memory",
      "  Purpose: Add the Nuzo Claude Code marketplace.",
      "- planned: claude plugin install nuzo@nuzo-memory --scope user",
      "  Purpose: Install the Nuzo Claude Code plugin for the user scope.",
      "Next: Re-run with --yes to apply this plan, or choose one host explicitly:",
      "      Codex only: nuzo host install codex --yes",
      "      Claude Code only: nuzo host install claude-code --yes",
      "      Both hosts: nuzo host install --all --yes",
    ].join("\n"));
  });

  it("runs selected host commands after explicit confirmation", () => {
    const executed: Array<[string, string[]]> = [];
    const result = runHostBootstrap(
      ["codex"],
      { dryRun: false, json: false, yes: true },
      (command, args) => {
        executed.push([command, args]);
        return { status: 0 };
      },
    );

    expect(executed).toEqual([
      ["codex", ["--version"]],
      ["claude", ["--version"]],
      ["codex", ["plugin", "marketplace", "add", "fabionfsc/nuzo-memory"]],
      ["codex", ["plugin", "add", "nuzo@nuzo-memory"]],
    ]);
    expect(result.hosts[0]?.steps.map((step) => step.status)).toEqual([
      "succeeded",
      "succeeded",
    ]);
    expect(result.dryRun).toBe(false);
  });

  it("requires a detected host before mutating host configuration", () => {
    expect(() => runHostBootstrap(
      ["claude-code"],
      { dryRun: false, json: false, yes: true },
      (command) => ({ status: command === "codex" ? 0 : 1 }),
    )).toThrow("Claude Code CLI was not found in PATH.");
  });

  it("formats machine-readable setup output", () => {
    const output = JSON.parse(formatHostBootstrapResult(createHostBootstrapPlan(
      ["codex" satisfies HostBootstrapHost],
      {
        codex: true,
        "claude-code": false,
      },
    ), true)) as {
      dry_run: boolean;
      hosts: Array<{ host: string; detected: boolean; steps: Array<{ status: string }> }>;
      next_steps: string[];
    };

    expect(output).toMatchObject({
      dry_run: true,
      hosts: [
        {
          host: "codex",
          detected: true,
          steps: [
            { status: "planned" },
            { status: "planned" },
          ],
        },
      ],
    });
    expect(output.next_steps).toContain("Codex only: nuzo host install codex --yes");
  });
});
