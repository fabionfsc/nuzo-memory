#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";

import {
  createMemoryService,
  createHybridSearchIndex,
  createSemanticSearch,
  createLocalTransformersEmbeddingProvider,
  DefaultPolicyEngine,
  rebuildSemanticIndex,
  RegexSecretScanner,
  SQLiteMemoryDatabase,
  semanticIndexPathFor,
  SystemClock,
} from "../packages/core/dist/index.js";

const jsonOutput = process.argv.includes("--json");
const keepStore = process.argv.includes("--keep");
const providerModulePath = optionValue("--provider-module");
const localTransformersModelPath = optionValue("--local-transformers-model");
const similarityFloor = numberOption("--similarity-floor", 0.34);
const tmpRoot = mkdtempSync(join(tmpdir(), "nuzo-semantic-benchmark-"));
const storePath = join(tmpRoot, "memories.sqlite");

const fixtures = [
  fixture("npm-provenance", "Publish npm releases through trusted publishing with SLSA provenance.", ["npm", "release", "provenance"]),
  fixture("backup-export", "Export a Nuzo JSON backup before destructive memory maintenance.", ["backup", "export", "maintenance"]),
  fixture("accessibility", "Interactive controls support keyboard navigation and WCAG contrast.", ["accessibility", "keyboard", "wcag"]),
  fixture("error-cause", "Unexpected failures preserve the original cause and return a concise public error.", ["errors", "reliability", "cause"]),
  fixture("node-matrix", "Validate releases on Node.js 22 and Node.js 24.", ["nodejs", "testing", "release"]),
  fixture("git-squash", "Land focused branches through squash merge with a Conventional Commit subject.", ["git", "pull-request", "squash"]),
  fixture("secret-rule", "Never persist credentials, access tokens, passwords, or private keys in agent memory.", ["security", "credentials", "privacy"]),
  fixture("dependency-audit", "Dependency changes require an npm audit and signature verification.", ["dependencies", "audit", "signatures"]),
  fixture("api-errors", "API failures use structured JSON and stable machine-readable error codes.", ["api", "errors", "json"]),
  fixture("sqlite-concurrency", "SQLite writes use optimistic revisions and transactional audit events.", ["sqlite", "concurrency", "storage"]),
  fixture("docs-validation", "Run MkDocs strict validation before merging documentation changes.", ["docs", "mkdocs", "validation"]),
  fixture("cloudflare-routing", "Cloudflare routing changes use the local reverse proxy before DNS updates.", ["cloudflare", "routing", "dns"]),
  fixture("response-style", "The user prefers concise answers that state tradeoffs explicitly.", ["communication", "concise", "tradeoffs"], "user:default"),
  fixture("timezone", "User-facing schedules use the America/Sao_Paulo timezone.", ["timezone", "scheduling"], "user:default"),
  fixture("pt-deploy", "A implantação em produção exige revisão explícita antes do deploy.", ["deploy", "pt-br", "producao"]),
  fixture("unicode-memory", "A memória local deve permanecer auditável e portátil entre agentes.", ["memoria", "auditavel", "portabilidade"]),
  fixture("spanish-tests", "Cada cambio importante debe incluir pruebas automatizadas.", ["language-es", "testing", "quality"]),
  fixture("german-secrets", "Geheimnisse und Zugangsdaten dürfen niemals gespeichert werden.", ["language-de", "security", "secrets"]),
  fixture("other-project-ingress", "Production traffic in the other project uses Kubernetes ingress.", ["kubernetes", "routing"], "project:other"),
  { ...fixture("archived-deploy", "Legacy production deployment uses manual FTP uploads.", ["deploy", "legacy"]), archived: true },
  ...Array.from({ length: 48 }, (_, index) => fixture(
    `noise-${index}`,
    `Synthetic local note ${index} covers routine planning, review, testing, and documentation work.`,
    ["synthetic", `noise-${index}`],
  )),
  ...Array.from({ length: 10 }, (_, index) => fixture(
    `bounded-${index}`,
    `Benchmark cluster item ${index} belongs to the bounded retrieval collection.`,
    ["bounded-cluster", `item-${index}`],
  )),
];

