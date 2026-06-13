# Product Vision

Nuzo gives AI agents persistent memory that is local, inspectable, and controlled by the user.

The system should feel familiar to users of modern AI assistant memory patterns: agents can remember stable preferences, important facts, and project decisions across sessions. Nuzo is designed for local execution, open repositories, and agent interoperability from the start.

For how Nuzo relates to built-in assistant memory features, see [Positioning](positioning.md).

## Target Users

- Developers using Codex or other coding agents across repeated sessions.
- Power users who want assistant memory without opaque cloud storage.
- Teams that want project-level agent memory with audit trails.
- Agent builders who need a simple MCP-compatible memory backend.

## Core Promise

The user should always be able to answer:

- What does the agent remember?
- Why was this memory saved?
- Where is it stored?
- Which agent or command created it?
- When was it last used?
- How do I edit, export, or delete it?

## Non-Goals For The MVP

- Cloud sync.
- Fully automatic hidden memory.
- Social sharing of real user memory stores.
- Complex graph memory as the default.
- Mandatory embeddings or remote LLM calls.

## Product Differentiation

Nuzo should be positioned as:

- local-first memory for agents;
- managed and auditable by design;
- MCP-native;
- GitHub-friendly without committing private memories;
- simple enough to inspect with standard tools.
