import { mkdtempSync, readFileSync, rmSync } from "node:fs";
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

  it("exports, dry-runs import, and imports memories", async () => {
    const sourceStore = createStorePath();
    const targetStore = createStorePath();
    const exportPath = join(mkdtempSync(join(tmpdir(), "nuzo-export-")), "memories.memory.export.json");
    tempDirectories.push(join(exportPath, ".."));

    const remembered = await runCli([
      "memory",
      "--store",
      sourceStore,
      "remember",
      "The user prefers portable memory backups.",
      "--kind",
      "preference",
      "--tag",
      "backup",
    ]);
    expect(remembered.stdout[0]).toMatch(/^mem_/);

    const exported = await runCli(["memory", "--store", sourceStore, "export", "--path", exportPath]);
    expect(exported.stdout[0]).toContain("Exported 1 memories");

    const document = JSON.parse(readFileSync(exportPath, "utf8")) as { format: string; memories: unknown[] };
    expect(document.format).toBe("nuzo-memory-export");
    expect(document.memories).toHaveLength(1);

    const dryRun = await runCli(["memory", "--store", targetStore, "import", exportPath, "--dry-run"]);
    expect(dryRun.stdout).toEqual(["Would import 1 memories"]);

    const empty = await runCli(["memory", "--store", targetStore, "list"]);
    expect(empty.stdout).toEqual([]);

    const imported = await runCli(["memory", "--store", targetStore, "import", exportPath]);
    expect(imported.stdout).toEqual(["Imported 1 memories"]);

    const recall = await runCli(["memory", "--store", targetStore, "recall", "portable backups"]);
    expect(recall.stdout.join("\n")).toContain("portable memory backups");
  });

  it("reports doctor information", async () => {
    const store = createStorePath();

    const output = await runCli(["memory", "--store", store, "doctor"]);
    const text = output.stdout.join("\n");

    expect(text).toContain(`Store: ${store}`);
    expect(text).toContain("Store exists: no");
    expect(text).toContain("Store directory exists: yes");
    expect(text).toContain("Git tracking:");
    expect(text).toContain("Network: disabled");
    expect(text).toContain("Status: warning");
  });
});