const qualityCases = [
  semanticCase("Verifiable package publishing", "How do we publish packages with verifiable supply-chain metadata?", "npm-provenance"),
  semanticCase("Irreversible maintenance preparation", "What must happen before irreversible data maintenance?", "backup-export"),
  semanticCase("Keyboard-only interaction", "How should keyboard-only users operate interface controls?", "accessibility"),
  semanticCase("Underlying exception", "When an operation fails, should we retain the underlying exception?", "error-cause"),
  semanticCase("Supported runtimes", "Which JavaScript runtimes belong in the release compatibility matrix?", "node-matrix"),
  semanticCase("Branch integration", "What is the preferred way to integrate a completed branch?", "git-squash"),
  semanticCase("Sensitive authentication data", "May passwords or authentication tokens enter long-term context?", "secret-rule"),
  semanticCase("Third-party library review", "What verification is needed when a third-party library changes?", "dependency-audit"),
  semanticCase("Machine-consumable failures", "Which response format should machine clients receive for failures?", "api-errors"),
  semanticCase("Concurrent local writes", "How does the local database prevent two writers from overwriting each other?", "sqlite-concurrency"),
  semanticCase("Documentation quality gate", "Which strict site check runs before docs are integrated?", "docs-validation"),
  semanticCase("Edge traffic change", "What local step precedes changing edge traffic and name resolution?", "cloudflare-routing"),
  semanticCase("Concise communication", "Does the user want brief responses that explain compromises?", "response-style", { includeGlobal: true }),
  semanticCase("Calendar locale", "Which regional zone applies when displaying appointments?", "timezone", { includeGlobal: true }),
  semanticCase("English lexical control", "npm trusted publishing provenance", "npm-provenance"),
  semanticCase("English lexical backup control", "JSON backup destructive maintenance", "backup-export"),
  semanticCase("Implantação em português", "Qual aprovação é necessária antes de colocar em produção?", "pt-deploy", { group: "compatibility" }),
  semanticCase("Memória Unicode", "Como os dados lembrados ficam inspecionáveis e transportáveis?", "unicode-memory", { group: "compatibility" }),
  semanticCase("Pruebas en español", "¿Qué control automático acompaña un cambio importante?", "spanish-tests", { group: "compatibility" }),
  semanticCase("Geheimnisse auf Deutsch", "Dürfen Anmeldedaten dauerhaft abgelegt werden?", "german-secrets", { group: "compatibility" }),
];

const safetyCases = [
  { label: "scope isolation", query: "Kubernetes ingress production traffic", scope: "project:nuzo", limit: 5, excluded: ["other-project-ingress"] },
  { label: "archived exclusion", query: "manual FTP production deployment", scope: "project:nuzo", limit: 5, excluded: ["archived-deploy"] },
  { label: "global excluded by default", query: "brief responses explain compromises", scope: "project:nuzo", limit: 5, excluded: ["response-style"] },
  { label: "bounded output", query: "bounded retrieval collection cluster", scope: "project:nuzo", limit: 3, maxResults: 3, requiredPrefix: "bounded-" },
  { label: "quiet unrelated query", query: "marine biology coral reef salinity", scope: "project:nuzo", limit: 5, maxResults: 0 },
];

class DeterministicBenchmarkEncoder {
  networkRequests = 0;
  descriptor = { id: "public-synthetic-concept-hash-v1", model: "public-concept-hash", revision: "1", dimensions: 384, network: "none", runtimeCandidate: false };

  async embedDocuments(texts) {
    return texts.map((text) => this.embed(text));
  }

  async embedQuery(text) {
    return this.embed(text);
  }

  embed(text) {
    const normalized = text.toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "");
    const concepts = new Set(tokenize(normalized).map((token) => aliases.get(token) ?? token));
    for (const [phrase, concept] of phraseAliases) if (normalized.includes(phrase)) concepts.add(concept);
    const vector = new Float64Array(this.descriptor.dimensions);
    for (const concept of concepts) {
      const digest = createHash("sha256").update(concept).digest();
      const index = digest.readUInt16BE(0) % vector.length;
      vector[index] += digest[2] % 2 === 0 ? 1 : -1;
    }
    const norm = Math.hypot(...vector);
    if (norm > 0) for (let index = 0; index < vector.length; index += 1) vector[index] /= norm;
    return vector;
  }
}

