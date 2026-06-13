# Tool Contract

Nuzo should expose the same core operations through MCP and CLI.

## MCP Tools

### `memory.remember`

Store a memory.

Input:

```json
{
  "content": "The user prefers SQLite for local-first prototypes.",
  "kind": "preference",
  "scope": "user:default",
  "tags": ["storage", "architecture"],
  "source": "codex:mcp"
}
```

Output:

```json
{
  "id": "mem_01HZY...",
  "created": true,
  "warnings": []
}
```

### `memory.recall`

Find relevant memories.

Input:

```json
{
  "query": "How should I design local storage for this plugin?",
  "scope": "project:auto",
  "limit": 8,
  "include_global": true
}
```

When `include_global` is true, recall should include the requested scope plus `user:default`. It should not search unrelated project, team, or agent scopes.

Output:

```json
{
  "results": [
    {
      "id": "mem_01HZY...",
      "content": "The user prefers SQLite for local-first prototypes.",
      "score": 0.91,
      "scope": "user:default",
      "reason": "Matched storage and local-first terms."
    }
  ]
}
```

### `memory.list`

List memories by filters.

Input:

```json
{
  "scope": "user:default",
  "tags": ["architecture"],
  "include_archived": false
}
```

### `memory.update`

Edit metadata or content for a memory.

Input:

```json
{
  "id": "mem_01HZY...",
  "content": "The user prefers SQLite for simple local-first prototypes.",
  "tags": ["storage", "architecture", "sqlite"]
}
```

### `memory.forget`

Archive or delete a memory.

Input:

```json
{
  "id": "mem_01HZY...",
  "mode": "archive",
  "reason": "No longer accurate."
}
```

### `memory.export`

Export memories to a documented file format.

Input:

```json
{
  "scope": "user:default",
  "format": "markdown",
  "include_archived": false
}
```

### `memory.import`

Import memories from a documented file format.

Input:

```json
{
  "path": "/absolute/path/to/memory.export.md",
  "scope": "user:default",
  "dry_run": true
}
```

### `memory.doctor`

Run safety and environment checks.

Checks:

- memory path exists;
- schema is current;
- Git is not tracking local memory files;
- exports do not contain obvious secrets;
- MCP server can read and write the selected store.

## CLI Commands

```bash
nuzo memory init
nuzo memory remember "The user prefers concise output." --kind preference --tag codex
nuzo memory recall "output style"
nuzo memory list --tag codex
nuzo memory update mem_01HZY --content "The user prefers concise final answers."
nuzo memory forget mem_01HZY --archive
nuzo memory export --format markdown
nuzo memory import ./memory.export.md --dry-run
nuzo memory doctor
```
