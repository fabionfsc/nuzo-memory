import { closeSync, constants, fstatSync, openSync, readFileSync } from "node:fs";
import {
  formatMemoryExportMarkdown,
  NuzoMemoryError,
  type MemoryExportDocument,
} from "@nuzo/memory-core";
import type { ExportFormat } from "./parsers.js";

export function readExportDocument(path: string): MemoryExportDocument {
  let descriptor: number | null = null;
  try {
    descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const stats = fstatSync(descriptor);
    if (!stats.isFile()) {
      throw new NuzoMemoryError(
        "MEMORY_EXPORT_READ_FAILED",
        "Memory export path is not a file.",
        { path },
      );
    }
    if (stats.size > 10 * 1024 * 1024) {
      throw new NuzoMemoryError(
        "MEMORY_EXPORT_TOO_LARGE",
        "Memory export file is too large.",
        { maxBytes: 10 * 1024 * 1024, path },
      );
    }
    return JSON.parse(readFileSync(descriptor, "utf8")) as MemoryExportDocument;
  } catch (error) {
    if (error instanceof NuzoMemoryError) throw error;
    if (error instanceof SyntaxError) {
      throw new NuzoMemoryError("MEMORY_EXPORT_INVALID", "Memory export JSON is invalid.", { path });
    }
    throw new NuzoMemoryError("MEMORY_EXPORT_READ_FAILED", "Memory export file could not be read.", { path });
  } finally {
    if (descriptor !== null) closeSync(descriptor);
  }
}

export function formatExportDocument(document: MemoryExportDocument, format: ExportFormat): string {
  return format === "markdown"
    ? formatMemoryExportMarkdown(document)
    : `${JSON.stringify(document, null, 2)}\n`;
}
