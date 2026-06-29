#!/usr/bin/env node
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  createMemoryService,
  DefaultPolicyEngine,
  inspectSQLiteMemoryStore,
  RandomIdGenerator,
  RegexSecretScanner,
  resolveNuzoRuntimeConfig,
  SQLiteMemoryDatabase,
  SystemClock,
} from "@nuzo/memory-core";
import {
  createHostHookOutput,
  hostHookLimits,
  parseHostHookInput,
} from "./host-hook.js";
import { formatIntegrityDiagnostics } from "./handlers.js";

interface HookIO {
  stdout(message: string): void;
  stderr(message: string): void;
}

const defaultIO: HookIO = {
  stdout: (message) => console.log(message),
  stderr: (message) => console.error(message),
};

export async function runHostHookProcess(
  args: string[],
  inputText: string,
  io: HookIO = defaultIO,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<number> {
  const runtimeConfig = resolveNuzoRuntimeConfig({ environment });
  const storePath = runtimeConfig.storePath;

  if (args.includes("--doctor")) {
    const integrity = formatIntegrityDiagnostics(inspectSQLiteMemoryStore(storePath));
    io.stdout(JSON.stringify({
      status: integrity.status === "ok" ? "ready" : integrity.status === "missing" ? "store_missing" : "store_unhealthy",
      mode: "read_only",
      store_path: storePath,
      scope: runtimeConfig.scope,
      authorized_scopes: runtimeConfig.authorizedScopes ?? null,
      store_exists: existsSync(storePath),
      integrity,
      supported_events: ["SessionStart", "UserPromptSubmit"],
      host_trust: "verify_in_host",
    }, null, 2));
    return 0;
  }

  if (!existsSync(storePath)) {
    return 0;
  }

  try {
    if (inputText.length > hostHookLimits.inputCharacters) {
      throw new Error("Hook input exceeds the supported size.");
    }
    const input = parseHostHookInput(JSON.parse(inputText));
    const database = new SQLiteMemoryDatabase({ path: storePath });
    try {
      const service = createMemoryService({
        store: database,
        searchIndex: database,
        auditLog: database,
        clock: new SystemClock(),
        ids: new RandomIdGenerator(),
        policy: new DefaultPolicyEngine(
          new RegexSecretScanner(),
          runtimeConfig.authorizedScopes === undefined ? {} : { allowedScopes: runtimeConfig.authorizedScopes },
        ),
        transactions: database,
      });
      const output = await createHostHookOutput(service, input);
      if (output !== null) {
        io.stdout(JSON.stringify(output));
      }
    } finally {
      database.close();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    io.stderr(`Nuzo recall hook skipped: ${message}`);
  }

  return 0;
}

function isMainModule(): boolean {
  const entrypoint = process.argv[1];
  if (entrypoint === undefined) {
    return false;
  }
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(entrypoint);
  } catch {
    return false;
  }
}

if (isMainModule()) {
  const inputText = process.argv.includes("--doctor") ? "" : readFileSync(0, "utf8");
  process.exitCode = await runHostHookProcess(process.argv.slice(2), inputText);
}
