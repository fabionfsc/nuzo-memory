import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createProgram, type CliIO } from "../index.js";

let tempDirectories: string[] = [];

afterEach(() => {
  for (const directory of tempDirectories) {
    rmSync(directory, { recursive: true, force: true });
  }
  tempDirectories = [];
});

function createStorePath(): string {
  const directory = mkdtempSync(join(tmpdir(), "nuzo-cli-"));
  tempDirectories.push(directory);
  return join(directory, "memories.sqlite");
}

async function runCli(args: string[]): Promise<{ stderr: string[]; stdout: string[] }> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const io: CliIO = {
    stdout: (message) => stdout.push(message),
    stderr: (message) => stderr.push(message),
  };

  const program = createProgram(io);
  await program.parseAsync(["node", "nuzo", ...args], { from: "node" });

  return { stderr, stdout };
}

describe("nuzo memory cli", () => {
  it("initializes, remembers, updates, recalls, lists, and archives memory", async () => {
    const store = createStorePath();

    const init = await runCli(["memory", "--store", store, "init"]);
    expect(init.stdout.join("\n")).toContain("Nuzo initialized");

    const remembered = await runCli([
      "memory",
      "--store",
      store,
      "remember",
      "The user prefers local-first memory tools.",
      "--kind",
      "preference",
      "--tag",
      "workflow",
    ]);
    const id = remembered.stdout[0] ?? "";
    expect(id).toMatch(/^mem_/);

    const updated = await runCli([
      "memory",
      "--store",
      store,
      "update",
      id,
      "--content",
      "The user prefers concise final answers.",
      "--kind",
      "preference",
      "--tag",
      "style",
      "codex",
    ]);
    expect(updated.stdout).toEqual([id]);

    const recall = await runCli(["memory", "--store", store, "recall", "local-first"]);
    expect(recall.stdout).toEqual([]);

    const updatedRecall = await runCli(["memory", "--store", store, "recall", "concise answers"]);
    expect(updatedRecall.stdout.join("\n")).toContain(id);
    expect(updatedRecall.stdout.join("\n")).toContain("concise final answers");

    const list = await runCli(["memory", "--store", store, "list"]);
    expect(list.stdout.join("\n")).toContain(id);
    expect(list.stdout.join("\n")).toContain("preference");

    const archived = await runCli(["memory", "--store", store, "forget", id]);
    expect(archived.stdout).toEqual(["Archived"]);

    const visible = await runCli(["memory", "--store", store, "list"]);
    expect(visible.stdout).toEqual([]);
  });

  it("reports doctor information", async () => {
    const store = createStorePath();

    const output = await runCli(["memory", "--store", store, "doctor"]);
    const text = output.stdout.join("\n");

    expect(text).toContain(`Store: ${store}`);
    expect(text).toContain("Exists: no");
    expect(text).toContain("Network: disabled");
  });
});
