#!/usr/bin/env node
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createMemoryService,
  DefaultPolicyEngine,
  RandomIdGenerator,
  RegexSecretScanner,
  SQLiteMemoryDatabase,
  SystemClock,
} from "@nuzo/memory-core";
import {
  createHostHookOutput,
  hostHookLimits,
  parseHostHookInput,
} from "./host-hook.js";

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
  const storePath = resolve(environment.NUZO_MEMORY_STORE ?? defaultStorePath());

  if (args.includes("--doctor")) {
    io.stdout(JSON.stringify({
      status: existsSync(storePath) ? "ready" : "store_missing",
      mode: "read_only",
      store_path: storePath,
      store_exists: existsSync(storePath),
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
        policy: new DefaultPolicyEngine(new RegexSecretScanner()),
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

function defaultStorePath(): string {
  return resolve(homedir(), ".nuzo", "memory", "memories.sqlite");
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
