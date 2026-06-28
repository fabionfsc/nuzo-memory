#!/usr/bin/env node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import {
  createMemoryService,
  DefaultPolicyEngine,
  RegexSecretScanner,
  SQLiteMemoryDatabase,
  SystemClock,
} from "../packages/core/dist/index.js";

const keepStore = process.argv.includes("--keep");
const jsonOutput = process.argv.includes("--json");
const tmpRoot = mkdtempSync(join(tmpdir(), "nuzo-recall-benchmark-"));
const storePath = join(tmpRoot, "memories.sqlite");

const fixtures = [
  {
    key: "cloudflare-routing",
    content: "Cloudflare routing changes use the local reverse proxy workflow before DNS updates.",
    kind: "project_decision",
    scope: "project:nuzo",
    tags: ["cloudflare", "routing", "workflow"],
  },
  {
    key: "npm-provenance",
    content: "Publish npm releases through trusted publishing with SLSA provenance.",
    kind: "project_decision",
    scope: "project:nuzo",
    tags: ["npm", "release", "provenance"],
  },
  {
    key: "pt-deploy",
    content: "A implantação em produção exige revisão explícita antes do deploy.",
    kind: "instruction",
    scope: "project:nuzo",
    tags: ["deploy", "pt-br", "producao"],
  },
  {
    key: "unicode-memory",
    content: "A memória local deve permanecer auditável e portátil entre agentes.",
    kind: "instruction",
    scope: "project:nuzo",
    tags: ["memoria", "auditavel", "unicode"],
  },
  {
    key: "sqlite-concurrency",
    content: "SQLite writes use optimistic revisions and transactional audit events.",
    kind: "fact",
    scope: "project:nuzo",
    tags: ["sqlite", "concurrency", "storage"],
  },
  {
    key: "security-credentials",
    content: "Never store credentials, access tokens, cookies, or private keys in memory.",
    kind: "instruction",
    scope: "project:nuzo",
    tags: ["security", "credentials", "privacy"],
  },
  {
    key: "docs-validation",
    content: "Run MkDocs strict validation before merging documentation changes.",
    kind: "instruction",
    scope: "project:nuzo",
    tags: ["docs", "mkdocs", "workflow"],
  },
  {
    key: "git-squash",
    content: "Use a focused branch and squash merge with a Conventional Commit subject.",
    kind: "instruction",
    scope: "project:nuzo",
    tags: ["git", "pull-request", "workflow"],
  },
  {
    key: "node-matrix",
    content: "Run package validation on Node.js 22 and Node.js 24 before release.",
    kind: "instruction",
    scope: "project:nuzo",
    tags: ["nodejs", "testing", "release"],
  },
  {
    key: "error-handling",
    content: "Unexpected failures must preserve the original cause and return a concise public error.",
    kind: "instruction",
    scope: "project:nuzo",
    tags: ["errors", "reliability", "workflow"],
  },
  {
    key: "accessibility",
    content: "Interactive controls follow keyboard navigation and WCAG contrast guidance.",
    kind: "instruction",
    scope: "project:nuzo",
    tags: ["accessibility", "frontend", "wcag"],
  },
  {
    key: "backup-export",
    content: "Memory backups use the Nuzo JSON export format before destructive maintenance.",
    kind: "instruction",
    scope: "project:nuzo",
    tags: ["backup", "export", "maintenance"],
  },
  {
    key: "dependency-audit",
    content: "Dependency changes require npm audit and signature verification during release review.",
    kind: "instruction",
    scope: "project:nuzo",
    tags: ["dependencies", "audit", "release"],
  },
  {
    key: "response-style",
    content: "The user prefers concise answers with explicit tradeoffs.",
    kind: "preference",
    scope: "user:default",
    tags: ["communication", "preference", "style"],
  },
  {
    key: "timezone",
    content: "User-facing schedules use the America/Sao_Paulo timezone.",
    kind: "fact",
    scope: "user:default",
    tags: ["timezone", "scheduling", "user"],
  },
  {
    key: "api-errors",
    content: "API errors use structured JSON with stable machine-readable codes.",
    kind: "project_decision",
    scope: "project:nuzo",
    tags: ["api", "errors", "json"],
  },
  {
    key: "go-test",
    content: "Go changes run go test ./... before merge.",
    kind: "instruction",
    scope: "project:nuzo",
    tags: ["golang", "testing", "workflow"],
  },
  {
    key: "german-secrets",
    content: "Geheimnisse und Zugangsdaten dürfen niemals im Repository gespeichert werden.",
    kind: "instruction",
    scope: "project:nuzo",
    tags: ["language-de", "security", "secrets"],
  },
  {
    key: "french-validation",
    content: "Avant la fusion, exécuter les tests, le lint et la validation de la documentation.",
    kind: "instruction",
    scope: "project:nuzo",
    tags: ["language-fr", "quality", "workflow"],
  },
  {
    key: "spanish-change",
    content: "Cada cambio importante debe incluir pruebas automatizadas y documentación actualizada.",
    kind: "instruction",
    scope: "project:nuzo",
    tags: ["language-es", "quality", "testing"],
  },
  {
    key: "russian-logs",
    content: "Журналы не должны содержать токены, пароли или персональные данные.",
    kind: "instruction",
    scope: "project:nuzo",
    tags: ["language-ru", "logging", "privacy"],
  },
  {
    key: "japanese-style",
    content: "日本語 の 応答 は 簡潔 で 明確 に する.",
    kind: "preference",
    scope: "project:nuzo",
    tags: ["japanese", "language-ja", "style"],
  },
  {
    key: "korean-style",
    content: "한국어 응답은 간결하고 명확하게 작성한다.",
    kind: "preference",
    scope: "project:nuzo",
    tags: ["korean", "language-ko", "style"],
  },
  {
    key: "chinese-style",
    content: "中文 回复 应该 简洁 清晰 并说明 关键 取舍.",
    kind: "preference",
    scope: "project:nuzo",
    tags: ["chinese", "language-zh", "style"],
  },
  {
    key: "arabic-review",
    content: "يجب مراجعة التغييرات وتشغيل الاختبارات قبل الدمج.",
    kind: "instruction",
    scope: "project:nuzo",
    tags: ["language-ar", "review", "testing"],
  },
  {
    key: "hindi-deploy",
    content: "परिनियोजन से पहले परीक्षण और स्पष्ट अनुमोदन आवश्यक है।",
    kind: "instruction",
    scope: "project:nuzo",
    tags: ["deploy", "language-hi", "testing"],
  },
  {
    key: "dutch-database",
    content: "Databasewijzigingen moeten achterwaarts compatibel en controleerbaar zijn.",
    kind: "instruction",
    scope: "project:nuzo",
    tags: ["database", "language-nl", "migrations"],
  },
  {
    key: "polish-security",
    content: "Zmiany bezpieczeństwa wymagają testów regresji i jawnego przeglądu.",
    kind: "instruction",
    scope: "project:nuzo",
    tags: ["language-pl", "security", "testing"],
  },
  {
    key: "turkish-deploy",
    content: "Dağıtımdan önce testler çalıştırılmalı ve değişiklik onaylanmalıdır.",
    kind: "instruction",
    scope: "project:nuzo",
    tags: ["deploy", "language-tr", "testing"],
  },
  {
    key: "other-project-routing",
    content: "The other project uses Kubernetes ingress routing for production traffic.",
    kind: "project_decision",
    scope: "project:other",
    tags: ["routing", "kubernetes", "other-project"],
  },
  {
    key: "archived-context",
    content: "Archived deployment notes must not appear in active recall.",
    kind: "note",
    scope: "project:nuzo",
    tags: ["deploy", "archived"],
    archived: true,
  },
  ...Array.from({ length: 12 }, (_, index) => ({
    key: `bounded-${index}`,
    content: `Bounded recall fixture ${index} exercises result limits for benchmarktopic queries.`,
    kind: "note",
    scope: "project:nuzo",
    tags: ["benchmarktopic", "bounded", `fixture-${index}`],
  })),
  ...Array.from({ length: 20 }, (_, index) => ({
    key: `noise-${index}`,
    content: `Synthetic noise memory ${index} covers unrelated local tool context and generic agent notes.`,
    kind: "note",
    scope: "project:nuzo",
    tags: ["noise", `noise-${index}`],
  })),
  ...Array.from({ length: 40 }, (_, index) => ({
    key: `medium-noise-${index}`,
    content: `Medium store filler ${index} includes generic workflow, testing, documentation, release, and storage vocabulary without target-specific facts.`,
    kind: "note",
    scope: "project:nuzo",
    tags: ["workflow", "testing", "docs", "release", `medium-${index}`],
  })),
];

