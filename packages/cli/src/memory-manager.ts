import type {
  MemoryEvent,
  MemoryKind,
  MemoryRecord,
  MemoryScope,
  MemoryService,
} from "@nuzo/memory-core";

export interface MemoryManagerChoice {
  value: string;
  label: string;
}

export interface MemoryManagerIO {
  write(message: string): void;
  choose(prompt: string, choices: MemoryManagerChoice[], defaultValue?: string): Promise<string>;
  input(prompt: string, defaultValue?: string): Promise<string>;
  confirm(prompt: string, confirmation?: string): Promise<boolean>;
}

export interface MemoryManagerTransferActions {
  exportJson(path: string, includeArchived: boolean): Promise<number>;
  importJson(path: string, dryRun: boolean): Promise<{ imported: number; skipped: number }>;
}

export interface MemoryManagerOptions {
  service: MemoryService;
  io: MemoryManagerIO;
  scope?: MemoryScope;
  transfers: MemoryManagerTransferActions;
}

const kinds: MemoryKind[] = [
  "preference",
  "project_decision",
  "fact",
  "instruction",
  "note",
];

export async function runMemoryManager(options: MemoryManagerOptions): Promise<void> {
  const { io, scope } = options;
  io.write("Nuzo memory manager");
  io.write(`Scope: ${scope ?? "all authorized local scopes"}`);
  io.write("Changes use the same local store and core contracts as the CLI and host plugins.");

  while (true) {
    const action = await io.choose("Main menu", [
      { value: "browse", label: "Browse active memories" },
      { value: "search", label: "Search memories" },
      { value: "archived", label: "Browse archived memories" },
      { value: "audit", label: "Review recent audit events" },
      { value: "export", label: "Export memories to JSON" },
      { value: "import", label: "Import memories from JSON" },
      { value: "exit", label: "Exit" },
    ], "browse");

    if (action === "exit") {
      io.write("Memory manager closed.");
      return;
    }
    if (action === "browse") await browseMemories(options, false);
    if (action === "archived") await browseMemories(options, true);
    if (action === "search") await searchMemories(options);
    if (action === "audit") await showAudit(options);
    if (action === "export") await exportMemories(options);
    if (action === "import") await importMemories(options);
  }
}

async function browseMemories(options: MemoryManagerOptions, archived: boolean): Promise<void> {
  const memories = (await options.service.list({
    ...(options.scope === undefined ? {} : { scope: options.scope }),
    includeArchived: archived,
    limit: 100,
  })).filter((memory) => archived ? memory.archivedAt !== null : memory.archivedAt === null);
  await chooseMemory(options, memories, archived ? "Archived memories" : "Active memories");
}

async function searchMemories(options: MemoryManagerOptions): Promise<void> {
  const query = (await options.io.input("Search query")).trim();
  if (query.length === 0) {
    options.io.write("Search cancelled: enter at least one term.");
    return;
  }

  let memories: MemoryRecord[];
  if (options.scope !== undefined) {
    memories = (await options.service.recall({
      query,
      scope: options.scope,
      limit: 20,
      recordUsage: false,
    })).map((result) => result.memory);
  } else {
    const terms = query.toLocaleLowerCase().split(/\s+/u).filter(Boolean);
    memories = (await options.service.list({ includeArchived: false, limit: 500 }))
      .filter((memory) => {
        const searchable = `${memory.content} ${memory.tags.join(" ")} ${memory.kind} ${memory.scope}`.toLocaleLowerCase();
        return terms.every((term) => searchable.includes(term));
      })
      .slice(0, 20);
  }
  await chooseMemory(options, memories, "Search results");
}

async function chooseMemory(
  options: MemoryManagerOptions,
  memories: MemoryRecord[],
  title: string,
): Promise<void> {
  if (memories.length === 0) {
    options.io.write(`${title}: none found.`);
    return;
  }
  const selected = await options.io.choose(title, [
    ...memories.slice(0, 20).map((memory) => ({
      value: memory.id,
      label: `${shortId(memory.id)} · ${memory.scope} · ${memory.kind} · ${truncate(memory.content, 72)}`,
    })),
    { value: "back", label: "Back" },
  ], "back");
  if (selected === "back") return;
  const memory = memories.find((candidate) => candidate.id === selected);
  if (memory !== undefined) await manageMemory(options, memory);
}

