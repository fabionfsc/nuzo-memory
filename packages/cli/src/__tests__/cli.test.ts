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
  it("applies user config scope, recall defaults, and privacy settings", async () => {
    const init = await runCli(["memory", "--scope", "user:custom", "init"]);
    expect(init.stdout.join("\n")).toContain("Scope: user:custom");
    const configPath = join(testHome, ".nuzo", "config.json");
    const config = JSON.parse(readFileSync(configPath, "utf8")) as {
      recall: { include_global: boolean; limit: number };
      privacy: { allow_network: boolean; record_recall_events: boolean };
    };
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
      expect(JSON.parse(readFileSync(configPath, "utf8"))).toMatchObject({
        storage: {
          path: ".nuzo/memory/memories.sqlite",
        },
      });

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

    const markdownExported = await runCli(["memory", "--store", sourceStore, "export", "--path", markdownExportPath]);
    expect(markdownExported.stdout[0]).toContain("Exported 1 memories");
    const markdown = readFileSync(markdownExportPath, "utf8");
    expect(markdown).toContain("# Nuzo Memory Export");
    expect(markdown).toContain("The user prefers portable memory backups.");

    const dryRun = await runCli(["memory", "--store", targetStore, "import", exportPath, "--dry-run"]);
    expect(dryRun.stdout).toEqual(["Would import 1 memories"]);

    const empty = await runCli(["memory", "--store", targetStore, "list"]);
    expect(empty.stdout).toEqual([]);

    const imported = await runCli(["memory", "--store", targetStore, "import", exportPath]);
    expect(imported.stdout).toEqual(["Imported 1 memories"]);

    const duplicate = await runCli(["memory", "--store", targetStore, "import", exportPath]);
    expect(duplicate.stdout).toEqual(["Imported 0 memories, skipped 1"]);

    const recall = await runCli(["memory", "--store", targetStore, "recall", "portable backups"]);
    expect(recall.stdout.join("\n")).toContain("portable memory backups");
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

  it("skips Git tracking when requested by restricted environments", async () => {
    const store = createStorePath();
    await runCli(["memory", "--store", store, "init"]);

    const output = await runCli(["memory", "--store", store, "doctor"], {
      NUZO_DOCTOR_SKIP_GIT: "1",
    });
    const text = output.stdout.join("\n");

    expect(text).toContain("Store exists: yes");
    expect(text).toContain("Git tracking: skipped (NUZO_DOCTOR_SKIP_GIT=1)");
    expect(text).not.toContain("Warning: Git tracking check unavailable");
    expect(text).toContain("Status: ok");
  });

  it("still warns about missing stores when Git tracking is skipped", async () => {
    const store = createStorePath();

    const output = await runCli(["memory", "--store", store, "doctor"], {
      NUZO_DOCTOR_SKIP_GIT: "1",
    });
    const text = output.stdout.join("\n");

    expect(text).toContain("Store exists: no");
    expect(text).toContain("Git tracking: skipped (NUZO_DOCTOR_SKIP_GIT=1)");
    expect(text).toContain("Warning: memory store has not been initialized");
    expect(text).toContain("Status: warning");
  });
});