const cases = [
  {
    label: "English project topic",
    group: "english",
    query: "Cloudflare routing task",
    scope: "project:nuzo",
    limit: 5,
    expectedTop: "cloudflare-routing",
    expectedIncluded: ["cloudflare-routing"],
    expectedExcluded: ["other-project-routing"],
  },
  {
    label: "npm provenance realistic prompt",
    group: "english",
    query: "How should the npm release provenance be published?",
    scope: "project:nuzo",
    limit: 5,
    expectedTop: "npm-provenance",
    expectedIncluded: ["npm-provenance"],
    expectedOnly: ["npm-provenance"],
  },
  {
    label: "Portuguese deployment",
    group: "pt_unicode",
    query: "implantação produção revisão",
    scope: "project:nuzo",
    limit: 5,
    expectedTop: "pt-deploy",
    expectedIncluded: ["pt-deploy"],
    expectedOnly: ["pt-deploy"],
    expectedExcluded: ["archived-context"],
  },
  {
    label: "Unicode accented recall",
    group: "pt_unicode",
    query: "memória auditável portátil",
    scope: "project:nuzo",
    limit: 5,
    expectedTop: "unicode-memory",
    expectedIncluded: ["unicode-memory"],
    expectedOnly: ["unicode-memory"],
  },
  {
    label: "Exact topical tag weighting",
    group: "english",
    query: "benchmarktopic fixtures",
    scope: "project:nuzo",
    limit: 3,
    expectedIncludedPrefix: "bounded-",
    expectedCount: 3,
  },
  {
    label: "Project scope excludes other project",
    group: "scope_noise",
    query: "Kubernetes ingress routing",
    scope: "project:nuzo",
    limit: 5,
    expectedExcluded: ["other-project-routing"],
    expectedCount: 0,
  },
  {
    label: "API convention host-like prompt",
    group: "english",
    query: "Which API response convention applies?",
    scope: "project:nuzo",
    limit: 5,
    expectedTop: "api-errors",
    expectedIncluded: ["api-errors"],
    expectedOnly: ["api-errors"],
  },
  {
    label: "Go validation host-like prompt",
    group: "english",
    query: "Which Go command validates all packages?",
    scope: "project:nuzo",
    limit: 5,
    expectedTop: "go-test",
    expectedIncluded: ["go-test"],
    expectedOnly: ["go-test"],
  },
  {
    label: "Security credentials English prompt",
    group: "english",
    query: "What is the security rule for credentials?",
    scope: "project:nuzo",
    limit: 5,
    expectedTop: "security-credentials",
    expectedIncluded: ["security-credentials"],
    expectedOnly: ["security-credentials"],
  },
  {
    label: "Documentation validation English prompt",
    group: "english",
    query: "Validate the MkDocs documentation before merge.",
    scope: "project:nuzo",
    limit: 5,
    expectedTop: "docs-validation",
    expectedIncluded: ["docs-validation"],
    expectedOnly: ["docs-validation"],
  },
  {
    label: "Git workflow English prompt",
    group: "english",
    query: "How should a pull request be merged?",
    scope: "project:nuzo",
    limit: 5,
    expectedTop: "git-squash",
    expectedIncluded: ["git-squash"],
    expectedOnly: ["git-squash"],
  },
  {
    label: "Node matrix English prompt",
    group: "english",
    query: "Which Node versions validate package releases?",
    scope: "project:nuzo",
    limit: 5,
    expectedTop: "node-matrix",
    expectedIncluded: ["node-matrix"],
    expectedOnly: ["node-matrix"],
  },
  {
    label: "Error handling English prompt",
    group: "english",
    query: "How should unexpected failures be handled?",
    scope: "project:nuzo",
    limit: 5,
    expectedTop: "error-handling",
    expectedIncluded: ["error-handling"],
    expectedOnly: ["error-handling"],
  },
  {
    label: "Accessibility English prompt",
    group: "english",
    query: "What accessibility baseline applies to the interface?",
    scope: "project:nuzo",
    limit: 5,
    expectedTop: "accessibility",
    expectedIncluded: ["accessibility"],
    expectedOnly: ["accessibility"],
  },
  {
    label: "Backup export English prompt",
    group: "english",
    query: "How should memory backups be exported before maintenance?",
    scope: "project:nuzo",
    limit: 5,
    expectedTop: "backup-export",
    expectedIncluded: ["backup-export"],
    expectedOnly: ["backup-export"],
  },
  {
    label: "Dependency audit English prompt",
    group: "english",
    query: "What review is required for dependency changes?",
    scope: "project:nuzo",
    limit: 5,
    expectedTop: "dependency-audit",
    expectedIncluded: ["dependency-audit"],
    expectedOnly: ["dependency-audit"],
  },
  {
    label: "German secrets multilingual prompt",
    group: "multilingual",
    query: "Welche Regel gilt für Geheimnisse?",
    scope: "project:nuzo",
    limit: 5,
    expectedTop: "german-secrets",
    expectedIncluded: ["german-secrets"],
    expectedOnly: ["german-secrets"],
  },
  {
    label: "French validation multilingual prompt",
    group: "multilingual",
    query: "Quelle validation faut-il exécuter avant la fusion ?",
    scope: "project:nuzo",
    limit: 5,
    expectedTop: "french-validation",
    expectedIncluded: ["french-validation"],
    expectedOnly: ["french-validation"],
  },
  {
    label: "Spanish change multilingual prompt",
    group: "multilingual",
    query: "¿Qué debe incluir cada cambio importante?",
    scope: "project:nuzo",
    limit: 5,
    expectedTop: "spanish-change",
    expectedIncluded: ["spanish-change"],
    expectedOnly: ["spanish-change"],
  },
  {
    label: "Russian logs multilingual prompt",
    group: "multilingual",
    query: "Что журналы не должны содержать?",
    scope: "project:nuzo",
    limit: 5,
    expectedTop: "russian-logs",
    expectedIncluded: ["russian-logs"],
    expectedOnly: ["russian-logs"],
  },
  {
    label: "Japanese style multilingual prompt",
    group: "multilingual",
    query: "日本語 の 応答 ルール は 何 です か",
    scope: "project:nuzo",
    limit: 5,
    expectedTop: "japanese-style",
    expectedIncluded: ["japanese-style"],
    expectedOnly: ["japanese-style"],
  },
  {
    label: "Korean style multilingual prompt",
    group: "multilingual",
    query: "한국어 응답 규칙은 무엇입니까",
    scope: "project:nuzo",
    limit: 5,
    expectedTop: "korean-style",
    expectedIncluded: ["korean-style"],
    expectedOnly: ["korean-style"],
  },
  {
    label: "Chinese style multilingual prompt",
    group: "multilingual",
    query: "中文 回复 应该 遵循 什么 规则",
    scope: "project:nuzo",
    limit: 5,
    expectedTop: "chinese-style",
    expectedIncluded: ["chinese-style"],
    expectedOnly: ["chinese-style"],
  },
  {
    label: "Arabic review multilingual prompt",
    group: "multilingual",
    query: "ما هي قاعدة مراجعة التغييرات قبل الدمج",
    scope: "project:nuzo",
    limit: 5,
    expectedTop: "arabic-review",
    expectedIncluded: ["arabic-review"],
    expectedOnly: ["arabic-review"],
  },
  {
    label: "Hindi deployment multilingual prompt",
    group: "multilingual",
    query: "परिनियोजन से पहले कौन सा नियम लागू होता है",
    scope: "project:nuzo",
    limit: 5,
    expectedTop: "hindi-deploy",
    expectedIncluded: ["hindi-deploy"],
    expectedOnly: ["hindi-deploy"],
  },
  {
    label: "Dutch database multilingual prompt",
    group: "multilingual",
    query: "Welke regel geldt voor databasewijzigingen?",
    scope: "project:nuzo",
    limit: 5,
    expectedTop: "dutch-database",
    expectedIncluded: ["dutch-database"],
    expectedOnly: ["dutch-database"],
  },
  {
    label: "Polish security multilingual prompt",
    group: "multilingual",
    query: "Jaka zasada dotyczy zmian bezpieczeństwa?",
    scope: "project:nuzo",
    limit: 5,
    expectedTop: "polish-security",
    expectedIncluded: ["polish-security"],
    expectedOnly: ["polish-security"],
  },
  {
    label: "Turkish deployment multilingual prompt",
    group: "multilingual",
    query: "Dağıtımdan önce hangi kontrol yapılmalıdır?",
    scope: "project:nuzo",
    limit: 5,
    expectedTop: "turkish-deploy",
    expectedIncluded: ["turkish-deploy"],
    expectedOnly: ["turkish-deploy"],
  },
  {
    label: "Global memory included only when requested",
    group: "scope_noise",
    query: "concise answers tradeoffs",
    scope: "project:nuzo",
    includeGlobal: true,
    limit: 5,
    expectedTop: "response-style",
    expectedIncluded: ["response-style"],
    expectedOnly: ["response-style"],
  },
  {
    label: "Global memory excluded by default",
    group: "scope_noise",
    query: "concise answers tradeoffs",
    scope: "project:nuzo",
    limit: 5,
    expectedExcluded: ["response-style"],
  },
  {
    label: "No-match query stays quiet",
    group: "scope_noise",
    query: "python django celery",
    scope: "project:nuzo",
    limit: 5,
    expectedCount: 0,
  },
];