async function runBenchmark() {
  if (providerModulePath && localTransformersModelPath) {
    throw new Error("Choose only one semantic benchmark provider option.");
  }
  const encoder = localTransformersModelPath
    ? createLocalTransformersEmbeddingProvider({ modelPath: localTransformersModelPath })
    : providerModulePath
      ? await loadExternalProvider(providerModulePath)
      : new DeterministicBenchmarkEncoder();
  const database = new SQLiteMemoryDatabase({ path: storePath });
  const ids = new BenchmarkIds();

  try {
  const service = createMemoryService({
    store: database,
    searchIndex: database,
    auditLog: database,
    clock: new SystemClock(),
    ids,
    policy: new DefaultPolicyEngine(new RegexSecretScanner()),
    transactions: database,
  });
  const memories = new Map();
  for (const item of fixtures) {
    const memory = await service.remember({
      content: item.content,
      kind: "instruction",
      scope: item.scope,
      tags: item.tags,
      source: "benchmark:semantics",
    });
    memories.set(item.key, memory);
    if (item.archived) {
      await service.forget({ id: memory.id, actor: "benchmark:semantics", mode: "archive", reason: "Safety fixture." });
    }
  }

  const keyById = new Map([...memories].map(([key, memory]) => [memory.id, key]));
  const semanticPath = semanticIndexPathFor(storePath);
  await rebuildSemanticIndex({
    path: semanticPath,
    provider: encoder,
    memories: await service.list({ includeArchived: false }),
  });
  const semantic = createSemanticSearch({
    path: semanticPath,
    provider: encoder,
    store: database,
    similarityFloor,
  });
  const searchIndex = createHybridSearchIndex({ fts: database, semantic });
  const before = mutationCounts(database);
  const modes = {};
  for (const mode of ["fts", "semantic", "hybrid"]) {
    modes[mode] = await evaluateMode(mode, qualityCases, searchIndex, keyById);
  }
  const safety = {};
  for (const mode of ["fts", "semantic", "hybrid"]) {
    safety[mode] = await evaluateSafety(mode, safetyCases, searchIndex, keyById);
  }
  const after = mutationCounts(database);
  const safetyGates = {
    zeroWrites: before.memories === after.memories && before.events === after.events,
    noNetwork: (encoder.networkRequests ?? 0) === 0 && encoder.descriptor.network === "none",
    modes: Object.fromEntries(Object.entries(safety).map(([mode, result]) => [mode, result.failures.length === 0])),
  };
  const decision = evaluateEnvelope(modes, safetyGates);
  const report = {
    benchmark: "nuzo-optional-semantics",
    version: 1,
    fixturePolicy: "public-synthetic-only",
    candidate: encoder.descriptor,
    providerModule: localTransformersModelPath
      ? "core-local-transformers"
      : providerModulePath ?? "benchmark-fixture",
    similarityFloor,
    fixtures: fixtures.length,
    qualityCases: qualityCases.length,
    safetyCases: safetyCases.length,
    modes,
    safety,
    safetyGates,
    envelope: {
      english: { minCases: 16, minTop1: 0.875, minMrr: 0.9, maxNoise: 0.1 },
      candidate: { minTop1Lift: 0.2, minMrrLift: 0.15 },
      safety: "all independent gates pass",
    },
    decision,
  };

  if (jsonOutput) console.log(JSON.stringify(report, null, 2));
  else printReport(report);
  if (!decision.passes) process.exitCode = 1;
  } finally {
    database.close();
    await encoder.dispose?.();
    if (!keepStore) rmSync(tmpRoot, { recursive: true, force: true });
    else if (!jsonOutput) console.log(`kept benchmark store: ${storePath}`);
  }
}

function fixture(key, content, tags, scope = "project:nuzo") {
  return { key, content, tags, scope };
}

function semanticCase(label, query, expected, options = {}) {
  return { label, query, expected, group: options.group ?? "english", scope: "project:nuzo", limit: 5, includeGlobal: options.includeGlobal === true };
}

async function evaluateMode(mode, cases, searchIndex, keyById) {
  const results = [];
  for (const item of cases) {
    const started = performance.now();
    const recalled = await retrieve(mode, item, searchIndex);
    const latencyMs = performance.now() - started;
    const keys = recalled.map((result) => keyById.get(result.memory.id));
    const rank = keys.indexOf(item.expected) + 1;
    const noise = keys.filter((key) => key !== item.expected).length;
    results.push({ label: item.label, group: item.group, expected: item.expected, keys, rank, top1: rank === 1, reciprocalRank: rank === 0 ? 0 : 1 / rank, noise, latencyMs });
  }
  return summarizeMode(results);
}

