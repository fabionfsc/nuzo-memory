import { NuzoMemoryError } from "@nuzo/memory-core";
import type { CliIO } from "./cli-io.js";

export const cliExitCodes = {
  success: 0,
  operationalError: 1,
  usageError: 2,
  internalError: 70,
} as const;

export function withErrorHandling<Args extends unknown[]>(
  io: CliIO,
  action: (...args: Args) => Promise<void>,
) {
  return async (...args: Args): Promise<void> => {
    try {
      await action(...args);
    } catch (error) {
      if (error instanceof NuzoMemoryError) {
        io.stderr(`${error.code}: ${error.message}`);
        process.exitCode = cliExitCodes.operationalError;
        return;
      }
      throw error;
    }
  };
}
