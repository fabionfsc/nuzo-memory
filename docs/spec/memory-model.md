# Memory Model

## Memory

A memory is a durable record the user expects the agent to use in future sessions.

```json
{
  "id": "mem_01HZY...",
  "scope": "user:default",
  "kind": "preference",
  "content": "The user prefers concise implementation plans before large edits.",
  "tags": ["codex", "workflow"],
  "source": "codex:mcp",
  "confidence": 1.0,
  "created_at": "2026-06-11T00:00:00Z",
  "updated_at": "2026-06-11T00:00:00Z",
  "last_used_at": null,
  "archived_at": null
}
```

## Kinds

- `preference`: stable user preference.
- `project_decision`: durable project decision.
- `fact`: stable fact about the user, project, or environment.
- `instruction`: recurring instruction the agent should follow.
- `note`: general durable note.

## Scopes

- `user:default`: global user memory.
- `project:<path-hash>`: local project memory.
- `agent:<name>`: memory specific to one agent.
- `team:<name>`: future team-level memory.

## Tags

Tags are lightweight labels used for filtering and retrieval.

Recommended initial tags:

- `codex`
- `project`
- `preference`
- `architecture`
- `security`
- `workflow`

## Confidence

Confidence is a number from `0.0` to `1.0`.

The MVP should default explicit user-approved memories to `1.0`.

Inferred or suggested memories should not be saved without confirmation. If saved, they can use lower confidence and include source metadata.

## Lifecycle

```text
suggested -> created -> updated -> archived -> deleted
```

Deletion should support two modes:

- archive: hide from recall but retain audit metadata;
- hard delete: remove content from the store.

## Retrieval Result

Recall responses should include enough context for the agent to use memory responsibly:

```json
{
  "memory": {
    "id": "mem_01HZY...",
    "kind": "preference",
    "content": "The user prefers concise implementation plans before large edits.",
    "tags": ["codex", "workflow"]
  },
  "score": 0.82,
  "scope": "user:default",
  "reason": "Matched query terms: concise, plans, edits"
}
```
