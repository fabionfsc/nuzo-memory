import { describe, expect, it, vi } from "vitest";
import type { MemoryRecord, MemoryService } from "@nuzo/memory-core";
import { projectScopeFromPath } from "@nuzo/memory-core";
import {
  createHostHookOutput,
  hostHookLimits,
  parseHostHookInput,
} from "../host-hook.js";
import { runHostHookProcess } from "../host-hook-cli.js";

function memory(overrides: Partial<MemoryRecord> = {}): MemoryRecord {
  return {
    id: "mem_000001",
    revision: 1,
    scope: "user:default",
    kind: "instruction",
    content: "For Cloudflare work on this host, use /opt/docker/cloudflare.",
    tags: ["cloudflare", "docker", "workflow"],
    source: "codex:mcp",
    confidence: 1,
    createdAt: new Date("2026-06-27T00:00:00.000Z"),
    updatedAt: new Date("2026-06-27T00:00:00.000Z"),
    lastUsedAt: null,
    archivedAt: null,
    ...overrides,
  };
}

describe("host recall hooks", () => {
  it("loads only bounded autoload memories at session start", async () => {
    const projectScope = projectScopeFromPath("/opt/codex/nuzo");
    const global = memory({ tags: ["autoload", "preference"] });
    const project = memory({
      id: "mem_000002",
      scope: projectScope,
      content: "Run strict documentation validation before merging.",
      tags: ["autoload", "docs"],
    });
    const list = vi.fn(async (input: { scope?: string }) =>
      input.scope === "user:default" ? [global] : [project]);
    const service = { list } as unknown as MemoryService;

    const output = await createHostHookOutput(service, {
      hook_event_name: "SessionStart",
      cwd: "/opt/codex/nuzo",
      source: "startup",
    });

    expect(list).toHaveBeenCalledTimes(2);
    expect(list).toHaveBeenCalledWith({
      scope: projectScope,
      tags: ["autoload"],
      includeArchived: false,
    });
    expect(output?.hookSpecificOutput.additionalContext).toContain(global.content);
    expect(output?.hookSpecificOutput.additionalContext).toContain(project.content);
    expect(output?.hookSpecificOutput.additionalContext).toContain("No memory was written.");
  });

  it("uses prompt text and the current project for contextual recall", async () => {
    const recalled = memory();
    const recall = vi.fn(async () => [{
      memory: recalled,
      score: 1,
      reason: "Matched FTS query: cloudflare",
    }]);
    const service = { recall } as unknown as MemoryService;

    const output = await createHostHookOutput(service, {
      hook_event_name: "UserPromptSubmit",
      cwd: "/opt/codex/nuzo",
      prompt: "Handle this Cloudflare demand.",
    });

    expect(recall).toHaveBeenCalledWith({
      query: "Handle this Cloudflare demand.",
      scope: projectScopeFromPath("/opt/codex/nuzo"),
      limit: hostHookLimits.contextualCandidates,
      includeGlobal: true,
      recordUsage: false,
    });
    expect(output).toEqual({
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: expect.stringContaining("/opt/docker/cloudflare"),
      },
    });
  });

  it("does not repeat session autoload memories during contextual recall", async () => {
    const autoload = memory({ tags: ["autoload", "workflow"] });
    const contextual = memory({
      id: "mem_000002",
      content: "Use the contextual release workflow.",
      tags: ["release", "workflow"],
    });
    const recall = vi.fn(async () => [autoload, contextual].map((item) => ({
      memory: item,
      score: 1,
      reason: "test",
    })));
    const service = { recall } as unknown as MemoryService;

    const output = await createHostHookOutput(service, {
      hook_event_name: "UserPromptSubmit",
      cwd: "/opt/codex/nuzo",
      prompt: "Which release workflow applies?",
    });

    expect(output?.hookSpecificOutput.additionalContext).not.toContain(autoload.content);
    expect(output?.hookSpecificOutput.additionalContext).toContain(contextual.content);
  });

  it("returns no context for an empty contextual result", async () => {
    const service = { recall: vi.fn(async () => []) } as unknown as MemoryService;

    await expect(createHostHookOutput(service, {
      hook_event_name: "UserPromptSubmit",
      cwd: "/tmp/project",
      prompt: "unrelated task",
    })).resolves.toBeNull();
  });

  it("bounds injected context", async () => {
    const memories = Array.from({ length: 10 }, (_, index) => memory({
      id: `mem_${index}`,
      content: "x".repeat(8_000),
    }));
    const service = {
      recall: vi.fn(async () => memories.map((item) => ({ memory: item, score: 1, reason: "test" }))),
    } as unknown as MemoryService;

    const output = await createHostHookOutput(service, {
      hook_event_name: "UserPromptSubmit",
      cwd: "/tmp/project",
      prompt: "x",
    });

    expect(output!.hookSpecificOutput.additionalContext.length)
      .toBeLessThanOrEqual(hostHookLimits.contextCharacters);
  });

  it("validates supported hook input", () => {
    expect(parseHostHookInput({
      hook_event_name: "UserPromptSubmit",
      cwd: "/tmp/project",
      prompt: "cloudflare",
    })).toMatchObject({ prompt: "cloudflare" });
    expect(() => parseHostHookInput({ hook_event_name: "Stop", cwd: "/tmp/project" }))
      .toThrow("Unsupported hook event");
  });

  it("fails open when hook input is invalid", async () => {
    const stdout = vi.fn();
    const stderr = vi.fn();

    const exitCode = await runHostHookProcess([], "not json", { stdout, stderr }, {
      NUZO_MEMORY_STORE: "/tmp/missing-nuzo-hook-store.sqlite",
    });

    expect(exitCode).toBe(0);
    expect(stdout).not.toHaveBeenCalled();
  });
});
