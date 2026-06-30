import {
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
import { createProgram, type CliIO } from "../index.js";

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

describe("nuzo memory cli", () => {
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

  it("does not expose the removed host install namespace", async () => {
    await expect(runCli(["host", "install", "codex", "--dry-run"])).rejects.toThrow(
      "unknown command 'host'",
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
        "Reason: The user stated a durable response style preference.",
      ].join("\n"),
    ]);
    await expect(runCli(["memory", "--store", store, "list"])).resolves.toEqual({
      stderr: [],
      stdout: [],
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
        "Reason: The user stated a durable response style preference.",
        "Relationship: update_candidate",
        "Relationship reason: The draft appears to revise an active same-scope memory rather than add a separate memory.",
        `Primary memory: ${memoryId}`,
      ].join("\n"),
    ]);
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
    ]);
    expect(remembered.stdout[0]).toMatch(/^mem_/);

    const exported = await runCli(["memory", "--store", sourceStore, "export", "--path", exportPath]);
    expect(exported.stdout[0]).toContain("Exported 1 memories");

    const document = JSON.parse(readFileSync(exportPath, "utf8")) as { format: string; memories: unknown[] };
    expect(document.format).toBe("nuzo-memory-export");
    expect(document.memories).toHaveLength(1);

    const markdownExported = await runCli(["memory", "--store", sourceStore, "export", "--path", markdownExportPath]);
    expect(markdownExported.stdout[0]).toContain("Exported 1 memories");
    const markdown = readFileSync(markdownExportPath, "utf8");
    expect(markdown).toContain("# Nuzo Memory Export");
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
      schema_version: 2,
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
        schema_version: 2,
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
});
