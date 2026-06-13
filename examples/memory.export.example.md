# Nuzo Memory Export

This file uses fake data and is safe to commit.
Use JSON exports for import.

```yaml
format: nuzo-memory-export
version: 1
exported_at: "2026-06-11T00:00:00.000Z"
count: 2
```

## Memories

### Memory 1

```yaml
scope: "user:default"
kind: "preference"
tags:
  - "codex"
  - "workflow"
source: "example"
confidence: 1
created_at: "2026-06-11T00:00:00.000Z"
updated_at: "2026-06-11T00:00:00.000Z"
last_used_at: null
archived_at: null
```

The user prefers explicit confirmation before saving personal memories.

### Memory 2

```yaml
scope: "project:nuzo"
kind: "project_decision"
tags:
  - "architecture"
  - "storage"
source: "example"
confidence: 1
created_at: "2026-06-11T00:00:00.000Z"
updated_at: "2026-06-11T00:00:00.000Z"
last_used_at: null
archived_at: null
```

The project stores runtime memory outside Git by default.
