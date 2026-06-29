<section class="nuzo-hero">
  <div class="nuzo-hero__copy" markdown>
  <p class="nuzo-eyebrow">Local-first memory for AI agents</p>
  <h1>Nuzo</h1>
  <p class="nuzo-lead">Inspectable, portable memory for Codex, Claude Code, and MCP-compatible agents. Built for developer workflows where useful context should not become hidden state.</p>
  <p class="nuzo-actions">
    <a href="getting-started/" class="nuzo-button">Get started</a>
    <a href="operations/codex-plugin/" class="nuzo-button nuzo-button--secondary">Agent setup</a>
  </p>
  </div>
  <div class="nuzo-hero__panel" markdown>
  <img src="assets/logo.svg" alt="Nuzo" class="nuzo-hero__logo">
  <div class="nuzo-progress" aria-label="MVP progress 100 percent">
    <span style="width: 100%"></span>
  </div>
  <p class="nuzo-progress__label"><strong>0.6.0</strong> current release</p>
  <div class="nuzo-stats" markdown>
  <span><strong>12</strong> MCP tools</span>
  <span><strong>0</strong> telemetry</span>
  <span><strong>2</strong> priority hosts</span>
  </div>
  </div>
</section>

## Install

```bash
npm install --global @nuzo/memory
```

This installs the `nuzo` CLI, the `nuzo-mcp-server` runtime, and the
`nuzo-memory-hook` runner used by host plugins.

## Agent Setup

Nuzo becomes automatic after the host plugin is installed and trusted.

| Host | Next step |
| --- | --- |
| Codex | Install or enable the `Nuzo` plugin, then trust its hooks. |
| Claude Code | Install or enable the `Nuzo` plugin, then verify the `nuzo` MCP server. |
| MCP hosts | Configure `nuzo-mcp-server` as a stdio MCP server. |

## Manage Memory

```bash
nuzo memory init
nuzo memory doctor
nuzo memory list
nuzo memory recall "deployment preferences"
```

## Why

Agents can write code, inspect repositories, run tools, and help make project decisions. But most sessions still start from zero. Nuzo preserves useful context locally so users can inspect, edit, export, and delete what agents remember.

## Current Release

Nuzo `0.6.0` is the current public release.

- `@nuzo/memory` is the user package.
- `@nuzo/memory-core` is for library integrations.
- Codex and Claude Code plugins use the same MCP runtime.

## Runtime Storage

```text
~/.nuzo/memory/memories.sqlite
<project>/.nuzo/memory/memories.sqlite
```

Runtime memory is user-owned state. It is ignored by Git by default and should not be committed.

## Start Reading

- [Getting started](getting-started/index.md)
- [Codex plugin](operations/codex-plugin.md)
- [Claude Code plugin](operations/claude-code-plugin.md)
- [Tool contract](spec/tools.md)
