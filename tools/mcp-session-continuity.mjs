import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from "@modelcontextprotocol/sdk/client/stdio.js";

const rememberedMemory = "MCP session continuity smoke stores fake memory across stdio sessions.";
const suggestedMemory = "MCP session continuity smoke prefers confirmed capture drafts.";
const rejectedMemory = "MCP session continuity smoke rejects inferred capture drafts.";
const updatedMemory = "MCP session continuity smoke prefers reviewed capture draft updates.";
const testScope = "project:mcp-session-continuity";
const testTag = "session-continuity";

export async function assertMcpSessionContinuity({
  cwd,
  command,
  args = [],
  memoryStore,
  label = "Nuzo MCP",
  expectedToolNames,
}) {
  let rememberedMemoryId;

  await withMcpSession({ cwd, command, args, memoryStore, label }, async (client) => {
    if (expectedToolNames !== undefined) {
      const tools = await client.listTools();
      const names = tools.tools.map((tool) => tool.name).sort();
      if (JSON.stringify(names) !== JSON.stringify(expectedToolNames)) {
        fail(`${label} tool set mismatch: ${JSON.stringify(names)}`);
      }
    }

    const remembered = parseToolJson(await client.callTool({
      name: "memory.remember",
      arguments: {
        content: rememberedMemory,
        kind: "project_decision",
        scope: testScope,
        tags: [testTag],
        source: "test:mcp-session-a",
      },
    }));
    if (typeof remembered.id !== "string" || !remembered.id.startsWith("mem_")) {
      fail(`${label} session A did not create a memory id: ${JSON.stringify(remembered)}`);
    }
    rememberedMemoryId = remembered.id;
  });

  await withMcpSession({ cwd, command, args, memoryStore, label }, async (client) => {
    const recalled = parseToolJson(await client.callTool({
      name: "memory.recall_hook",
      arguments: {
        task_context: "stdio session continuity fake memory",
        project_scope: testScope,
        limit: 5,
      },
    }));
    if (
      recalled.mode !== "read_only" ||
      recalled.memory_writes !== false ||
      recalled.capture_suggestions !== false ||
      !recalled.results.some((result) => result.content === rememberedMemory)
    ) {
      fail(`${label} session B could not recall memory from session A: ${JSON.stringify(recalled)}`);
    }
    const rememberedHistory = parseToolJson(await client.callTool({
      name: "memory.history",
      arguments: {
        id: rememberedMemoryId,
      },
    }));
    const eventTypes = rememberedHistory.events?.map((event) => event.event_type) ?? [];
    if (JSON.stringify(eventTypes) !== JSON.stringify(["memory.created"])) {
      fail(`${label} recall_hook wrote audit events: ${JSON.stringify(rememberedHistory)}`);
    }

    const suggestion = parseToolJson(await client.callTool({
      name: "memory.suggest_capture",
      arguments: {
        content: suggestedMemory,
        kind: "preference",
        scope: testScope,
        tags: [testTag],
        source: "test:mcp-session-suggestion",
        confidence: 0.8,
        reason: "Validates read-only capture suggestions across MCP sessions.",
      },
    }));
    if (
      suggestion.status !== "ready" ||
      suggestion.memory_writes !== false ||
      suggestion.requires_confirmation !== true ||
      suggestion.duplicate !== null
    ) {
      fail(`${label} suggest_capture failed: ${JSON.stringify(suggestion)}`);
    }

    const beforeConfirm = parseToolJson(await client.callTool({
      name: "memory.recall_hook",
      arguments: {
        task_context: "confirmed capture drafts",
        project_scope: testScope,
        limit: 5,
      },
    }));
    if (
      beforeConfirm.mode !== "read_only" ||
      beforeConfirm.memory_writes !== false ||
      beforeConfirm.capture_suggestions !== false
    ) {
      fail(`${label} recall_hook before confirmation was not read-only: ${JSON.stringify(beforeConfirm)}`);
    }
    if (beforeConfirm.results.some((result) => result.content === suggestedMemory)) {
      fail(`${label} suggest_capture wrote memory before confirmation: ${JSON.stringify(beforeConfirm)}`);
    }

    const rejectedSuggestion = parseToolJson(await client.callTool({
      name: "memory.suggest_capture",
      arguments: {
        content: rejectedMemory,
        kind: "note",
        scope: testScope,
        tags: [testTag],
        source: "test:mcp-session-rejected-suggestion",
        confidence: 0.7,
        reason: "Validates rejected inferred capture drafts do not persist.",
      },
    }));
    if (
      rejectedSuggestion.status !== "ready" ||
      rejectedSuggestion.memory_writes !== false ||
      rejectedSuggestion.requires_confirmation !== true ||
      rejectedSuggestion.duplicate !== null
    ) {
      fail(`${label} rejected draft suggestion failed: ${JSON.stringify(rejectedSuggestion)}`);
    }
    const afterReject = parseToolJson(await client.callTool({
      name: "memory.recall_hook",
      arguments: {
        task_context: "rejected inferred capture drafts",
        project_scope: testScope,
        limit: 5,
      },
    }));
    if (afterReject.results.some((result) => result.content === rejectedMemory)) {
      fail(`${label} rejected capture draft was persisted: ${JSON.stringify(afterReject)}`);
    }

    const confirmed = parseToolJson(await client.callTool({
      name: "memory.remember",
      arguments: {
        content: suggestion.draft.content,
        kind: suggestion.draft.kind,
        scope: suggestion.draft.scope,
        tags: suggestion.draft.tags,
        source: "test:mcp-session-confirmed",
        confidence: suggestion.draft.confidence,
      },
    }));
    if (typeof confirmed.id !== "string" || !confirmed.id.startsWith("mem_")) {
      fail(`${label} confirmed capture did not create a memory id: ${JSON.stringify(confirmed)}`);
    }

    const afterConfirm = parseToolJson(await client.callTool({
      name: "memory.recall_hook",
      arguments: {
        task_context: "confirmed capture drafts",
        project_scope: testScope,
        limit: 5,
      },
    }));
    const confirmedResult = afterConfirm.results.find((result) => result.content === suggestedMemory);
    if (confirmedResult?.id !== confirmed.id || confirmedResult.revision !== 1) {
      fail(`${label} confirmed capture was not recalled with revision 1: ${JSON.stringify(afterConfirm)}`);
    }

    const updated = parseToolJson(await client.callTool({
      name: "memory.update",
      arguments: {
        id: confirmed.id,
        expected_revision: confirmedResult.revision,
        content: updatedMemory,
        kind: "preference",
        tags: [testTag, "updated"],
        confidence: 0.9,
      },
    }));
    if (
      updated.memory?.id !== confirmed.id ||
      updated.memory?.content !== updatedMemory ||
      updated.memory?.revision !== 2
    ) {
      fail(`${label} confirmed capture update failed: ${JSON.stringify(updated)}`);
    }

    await expectToolError(client.callTool({
      name: "memory.update",
      arguments: {
        id: confirmed.id,
        expected_revision: confirmedResult.revision,
        content: "This stale update must not commit.",
      },
    }), ["MEMORY_REVISION_CONFLICT", "Memory changed before this operation could commit."], label);

    const duplicate = parseToolJson(await client.callTool({
      name: "memory.suggest_capture",
      arguments: {
        content: " mcp session continuity smoke prefers reviewed   capture draft updates. ",
        kind: "note",
        scope: testScope,
        tags: [testTag],
        source: "test:mcp-session-duplicate",
        reason: "Validates exact duplicate detection across MCP sessions.",
      },
    }));
    if (
      duplicate.status !== "duplicate" ||
      !duplicate.duplicate?.id ||
      duplicate.duplicate.content !== updatedMemory
    ) {
      fail(`${label} duplicate suggestion failed: ${JSON.stringify(duplicate)}`);
    }

    const doctor = parseToolJson(await client.callTool({
      name: "memory.doctor",
      arguments: {},
    }));
    if (doctor.ok !== true || doctor.store?.readable !== true) {
      fail(`${label} doctor failed: ${JSON.stringify(doctor)}`);
    }
    const doctorJson = JSON.stringify(doctor);
    for (const memoryContent of [rememberedMemory, suggestedMemory]) {
      if (doctorJson.includes(memoryContent)) {
        fail(`${label} doctor exposed memory content`);
      }
    }
  });
}

