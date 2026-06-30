import { existsSync, lstatSync, readdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { semanticIndexPathFor } from "./semantic.js";

export interface RuntimeFileSafetyFinding {
  path: string;
  type: "file" | "directory" | "symlink" | "other";
  reason: "permissions" | "ownership" | "symlink" | "inspection_error";
  actualMode: number | null;
  expectedMode: number;
}

export interface RuntimeFileSafetyReport {
  permissionSemantics: "posix" | "not_supported";
  inspectedPaths: number;
  unsafe: RuntimeFileSafetyFinding[];
  staleArtifacts: string[];
  unexpectedFiles: string[];
}

export interface InspectRuntimeFileSafetyInput {
  storePath: string;
  projectRoot: string;
  home: string;
}

const allowedNuzoRootEntries = new Set(["config.json", "exports", "logs", "memory", "models"]);
const staleArtifactPattern = /(?:^\.nuzo-semantic-model-|\.bak$|\.backup(?:-|$)|\.tmp$)/u;

export function inspectRuntimeFileSafety(input: InspectRuntimeFileSafetyInput): RuntimeFileSafetyReport {
  const report: RuntimeFileSafetyReport = {
    permissionSemantics: process.platform === "win32" ? "not_supported" : "posix",
    inspectedPaths: 0,
    unsafe: [],
    staleArtifacts: [],
    unexpectedFiles: [],
  };
  const storeDirectory = dirname(input.storePath);
  const semanticPath = semanticIndexPathFor(input.storePath);
  const homeRoot = join(input.home, ".nuzo");
  const projectRoot = join(input.projectRoot, ".nuzo");

  inspectKnownPath(homeRoot, 0o700, report);
  inspectKnownPath(join(homeRoot, "config.json"), 0o600, report);
  inspectKnownPath(projectRoot, 0o700, report);
  inspectKnownPath(join(projectRoot, "config.json"), 0o600, report);
  inspectKnownPath(storeDirectory, 0o700, report);
  for (const path of [
    input.storePath,
    `${input.storePath}-wal`,
    `${input.storePath}-shm`,
    semanticPath,
    `${semanticPath}-wal`,
    `${semanticPath}-shm`,
  ]) {
    inspectKnownPath(path, 0o600, report);
  }

  const recursiveRoots = new Set([
    join(storeDirectory, "exports"),
    join(storeDirectory, "logs"),
    join(homeRoot, "models"),
  ]);
  for (const root of recursiveRoots) inspectTree(root, report);
  inspectStaleEntries(storeDirectory, report);
  for (const root of new Set([homeRoot, projectRoot])) inspectNuzoRoot(root, report);

  report.unsafe.sort(byPath);
  report.staleArtifacts.sort();
  report.unexpectedFiles.sort();
  return report;
}

function inspectKnownPath(path: string, expectedMode: number, report: RuntimeFileSafetyReport): void {
  if (!existsSync(path)) return;
  let stats;
  try {
    stats = lstatSync(path);
  } catch {
    report.unsafe.push({ path, type: "other", reason: "inspection_error", actualMode: null, expectedMode });
    return;
  }
  report.inspectedPaths += 1;
  if (stats.isSymbolicLink()) {
    report.unsafe.push({ path, type: "symlink", reason: "symlink", actualMode: null, expectedMode });
    return;
  }
  const type = stats.isDirectory() ? "directory" : stats.isFile() ? "file" : "other";
  if (report.permissionSemantics === "posix" && (stats.mode & 0o077) !== 0) {
    report.unsafe.push({ path, type, reason: "permissions", actualMode: stats.mode & 0o777, expectedMode });
  }
  if (report.permissionSemantics === "posix" && process.getuid !== undefined && stats.uid !== process.getuid()) {
    report.unsafe.push({ path, type, reason: "ownership", actualMode: stats.mode & 0o777, expectedMode });
  }
}

function inspectTree(root: string, report: RuntimeFileSafetyReport): void {
  if (!existsSync(root)) return;
  inspectKnownPath(root, 0o700, report);
  let rootStats;
  try {
    rootStats = lstatSync(root);
  } catch {
    return;
  }
  if (!rootStats.isDirectory() || rootStats.isSymbolicLink()) return;
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    report.unsafe.push({ path: root, type: "directory", reason: "inspection_error", actualMode: null, expectedMode: 0o700 });
    return;
  }
  for (const entry of entries) {
    const path = join(root, entry.name);
    inspectKnownPath(path, entry.isDirectory() ? 0o700 : 0o600, report);
    if (staleArtifactPattern.test(entry.name)) report.staleArtifacts.push(path);
    if (entry.isDirectory() && !entry.isSymbolicLink()) inspectTree(path, report);
  }
}

function inspectNuzoRoot(root: string, report: RuntimeFileSafetyReport): void {
  if (!existsSync(root)) return;
  let stats;
  try {
    stats = lstatSync(root);
  } catch {
    return;
  }
  if (!stats.isDirectory() || stats.isSymbolicLink()) return;
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (!allowedNuzoRootEntries.has(entry.name)) report.unexpectedFiles.push(path);
    if (staleArtifactPattern.test(basename(path))) report.staleArtifacts.push(path);
  }
}

function inspectStaleEntries(root: string, report: RuntimeFileSafetyReport): void {
  if (!existsSync(root)) return;
  try {
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (staleArtifactPattern.test(entry.name)) report.staleArtifacts.push(join(root, entry.name));
    }
  } catch {
    // The path-level inspection already reports inaccessible known roots.
  }
}

function byPath(a: RuntimeFileSafetyFinding, b: RuntimeFileSafetyFinding): number {
  return a.path.localeCompare(b.path) || a.reason.localeCompare(b.reason);
}
