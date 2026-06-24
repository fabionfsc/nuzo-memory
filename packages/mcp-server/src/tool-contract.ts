export const memoryToolNames = [
  "memory.remember",
  "memory.recall",
  "memory.recall_hook",
  "memory.suggest_capture",
  "memory.list",
  "memory.update",
  "memory.history",
  "memory.forget",
  "memory.forget_many",
  "memory.export",
  "memory.import",
  "memory.doctor",
] as const;

export const sortedMemoryToolNames = [...memoryToolNames].sort();

export type MemoryToolName = typeof memoryToolNames[number];
