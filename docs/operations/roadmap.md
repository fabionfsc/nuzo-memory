# Roadmap

## Stage 0: Documentation Init

Goal: define the project before implementation.

Deliverables:

- README.
- Product vision.
- Requirements.
- Architecture overview.
- Package boundaries.
- Storage model.
- Memory model.
- MCP and CLI tool contract.
- Init specification.
- Privacy and security model.
- Testing strategy.
- GitHub release plan.

Exit criteria:

- A contributor can understand what to build without guessing package responsibilities.
- Runtime memory location is clear.
- Public contracts are documented.

## Stage 1: Core MVP

Goal: implement local memory lifecycle.

Detailed implementation plan: `docs/implementation/stage-1-core.md`.

Status: implemented for the MVP, including audit history, transactional SQLite
mutations, safe bulk forgetting, import preflight, migration coverage, and
expanded secret detection.

Deliverables:

- `packages/core`.
- TypeScript workspace scaffold.
- SQLite migrations.
- FTS search.
- audit events.
- secret scanner.
- import/export.
- core tests.

Exit criteria:

- Core can run without CLI or MCP.
- All memory lifecycle operations are tested.

## Stage 2: CLI

Goal: give users direct control.

Status: implemented in `packages/cli`, with user/project initialization, the
full memory lifecycle, stable exit codes, and installed-package smoke coverage.

The monorepo exposes the local CLI through `npm run nuzo --`.

Deliverables:

- `nuzo memory init`.
- remember, recall, list, update, forget.
- export/import.
- doctor.
- local smoke test command.

Exit criteria:

- User can manage memory without an agent.
- CLI exits with stable error codes.

## Stage 3: MCP Server

Goal: make memory available to agents.

Status: implemented in `packages/mcp-server` with 12 tools, protocol-level SDK
tests, read-only lifecycle recall, read-only capture suggestion validation, and
runtime doctor diagnostics.

Deliverables:

- MCP tool schemas.
- MCP handlers calling core use cases.
- contract tests.
- setup docs.
- read-only doctor diagnostics for host agents.
- read-only capture suggestion validation before confirmed writes.

Exit criteria:

- Codex or another MCP-compatible agent can manage memory through the server.

## Stage 4: Host Plugins

Goal: package the MCP server for agent hosts through supported plugin workflows.

Status: release layouts, host guidance, and host-specific validation are
implemented. Isolated official marketplace installs for Codex and Claude Code
resolve the published `@nuzo/mcp-server@0.1.2` runtime. Claude Code reports the
server connected, and Codex successfully calls `memory.doctor` through the
installed plugin.

The release layout is generated under `build/plugins/`. It keeps host wrappers
thin and resolves a version-pinned `@nuzo/mcp-server` package instead of a
monorepo sibling path.

Deliverables:

- `.codex-plugin/plugin.json`.
- `.claude-plugin/plugin.json`.
- plugin READMEs.
- Codex-specific setup docs aligned with the official plugin path.
- Claude Code setup docs aligned with the official plugin path.
- lifecycle hook policy for recall/capture in hosts that support hooks.
- capture suggestion contract for inferred memories with no silent writes.
- MCP-level read-only recall hook prototype.
- MCP-level read-only capture suggestion validation.
- Marketplace or official distribution metadata when the supported workflow is stable.
- matching MCP package publication before public plugin installation.
- reproducible npm pack validation and clean tarball installation.

Exit criteria:

- Codex plugin can be packaged through a supported Codex plugin workflow and used in a fresh Codex session.
- Claude Code plugin can be packaged through a supported Claude Code plugin workflow and used in a fresh Claude Code session.
- Recall/capture hooks follow the lifecycle and capture suggestion specs before host automation.
- No development-only installer is required for normal use.

## Stage 5: Public Release

Goal: publish the project.

Status: repository, license, contribution/security files, CI, Pages, custom
domain HTTPS, npm packages, clean host-plugin validation, and versioned release
tags are complete.

Deliverables:

- GitHub repository.
- Apache-2.0 license.
- SECURITY.md.
- CONTRIBUTING.md.
- docs site on `nuzo.com.br`.

Exit criteria:

