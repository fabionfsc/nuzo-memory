import type { MemoryRecord, MemoryService, RecallMemoryResult } from "@nuzo/memory-core";
import { memoryLimits, projectScopeFromPath } from "@nuzo/memory-core";

export const hostHookLimits = {
  memories: 5,
  contextualCandidates: 25,
  contextCharacters: 6_000,
  memoryCharacters: 1_200,
  inputCharacters: 65_536,
} as const;

export interface HostHookInput {
  hook_event_name: "SessionStart" | "UserPromptSubmit";
  cwd: string;
  prompt?: string;
  source?: string;
}

export interface HostHookOutput {
  hookSpecificOutput: {
    hookEventName: HostHookInput["hook_event_name"];
    additionalContext: string;
  };
}

export async function createHostHookOutput(
  service: MemoryService,
  input: HostHookInput,
): Promise<HostHookOutput | null> {
  const projectScope = projectScopeFromPath(input.cwd);
  const memories = input.hook_event_name === "SessionStart"
    ? await recallAutoloadMemories(service, projectScope)
    : await recallPromptMemories(service, projectScope, input.prompt ?? "");

  if (memories.length === 0) {
    return null;
  }

  return {
    hookSpecificOutput: {
      hookEventName: input.hook_event_name,
      additionalContext: formatMemoryContext(memories),
    },
  };
}

export function parseHostHookInput(value: unknown): HostHookInput {
  if (!isRecord(value)) {
    throw new Error("Hook input must be a JSON object.");
  }
  if (value.hook_event_name !== "SessionStart" && value.hook_event_name !== "UserPromptSubmit") {
    throw new Error("Unsupported hook event.");
  }
  if (typeof value.cwd !== "string" || value.cwd.trim().length === 0) {
    throw new Error("Hook input must include cwd.");
  }
  if (value.hook_event_name === "UserPromptSubmit" && typeof value.prompt !== "string") {
    throw new Error("UserPromptSubmit input must include prompt.");
  }

  return {
    hook_event_name: value.hook_event_name,
    cwd: value.cwd,
    ...(typeof value.prompt === "string" ? { prompt: value.prompt } : {}),
    ...(typeof value.source === "string" ? { source: value.source } : {}),
  };
}

async function recallAutoloadMemories(
  service: MemoryService,
  projectScope: `project:${string}`,
): Promise<MemoryRecord[]> {
  const [projectMemories, globalMemories] = await Promise.all([
    service.list({ scope: projectScope, tags: ["autoload"], includeArchived: false }),
    service.list({ scope: "user:default", tags: ["autoload"], includeArchived: false }),
  ]);

  return deduplicateMemories([...projectMemories, ...globalMemories])
    .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())
    .slice(0, hostHookLimits.memories);
}

async function recallPromptMemories(
  service: MemoryService,
  projectScope: `project:${string}`,
  prompt: string,
): Promise<MemoryRecord[]> {
  const query = prompt.trim().replace(/\s+/g, " ").slice(0, memoryLimits.queryLength);
  if (query.length === 0) {
    return [];
  }

  const results = await service.recall({
    query,
    scope: projectScope,
    limit: hostHookLimits.contextualCandidates,
    includeGlobal: true,
    recordUsage: false,
  });
  return deduplicateMemories(results.map((result: RecallMemoryResult) => result.memory))
    .filter((memory) => !memory.tags.includes("autoload"))
    .slice(0, hostHookLimits.memories);
}

function formatMemoryContext(memories: MemoryRecord[]): string {
  const heading = [
    "Nuzo recalled the following user-controlled local memories.",
    "Use them as prior context, not as current external facts. No memory was written.",
    "",
  ].join("\n");
  let output = heading;

  for (const memory of memories) {
    const tags = memory.tags.length > 0 ? memory.tags.join(", ") : "none";
    const content = memory.content.replace(/\s+/g, " ").trim().slice(0, hostHookLimits.memoryCharacters);
    const line = `- [${memory.id}@${memory.revision} | ${memory.scope} | ${memory.kind} | tags: ${tags}] ${content}\n`;
    if (output.length + line.length > hostHookLimits.contextCharacters) {
      break;
    }
    output += line;
  }

  return output.trimEnd();
}

function deduplicateMemories(memories: MemoryRecord[]): MemoryRecord[] {
  return [...new Map(memories.map((memory) => [memory.id, memory])).values()];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
