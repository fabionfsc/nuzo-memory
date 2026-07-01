#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { compareVersions } from "./npm-package-policy.mjs";

const publicUserDocs = [
  "README.md",
  "docs/index.md",
  "docs/getting-started/index.md",
  "docs/getting-started/clean-install.md",
  "docs/operations/local-cli.md",
  "docs/operations/codex-plugin.md",
  "docs/operations/claude-code-plugin.md",
  "packages/memory/README.md",
];

const firstUseDocs = [
  "README.md",
  "docs/index.md",
  "docs/getting-started/index.md",
  "docs/getting-started/clean-install.md",
  "packages/memory/README.md",
];

const failures = [];
const currentVersion = JSON.parse(readText("package.json")).version;

for (const path of publicUserDocs) {
  const content = readText(path);
  checkTerminology(path, content);
  checkShellSnippets(path, content);
}

checkSetupPreviewContract();
checkNonInteractiveSetupContract();
checkHostPluginCommandContract();
checkHookTrustContract();

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(failure);
  }
  process.exit(1);
}

console.log(`documentation snippet validation passed: ${publicUserDocs.length} public entry point(s)`);

function checkSetupPreviewContract() {
  for (const path of firstUseDocs) {
    const content = readText(path);
    if (compareVersions(currentVersion, "0.9.0") < 0) {
      assertIncludes(path, content, "Upcoming In 0.9.0", "must clearly label unreleased setup guidance");
      assertIncludes(
        path,
        content,
        `not available in the current ${currentVersion} release`,
        "must warn that setup guidance is not in the current public release",
      );
    } else {
      assertNotIncludes(path, content, "Upcoming In 0.9.0", "must not label current setup guidance as upcoming");
      assertNotIncludes(
        path,
        content,
        "not available in the current",
        "must not warn that current setup guidance is unavailable",
      );
    }
    assertIncludes(path, content, "npm install --global @nuzo/memory@0.9.0", "must show 0.9.0 install");
    assertIncludes(path, content, "nuzo setup", "must show one-time setup");
    assertIncludes(path, content, "nuzo update", "must show managed update path");
  }
}

function checkNonInteractiveSetupContract() {
  const localCli = readText("docs/operations/local-cli.md");
  assertOrdered("docs/operations/local-cli.md", localCli, [
    "For non-interactive use:",
    "# Codex",
    "nuzo setup --codex --yes",
    "# Claude Code",
    "nuzo setup --claude-code --yes",
    "# Both",
    "nuzo setup --all --yes",
  ]);

  for (const path of firstUseDocs) {
    const content = readText(path);
    for (const command of [
      "nuzo setup --codex --yes",
      "nuzo setup --claude-code --yes",
      "nuzo setup --all --yes",
    ]) {
      assertIncludes(path, content, command, `must include non-interactive setup command: ${command}`);
    }
  }
}

function checkHostPluginCommandContract() {
  const contracts = [
    {
      path: "docs/operations/codex-plugin.md",
      commands: [
        "codex plugin marketplace add fabionfsc/nuzo-memory",
        "codex plugin add nuzo@nuzo-memory",
        "codex plugin list --json",
      ],
    },
    {
      path: "docs/operations/claude-code-plugin.md",
      commands: [
        "claude plugin marketplace add fabionfsc/nuzo-memory",
        "claude plugin install nuzo@nuzo-memory --scope user",
        "claude plugin list --json",
      ],
    },
  ];

  for (const contract of contracts) {
    const content = readText(contract.path);
    for (const command of contract.commands) {
      assertIncludes(contract.path, content, command, `must document host command: ${command}`);
    }
  }
}

