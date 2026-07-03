import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

export function createTemporaryStore(prefix) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  return {
    root,
    storePath: join(root, "memories.sqlite"),
  };
}

export function cleanupTemporaryStore(root) {
  rmSync(root, { recursive: true, force: true });
}

export async function measureLatency(operation) {
  const started = performance.now();
  const value = await operation();
  return {
    value,
    latencyMs: performance.now() - started,
  };
}

export function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function ratio(numerator, denominator) {
  return denominator === 0 ? 1 : numerator / denominator;
}

export function formatPercent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

export function formatCounts(counts) {
  return Object.entries(counts).map(([key, count]) => `${key}:${count}`).join(",");
}

export function optionValue(name, { description = "value" } = {}) {
  const optionIndex = process.argv.indexOf(name);
  if (optionIndex === -1) {
    return undefined;
  }
  const value = process.argv[optionIndex + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${name} requires a ${description}`);
  }
  return value;
}

export function numberOption(name, fallback) {
  const value = optionValue(name);
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} requires a finite number`);
  }
  return parsed;
}
