import { spawnSync } from "node:child_process";

const firstMemory = "The CLI session continuity smoke stores fake memory across sessions.";
const suggestedMemory = "The CLI session continuity smoke prefers confirmed capture drafts.";
const rejectedMemory = "The CLI session continuity smoke rejects inferred capture drafts.";
const updatedMemory = "The CLI session continuity smoke prefers reviewed capture draft updates.";
const testTag = "session-continuity";

export function assertCliSessionContinuity({
  cwd,
  executable,
  memoryStore,
  label = "Nuzo CLI",
}) {
  runCli(executable, ["memory", "--store", memoryStore, "init"], cwd);

  runCli(
    executable,
    [
      "memory",
      "--store",
      memoryStore,
      "remember",
      firstMemory,
      "--kind",
      "project_decision",
      "--tag",
      testTag,
      "--source",
      "test:cli-session-a",
    ],
    cwd,
  );

  const recalled = runCli(
    executable,
    ["memory", "--store", memoryStore, "recall", "continuity smoke sessions"],
    cwd,
  );
  if (!recalled.stdout.includes(firstMemory)) {
    fail(`${label} session B could not recall memory from session A: ${JSON.stringify(recalled)}`);
  }

  const readySuggestion = runCli(
    executable,
    [
      "memory",
      "--store",
      memoryStore,
      "suggest-capture",
      suggestedMemory,
      "--kind",
      "preference",
      "--tag",
      testTag,
      "--source",
      "test:cli-session-suggestion",
      "--reason",
      "Validates read-only capture suggestions across CLI sessions.",
      "--json",
    ],
    cwd,
  );
  const readySuggestionJson = JSON.parse(readySuggestion.stdout);
  if (
    readySuggestionJson.status !== "ready" ||
    readySuggestionJson.memory_writes !== false ||
    readySuggestionJson.requires_confirmation !== true ||
    readySuggestionJson.duplicate !== null
  ) {
    fail(`${label} capture suggestion failed: ${readySuggestion.stdout}`);
  }

  const afterSuggestionList = runCli(
    executable,
    ["memory", "--store", memoryStore, "list", "--tag", testTag],
    cwd,
  );
  if (afterSuggestionList.stdout.includes(suggestedMemory)) {
    fail(`${label} suggest-capture wrote memory before confirmation`);
  }

  const rejected = runCli(
    executable,
    [
      "memory",
      "--store",
      memoryStore,
      "confirm-capture",
      rejectedMemory,
      "--decision",
      "reject",
      "--kind",
      "note",
      "--tag",
      testTag,
      "--source",
      "test:cli-session-rejected",
      "--reason",
      "Validates explicit rejected capture decisions do not persist.",
      "--json",
    ],
    cwd,
  );
  const rejectedJson = JSON.parse(rejected.stdout);
  if (
    rejectedJson.decision !== "reject" ||
    rejectedJson.status !== "skipped" ||
    rejectedJson.memory_writes !== false ||
    rejectedJson.memory !== null
  ) {
    fail(`${label} rejected capture decision wrote memory: ${rejected.stdout}`);
  }

  const confirmed = runCli(
    executable,
    [
      "memory",
      "--store",
      memoryStore,
      "confirm-capture",
      suggestedMemory,
      "--decision",
      "create",
      "--kind",
      "preference",
      "--tag",
      testTag,
      "--source",
      "test:cli-session-confirmed",
      "--reason",
      "Validates confirmed capture creates through the CLI decision command.",
      "--yes",
      "--json",
    ],
    cwd,
  );
  const confirmedJson = JSON.parse(confirmed.stdout);
  if (
    confirmedJson.decision !== "create" ||
    confirmedJson.status !== "created" ||
    confirmedJson.memory_writes !== true ||
    typeof confirmedJson.memory?.id !== "string" ||
    confirmedJson.memory.revision !== 1
  ) {
    fail(`${label} confirmed capture did not create memory: ${confirmed.stdout}`);
  }

  const updated = runCli(
    executable,
    [
      "memory",
      "--store",
      memoryStore,
      "confirm-capture",
      updatedMemory,
      "--decision",
      "update",
      "--kind",
      "preference",
      "--tag",
      testTag,
      "--tag",
      "updated",
      "--source",
      "test:cli-session-confirmed-update",
      "--reason",
      "Validates confirmed capture updates with the displayed revision.",
      "--target-memory-id",
      confirmedJson.memory.id,
      "--expected-revision",
      String(confirmedJson.memory.revision),
      "--yes",
      "--json",
    ],
    cwd,
  );
  const updatedJson = JSON.parse(updated.stdout);
  if (
    updatedJson.decision !== "update" ||
    updatedJson.status !== "updated" ||
    updatedJson.memory_writes !== true ||
    updatedJson.memory?.id !== confirmedJson.memory.id ||
    updatedJson.memory.content !== updatedMemory ||
    updatedJson.memory.revision !== 2
  ) {
    fail(`${label} confirmed capture update failed: ${updated.stdout}`);
  }

  assertCliExit(
    executable,
    [
      "memory",
      "--store",
      memoryStore,
      "confirm-capture",
      "This stale CLI update must not commit.",
      "--decision",
      "update",
      "--kind",
      "preference",
      "--source",
      "test:cli-session-stale-update",
      "--reason",
      "Validates stale confirmed CLI updates return conflict guidance.",
      "--target-memory-id",
      confirmedJson.memory.id,
      "--expected-revision",
      String(confirmedJson.memory.revision),
      "--yes",
    ],
    cwd,
    1,
    "MEMORY_REVISION_CONFLICT",
  );

  const duplicateSuggestion = runCli(
    executable,
    [
      "memory",
      "--store",
      memoryStore,
      "suggest-capture",
      " the CLI session continuity smoke prefers reviewed   capture draft updates. ",
      "--kind",
      "note",
      "--reason",
      "Validates exact duplicate detection across CLI sessions.",
      "--json",
    ],
    cwd,
  );
  const duplicateSuggestionJson = JSON.parse(duplicateSuggestion.stdout);
  if (
    duplicateSuggestionJson.status !== "duplicate" ||
    !duplicateSuggestionJson.duplicate?.id ||
    duplicateSuggestionJson.duplicate.content !== updatedMemory
  ) {
    fail(`${label} duplicate suggestion failed: ${duplicateSuggestion.stdout}`);
  }

  const doctor = runCli(
    executable,
    ["memory", "--store", memoryStore, "doctor"],
    cwd,
    { NUZO_DOCTOR_SKIP_GIT: "1" },
  );
  if (!doctor.stdout.includes("Status: ok")) {
    fail(`${label} doctor did not report a healthy temporary store: ${doctor.stdout}`);
  }
  for (const memoryContent of [firstMemory, suggestedMemory]) {
    if (doctor.stdout.includes(memoryContent)) {
      fail(`${label} doctor exposed memory content`);
    }
  }
}

function assertCliExit(executable, args, cwd, expectedStatus, expectedError) {
  const invocation = commandInvocation(executable, args);
  const result = spawnSync(invocation.command, invocation.args, {
    cwd,
    encoding: "utf8",
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== expectedStatus) {
    fail(
      `expected CLI status ${expectedStatus}, got ${result.status}; stderr=${JSON.stringify(result.stderr)}`,
    );
  }
  if (!result.stderr.includes(expectedError)) {
    fail(`expected CLI stderr to include ${expectedError}: ${JSON.stringify(result.stderr)}`);
  }
}

export function runCli(command, args, cwd, env = {}) {
  const invocation = commandInvocation(command, args);
  const result = spawnSync(invocation.command, invocation.args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      ...env,
    },
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

function commandInvocation(command, args) {
  if (typeof command === "string") {
    return { command, args };
  }
  return {
    command: command.command,
    args: [...command.args, ...args],
  };
}

function fail(message) {
  throw new Error(`CLI session continuity validation failed: ${message}`);
}
