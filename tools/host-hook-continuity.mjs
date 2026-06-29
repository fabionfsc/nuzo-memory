#!/usr/bin/env node
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  createMemoryService,
  DefaultPolicyEngine,
  projectScopeFromPath,
  RandomIdGenerator,
  RegexSecretScanner,
  SQLiteMemoryDatabase,
  SystemClock,
} from "../packages/core/dist/index.js";
import {
  hostHookLimits,
  hostHookMemoryEnvelope,
} from "../packages/mcp-server/dist/host-hook.js";
import { runHostHookProcess } from "../packages/mcp-server/dist/host-hook-cli.js";

const keepFixtures = process.argv.includes("--keep");
const testRoot = mkdtempSync(join(tmpdir(), "nuzo-host-hook-matrix-"));
const storePath = join(testRoot, "memory", "memories.sqlite");
const cwd = join(testRoot, "project");
const otherCwd = join(testRoot, "other-project");
const memories = [];
const scenarios = [
  {
    label: "Cloudflare workflow",
    query: "Handle the next Cloudflare routing task.",
    content: "Cloudflare changes use the workflow under /example/workflows/cloudflare.",
    tags: ["cloudflare", "docker", "workflow"],
  },
  {
    label: "npm release",
    query: "How should the npm release provenance be published?",
    content: "Publish npm releases through trusted publishing with provenance.",
    tags: ["npm", "release", "provenance"],
  },
  {
    label: "documentation",
    query: "Validate the MkDocs documentation before merge.",
    content: "Run MkDocs strict validation before merging documentation changes.",
    tags: ["docs", "mkdocs", "workflow"],
  },
  {
    label: "Unicode PT-BR",
    query: "Qual e o fluxo de implantação em produção?",
    content: "A implantação em produção exige revisão explícita antes do deploy.",
    tags: ["deploy", "pt-br", "producao"],
  },
  {
    label: "SQLite",
    query: "Which SQLite concurrency setting applies?",
    content: "SQLite writes use a busy timeout and optimistic revisions.",
    tags: ["sqlite", "concurrency", "storage"],
  },
  {
    label: "security",
    query: "What is the security rule for credentials?",
    content: "Never store credentials, tokens, cookies, or private keys in memory.",
    tags: ["security", "credentials", "privacy"],
  },
  {
    label: "accessibility",
    query: "What accessibility baseline applies to the interface?",
    content: "Interactive controls follow keyboard navigation and WCAG contrast guidance.",
    tags: ["accessibility", "frontend", "wcag"],
  },
  {
    label: "testing",
    query: "Which Vitest runner validates package testing?",
    content: "Run Vitest for package tests on Node.js 22 and Node.js 24.",
    tags: ["testing", "vitest", "nodejs"],
  },
  {
    label: "Git workflow",
    query: "How should a pull request be merged?",
    content: "Use a focused branch and squash merge with a Conventional Commit subject.",
    tags: ["git", "pull-request", "workflow"],
  },
  {
    label: "response preference",
    query: "What response style does the user prefer?",
    content: "The user prefers concise answers with explicit tradeoffs.",
    kind: "preference",
    tags: ["communication", "preference", "style"],
  },
  {
    label: "language preference",
    query: "Which language should final answers use?",
    content: "The user prefers final answers in Brazilian Portuguese.",
    kind: "preference",
    tags: ["language", "preference", "pt-br"],
  },
  {
    label: "timezone fact",
    query: "Which timezone applies to user-facing schedules?",
    content: "User-facing schedules use the America/Sao_Paulo timezone.",
    kind: "fact",
    tags: ["timezone", "scheduling", "user"],
  },
  {
    label: "date format preference",
    query: "Which date format should reports use?",
    content: "Reports use ISO 8601 dates in YYYY-MM-DD format.",
    kind: "preference",
    tags: ["date-format", "reporting", "iso8601"],
  },
  {
    label: "package manager decision",
    query: "Which package manager does this project use?",
    content: "This project uses pnpm with a frozen lockfile in CI.",
    kind: "project_decision",
    scope: "project",
    tags: ["package-manager", "pnpm", "ci"],
  },
  {
    label: "shell environment fact",
    query: "Which interactive shell is configured for development?",
    content: "The development environment uses zsh as the interactive shell.",
    kind: "fact",
    tags: ["environment", "shell", "zsh"],
  },
  {
    label: "API convention",
    query: "Which API response convention applies?",
    content: "API errors use structured JSON with stable machine-readable codes.",
    kind: "project_decision",
    scope: "project",
    tags: ["api", "errors", "json"],
  },
  {
    label: "error handling",
    query: "How should unexpected failures be handled?",
    content: "Unexpected failures must preserve the original cause and return a concise public error.",
    tags: ["errors", "reliability", "workflow"],
  },
  {
    label: "logging privacy",
    query: "What must logs redact?",
    content: "Application logs redact authorization headers, cookies, tokens, and personal data.",
    tags: ["logging", "privacy", "redaction"],
  },
  {
    label: "container workflow",
    query: "Which container command starts the local stack?",
    content: "Start the local stack with docker compose up --wait.",
    kind: "fact",
    scope: "project",
    tags: ["containers", "docker-compose", "development"],
  },
  {
    label: "cloud region fact",
    query: "Which cloud region is the default deployment target?",
    content: "The default deployment target is the sa-east-1 cloud region.",
    kind: "fact",
    tags: ["cloud", "deployment", "region"],
  },
  {
    label: "feature flag workflow",
    query: "How are risky features released?",
    content: "Risky features ship behind disabled-by-default feature flags.",
    kind: "project_decision",
    scope: "project",
    tags: ["feature-flags", "release", "risk"],
  },
  {
    label: "naming convention",
    query: "Which naming convention applies to documentation files?",
    content: "Documentation paths use lowercase kebab-case filenames.",
    kind: "project_decision",
    scope: "project",
    tags: ["docs", "naming", "kebab-case"],
  },
  {
    label: "Python tooling",
    query: "Which Python dependency tool should be used?",
    content: "Python environments use uv with locked dependencies.",
    kind: "project_decision",
    scope: "project",
    tags: ["python", "tooling", "uv"],
  },
  {
    label: "Rust validation",
    query: "Which Rust validation commands are required?",
    content: "Rust changes run cargo fmt, cargo clippy, and cargo test.",
    tags: ["rust", "cargo", "testing"],
  },
  {
    label: "Go validation",
    query: "Which Go command validates all packages?",
    content: "Go changes run go test ./... before merge.",
    tags: ["golang", "testing", "workflow"],
  },
  {
    label: "Java build",
    query: "Which Java build command runs verification?",
    content: "Java verification runs ./mvnw verify with the project wrapper.",
    tags: ["java", "maven", "testing"],
  },
  {
    label: "frontend framework decision",
    query: "Which frontend framework does the project use?",
    content: "The frontend uses React with TypeScript and accessible semantic HTML.",
    kind: "project_decision",
    scope: "project",
    tags: ["frontend", "react", "typescript"],
  },
  {
    label: "database migration workflow",
    query: "How should database migrations be deployed?",
    content: "Database migrations are additive first and destructive cleanup happens in a later release.",
    tags: ["database", "migrations", "deployment"],
  },
  {
    label: "code review preference",
    query: "What should code reviews prioritize?",
    content: "Code reviews prioritize behavioral bugs, regressions, security risks, and missing tests.",
    kind: "preference",
    tags: ["code-review", "quality", "testing"],
  },
  {
    label: "Spanish",
    query: "¿Qué debe incluir cada cambio importante?",
    content: "Cada cambio importante debe incluir pruebas automatizadas y documentación actualizada.",
    tags: ["language-es", "quality", "testing"],
  },
  {
    label: "French",
    query: "Quelle validation faut-il exécuter avant la fusion ?",
    content: "Avant la fusion, exécuter les tests, le lint et la validation de la documentation.",
    tags: ["language-fr", "quality", "workflow"],
  },
  {
    label: "German",
    query: "Welche Regel gilt für Geheimnisse?",
    content: "Geheimnisse und Zugangsdaten dürfen niemals im Repository gespeichert werden.",
    tags: ["language-de", "security", "secrets"],
  },
  {
    label: "Italian",
    query: "Come devono essere gestiti gli errori?",
    content: "Gli errori devono avere codici stabili e messaggi pubblici concisi.",
    tags: ["language-it", "errors", "reliability"],
  },
  {
    label: "Japanese",
    query: "日本語 の 応答 ルール は 何 です か",
    content: "日本語 の 応答 は 簡潔 で 明確 に する.",
    tags: ["japanese", "language-ja", "style"],
  },
  {
    label: "Korean",
    query: "한국어 응답 규칙은 무엇입니까",
    content: "한국어 응답은 간결하고 명확하게 작성한다.",
    tags: ["korean", "language-ko", "style"],
  },
  {
    label: "Chinese",
    query: "中文 回复 应该 遵循 什么 规则",
    content: "中文 回复 应该 简洁 清晰 并说明 关键 取舍.",
    tags: ["chinese", "language-zh", "style"],
  },
  {
    label: "Russian",
    query: "Что журналы не должны содержать?",
    content: "Журналы не должны содержать токены, пароли или персональные данные.",
    tags: ["language-ru", "logging", "privacy"],
  },
  {
    label: "Arabic",
    query: "ما هي قاعدة مراجعة التغييرات قبل الدمج",
    content: "يجب مراجعة التغييرات وتشغيل الاختبارات قبل الدمج.",
    tags: ["language-ar", "review", "testing"],
  },
  {
    label: "Hindi",
    query: "परिनियोजन से पहले कौन सा नियम लागू होता है",
    content: "परिनियोजन से पहले परीक्षण और स्पष्ट अनुमोदन आवश्यक है।",
    tags: ["deploy", "language-hi", "testing"],
  },
  {
    label: "Dutch",
    query: "Welke regel geldt voor databasewijzigingen?",
    content: "Databasewijzigingen moeten achterwaarts compatibel en controleerbaar zijn.",
    tags: ["database", "language-nl", "migrations"],
  },
  {
    label: "Polish",
    query: "Jaka zasada dotyczy zmian bezpieczeństwa?",
    content: "Zmiany bezpieczeństwa wymagają testów regresji i jawnego przeglądu.",
    tags: ["language-pl", "security", "testing"],
  },
  {
    label: "Turkish",
    query: "Dağıtımdan önce hangi kontrol yapılmalıdır?",
    content: "Dağıtımdan önce testler çalıştırılmalı ve değişiklik onaylanmalıdır.",
    tags: ["deploy", "language-tr", "testing"],
  },
];

