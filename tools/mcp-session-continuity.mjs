import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from "@modelcontextprotocol/sdk/client/stdio.js";

const rememberedMemory = "MCP session continuity smoke stores fake memory across stdio sessions.";
const suggestedMemory = "MCP session continuity smoke prefers confirmed capture drafts.";
const testScope = "project:mcp-session-continuity";
const testTag = "session-continuity";

export async function assertMcpSessionContinuity({
  cwd,
  command,
  memoryStore,
  label = "Nuzo MCP",
  expectedToolNames,
}) {
  await withMcpSession({ cwd, command, memoryStore, label }, async (client) => {
    if (expectedToolNames !== undefined) {
      const tools = await client.listTools();
      const names = tools.tools.map((tool) => tool.name).sort();
      if (JSON.stringify(names) !== JSON.stringify(expectedToolNames)) {
        fail(`${label} tool set mismatch: ${JSON.stringify(names)}`);
      }
    }

    await client.callTool({
      name: "memory.remember",
      arguments: {
        content: rememberedMemory,
        kind: "project_decision",
        scope: testScope,
        tags: [testTag],
        source: "test:mcp-session-a",
      },
    });
  });

  await withMcpSession({ cwd, command, memoryStore, label }, async (client) => {
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
      !recalled.results.some((result) => result.content === rememberedMemory)
    ) {
      fail(`${label} session B could not recall memory from session A: ${JSON.stringify(recalled)}`);
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
    if (beforeConfirm.results.some((result) => result.content === suggestedMemory)) {
      fail(`${label} suggest_capture wrote memory before confirmation: ${JSON.stringify(beforeConfirm)}`);
    }

    await client.callTool({
      name: "memory.remember",
      arguments: {
        content: suggestion.draft.content,
        kind: suggestion.draft.kind,
        scope: suggestion.draft.scope,
        tags: suggestion.draft.tags,
        source: "test:mcp-session-confirmed",
        confidence: suggestion.draft.confidence,
      },
    });

    const duplicate = parseToolJson(await client.callTool({
      name: "memory.suggest_capture",
      arguments: {
        content: " mcp session continuity smoke prefers confirmed   capture drafts. ",
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
      duplicate.duplicate.content !== suggestedMemory
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

async function withMcpSession({ cwd, command, memoryStore, label }, callback) {
  const client = new Client({
    name: "nuzo-mcp-session-continuity",
    version: "0.0.0",
  });
  const transport = new StdioClientTransport({
    command,
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

function fail(message) {
  throw new Error(`MCP session continuity validation failed: ${message}`);
}