- No private memory files tracked.
- Install docs work from a clean environment.

## Stage 6: Post-MVP Distribution

Goal: make routine releases and host installation easier without weakening the
local-first product boundary.

Status: mostly complete for release infrastructure. Scope authorization,
optimistic concurrency, effective runtime configuration, Dependabot, CodeQL,
branch protection, npm trusted publishing, provenance, and the `0.1.2` release
are implemented.

Completed:

- optional restricted scope authorization for shared host or project stores;
- optimistic concurrency control for independent local processes;
- effective user and project runtime configuration;
- Dependabot, CodeQL, secret scanning, push protection, and required checks on
  `main`;
- pull-request-only routine changes with administrator branch protection and
  strict required checks;
- a manual GitHub Actions OIDC workflow for npm dry runs and publishing;
- trusted npm publication with SLSA provenance for `@nuzo/memory-core`,
  `@nuzo/memory-cli`, and `@nuzo/mcp-server`.

Remaining:

- publish Codex and Claude Code marketplace listings;
- gather installation feedback from real Codex and Claude Code workflows;
- implement lifecycle integrations that preserve confirmed capture and
  read-only recall defaults.

## Stage 7: Real Workflow Hardening

Goal: prove that Nuzo feels useful in real agent work, not only in source-tree
tests.

Status: complete in `0.1.2`. The published CLI and MCP packages, generated
Codex plugin artifact, generated Claude Code plugin artifact, and capture
suggestion rules now have automated continuity and safety validation.

Detailed validation plan: `docs/operations/post-release-validation.md`.

Deliverables:

- installed CLI session-continuity smoke;
- installed MCP stdio session-continuity smoke;
- Codex plugin release-artifact recall and capture suggestion validation;
- Claude Code plugin release-artifact recall and capture suggestion validation;
- documented capture suggestion criteria for confirmed writes;
- focused GitHub Issues for any host limitation or manual validation gap.

Exit criteria:

- a fake durable memory stored in one session is recalled in a fresh session;
- `memory.recall_hook` stays read-only;
- `memory.suggest_capture` never persists inferred drafts before confirmation;
- host plugins remain thin wrappers around the published MCP runtime;
- docs describe only install and verification paths that were tested.

## Stage 8: Product Polish And Install Simplification

Goal: make Nuzo easier to understand, install, and use before adding another
large capability layer.

Status: shipped in `0.1.3`.

This stage should reduce public complexity, not add more surface area. The
technical package boundaries can stay clean while the public onboarding presents
one obvious path for normal users.

Deliverables:

- trim `README.md` into a fast product entry point with a 60-second install and
  first-use path;
- explain the package split as user-facing roles: CLI for humans,
  MCP server for agent hosts, core for library/integrator use;
- make `@nuzo/memory-cli` the default package users see first;
- add or improve clean install docs for CLI, MCP host, Codex, and Claude Code
  without requiring a source checkout;
- reduce `AGENTS.md` to safe public guidance and move local/operator-only
  preferences to ignored `AGENTS.local.md`;
- keep `CONTRIBUTING.md` as the public contribution entry point for humans and
  external bots;
- audit root and docs Markdown naming conventions, keeping conventional
  uppercase root files and lowercase kebab-case docs paths;
- classify docs as user docs, maintainer docs, architecture/spec docs, or
  temporary/internal notes;
- remove, merge, or move docs that do not help users, contributors,
  maintainers, or durable architecture decisions;
- update site navigation so the first path is installation/use, not the
  project construction history;
- keep release, security, versioning, and public contract docs discoverable but
  out of the first-time user path.

Exit criteria:

- a new user can identify the right install path without understanding all npm
  packages;
- the README links out to details instead of duplicating them;
- no tracked public file contains local operator notes, tokens, private
  workflow preferences, or instructions that should only apply to this machine;
- Markdown file naming has a documented pattern and obvious exceptions;
- remaining docs have a clear audience and owner.

Non-goals for this stage:

- merging the published npm packages only to reduce their count;
- adding cloud sync, embeddings, or automatic write hooks;
- replacing `CONTRIBUTING.md` with agent-specific instructions;
- adding local installer scripts before official host install paths are clear.

