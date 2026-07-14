import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function readTrackedMemoryToolNames() {
  const source = readFileSync(
    join(repositoryRoot, "packages", "mcp-server", "src", "tool-contract.ts"),
    "utf8",
  );
  const names = [...source.matchAll(/^\s*"(memory\.[^"]+)",?$/gmu)].map((match) => match[1]);
  if (names.length === 0 || new Set(names).size !== names.length) {
    throw new Error("tracked MCP tool contract is empty or contains duplicate names");
  }
  return names.sort();
}
