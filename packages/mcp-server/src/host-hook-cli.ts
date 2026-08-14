#!/usr/bin/env node
import { existsSync, readSync, realpathSync } from "node:fs";
import { StringDecoder } from "node:string_decoder";
import { fileURLToPath } from "node:url";
import {
  createMemoryService,
  DefaultPolicyEngine,
  inspectSQLiteMemoryStore,
  RandomIdGenerator,
  RegexSecretScanner,
  resolveNuzoRuntimeConfig,
  schemaVersion,
  SQLiteMemoryDatabase,
  stringifyUntrustedJson,
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

export function readBoundedHookInput(
  fd = 0,
  limit = hostHookLimits.inputCharacters,
): string {
  const decoder = new StringDecoder("utf8");
  const chunks: string[] = [];
  const buffer = Buffer.allocUnsafe(8_192);
  let characters = 0;

  while (true) {
    const remainingCharacters = limit - characters;
    const bytesToRead = Math.min(buffer.length, Math.max(4, remainingCharacters + 4));
    const bytesRead = readSync(fd, buffer, 0, bytesToRead, null);
    if (bytesRead === 0) {
      break;
    }

    const chunk = decoder.write(buffer.subarray(0, bytesRead));
    characters += chunk.length;
    if (characters > limit) {
      throw new Error("Hook input exceeds the supported size.");
    }
    chunks.push(chunk);
  }

  const tail = decoder.end();
  characters += tail.length;
  if (characters > limit) {
    throw new Error("Hook input exceeds the supported size.");
  }
  if (tail.length > 0) {
    chunks.push(tail);
  }

  return chunks.join("");
}

export async function runHostHookProcess(
  args: string[],
  inputText: string,
  io: HookIO = defaultIO,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<number> {
  if (args.includes("--doctor")) {
    const runtimeConfig = resolveNuzoRuntimeConfig({
      environment,
      defaultAuthorizationMode: "restricted",
    });
    const storePath = runtimeConfig.storePath;
    const integrity = formatIntegrityDiagnostics(inspectSQLiteMemoryStore(storePath));
    io.stdout(stringifyUntrustedJson({
      status: integrity.status === "ok" ? "ready" : integrity.status === "missing" ? "store_missing" : "store_unhealthy",
      mode: "read_only",
      store_path: storePath,
      scope: runtimeConfig.scope,
      authorized_scopes: runtimeConfig.authorizedScopes ?? null,
      project_scope: runtimeConfig.projectScope,
      authorization: {
        mode: runtimeConfig.authorizationMode,
        source: runtimeConfig.provenance.authorization,
        allowed_scopes: runtimeConfig.authorizedScopes ?? null,
      },
      config: {
        project_root_source: runtimeConfig.provenance.projectRoot,
        config_source: runtimeConfig.provenance.config,
        store_source: runtimeConfig.provenance.store,
        scope_source: runtimeConfig.provenance.scope,
        adjustments: runtimeConfig.adjustments,
      },
      store_exists: existsSync(storePath),
      integrity,
      supported_events: ["SessionStart", "UserPromptSubmit"],
      host_trust: "verify_in_host",
    }, 2));
    return 0;
  }

  try {
    if (inputText.length > hostHookLimits.inputCharacters) {
      throw new Error("Hook input exceeds the supported size.");
    }
    const input = parseHostHookInput(JSON.parse(inputText));
    const runtimeConfig = resolveNuzoRuntimeConfig({
      environment,
      cwd: input.cwd,
      defaultAuthorizationMode: "restricted",
    });
    const storePath = runtimeConfig.storePath;
    if (!existsSync(storePath)) {
      return 0;
    }
    const database = new SQLiteMemoryDatabase({ path: storePath, readonly: true });
    try {
      const storeSchemaVersion = database.getSchemaVersion();
      if (storeSchemaVersion > schemaVersion) {
        throw new Error(
          `memory schema ${storeSchemaVersion} is newer than supported schema ${schemaVersion}`,
        );
      }
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
      const output = await createHostHookOutput(service, input, {
        projectScope: runtimeConfig.projectScope,
        ...(runtimeConfig.authorizedScopes === undefined
          ? {}
          : { authorizedScopes: runtimeConfig.authorizedScopes }),
      });
      if (output !== null) {
        io.stdout(stringifyUntrustedJson(output));
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
  const inputText = process.argv.includes("--doctor") ? "" : readBoundedHookInput();
  process.exitCode = await runHostHookProcess(process.argv.slice(2), inputText);
}