async function manageMemory(options: MemoryManagerOptions, initial: MemoryRecord): Promise<void> {
  let memory = initial;
  while (true) {
    showMemory(options.io, memory);
    const action = await options.io.choose("Memory actions", [
      { value: "edit", label: "Edit content, kind, and tags" },
      { value: "history", label: "Review history" },
      ...(memory.archivedAt === null ? [{ value: "archive", label: "Archive" }] : []),
      { value: "delete", label: "Delete permanently" },
      { value: "back", label: "Back" },
    ], "back");

    if (action === "back") return;
    if (action === "history") await showHistory(options, memory.id);
    if (action === "edit") memory = await editMemory(options, memory);
    if (action === "archive") {
      const confirmed = await options.io.confirm(`Archive ${shortId(memory.id)}?`);
      if (!confirmed) {
        options.io.write("Archive cancelled.");
        continue;
      }
      await options.service.forget({
        id: memory.id,
        expectedRevision: memory.revision,
        mode: "archive",
        actor: "nuzo:cli-manager",
        reason: "Confirmed in the interactive memory manager.",
      });
      options.io.write(`Archived ${memory.id}.`);
      return;
    }
    if (action === "delete") {
      const confirmed = await options.io.confirm(
        `Permanently delete ${shortId(memory.id)}? This cannot be undone.`,
        "DELETE",
      );
      if (!confirmed) {
        options.io.write("Delete cancelled.");
        continue;
      }
      await options.service.forget({
        id: memory.id,
        expectedRevision: memory.revision,
        mode: "delete",
        confirm: true,
        actor: "nuzo:cli-manager",
        reason: "Explicit permanent deletion in the interactive memory manager.",
      });
      options.io.write(`Deleted ${memory.id}.`);
      return;
    }
  }
}

async function editMemory(options: MemoryManagerOptions, memory: MemoryRecord): Promise<MemoryRecord> {
  const content = (await options.io.input("Content", memory.content)).trim();
  const kind = await options.io.choose(
    "Kind",
    kinds.map((value) => ({ value, label: value })),
    memory.kind,
  ) as MemoryKind;
  const tags = parseTags(await options.io.input("Tags (comma separated)", memory.tags.join(", ")));
  const updated = await options.service.update({
    id: memory.id,
    expectedRevision: memory.revision,
    content,
    kind,
    tags,
    actor: "nuzo:cli-manager",
  });
  options.io.write(`Updated ${updated.id} to revision ${updated.revision}.`);
  return updated;
}

async function showHistory(options: MemoryManagerOptions, id: string): Promise<void> {
  const events = await options.service.history(id, { limit: 50 });
  options.io.write(`History for ${id}:`);
  for (const event of events) options.io.write(formatEvent(event));
}

async function showAudit(options: MemoryManagerOptions): Promise<void> {
  const events = await options.service.audit({
    ...(options.scope === undefined ? {} : { scope: options.scope }),
    limit: 50,
  });
  options.io.write("Recent audit events:");
  if (events.length === 0) options.io.write("No audit events found.");
  for (const event of events) options.io.write(formatEvent(event));
}

async function exportMemories(options: MemoryManagerOptions): Promise<void> {
  const path = (await options.io.input("Export path", "nuzo-memory.export.json")).trim();
  if (path.length === 0) {
    options.io.write("Export cancelled.");
    return;
  }
  const includeArchived = await options.io.confirm("Include archived memories?");
  const count = await options.transfers.exportJson(path, includeArchived);
  options.io.write(`Exported ${count} memories to ${path}.`);
}

async function importMemories(options: MemoryManagerOptions): Promise<void> {
  const path = (await options.io.input("Import path")).trim();
  if (path.length === 0) {
    options.io.write("Import cancelled.");
    return;
  }
  const preview = await options.transfers.importJson(path, true);
  options.io.write(`Import preview: ${preview.imported} new, ${preview.skipped} skipped.`);
  if (preview.imported === 0 || !await options.io.confirm("Apply this import?")) {
    options.io.write("Import not applied.");
    return;
  }
  const applied = await options.transfers.importJson(path, false);
  options.io.write(`Imported ${applied.imported} memories; skipped ${applied.skipped}.`);
}

function showMemory(io: MemoryManagerIO, memory: MemoryRecord): void {
  io.write("");
  io.write(`ID: ${memory.id}`);
  io.write(`Revision: ${memory.revision}`);
  io.write(`Scope: ${memory.scope}`);
  io.write(`Kind: ${memory.kind}`);
  io.write(`Tags: ${memory.tags.length === 0 ? "none" : memory.tags.join(", ")}`);
  io.write(`Status: ${memory.archivedAt === null ? "active" : "archived"}`);
  io.write(`Content: ${memory.content}`);
}

function formatEvent(event: MemoryEvent): string {
  return `${event.createdAt.toISOString()} · ${event.eventType} · ${event.actor} · ${event.memoryId ?? "store"}`;
}

function parseTags(value: string): string[] {
  return [...new Set(value.split(",").map((tag) => tag.trim()).filter(Boolean))];
}

function shortId(id: string): string {
  return id.length <= 16 ? id : `${id.slice(0, 16)}…`;
}

function truncate(value: string, length: number): string {
  return value.length <= length ? value : `${value.slice(0, length - 1)}…`;
}
