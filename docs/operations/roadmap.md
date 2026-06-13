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

Initial scaffold exists in `packages/cli` and currently exercises the core against SQLite.

Deliverables:

- `nuzo memory init`.
- remember, recall, list, update, forget.
- export/import.
- doctor.

Exit criteria:

- User can manage memory without an agent.
- CLI exits with stable error codes.

## Stage 3: MCP Server

Goal: make memory available to agents.

Initial scaffold exists in `packages/mcp-server` and exposes the main memory tool contract over stdio.

Deliverables:

- MCP tool schemas.
- MCP handlers calling core use cases.
- contract tests.
- setup docs.

Exit criteria:

- Codex or another MCP-compatible agent can manage memory through the server.

## Stage 4: Host Plugins

Goal: package the MCP server for agent hosts through supported plugin workflows.

Initial scaffold exists in `packages/codex-plugin` with plugin metadata and MCP defaults.

Deliverables:

- `.codex-plugin/plugin.json`.
- plugin README.
- Codex-specific setup docs aligned with the official plugin path.
- Claude Code compatibility notes and package plan.
- Marketplace or official distribution metadata when the supported workflow is stable.

Exit criteria:

- Codex plugin can be installed through a supported Codex plugin workflow and used in a fresh Codex session.
- Claude Code path is either documented as direct MCP setup or packaged through a supported Claude Code plugin workflow.
- No development-only installer is required for normal use.

## Stage 5: Public Release

Goal: publish the project.

Deliverables:

- GitHub repository.
- Apache-2.0 license.
- SECURITY.md.
- CONTRIBUTING.md.
- docs site on `nuzo.com.br`.

Exit criteria:

- No private memory files tracked.
- Install docs work from a clean environment.
