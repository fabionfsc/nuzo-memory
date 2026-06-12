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

Deliverables:

- `packages/core`.
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

Deliverables:

- MCP tool schemas.
- MCP handlers calling core use cases.
- contract tests.
- setup docs.

Exit criteria:

- Codex or another MCP-compatible agent can remember and recall through the server.

## Stage 4: Codex Plugin

Goal: package the MCP server for Codex.

Deliverables:

- `.codex-plugin/plugin.json`.
- plugin README.
- install/update scripts.
- Codex-specific setup docs.

Exit criteria:

- Plugin can be installed locally and used in a fresh Codex session.

## Stage 5: Public Release

Goal: publish the project.

Deliverables:

- GitHub repository.
- license.
- SECURITY.md.
- CONTRIBUTING.md.
- docs site on `nuzo.com.br`.

Exit criteria:

- No private memory files tracked.
- Install docs work from a clean environment.