const thresholds = {
  failures: 0,
  minTop1Rate: 1,
  minExpectedRecallRate: 1,
  maxAverageLatencyMs: 25,
  maxLatencyMs: 100,
  reasonCoverageRate: 1,
  maxNoiseRate: 0,
  groups: {
    english: {
      minCases: 12,
      minTop1Rate: 1,
      minExpectedRecallRate: 1,
      maxNoiseRate: 0,
    },
    pt_unicode: {
      minCases: 2,
      minExpectedRecallRate: 1,
    },
    multilingual: {
      minCases: 12,
      minExpectedRecallRate: 1,
    },
    scope_noise: {
      minCases: 4,
      maxNoiseRate: 0,
    },
  },
};

class BenchmarkIds {
  memoryCounter = 0;
  eventCounter = 0;

  memoryId() {
    this.memoryCounter += 1;
    return `mem_bench_${String(this.memoryCounter).padStart(4, "0")}`;
  }

  eventId() {
    this.eventCounter += 1;
    return `evt_bench_${String(this.eventCounter).padStart(4, "0")}`;
  }
}

const database = new SQLiteMemoryDatabase({ path: storePath });

try {
  const service = createMemoryService({
    store: database,
    searchIndex: database,
    auditLog: database,
    clock: new SystemClock(),
    ids: new BenchmarkIds(),
    policy: new DefaultPolicyEngine(new RegexSecretScanner()),
    transactions: database,
  });

  const memoriesByKey = new Map();
  for (const fixture of fixtures) {
    const memory = await service.remember({
      content: fixture.content,
      kind: fixture.kind,
      scope: fixture.scope,
      tags: fixture.tags,
      source: "benchmark:recall",
    });
    memoriesByKey.set(fixture.key, memory);
    if (fixture.archived === true) {
      await service.forget({
        id: memory.id,
        actor: "benchmark:recall",
        mode: "archive",
        reason: "Archived fixture validates recall exclusion.",
      });
    }
  }

  const results = [];
  for (const benchmarkCase of cases) {
    const started = performance.now();
    const recalled = await service.recall({
      query: benchmarkCase.query,
      scope: benchmarkCase.scope,
      includeGlobal: benchmarkCase.includeGlobal === true,
      limit: benchmarkCase.limit,
      recordUsage: false,
    });
    const latencyMs = performance.now() - started;
    const actualKeys = recalled.map((result) => keyForMemory(result.memory.id, memoriesByKey));
    const failures = evaluateCase(benchmarkCase, actualKeys, recalled);
    results.push({
      label: benchmarkCase.label,
      group: benchmarkCase.group,
      query: benchmarkCase.query,
      latencyMs,
      resultCount: recalled.length,
      actualKeys,
      top1Hit: benchmarkCase.expectedTop === undefined || actualKeys[0] === benchmarkCase.expectedTop,
      expectedRecallHit: expectedRecallHit(benchmarkCase, actualKeys),
      noiseCount: noiseKeys(benchmarkCase, actualKeys).length,
      reasonCoverage: recalled.every((result) => result.reason.trim().length > 0),
      failures,
    });
  }

  const summary = summarize(results);
  const report = {
    benchmark: "nuzo-recall-quality",
    version: 1,
    store: keepStore ? storePath : "temporary",
    fixtures: fixtures.length,
    cases: cases.length,
    thresholds,
    summary,
    results,
  };

  if (jsonOutput) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printHumanReport(report);
  }

  if (!passesThresholds(summary, thresholds)) {
    process.exitCode = 1;
  }
} finally {
  database.close();
  if (!keepStore) {
    rmSync(tmpRoot, { recursive: true, force: true });
  } else if (!jsonOutput) {
    console.log(`kept benchmark store: ${storePath}`);
  }
}

