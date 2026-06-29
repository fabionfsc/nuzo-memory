#!/usr/bin/env node
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const memoryPackage = JSON.parse(
  readFileSync(join(repositoryRoot, "packages", "memory", "package.json"), "utf8"),
);
const args = process.argv.slice(2);
const requireModel = args.includes("--require-model");
const packageSpec = args.find((arg) => !arg.startsWith("--"))
  ?? `${memoryPackage.name}@${memoryPackage.version}`;
const modelPath = process.env.NUZO_SEMANTIC_MODEL_PATH
  ? resolve(process.env.NUZO_SEMANTIC_MODEL_PATH)
  : null;

if (requireModel && modelPath === null) {
  fail("NUZO_SEMANTIC_MODEL_PATH is required when --require-model is passed.");
}

const testRoot = mkdtempSync(join(tmpdir(), "nuzo-published-semantics-"));
const storePath = join(testRoot, "memory", "semantics.sqlite");

try {
  run(
    "npm",
    [
      "install",
      "--ignore-scripts=false",
      "--no-audit",
      "--no-fund",
      "--prefix",
      testRoot,
      packageSpec,
    ],
    repositoryRoot,
  );

  assertDefaultInstallBoundary(testRoot, packageSpec);
  assertDefaultHybridFallback(testRoot, storePath);

  if (modelPath !== null) {
    assertLocalSemanticRecall(testRoot, storePath, modelPath);
  } else {
    console.log(
      `published optional semantics fallback passed: ${packageSpec}; set NUZO_SEMANTIC_MODEL_PATH and pass --require-model to validate local semantic recall.`,
    );
  }
} finally {
  rmSync(testRoot, { recursive: true, force: true });
}

function assertDefaultInstallBoundary(root, installedSpec) {
  if (existsSync(join(root, "node_modules", "@huggingface", "transformers"))) {
    fail(`${installedSpec} unexpectedly installed Transformers.js by default.`);
  }
  const bundledModels = listFiles(join(root, "node_modules", "@nuzo"))
    .filter((path) => /(?:\.onnx(?:_data)?|nuzo-semantic-model\.json)$/u.test(path));
  if (bundledModels.length > 0) {
    fail(`${installedSpec} bundled semantic model files: ${bundledModels.join(", ")}`);
  }
}

function assertDefaultHybridFallback(root, memoryStore) {
  const executable = join(root, "node_modules", ".bin", cliExecutableName());
  const result = run(executable, [
    "memory", "--store", memoryStore, "--scope", "project:nuzo",
    "recall", "semantic fallback without a model", "--mode", "hybrid", "--json",
  ], root);
  const output = parseJson(result.stdout, "default hybrid fallback");
  if (
    output.results?.length !== 0 ||
    output.diagnostics?.requestedMode !== "hybrid" ||
    output.diagnostics?.effectiveMode !== "fts" ||
    output.diagnostics?.semanticFallbackCode !== "SEMANTIC_INDEX_MISSING"
  ) {
    fail(`default semantic fallback contract failed: ${result.stdout}`);
  }
}

function assertLocalSemanticRecall(root, memoryStore, localModelPath) {
  run("npm", [
    "install", "--ignore-scripts=false", "--no-audit", "--no-fund", "--no-save",
    "@huggingface/transformers@4.2.0",
  ], root);
  const executable = join(root, "node_modules", ".bin", cliExecutableName());
  const expectedContent = "Publish npm releases through trusted publishing with SLSA provenance.";
  run(executable, [
    "memory", "--store", memoryStore, "--scope", "project:nuzo", "remember",
    expectedContent,
    "--kind", "project_decision", "--tag", "npm", "release", "provenance",
  ], root);
  const rebuild = run(executable, [
    "memory", "--store", memoryStore, "semantic", "rebuild",
    "--model-path", localModelPath, "--json",
  ], root);
  const rebuildOutput = parseJson(rebuild.stdout, "semantic rebuild");
  if (rebuildOutput.indexedMemories !== 1) {
    fail(`published semantic rebuild failed: ${rebuild.stdout}`);
  }

  assertRecallMode({
    executable,
    root,
    memoryStore,
    modelPath: localModelPath,
    mode: "semantic",
    expectedContent,
    expectedEffectiveMode: "semantic",
  });
  assertRecallMode({
    executable,
    root,
    memoryStore,
    modelPath: localModelPath,
    mode: "hybrid",
    expectedContent,
    expectedEffectiveMode: "hybrid",
  });

  console.log(`published optional semantics recall passed: ${packageSpec}`);
}

function assertRecallMode({
  executable,
  root,
  memoryStore,
  modelPath: localModelPath,
  mode,
  expectedContent,
  expectedEffectiveMode,
}) {
  const recalled = run(executable, [
    "memory", "--store", memoryStore, "--scope", "project:nuzo", "recall",
    "How should verifiable supply-chain packages be shipped?", "--mode", mode,
    "--model-path", localModelPath, "--json",
  ], root);
  const output = parseJson(recalled.stdout, `${mode} recall`);
  if (
    output.results?.[0]?.memory?.content !== expectedContent ||
    output.diagnostics?.requestedMode !== mode ||
    output.diagnostics?.effectiveMode !== expectedEffectiveMode ||
    output.diagnostics?.semanticFallbackCode !== null
  ) {
    fail(`published ${mode} semantic recall failed: ${recalled.stdout}`);
  }
}

function cliExecutableName() {
  return process.platform === "win32" ? "nuzo.cmd" : "nuzo";
}

function listFiles(root) {
  if (!existsSync(root)) return [];
  const files = [];
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    if (statSync(path).isDirectory()) files.push(...listFiles(path));
    else files.push(path);
  }
  return files;
}

function parseJson(value, label) {
  try {
    return JSON.parse(value);
  } catch (error) {
    fail(`Could not parse ${label} JSON: ${error instanceof Error ? error.message : error}`);
  }
}

function run(command, commandArgs, cwd) {
  const result = spawnSync(command, commandArgs, {
    cwd,
    encoding: "utf8",
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.stderr.write(result.stdout);
    process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }
  return result;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
