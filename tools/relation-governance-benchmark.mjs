#!/usr/bin/env node
import { isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  cleanupTemporaryStore,
  createTemporaryStore,
  measureLatency,
  optionValue,
} from "./benchmark-shared.mjs";

const coreModulePath = optionValue("--core-module", { description: "module path" });
const coreModuleSpecifier = coreModulePath === undefined
  ? new URL("../packages/core/dist/index.js", import.meta.url).href
  : pathToFileURL(isAbsolute(coreModulePath) ? coreModulePath : resolve(coreModulePath)).href;
const {
  createMemoryService,
  DefaultPolicyEngine,
  RandomIdGenerator,
  RegexSecretScanner,
  SQLiteMemoryDatabase,
  SystemClock,
} = await import(coreModuleSpecifier);

const jsonOutput = process.argv.includes("--json");
const iterations = 10;
const profiles = [
  { name: "sparse", memoryCount: 50, relationsPerMemory: 0 },
  { name: "relation-dense", memoryCount: 200, relationsPerMemory: 10 },
];
const reports = [];

for (const profile of profiles) {
  const temporaryStore = createTemporaryStore(`nuzo-governance-${profile.name}-`);
  const database = new SQLiteMemoryDatabase({ path: temporaryStore.storePath });
  try {
    const service = createMemoryService({
      store: database,
      searchIndex: database,
      auditLog: database,
      clock: new SystemClock(),
      ids: new RandomIdGenerator(),
      policy: new DefaultPolicyEngine(new RegexSecretScanner()),
      transactions: database,
    });
    const memories = [];
    for (let index = 0; index < profile.memoryCount; index += 1) {
      const pair = Math.floor(index / 2);
      const token = `token${pair.toString(36).padStart(4, "0")}`;
      const content = index % 2 === 0
        ? `${token} baseline`
        : `${token} now`;
      memories.push(await service.remember({
        content,
        kind: "project_decision",
        scope: "project:governance-benchmark",
        tags: [`pair-${pair}`],
        source: "benchmark:governance",
      }));
    }
    for (let sourceIndex = 0; sourceIndex < memories.length; sourceIndex += 1) {
      for (let offset = 1; offset <= profile.relationsPerMemory; offset += 1) {
        await service.relate({
          sourceMemoryId: memories[sourceIndex].id,
          targetMemoryId: memories[(sourceIndex + offset) % memories.length].id,
          relation: "related_to",
          actor: "benchmark:governance",
        });
      }
    }

    const beforeCounts = storeCounts(database);
    const latencies = [];
    let canonicalOutput = null;
    let stableOrdering = true;
    let contentFree = true;
    for (let iteration = 0; iteration < iterations; iteration += 1) {
      const measured = await measureLatency(() => service.reviewRelations({
        scope: "project:governance-benchmark",
        limit: 200,
      }));
      latencies.push(measured.latencyMs);
      const serialized = JSON.stringify(measured.value);
      if (canonicalOutput === null) canonicalOutput = serialized;
      if (serialized !== canonicalOutput) stableOrdering = false;
      if (/baseline|replacement/u.test(serialized)) contentFree = false;
    }
    const afterCounts = storeCounts(database);
    const sortedLatencies = [...latencies].sort((left, right) => left - right);
    reports.push({
      profile: profile.name,
      memoryCount: profile.memoryCount,
      explicitRelationCount: beforeCounts.memory_relations,
      iterations,
      candidateCount: JSON.parse(canonicalOutput).candidates.length,
      stableOrdering,
      contentFree,
      stateUnchanged: JSON.stringify(beforeCounts) === JSON.stringify(afterCounts),
      latencyMs: {
        min: sortedLatencies[0],
        p50: percentile(sortedLatencies, 0.5),
        p95: percentile(sortedLatencies, 0.95),
        max: sortedLatencies.at(-1),
      },
    });
  } finally {
    database.close();
    cleanupTemporaryStore(temporaryStore.root);
  }
}

const passed = reports.every((report) => (
  report.candidateCount === report.memoryCount / 2 &&
  report.stableOrdering &&
  report.contentFree &&
  report.stateUnchanged &&
  report.latencyMs.p95 < 1_000
));
if (jsonOutput) {
  process.stdout.write(`${JSON.stringify({ passed, reports }, null, 2)}\n`);
} else {
  for (const report of reports) {
    process.stdout.write([
      report.profile,
      `memories=${report.memoryCount}`,
      `relations=${report.explicitRelationCount}`,
      `candidates=${report.candidateCount}`,
      `p50=${report.latencyMs.p50.toFixed(2)}ms`,
      `p95=${report.latencyMs.p95.toFixed(2)}ms`,
      `stable=${String(report.stableOrdering)}`,
      `content_free=${String(report.contentFree)}`,
      `unchanged=${String(report.stateUnchanged)}`,
    ].join(" ") + "\n");
  }
  process.stdout.write(`relation governance benchmark: ${passed ? "PASS" : "FAIL"}\n`);
}
if (!passed) process.exitCode = 1;

function storeCounts(database) {
  return Object.fromEntries(["memories", "memory_relations", "memory_events"].map((table) => [
    table,
    database.database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count,
  ]));
}

function percentile(sorted, percentileValue) {
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * percentileValue) - 1)];
}
