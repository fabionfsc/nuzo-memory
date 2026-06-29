#!/usr/bin/env node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";

const coreModulePath = optionValue("--core-module");
const expectation = optionValue("--expect") ?? "baseline";
if (!new Set(["baseline", "bounded"]).has(expectation)) {
  throw new Error("--expect must be baseline or bounded");
}

const coreModuleSpecifier = coreModulePath === undefined
  ? new URL("../packages/core/dist/index.js", import.meta.url).href
  : pathToFileURL(isAbsolute(coreModulePath) ? coreModulePath : resolve(coreModulePath)).href;
const {
  createMemoryService,
  DefaultPolicyEngine,
  RegexSecretScanner,
  SQLiteMemoryDatabase,
  SystemClock,
} = await import(coreModuleSpecifier);

const keepStore = process.argv.includes("--keep");
const jsonOutput = process.argv.includes("--json");
const tmpRoot = mkdtempSync(join(tmpdir(), "nuzo-capture-benchmark-"));
const storePath = join(tmpRoot, "memories.sqlite");

const fixtures = [
  fixture("response-concise", "The user prefers concise final answers with explicit tradeoffs.", "preference", "user:default", ["communication", "style"]),
  fixture("dark-theme", "The user prefers dark theme for development tools.", "preference", "user:default", ["interface", "theme"]),
  fixture("timezone-sao-paulo", "User-facing schedules use the America/Sao_Paulo timezone.", "fact", "user:default", ["scheduling", "timezone"]),
  fixture("goal-email", "Send a completion email after each finished engineering goal.", "instruction", "user:default", ["communication", "email", "workflow"]),
  fixture("npm-provenance", "Publish npm packages through trusted publishing with provenance.", "project_decision", "project:nuzo", ["npm", "provenance", "release"]),
  fixture("sqlite-storage", "Nuzo stores canonical memory locally in SQLite.", "project_decision", "project:nuzo", ["sqlite", "storage"]),
  fixture("docs-validation", "Run MkDocs strict validation before merging documentation changes.", "instruction", "project:nuzo", ["docs", "mkdocs", "workflow"]),
  fixture("api-errors", "API errors use structured JSON with stable machine-readable codes.", "project_decision", "project:nuzo", ["api", "errors", "json"]),
  fixture("portable-export", "Create a portable JSON memory export before destructive maintenance.", "instruction", "project:nuzo", ["export", "recovery", "maintenance"]),
  fixture("accessibility", "Interactive controls follow keyboard navigation and WCAG contrast guidance.", "instruction", "project:nuzo", ["accessibility", "frontend", "wcag"]),
  fixture("dependency-audit", "Dependency changes require an audit and signature verification.", "instruction", "project:nuzo", ["dependencies", "security", "workflow"]),
  fixture("cloudflare-routing", "Cloudflare routing changes use the local reverse proxy before DNS updates.", "project_decision", "project:nuzo", ["cloudflare", "routing"]),
  fixture("logging-redaction", "Application logs must redact tokens, passwords, and personal data.", "instruction", "project:nuzo", ["logging", "privacy", "security"]),
  fixture("release-branch", "Release changes use a focused branch and squash merge.", "instruction", "project:nuzo", ["git", "release", "workflow"]),
  fixture("pt-deploy", "A implantação em produção exige revisão explícita antes do deploy.", "instruction", "project:nuzo", ["deploy", "producao", "pt-br"]),
  fixture("pt-response", "O usuário prefere respostas objetivas com justificativas claras.", "preference", "user:default", ["comunicacao", "pt-br"]),
  fixture("japanese-style", "日本語 の 応答 は 簡潔 で 明確 に する.", "preference", "user:default", ["japanese", "style"]),
  fixture("polish-security", "Zmiany bezpieczeństwa wymagają testów regresji i jawnego przeglądu.", "instruction", "project:nuzo", ["polish", "security"]),
  fixture("other-project-only", "The Atlas project stores generated reports in object storage.", "project_decision", "project:atlas", ["reports", "storage"]),
  {
    ...fixture("archived-legacy", "Legacy deployments use a shared administrator password.", "note", "project:nuzo", ["archived", "deploy"]),
    archived: true,
  },
  ...Array.from({ length: 24 }, (_, index) => fixture(
    `capture-bound-${index}`,
    `Deployment checklist component ${index} requires review, rollback notes, and an owner.`,
    "instruction",
    "project:nuzo",
    ["capture-bounds", "deploy", `component-${index}`],
  )),
  ...Array.from({ length: 30 }, (_, index) => fixture(
    `capture-noise-${index}`,
    `Synthetic capture noise ${index} records unrelated editor state and temporary task context.`,
    "note",
    "project:nuzo",
    ["capture-noise", `noise-${index}`],
  )),
];