function evaluateCase(benchmarkCase, actualKeys, recalled) {
  const failures = [];
  if (benchmarkCase.expectedTop !== undefined && actualKeys[0] !== benchmarkCase.expectedTop) {
    failures.push(`expected top ${benchmarkCase.expectedTop}, got ${actualKeys[0] ?? "none"}`);
  }
  for (const expected of benchmarkCase.expectedIncluded ?? []) {
    if (!actualKeys.includes(expected)) {
      failures.push(`missing expected result ${expected}`);
    }
  }
  for (const excluded of benchmarkCase.expectedExcluded ?? []) {
    if (actualKeys.includes(excluded)) {
      failures.push(`included excluded result ${excluded}`);
    }
  }
  if (benchmarkCase.expectedIncludedPrefix !== undefined && !actualKeys.every((key) => key.startsWith(benchmarkCase.expectedIncludedPrefix))) {
    failures.push(`expected every result to start with ${benchmarkCase.expectedIncludedPrefix}`);
  }
  const unexpected = noiseKeys(benchmarkCase, actualKeys);
  if (unexpected.length > 0) {
    failures.push(`unexpected noisy result(s): ${unexpected.join(", ")}`);
  }
  if (benchmarkCase.expectedCount !== undefined && recalled.length !== benchmarkCase.expectedCount) {
    failures.push(`expected ${benchmarkCase.expectedCount} result(s), got ${recalled.length}`);
  }
  if (!recalled.every((result) => result.reason.trim().length > 0)) {
    failures.push("one or more results did not include a ranking reason");
  }
  return failures;
}

