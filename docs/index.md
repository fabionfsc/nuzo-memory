---
template: landing.html
title: Nuzo
description: Auditable, local-first memory for Codex, Claude Code, and MCP-compatible agents.
hide:
  - navigation
  - toc
---

<section class="nuzo-hero" aria-labelledby="nuzo-hero-title">
  <div class="nuzo-hero__copy nuzo-reveal">
    <p class="nuzo-kicker"><span aria-hidden="true"></span> Local-first memory for AI agents</p>
    <h1 id="nuzo-hero-title">Give your agents continuity. Keep the receipts.</h1>
    <p class="nuzo-hero__lead">Nuzo gives Codex, Claude Code, and MCP-compatible hosts durable context—with explicit writes, bounded recall, and a local audit trail you control.</p>
    <div class="nuzo-actions">
      <a class="nuzo-button" href="getting-started/sixty-second-demo/">Run the 60-Second Demo <span aria-hidden="true">→</span></a>
      <a class="nuzo-text-link" href="getting-started/">Install Nuzo <span aria-hidden="true">↗</span></a>
    </div>
    <div class="nuzo-signal" role="list" aria-label="Nuzo release facts">
      <span role="listitem"><strong>v1.2.0</strong> stable</span>
      <span role="listitem"><strong>19</strong> MCP tools</span>
      <span role="listitem"><strong>0</strong> silent inferred writes</span>
    </div>
  </div>

  <div class="nuzo-trace nuzo-reveal" data-nuzo-trace aria-label="Interactive Nuzo memory trace">
    <div class="nuzo-trace__topline">
      <span><i aria-hidden="true"></i> Live memory trace</span>
      <span class="nuzo-trace__controls"><span class="nuzo-trace__local">LOCAL / SQLITE</span><button type="button" data-trace-toggle aria-pressed="false">Pause</button></span>
    </div>
    <div class="nuzo-trace__route" role="tablist" aria-label="Memory lifecycle">
      <button type="button" role="tab" aria-selected="true" aria-controls="trace-recall" id="tab-recall" tabindex="0" data-trace-step="0"><span>01</span> Recall</button>
      <button type="button" role="tab" aria-selected="false" aria-controls="trace-suggest" id="tab-suggest" tabindex="-1" data-trace-step="1"><span>02</span> Suggest</button>
      <button type="button" role="tab" aria-selected="false" aria-controls="trace-confirm" id="tab-confirm" tabindex="-1" data-trace-step="2"><span>03</span> Confirm</button>
      <button type="button" role="tab" aria-selected="false" aria-controls="trace-audit" id="tab-audit" tabindex="-1" data-trace-step="3"><span>04</span> Audit</button>
    </div>
    <div class="nuzo-trace__viewport">
      <div class="nuzo-trace__scan" aria-hidden="true"></div>
      <section role="tabpanel" id="trace-recall" aria-labelledby="tab-recall" data-trace-panel="0">
        <p class="nuzo-trace__event"><span>Codex</span> requests bounded project context</p>
        <pre><code><b>memory.recall</b>({
  query: <em>"release publishing"</em>,
  scope: <em>"project:nuzo"</em>, limit: <strong>3</strong>
})</code></pre>
        <div class="nuzo-trace__result"><span>READ ONLY</span><p>Published artifacts require provenance and post-release verification.</p></div>
      </section>
      <section role="tabpanel" id="trace-suggest" aria-labelledby="tab-suggest" data-trace-panel="1" hidden>
        <p class="nuzo-trace__event"><span>Claude Code</span> notices a reusable decision</p>
        <pre><code><b>memory.suggest_capture</b>({
  content: <em>"Use npm as the canonical install path."</em>
})</code></pre>
        <div class="nuzo-trace__result nuzo-trace__result--draft"><span>DRAFT</span><p>Suggestion is visible, editable, and not stored as confirmed memory.</p></div>
      </section>
      <section role="tabpanel" id="trace-confirm" aria-labelledby="tab-confirm" data-trace-panel="2" hidden>
        <p class="nuzo-trace__event"><span>You</span> approve the exact record</p>
        <pre><code><b>memory.confirm_capture</b>({
  suggestion_id: <em>"cap_01JZ…"</em>, confirm: <strong>true</strong>
})</code></pre>
        <div class="nuzo-trace__result nuzo-trace__result--confirmed"><span>CONFIRMED</span><p>Committed to local SQLite with scope, source, and revision metadata.</p></div>
      </section>
      <section role="tabpanel" id="trace-audit" aria-labelledby="tab-audit" data-trace-panel="3" hidden>
        <p class="nuzo-trace__event"><span>Nuzo</span> leaves an inspectable trail</p>
        <div class="nuzo-ledger" aria-label="Example audit record">
          <span>event</span><strong>memory.created</strong>
          <span>actor</span><strong>user_confirmed</strong>
          <span>store</span><strong>~/.nuzo/memory.sqlite</strong>
          <span>revision</span><strong>1 · 2026-07-14T…</strong>
        </div>
        <div class="nuzo-trace__result"><span>YOUR DATA</span><p>Inspect, update, export, archive, or delete it from the CLI or MCP.</p></div>
      </section>
    </div>
    <p class="nuzo-trace__hint">Select a stage to inspect the boundary.</p>
  </div>
</section>

!!! warning "Final release and end of maintenance"

    Nuzo `1.2.0` is the final planned release. Packages and documentation stay
    available, but the repository is archived after publication and no ongoing
    fixes or support are promised. Read the
    [end-of-maintenance notice](operations/end-of-maintenance.md).