const cases = [
  captureCase("Exact English preference", "english", "The user prefers concise final answers with explicit tradeoffs.", "preference", "user:default", "exact_duplicate", {
    expectedPrimary: "response-concise",
  }),
  captureCase("Exact npm decision", "english", "Publish npm packages through trusted publishing with provenance.", "note", "project:nuzo", "exact_duplicate", {
    tags: ["different-tag"],
    expectedPrimary: "npm-provenance",
  }),
  captureCase("Exact documentation instruction", "english", "  run MKDOCS strict validation before merging documentation changes.  ", "note", "project:nuzo", "exact_duplicate", {
    expectedPrimary: "docs-validation",
  }),
  captureCase("Exact API decision ignores metadata", "english", "API errors use structured JSON with stable machine-readable codes.", "fact", "project:nuzo", "exact_duplicate", {
    tags: ["contract"],
    expectedPrimary: "api-errors",
  }),
  captureCase("Exact dark-theme preference", "english", "The user prefers dark theme for development tools.", "preference", "user:default", "exact_duplicate", {
    expectedPrimary: "dark-theme",
  }),
  captureCase("Update response detail", "english", "The user prefers detailed final answers with explicit tradeoffs.", "preference", "user:default", "update_candidate", {
    expectedPrimary: "response-concise",
  }),
  captureCase("Update timezone", "english", "User-facing schedules now use the UTC timezone.", "fact", "user:default", "update_candidate", {
    expectedPrimary: "timezone-sao-paulo",
  }),
  captureCase("Update npm publication method", "english", "Publish npm packages with a manual token instead of trusted publishing.", "project_decision", "project:nuzo", "update_candidate", {
    expectedPrimary: "npm-provenance",
  }),
  captureCase("Update canonical storage", "english", "Nuzo now stores canonical memory in PostgreSQL instead of SQLite.", "project_decision", "project:nuzo", "update_candidate", {
    expectedPrimary: "sqlite-storage",
  }),
  captureCase("Update documentation validation", "english", "Documentation changes now require a preview build instead of only MkDocs strict validation.", "instruction", "project:nuzo", "update_candidate", {
    expectedPrimary: "docs-validation",
  }),
  captureCase("Update goal email frequency", "english", "Send one weekly summary email instead of an email after every finished goal.", "instruction", "user:default", "update_candidate", {
    expectedPrimary: "goal-email",
  }),
  captureCase("Related response headings", "english", "Use short headings when presenting final answers.", "preference", "user:default", "related", {
    expectedPrimary: "response-concise",
  }),
  captureCase("Related export retention", "english", "Keep the latest three JSON memory exports for recovery.", "instruction", "project:nuzo", "related", {
    expectedPrimary: "portable-export",
  }),
  captureCase("Related API correlation IDs", "english", "API responses include correlation IDs for operational debugging.", "project_decision", "project:nuzo", "related", {
    expectedPrimary: "api-errors",
  }),
  captureCase("Related screen-reader testing", "english", "Test frontend forms with a screen reader before release.", "instruction", "project:nuzo", "related", {
    expectedPrimary: "accessibility",
  }),
  captureCase("Related dependency pinning", "english", "Pin critical dependency versions in release branches.", "instruction", "project:nuzo", "related", {
    expectedPrimary: "dependency-audit",
  }),
  captureCase("Independent Rust formatting", "english", "Rust source files use rustfmt before review.", "instruction", "project:nuzo", "independent"),
  captureCase("Independent meeting notes", "english", "Architecture meetings happen on the first Tuesday of each month.", "fact", "project:nuzo", "independent"),
  captureCase("Independent container retention", "english", "Keep five signed container images in the registry.", "instruction", "project:nuzo", "independent"),
  captureCase("Ambiguous validation process", "english", "Use the preferred validation process for important changes.", "instruction", "project:nuzo", "uncertain", {
    allowedCandidates: ["docs-validation", "dependency-audit", "release-branch", "pt-deploy"],
  }),
  captureCase("Ambiguous storage workflow", "english", "The project should use a different storage workflow.", "project_decision", "project:nuzo", "uncertain", {
    allowedCandidates: ["sqlite-storage", "portable-export"],
  }),
  captureCase("Exact Portuguese deployment", "pt_unicode", "A implantação em produção exige revisão explícita antes do deploy.", "instruction", "project:nuzo", "exact_duplicate", {
    expectedPrimary: "pt-deploy",
  }),
  captureCase("Update Portuguese response style", "pt_unicode", "O usuário prefere respostas detalhadas com justificativas claras.", "preference", "user:default", "update_candidate", {
    expectedPrimary: "pt-response",
  }),
  captureCase("Related Portuguese rollback", "pt_unicode", "Toda implantação em produção precisa de um plano de rollback.", "instruction", "project:nuzo", "related", {
    expectedPrimary: "pt-deploy",
  }),
  captureCase("Independent Portuguese calendar", "pt_unicode", "O fechamento fiscal acontece no último dia útil do mês.", "fact", "project:nuzo", "independent"),
  captureCase("Ambiguous Portuguese review", "pt_unicode", "A revisão deve seguir o padrão preferido do projeto.", "instruction", "project:nuzo", "uncertain", {
    allowedCandidates: ["docs-validation", "dependency-audit", "pt-deploy", "release-branch"],
  }),
  captureCase("Exact Japanese response style", "pt_unicode", "日本語 の 応答 は 簡潔 で 明確 に する.", "preference", "user:default", "exact_duplicate", {
    expectedPrimary: "japanese-style",
  }),
  captureCase("Update Japanese response style", "pt_unicode", "日本語 の 応答 は 詳細 で 明確 に する.", "preference", "user:default", "update_candidate", {
    expectedPrimary: "japanese-style",
  }),
  captureCase("Related Polish log security", "pt_unicode", "Logi bezpieczeństwa wymagają kontroli danych wrażliwych.", "instruction", "project:nuzo", "related", {
    expectedPrimary: "polish-security",
  }),
  captureCase("Independent Arabic typography", "pt_unicode", "تستخدم الواجهة خطًا واضحًا للنص العربي.", "preference", "project:nuzo", "independent"),
  blockedCase("Blocked fake GitHub token", "safety", "github token is ghp_123456789012345678901234567890123456", "MEMORY_SECRET_DETECTED"),
  blockedCase("Blocked invalid tag", "safety", "The project uses a synthetic invalid tag fixture.", "MEMORY_TAG_INVALID", {
    tags: ["Invalid Tag"],
  }),
  blockedCase("Blocked unauthorized scope", "safety", "The restricted session cannot inspect this scope.", "MEMORY_SCOPE_FORBIDDEN", {
    scope: "project:atlas",
    restricted: true,
  }),
  captureCase("Cross-scope exact content stays isolated", "safety", "The Atlas project stores generated reports in object storage.", "project_decision", "project:nuzo", "independent"),
  captureCase("Archived exact content stays excluded", "safety", "Legacy deployments use a shared administrator password.", "note", "project:nuzo", "independent"),
  captureCase("Empty scope is independent", "safety", "This isolated scope uses a synthetic retention policy.", "instruction", "project:empty", "independent"),
  captureCase("Dense candidates stay bounded", "safety", "Deployment checklist components require review, rollback notes, and an owner.", "instruction", "project:nuzo", "related", {
    expectedPrimary: "capture-bound-0",
    allowedCandidates: Array.from({ length: 24 }, (_, index) => `capture-bound-${index}`),
    expectedSearchExhaustive: false,
    expectedEvidenceTruncated: true,
  }),
];

