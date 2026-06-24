import { spawnSync } from "node:child_process";

const firstMemory = "The CLI session continuity smoke stores fake memory across sessions.";
const suggestedMemory = "The CLI session continuity smoke prefers confirmed capture drafts.";
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

  runCli(
    executable,
    [
      "memory",
      "--store",
      memoryStore,
      "remember",
      suggestedMemory,
      "--kind",
      "preference",
      "--tag",
      testTag,
      "--source",
      "test:cli-session-confirmed",
    ],
    cwd,
  );

  const duplicateSuggestion = runCli(
    executable,
    [
      "memory",
      "--store",
      memoryStore,
      "suggest-capture",
      " the CLI session continuity smoke prefers confirmed   capture drafts. ",
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
    duplicateSuggestionJson.duplicate.content !== suggestedMemory
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

export function runCli(command, args, cwd, env = {}) {
  const result = spawnSync(command, args, {
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

function fail(message) {
  throw new Error(`CLI session continuity validation failed: ${message}`);
}
