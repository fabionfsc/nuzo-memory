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
resolve the published `@nuzo/mcp-server@0.1.0` runtime. Claude Code reports the
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
domain HTTPS, npm packages, clean host-plugin validation, and the `v0.1.0`
release tag are complete.

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

Status: in progress. Scope authorization, optimistic concurrency, effective
runtime configuration, Dependabot, CodeQL, branch protection, and the
repository side of npm trusted publishing are implemented.

Completed:

- optional restricted scope authorization for shared host or project stores;
- optimistic concurrency control for independent local processes;
- effective user and project runtime configuration;
- Dependabot, CodeQL, secret scanning, push protection, and required checks on
  `main`;
- a manual GitHub Actions OIDC workflow for npm dry runs and publishing.

Remaining:

- register each npm package as a trusted-publishing target and verify
  provenance on the next release;
- publish Codex and Claude Code marketplace listings;
- gather installation feedback from real Codex and Claude Code workflows;
- implement lifecycle integrations that preserve confirmed capture and
  read-only recall defaults;
- decide whether branch protection should apply to administrators so required
  checks become preventive for every change.
