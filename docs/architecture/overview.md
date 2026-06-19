# Architecture Overview

Nuzo is split into a small core and multiple interfaces.

```text
Agent / User
    |
    | MCP tools / CLI commands / optional HTTP
    v
Interface Layer
    |
    v
Core Memory Service
    |
    +-- Storage Adapter
    +-- Search Adapter
    +-- Audit Log
    +-- Policy Engine
    +-- Transaction Manager
    |
    v
Local Store
```

## Components

### Core Memory Service

Owns the memory lifecycle:

- validation;
- deduplication;
- scope resolution;
- storage;
- search;
- update;
- deletion;
- audit events.

### Storage Adapter

The MVP storage adapter uses SQLite. The adapter boundary keeps the project open to future storage backends without changing the MCP contract.

### Search Adapter

The MVP uses SQLite FTS for local full-text search. Embeddings can be added later as an optional second adapter.

### Transaction Manager

The core groups each logical mutation behind a storage-neutral transaction
port. The SQLite adapter commits memory rows, FTS changes, and audit events
together or rolls them all back.

Stateful writes use optimistic concurrency. Memory rows carry a monotonically
increasing revision, and update/archive/delete operations compare the last read
revision with the row that is committed. A mismatch returns
`MEMORY_REVISION_CONFLICT` so agents can re-read and ask for confirmation
instead of overwriting a newer local change.

### Policy Engine

The policy engine decides whether a memory action is allowed, suggested, blocked, or requires confirmation.

Early policies:

- do not store secrets;
- do not store credentials;
- prefer explicit user approval for personal facts;
- block memory writes in disabled scopes;
- warn before destructive deletes.

### MCP Server

The MCP server exposes memory operations to agents.

It should be thin: parse tool arguments, call the core service, and return structured results.

### CLI

The CLI is the user-facing control plane.

It should support:

- direct memory management;
- diagnostics;
- export/import;
- migrations;
- Git safety checks.

### Host Plugins

Host plugins package the MCP server and defaults so agent hosts can use Nuzo without custom wiring.

Codex and Claude Code are the first host packages. Both support MCP-based extension paths, and both Nuzo packages should stay thin wrappers around the same MCP server.

Host plugins are wrappers. They must not contain memory business logic.

## Default Flow

1. Agent identifies something potentially worth remembering.
2. Agent asks the user for confirmation or receives explicit user instruction.
3. MCP tool calls `memory.remember`.
4. Core validates and stores the memory.
5. Audit log records the write.
6. Future sessions call `memory.recall` with task context.
7. User can inspect or delete the memory through CLI or MCP.
