import { describe, expect, it } from "vitest";
import { formatHostUpdateResult, runHostUpdate } from "../host-update.js";

describe("managed host updates", () => {
  it("updates only installed plugins and preserves the Claude Code scope", () => {
    const executed: Array<[string, string[]]> = [];
    const result = runHostUpdate(
      ["codex", "claude-code"],
      { dryRun: false, json: false, yes: true },
      (command, args) => {
        executed.push([command, args]);
        if (args.join(" ") === "plugin list --json") {
          return command === "claude"
            ? { status: 0, stdout: JSON.stringify([{ id: "nuzo@nuzo-memory", scope: "project" }]) }
            : { status: 0, stdout: JSON.stringify({ installed: [{ id: "nuzo@nuzo-memory" }] }) };
        }
        return { status: 0 };
      },
    );

    expect(result.hosts.every((host) => host.installed)).toBe(true);
    expect(executed).toContainEqual([
      "codex",
      ["plugin", "marketplace", "upgrade", "nuzo-memory"],
    ]);
    expect(executed).toContainEqual([
      "codex",
      ["plugin", "add", "nuzo@nuzo-memory"],
    ]);
    expect(executed).toContainEqual([
      "claude",
      ["plugin", "marketplace", "update", "nuzo-memory"],
    ]);
    expect(executed).toContainEqual([
      "claude",
      ["plugin", "update", "nuzo@nuzo-memory", "--scope", "project"],
    ]);
  });

  it("does not reinstall or update an absent host plugin", () => {
    const executed: Array<[string, string[]]> = [];
    const result = runHostUpdate(
      ["codex", "claude-code"],
      { dryRun: true, json: false, yes: false },
      (command, args) => {
        executed.push([command, args]);
        if (args.join(" ") === "plugin list --json") {
          return command === "codex"
            ? { status: 0, stdout: JSON.stringify({ installed: [{ id: "nuzo@nuzo-memory" }] }) }
            : { status: 0, stdout: "[]" };
        }
        return { status: 0 };
      },
    );

    expect(result.hosts[0]?.steps).toHaveLength(2);
    expect(result.hosts[1]).toMatchObject({ installed: false, steps: [] });
    expect(executed.some(([, args]) => args.includes("marketplace") || args.includes("update"))).toBe(false);
    expect(formatHostUpdateResult(result, false)).toContain("Only already-installed Nuzo plugins are updated");
    expect(formatHostUpdateResult(result, false)).toContain(
      "Claude Code: not installed (skipped; run nuzo setup --claude-code --yes for first-time setup)",
    );
    expect(JSON.parse(formatHostUpdateResult(result, true)).next_steps).toContain(
      "Claude Code is not installed; run nuzo setup --claude-code --yes for first-time setup.",
    );
  });

  it("updates an installed host when another supported CLI is absent", () => {
    const executed: Array<[string, string[]]> = [];
    const result = runHostUpdate(
      ["codex", "claude-code"],
      { dryRun: false, json: false, yes: true },
      (command, args) => {
        executed.push([command, args]);
        if (command === "claude") return { status: 1 };
        if (args.join(" ") === "plugin list --json") {
          return { status: 0, stdout: JSON.stringify({ installed: [{ id: "nuzo@nuzo-memory" }] }) };
        }
        return { status: 0 };
      },
    );

    expect(result.hosts[1]).toMatchObject({ detected: false, installed: false });
    expect(executed).toContainEqual(["codex", ["plugin", "add", "nuzo@nuzo-memory"]]);
  });

  it("directs first-time users to setup", () => {
    expect(() => runHostUpdate(
      ["codex"],
      { dryRun: false, json: false, yes: true },
      (_command, args) => args.join(" ") === "plugin list --json"
        ? { status: 0, stdout: JSON.stringify({ installed: [] }) }
        : { status: 0 },
    )).toThrow("Run nuzo setup first.");
  });
});
