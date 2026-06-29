# Release Goals

This page defines the planned release sequence from `0.3.1` through `1.0.0`.
It is a product and engineering plan, not a promise of dates. Scope may move
when implementation evidence or host limitations require it, but the purpose
and exit criteria of each release should remain coherent.

## Release Rules

- Public names, npm packages, plugin manifests, Git tags, and documentation use
  the full SemVer version, including `1.0.0`.
- All Nuzo packages and generated host plugins move together at one version.
- Patch releases contain compatible fixes and hardening within an existing
  capability boundary.
- Minor releases introduce meaningful functionality or additive public
  contracts before `1.0.0`.
- A capability moves to a later release rather than weakening its exit
  criteria to meet an arbitrary date.
- Cloud sync, mandatory embeddings, telemetry, silent inferred writes, and a
  multi-tenant runtime remain outside this sequence.

## Sequence

| Version | Goal | Public outcome |
| --- | --- | --- |
| `0.3.1` | Trust baseline | Recalled memory is handled as bounded, attributable data and hostile-memory regressions are covered. |
| `0.4.0` | Audit and provenance | Users can inspect store-wide activity and understand where memory came from. |
| `0.5.0` | Recall quality | Local recall quality is measured and tuned against reproducible evidence. |
| `0.6.0` | Capture intelligence | Capture prefers confirmed updates or related-memory decisions over redundant writes. |
| `0.7.0` | Optional semantics | Users may opt into benchmark-proven semantic retrieval without changing local-first defaults. |
| `0.8.0` | Host reliability | Published Codex and Claude Code workflows are validated in real installations and across sessions. |
| `0.9.0` | Contract stabilization | Public contracts, migrations, security, and release behavior are ready for a compatibility commitment. |
| `1.0.0` | Stable release | Nuzo makes an explicit stable-contract and migration commitment. |

## `0.3.1`: Trust Baseline

Goal: close immediate trust gaps without adding a new public memory capability.

Status: shipped in `0.3.1`.

Deliverables:

- document a threat model for memory poisoning and prompt injection through
  remembered or imported content;
- make lifecycle-hook context distinguish memory data from host and user
  instructions, while preserving memory content for inspection;
- preserve memory ID, revision, scope, kind, tags, and source attribution where
  host context is rendered;
- add regression fixtures for hostile imported memory, oversized content,
  deceptive instruction text, and mixed trusted/untrusted sources;
- align privacy, security, and scope documentation with current restricted and
  administrator runtime modes;
- split oversized CLI, MCP, and core modules only where it reduces risk for
  the following releases, without changing public contracts.

Exit criteria:

- lifecycle recall remains read-only, bounded, local, and fail-open;
- recalled memory is explicitly framed as stored data rather than higher-level
  instructions;
- hostile-memory fixtures cannot alter hook structure or bypass output bounds;
- existing CLI, MCP, export, and storage contracts remain compatible;
- all code, plugin, documentation, and release checks pass.

## `0.4.0`: Audit And Provenance

Goal: let users answer what changed in a store, who or what caused it, and where
the affected memory originated.

Status: shipped in `0.4.0`.

Deliverables:

- specify a store-wide audit query contract in core, CLI, and MCP;
- expose global events such as exports that are currently recorded without a
  memory ID;
- add bounded filters for event type, actor, memory ID, scope, and time;
- define provenance for explicit writes, confirmed capture, imports, CLI,
  MCP, and host integrations;
- review import/export compatibility for any provenance fields;
- define the lifecycle policy for legacy transition packages before the stable
  compatibility commitment;
- provide a user workflow for reviewing, exporting, and removing memory.

Exit criteria:

- users can inspect both per-memory and store-wide audit activity without raw
  SQLite queries;
- audit queries cannot reveal unauthorized scopes in restricted mode;
- hard-deleted memory remains verifiably deleted without retaining its content
  in audit payloads;
- provenance survives supported JSON export/import when the format promises it;
- new public contracts are documented and covered at protocol level.

Initial tracking:

- [#106](https://github.com/fabionfsc/nuzo-memory/issues/106) Define global audit query contract.
- [#107](https://github.com/fabionfsc/nuzo-memory/issues/107) Define provenance fields and import/export behavior.
- [#108](https://github.com/fabionfsc/nuzo-memory/issues/108) Protect audit queries under restricted scope mode.
- [#109](https://github.com/fabionfsc/nuzo-memory/issues/109) Expose store-wide audit in CLI.
- [#110](https://github.com/fabionfsc/nuzo-memory/issues/110) Expose store-wide audit in MCP.
- [#111](https://github.com/fabionfsc/nuzo-memory/issues/111) Define legacy package lifecycle policy.

## `0.5.0`: Recall Quality

Goal: improve local retrieval with measurable quality rather than intuition.

Status: shipped in `0.5.0`.

Initial tracking:

- [#116](https://github.com/fabionfsc/nuzo-memory/issues/116) Add public recall benchmark fixtures.
- [#117](https://github.com/fabionfsc/nuzo-memory/issues/117) Add repeatable local recall benchmark command.
- [#118](https://github.com/fabionfsc/nuzo-memory/issues/118) Measure 0.4.x recall baseline.
- [#119](https://github.com/fabionfsc/nuzo-memory/issues/119) Evaluate and tune local recall ranking.
- [#120](https://github.com/fabionfsc/nuzo-memory/issues/120) Validate lifecycle hooks against recall benchmark bounds.

Deliverables:

- add public, synthetic benchmark fixtures with English as the primary quality
  bar, plus Portuguese, Unicode, multilingual compatibility, topical tags,
  global/project scopes, and realistic agent prompts;
- measure relevance, noise, latency, and bounded-result behavior on small and
  medium stores;
- evaluate tokenization, stop words, FTS query construction, tag weighting,
  and ranking explanations;
- tune SQLite FTS only where benchmark results justify the change;
- document repeatable benchmark commands and expected result envelopes.

Exit criteria:

- benchmark results are reproducible without private data, telemetry, network
  calls, or embeddings;
- the English benchmark group has enough coverage to fail independently on
  top-1 accuracy, expected recall, or unexpected noise;
- recall quality improves over the `v0.4.0` baseline on agreed fixtures without
  regressing scope isolation or latency bounds;
- ranking reasons remain inspectable and correspond to the implemented score;
- lifecycle hooks continue to return a small bounded context.

## `0.6.0`: Capture Intelligence

Goal: decide whether a confirmed capture should create, update, or skip memory
without turning inference into write authority.

Status: planned as two evidence-gated passes. Both passes belong to the
`0.6.0` milestone; they are not artificial `0.5.x` patch releases. Source
versions remain at the last public release until the final release commit. A
prerelease such as `0.6.0-alpha.1` is used only if external evaluation is
needed and npm prerelease distribution is explicitly made safe first.

Tracking:

- Definition and evidence: [#125](https://github.com/fabionfsc/nuzo-memory/issues/125)
  defines the contract, [#126](https://github.com/fabionfsc/nuzo-memory/issues/126)
  adds fixtures and the baseline, [#127](https://github.com/fabionfsc/nuzo-memory/issues/127)
  implements core evidence, and [#128](https://github.com/fabionfsc/nuzo-memory/issues/128)
  exposes it through CLI and MCP.
- Confirmed decisions: [#129](https://github.com/fabionfsc/nuzo-memory/issues/129)
  covers create/update/conflict behavior and
  [#130](https://github.com/fabionfsc/nuzo-memory/issues/130) aligns Codex and
  Claude Code.
- Release proof: [#131](https://github.com/fabionfsc/nuzo-memory/issues/131)
  collects end-to-end evidence after both passes.
- Supporting post-release documentation alignment is tracked in
  [#124](https://github.com/fabionfsc/nuzo-memory/issues/124).

Relationship evidence uses this planning taxonomy:

| Relationship | Meaning | Default write decision |
| --- | --- | --- |
| `exact_duplicate` | The same normalized durable statement already exists in the target scope. | None. |
| `update_candidate` | The candidate appears to replace or revise an existing durable statement. | None until the user confirms an update. |
| `related` | Existing memory is relevant but the candidate may remain independently useful. | None until the user chooses whether to create. |
| `independent` | No sufficiently related active memory was found inside the bounded search. | None until the user confirms creation. |
| `uncertain` | Evidence cannot safely distinguish the relationships above. | Ask for clarification; do not write. |

Policy rejection is orthogonal to this taxonomy. A blocked candidate stops
before relationship evidence can authorize any action. Relationship evidence
is advisory data, never permission to persist.

### Pass 1: Capture Evidence

This pass is read-only. It defines and measures the decision boundary before
adding any new mutation flow.

Deliverables:

- specify additive core and `memory.suggest_capture` relationship contracts
  before implementation, including compatibility with current consumers;
- add public synthetic fixtures with English as the primary quality bar and
  Portuguese, Unicode, scope, policy, and ambiguity safety coverage;
- measure the exact-duplicate-only `0.5.0` baseline before tuning;
- retrieve a bounded set of active candidates from the authorized target
  scope without cross-scope disclosure;
- return inspectable evidence such as relationship, memory ID, revision,
  matched terms or tags, and a concise reason;
- distinguish `uncertain` from `independent` rather than forcing a weak match;
- keep candidate detection outside storage and keep suggestion evaluation free
  of memory and audit writes;
- use no telemetry, mandatory embeddings, remote LLM, or network dependency.

Pass 1 gate:

- the contract and fixture expectations are reviewed before ranking changes;
- the baseline and proposed quality envelope are reproducible from repository
  commands;
- policy rejection, scope isolation, result bounds, and zero-write behavior
  pass with no exceptions;
- English classification and ambiguity cases can fail independently;
- evidence is inspectable and corresponds to the implemented decision;
- existing recall benchmark and lifecycle-hook bounds do not regress.

Pass 2 cannot begin until this gate is satisfied.

### Pass 2: Confirmed Decisions

This pass turns evidence into explicit user choices while preserving the
existing write APIs and policy boundary.

Deliverables:

- present create, update, keep-separate, clarify, and reject outcomes without
  selecting one silently;
- keep `exact_duplicate`, blocked, rejected, and unresolved `uncertain`
  outcomes write-free;
- route confirmed independent creation through `memory.confirm_capture` with
  `decision: "create"`;
- route confirmed replacement through `memory.confirm_capture` with
  `decision: "update"`, the displayed memory ID, and `expected_revision`;
- require a fresh read and confirmation after `MEMORY_REVISION_CONFLICT`, with
  no silent retry;
- preserve source attribution and metadata-only audit events for confirmed
  writes;
- align CLI, MCP, Codex, and Claude Code guidance and protocol tests with the
  same core decisions;
- validate separate-session flows against staged and published artifacts.

### Non-Goals

- silent or confidence-triggered writes;
- storing rejected suggestions, hidden drafts, or conversation transcripts;
- automatic conflict resolution or background retries;
- cross-scope candidate comparison that can disclose unauthorized memory;
- semantic retrieval, embeddings, sync, or remote classification;
- host-specific relationship logic that duplicates core behavior;
- changing the canonical memory model solely to retain suggestion state.

Exit criteria:

- no inferred, blocked, rejected, duplicate, or uncertain candidate is
  persisted without an explicit confirmed decision;
- exact duplicates create zero new active memories by default;
- changed durable facts and preferences prefer an inspectable confirmed
  update over an unbounded additional row;
- every relation and recommended decision includes bounded evidence and remains
  individually confirmable, editable, or rejectable;
- all candidate lookup is scope-safe and bounded in candidates, output, and
  latency;
- revision conflicts require a fresh read and confirmation instead of a
  silent retry;
- the capture benchmark records baseline and tuned results without private
  data, telemetry, network calls, embeddings, or fixture-specific ranking
  vocabulary;
- CLI, MCP, Codex, and Claude Code tests prove allowed, duplicate, related,
  update, conflict, blocked, rejected, and ambiguous flows;
- the `0.5.0` recall benchmark, lifecycle-hook matrix, audit guarantees, npm
  artifact validation, and supported runtime matrix remain green.

## `0.7.0`: Optional Semantics

Goal: add semantic retrieval only if local benchmarks prove enough value to
justify its complexity.

Tracking:

- [#142](https://github.com/fabionfsc/nuzo-memory/issues/142) defines the
  benchmark and acceptance envelope.
- [#143](https://github.com/fabionfsc/nuzo-memory/issues/143) specifies the
  provider and derived-index boundary.
- [#144](https://github.com/fabionfsc/nuzo-memory/issues/144) implements the
  smallest explicit local prototype justified by those gates.
- [#145](https://github.com/fabionfsc/nuzo-memory/issues/145) records the
  FTS, semantic, and hybrid comparison and the ship-or-defer decision.

Deliverables:

- define an optional embedding-provider and semantic-index boundary;
- prefer a local provider path and require explicit configuration for any
  provider that can use the network;
- compare FTS, semantic, and hybrid retrieval on the `0.5.0` benchmark;
- keep semantic indexes derived, disposable, and rebuildable from canonical
  memory records;
- document resource, privacy, portability, and failure-mode tradeoffs;
- defer implementation if benchmark evidence is insufficient.

Exit criteria:

- normal Nuzo use still requires no embeddings, account, API key, or network;
- disabling or deleting the semantic index does not lose canonical memory;
- semantic configuration and provider failures do not create silent writes;
- any shipped hybrid ranking shows a material benchmark improvement.

## `0.8.0`: Host Reliability

Goal: prove the published experience in supported Codex and Claude Code
workflows, not only in source-tree tests.

Deliverables:

- complete supported marketplace or official distribution paths where host
  platforms permit them;
- validate clean installation, MCP connection, lifecycle hooks, trust prompts,
  recall, confirmed capture, update, forget, and diagnostics;
- run real two-session continuity checks against published artifacts;
- maintain a host compatibility matrix with explicit limitations and manual
  fallbacks;
- gather installation and daily-use feedback without telemetry.

Exit criteria:

- a new user can install one public Nuzo runtime and enable a supported host
  without a source checkout;
- confirmed memory written through one supported interface is available to the
  other through the same configured store;
- hook activation and trust remain visible host-level decisions;
- documented install and recovery paths match tested behavior.

## `0.9.0`: Contract Stabilization

Goal: stop expanding the product surface and prove readiness for `1.0.0`.

Deliverables:

- audit CLI commands, MCP schemas, export format, package/binary names, plugin
  manifests, runtime paths, and SQLite migrations;
- test upgrades and migrations from every supported public schema and export
  version;
- document compatibility, deprecation, recovery, backup, and support policies;
- run security, performance, package, provenance, and clean-install reviews;
- resolve or explicitly defer every blocker to the `1.0.0` contract;
- publish `1.0.0-rc.N` candidates when external validation is useful.

Exit criteria:

- no known issue threatens data integrity, scope isolation, confirmed capture,
  or supported migrations;
- public contracts have a documented compatibility policy;
- release candidates pass Node.js 22 and 24, documentation, CodeQL, npm
  artifact, CLI, MCP, and host-plugin gates;
- the remaining `1.0.0` work is release preparation rather than product design.

## `1.0.0`: Stable Release

Goal: make the first stable compatibility and migration commitment for Nuzo.

Required state:

- local-first, inspectable, user-controlled memory remains the default;
- CLI, MCP, JSON export, package, binary, plugin, runtime-path, and migration
  contracts are stable under the documented versioning policy;
- recall, capture, audit, import/export, forget, and supported host workflows
  have release-level validation;
- users can identify memory provenance, inspect history, and remove data;
- upgrade and recovery guidance is complete;
- the release checklist passes against the exact published artifacts.

`1.0.0` does not require cloud sync, a dashboard, graph memory, mandatory
embeddings, or automatic inferred writes. Stability and trust in the supported
core are the release boundary.

## Execution Tracking

Each planned version has a GitHub milestone with the same version and goal.
Roadmap docs own direction and release boundaries. GitHub Issues own focused,
assignable work.

Create executable issues for the current or immediately upcoming milestone.
Do not pre-fill distant milestones with speculative implementation tasks.
Before work begins on a release:

1. confirm its deliverables against current evidence;
2. create focused issues with package boundaries and acceptance criteria;
3. link contract changes to the relevant specification;
4. keep deferred work in the next milestone rather than weakening exit criteria;
5. close the milestone only after the release tag and published artifacts are
   validated.