async function evaluateSafety(mode, cases, searchIndex, keyById) {
  const results = [];
  for (const item of cases) {
    const recalled = await retrieve(mode, item, searchIndex);
    const keys = recalled.map((result) => keyById.get(result.memory.id));
    const failures = [];
    for (const excluded of item.excluded ?? []) if (keys.includes(excluded)) failures.push(`included ${excluded}`);
    if (item.maxResults !== undefined && keys.length > item.maxResults) failures.push(`returned ${keys.length}, maximum ${item.maxResults}`);
    if (item.requiredPrefix && keys.some((key) => !key.startsWith(item.requiredPrefix))) failures.push(`returned result outside ${item.requiredPrefix}*`);
    results.push({ label: item.label, keys, failures });
  }
  return { failures: results.flatMap((result) => result.failures.map((failure) => `${result.label}: ${failure}`)), results };
}

async function retrieve(mode, input, searchIndex) {
  return searchIndex.search({
    query: input.query,
    scope: input.scope,
    includeGlobal: input.includeGlobal,
    limit: input.limit,
    recordUsage: false,
    retrievalMode: mode,
  });
}

function summarizeMode(results) {
  const summarize = (items) => ({
    cases: items.length,
    top1: ratio(items.filter((item) => item.top1).length, items.length),
    mrr: ratio(items.reduce((sum, item) => sum + item.reciprocalRank, 0), items.length),
    noise: ratio(items.reduce((sum, item) => sum + item.noise, 0), items.reduce((sum, item) => sum + item.keys.length, 0)),
  });
  const latencies = results.map((item) => item.latencyMs);
  return {
    ...summarize(results),
    groups: Object.fromEntries(["english", "compatibility"].map((group) => [group, summarize(results.filter((item) => item.group === group))])),
    averageLatencyMs: average(latencies),
    maxLatencyMs: Math.max(...latencies),
    results,
  };
}

function evaluateEnvelope(modes, safety) {
  const fts = modes.fts.groups.english;
  const hybrid = modes.hybrid.groups.english;
  const failures = [];
  if (hybrid.cases < 16) failures.push("English group has fewer than 16 cases.");
  if (hybrid.top1 < 0.875) failures.push("Hybrid English top-1 is below 87.5%.");
  if (hybrid.mrr < 0.9) failures.push("Hybrid English MRR is below 90%.");
  if (hybrid.noise > 0.1) failures.push("Hybrid English noise exceeds 10%.");
  if (hybrid.top1 - fts.top1 < 0.2) failures.push("Hybrid English top-1 lift over FTS is below 20 points.");
  if (hybrid.mrr - fts.mrr < 0.15) failures.push("Hybrid English MRR lift over FTS is below 15 points.");
  if (!safety.zeroWrites) failures.push("Recall changed canonical memory or audit rows.");
  if (!safety.noNetwork) failures.push("Candidate attempted network access.");
  for (const [mode, passed] of Object.entries(safety.modes)) if (!passed) failures.push(`${mode} safety cases failed.`);
  return { passes: failures.length === 0, failures, top1Lift: hybrid.top1 - fts.top1, mrrLift: hybrid.mrr - fts.mrr };
}

function mutationCounts(db) {
  return {
    memories: db.database.prepare("SELECT COUNT(*) AS count FROM memories").get().count,
    events: db.database.prepare("SELECT COUNT(*) AS count FROM memory_events").get().count,
  };
}

class BenchmarkIds {
  memory = 0;
  event = 0;
  memoryId() { return `mem_sem_${String(++this.memory).padStart(4, "0")}`; }
  eventId() { return `evt_sem_${String(++this.event).padStart(4, "0")}`; }
}