function noiseKeys(benchmarkCase, actualKeys) {
  if (benchmarkCase.expectedOnly !== undefined) {
    return actualKeys.filter((key) => !benchmarkCase.expectedOnly.includes(key));
  }
  if (benchmarkCase.expectedIncludedPrefix !== undefined) {
    return actualKeys.filter((key) => !key.startsWith(benchmarkCase.expectedIncludedPrefix));
  }
  if (benchmarkCase.expectedCount === 0) {
    return actualKeys;
  }
  return [];
}

function expectedRecallHit(benchmarkCase, actualKeys) {
  if ((benchmarkCase.expectedIncluded ?? []).some((key) => !actualKeys.includes(key))) {
    return false;
  }
  if (benchmarkCase.expectedIncludedPrefix !== undefined && !actualKeys.every((key) => key.startsWith(benchmarkCase.expectedIncludedPrefix))) {
    return false;
  }
  if (benchmarkCase.expectedCount !== undefined && actualKeys.length !== benchmarkCase.expectedCount) {
    return false;
  }
  return true;
}

function summarize(results) {
  const latencies = results.map((result) => result.latencyMs);
  const failures = results.flatMap((result) => result.failures.map((failure) => `${result.label}: ${failure}`));
  const groups = Object.fromEntries(
    [...new Set(results.map((result) => result.group))].sort().map((group) => [
      group,
      summarizeGroup(results.filter((result) => result.group === group)),
    ]),
  );
  return {
    failures,
    top1Rate: ratio(results.filter((result) => result.top1Hit).length, results.length),
    expectedRecallRate: ratio(results.filter((result) => result.expectedRecallHit).length, results.length),
    reasonCoverageRate: ratio(results.filter((result) => result.reasonCoverage).length, results.length),
    noiseRate: ratio(results.reduce((sum, result) => sum + result.noiseCount, 0), results.reduce((sum, result) => sum + result.resultCount, 0)),
    averageLatencyMs: average(latencies),
    maxLatencyMs: Math.max(...latencies),
    groups,
  };
}