const thresholds = {
  failures: 0,
  minEnglishCases: 18,
  minSafetyRate: 1,
  maxAverageLatencyMs: 25,
  maxLatencyMs: 100,
};

class BenchmarkIds {
  memoryCounter = 0;
  eventCounter = 0;

  memoryId() {
    this.memoryCounter += 1;
    return `mem_capture_${String(this.memoryCounter).padStart(4, "0")}`;
  }

  eventId() {
    this.eventCounter += 1;
    return `evt_capture_${String(this.eventCounter).padStart(4, "0")}`;
  }
}

const database = new SQLiteMemoryDatabase({ path: storePath });

try {
  const ids = new BenchmarkIds();
  const scanner = new RegexSecretScanner();
  const service = createBenchmarkService(database, ids, new DefaultPolicyEngine(scanner));
  const restrictedService = createBenchmarkService(
    database,
    ids,
    new DefaultPolicyEngine(scanner, { allowedScopes: ["project:nuzo"] }),
  );
  const memoriesByKey = new Map();
  for (const item of fixtures) {
    const memory = await service.remember({
      content: item.content,
      kind: item.kind,
      scope: item.scope,
      tags: item.tags,
      source: "benchmark:capture",
    });
    memoriesByKey.set(item.key, memory);
    if (item.archived === true) {
      await service.forget({
        id: memory.id,
        actor: "benchmark:capture",
        mode: "archive",
        reason: "Archived fixture validates capture candidate exclusion.",
      });
    }
  }

  const results = [];
  for (const benchmarkCase of cases) {
    const caseService = benchmarkCase.restricted === true ? restrictedService : service;
    const before = await stateSnapshot(service);
    const started = performance.now();
    let suggestion = null;
    let error = null;
    try {
      const suggestionInput = {
        content: benchmarkCase.content,
        kind: benchmarkCase.kind,
        scope: benchmarkCase.scope,
        tags: benchmarkCase.tags,
        source: "benchmark:capture-suggestion",
        confidence: 0.8,
        reason: benchmarkCase.reason,
      };
      if (expectation === "bounded") {
        suggestionInput.relationshipMode = "bounded";
      }
      suggestion = await caseService.suggestCapture(suggestionInput);
    } catch (caught) {
      error = caught;
    }
    const latencyMs = performance.now() - started;
    const after = await stateSnapshot(service);
    results.push(evaluateCase({
      benchmarkCase,
      suggestion,
      error,
      latencyMs,
      memoryStateUnchanged: before.memories === after.memories,
      auditStateUnchanged: before.events === after.events,
      memoriesByKey,
      expectation,
    }));
  }

  const summary = summarize(results);
  const report = {
    benchmark: "nuzo-capture-intelligence",
    version: 1,
    expectation,
    coreModule: coreModulePath ?? "workspace",
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

function fixture(key, content, kind, scope, tags) {
  return { key, content, kind, scope, tags };
}

function captureCase(label, group, content, kind, scope, expectedRelationship, options = {}) {
  return {
    label,
    group,
    content,
    kind,
    scope,
    tags: options.tags ?? ["benchmark-capture"],
    reason: `Synthetic ${expectedRelationship} capture fixture.`,
    expectedRelationship,
    baselineOutcome: expectedRelationship === "exact_duplicate" ? "exact_duplicate" : "legacy_ready",
    expectedPrimary: options.expectedPrimary,
    allowedCandidates: options.allowedCandidates ?? (options.expectedPrimary ? [options.expectedPrimary] : []),
    expectedSearchExhaustive: options.expectedSearchExhaustive,
    expectedEvidenceTruncated: options.expectedEvidenceTruncated,
    restricted: options.restricted === true,
  };
}

function blockedCase(label, group, content, expectedErrorCode, options = {}) {
  return {
    label,
    group,
    content,
    kind: "note",
    scope: options.scope ?? "project:nuzo",
    tags: options.tags ?? ["benchmark-capture"],
    reason: "Synthetic blocked capture fixture.",
    expectedRelationship: "blocked",
    baselineOutcome: "blocked",
    expectedErrorCode,
    allowedCandidates: [],
    restricted: options.restricted === true,
  };
}

function createBenchmarkService(store, ids, policy) {
  return createMemoryService({
    store,
    searchIndex: store,
    auditLog: store,
    clock: new SystemClock(),
    ids,
    policy,
    transactions: store,
  });
}

async function stateSnapshot(service) {
  const memories = await service.list({ includeArchived: true });
  const events = await service.audit({ limit: 200 });
  return {
    memories: JSON.stringify(memories
      .map((memory) => serializeMemory(memory))
      .sort((left, right) => left.id.localeCompare(right.id))),
    events: JSON.stringify(events
      .map((event) => ({
        id: event.id,
        memoryId: event.memoryId,
        eventType: event.eventType,
        actor: event.actor,
        payload: event.payload,
        createdAt: event.createdAt.toISOString(),
      }))
      .sort((left, right) => left.id.localeCompare(right.id))),
  };
}

function serializeMemory(memory) {
  return {
    id: memory.id,
    revision: memory.revision,
    scope: memory.scope,
    kind: memory.kind,
    content: memory.content,
    tags: [...memory.tags],
    source: memory.source,
    confidence: memory.confidence,
    createdAt: memory.createdAt.toISOString(),
    updatedAt: memory.updatedAt.toISOString(),
    lastUsedAt: memory.lastUsedAt?.toISOString() ?? null,
    archivedAt: memory.archivedAt?.toISOString() ?? null,
  };
}

function evaluateCase({
  benchmarkCase,
  suggestion,
  error,
  latencyMs,
  memoryStateUnchanged,
  auditStateUnchanged,
  memoriesByKey,
  expectation,
}) {
  const bounded = suggestion !== null &&
    suggestion.relationshipMode === "bounded" &&
    typeof suggestion.relationship === "string" &&
    suggestion.relationshipEvidence?.version === 1;
  const actualRelationship = error
    ? "blocked"
    : bounded
      ? suggestion.relationship
      : suggestion?.status === "duplicate"
        ? "exact_duplicate"
        : "legacy_ready";
  const errorCode = typeof error?.code === "string" ? error.code : null;
  const candidates = extractCandidates(suggestion, bounded);
  const candidateKeys = candidates.map((candidate) => keyForMemory(candidate.memory.id, memoriesByKey));
  const primaryMemoryId = bounded
    ? suggestion.relationshipEvidence.primaryMemoryId
    : suggestion?.duplicate?.id ?? null;
  const primaryKey = primaryMemoryId === null
    ? null
    : keyForMemory(primaryMemoryId, memoriesByKey);
  const safetyFailures = [];
  const profileFailures = [];
  let scopeViolationCount = 0;
  let archivedViolationCount = 0;

  if (!memoryStateUnchanged) {
    safetyFailures.push("suggestion evaluation changed memory state");
  }
  if (!auditStateUnchanged) {
    safetyFailures.push("suggestion evaluation changed audit state");
  }
  if (suggestion !== null && suggestion.memoryWrites !== false) {
    safetyFailures.push("successful response did not report memoryWrites=false");
  }
  if (suggestion !== null && suggestion.requiresConfirmation !== true) {
    safetyFailures.push("successful response did not require confirmation");
  }
  if (benchmarkCase.expectedErrorCode !== undefined) {
    if (errorCode !== benchmarkCase.expectedErrorCode) {
      safetyFailures.push(`expected error ${benchmarkCase.expectedErrorCode}, got ${errorCode ?? "none"}`);
    }
  } else if (error !== null) {
    safetyFailures.push(`unexpected error ${errorCode ?? error?.message ?? "unknown"}`);
  }

  for (const candidate of candidates) {
    if (candidate.memory.scope !== benchmarkCase.scope) {
      scopeViolationCount += 1;
      safetyFailures.push(`cross-scope candidate ${candidate.memory.id} from ${candidate.memory.scope}`);
    }
    if (candidate.memory.archivedAt !== null) {
      archivedViolationCount += 1;
      safetyFailures.push(`archived candidate ${candidate.memory.id}`);
    }
  }
  if (suggestion?.duplicate) {
    if (suggestion.duplicate.scope !== benchmarkCase.scope) {
      scopeViolationCount += 1;
      safetyFailures.push(`cross-scope legacy duplicate ${suggestion.duplicate.id}`);
    }
    if (suggestion.duplicate.archivedAt !== null) {
      archivedViolationCount += 1;
      safetyFailures.push(`archived legacy duplicate ${suggestion.duplicate.id}`);
    }
  }

  const boundFailures = bounded ? validateBoundedResult(suggestion) : [];
  safetyFailures.push(...boundFailures);

  const unexpectedCandidates = candidateKeys.filter((key) => !benchmarkCase.allowedCandidates.includes(key));
  if (unexpectedCandidates.length > 0) {
    safetyFailures.push(`unexpected candidate(s): ${unexpectedCandidates.join(", ")}`);
  }

  if (expectation === "baseline") {
    if (actualRelationship !== benchmarkCase.baselineOutcome) {
      profileFailures.push(`expected baseline ${benchmarkCase.baselineOutcome}, got ${actualRelationship}`);
    }
    if (bounded && benchmarkCase.expectedRelationship !== "blocked") {
      profileFailures.push("baseline profile expected no bounded relationship contract");
    }
  } else {
    if (benchmarkCase.expectedRelationship !== "blocked" && !bounded) {
      profileFailures.push("bounded relationship contract was not returned");
    }
    if (actualRelationship !== benchmarkCase.expectedRelationship) {
      profileFailures.push(`expected relationship ${benchmarkCase.expectedRelationship}, got ${actualRelationship}`);
    }
    if (benchmarkCase.expectedPrimary !== undefined && primaryKey !== benchmarkCase.expectedPrimary) {
      profileFailures.push(`expected primary ${benchmarkCase.expectedPrimary}, got ${primaryKey ?? "none"}`);
    }
    if (bounded && benchmarkCase.expectedSearchExhaustive !== undefined &&
      suggestion.relationshipEvidence.searchExhaustive !== benchmarkCase.expectedSearchExhaustive) {
      profileFailures.push(`expected searchExhaustive=${benchmarkCase.expectedSearchExhaustive}`);
    }
    if (bounded && benchmarkCase.expectedEvidenceTruncated !== undefined &&
      suggestion.relationshipEvidence.evidenceTruncated !== benchmarkCase.expectedEvidenceTruncated) {
      profileFailures.push(`expected evidenceTruncated=${benchmarkCase.expectedEvidenceTruncated}`);
    }
  }

  return {
    label: benchmarkCase.label,
    group: benchmarkCase.group,
    expectedRelationship: benchmarkCase.expectedRelationship,
    baselineOutcome: benchmarkCase.baselineOutcome,
    actualRelationship,
    contractSupported: bounded,
    status: suggestion?.status ?? null,
    errorCode,
    expectedPrimary: benchmarkCase.expectedPrimary ?? null,
    primaryKey,
    candidateKeys,
    unexpectedCandidateCount: unexpectedCandidates.length,
    latencyMs,
    memoryStateUnchanged,
    auditStateUnchanged,
    scopeViolationCount,
    archivedViolationCount,
    boundViolationCount: boundFailures.length,
    evidenceReasonCovered: bounded && boundFailures.every((failure) => !failure.includes("reason")),
    safetyFailures,
    profileFailures,
    failures: [...safetyFailures, ...profileFailures],
  };
}

function extractCandidates(suggestion, bounded) {
  if (bounded) {
    return Array.isArray(suggestion.relationshipEvidence.candidates)
      ? suggestion.relationshipEvidence.candidates.filter((candidate) => candidate?.memory?.id)
      : [];
  }
  if (suggestion?.duplicate) {
    return [{ memory: suggestion.duplicate, matchedTerms: [], matchedTags: [], reason: "Legacy exact duplicate." }];
  }
  return [];
}

function validateBoundedResult(suggestion) {
  const failures = [];
  const evidence = suggestion.relationshipEvidence;
  const candidates = evidence.candidates;
  const relationships = new Set(["exact_duplicate", "update_candidate", "related", "independent", "uncertain"]);
  if (!relationships.has(suggestion.relationship)) {
    failures.push(`unknown bounded relationship ${suggestion.relationship}`);
  }
  const expectedStatus = expectedStatusForRelationship(suggestion.relationship);
  if (suggestion.status !== expectedStatus) {
    failures.push(`relationship ${suggestion.relationship} requires status ${expectedStatus}`);
  }
  if (evidence.candidateLimit !== 20 || evidence.returnedLimit !== 3) {
    failures.push("bounded limits must be candidateLimit=20 and returnedLimit=3");
  }
  if (!Number.isInteger(evidence.evaluatedCount) || evidence.evaluatedCount < 0 || evidence.evaluatedCount > 20) {
    failures.push("evaluatedCount must be an integer from 0 through 20");
  }
  if (!Array.isArray(candidates) || candidates.length > 3) {
    failures.push("relationship candidates must contain at most 3 records");
    return failures;
  }
  if (typeof evidence.reason !== "string" || evidence.reason.length === 0 || evidence.reason.length > 1_000) {
    failures.push("top-level relationship reason must contain 1-1000 characters");
  }
  for (const candidate of candidates) {
    if (typeof candidate.memory?.id !== "string" || typeof candidate.memory?.scope !== "string") {
      failures.push("candidate memory record is incomplete");
      continue;
    }
    if (!Array.isArray(candidate.matchedTerms) || candidate.matchedTerms.length > 8) {
      failures.push(`candidate ${candidate.memory?.id ?? "unknown"} exceeded matchedTerms bound`);
    }
    if (!Array.isArray(candidate.matchedTags) || candidate.matchedTags.length > 8) {
      failures.push(`candidate ${candidate.memory?.id ?? "unknown"} exceeded matchedTags bound`);
    }
    if (typeof candidate.reason !== "string" || candidate.reason.length === 0 || candidate.reason.length > 1_000) {
      failures.push(`candidate ${candidate.memory?.id ?? "unknown"} reason must contain 1-1000 characters`);
    }
  }
  if (["exact_duplicate", "update_candidate", "related"].includes(suggestion.relationship)) {
    if (candidates.length === 0 || evidence.primaryMemoryId !== candidates[0]?.memory.id) {
      failures.push("primaryMemoryId must match the first candidate");
    }
  }
  if (suggestion.relationship === "independent") {
    if (evidence.primaryMemoryId !== null || candidates.length !== 0 ||
      evidence.searchExhaustive !== true || evidence.evidenceTruncated !== false) {
      failures.push("independent requires null primary, empty exhaustive evidence, and no truncation");
    }
  }
  if (suggestion.relationship === "uncertain" && evidence.primaryMemoryId !== null) {
    failures.push("uncertain requires a null primaryMemoryId");
  }
  if (suggestion.relationship === "exact_duplicate") {
    if (suggestion.duplicate?.id !== evidence.primaryMemoryId || candidates.length !== 1 ||
      evidence.evaluatedCount !== 1 || evidence.searchExhaustive !== true || evidence.evidenceTruncated !== false) {
      failures.push("exact duplicate bounded evidence did not preserve deterministic short-circuit invariants");
    }
  } else if (suggestion.duplicate !== null) {
    failures.push("legacy duplicate field must be null outside exact_duplicate");
  }
  return failures;
}

function expectedStatusForRelationship(relationship) {
  if (relationship === "exact_duplicate") {
    return "duplicate";
  }
  if (relationship === "independent") {
    return "ready";
  }
  return "review";
}

function keyForMemory(id, memoriesByKey) {
  for (const [key, memory] of memoriesByKey) {
    if (memory.id === id) {
      return key;
    }
  }
  return `unknown:${id}`;
}

function summarize(results) {
  const relationshipCases = results.filter((result) => result.expectedRelationship !== "blocked");
  const blockedCases = results.filter((result) => result.expectedRelationship === "blocked");
  const boundedCases = relationshipCases.filter((result) => result.contractSupported);
  const primaryCases = results.filter((result) => result.expectedPrimary !== null);
  const exactCases = results.filter((result) => result.expectedRelationship === "exact_duplicate");
  const latencies = results.map((result) => result.latencyMs);
  const safetyFailures = results.flatMap((result) => result.safetyFailures.map((failure) => `${result.label}: ${failure}`));
  const profileFailures = results.flatMap((result) => result.profileFailures.map((failure) => `${result.label}: ${failure}`));
  const groups = Object.fromEntries(
    [...new Set(results.map((result) => result.group))].sort().map((group) => [
      group,
      summarizeGroup(results.filter((result) => result.group === group)),
    ]),
  );
  return {
    failures: [...safetyFailures, ...profileFailures],
    safetyFailures,
    profileFailures,
    expectedOutcomeCounts: countBy(results, (result) => result.expectedRelationship),
    actualOutcomeCounts: countBy(results, (result) => result.actualRelationship),
    targetRelationshipAccuracy: ratio(
      relationshipCases.filter((result) => result.actualRelationship === result.expectedRelationship).length,
      relationshipCases.length,
    ),
    profileAccuracy: ratio(results.filter((result) => result.profileFailures.length === 0).length, results.length),
    contractCoverage: ratio(relationshipCases.filter((result) => result.contractSupported).length, relationshipCases.length),
    exactDuplicateRecall: ratio(exactCases.filter((result) => result.actualRelationship === "exact_duplicate").length, exactCases.length),
    primaryAccuracy: ratio(
      primaryCases.filter((result) => result.primaryKey === result.expectedPrimary).length,
      primaryCases.length,
    ),
    policyAccuracy: ratio(blockedCases.filter((result) => result.actualRelationship === "blocked" && result.safetyFailures.length === 0).length, blockedCases.length),
    safetyRate: ratio(results.filter((result) => result.safetyFailures.length === 0).length, results.length),
    memoryWriteCount: results.filter((result) => !result.memoryStateUnchanged).length,
    auditWriteCount: results.filter((result) => !result.auditStateUnchanged).length,
    scopeViolationCount: results.reduce((sum, result) => sum + result.scopeViolationCount, 0),
    archivedViolationCount: results.reduce((sum, result) => sum + result.archivedViolationCount, 0),
    boundViolationCount: results.reduce((sum, result) => sum + result.boundViolationCount, 0),
    zeroWriteRate: ratio(
      results.filter((result) => result.memoryStateUnchanged && result.auditStateUnchanged).length,
      results.length,
    ),
    evidenceReasonCoverage: boundedCases.length === 0
      ? 0
      : ratio(boundedCases.filter((result) => result.evidenceReasonCovered).length, boundedCases.length),
    unexpectedCandidateRate: ratio(
      results.reduce((sum, result) => sum + result.unexpectedCandidateCount, 0),
      results.reduce((sum, result) => sum + result.candidateKeys.length, 0),
    ),
    averageLatencyMs: average(latencies),
    maxLatencyMs: Math.max(...latencies),
    groups,
  };
}

function summarizeGroup(results) {
  const relationshipCases = results.filter((result) => result.expectedRelationship !== "blocked");
  return {
    cases: results.length,
    targetRelationshipAccuracy: ratio(
      relationshipCases.filter((result) => result.actualRelationship === result.expectedRelationship).length,
      relationshipCases.length,
    ),
    profileAccuracy: ratio(results.filter((result) => result.profileFailures.length === 0).length, results.length),
    contractCoverage: ratio(relationshipCases.filter((result) => result.contractSupported).length, relationshipCases.length),
    safetyRate: ratio(results.filter((result) => result.safetyFailures.length === 0).length, results.length),
  };
}

function passesThresholds(summary, limits) {
  return summary.failures.length === limits.failures &&
    (summary.groups.english?.cases ?? 0) >= limits.minEnglishCases &&
    summary.safetyRate >= limits.minSafetyRate &&
    summary.averageLatencyMs <= limits.maxAverageLatencyMs &&
    summary.maxLatencyMs <= limits.maxLatencyMs;
}

function printHumanReport(report) {
  console.log("Nuzo capture intelligence benchmark");
  console.log(`expectation=${report.expectation} fixtures=${report.fixtures} cases=${report.cases}`);
  console.log(`target_relationship_accuracy=${formatPercent(report.summary.targetRelationshipAccuracy)} profile_accuracy=${formatPercent(report.summary.profileAccuracy)} contract_coverage=${formatPercent(report.summary.contractCoverage)}`);
  console.log(`exact_duplicate_recall=${formatPercent(report.summary.exactDuplicateRecall)} primary_accuracy=${formatPercent(report.summary.primaryAccuracy)} policy_accuracy=${formatPercent(report.summary.policyAccuracy)}`);
  console.log(`safety=${formatPercent(report.summary.safetyRate)} zero_writes=${formatPercent(report.summary.zeroWriteRate)} unexpected_candidates=${formatPercent(report.summary.unexpectedCandidateRate)}`);
  console.log(`evidence_reasons=${formatPercent(report.summary.evidenceReasonCoverage)}`);
  console.log(`memory_writes=${report.summary.memoryWriteCount} audit_writes=${report.summary.auditWriteCount} scope_violations=${report.summary.scopeViolationCount} archived_violations=${report.summary.archivedViolationCount} bound_violations=${report.summary.boundViolationCount}`);
  console.log(`expected_outcomes=${formatCounts(report.summary.expectedOutcomeCounts)}`);
  console.log(`actual_outcomes=${formatCounts(report.summary.actualOutcomeCounts)}`);
  console.log(`latency_avg=${report.summary.averageLatencyMs.toFixed(2)}ms latency_max=${report.summary.maxLatencyMs.toFixed(2)}ms`);
  for (const [group, summary] of Object.entries(report.summary.groups)) {
    console.log(`group=${group}\tcases=${summary.cases}\ttarget=${formatPercent(summary.targetRelationshipAccuracy)}\tprofile=${formatPercent(summary.profileAccuracy)}\tcontract=${formatPercent(summary.contractCoverage)}\tsafety=${formatPercent(summary.safetyRate)}`);
  }
  for (const result of report.results) {
    const status = result.failures.length === 0 ? "pass" : "fail";
    console.log(`${status}\t${result.group}\t${result.label}\t${result.latencyMs.toFixed(2)}ms\texpected=${result.expectedRelationship}\tactual=${result.actualRelationship}\tprimary=${result.primaryKey ?? "none"}`);
    for (const failure of result.failures) {
      console.log(`  - ${failure}`);
    }
  }
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

function countBy(values, keyForValue) {
  const counts = {};
  for (const value of values) {
    const key = keyForValue(value);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function formatCounts(counts) {
  return Object.entries(counts).map(([key, count]) => `${key}:${count}`).join(",");
}

function optionValue(name) {
  const optionIndex = process.argv.indexOf(name);
  if (optionIndex === -1) {
    return undefined;
  }
  const value = process.argv[optionIndex + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}