<div class="nuzo-principles" role="list" aria-label="Nuzo defaults">
  <span role="listitem"><b>01</b> SQLite + FTS stays canonical</span>
  <span role="listitem"><b>02</b> Recall is bounded and read-only</span>
  <span role="listitem"><b>03</b> Inference waits for confirmation</span>
  <span role="listitem"><b>04</b> Every record remains manageable</span>
</div>

<section class="nuzo-statement nuzo-reveal" aria-labelledby="boundary-title">
  <p class="nuzo-section-index">01 / THE BOUNDARY</p>
  <div>
    <h2 id="boundary-title">Memory should extend an agent.<br><em>Not escape your control.</em></h2>
    <p>Most memory systems optimize for remembering more. Nuzo starts with a harder question: can you see what was retained, verify its source, change your mind, and remove it completely?</p>
  </div>
</section>

<section class="nuzo-contract" aria-label="Nuzo trust contract">
  <article class="nuzo-contract__item nuzo-reveal">
    <span>01</span>
    <div><h3>Recall without mutation</h3><p><code>SessionStart</code> and <code>UserPromptSubmit</code> are read-only recall hooks. They do not write memory, and recalled records remain untrusted data.</p></div>
    <strong>READ</strong>
  </article>
  <article class="nuzo-contract__item nuzo-reveal">
    <span>02</span>
    <div><h3>Inference becomes a draft</h3><p>An agent can propose a useful memory, but the proposal reports <code>memory_writes: false</code> until you confirm the exact content.</p></div>
    <strong>REVIEW</strong>
  </article>
  <article class="nuzo-contract__item nuzo-reveal">
    <span>03</span>
    <div><h3>Confirmed means accountable</h3><p>Scopes, provenance, timestamps, revisions, relations, and lifecycle events make each stored record inspectable instead of mysterious.</p></div>
    <strong>AUDIT</strong>
  </article>
</section>

<section class="nuzo-product nuzo-reveal" aria-labelledby="product-title">
  <div class="nuzo-product__intro">
    <p class="nuzo-section-index">02 / ONE LOCAL CORE</p>
    <h2 id="product-title">One memory layer.<br>Every supported host.</h2>
    <p>The CLI, MCP server, Codex plugin, and Claude Code plugin share the same core policies and local store. There is no second, hidden memory path.</p>
    <a class="nuzo-text-link" href="architecture/overview/">Explore the architecture <span aria-hidden="true">→</span></a>
  </div>
  <div class="nuzo-host-stack" data-nuzo-hosts>
    <button type="button" class="nuzo-host is-active" data-host="codex" aria-pressed="true"><span>CODEX</span><strong>Bounded context enters the session</strong><small>via MCP + read-only hooks</small></button>
    <button type="button" class="nuzo-host" data-host="claude" aria-pressed="false"><span>CLAUDE CODE</span><strong>The same records, the same policy</strong><small>via a thin host plugin</small></button>
    <button type="button" class="nuzo-host" data-host="mcp" aria-pressed="false"><span>ANY MCP HOST</span><strong>A public, stable tool contract</strong><small>via local stdio transport</small></button>
    <div class="nuzo-core-pulse" aria-hidden="true"><i></i><span>NUZO CORE</span><small>SQLite / FTS / audit</small></div>
  </div>
</section>

<section class="nuzo-install nuzo-reveal" aria-labelledby="install-title">
  <div>
    <p class="nuzo-section-index">03 / START LOCAL</p>
    <h2 id="install-title">Two commands.<br>No account required.</h2>
    <p><code>nuzo setup</code> detects supported hosts, previews changes, and asks before writing configuration.</p>
  </div>
  <div class="nuzo-command" data-nuzo-command>
    <div class="nuzo-command__bar"><span>terminal</span><button type="button" data-copy-command aria-describedby="copy-status">Copy</button></div>
    <pre><code>npm install --global @nuzo/memory@1.2.0
nuzo setup</code></pre>
    <span class="nuzo-copy-status" id="copy-status" role="status" aria-live="polite"></span>
  </div>
  <details class="nuzo-advanced">
    <summary>Host-specific setup and updates</summary>
    <pre><code>nuzo setup --codex --yes
nuzo setup --claude-code --yes
nuzo setup --all --yes
nuzo update
nuzo memory manage</code></pre>
  </details>
</section>

<section class="nuzo-proof" aria-labelledby="proof-title">
  <div class="nuzo-proof__heading nuzo-reveal">
    <p class="nuzo-section-index">04 / PROOF, NOT PROMISES</p>
    <h2 id="proof-title">The contracts are public.</h2>
  </div>
  <div class="nuzo-proof__links">
    <a href="spec/tools/" class="nuzo-reveal"><span>MCP schemas</span><strong>19 tools with lifecycle and error contracts</strong><i aria-hidden="true">↗</i></a>
    <a href="architecture/memory-trust-boundary/" class="nuzo-reveal"><span>Trust boundary</span><strong>Data never becomes instruction by storage alone</strong><i aria-hidden="true">↗</i></a>
    <a href="operations/testing-strategy/" class="nuzo-reveal"><span>Release gates</span><strong>Node 22, Node 24, docs, packages, hosts, CodeQL</strong><i aria-hidden="true">↗</i></a>
  </div>
</section>

<section class="nuzo-final nuzo-reveal" aria-labelledby="final-title">
  <p class="nuzo-kicker"><span aria-hidden="true"></span> Your memory. Your machine. Your decision.</p>
  <h2 id="final-title">Let agents remember.<br>Without surrendering control.</h2>
  <div class="nuzo-actions">
    <a class="nuzo-button" href="getting-started/">Install Nuzo <span aria-hidden="true">→</span></a>
    <a class="nuzo-text-link" href="product/why-nuzo/">Why Nuzo? <span aria-hidden="true">↗</span></a>
  </div>
</section>
