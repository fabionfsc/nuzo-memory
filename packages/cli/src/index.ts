#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runCliProcess } from "./program.js";

export {
  createProgram,
  runCliProcess,
} from "./program.js";
export { cliExitCodes } from "./errors.js";
export { type CliIO } from "./cli-io.js";
export {
  setupHostsFromOptions,
  type HostTargetCommandOptions,
  type SetupCommandOptions,
} from "./host-targets.js";

if (isMain()) {
  process.exitCode = await runCliProcess(process.argv);
}

function isMain(): boolean {
  const entrypoint = process.argv[1];
  if (entrypoint === undefined) return false;

  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(entrypoint);
  } catch {
    return false;
  }
}
