# Nuzo Documentation

This directory is the source of truth for Nuzo product, architecture, public
contracts, and operations documentation.

## Start Here

1. `getting-started/index.md`
2. `getting-started/clean-install.md`
3. `getting-started/agent-memory-loop.md`
4. `operations/roadmap.md`
5. `architecture/overview.md`
6. `architecture/boundaries.md`
7. `spec/tools.md`
8. `spec/memory-model.md`
9. `spec/capture-suggestions.md`

## Sections

### Product

Defines what the project is, who it serves, and what is intentionally out of scope.

### Architecture

Defines system shape, storage design, package boundaries, agent host compatibility, and repository layout.

### Spec

Defines public contracts: memory model, MCP tools, CLI behavior, init behavior, and versioning.

Architecture decisions live under `adr/`, including package boundaries, host
plugin runtime distribution, and test organization.

### Operations

Defines privacy, security, host plugin setup, coding standards, testing
strategy, release procedures, and roadmap.

GitHub Pages setup lives in `operations/github-pages.md`.

Substantial or cross-boundary changes follow
`operations/spec-driven-workflow.md`. Public contracts still belong in
`spec/`, durable decisions in `adr/`, and execution status in GitHub Issues.

### ADR

Records durable architecture decisions. New irreversible or hard-to-change decisions should get an ADR before implementation.

## Documentation Rule

If a behavior affects users, agents, storage, or package boundaries, document it here before implementing it.
