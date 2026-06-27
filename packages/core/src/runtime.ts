import { createHash, randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import type { Clock, IdGenerator } from "./ports.js";

export function projectScopeFromPath(path: string): `project:${string}` {
  const resolvedPath = resolve(path);
  let normalizedPath = resolvedPath;
  try {
    normalizedPath = realpathSync.native(resolvedPath);
  } catch {
    // Host project paths can be supplied before the directory exists.
  }
  const digest = createHash("sha256").update(normalizedPath).digest("hex").slice(0, 16);
  return `project:${digest}`;
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

export class RandomIdGenerator implements IdGenerator {
  memoryId(): string {
    return `mem_${randomUUID()}`;
  }

  eventId(): string {
    return `evt_${randomUUID()}`;
  }
}