## Stage 9: Agent Memory Lifecycle

Goal: make Nuzo feel integrated and intelligent in CLI agent workflows while
keeping memory local, inspectable, and user-controlled.

Status: shipped in `0.2.0` as the first agent memory lifecycle milestone.

This stage is the bridge from "Nuzo exposes memory tools" to "Nuzo gives agent
sessions a real memory loop." The user experience should feel familiar to
modern assistant memory: an agent recalls useful context at the start of a new
session, notices durable preferences or project decisions during work, proposes
what should persist, and carries confirmed memories into later sessions.

The implementation boundary stays conservative:

```text
new agent session
  -> memory.recall_hook
  -> read-only context
conversation
  -> candidate detection by host or agent guidance
  -> memory.suggest_capture
  -> editable user confirmation
  -> memory.remember or memory.update
later session
  -> recalled confirmed memory
```

There is no silent inferred write path by default.

Deliverables:

- Codex-first task-start read-only recall flow that calls `memory.recall_hook`
  before work that depends on prior context;
- host guidance for explicit user commands such as "save this in Nuzo memory"
  or "remember this for this project";
- lightweight intelligent capture rules for durable preferences, project
  decisions, recurring instructions, stable facts, and workflow notes;
- editable capture confirmation flow where the user can confirm, edit, or
  reject each suggested memory;
- exact duplicate handling before prompts, with existing memories shown instead
  of creating redundant records;
- update/conflict handling for changed memories, preferring `memory.update`
  with expected revisions over duplicate `memory.remember` writes;
- confirmed writes through `memory.remember` and confirmed edits through
  `memory.update`;
- forget/archive guidance in host workflows;
- audit trail documentation for created, updated, archived, deleted, imported,
  exported, and optional recall events;
- user-facing docs showing the real loop: one session confirms a memory, a later
  Codex or Claude Code session recalls it;
- dogfooding examples for Nuzo development that are safe to publish and do not
  include private operator notes;
- a small local benchmark for recall, duplicates, conflicts, forget, export,
  import, and latency on small and medium stores.

Host order:

1. Codex plugin and skill behavior.
2. Claude Code plugin and skill behavior through the same MCP contract.
3. Generic MCP-host guidance for future CLI agents.

Exit criteria:

- a fresh Codex session can recall a confirmed memory saved in an earlier
  session without manual CLI commands;
- a direct user instruction to remember something creates an inspectable draft
  before writing;
- a likely durable preference or project decision can be suggested without
  writing until the user confirms;
- rejected drafts leave no stored memory, audit event, or hidden note;
- confirmed drafts remain normalized, policy-checked, auditable, and portable;
- duplicate candidates do not create duplicate active memories by default;
- changed memories use update/conflict behavior instead of unbounded new rows;
- the same Nuzo store can serve Codex, Claude Code, and direct CLI audit flows;
- benchmark results are reproducible locally without telemetry or network calls.

Non-goals for this stage:

- hidden automatic memory writes;
- cloud sync;
- remote embeddings or remote LLM calls by default;
- graph memory as the default storage model;
- dashboard UI;
- multi-user or team sync;
- importing private native memory from a host without an official export path;
- automatic LLM compression without explicit user confirmation.

### Proposed Release Sequence

This sequence is planning guidance, not a hard promise. Patch versions can move
scope forward or backward based on host limitations, user feedback, and release
risk.

#### `0.2.0`: Codex Agent Memory Loop

Focus: prove the main Nuzo experience in Codex.

Status: shipped in `0.2.0`.

Deliverables:

- Codex plugin guidance that calls `memory.recall_hook` at task start when prior
  context is useful;
- explicit-memory command handling for user phrases such as "save this in Nuzo"
  or "remember this for this project";
- capture draft flow through `memory.suggest_capture`;
- confirmation prompt language for confirm, edit, and reject;
- confirmed writes through `memory.remember`;
- duplicate detection shown before prompting to save;
- docs and examples showing "save in one Codex session, recall in another."

Exit criteria:

- a user can install Nuzo for Codex, save a confirmed memory, open a fresh
  session, and see that memory inform future work;
- no inferred memory is written without confirmation.

