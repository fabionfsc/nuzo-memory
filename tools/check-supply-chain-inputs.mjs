#!/usr/bin/env node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const workflowRoot = join(".github", "workflows");
const workflowFiles = readdirSync(workflowRoot)
  .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
  .map((name) => join(workflowRoot, name))
  .sort();

const failures = [];

for (const path of workflowFiles) {
  const content = readFileSync(path, "utf8");
  const lines = content.split(/\r?\n/u);
  lines.forEach((line, index) => validateWorkflowLine(path, index + 1, line));
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(failure);
  }
  process.exit(1);
}

console.log("supply-chain input validation passed");

function validateWorkflowLine(path, lineNumber, line) {
  const usesMatch = line.match(/^\s*uses:\s*([^#\s]+)(?:\s+#\s*(.+))?\s*$/u);
  if (usesMatch) {
    validateActionRef(path, lineNumber, usesMatch[1], usesMatch[2]);
  }

  if (/npm\s+install\s+--global\s+["']?npm@[\^~*]/u.test(line)) {
    fail(path, lineNumber, "release npm installation must use an exact reviewed npm version");
  }

  const globalNpmMatch = line.match(/npm\s+install\s+--global\s+["']?npm@([^"'\s]+)/u);
  if (globalNpmMatch && !/^\d+\.\d+\.\d+$/u.test(globalNpmMatch[1])) {
    fail(path, lineNumber, `npm must be pinned to an exact version, found ${globalNpmMatch[1]}`);
  }

  for (const packageSpec of line.matchAll(/--package=(@?[^@\s]+(?:\/[^@\s]+)?)@([^"'\s]+)/gu)) {
    const version = packageSpec[2];
    if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(version)) {
      fail(path, lineNumber, `npm exec package must be pinned exactly: ${packageSpec[0]}`);
    }
  }
}

function validateActionRef(path, lineNumber, value, reviewComment) {
  if (value.startsWith("./") || value.startsWith("docker://")) {
    return;
  }

  const atIndex = value.lastIndexOf("@");
  if (atIndex === -1) {
    fail(path, lineNumber, `GitHub Action reference must include an immutable ref: ${value}`);
    return;
  }

  const action = value.slice(0, atIndex);
  const ref = value.slice(atIndex + 1);
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)?$/u.test(action)) {
    fail(path, lineNumber, `unsupported GitHub Action reference shape: ${value}`);
  }
  if (!/^[0-9a-f]{40}$/u.test(ref)) {
    fail(path, lineNumber, `GitHub Action must be pinned to a 40-character commit SHA: ${value}`);
  }
  if (!reviewComment || !/^v\d+(?:\.\d+\.\d+)?(?:\s|$)/u.test(reviewComment)) {
    fail(path, lineNumber, `pinned GitHub Action must keep a reviewed version comment: ${value}`);
  }
}

function fail(path, lineNumber, message) {
  failures.push(`${path}:${lineNumber}: ${message}`);
}
