<section class="nuzo-hero">
  <div class="nuzo-hero__copy" markdown>
  <p class="nuzo-eyebrow">Local-first memory for AI agents</p>
  <h1>Nuzo</h1>
  <p class="nuzo-lead">Inspectable, portable memory for Codex, Claude Code, and MCP-compatible agents. Keep useful context across sessions without turning it into hidden state.</p>
  <p class="nuzo-actions">
    <a href="getting-started/" class="nuzo-button">Get started</a>
    <a href="getting-started/agent-memory-loop/" class="nuzo-button nuzo-button--secondary">See the memory loop</a>
  </p>
  </div>
  <div class="nuzo-hero__panel" markdown>
  <img src="assets/logo.svg" alt="Nuzo" class="nuzo-hero__logo">
  <p class="nuzo-progress__label"><strong>0.8.1</strong> current release</p>
  <div class="nuzo-stats" markdown>
  <span><strong>14</strong> MCP tools</span>
  <span><strong>0</strong> telemetry</span>
  <span><strong>2</strong> priority hosts</span>
  </div>
  </div>
</section>

## Choose Your Interface

Use Node.js 22 LTS or 24 LTS with npm 10 or newer.

=== "Codex"

    ```bash
    codex plugin marketplace add fabionfsc/nuzo-memory
    codex plugin add nuzo@nuzo-memory
    ```

    Open `/plugins`, confirm Nuzo is enabled, review and trust its hooks in
    `/hooks`, then start a new thread.

=== "Claude Code"

    ```bash
    claude plugin marketplace add fabionfsc/nuzo-memory
    claude plugin install nuzo@nuzo-memory --scope user
    ```

    Run `claude plugin list --json`, inspect `/mcp` and `/hooks`, then start a
    new session.

=== "CLI"

    ```bash
    npm install --global @nuzo/memory@0.8.1
    nuzo memory init
    nuzo memory doctor
    ```

=== "Generic MCP host"

    Configure this stdio command in your host:

    ```bash
    npm exec --yes --package=@nuzo/memory@0.8.1 -- nuzo-mcp-server
    ```

Codex and Claude Code plugins obtain their pinned runtime themselves. A global
npm installation is only needed for the shell CLI or a direct MCP setup.

## Upcoming In 0.9.0: One-Time Host Setup

These commands are **not available in the current 0.8.1 release**. In `0.9.0`,
the primary path becomes:

```bash
npm install --global @nuzo/memory@0.9.0
nuzo setup
```

Automation can choose `nuzo host install codex --yes`, `nuzo host install
claude-code --yes`, or `nuzo host install --all --yes`. Setup is not repeated
after upgrades: `nuzo update --yes` updates only already-installed Nuzo host
plugins.

## Prove It Works

In a new Codex or Claude Code session, say:

```text
Save this in Nuzo memory: My installation test marker is NUZO-OK.
```

Review and confirm the proposed memory. Start another new session and ask:

```text
What is my Nuzo installation test marker?
```

The answer should use `NUZO-OK`. This confirms that capture, local persistence,
and later-session recall all work. Continue with the
[agent memory loop](getting-started/agent-memory-loop.md) or use the
[host-specific verification guides](getting-started/index.md).

## What Stays Under Your Control

- Memories are stored locally in SQLite.
- Inferred memories remain drafts until you confirm them.
- Recall is read-only and returned content remains untrusted data.
- You can inspect, update, export, archive, or delete memory.
- Telemetry and remote embeddings are not enabled by default.

## Current Release

Nuzo `0.8.1` is the current public release.

| Package | Intended use |
| --- | --- |
| `@nuzo/memory` | CLI, MCP server, and host hook runtime. |
| `@nuzo/memory-core` | Library-level integrations. |

Start with the [installation overview](getting-started/index.md). Internal
architecture, specifications, benchmarks, and release procedures remain
available under the maintainer sections of this site.