async function withMcpSession({ cwd, command, args, memoryStore, label }, callback) {
  const client = new Client({
    name: "nuzo-mcp-session-continuity",
    version: "0.0.0",
  });
  const transport = new StdioClientTransport({
    command,
    args,
    cwd,
    env: {
      ...getDefaultEnvironment(),
      NUZO_MEMORY_STORE: memoryStore,
    },
    stderr: "pipe",
  });
  let stderr = "";
  transport.stderr?.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  try {
    await client.connect(transport);
    await callback(client);
  } catch (error) {
    throw new Error(
      `${label} session continuity failed: ${error instanceof Error ? error.message : String(error)}; stderr=${JSON.stringify(stderr)}`,
    );
  } finally {
    await client.close();
  }
}

export function parseToolJson(result) {
  const text = result.content?.find((item) => item.type === "text");
  if (text === undefined || typeof text.text !== "string") {
    fail("MCP tool result did not contain text JSON");
  }
  return JSON.parse(text.text);
}

async function expectToolError(resultPromise, expectedTexts, label) {
  const result = await resultPromise;
  if (result.isError !== true) {
    fail(`${label} expected tool error, got success: ${JSON.stringify(result)}`);
  }
  const text = result.content?.find((item) => item.type === "text");
  if (
    text === undefined ||
    typeof text.text !== "string" ||
    !expectedTexts.some((expectedText) => text.text.includes(expectedText))
  ) {
    fail(`${label} expected one of ${JSON.stringify(expectedTexts)} tool errors, got: ${JSON.stringify(result)}`);
  }
}

function fail(message) {
  throw new Error(`MCP session continuity validation failed: ${message}`);
}