try {
  mkdirSync(cwd, { recursive: true });
  mkdirSync(otherCwd, { recursive: true });
  mkdirSync(dirname(storePath), { recursive: true });
  const database = new SQLiteMemoryDatabase({ path: storePath });
  const service = createService(database);
  const projectScope = projectScopeFromPath(cwd);

  memories.push(await remember(service, {
    content: "Global bootstrap marker: prefer concise implementation updates.",
    kind: "preference",
    scope: "user:default",
    tags: ["autoload", "workflow"],
  }));
  memories.push(await remember(service, {
    content: "Global bootstrap marker: explain material blockers directly.",
    kind: "preference",
    scope: "user:default",
    tags: ["autoload", "communication"],
  }));
  memories.push(await remember(service, {
    content: "Project bootstrap marker: run release checks before publishing.",
    kind: "instruction",
    scope: projectScope,
    tags: ["autoload", "release"],
  }));
  memories.push(await remember(service, {
    content: "Project bootstrap marker: keep host plugins thin.",
    kind: "instruction",
    scope: projectScope,
    tags: ["autoload", "architecture"],
  }));

  const unrelatedAutoload = await remember(service, {
    content: "Other project bootstrap marker must remain isolated.",
    kind: "instruction",
    scope: projectScopeFromPath(otherCwd),
    tags: ["autoload", "isolation"],
  });
  memories.push(unrelatedAutoload);

  const archivedAutoload = await remember(service, {
    content: "Archived bootstrap marker must never be injected.",
    kind: "instruction",
    scope: projectScope,
    tags: ["autoload", "archived"],
  });
  await service.forget({
    id: archivedAutoload.id,
    expectedRevision: archivedAutoload.revision,
    mode: "archive",
    actor: "test:host-hook-matrix",
  });
  memories.push(archivedAutoload);

  for (const scenario of scenarios) {
    const saved = await remember(service, {
      content: scenario.content,
      kind: scenario.kind ?? "instruction",
      scope: scenario.scope === "project" ? projectScope : "user:default",
      tags: scenario.tags,
    });
    scenario.memory = saved;
    memories.push(saved);
  }

  const tagOnly = await remember(service, {
    content: "Use the runbook located at /srv/edge/runbook.",
    kind: "instruction",
    scope: "user:default",
    tags: ["edgeflare", "runbook"],
  });
  memories.push(tagOnly);

  const projectOnly = await remember(service, {
    content: "Current project marker uses /srv/current-project.",
    kind: "fact",
    scope: projectScope,
    tags: ["projecttopic"],
  });
  memories.push(projectOnly);
  const otherProject = await remember(service, {
    content: "Other project marker uses /srv/other-project and must stay isolated.",
    kind: "fact",
    scope: projectScopeFromPath(otherCwd),
    tags: ["projecttopic"],
  });
  memories.push(otherProject);
  const agentOnly = await remember(service, {
    content: "Agent-only project marker must not enter normal project recall.",
    kind: "fact",
    scope: "agent:test",
    tags: ["projecttopic"],
  });
  memories.push(agentOnly);

  const archivedContext = await remember(service, {
    content: "Archived context marker must never be recalled.",
    kind: "note",
    scope: "user:default",
    tags: ["archivedtopic"],
  });
  await service.forget({
    id: archivedContext.id,
    expectedRevision: archivedContext.revision,
    mode: "archive",
    actor: "test:host-hook-matrix",
  });
  memories.push(archivedContext);

  for (let index = 0; index < 12; index += 1) {
    memories.push(await remember(service, {
      content: `Unrelated noise memory ${index} covers a synthetic topic ${index}.`,
      kind: "note",
      scope: index % 2 === 0 ? "user:default" : projectScope,
      tags: [`noise-${index}`],
    }));
  }

  const bounded = [];
  for (let index = 0; index < 9; index += 1) {
    const saved = await remember(service, {
      content: `Bounded recall fixture ${index} must respect the result limit.`,
      kind: "note",
      scope: "user:default",
      tags: ["boundedtopic"],
    });
    bounded.push(saved);
    memories.push(saved);
  }

  const longMemory = await remember(service, {
    content: `Long context marker ${"x".repeat(7_500)}`,
    kind: "note",
    scope: "user:default",
    tags: ["longtopic"],
  });
  memories.push(longMemory);

  const historyBefore = await snapshotHistory(service, memories);
  database.close();

  const session = await runHook({
    hook_event_name: "SessionStart",
    cwd,
    source: "startup",
  });
  assertLineCount(session, 4, "SessionStart bounded autoload");
  assertIncludes(session, "Global bootstrap marker", "SessionStart global autoload");
  assertIncludes(session, "Project bootstrap marker", "SessionStart project autoload");
  assertExcludes(session, unrelatedAutoload.content, "SessionStart unrelated project");
  assertExcludes(session, archivedAutoload.content, "SessionStart archived memory");
  assertExcludes(session, scenarios[0].content, "SessionStart topic-only memory");

  for (const scenario of scenarios) {
    const context = await runHook({
      hook_event_name: "UserPromptSubmit",
      cwd,
      prompt: scenario.query,
    });
    assertIncludes(context, scenario.content, scenario.label);
  }

  const tagContext = await runHook({
    hook_event_name: "UserPromptSubmit",
    cwd,
    prompt: "Open the Edgeflare instructions.",
  });
  assertIncludes(tagContext, tagOnly.content, "tag-only contextual recall");

  const projectContext = await runHook({
    hook_event_name: "UserPromptSubmit",
    cwd,
    prompt: "Show the projecttopic marker.",
  });
  assertIncludes(projectContext, projectOnly.content, "current project scope");
  assertExcludes(projectContext, otherProject.content, "other project scope");
  assertExcludes(projectContext, agentOnly.content, "agent-only scope");

  const archivedContextOutput = await runHookOptional({
    hook_event_name: "UserPromptSubmit",
    cwd,
    prompt: "Show the archivedtopic marker.",
  });
  assertExcludes(archivedContextOutput ?? "", archivedContext.content, "archived contextual memory");

  const boundedContext = await runHook({
    hook_event_name: "UserPromptSubmit",
    cwd,
    prompt: "List every boundedtopic fixture number available in the current context, comma-separated, with no extra text.",
  });
  assertLineCount(boundedContext, hostHookLimits.memories, "context result limit");
  assertEveryMemoryRecordIncludesTag(boundedContext, "boundedtopic", "exact tag ranking");
  if (boundedContext.length > hostHookLimits.contextCharacters) {
    fail(`context exceeded ${hostHookLimits.contextCharacters} characters`);
  }
  for (const item of bounded.slice(hostHookLimits.memories)) {
    assertExcludes(boundedContext, item.content, "bounded result overflow");
  }

  const longContext = await runHook({
    hook_event_name: "UserPromptSubmit",
    cwd,
    prompt: "Show the longtopic marker.",
  });
  if (longContext.length > hostHookLimits.contextCharacters) {
    fail("long memory context exceeded the total output bound");
  }
  if (longContext.includes("x".repeat(hostHookLimits.memoryCharacters + 1))) {
    fail("long memory content exceeded the per-memory output bound");
  }

  const noMatch = await runHookOptional({
    hook_event_name: "UserPromptSubmit",
    cwd,
    prompt: "quasarvoid999xyz",
  });
  if (noMatch !== null) {
    fail(`no-match prompt injected unexpected context: ${JSON.stringify(noMatch)}`);
  }

  const malformed = await invokeHook([], "not-json");
  assertFailOpen(malformed, "malformed hook input");
  const oversized = await invokeHook([], "x".repeat(hostHookLimits.inputCharacters + 1));
  assertFailOpen(oversized, "oversized hook input");
  const missingStore = await invokeHook([], JSON.stringify({
    hook_event_name: "SessionStart",
    cwd,
    source: "startup",
  }), join(testRoot, "missing", "memories.sqlite"));
  if (missingStore.status !== 0 || missingStore.stdout !== "" || missingStore.stderr !== "") {
    fail(`missing store was not silent and fail-open: ${JSON.stringify(missingStore)}`);
  }

  const doctor = await invokeHook(["--doctor"], "");
  const doctorReport = JSON.parse(doctor.stdout);
  if (
    doctor.status !== 0 ||
    doctorReport.status !== "ready" ||
    doctorReport.mode !== "read_only" ||
    doctorReport.host_trust !== "verify_in_host"
  ) {
    fail(`hook doctor failed: stdout=${JSON.stringify(doctor.stdout)} stderr=${JSON.stringify(doctor.stderr)}`);
  }

  const verificationDatabase = new SQLiteMemoryDatabase({ path: storePath });
  const verificationService = createService(verificationDatabase);
  const historyAfter = await snapshotHistory(verificationService, memories);
  verificationDatabase.close();
  if (JSON.stringify(historyAfter) !== JSON.stringify(historyBefore)) {
    fail("recall hooks changed memory audit history");
  }

  console.log(
    `Host hook matrix passed: ${memories.length} memories, ${scenarios.length + 11} scenarios`,
  );
  if (keepFixtures) {
    console.log(`Fixture root: ${testRoot}`);
    console.log(`Fixture store: ${storePath}`);
    console.log(`Fixture project: ${cwd}`);
  }
} finally {
  if (!keepFixtures) {
    rmSync(testRoot, { recursive: true, force: true });
  }
}

