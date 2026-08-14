import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { semanticIndexPathFor, SQLiteMemoryDatabase } from "@nuzo/memory-core";
import { createProgram, setupHostsFromOptions, type CliIO, type SetupCommandOptions } from "../index.js";

let tempDirectories: string[] = [];
let testHome: string;

beforeEach(() => {
  testHome = mkdtempSync(join(tmpdir(), "nuzo-home-"));
  tempDirectories.push(testHome);
});

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

function inspectFtsCount(path: string): number {
  const database = new SQLiteMemoryDatabase({ path });
  try {
    const row = database.database.prepare("SELECT COUNT(*) AS count FROM memories_fts").get() as { count: number };
    return row.count;
  } finally {
    database.close();
  }
}

function snapshotStoreRows(path: string): Record<string, unknown[]> {
  const database = new SQLiteMemoryDatabase({ path, readonly: true });
  try {
    return Object.fromEntries(
      ["memories", "memory_relations", "memory_events"].map((table) => [
        table,
        database.database.prepare(`SELECT * FROM ${table} ORDER BY id`).all(),
      ]),
    );
  } finally {
    database.close();
  }
}

async function runCli(
  args: string[],
  env: NodeJS.ProcessEnv = {},
): Promise<{ stderr: string[]; stdout: string[] }> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const io: CliIO = {
    stdout: (message) => stdout.push(message),
    stderr: (message) => stderr.push(message),
  };

  const program = createProgram(io);
  const effectiveEnv = {
    HOME: testHome,
    ...env,
  };
  const previousEnv = new Map(Object.keys(effectiveEnv).map((key) => [key, process.env[key]]));
  const previousExitCode = process.exitCode;
  try {
    process.exitCode = 0;
    for (const [key, value] of Object.entries(effectiveEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    await program.parseAsync(["node", "nuzo", ...args], { from: "node" });
  } finally {
    process.exitCode = previousExitCode;
    for (const [key, value] of previousEnv) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }

  return { stderr, stdout };
}

function setupOptions(): SetupCommandOptions {
  return {
    all: false,
    claudeCode: false,
    codex: false,
    dryRun: false,
    json: false,
    yes: false,
  };
}

function fakeSetupIO(input: string, output: string[]): CliIO {
  return {
    stdout: (message) => output.push(message),
    stderr: (message) => output.push(message),
    readStdin: () => input,
  };
}

describe("nuzo memory cli", () => {
  it("prints read-only host integration discovery", async () => {
    const text = await runCli(["hosts"]);
    expect(text.stderr).toEqual([]);
    expect(text.stdout[0]).toContain("Nuzo host integrations");
    expect(text.stdout[0]).toContain("Managed setup:");
    expect(text.stdout[0]).toContain("Codex (codex):");
    expect(text.stdout[0]).toContain("Claude Code (claude-code):");
    expect(text.stdout[0]).toContain("Manual MCP:");
    expect(text.stdout[0]).toContain("Research candidates:");

    const json = await runCli(["hosts", "--json"]);
    const output = JSON.parse(json.stdout[0] ?? "{}") as {
      hosts: Array<{ slug: string; support: string; setup_command: string | null }>;
    };
    expect(output.hosts).toContainEqual(expect.objectContaining({
      slug: "codex",
      support: "managed",
      setup_command: "nuzo setup --codex --yes",
    }));
    expect(output.hosts).toContainEqual(expect.objectContaining({
      slug: "generic-mcp",
      support: "manual-mcp",
      setup_command: null,
    }));
  });

  it("prints host setup dry-run plans without changing host configuration", async () => {
    const codex = await runCli(["setup", "--codex", "--dry-run"]);
    expect(codex.stderr).toEqual([]);
    expect(codex.stdout[0]).toContain("Nuzo host setup plan");
    expect(codex.stdout[0]).toMatch(/Codex: (detected|not detected)/);
    expect(codex.stdout[0]).toContain("- planned: codex plugin marketplace add fabionfsc/nuzo-memory");
    expect(codex.stdout[0]).toContain("- planned: codex plugin add nuzo@nuzo-memory");
    expect(codex.stdout[0]).toContain("Codex only: nuzo setup --codex --yes");
    expect(codex.stdout[0]).toContain("Claude Code only: nuzo setup --claude-code --yes");
    expect(codex.stdout[0]).toContain("Both hosts: nuzo setup --all --yes");

    const setup = await runCli(["setup", "--codex", "--claude-code", "--dry-run", "--json"]);
    const output = JSON.parse(setup.stdout[0] ?? "{}") as {
      dry_run: boolean;
      hosts: Array<{ host: string; steps: Array<{ command: string; status: string }> }>;
      next_steps: string[];
    };
    expect(output).toMatchObject({
      dry_run: true,
      hosts: [
        {
          host: "codex",
          steps: [
            { command: "codex", status: "planned" },
            { command: "codex", status: "planned" },
          ],
        },
        {
          host: "claude-code",
          steps: [
            { command: "claude", status: "planned" },
            { command: "claude", status: "planned" },
          ],
        },
      ],
    });
    expect(output.next_steps).toContain("Both hosts: nuzo setup --all --yes");

    const all = await runCli(["setup", "--all", "--dry-run", "--json"]);
    expect(JSON.parse(all.stdout[0] ?? "{}")).toMatchObject({
      dry_run: true,
      hosts: [
        { host: "codex" },
        { host: "claude-code" },
      ],
    });

  });

  it("lets default setup choose a detected host interactively", () => {
    const output: string[] = [];
    const detected = { codex: true, "claude-code": true };
    const base = setupOptions();

    expect(setupHostsFromOptions(base, detected, fakeSetupIO("1\n", output))).toEqual(["codex"]);
    expect(setupHostsFromOptions(base, detected, fakeSetupIO("2\n", output))).toEqual(["claude-code"]);
    expect(setupHostsFromOptions(base, detected, fakeSetupIO("\n", output))).toEqual(["codex", "claude-code"]);
    expect(output.join("\n")).toContain("Choose which host plugins to configure");
  });

  it("keeps setup automation deterministic without interactive selection", () => {
    const output: string[] = [];
    const detected = { codex: true, "claude-code": true };
    const io = fakeSetupIO("1\n", output);

    expect(setupHostsFromOptions({ ...setupOptions(), yes: true }, detected, io)).toEqual(["codex", "claude-code"]);
    expect(setupHostsFromOptions({ ...setupOptions(), dryRun: true }, detected, io)).toEqual(["codex", "claude-code"]);
    expect(setupHostsFromOptions({ ...setupOptions(), json: true }, detected, io)).toEqual(["codex", "claude-code"]);
    expect(setupHostsFromOptions({ ...setupOptions(), codex: true }, detected, io)).toEqual(["codex"]);
    expect(setupHostsFromOptions(setupOptions(), { codex: true, "claude-code": false }, io)).toEqual(["codex"]);
    expect(output).toEqual([]);
  });

  it("rejects invalid interactive setup host choices", () => {
    expect(() => setupHostsFromOptions(
      setupOptions(),
      { codex: true, "claude-code": true },
      fakeSetupIO("wat\n", []),
    )).toThrow("Choose 1 for Codex, 2 for Claude Code, or 3 for both.");
  });

  it("rejects ambiguous setup target styles", async () => {
    const result = await runCli(["setup", "--codex", "--all", "--dry-run"]);
    expect(result.stdout).toEqual([]);
    expect(result.stderr.join("\n")).toContain(
      "Use --codex, --claude-code, or --all, not multiple target styles.",
    );
  });

  it("rejects ambiguous update target styles", async () => {
    const result = await runCli(["update", "--codex", "--all", "--dry-run"]);
    expect(result.stdout).toEqual([]);
    expect(result.stderr.join("\n")).toContain(
      "Use --codex, --claude-code, or --all, not multiple target styles.",
    );
  });

  it("does not expose removed host command compatibility paths", async () => {
    await expect(runCli(["host", "install", "codex", "--dry-run"])).rejects.toThrow(
      "unknown command 'host'",
    );
    await expect(runCli(["setup", "--host", "codex", "--dry-run"])).rejects.toThrow(
      "unknown option '--host'",
    );
    await expect(runCli(["update", "--host", "codex", "--dry-run"])).rejects.toThrow(
      "unknown option '--host'",
    );
  });

  it("keeps FTS default and reports semantic fallback and maintenance state", async () => {
    const store = createStorePath();
    await runCli(["memory", "--store", store, "init"]);

    const status = await runCli(["memory", "--store", store, "semantic", "status", "--json"]);
    const statusOutput = JSON.parse(status.stdout.join("\n")) as {
      model: { state: string };
      index: { state: string };
    };
    expect(statusOutput).toMatchObject({ model: { state: "missing" }, index: { state: "missing" } });

    const fallback = await runCli([
      "memory", "--store", store, "recall", "marine biology", "--mode", "hybrid", "--json",
    ]);
    const fallbackOutput = JSON.parse(fallback.stdout.join("\n")) as {
      results: unknown[];
      diagnostics: { requestedMode: string; effectiveMode: string; semanticFallbackCode: string };
    };
    expect(fallbackOutput.results).toEqual([]);
    expect(fallbackOutput.diagnostics).toEqual({
      requestedMode: "hybrid",
      effectiveMode: "fts",
      semanticFallbackCode: "SEMANTIC_INDEX_MISSING",
    });

    const strict = await runCli([
      "memory", "--store", store, "recall", "marine biology", "--mode", "semantic",
    ]);
    expect(strict.stderr).toEqual(["SEMANTIC_INDEX_MISSING: Semantic index does not exist."]);

    const provision = await runCli(["memory", "semantic", "provision", "--yes"]);
    expect(provision.stderr).toEqual([
      "SEMANTIC_NETWORK_OPT_IN_REQUIRED: Provisioning the pinned semantic model requires explicit network opt-in.",
    ]);
    const clearWithoutConfirmation = await runCli(["memory", "--store", store, "semantic", "clear"]);
    expect(clearWithoutConfirmation.stderr).toEqual([
      "SEMANTIC_CLEAR_CONFIRMATION_REQUIRED: Clearing the semantic sidecar requires --yes.",
    ]);
    const clear = await runCli(["memory", "--store", store, "semantic", "clear", "--yes"]);
    expect(clear.stdout).toEqual(["Semantic index already absent"]);
  });

  it("applies user config scope, recall defaults, and privacy settings", async () => {
    const init = await runCli(["memory", "--scope", "user:custom", "init"]);
    expect(init.stdout.join("\n")).toContain("Scope: user:custom");
    const configPath = join(testHome, ".nuzo", "config.json");
    const config = JSON.parse(readFileSync(configPath, "utf8")) as {
      recall: { include_global: boolean; limit: number };
      privacy: { allow_network: boolean; record_recall_events: boolean };
      authorization: { mode: string; allowed_scopes: string[] };
    };
    expect(config.authorization).toEqual({
      mode: "restricted",
      allowed_scopes: ["project:auto", "user:custom", "user:default"],
    });
    config.recall.limit = 1;
    config.recall.include_global = false;
    config.privacy.record_recall_events = true;
    writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

    const first = await runCli([
      "memory",
      "remember",
      "First configured recall memory.",
      "--kind",
      "note",
    ]);
    await runCli([
      "memory",
      "remember",
      "Second configured recall memory.",
      "--kind",
      "note",
    ]);

    const limited = await runCli(["memory", "recall", "configured recall memory"]);
    expect(limited.stdout).toHaveLength(1);
    const expanded = await runCli([
      "memory",
      "recall",
      "configured recall memory",
      "--limit",
      "2",
    ]);
    expect(expanded.stdout).toHaveLength(2);
    const history = await runCli(["memory", "history", first.stdout[0] ?? ""]);
    expect(history.stdout.some((line) => line.includes("memory.recalled"))).toBe(true);
    const recalledEvent = history.stdout.find((line) => line.includes("memory.recalled")) ?? "";
    expect(recalledEvent).toContain('"queryHash"');
    expect(recalledEvent).toContain('"queryHashAlgorithm":"sha256"');
    expect(recalledEvent).not.toContain("configured recall memory");
  });

  it("applies shared runtime environment overrides", async () => {
    const store = createStorePath();

    const init = await runCli(["memory", "init"], {
      NUZO_MEMORY_STORE: store,
      NUZO_MEMORY_SCOPE: "project:env",
    });
    expect(init.stdout).toContain(`Store: ${store}`);
    expect(init.stdout).toContain("Scope: project:env");

    await runCli([
      "memory",
      "remember",
      "Environment runtime config selects the default project scope.",
      "--kind",
      "instruction",
    ], {
      NUZO_MEMORY_STORE: store,
      NUZO_MEMORY_SCOPE: "project:env",
    });

    const listed = await runCli(["memory", "list"], {
      NUZO_MEMORY_STORE: store,
      NUZO_MEMORY_SCOPE: "project:env",
    });
    expect(listed.stdout.join("\n")).toContain("scope=project:env");
  });

  it("supports legacy user config defaults and home-relative storage", async () => {
    const configRoot = join(testHome, ".nuzo");
    mkdirSync(configRoot, { recursive: true });
    writeFileSync(
      join(configRoot, "config.json"),
      JSON.stringify({
        version: 1,
        default_scope: "user:legacy",
        storage: {
          driver: "sqlite",
          path: "~/.nuzo/memory/legacy.sqlite",
        },
      }),
      "utf8",
    );

    const remembered = await runCli([
      "memory",
      "remember",
      "Legacy config remains readable.",
      "--kind",
      "note",
    ]);
    expect(remembered.stdout[0]).toMatch(/^mem_/);
    expect(existsSync(join(configRoot, "memory", "legacy.sqlite"))).toBe(true);

    const recall = await runCli(["memory", "recall", "legacy config"]);
    expect(recall.stdout).toHaveLength(1);
    const history = await runCli(["memory", "history", remembered.stdout[0] ?? ""]);
    expect(history.stdout.some((line) => line.includes("memory.recalled"))).toBe(false);
  });

  it("reports malformed user config as an operational error", async () => {
    const configRoot = join(testHome, ".nuzo");
    mkdirSync(configRoot, { recursive: true });
    writeFileSync(join(configRoot, "config.json"), "{invalid", "utf8");

    const output = await runCli(["memory", "list"]);

    expect(output.stderr).toEqual([
      "MEMORY_CONFIG_INVALID: Nuzo config is not valid JSON.",
    ]);
  });

  it("initializes, remembers, updates, recalls, lists, and archives memory", async () => {
    const store = createStorePath();

    const init = await runCli(["memory", "--store", store, "init"]);
    expect(init.stdout.join("\n")).toContain("Nuzo initialized");
    expect(existsSync(store)).toBe(true);
    expect(existsSync(join(store, "..", "config.json"))).toBe(true);
    expect(existsSync(join(store, "..", "exports"))).toBe(true);
    expect(existsSync(join(store, "..", "logs"))).toBe(true);
    expect(statSync(store).mode & 0o777).toBe(0o600);
    expect(statSync(join(store, "..", "config.json")).mode & 0o777).toBe(0o600);
    expect(statSync(join(store, "..", "exports")).mode & 0o777).toBe(0o700);
    expect(statSync(join(store, "..", "logs")).mode & 0o777).toBe(0o700);

    const remembered = await runCli([
      "memory",
      "--store",
      store,
      "remember",
      "The user prefers local-first memory tools.",
      "--kind",
      "preference",
      "--confidence-state",
      "needs_review",
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
    expect(list.stdout.join("\n")).toContain("rev=2");
    expect(list.stdout.join("\n")).toContain("preference");

    const history = await runCli(["memory", "--store", store, "history", id]);
    expect(history.stdout).toHaveLength(2);
    expect(history.stdout[0]).toContain("memory.created");
    expect(history.stdout[1]).toContain("memory.updated");
    expect(history.stdout.join("\n")).not.toContain("concise final answers");

    const auditExportPath = join(tempDirectories[0] ?? tmpdir(), "audit-export.json");
    await runCli(["memory", "--store", store, "export", "--path", auditExportPath]);

    const audit = await runCli([
      "memory",
      "--store",
      store,
      "audit",
      "--event-type",
      "memory.exported",
      "--limit",
      "5",
    ]);
    expect(audit.stdout).toHaveLength(1);
    expect(audit.stdout[0]).toContain("global\tmemory.exported\tnuzo:cli");
    expect(audit.stdout[0]).not.toContain("concise final answers");

    const memoryAudit = await runCli([
      "memory",
      "--store",
      store,
      "audit",
      "--memory-id",
      id,
      "--event-type",
      "memory.created",
      "memory.updated",
      "--actor",
      "nuzo:cli",
      "--since",
      "2000-01-01T00:00:00.000Z",
      "--until",
      "2999-01-01T00:00:00.000Z",
      "--limit",
      "10",
    ]);
    expect(memoryAudit.stdout).toHaveLength(2);
    expect(memoryAudit.stdout[0]).toContain(`${id}\tmemory.updated\tnuzo:cli`);
    expect(memoryAudit.stdout[1]).toContain(`${id}\tmemory.created\tnuzo:cli`);
    expect(memoryAudit.stdout.join("\n")).not.toContain("concise final answers");

    const scopedExportAudit = await runCli([
      "memory",
      "--store",
      store,
      "--scope",
      "user:default",
      "audit",
      "--event-type",
      "memory.exported",
    ]);
    expect(scopedExportAudit.stdout).toHaveLength(1);
    expect(scopedExportAudit.stdout[0]).toContain("global\tmemory.exported\tnuzo:cli");

    const archived = await runCli(["memory", "--store", store, "forget", id, "--archive"]);
    expect(archived.stdout).toEqual(["Archived"]);

    const visible = await runCli(["memory", "--store", store, "list"]);
    expect(visible.stdout).toEqual([]);
  });

  it("neutralizes untrusted controls in human output while preserving JSON data", async () => {
    const store = createStorePath();
    const content = [
      "security sentinel\u001b]8;;https://example.invalid\u0007 forged",
      "row\tcolumn\u009b31m\u2028<script>alert(1)</script>",
      "```",
    ].join("\n");
    const remembered = await runCli([
      "memory", "--store", store, "remember", content,
      "--kind", "note",
      "--tag", "security",
    ]);
    const id = remembered.stdout[0] ?? "";

    const recall = await runCli(["memory", "--store", store, "recall", "security sentinel"]);
    const list = await runCli(["memory", "--store", store, "list"]);
    const shown = await runCli(["memory", "--store", store, "show", id]);
    const humanOutputs = [
      recall.stdout.join("\n"),
      list.stdout.join("\n"),
      shown.stdout.join("\n"),
    ];
    for (const rendered of humanOutputs) {
      expect(rendered).not.toMatch(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u2028\u2029]/u);
      expect(rendered).toContain("\\u001b");
      expect(rendered).toContain("forged\\nrow\\tcolumn");
    }

    const json = await runCli(["memory", "--store", store, "show", id, "--json"]);
    expect(JSON.parse(json.stdout[0] ?? "{}").memory.content).toBe(content);

    const markdown = await runCli(["memory", "--store", store, "export", "--format", "markdown"]);
    const renderedMarkdown = markdown.stdout[0] ?? "";
    expect(renderedMarkdown).toContain("````text\n");
    expect(renderedMarkdown).toContain("<script>alert(1)</script>");
    expect(renderedMarkdown).toContain("\\u001b");
    expect(renderedMarkdown).toContain("forged\nrow\\tcolumn");
    expect(renderedMarkdown).not.toMatch(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u2028\u2029]/u);
  });

  it("validates capture suggestions without writing memory", async () => {
    const store = createStorePath();
    await runCli(["memory", "--store", store, "init"]);

    const suggestion = await runCli([
      "memory",
      "--store",
      store,
      "suggest-capture",
      "  The user prefers concise final answers.  ",
      "--kind",
      "preference",
      "--tag",
      "workflow",
      "workflow",
      "--source",
      "codex:capture-suggestion",
      "--confidence",
      "0.72",
      "--reason",
      "The user stated a durable response style preference.",
    ]);

    expect(suggestion.stderr).toEqual([]);
    expect(suggestion.stdout).toEqual([
      [
        "Status: ready",
        "Memory writes: no",
        "Requires confirmation: yes",
        "Content: The user prefers concise final answers.",
        "Kind: preference",
        "Scope: user:default",
        "Tags: workflow",
        "Source: codex:capture-suggestion",
        "Confidence: 0.72",
        "Confidence state: inferred",
        "Review after: none",
        "Expires at: none",
        "Reason: The user stated a durable response style preference.",
      ].join("\n"),
    ]);
    await expect(runCli(["memory", "--store", store, "list"])).resolves.toEqual({
      stderr: [],
      stdout: [],
    });
  });

  it("lists memories due for review from review_after or expires_at", async () => {
    const store = createStorePath();
    await runCli(["memory", "--store", store, "init"]);

    const due = await runCli([
      "memory",
      "--store",
      store,
      "remember",
      "Review the old deployment flow before using it.",
      "--kind",
      "project_decision",
      "--review-after",
      "2000-01-01T00:00:00.000Z",
      "--expires-at",
      "2001-01-01T00:00:00.000Z",
    ]);
    const dueId = due.stdout[0] ?? "";

    await runCli([
      "memory",
      "--store",
      store,
      "remember",
      "Review the future deployment flow later.",
      "--kind",
      "project_decision",
      "--review-after",
      "2999-01-01T00:00:00.000Z",
    ]);

    const listed = await runCli(["memory", "--store", store, "list", "--needs-review"]);
    expect(listed.stdout).toHaveLength(1);
    expect(listed.stdout[0]).toContain(dueId);
    expect(listed.stdout[0]).toContain("needs_review");
    expect(listed.stdout[0]).toContain("expired");

    await runCli([
      "memory",
      "--store",
      store,
      "update",
      dueId,
      "--clear-review-after",
      "--clear-expires-at",
    ]);

    const afterClear = await runCli(["memory", "--store", store, "list", "--needs-review"]);
    expect(afterClear.stdout).toEqual([]);
  });

  it("shows and challenges memories from the CLI", async () => {
    const store = createStorePath();
    const previous = await runCli([
      "memory",
      "--store",
      store,
      "remember",
      "The deploy flow uses script A.",
      "--kind",
      "project_decision",
    ]);
    const previousId = previous.stdout[0] ?? "";
    const current = await runCli([
      "memory",
      "--store",
      store,
      "remember",
      "The deploy flow uses script B.",
      "--kind",
      "project_decision",
    ]);
    const currentId = current.stdout[0] ?? "";

    const challenge = await runCli([
      "memory",
      "--store",
      store,
      "challenge",
      previousId,
      "--outcome",
      "needs_review",
      "--reason",
      "Need to re-check this before relying on it.",
      "--expected-revision",
      "1",
      "--json",
    ]);
    expect(JSON.parse(challenge.stdout[0] ?? "{}")).toMatchObject({
      id: previousId,
      outcome: "needs_review",
      revision: 2,
      confidence_state: "needs_review",
    });

    const show = await runCli([
      "memory",
      "--store",
      store,
      "show",
      previousId,
      "--json",
    ]);
    const showOutput = JSON.parse(show.stdout[0] ?? "{}") as {
      memory: { id: string; revision: number; confidence_state: string };
      relations: unknown[];
      events: Array<{ event_type: string }>;
    };
    expect(showOutput).toMatchObject({
      memory: {
        id: previousId,
        revision: 2,
        confidence_state: "needs_review",
      },
      relations: [],
    });
    expect(showOutput.events.map((event) => event.event_type).sort()).toEqual([
      "memory.challenged",
      "memory.created",
      "memory.updated",
    ]);

    const superseded = await runCli([
      "memory",
      "--store",
      store,
      "challenge",
      previousId,
      "--outcome",
      "superseded",
      "--superseded-by",
      currentId,
      "--reason",
      "Script B replaced script A.",
      "--expected-revision",
      "2",
      "--json",
    ]);
    expect(JSON.parse(superseded.stdout[0] ?? "{}")).toMatchObject({
      id: previousId,
      outcome: "superseded",
      revision: 3,
      confidence_state: "deprecated",
      relation: {
        source_memory_id: currentId,
        target_memory_id: previousId,
        relation: "supersedes",
      },
    });
  });

  it("prints duplicate capture suggestions as JSON", async () => {
    const store = createStorePath();
    await runCli([
      "memory",
      "--store",
      store,
      "remember",
      "The user prefers concise final answers.",
      "--kind",
      "preference",
      "--tag",
      "workflow",
    ]);

    const suggestion = await runCli([
      "memory",
      "--store",
      store,
      "suggest-capture",
      " the USER prefers   concise final answers. ",
      "--kind",
      "note",
      "--tag",
      "style",
      "--reason",
      "Equivalent content was inferred from the conversation.",
      "--json",
    ]);
    const output = JSON.parse(suggestion.stdout[0] ?? "{}") as {
      status: string;
      memory_writes: boolean;
      requires_confirmation: boolean;
      draft: { content: string; scope: string; tags: string[] };
      duplicate: { id: string; content: string } | null;
    };

    expect(output).toMatchObject({
      status: "duplicate",
      memory_writes: false,
      requires_confirmation: true,
      draft: {
        content: "the USER prefers   concise final answers.",
        scope: "user:default",
        tags: ["style"],
      },
      duplicate: {
        content: "The user prefers concise final answers.",
      },
    });
    expect(output.duplicate?.id).toMatch(/^mem_/);
  });

  it("prints bounded capture relationship evidence as JSON", async () => {
    const store = createStorePath();
    await runCli([
      "memory",
      "--store",
      store,
      "remember",
      "The user prefers concise final answers with explicit tradeoffs.",
      "--kind",
      "preference",
      "--tag",
      "communication",
      "style",
    ]);

    const suggestion = await runCli([
      "memory",
      "--store",
      store,
      "suggest-capture",
      "The user prefers detailed final answers with explicit tradeoffs.",
      "--kind",
      "preference",
      "--tag",
      "communication",
      "--reason",
      "The user stated a durable response style preference.",
      "--relationship-mode",
      "bounded",
      "--json",
    ]);
    const output = JSON.parse(suggestion.stdout[0] ?? "{}") as {
      status: string;
      relationship_mode?: string;
      relationship?: string;
      relationship_evidence?: {
        primary_memory_id: string | null;
        candidate_limit: number;
        returned_limit: number;
        candidates: Array<{ memory: { id: string }; matched_tags: string[] }>;
      };
    };

    expect(output).toMatchObject({
      status: "review",
      relationship_mode: "bounded",
      relationship: "update_candidate",
      relationship_evidence: {
        candidate_limit: 20,
        returned_limit: 3,
        candidates: [
          {
            matched_tags: ["communication"],
          },
        ],
      },
    });
    expect(output.relationship_evidence?.primary_memory_id).toMatch(/^mem_/);
  });

  it("prints bounded capture relationship evidence for humans", async () => {
    const store = createStorePath();
    const remembered = await runCli([
      "memory",
      "--store",
      store,
      "remember",
      "The user prefers concise final answers with explicit tradeoffs.",
      "--kind",
      "preference",
      "--tag",
      "communication",
      "style",
    ]);
    const memoryId = remembered.stdout[0] ?? "";

    const suggestion = await runCli([
      "memory",
      "--store",
      store,
      "suggest-capture",
      "The user prefers detailed final answers with explicit tradeoffs.",
      "--kind",
      "preference",
      "--tag",
      "communication",
      "--reason",
      "The user stated a durable response style preference.",
      "--relationship-mode",
      "bounded",
    ]);

    expect(suggestion.stderr).toEqual([]);
    expect(suggestion.stdout).toEqual([
      [
        "Status: review",
        "Memory writes: no",
        "Requires confirmation: yes",
        "Content: The user prefers detailed final answers with explicit tradeoffs.",
        "Kind: preference",
        "Scope: user:default",
        "Tags: communication",
        "Source: nuzo:cli:capture-suggestion",
        "Confidence: 1",
        "Confidence state: inferred",
        "Review after: none",
        "Expires at: none",
        "Reason: The user stated a durable response style preference.",
        "Relationship: update_candidate",
        "Relationship reason: The draft appears to revise an active same-scope memory rather than add a separate memory.",
        `Primary memory: ${memoryId}`,
      ].join("\n"),
    ]);
  });

  it("reports content-free relation governance candidates without changing SQLite state", async () => {
    const store = createStorePath();
    const previous = await runCli([
      "memory", "--store", store, "--scope", "project:nuzo", "remember",
      "Final answers should be concise for routine status updates.",
      "--kind", "preference", "--tag", "response", "style",
    ]);
    const current = await runCli([
      "memory", "--store", store, "--scope", "project:nuzo", "remember",
      "Final answers should now be detailed instead of concise for routine status updates.",
      "--kind", "preference", "--tag", "response", "style",
    ]);
    const previousId = previous.stdout[0] ?? "";
    const currentId = current.stdout[0] ?? "";
    await runCli([
      "memory", "--store", store, "relate", currentId,
      "--target", previousId, "--relation", "supersedes",
    ]);
    const before = snapshotStoreRows(store);

    const jsonReview = await runCli([
      "memory", "--store", store, "--scope", "project:nuzo",
      "review-relations", "--limit", "20", "--json",
    ]);
    const output = JSON.parse(jsonReview.stdout[0] ?? "{}") as {
      version: number;
      mode: string;
      memory_writes: boolean;
      relation_writes: boolean;
      lifecycle_writes: boolean;
      audit_writes: boolean;
      candidates: Array<{
        primary_memory_id: string;
        candidate_memory_id: string;
        relationship: string;
        reason_codes: string[];
        state: string;
      }>;
    };
    expect(output).toMatchObject({
      version: 1,
      mode: "read_only",
      memory_writes: false,
      relation_writes: false,
      lifecycle_writes: false,
      audit_writes: false,
      candidates: [expect.objectContaining({
        primary_memory_id: currentId,
        candidate_memory_id: previousId,
        relationship: "update_candidate",
        reason_codes: expect.arrayContaining(["possible_revision", "shared_tags", "shared_terms"]),
        state: "already_related",
      })],
    });
    expect(jsonReview.stdout[0]).not.toContain("Final answers");
    expect(snapshotStoreRows(store)).toEqual(before);

    const humanReview = await runCli([
      "memory", "--store", store, "--scope", "project:nuzo", "review-relations",
    ]);
    expect(humanReview.stderr).toEqual([]);
    expect(humanReview.stdout[0]).toContain("Relation governance review (read-only)");
    expect(humanReview.stdout[0]).toContain(`candidate=${previousId}`);
    expect(humanReview.stdout[0]).toContain("No changes were made.");
    expect(humanReview.stdout[0]).not.toContain("Final answers");
    expect(snapshotStoreRows(store)).toEqual(before);
  });

  it("plans and explicitly applies project-scope rehome with a retained backup", async () => {
    const store = createStorePath();
    const backup = join(tempDirectories[0]!, "scope-rehome.backup.sqlite");
    const sourceScope = "project:old-cli-location";
    const targetScope = "project:new-cli-location";
    const first = await runCli([
      "memory", "--store", store, "--scope", sourceScope, "remember",
      "CLI scope rehome preserves this decision.", "--kind", "project_decision",
    ]);
    const second = await runCli([
      "memory", "--store", store, "--scope", sourceScope, "remember",
      "CLI scope rehome preserves this relation.", "--kind", "note",
    ]);
    await runCli([
      "memory", "--store", store, "relate", first.stdout[0] ?? "",
      "--target", second.stdout[0] ?? "", "--relation", "related_to",
    ]);
    const before = snapshotStoreRows(store);

    const preview = await runCli([
      "memory", "--store", store, "rehome-scope",
      "--from", sourceScope, "--to", targetScope, "--dry-run", "--json",
    ]);
    expect(preview.stderr).toEqual([]);
    expect(JSON.parse(preview.stdout[0] ?? "{}")).toMatchObject({
      version: 1,
      dry_run: true,
      source_scope: sourceScope,
      target_scope: targetScope,
      applicable: true,
      memory_count: 2,
      affected_relation_count: 1,
      historical_events_rewritten: 0,
      collision_count: 0,
      integrity: { ok: true, fts_ok: true },
    });
    expect(snapshotStoreRows(store)).toEqual(before);

    const unconfirmed = await runCli([
      "memory", "--store", store, "rehome-scope",
      "--from", sourceScope, "--to", targetScope,
      "--apply", "--backup-path", backup,
    ]);
    expect(unconfirmed.stdout).toEqual([]);
    expect(unconfirmed.stderr.join("\n")).toContain("explicit --yes confirmation");
    expect(existsSync(backup)).toBe(false);
    expect(snapshotStoreRows(store)).toEqual(before);

    const applied = await runCli([
      "memory", "--store", store, "rehome-scope",
      "--from", sourceScope, "--to", targetScope,
      "--apply", "--yes", "--backup-path", backup, "--json",
    ]);
    expect(applied.stderr).toEqual([]);
    expect(JSON.parse(applied.stdout[0] ?? "{}")).toMatchObject({
      version: 1,
      applied: true,
      backup_path: backup,
      source_scope: sourceScope,
      target_scope: targetScope,
      memory_count: 2,
      affected_relation_count: 1,
      historical_events_rewritten: 0,
      revisions_preserved: true,
      backup_integrity: { ok: true },
      after_integrity: { ok: true, fts_ok: true },
    });
    expect(existsSync(backup)).toBe(true);
    const database = new SQLiteMemoryDatabase({ path: store, readonly: true });
    expect(database.database.prepare("SELECT COUNT(*) AS count FROM memories WHERE scope = ?")
      .get(sourceScope)).toEqual({ count: 0 });
    expect(database.database.prepare("SELECT COUNT(*) AS count FROM memories WHERE scope = ?")
      .get(targetScope)).toEqual({ count: 2 });
    expect(database.database.prepare("SELECT COUNT(*) AS count FROM memory_relations").get())
      .toEqual({ count: 1 });
    expect(database.database.prepare(
      "SELECT COUNT(*) AS count FROM memory_events WHERE event_type = 'memory.scope.rehomed'",
    ).get()).toEqual({ count: 1 });
    database.close();
  });

  it("applies confirmed capture decisions from the CLI", async () => {
    const store = createStorePath();

    const created = await runCli([
      "memory",
      "--store",
      store,
      "confirm-capture",
      "The user prefers concise final answers.",
      "--decision",
      "create",
      "--kind",
      "preference",
      "--tag",
      "communication",
      "--source",
      "codex:capture-confirmed",
      "--reason",
      "The user confirmed a durable preference.",
      "--yes",
      "--json",
    ]);
    const createdOutput = JSON.parse(created.stdout[0] ?? "{}") as {
      status: string;
      memory_writes: boolean;
      memory: { id: string; revision: number } | null;
    };
    const memoryId = createdOutput.memory?.id ?? "";
    expect(createdOutput).toMatchObject({
      status: "created",
      memory_writes: true,
      memory: {
        revision: 1,
      },
    });

    const duplicate = await runCli([
      "memory",
      "--store",
      store,
      "confirm-capture",
      " the USER prefers concise final answers. ",
      "--decision",
      "create",
      "--kind",
      "note",
      "--reason",
      "The user confirmed an equivalent draft.",
      "--yes",
      "--json",
    ]);
    expect(JSON.parse(duplicate.stdout[0] ?? "{}")).toMatchObject({
      status: "skipped",
      memory_writes: false,
      memory: {
        id: memoryId,
        revision: 1,
      },
    });

    const updated = await runCli([
      "memory",
      "--store",
      store,
      "confirm-capture",
      "The user prefers detailed final answers.",
      "--decision",
      "update",
      "--kind",
      "preference",
      "--tag",
      "communication",
      "--reason",
      "The user confirmed a replacement preference.",
      "--target-memory-id",
      memoryId,
      "--expected-revision",
      "1",
      "--yes",
      "--json",
    ]);
    expect(JSON.parse(updated.stdout[0] ?? "{}")).toMatchObject({
      status: "updated",
      memory_writes: true,
      memory: {
        id: memoryId,
        revision: 2,
        content: "The user prefers detailed final answers.",
      },
    });

    const stale = await runCli([
      "memory",
      "--store",
      store,
      "confirm-capture",
      "This stale confirmed update must not commit.",
      "--decision",
      "update",
      "--kind",
      "preference",
      "--reason",
      "The user confirmed using a stale displayed revision.",
      "--target-memory-id",
      memoryId,
      "--expected-revision",
      "1",
      "--yes",
    ]);
    expect(stale.stderr).toEqual(["MEMORY_REVISION_CONFLICT: Memory changed before this operation could commit."]);

    const rejected = await runCli([
      "memory",
      "--store",
      store,
      "confirm-capture",
      "Rejected draft.",
      "--decision",
      "reject",
      "--kind",
      "note",
      "--reason",
      "The user rejected the draft.",
    ]);
    expect(rejected.stdout).toEqual([
      [
        "Decision: reject",
        "Status: skipped",
        "Memory writes: no",
        "Requires confirmation: no",
        "Reason: The user rejected the draft.",
      ].join("\n"),
    ]);

    const clarify = await runCli([
      "memory",
      "--store",
      store,
      "confirm-capture",
      "Ambiguous draft.",
      "--decision",
      "clarify",
      "--kind",
      "note",
      "--reason",
      "The user asked for clarification.",
      "--json",
    ]);
    expect(JSON.parse(clarify.stdout[0] ?? "{}")).toMatchObject({
      decision: "clarify",
      status: "needs_clarification",
      memory_writes: false,
      memory: null,
    });
  });

  it("rejects unsafe or malformed capture suggestions", async () => {
    const store = createStorePath();

    const secret = await runCli([
      "memory",
      "--store",
      store,
      "suggest-capture",
      "github token is ghp_123456789012345678901234567890123456",
      "--kind",
      "note",
      "--reason",
      "A sensitive value was inferred.",
    ]);
    expect(secret.stderr).toEqual(["MEMORY_SECRET_DETECTED: Memory content looks sensitive."]);

    const emptyReason = await runCli([
      "memory",
      "--store",
      store,
      "suggest-capture",
      "The user prefers concise final answers.",
      "--kind",
      "preference",
      "--reason",
      "   ",
    ]);
    expect(emptyReason.stderr).toEqual(["MEMORY_REASON_EMPTY: Memory reason cannot be empty."]);
  });

  it("initializes project memory idempotently and protects it from Git", async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "nuzo-project-"));
    tempDirectories.push(projectRoot);
    writeFileSync(join(projectRoot, ".gitignore"), "node_modules/\n", "utf8");
    const previousCwd = process.cwd();
    process.chdir(projectRoot);
    try {
      const first = await runCli(["memory", "init", "--project"]);
      const configPath = join(projectRoot, ".nuzo", "config.json");
      const storePath = join(projectRoot, ".nuzo", "memory", "memories.sqlite");
      expect(first.stdout.join("\n")).toContain(`Store: ${storePath}`);
      expect(first.stdout.join("\n")).toMatch(/Scope: project:[a-f0-9]{16}/);
      expect(existsSync(configPath)).toBe(true);
      expect(existsSync(storePath)).toBe(true);
      const projectConfig = JSON.parse(readFileSync(configPath, "utf8")) as Record<string, unknown>;
      expect(projectConfig).toMatchObject({
        storage: {
          path: ".nuzo/memory/memories.sqlite",
        },
      });
      expect(projectConfig).not.toHaveProperty("authorization");

      const remembered = await runCli([
        "memory",
        "remember",
        "The project config resolves local memory automatically.",
        "--kind",
        "project_decision",
      ]);
      const id = remembered.stdout[0] ?? "";
      expect(id).toMatch(/^mem_/);
      const listed = await runCli(["memory", "list"]);
      expect(listed.stdout.join("\n")).toContain(id);

      const originalConfig = readFileSync(configPath, "utf8");
      const second = await runCli(["memory", "init", "--project"]);
      expect(second.stderr).toEqual([]);
      expect(readFileSync(configPath, "utf8")).toBe(originalConfig);
      expect(readFileSync(join(projectRoot, ".gitignore"), "utf8")).toBe(
        [
          "node_modules/",
          ".nuzo/memory/",
          ".nuzo/**/*.sqlite",
          ".nuzo/**/*.sqlite-*",
          "",
        ].join("\n"),
      );
    } finally {
      process.chdir(previousCwd);
    }
  });

  it("refuses project initialization through managed symlinks", async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "nuzo-project-init-symlink-"));
    const outside = mkdtempSync(join(tmpdir(), "nuzo-project-init-outside-"));
    tempDirectories.push(projectRoot, outside);
    writeFileSync(join(outside, "sentinel"), "unchanged", "utf8");
    symlinkSync(outside, join(projectRoot, ".nuzo"), "dir");

    const previousCwd = process.cwd();
    process.chdir(projectRoot);
    try {
      const output = await runCli(["memory", "init", "--project"]);
      expect(output.stderr).toEqual([
        "MEMORY_INIT_PATH_UNSAFE: Project init refuses symbolic links in managed paths.",
      ]);
      expect(readFileSync(join(outside, "sentinel"), "utf8")).toBe("unchanged");
      expect(existsSync(join(outside, "config.json"))).toBe(false);
    } finally {
      process.chdir(previousCwd);
    }
  });

  it("refuses a symlinked project gitignore without changing its target", async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "nuzo-gitignore-symlink-"));
    const outside = mkdtempSync(join(tmpdir(), "nuzo-gitignore-outside-"));
    tempDirectories.push(projectRoot, outside);
    const target = join(outside, "target");
    writeFileSync(target, "sentinel\n", "utf8");
    symlinkSync(target, join(projectRoot, ".gitignore"));

    const previousCwd = process.cwd();
    process.chdir(projectRoot);
    try {
      const output = await runCli(["memory", "init", "--project"]);
      expect(output.stderr[0]).toContain("MEMORY_INIT_PATH_UNSAFE");
      expect(readFileSync(target, "utf8")).toBe("sentinel\n");
      expect(existsSync(join(projectRoot, ".nuzo"))).toBe(false);
    } finally {
      process.chdir(previousCwd);
    }
  });

  it("resolves project:auto instead of storing a shared literal scope", async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "nuzo-project-auto-"));
    tempDirectories.push(projectRoot);
    const store = createStorePath();
    const previousCwd = process.cwd();
    process.chdir(projectRoot);
    try {
      const remembered = await runCli([
        "memory",
        "--store",
        store,
        "--scope",
        "project:auto",
        "remember",
        "Use the resolved project scope.",
        "--kind",
        "instruction",
      ]);
      const history = await runCli([
        "memory",
        "--store",
        store,
        "history",
        remembered.stdout[0] ?? "",
      ]);

      expect(history.stdout.join("\n")).toMatch(/"scope":"project:[a-f0-9]{16}"/);
      expect(history.stdout.join("\n")).not.toContain("project:auto");
    } finally {
      process.chdir(previousCwd);
    }
  });

  it("rejects project init with a custom store", async () => {
    const store = createStorePath();

    const output = await runCli(["memory", "--store", store, "init", "--project"]);

    expect(output.stderr).toEqual([
      "MEMORY_INIT_STORE_CONFLICT: Project init cannot be combined with a custom --store path.",
    ]);
  });

  it("rejects project config storage outside the local .nuzo memory path", async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "nuzo-project-config-"));
    tempDirectories.push(projectRoot);
    const outsideStore = createStorePath();
    mkdirSync(join(projectRoot, ".nuzo"), { recursive: true });
    writeFileSync(
      join(projectRoot, ".nuzo", "config.json"),
      JSON.stringify({
        version: 1,
        default_scope: "project:test",
        storage: {
          driver: "sqlite",
          path: outsideStore,
        },
      }),
      "utf8",
    );

    const previousCwd = process.cwd();
    process.chdir(projectRoot);
    try {
      const output = await runCli(["memory", "remember", "Do not write outside.", "--kind", "note"]);
      expect(output.stderr).toEqual([
        "MEMORY_CONFIG_INVALID: Nuzo config has an unsupported shape.",
      ]);
      expect(existsSync(outsideStore)).toBe(false);
    } finally {
      process.chdir(previousCwd);
    }
  });

  it("uses project config over user config and lets flags override recall", async () => {
    await runCli(["memory", "--scope", "user:custom", "init"]);
    const projectRoot = mkdtempSync(join(tmpdir(), "nuzo-project-precedence-"));
    tempDirectories.push(projectRoot);
    const previousCwd = process.cwd();
    process.chdir(projectRoot);
    try {
      await runCli(["memory", "init", "--project"]);
      writeFileSync(join(testHome, ".nuzo", "config.json"), "{invalid", "utf8");
      const projectMemory = await runCli([
        "memory",
        "remember",
        "Shared precedence memory in the project scope.",
        "--kind",
        "project_decision",
      ]);
      await runCli([
        "memory",
        "--scope",
        "user:default",
        "remember",
        "Shared precedence memory in the global scope.",
        "--kind",
        "note",
      ]);

      const configured = await runCli(["memory", "recall", "shared precedence memory"]);
      expect(configured.stdout).toHaveLength(2);
      const projectOnly = await runCli([
        "memory",
        "recall",
        "shared precedence memory",
        "--no-include-global",
      ]);
      expect(projectOnly.stdout).toHaveLength(1);
      expect(projectOnly.stdout[0]).toContain(projectMemory.stdout[0]);
      const explicitScope = await runCli([
        "memory",
        "--scope",
        "user:default",
        "list",
      ]);
      expect(explicitScope.stdout).toHaveLength(1);
      expect(explicitScope.stdout[0]).toContain("global scope");
    } finally {
      process.chdir(previousCwd);
    }
  });

  it("rejects a project memory database symlink that escapes .nuzo", async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "nuzo-project-symlink-"));
    tempDirectories.push(projectRoot);
    const outsideStore = createStorePath();
    writeFileSync(outsideStore, "sentinel", "utf8");
    mkdirSync(join(projectRoot, ".nuzo", "memory"), { recursive: true });
    writeFileSync(
      join(projectRoot, ".nuzo", "config.json"),
      JSON.stringify({
        version: 1,
        default_scope: "project:test",
        storage: {
          driver: "sqlite",
          path: ".nuzo/memory/memories.sqlite",
        },
      }),
      "utf8",
    );
    symlinkSync(outsideStore, join(projectRoot, ".nuzo", "memory", "memories.sqlite"));

    const previousCwd = process.cwd();
    process.chdir(projectRoot);
    try {
      const output = await runCli(["memory", "list"]);
      expect(output.stderr).toEqual([
        "MEMORY_CONFIG_INVALID: Project Nuzo config must keep storage inside the project .nuzo directory.",
      ]);
      expect(readFileSync(outsideStore, "utf8")).toBe("sentinel");
    } finally {
      process.chdir(previousCwd);
    }
  });

  it("rejects conflicting forget modes", async () => {
    const store = createStorePath();

    const output = await runCli(["memory", "--store", store, "forget", "mem_missing", "--archive", "--delete"]);

    expect(output.stderr).toEqual([
      "MEMORY_FORGET_MODE_CONFLICT: Choose either --archive or --delete, not both.",
    ]);
  });

  it("previews and applies bulk forget by tag", async () => {
    const store = createStorePath();
    const remembered = await runCli([
      "memory",
      "--store",
      store,
      "remember",
      "Archive this CLI bulk memory.",
      "--kind",
      "note",
      "--tag",
      "obsolete",
    ]);
    const id = remembered.stdout[0] ?? "";

    const preview = await runCli([
      "memory",
      "--store",
      store,
      "forget-many",
      "--tag",
      "obsolete",
    ]);
    expect(preview.stdout).toEqual([
      "Preview\tmatched=1\taffected=0\tmode=archive",
      id,
    ]);
    await expect(runCli(["memory", "--store", store, "list"])).resolves.toMatchObject({
      stdout: [expect.stringContaining(id)],
    });

    const applied = await runCli([
      "memory",
      "--store",
      store,
      "forget-many",
      "--tag",
      "obsolete",
      "--apply",
    ]);
    expect(applied.stdout).toEqual([
      "Applied\tmatched=1\taffected=1\tmode=archive",
      id,
    ]);
    await expect(runCli(["memory", "--store", store, "list"])).resolves.toEqual({
      stderr: [],
      stdout: [],
    });
  });

  it("exports, dry-runs import, and imports memories", async () => {
    const sourceStore = createStorePath();
    const targetStore = createStorePath();
    const exportPath = join(mkdtempSync(join(tmpdir(), "nuzo-export-")), "memories.memory.export.json");
    const exportDirectory = join(exportPath, "..");
    const markdownExportPath = join(exportDirectory, "memories.memory.export.md");
    tempDirectories.push(exportDirectory);

    const remembered = await runCli([
      "memory",
      "--store",
      sourceStore,
      "remember",
      "The user prefers portable memory exports.",
      "--kind",
      "preference",
      "--tag",
      "export",
      "--confidence-state",
      "needs_review",
      "--provenance-json",
      JSON.stringify({
        kind: "cli",
        host: "nuzo",
        surface: "cli",
        action: "remember",
      }),
    ]);
    expect(remembered.stdout[0]).toMatch(/^mem_/);

    const exported = await runCli(["memory", "--store", sourceStore, "export", "--path", exportPath]);
    expect(exported.stdout[0]).toContain("Exported 1 memories");

    const document = JSON.parse(readFileSync(exportPath, "utf8")) as {
      format: string;
      memories: Array<{ confidence_state?: unknown; provenance?: unknown }>;
    };
    expect(document.format).toBe("nuzo-memory-export");
    expect(document.memories).toHaveLength(1);
    expect(document.memories[0]?.confidence_state).toBe("needs_review");
    expect(document.memories[0]?.provenance).toEqual({
      kind: "cli",
      host: "nuzo",
      surface: "cli",
      action: "remember",
    });

    const markdownExported = await runCli(["memory", "--store", sourceStore, "export", "--path", markdownExportPath]);
    expect(markdownExported.stdout[0]).toContain("Exported 1 memories");
    const markdown = readFileSync(markdownExportPath, "utf8");
    expect(markdown).toContain("# Nuzo Memory Export");
    expect(markdown).toContain('confidence_state: "needs_review"');
    expect(markdown).toContain('provenance: "{\\"kind\\":\\"cli\\"');
    expect(markdown).toContain("The user prefers portable memory exports.");

    const dryRun = await runCli(["memory", "--store", targetStore, "import", exportPath, "--dry-run"]);
    expect(dryRun.stdout).toEqual(["Would import 1 memories"]);

    const empty = await runCli(["memory", "--store", targetStore, "list"]);
    expect(empty.stdout).toEqual([]);

    const imported = await runCli(["memory", "--store", targetStore, "import", exportPath]);
    expect(imported.stdout).toEqual(["Imported 1 memories"]);

    const duplicate = await runCli(["memory", "--store", targetStore, "import", exportPath]);
    expect(duplicate.stdout).toEqual(["Imported 0 memories, skipped 1"]);

    const recall = await runCli(["memory", "--store", targetStore, "recall", "portable exports"]);
    expect(recall.stdout.join("\n")).toContain("portable memory exports");
  });

  it("does not overwrite an export target through a symbolic link", async () => {
    const store = createStorePath();
    const directory = mkdtempSync(join(tmpdir(), "nuzo-export-symlink-"));
    tempDirectories.push(directory);
    const target = join(directory, "target.json");
    const link = join(directory, "linked.memory.export.json");
    writeFileSync(target, "sentinel\n", "utf8");
    symlinkSync(target, link);

    const output = await runCli(["memory", "--store", store, "export", "--path", link]);

    expect(output.stderr).toEqual([
      "MEMORY_FILE_WRITE_UNSAFE: Nuzo refuses to write through a symbolic link or non-file path.",
    ]);
    expect(readFileSync(target, "utf8")).toBe("sentinel\n");
  });

  it("checks integrity, creates SQLite backups, and restores validated stores", async () => {
    const sourceStore = createStorePath();
    const backupPath = join(mkdtempSync(join(tmpdir(), "nuzo-backup-")), "memories.backup.sqlite");
    const backupDirectory = join(backupPath, "..");
    const restoredStore = join(backupDirectory, "restored.sqlite");
    tempDirectories.push(backupDirectory);

    const remembered = await runCli([
      "memory",
      "--store",
      sourceStore,
      "remember",
      "SQLite backup restore keeps memory and audit data.",
      "--kind",
      "note",
      "--tag",
      "backup",
    ]);
    expect(remembered.stdout[0]).toMatch(/^mem_/);
    await runCli(["memory", "--store", sourceStore, "recall", "backup restore"]);

    const integrity = await runCli(["memory", "--store", sourceStore, "integrity", "--json"]);
    expect(JSON.parse(integrity.stdout[0] ?? "{}")).toMatchObject({
      ok: true,
      schema_version: 7,
      memory_count: 1,
      fts_row_count: 1,
      errors: [],
    });

    const backedUp = await runCli(["memory", "--store", sourceStore, "backup", "--path", backupPath, "--json"]);
    expect(JSON.parse(backedUp.stdout[0] ?? "{}")).toMatchObject({
      backup_path: backupPath,
      integrity: {
        ok: true,
        memory_count: 1,
      },
    });
    expect(existsSync(backupPath)).toBe(true);
    expect(statSync(backupPath).mode & 0o777).toBe(0o600);

    await runCli(["memory", "--store", restoredStore, "init"]);
    const blockedRestore = await runCli(["memory", "--store", restoredStore, "restore", backupPath]);
    expect(blockedRestore.stderr).toEqual([
      "MEMORY_RESTORE_CONFIRMATION_REQUIRED: Restore would replace an existing store. Re-run with --yes to confirm.",
    ]);

    const restored = await runCli(["memory", "--store", restoredStore, "restore", backupPath, "--yes", "--json"]);
    expect(JSON.parse(restored.stdout[0] ?? "{}")).toMatchObject({
      backup_path: backupPath,
      target_path: restoredStore,
      integrity: {
        ok: true,
        memory_count: 1,
      },
    });

    const recall = await runCli(["memory", "--store", restoredStore, "recall", "backup restore"]);
    expect(recall.stdout.join("\n")).toContain("keeps memory and audit data");
    const history = await runCli(["memory", "--store", restoredStore, "history", remembered.stdout[0] ?? ""]);
    expect(history.stdout.some((line) => line.includes("memory.created"))).toBe(true);
  });

  it("previews FTS drift read-only and repairs it only after explicit confirmation", async () => {
    const store = createStorePath();
    const backupDirectory = mkdtempSync(join(tmpdir(), "nuzo-fts-repair-"));
    const backupPath = join(backupDirectory, "recovery.sqlite");
    tempDirectories.push(backupDirectory);
    const sentinel = "FTS repair restores this unique searchable phrase.";
    await runCli([
      "memory", "--store", store, "remember", sentinel,
      "--kind", "note", "--tag", "repair",
    ]);
    const raw = new SQLiteMemoryDatabase({ path: store });
    raw.database.prepare("DELETE FROM memories_fts").run();
    raw.close();

    const preview = await runCli([
      "memory", "--store", store, "integrity", "repair-fts", "--json",
    ]);
    const previewOutput = JSON.parse(preview.stdout[0] ?? "{}") as Record<string, unknown>;
    expect(previewOutput).toMatchObject({
      mode: "preview",
      status: "repair_required",
      source_path: store,
      repair_required: true,
      repairable: true,
      applied: false,
      backup_path: null,
      reindexed_rows: 0,
      before: { canonical_ok: true, fts_ok: false, missing_fts_rows: 1 },
      backup: null,
      after: null,
    });
    expect(JSON.stringify(previewOutput)).not.toContain(sentinel);
    expect(inspectFtsCount(store)).toBe(0);

    const explicitDryRun = await runCli([
      "memory", "--store", store, "integrity", "repair-fts", "--dry-run", "--json",
    ]);
    expect(JSON.parse(explicitDryRun.stdout[0] ?? "{}")).toMatchObject({
      mode: "preview",
      applied: false,
      before: { missing_fts_rows: 1 },
    });
    expect(inspectFtsCount(store)).toBe(0);

    const unconfirmed = await runCli([
      "memory", "--store", store, "integrity", "repair-fts", "--apply",
    ]);
    expect(unconfirmed.stderr).toEqual([
      "MEMORY_FTS_REPAIR_CONFIRMATION_REQUIRED: FTS repair requires explicit confirmation.",
    ]);
    expect(existsSync(backupPath)).toBe(false);
    expect(inspectFtsCount(store)).toBe(0);

    const repaired = await runCli([
      "memory", "--store", store, "integrity", "repair-fts",
      "--apply", "--yes", "--backup-path", backupPath, "--json",
    ]);
    const repairedOutput = JSON.parse(repaired.stdout[0] ?? "{}") as Record<string, unknown>;
    expect(repairedOutput).toMatchObject({
      mode: "apply",
      status: "repaired",
      source_path: store,
      repair_required: true,
      repairable: true,
      applied: true,
      backup_path: backupPath,
      reindexed_rows: 1,
      before: { missing_fts_rows: 1 },
      backup: { ok: true, fts_ok: true, missing_fts_rows: 0 },
      after: { ok: true, fts_ok: true, missing_fts_rows: 0 },
    });
    expect(JSON.stringify(repairedOutput)).not.toContain(sentinel);
    expect(existsSync(backupPath)).toBe(true);
    expect(statSync(backupPath).mode & 0o777).toBe(0o600);

    const recalled = await runCli(["memory", "--store", store, "recall", "unique searchable phrase"]);
    expect(recalled.stdout.join("\n")).toContain(sentinel);

    const noOpBackup = `${store}.fts-repair.backup.sqlite`;
    const noOp = await runCli([
      "memory", "--store", store, "integrity", "repair-fts", "--apply", "--yes", "--json",
    ]);
    expect(JSON.parse(noOp.stdout[0] ?? "{}")).toMatchObject({
      status: "not_needed",
      applied: false,
      backup_path: null,
      reindexed_rows: 0,
    });
    expect(existsSync(noOpBackup)).toBe(false);
  });

  it("reports and exposes legacy literal project:auto memories for scope review", async () => {
    const store = createStorePath();
    const exportDirectory = mkdtempSync(join(tmpdir(), "nuzo-legacy-auto-"));
    const exportPath = join(exportDirectory, "legacy.memory.export.json");
    tempDirectories.push(exportDirectory);
    writeFileSync(exportPath, JSON.stringify({
      format: "nuzo-memory-export",
      version: 1,
      exported_at: "2026-06-27T00:00:00.000Z",
      memories: [
        {
          scope: "project:auto",
          kind: "instruction",
          content: "Review this legacy project scope.",
          tags: ["workflow"],
          source: "test:legacy",
          confidence: 1,
          created_at: "2026-06-27T00:00:00.000Z",
          updated_at: "2026-06-27T00:00:00.000Z",
          last_used_at: null,
          archived_at: null,
        },
      ],
    }), "utf8");

    await runCli(["memory", "--store", store, "import", exportPath]);
    const listed = await runCli(["memory", "--store", store, "list", "--all-scopes"]);
    const doctor = await runCli(["memory", "--store", store, "doctor"], {
      NUZO_DOCTOR_SKIP_GIT: "1",
    });

    expect(listed.stdout.join("\n")).toContain("scope=project:auto");
    expect(doctor.stdout.join("\n")).toContain(
      "Warning: 1 active legacy project:auto memory(s) require scope review",
    );
  });

  it("reports malformed import documents without leaking runtime errors", async () => {
    const store = createStorePath();
    const exportPath = join(mkdtempSync(join(tmpdir(), "nuzo-bad-export-")), "bad.memory.export.json");
    const exportDirectory = join(exportPath, "..");
    tempDirectories.push(exportDirectory);
    writeFileSync(exportPath, JSON.stringify({
      format: "nuzo-memory-export",
      version: 1,
      exported_at: "2026-06-12T00:00:00.000Z",
      memories: [
        {
          scope: "user:default",
          kind: "note",
          content: "Malformed import item.",
          tags: ["valid"],
          source: "test",
          confidence: "high",
          created_at: "2026-06-12T00:00:00.000Z",
          updated_at: "2026-06-12T00:00:00.000Z",
          last_used_at: null,
          archived_at: null,
        },
      ],
    }), "utf8");

    const output = await runCli(["memory", "--store", store, "import", exportPath]);

    expect(output.stderr).toEqual(["MEMORY_EXPORT_INVALID: Memory export document is invalid."]);
  });

  it("reports missing import files as operational errors", async () => {
    const store = createStorePath();
    const output = await runCli([
      "memory",
      "--store",
      store,
      "import",
      join(store, "..", "missing.memory.export.json"),
    ]);

    expect(output.stderr).toEqual([
      "MEMORY_EXPORT_READ_FAILED: Memory export file could not be read.",
    ]);
  });

  it("does not follow symlinks when importing a bounded JSON export", async () => {
    const store = createStorePath();
    const directory = mkdtempSync(join(tmpdir(), "nuzo-symlink-export-"));
    tempDirectories.push(directory);
    const target = join(directory, "target.json");
    const link = join(directory, "linked.memory.export.json");
    writeFileSync(target, "{}\n", "utf8");
    symlinkSync(target, link);

    const output = await runCli(["memory", "--store", store, "import", link]);

    expect(output.stderr).toEqual([
      "MEMORY_EXPORT_READ_FAILED: Memory export file could not be read.",
    ]);
  });

  it("reports doctor information", async () => {
    const store = createStorePath();

    const output = await runCli(["memory", "--store", store, "doctor"]);
    const text = output.stdout.join("\n");

    expect(text).toContain(`Store: ${store}`);
    expect(text).toContain("Store exists: no");
    expect(text).toContain("Store directory exists: yes");
    expect(text).toContain("Authorization: administrator (local CLI)");
    expect(text).toContain("Config source:");
    expect(text).toContain("Store source: option");
    expect(text).toContain("Git tracking:");
    expect(text).toContain("Network: disabled");
    expect(text).toContain("Integrity: missing");
    expect(text).toContain("Status: warning");
  });

  it("reports redacted privacy posture without exposing local paths", async () => {
    const store = createStorePath();
    await runCli(["memory", "--store", store, "init"]);

    const output = await runCli(["memory", "--store", store, "doctor", "--privacy"], {
      NUZO_DOCTOR_SKIP_GIT: "1",
    });
    const text = output.stdout.join("\n");

    expect(text).toContain("Nuzo privacy report (read-only)");
    expect(text).toContain("Storage: initialized");
    expect(text).toContain("Network: disabled");
    expect(text).toContain("Recall event recording: disabled");
    expect(text).toContain("Semantic index: not present");
    expect(text).toContain("Secret scan: not requested");
    expect(text).toContain("Status: ok");
    expect(text).not.toContain(store);
    expect(text).not.toContain(testHome);
  });

  it("returns stable privacy JSON with bounded findings", async () => {
    await runCli(["memory", "init"]);
    const configPath = join(testHome, ".nuzo", "config.json");
    const config = JSON.parse(readFileSync(configPath, "utf8")) as {
      privacy: { record_recall_events: boolean };
    };
    config.privacy.record_recall_events = true;
    writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

    const store = createStorePath();
    await runCli(["memory", "--store", store, "init"]);
    const semanticPath = semanticIndexPathFor(store);
    writeFileSync(semanticPath, "derived test sidecar", { encoding: "utf8", mode: 0o600 });

    const output = await runCli(["memory", "--store", store, "doctor", "--privacy", "--json"], {
      NUZO_DOCTOR_SKIP_GIT: "1",
    });
    const serialized = output.stdout[0] ?? "";
    const report = JSON.parse(serialized) as {
      findings: Array<{ code: string; count: number; guidance: string }>;
    };

    expect(report).toMatchObject({
      profile: "privacy",
      read_only: true,
      storage: {
        initialized: true,
        store_source: "option",
        authorization_mode: "administrator",
      },
      network: { enabled: false },
      recall_audit: { enabled: true },
      git: { status: "skipped", tracked_memory_files: 0 },
      semantics: { index_present: true },
      secret_scan: { status: "not_requested", scanned_records: 0, flagged_records: 0 },
      status: "warning",
    });
    expect(report.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "recall_audit_enabled", count: 1 }),
      expect.objectContaining({ code: "semantic_index_present", count: 1 }),
    ]));
    expect(serialized).not.toContain(store);
    expect(serialized).not.toContain(testHome);
  });

  it("skips Git tracking when requested by restricted environments", async () => {
    const store = createStorePath();
    await runCli(["memory", "--store", store, "init"]);

    const output = await runCli(["memory", "--store", store, "doctor"], {
      NUZO_DOCTOR_SKIP_GIT: "1",
    });
    const text = output.stdout.join("\n");

    expect(text).toContain("Store exists: yes");
    expect(text).toContain("Integrity: ok");
    expect(text).toContain("Git tracking: skipped (NUZO_DOCTOR_SKIP_GIT=1)");
    expect(text).not.toContain("Warning: Git tracking check unavailable");
    expect(text).toContain("Status: ok");

    const json = await runCli(["memory", "--store", store, "doctor", "--json"], {
      NUZO_DOCTOR_SKIP_GIT: "1",
    });
    expect(JSON.parse(json.stdout[0] ?? "{}")).toMatchObject({
      store_path: store,
      store_exists: true,
      integrity: {
        ok: true,
        schema_version: 7,
      },
      git_tracking: {
        status: "skipped",
      },
      authorization: {
        mode: "administrator",
        source: "local_cli",
      },
      config: {
        store_source: "option",
      },
      warnings: [],
      status: "ok",
    });
  });

  it("still warns about missing stores when Git tracking is skipped", async () => {
    const store = createStorePath();

    const output = await runCli(["memory", "--store", store, "doctor"], {
      NUZO_DOCTOR_SKIP_GIT: "1",
    });
    const text = output.stdout.join("\n");

    expect(text).toContain("Store exists: no");
    expect(text).toContain("Integrity: missing");
    expect(text).toContain("Git tracking: skipped (NUZO_DOCTOR_SKIP_GIT=1)");
    expect(text).toContain("Warning: memory store has not been initialized");
    expect(text).toContain("Status: warning");
  });

  it.skipIf(process.platform === "win32")("reports unsafe runtime permissions without changing them", async () => {
    const store = createStorePath();
    await runCli(["memory", "--store", store, "init"]);
    chmodSync(store, 0o644);

    const output = await runCli(["memory", "--store", store, "doctor", "--json"], {
      NUZO_DOCTOR_SKIP_GIT: "1",
    });
    const report = JSON.parse(output.stdout[0] ?? "{}") as {
      file_safety: { unsafe: Array<{ path: string; reason: string; actual_mode: number }> };
      warnings: string[];
    };

    expect(report.file_safety.unsafe).toContainEqual(expect.objectContaining({
      path: store,
      reason: "permissions",
      actual_mode: 0o644,
    }));
    expect(report.warnings.some((warning) => warning.includes("runtime path permission, ownership, or symlink finding(s)"))).toBe(true);
    expect(statSync(store).mode & 0o777).toBe(0o644);
  });

  it("scans active records only after explicit opt-in without exposing content", async () => {
    const store = createStorePath();
    const database = new SQLiteMemoryDatabase({ path: store });
    const secretContent = "Accidentally retained token ghp_abcdefghijklmnopqrstuvwxyz123456";
    const now = new Date("2026-06-30T00:00:00.000Z");
    await database.create({
      id: "mem_secret_diagnostic",
      revision: 1,
      scope: "user:default",
      kind: "note",
      content: secretContent,
      tags: [],
      source: "test:doctor",
      confidence: 1,
      confidenceState: "user_confirmed",
      provenance: null,
      reviewAfter: null,
      expiresAt: null,
      createdAt: now,
      updatedAt: now,
      lastUsedAt: null,
      archivedAt: null,
    });
    database.close();

    const defaultReport = await runCli(["memory", "--store", store, "doctor", "--json"], {
      NUZO_DOCTOR_SKIP_GIT: "1",
    });
    expect(JSON.parse(defaultReport.stdout[0] ?? "{}").secret_scan).toMatchObject({
      status: "not_requested",
      scanned_records: 0,
    });

    const scanned = await runCli(["memory", "--store", store, "doctor", "--scan-secrets", "--json"], {
      NUZO_DOCTOR_SKIP_GIT: "1",
    });
    const serialized = scanned.stdout[0] ?? "";
    expect(serialized).not.toContain(secretContent);
    expect(JSON.parse(serialized).secret_scan).toEqual({
      status: "completed",
      scanned_records: 1,
      flagged_records: 1,
      findings_by_kind: { github_token: 1 },
    });

    const privacy = await runCli([
      "memory", "--store", store, "doctor", "--privacy", "--scan-secrets", "--json",
    ], {
      NUZO_DOCTOR_SKIP_GIT: "1",
    });
    const privacySerialized = privacy.stdout[0] ?? "";
    expect(privacySerialized).not.toContain(secretContent);
    expect(privacySerialized).not.toContain(store);
    expect(JSON.parse(privacySerialized)).toMatchObject({
      secret_scan: {
        status: "completed",
        scanned_records: 1,
        flagged_records: 1,
        findings_by_kind: { github_token: 1 },
      },
      findings: [expect.objectContaining({ code: "secret_patterns_detected", count: 1 })],
      status: "warning",
    });
  });
});
