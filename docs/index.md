<section class="nuzo-hero">
  <div class="nuzo-hero__copy" markdown>
  <p class="nuzo-eyebrow">Local-first memory for AI agents</p>
  <h1>Nuzo</h1>
  <p class="nuzo-lead">Inspectable, portable memory for Codex, Claude Code, and MCP-compatible agents. Built for developer workflows where useful context should not become hidden state.</p>
  <p class="nuzo-actions">
    <a href="getting-started/" class="nuzo-button">Get started</a>
    <a href="spec/tools/" class="nuzo-button nuzo-button--secondary">Tool contract</a>
  </p>
  </div>
  <div class="nuzo-hero__panel" markdown>
  <img src="assets/logo.svg" alt="Nuzo" class="nuzo-hero__logo">
  <div class="nuzo-progress" aria-label="MVP progress 100 percent">
    <span style="width: 100%"></span>
  </div>
  <p class="nuzo-progress__label"><strong>100%</strong> MVP 0.1.0 released</p>
  <div class="nuzo-stats" markdown>
  <span><strong>11</strong> MCP tools</span>
  <span><strong>0</strong> telemetry</span>
  <span><strong>2</strong> priority hosts</span>
  </div>
  </div>
</section>

## Why

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

Nuzo `0.1.0` is the first public MVP release. It includes a TypeScript core package, a local CLI backed by SQLite, an MCP server, host plugin artifacts, and published npm runtime packages.

| Area | State |
| --- | --- |
| Core | Memory lifecycle, policy checks, SQLite storage, FTS search, tests. |
| CLI | User/project init, lifecycle commands, audit history, dry-run bulk forget, portability, and diagnostics. |
| MCP | 11 stdio tools covering recall, lifecycle, audit history, bulk safety, portability, and diagnostics. |
| Host Plugins | Codex and Claude Code artifacts install through isolated official marketplace flows and connect to the published MCP runtime. |
| Release | `0.1.0` packages, tag, CI, Pages, plugin packaging, and release-state checks. |
| Next | Public marketplace distribution, trusted publishing, scoped authorization, concurrency control, and field feedback. |

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
