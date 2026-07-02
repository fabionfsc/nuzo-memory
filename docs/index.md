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
  <p class="nuzo-progress__label"><strong>0.9.1</strong> current release</p>
  <div class="nuzo-stats" markdown>
  <span><strong>14</strong> MCP tools</span>
  <span><strong>0</strong> telemetry</span>
  <span><strong>2</strong> priority hosts</span>
  </div>
  </div>
</section>

## Install Once

Use Node.js 22 LTS or 24 LTS with npm 10 or newer.

```bash
npm install --global @nuzo/memory@0.9.1
nuzo setup
```

`nuzo setup` detects Codex and Claude Code. When both are available, it lets
you choose Codex, Claude Code, or both, then shows the host changes and asks
before changing host configuration. Open the configured host, confirm Nuzo is
enabled, trust the two Nuzo read-only recall hooks, then start a new session.

Hook trust prompts are expected: Nuzo uses `SessionStart` and
`UserPromptSubmit` for bounded recall, and those hooks do not write memory.

After package upgrades, update the global package normally. Nuzo refreshes
plugins that were already installed through `nuzo setup`:

```bash
npm install --global @nuzo/memory@latest
```

If npm lifecycle scripts are disabled or the automatic refresh needs
attention, run `nuzo update --yes` as the recovery path.

## Choose Your Interface

=== "Codex or Claude Code"

    Use `nuzo setup` from the global package. This is the recommended path
    because it installs the local management CLI and configures supported
    hosts from one place.

=== "CLI"

    ```bash
    nuzo memory init
    nuzo memory doctor
    nuzo memory manage
    ```

=== "Generic MCP host"

    Configure this stdio command in your host:

    ```bash
    npm exec --yes --package=@nuzo/memory@0.9.1 -- nuzo-mcp-server
    ```

For non-interactive setup:

```bash
# Codex
nuzo setup --codex --yes

# Claude Code
nuzo setup --claude-code --yes

# Both
nuzo setup --all --yes
```

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

Nuzo `0.9.1` is the current public release.

| Package | Intended use |
| --- | --- |
| `@nuzo/memory` | CLI, MCP server, and host hook runtime. |
| `@nuzo/memory-core` | Library-level integrations. |

Start with the [installation overview](getting-started/index.md). Internal
architecture, specifications, benchmarks, and release procedures remain
available under the maintainer sections of this site.
