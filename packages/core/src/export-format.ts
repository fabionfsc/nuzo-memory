import type { MemoryExportDocument, MemoryExportItem, MemoryExportRelationItem } from "./types.js";
import {
  escapeUntrustedControlCharacters,
  renderUntrustedMarkdownBlock,
} from "./untrusted-text.js";

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
    `relation_count: ${document.relations?.length ?? 0}`,
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
    lines.push(renderUntrustedMarkdownBlock(memory.content));
    lines.push("");
  });

  if ((document.relations?.length ?? 0) > 0) {
    lines.push("## Relations", "");
    document.relations!.forEach((relation, index) => {
      lines.push(`### Relation ${index + 1}`);
      lines.push("");
      lines.push(formatMemoryExportRelationMetadata(relation));
      lines.push("");
    });
  }

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
    `confidence_state: ${yamlNullableString(memory.confidence_state ?? null)}`,
    `provenance: ${yamlNullableString(memory.provenance === undefined ? null : JSON.stringify(memory.provenance))}`,
    `review_after: ${yamlNullableString(memory.review_after ?? null)}`,
    `expires_at: ${yamlNullableString(memory.expires_at ?? null)}`,
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

function formatMemoryExportRelationMetadata(relation: MemoryExportRelationItem): string {
  return [
    "```yaml",
    `source_index: ${relation.source_index}`,
    `target_index: ${relation.target_index}`,
    `relation: ${yamlString(relation.relation)}`,
    `reason: ${yamlNullableString(relation.reason ?? null)}`,
    `created_at: ${yamlString(relation.created_at)}`,
    "```",
  ].join("\n");
}

function yamlNullableString(value: string | null): string {
  return value === null ? "null" : yamlString(value);
}

function yamlString(value: string): string {
  // `JSON.stringify` escapes C0 controls but leaves DEL, C1 controls, and the
  // Unicode line/paragraph separators raw. Escaping those keeps the metadata
  // block a valid JSON string literal that is also safe to print in a terminal.
  return escapeUntrustedControlCharacters(JSON.stringify(value));
}
