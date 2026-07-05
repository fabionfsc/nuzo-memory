<section class="nuzo-landing nuzo-reveal">
  <div class="nuzo-landing__copy">
  <p class="nuzo-eyebrow">Local-first memory for AI agents</p>
  <h1>Memory your agent can use without becoming hidden state.</h1>
  <p class="nuzo-lead">Nuzo gives Codex, Claude Code, and MCP-compatible agents durable memory that stays local, inspectable, editable, exportable, and deletable.</p>
  <p class="nuzo-actions">
    <a href="getting-started/" class="nuzo-button">Start in 60 seconds</a>
    <a href="#see-the-loop" class="nuzo-button nuzo-button--secondary">See the memory loop</a>
  </p>
  <div class="nuzo-trust-strip">
  <span><strong>1.0.0</strong> stable release</span>
  <span><strong>14</strong> MCP tools</span>
  <span><strong>0</strong> telemetry by default</span>
  </div>
  </div>
  <div class="nuzo-terminal nuzo-reveal">
  <div class="nuzo-terminal__bar"><span></span><span></span><span></span></div>
  <pre><code>npm install --global @nuzo/memory@1.0.0
nuzo setup</code></pre>
  <p class="nuzo-terminal__note">Installs the CLI, MCP server, and host integration runtime. Setup shows host changes before writing config.</p>
  </div>
</section>

<section class="nuzo-install-grid" aria-label="Install options">
  <article class="nuzo-install-card nuzo-reveal">
  <p class="nuzo-card-kicker">Recommended</p>
  <h2>Install with npm</h2>
  <p>Use the public package directly when Node.js 22 LTS or 24 LTS and npm 10+ are already available.</p>
  <pre><code>npm install --global @nuzo/memory@1.0.0
nuzo setup</code></pre>
  </article>

  <article class="nuzo-install-card nuzo-reveal">
  <p class="nuzo-card-kicker">One-line installer</p>
  <h2>Let the script check prerequisites</h2>
  <p>The installer validates Node.js/npm, installs the same npm package, verifies the CLI, and leaves host configuration to <code>nuzo setup</code>.</p>
  <pre><code>curl -fsSL https://nuzo.com.br/install.sh | sh
nuzo setup</code></pre>
  </article>
</section>

`nuzo setup` detects Codex and Claude Code. When both are available, it lets
you choose Codex, Claude Code, or both, then shows the host changes and asks
before changing host configuration. Open the configured host, confirm Nuzo is
enabled, trust the two Nuzo read-only recall hooks, then start a new session.

For non-interactive setup:

```bash
# Codex
nuzo setup --codex --yes

# Claude Code
nuzo setup --claude-code --yes

# Both
nuzo setup --all --yes
```

After package upgrades, update the global package normally. Nuzo refreshes
plugins that were already installed through `nuzo setup`:

```bash
npm install --global @nuzo/memory@latest
```

If npm lifecycle scripts are disabled or the automatic refresh needs attention,
run `nuzo update --yes` as the recovery path.

## See The Loop

<section class="nuzo-loop nuzo-reveal" aria-label="Nuzo memory loop">
  <article class="nuzo-loop__step">
  <span class="nuzo-loop__index">01</span>
  <h3>Recall</h3>
  <p><code>SessionStart</code> and <code>UserPromptSubmit</code> hooks retrieve bounded context for the active session.</p>
  </article>
  <article class="nuzo-loop__step">
  <span class="nuzo-loop__index">02</span>
  <h3>Suggest</h3>
  <p>Durable preferences or project decisions become drafts, not hidden writes.</p>
  </article>
  <article class="nuzo-loop__step">
  <span class="nuzo-loop__index">03</span>
  <h3>Confirm</h3>
  <p>You review, edit, or reject each suggested memory before it is stored.</p>
  </article>
  <article class="nuzo-loop__step">
  <span class="nuzo-loop__index">04</span>
  <h3>Carry forward</h3>
  <p>Confirmed memories persist locally and can be recalled by Codex, Claude Code, or MCP hosts.</p>
  </article>
</section>

Hook trust prompts are expected. Nuzo uses <code>SessionStart</code> and
<code>UserPromptSubmit</code> for bounded recall, and those hooks do not write memory.
Memory writes still require explicit confirmation.

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

## Choose Your Interface

<section class="nuzo-card-grid nuzo-card-grid--three">
  <article class="nuzo-card nuzo-reveal">
  <h3>Codex or Claude Code</h3>
  <p>Run <code>nuzo setup</code> once. Nuzo installs the local CLI, configures supported hosts, and keeps future updates managed through the global package.</p>
  <p><a href="getting-started/">Install and verify →</a></p>
  </article>

  <article class="nuzo-card nuzo-reveal">
  <h3>CLI</h3>
  <p>Inspect, edit, export, import, archive, forget, and audit memory directly from your terminal.</p>

  <pre><code>nuzo memory init
nuzo memory doctor
nuzo memory manage</code></pre>
  </article>

  <article class="nuzo-card nuzo-reveal">
  <h3>Generic MCP host</h3>
  <p>Use the same local memory contract through stdio in any compatible MCP host.</p>

  <pre><code>npm exec --yes --package=@nuzo/memory@1.0.0 -- nuzo-mcp-server</code></pre>
  </article>
</section>

## What Makes It Different

<section class="nuzo-card-grid">
  <article class="nuzo-proof-card nuzo-reveal">
  <h3>Inspectable by default</h3>
  <p>Memory lives in local SQLite. You can inspect, update, export, archive, or delete it without asking a remote service.</p>
  </article>
  <article class="nuzo-proof-card nuzo-reveal">
  <h3>Explicit write boundary</h3>
  <p>Inferred memories remain drafts until you confirm them. Recall is read-only and recalled content remains untrusted data.</p>
  </article>
  <article class="nuzo-proof-card nuzo-reveal">
  <h3>Cross-host contract</h3>
  <p>Codex, Claude Code, direct CLI workflows, and generic MCP hosts use the same memory model and tool contract.</p>
  </article>
  <article class="nuzo-proof-card nuzo-reveal">
  <h3>Release evidence</h3>
  <p>Nuzo 1.0.0 was published with npm trusted publishing, provenance, host smoke tests, and documented post-release validation.</p>
  </article>
</section>

## Current Release

Nuzo `1.0.0` is the current public release.

| Package | Intended use |
| --- | --- |
| `@nuzo/memory` | CLI, MCP server, and host hook runtime. |
| `@nuzo/memory-core` | Library-level integrations. |

Start with the [installation overview](getting-started/index.md), read the
[privacy and security model](operations/privacy-and-security.md), or inspect
the [MCP tool contract](spec/tools.md). Internal architecture, specifications,
benchmarks, and release procedures remain available under the maintainer
sections of this site.
