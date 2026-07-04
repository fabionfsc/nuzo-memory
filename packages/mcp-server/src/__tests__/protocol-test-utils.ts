import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { expect } from "vitest";

export interface BoundedSuggestionOutput {
  status: string;
  memory_writes: boolean;
  requires_confirmation: boolean;
  duplicate: { id: string } | null;
  relationship_mode: "bounded";
  relationship: string;
  relationship_evidence: {
    version: 1;
    primary_memory_id: string | null;
    candidate_limit: number;
    returned_limit: number;
    evaluated_count: number;
    search_exhaustive: boolean;
    evidence_truncated: boolean;
    reason: string;
    candidates: Array<{
      memory: {
        id: string;
        revision: number;
        scope: string;
      };
      matched_terms: string[];
      matched_tags: string[];
      reason: string;
    }>;
  };
}

export interface ConfirmCaptureOutput {
  decision: string;
  status: string;
  memory_writes: boolean;
  requires_confirmation: false;
  reason: string;
  memory: {
    id: string;
    revision: number;
    content: string;
    source: string;
  } | null;
}

export async function rememberProtocolMemory(
  client: Client,
  input: {
    content: string;
    kind: "preference" | "project_decision" | "fact" | "instruction" | "note";
    scope: string;
    tags: string[];
  },
): Promise<{ id: string }> {
  return parseToolJson(await client.callTool({
    name: "memory.remember",
    arguments: {
      ...input,
      source: "test:mcp-client",
    },
  })) as { id: string };
}

export async function protocolState(client: Client): Promise<{
  auditEvents: number;
  memoryIds: string[];
}> {
  const listed = parseToolJson(await client.callTool({
    name: "memory.list",
    arguments: {
      include_archived: true,
    },
  })) as { memories: Array<{ id: string }> };
  const audit = parseToolJson(await client.callTool({
    name: "memory.audit",
    arguments: {
      limit: 200,
    },
  })) as { events: unknown[] };
  return {
    auditEvents: audit.events.length,
    memoryIds: listed.memories.map((memory) => memory.id).sort(),
  };
}

export async function expectToolError(
  resultPromise: Promise<Awaited<ReturnType<Client["callTool"]>>>,
): Promise<void> {
  const result = await resultPromise;
  expect(result.isError).toBe(true);
  expect(result.content).toEqual([
    expect.objectContaining({
      type: "text",
    }),
  ]);
}

export function parseToolJson(result: Awaited<ReturnType<Client["callTool"]>>): unknown {
  return JSON.parse(toolText(result));
}

export function toolText(result: Awaited<ReturnType<Client["callTool"]>>): string {
  if (!Array.isArray(result.content)) {
    throw new Error("Expected MCP tool result content to be an array.");
  }
  const text = result.content.find(isTextContent);
  if (!text) {
    throw new Error("Expected MCP tool result to contain text.");
  }
  return text.text;
}

function isTextContent(item: unknown): item is { type: "text"; text: string } {
  return typeof item === "object" && item !== null &&
    "type" in item && item.type === "text" &&
    "text" in item && typeof item.text === "string";
}
