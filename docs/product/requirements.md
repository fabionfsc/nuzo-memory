# Requirements

## MVP Requirements

- Store user-level memories under `~/.nuzo/memory/`.
- Support project-level memories under `<project>/.nuzo/memory/`.
- Expose memory operations through MCP tools.
- Provide a CLI for users to inspect and manage memory outside an agent.
- Keep memory files out of Git by default.
- Record metadata for every memory.
- Support export/import using a documented text format.
- Allow deletion by ID, scope, tag, or all memories.
- Support full-text search without embeddings.
- Include a migration mechanism for schema changes.

## Memory Operations

- Remember a fact, preference, decision, or note.
- Recall relevant memories for a query.
- List memories by scope, tag, agent, or project.
- Update a memory.
- Forget a memory.
- Export memories.
- Import memories.
- Show an audit trail for memory changes.
- Manage the lifecycle interactively from a terminal through the same core use
  cases and local store.

## Quality Requirements

- Deterministic storage path resolution.
- No telemetry by default.
- No network access by default.
- Clear dry-run mode for destructive actions.
- Human-readable errors.
- Tests for storage, search, import/export, and MCP contracts.

## Optional Capabilities

- Keep SQLite FTS as the default retrieval path.
- Allow explicit local semantic or hybrid retrieval through a disposable,
  rebuildable derived index.
- Keep model provisioning separate from rebuild and recall, with no implicit
  network access.

## Future Requirements

- Optional sync provider.
- Browser memory manager only after the stable CLI-first workflow is proven.
- Agent-specific policies.
- Team-level memory stores.

Built-in encrypted storage was evaluated and not selected for the final
upstream release. See
[Encrypted Local Stores Decision](../architecture/encrypted-local-stores.md)
for the threat model, option comparison, and operator alternative. Items in
this section are historical product direction, not post-`1.2.0` commitments.
