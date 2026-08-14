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

class CountingSQLiteMemoryDatabase extends SQLiteMemoryDatabase {
  relationQueries = 0;
  memoryQueries = 0;

  async findById(id) {
    this.memoryQueries += 1;
    return super.findById(id);
  }

  async findByIds(ids) {
    this.memoryQueries += ids.length === 0 ? 0 : Math.ceil(new Set(ids).size / 500);
    return super.findByIds(ids);
  }

  async listRelations(input) {
    this.relationQueries += 1;
    return super.listRelations(input);
  }

  async listRelationsForMemoryIds(memoryIds, includeReverse = true) {
    this.relationQueries += 1;
    return super.listRelationsForMemoryIds(memoryIds, includeReverse);
  }
}

const jsonOutput = process.argv.includes("--json");
const iterations = 10;
const profiles = [
  { name: "sparse", relationsPerMemory: 1 },
  { name: "dense", relationsPerMemory: 10 },
];
const limits = [50, 200];
const reports = [];

for (const profile of profiles) {
  const temporaryStore = createTemporaryStore(`nuzo-relation-${profile.name}-`);
  const database = new CountingSQLiteMemoryDatabase({ path: temporaryStore.storePath });
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
    for (let index = 0; index < 200; index += 1) {
      memories.push(await service.remember({
        content: `Public synthetic relation benchmark memory ${profile.name} ${index}.`,
        kind: "note",
        scope: "project:relation-benchmark",
        tags: [profile.name, `fixture-${index}`],
        source: "benchmark:relations",
      }));
    }
    for (let sourceIndex = 0; sourceIndex < memories.length; sourceIndex += 1) {
      for (let offset = 1; offset <= profile.relationsPerMemory; offset += 1) {
        const targetIndex = (sourceIndex + offset) % memories.length;
        await service.relate({
          sourceMemoryId: memories[sourceIndex].id,
          targetMemoryId: memories[targetIndex].id,
          relation: "related_to",
          actor: "benchmark:relations",
        });
      }
    }

    for (const limit of limits) {
      const memoryIds = memories.slice(0, limit).map((memory) => memory.id);
      const baselineLatencies = [];
      const batchLatencies = [];
      let baselineQueries = 0;
      let batchQueries = 0;
      let baselineTotalQueries = 0;
      let batchTotalQueries = 0;
      let equivalent = true;

      for (let iteration = 0; iteration < iterations; iteration += 1) {
        database.relationQueries = 0;
        database.memoryQueries = 0;
        const baseline = await measureLatency(async () => new Map(await Promise.all(memoryIds.map(async (memoryId) => [
          memoryId,
          await service.relations({ memoryId, includeReverse: true, limit: 10 }),
        ]))));
        baselineQueries = database.relationQueries;
        baselineTotalQueries = database.relationQueries + database.memoryQueries;
        baselineLatencies.push(baseline.latencyMs);

        database.relationQueries = 0;
        database.memoryQueries = 0;
        const batch = await measureLatency(() => service.relationsBatch({
          memoryIds,
          includeReverse: true,
          limitPerMemory: 10,
        }));
        batchQueries = database.relationQueries;
        batchTotalQueries = database.relationQueries + database.memoryQueries;
        batchLatencies.push(batch.latencyMs);

        for (const memoryId of memoryIds) {
          const baselineIds = (baseline.value.get(memoryId) ?? []).map((relation) => relation.id);
          const batchIds = (batch.value.get(memoryId) ?? []).map((relation) => relation.id);
          if (JSON.stringify(baselineIds) !== JSON.stringify(batchIds)) {
            equivalent = false;
          }
        }
      }

      reports.push({
        profile: profile.name,
        memoryLimit: limit,
        relationsPerMemory: profile.relationsPerMemory,
        iterations,
        baselineRelationQueries: baselineQueries,
        batchRelationQueries: batchQueries,
        baselineTotalQueries,
        batchTotalQueries,
        queryReduction: baselineQueries / batchQueries,
        baselineLatencyMs: summarize(baselineLatencies),
        batchLatencyMs: summarize(batchLatencies),
        equivalent,
      });
    }
  } finally {
    database.close();
    cleanupTemporaryStore(temporaryStore.root);
  }
}

const passed = reports.every((report) => (
  report.equivalent &&
  report.baselineRelationQueries === report.memoryLimit &&
  report.batchRelationQueries === 1
));
const output = { passed, reports };
if (jsonOutput) {
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
} else {
  for (const report of reports) {
    process.stdout.write([
      `${report.profile} limit=${report.memoryLimit}`,
      `queries=${report.baselineRelationQueries}->${report.batchRelationQueries}`,
      `total=${report.baselineTotalQueries}->${report.batchTotalQueries}`,
      `reduction=${report.queryReduction.toFixed(0)}x`,
      `p50=${report.baselineLatencyMs.p50.toFixed(2)}ms->${report.batchLatencyMs.p50.toFixed(2)}ms`,
      `p95=${report.baselineLatencyMs.p95.toFixed(2)}ms->${report.batchLatencyMs.p95.toFixed(2)}ms`,
      `equivalent=${String(report.equivalent)}`,
    ].join(" ") + "\n");
  }
  process.stdout.write(`relation hydration benchmark: ${passed ? "PASS" : "FAIL"}\n`);
}
if (!passed) process.exitCode = 1;

function summarize(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return {
    min: sorted[0],
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    max: sorted.at(-1),
  };
}

function percentile(sorted, percentileValue) {
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * percentileValue) - 1)];
}