const aliases = new Map(Object.entries({
  packages: "npm", package: "npm", publishing: "publish", published: "publish", supply: "provenance", metadata: "provenance", verifiable: "provenance",
  irreversible: "destructive", data: "memory", preparation: "backup", prepare: "backup",
  keyboardonly: "keyboard", operate: "navigation", interface: "controls", users: "accessibility",
  underlying: "original", exception: "cause", retain: "preserve", reporting: "error", fails: "failures",
  javascript: "nodejs", runtimes: "nodejs", compatibility: "testing", matrix: "testing",
  integrate: "merge", integration: "merge", completed: "focused", branch: "branches", preferred: "squash",
  passwords: "credentials", authentication: "credentials", longterm: "memory", context: "memory", sensitive: "security",
  thirdparty: "dependencies", library: "dependencies", libraries: "dependencies", verification: "audit", needed: "require",
  machine: "api", clients: "api", format: "json", failures: "errors", response: "json",
  concurrent: "concurrency", database: "sqlite", writers: "writes", overwriting: "revisions", prevent: "optimistic",
  site: "mkdocs", check: "validation", integrated: "merge",
  edge: "cloudflare", traffic: "routing", name: "dns", resolution: "dns", precedes: "before",
  brief: "concise", responses: "answers", compromises: "tradeoffs", explain: "explicit",
  regional: "timezone", zone: "timezone", appointments: "schedules", displaying: "userfacing",
  aprovacao: "revisao", colocar: "implantacao", transportaveis: "portatil", inspecionaveis: "auditavel",
  control: "pruebas", automatico: "automatizadas", acompana: "incluir", anmeldedaten: "zugangsdaten", dauerhaft: "gespeichert",
}));

const phraseAliases = new Map([
  ["supply-chain", "provenance"], ["long-term", "memory"], ["machine-readable", "json"],
  ["keyboard-only", "accessibility"], ["name resolution", "dns"], ["third-party", "dependencies"],
  ["colocar em producao", "deploy"], ["dados lembrados", "memoria"], ["cambio importante", "quality"],
]);

function tokenize(text) {
  return text.split(/[^\p{L}\p{N}]+/u).filter((token) => token.length > 2 && !stopWords.has(token));
}

const stopWords = new Set(["the", "and", "for", "with", "what", "which", "when", "how", "should", "does", "must", "before", "from", "that", "this", "are", "into", "uma", "qual", "como", "antes", "para", "los", "las", "que", "was", "wird", "werden", "durfen", "welche"]);

function ratio(numerator, denominator) { return denominator === 0 ? 1 : numerator / denominator; }
function average(values) { return values.reduce((sum, value) => sum + value, 0) / values.length; }
function percent(value) { return `${(value * 100).toFixed(1)}%`; }

function printReport(report) {
  console.log("Nuzo optional semantics benchmark");
  console.log(`fixtures=${report.fixtures} quality_cases=${report.qualityCases} safety_cases=${report.safetyCases}`);
  for (const [mode, summary] of Object.entries(report.modes)) {
    const english = summary.groups.english;
    console.log(`mode=${mode}\ttop1=${percent(summary.top1)}\tmrr=${percent(summary.mrr)}\tnoise=${percent(summary.noise)}\tenglish_top1=${percent(english.top1)}\tenglish_mrr=${percent(english.mrr)}\tlatency_avg=${summary.averageLatencyMs.toFixed(2)}ms`);
  }
  for (const [mode, result] of Object.entries(report.safety)) console.log(`safety=${mode}\t${result.failures.length === 0 ? "pass" : "fail"}\t${result.failures.join("; ") || "all gates"}`);
  console.log(`zero_writes=${report.safetyGates.zeroWrites ? "pass" : "fail"} no_network=${report.safetyGates.noNetwork ? "pass" : "fail"}`);
  console.log(`decision=${report.decision.passes ? "pass" : "fail"} top1_lift=${percent(report.decision.top1Lift)} mrr_lift=${percent(report.decision.mrrLift)}`);
  for (const failure of report.decision.failures) console.log(`  - ${failure}`);
}

async function loadExternalProvider(path) {
  const absolutePath = isAbsolute(path) ? path : resolve(path);
  const module = await import(pathToFileURL(absolutePath).href);
  const provider = typeof module.createProvider === "function"
    ? await module.createProvider()
    : module.default;
  if (!provider?.descriptor || typeof provider.embedDocuments !== "function" || typeof provider.embedQuery !== "function") {
    throw new Error("--provider-module must export an embedding provider or createProvider()");
  }
  return provider;
}

function optionValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

function numberOption(name, fallback) {
  const value = optionValue(name);
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${name} requires a finite number`);
  return parsed;
}

await runBenchmark();