function checkHookTrustContract() {
  for (const path of firstUseDocs) {
    const content = readText(path);
    assertIncludes(
      path,
      content,
      "read-only recall hooks",
      "must describe host hook trust as read-only recall hook trust",
    );
  }

  for (const path of ["README.md", "docs/index.md", "docs/getting-started/index.md"]) {
    const content = readText(path);
    assertIncludes(path, content, "SessionStart", "must name the SessionStart recall hook");
    assertIncludes(path, content, "UserPromptSubmit", "must name the UserPromptSubmit recall hook");
    assertIncludes(path, content, "do not write memory", "must state that recall hooks do not write memory");
  }

  for (const path of ["docs/operations/codex-plugin.md", "docs/operations/claude-code-plugin.md"]) {
    const content = readText(path);
    assertIncludes(path, content, "Two hook trust prompts are expected", "must set expectation for hook trust prompts");
    assertIncludes(path, content, "SessionStart", "must document SessionStart hook behavior");
    assertIncludes(path, content, "UserPromptSubmit", "must document UserPromptSubmit hook behavior");
    assertIncludes(
      path,
      content,
      "never create, update, archive, or delete memory",
      "must state that host recall hooks never write memory",
    );
    assertIncludes(path, content, "memory.suggest_capture", "must route capture through suggest_capture");
    assertIncludes(path, content, "memory.confirm_capture", "must route capture through confirm_capture");
  }
}

function checkTerminology(path, content) {
  const forbidden = [
    [/ClaudeCode/u, "Use `Claude Code`, not `ClaudeCode`."],
    [/claude code/u, "Use capitalized `Claude Code` in user-facing docs."],
    [/\bNuzo Memory\b/u, "Use product name `Nuzo`, not `Nuzo Memory`."],
  ];
  for (const [pattern, message] of forbidden) {
    if (pattern.test(content)) {
      fail(path, 1, message);
    }
  }
}

function checkShellSnippets(path, content) {
  for (const snippet of extractShellSnippets(content)) {
    if (snippet.text.includes("<") || snippet.text.includes(">")) {
      continue;
    }
    const result = spawnSync("bash", ["-n"], {
      input: snippet.text,
      encoding: "utf8",
    });
    if (result.status !== 0) {
      fail(path, snippet.line, `shell snippet failed bash -n: ${result.stderr.trim()}`);
    }
  }
}

function extractShellSnippets(content) {
  const snippets = [];
  const lines = content.split(/\r?\n/u);
  let startLine = 0;
  let language = "";
  let buffer = [];
  for (const [index, line] of lines.entries()) {
    const fence = line.match(/^\s{0,3}```([A-Za-z0-9_-]*)\s*$/u);
    if (fence && buffer.length === 0) {
      startLine = index + 1;
      language = fence[1].toLowerCase();
      buffer = [line];
      continue;
    }
    if (buffer.length > 0) {
      if (/^\s{0,3}```\s*$/u.test(line)) {
        const body = buffer.slice(1).join("\n").trim();
        if (["bash", "sh", "shell"].includes(language)) {
          snippets.push({ line: startLine, text: body });
        }
        buffer = [];
        language = "";
        startLine = 0;
        continue;
      }
      buffer.push(line);
    }
  }
  return snippets;
}

function assertIncludes(path, content, expected, message) {
  const normalizedContent = normalizeWhitespace(content);
  const normalizedExpected = normalizeWhitespace(expected);
  try {
    assert.ok(normalizedContent.includes(normalizedExpected), message);
  } catch {
    fail(path, 1, message);
  }
}

function assertNotIncludes(path, content, unexpected, message) {
  const normalizedContent = normalizeWhitespace(content);
  const normalizedUnexpected = normalizeWhitespace(unexpected);
  try {
    assert.ok(!normalizedContent.includes(normalizedUnexpected), message);
  } catch {
    fail(path, 1, message);
  }
}

function assertOrdered(path, content, expectedParts) {
  let cursor = -1;
  for (const part of expectedParts) {
    const index = content.indexOf(part, cursor + 1);
    if (index === -1) {
      fail(path, 1, `missing ordered documentation fragment: ${part}`);
      continue;
    }
    if (index < cursor) {
      fail(path, 1, `fragment appears out of order: ${part}`);
    }
    cursor = index;
  }
}

function readText(path) {
  return readFileSync(path, "utf8");
}

function normalizeWhitespace(value) {
  return value.replace(/\s+/gu, " ").trim();
}

function fail(path, line, message) {
  failures.push(`${path}:${line}: ${message}`);
}
