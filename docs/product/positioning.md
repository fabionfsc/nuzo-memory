# Positioning

Nuzo is a local-first memory layer for AI agents that need explicit user control, auditability, and interoperability.

It is not meant to compete with every built-in memory feature in AI assistants. Built-in memory can be useful when it is available, but it is usually tied to one product surface, one account, and one vendor-controlled implementation. Nuzo focuses on the cases where users and agent builders need memory they can inspect, edit, export, delete, and connect to multiple tools.

## Built-In Assistant Memory vs Nuzo

| Area | Built-in assistant memory | Nuzo |
| --- | --- | --- |
| Scope | Usually tied to one assistant or product. | Designed for Codex, Claude Code, MCP-compatible agents, and local tooling. |
| Storage | Implementation details may be hidden or product-specific. | Local SQLite store with documented schema and export formats. |
| Control | User controls depend on the product surface. | CLI and future MCP tools expose list, update, forget, export, import, and doctor. |
| Auditability | Often optimized for convenience. | Every memory should be inspectable with metadata and audit events. |
| Portability | May not move cleanly between agents. | Built around documented contracts and open package boundaries. |
| Defaults | May depend on account, rollout, or product settings. | No telemetry, sync, embeddings, or network calls by default. |

## Complement, Not Replacement

Nuzo should be presented as a complement to native assistant memory:

- use native memory when the assistant already provides a good built-in experience;
- use Nuzo when memory must be local, auditable, portable, or shared across agent tools;
- use Nuzo when project-level memory should live near a repository without committing runtime memory files;
- use Nuzo when an agent integration needs a stable MCP-facing memory contract.

## Product Boundary

Nuzo should not claim to know or replace private product internals. If an AI assistant exposes its own memory feature, Nuzo can still provide value as the user-owned memory layer outside that product boundary.

Portability means Nuzo-managed memory can move between hosts that run Nuzo, such as Codex and Claude Code. It does not mean Nuzo can automatically read or convert a vendor's private native memory store.

The practical message is:

```text
Built-in memory is convenient.
Nuzo is controlled, inspectable, and portable.
```

## Messaging Rule

Use **Nuzo** as the product name. Use `memory` as the capability.

Good:

- "Nuzo is a local-first memory layer for AI agents."
- "Nuzo complements built-in assistant memory."
- "Nuzo stores memories locally and exposes them through CLI and MCP."
- "Nuzo-managed memory can move across Codex, Claude Code, and future MCP-compatible hosts."

Avoid:

- "Nuzo replaces assistant memory."
- "Nuzo works exactly like a specific product's memory."
- "Nuzo depends on hidden memory behavior from any one assistant."
- "Nuzo imports private native memory from a host without an official export path."
