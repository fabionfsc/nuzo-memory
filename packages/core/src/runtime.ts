import { randomUUID } from "node:crypto";
import type { Clock, IdGenerator } from "./ports.js";

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
