# Nuzo Memory Export Example

This file uses fake data and is safe to commit.

```yaml
format: nuzo-memory-export
version: 1
exported_at: 2026-06-11T00:00:00Z
scope: user:default
```

## Memories

### mem_example_001

```yaml
kind: preference
tags:
  - codex
  - workflow
source: example
confidence: 1.0
created_at: 2026-06-11T00:00:00Z
updated_at: 2026-06-11T00:00:00Z
```

The user prefers explicit confirmation before saving personal memories.

### mem_example_002

```yaml
kind: project_decision
tags:
  - architecture
  - storage
source: example
confidence: 1.0
created_at: 2026-06-11T00:00:00Z
updated_at: 2026-06-11T00:00:00Z
```

The project stores runtime memory outside Git by default.
