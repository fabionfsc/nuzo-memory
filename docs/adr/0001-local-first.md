# ADR 0001: Local-First Memory

## Status

Accepted.

## Context

Agent memory can contain user preferences, project decisions, personal facts, and sensitive operational context. Storing this remotely by default would make the trust model harder to explain and audit.

## Decision

Nuzo Memory stores memories locally by default.

The default user store is:

```text
~/.nuzo/memory/memories.sqlite
```

The default project store is:

```text
<project>/.nuzo/memory/memories.sqlite
```

## Consequences

- Users can inspect and delete their memory.
- The project can work offline.
- Sync is deferred and must be explicit.
- The system must provide Git safety checks.
