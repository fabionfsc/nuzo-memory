export class NuzoMemoryError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "NuzoMemoryError";
  }
}

export function invariant(
  condition: unknown,
  code: string,
  message: string,
  details: Record<string, unknown> = {},
): asserts condition {
  if (!condition) {
    throw new NuzoMemoryError(code, message, details);
  }
}
