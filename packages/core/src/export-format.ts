import type { MemoryExportDocument, MemoryExportItem } from "./types.js";

export function formatMemoryExportMarkdown(document: MemoryExportDocument): string {
  const lines: string[] = [
    "# Nuzo Memory Export",
    "",
    "This file is for human review. Use JSON exports for import.",
    "",
    "```yaml",
    "format: nuzo-memory-export",
    `version: ${document.version}`,
    `exported_at: ${yamlString(document.exported_at)}`,
    `count: ${document.memories.length}`,
    "```",
    "",
    "## Memories",
    "",
  ];

  if (document.memories.length === 0) {
    lines.push("_No memories exported._", "");
    return lines.join("\n");
  }

  document.memories.forEach((memory, index) => {
    lines.push(`### Memory ${index + 1}`);
    lines.push("");
    lines.push(formatMemoryExportItemMetadata(memory));
    lines.push("");
    lines.push(memory.content);
    lines.push("");
  });

  return lines.join("\n");
}

function formatMemoryExportItemMetadata(memory: MemoryExportItem): string {
  const lines = [
    "```yaml",
    `scope: ${yamlString(memory.scope)}`,
    `kind: ${yamlString(memory.kind)}`,
    "tags:",
    ...formatTags(memory.tags),
    `source: ${yamlString(memory.source)}`,
    `confidence: ${memory.confidence}`,
    `created_at: ${yamlString(memory.created_at)}`,
    `updated_at: ${yamlString(memory.updated_at)}`,
    `last_used_at: ${yamlNullableString(memory.last_used_at)}`,
    `archived_at: ${yamlNullableString(memory.archived_at)}`,
    "```",
  ];

  return lines.join("\n");
}

function formatTags(tags: string[]): string[] {
  return tags.length === 0
    ? ["  []"]
    : tags.map((tag) => `  - ${yamlString(tag)}`);
}

function yamlNullableString(value: string | null): string {
  return value === null ? "null" : yamlString(value);
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}