function createService(database) {
  return createMemoryService({
    store: database,
    searchIndex: database,
    auditLog: database,
    clock: new SystemClock(),
    ids: new RandomIdGenerator(),
    policy: new DefaultPolicyEngine(new RegexSecretScanner()),
    transactions: database,
  });
}

function remember(service, input) {
  return service.remember({
    ...input,
    source: "test:host-hook-matrix",
  });
}

async function snapshotHistory(service, items) {
  return Object.fromEntries(await Promise.all(items.map(async (item) => [
    item.id,
    (await service.history(item.id)).map((event) => event.eventType),
  ])));
}

async function runHook(input) {
  const context = await runHookOptional(input);
  if (context === null) {
    fail(`hook returned no context for ${JSON.stringify(input)}`);
  }
  return context;
}

async function runHookOptional(input) {
  const result = await invokeHook([], JSON.stringify(input));
  if (result.status !== 0 || result.stderr !== "") {
    fail(`hook failed: stdout=${JSON.stringify(result.stdout)} stderr=${JSON.stringify(result.stderr)}`);
  }
  if (result.stdout === "") {
    return null;
  }
  const output = JSON.parse(result.stdout);
  if (output.hookSpecificOutput?.hookEventName !== input.hook_event_name) {
    fail(`hook returned the wrong event: ${result.stdout}`);
  }
  return output.hookSpecificOutput.additionalContext;
}