function summarizeGroup(results) {
  return {
    cases: results.length,
    top1Rate: ratio(results.filter((result) => result.top1Hit).length, results.length),
    expectedRecallRate: ratio(results.filter((result) => result.expectedRecallHit).length, results.length),
    noiseRate: ratio(results.reduce((sum, result) => sum + result.noiseCount, 0), results.reduce((sum, result) => sum + result.resultCount, 0)),
  };
}

function passesThresholds(summary, limits) {
  const groupsPass = Object.entries(limits.groups).every(([group, groupLimits]) => {
    const groupSummary = summary.groups[group] ?? { cases: 0, top1Rate: 0, expectedRecallRate: 0, noiseRate: 1 };
    return groupSummary.cases >= groupLimits.minCases &&
      (groupLimits.minTop1Rate === undefined || groupSummary.top1Rate >= groupLimits.minTop1Rate) &&
      (groupLimits.minExpectedRecallRate === undefined || groupSummary.expectedRecallRate >= groupLimits.minExpectedRecallRate) &&
      (groupLimits.maxNoiseRate === undefined || groupSummary.noiseRate <= groupLimits.maxNoiseRate);
  });

  return summary.failures.length === limits.failures &&
    summary.top1Rate >= limits.minTop1Rate &&
    summary.expectedRecallRate >= limits.minExpectedRecallRate &&
    summary.reasonCoverageRate >= limits.reasonCoverageRate &&
    summary.noiseRate <= limits.maxNoiseRate &&
    summary.averageLatencyMs <= limits.maxAverageLatencyMs &&
    summary.maxLatencyMs <= limits.maxLatencyMs &&
    groupsPass;
}

