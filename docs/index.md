<section class="nuzo-hero">
  <img src="assets/logo.svg" alt="Nuzo" class="nuzo-hero__logo">
  <p class="nuzo-eyebrow">Local-first memory for AI agents</p>
  <h1>Nuzo</h1>
  <p class="nuzo-lead">
    Inspectable, portable memory for Codex and MCP-compatible agents.
    Built for developer workflows where useful context should not become hidden state.
  </p>
  <p class="nuzo-actions">
    <a href="getting-started/" class="nuzo-button">Get started</a>
    <a href="spec/tools/" class="nuzo-button nuzo-button--secondary">Tool contract</a>
  </p>
</section>

## Why It Exists

Agents can write code, inspect repositories, run tools, and help make project decisions. But most sessions still start from zero. Nuzo preserves useful context locally so users can inspect, edit, export, and delete what agents remember.

## Principles

<div class="nuzo-grid" markdown>

<div class="nuzo-card" markdown>
### Local
Memories live on the user's machine by default.
</div>

<div class="nuzo-card" markdown>
### Auditable
Every memory should expose content, scope, source, metadata, and history.
</div>

<div class="nuzo-card" markdown>
### Portable
Import/export formats are documented instead of opaque.
</div>

<div class="nuzo-card" markdown>
### Agent-ready
The integration boundary is a stable MCP tool contract.
</div>

</div>

## Current Focus

Nuzo is in early MVP development. The repository now includes a TypeScript core package and a local CLI backed by SQLite.

| Area | State |
| --- | --- |
| Core | Memory lifecycle, policy checks, SQLite storage, FTS search, tests. |
| CLI | `init`, `remember`, `recall`, `list`, `update`, `forget`, `doctor`. |
| Docs | Product, architecture, specs, operations, and ADRs. |
| Next | JSON export/import, MCP server, Codex plugin wrapper. |

## Runtime Storage

```text
~/.nuzo/memory/memories.sqlite
<project>/.nuzo/memory/memories.sqlite
```

Runtime memory is user-owned state. It is ignored by Git by default and should not be committed.

## Start Reading

- [Getting started](getting-started/index.md)
- [Product vision](product/vision.md)
- [Positioning](product/positioning.md)
- [Architecture overview](architecture/overview.md)
- [Memory model](spec/memory-model.md)
- [Tool contract](spec/tools.md)
- [Roadmap](operations/roadmap.md)