async function invokeHook(args, input, memoryStore = storePath) {
  let stdout = "";
  let stderr = "";
  const status = await runHostHookProcess(args, input, {
    stdout: (message) => { stdout += `${message}\n`; },
    stderr: (message) => { stderr += `${message}\n`; },
  }, {
    ...process.env,
    NUZO_MEMORY_STORE: memoryStore,
  });
  return { status, stdout: stdout.trim(), stderr: stderr.trim() };
}

function assertLineCount(value, expected, label) {
  const records = parseMemoryRecords(value, label);
  if (records.length !== expected) {
    fail(`${label} expected ${expected} memories, got ${records.length}: ${JSON.stringify(value)}`);
  }
}

function assertEveryMemoryRecordIncludesTag(value, expected, label) {
  const records = parseMemoryRecords(value, label);
  if (!records.every((record) => record.tags.includes(expected))) {
    fail(`${label} included lower-priority results: ${JSON.stringify(records)}`);
  }
}

function parseMemoryRecords(value, label) {
  const lines = value.split("\n");
  const beginIndex = lines.indexOf(hostHookMemoryEnvelope.begin);
  const endIndexes = lines
    .map((line, index) => line === hostHookMemoryEnvelope.end ? index : -1)
    .filter((index) => index >= 0);
  if (beginIndex < 0 || endIndexes.length !== 1 || endIndexes[0] <= beginIndex) {
    fail(`${label} has an invalid memory envelope: ${JSON.stringify(value)}`);
  }
  try {
    return lines.slice(beginIndex + 1, endIndexes[0]).map((line) => JSON.parse(line));
  } catch (error) {
    fail(`${label} has an invalid JSON memory record: ${String(error)}`);
  }
}

function assertFailOpen(result, label) {
  if (result.status !== 0 || result.stdout !== "" || !result.stderr.startsWith("Nuzo recall hook skipped:")) {
    fail(`${label} did not fail open: ${JSON.stringify(result)}`);
  }
}

function assertIncludes(value, expected, label) {
  if (!value.includes(expected)) {
    fail(`${label} was not recalled: ${JSON.stringify(value)}`);
  }
}

function assertExcludes(value, unexpected, label) {
  if (value.includes(unexpected)) {
    fail(`${label} was unexpectedly recalled: ${JSON.stringify(value)}`);
  }
}

function fail(message) {
  throw new Error(`Host hook continuity validation failed: ${message}`);
}
