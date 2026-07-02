import { Command, CommanderError } from "commander";
import { defaultIO, type CliIO } from "./cli-io.js";
import { cliExitCodes } from "./errors.js";
import { registerHostCommands } from "./host-commands.js";
import { registerMemoryCommands } from "./memory-commands.js";

export function createProgram(io: CliIO = defaultIO): Command {
  const program = new Command()
    .configureOutput({
      writeOut: (message) => io.stdout(message.trimEnd()),
      writeErr: (message) => io.stderr(message.trimEnd()),
    })
    .exitOverride()
    .name("nuzo")
    .description("Local-first, auditable memory for AI agents.")
    .version("0.9.1");

  registerHostCommands(program, io);
  registerMemoryCommands(program, io);
  return program;
}

export async function runCliProcess(argv: string[], io: CliIO = defaultIO): Promise<number> {
  process.exitCode = cliExitCodes.success;
  const program = createProgram(io);

  try {
    await program.parseAsync(argv, { from: "node" });
    return process.exitCode === cliExitCodes.operationalError
      ? cliExitCodes.operationalError
      : cliExitCodes.success;
  } catch (error) {
    if (error instanceof CommanderError) {
      if (error.code === "commander.helpDisplayed" || error.code === "commander.version") {
        return cliExitCodes.success;
      }
      return cliExitCodes.usageError;
    }

    io.stderr("NUZO_INTERNAL_ERROR: Unexpected CLI failure.");
    return cliExitCodes.internalError;
  }
}