Execution tracker:

- [#81](https://github.com/fabionfsc/nuzo-memory/issues/81):
  Codex task-start recall flow.
- [#82](https://github.com/fabionfsc/nuzo-memory/issues/82):
  Codex explicit save request flow.
- [#83](https://github.com/fabionfsc/nuzo-memory/issues/83):
  Codex inferred capture confirmation flow.
- [#84](https://github.com/fabionfsc/nuzo-memory/issues/84):
  memory update and duplicate handling for agent capture.
- [#85](https://github.com/fabionfsc/nuzo-memory/issues/85):
  session-continuity dogfooding and docs.

#### `0.2.1`: Capture Refinement And Updates

Focus: make capture less noisy and better at changing existing memory.

Deliverables:

- sharper candidate rules for preferences, project decisions, instructions,
  facts, and workflow notes;
- update suggestions when a new statement changes an existing memory;
- conflict handling with expected revisions in host-facing flows;
- better rejection and blocked-content messages;
- tests for allowed, duplicate, update, conflict, blocked, and rejected capture
  paths.

Exit criteria:

- Nuzo prefers updating relevant existing memory over creating low-value
  duplicates;
- users can understand why a suggestion was shown or blocked.

#### `0.2.2`: Claude Code And Generic MCP Parity

Focus: make the same lifecycle work outside Codex.

Deliverables:

- Claude Code plugin guidance for task-start recall and confirmed capture;
- generic MCP-host integration guide for agents that expose Nuzo tools but do
  not support full plugin UX yet;
- host compatibility matrix for recall, suggested capture, confirmation, and
  update behavior;
- smoke coverage or manual validation notes for the supported host paths.

Exit criteria:

- Codex and Claude Code use the same Nuzo memory store and MCP contract without
  host-specific memory formats;
- docs make clear which lifecycle behaviors each host currently supports.

#### `0.2.3`: Audit, Review, And Trust UX

Focus: make users comfortable with what agents remember.

Deliverables:

- improved review docs for list, history, update, forget, archive, export, and
  import;
- clearer audit trail examples for created, updated, archived, deleted,
  imported, exported, and recalled memories;
- recommended periodic review workflow;
- safer examples for dogfooding Nuzo on the Nuzo repository;
- issue-hunting checklist for memory lifecycle regressions.

Exit criteria:

- a user can inspect what Nuzo remembered, why it was saved, which host saved
  it, and how to change or remove it.

#### `0.2.4`: Quality Benchmark And Recall Tuning

Focus: measure and tune the local-first lifecycle before adding semantic layers.

Deliverables:

- local benchmark fixtures for recall, Unicode/PT-BR queries, duplicates,
  updates, conflicts, forget, export/import, and latency;
- documented small-store and medium-store benchmark runs;
- recall query guidance for task-start hooks;
- conservative FTS tuning if benchmark results justify it.

Exit criteria:

- lifecycle quality can be evaluated locally and repeatedly without telemetry,
  network calls, remote embeddings, or private data.

#### `0.3.0`: Optional Semantics Exploration

Focus: evaluate better recall quality without changing Nuzo's default product
boundary.

Possible deliverables:

- optional local embedding provider interface;
- optional semantic search index behind explicit configuration;
- comparison between SQLite FTS and optional semantic recall;
- import/export compatibility review for any new index metadata;
- clear docs that semantics are opt-in and not required for normal Nuzo use.

Exit criteria:

- semantic recall is either proven useful as an optional layer or deferred with
  benchmark evidence.

## Stage 10: Optional Semantics And Advanced Integrations

Goal: improve recall quality for users who opt in, without changing Nuzo's
local-first default.

Status: post-`0.2.0` exploration.

Possible deliverables:

- optional local embedding provider interface;
- optional semantic search index;
- optional memory compaction pipeline;
- comparative evaluation against local FTS;
- import/export compatibility for additional review formats;
- marketplace distribution improvements after host install flows stabilize.

Non-goals for this stage:

- required cloud sync;
- required remote embeddings;
- multi-tenant SaaS runtime;
- graph memory as the default storage model;
- automatic LLM compression without explicit user confirmation.