function printHumanReport(report) {
  console.log("Nuzo recall benchmark");
  console.log(`fixtures=${report.fixtures} cases=${report.cases}`);
  console.log(`top1=${formatPercent(report.summary.top1Rate)} expected_recall=${formatPercent(report.summary.expectedRecallRate)} reasons=${formatPercent(report.summary.reasonCoverageRate)}`);
  console.log(`noise=${formatPercent(report.summary.noiseRate)}`);
  console.log(`latency_avg=${report.summary.averageLatencyMs.toFixed(2)}ms latency_max=${report.summary.maxLatencyMs.toFixed(2)}ms`);
  for (const [group, summary] of Object.entries(report.summary.groups)) {
    console.log(`group=${group}\tcases=${summary.cases}\ttop1=${formatPercent(summary.top1Rate)}\texpected_recall=${formatPercent(summary.expectedRecallRate)}\tnoise=${formatPercent(summary.noiseRate)}`);
  }
  for (const result of report.results) {
    const status = result.failures.length === 0 ? "pass" : "fail";
    console.log(`${status}\t${result.group}\t${result.label}\t${result.latencyMs.toFixed(2)}ms\t${result.actualKeys.join(", ") || "none"}`);
    for (const failure of result.failures) {
      console.log(`  - ${failure}`);
    }
  }
}

function keyForMemory(id, memoriesByKey) {
  for (const [key, memory] of memoriesByKey) {
    if (memory.id === id) {
      return key;
    }
  }
  return `unknown:${id}`;
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function ratio(numerator, denominator) {
  return denominator === 0 ? 1 : numerator / denominator;
}

function formatPercent(value) {
  return `${(value * 100).toFixed(1)}%`;
}
