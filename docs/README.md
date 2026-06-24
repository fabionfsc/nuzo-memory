# Nuzo Documentation

This directory is the source of truth for Nuzo product, architecture, public
contracts, and operations documentation.

## Start Here

1. `getting-started/index.md`
2. `getting-started/clean-install.md`
3. `product/vision.md`
4. `product/positioning.md`
5. `product/competitive-landscape.md`
6. `product/requirements.md`
7. `architecture/overview.md`
8. `architecture/boundaries.md`
9. `architecture/repository-layout.md`
10. `architecture/agent-host-compatibility.md`
11. `spec/memory-model.md`
12. `spec/capture-suggestions.md`
13. `spec/tools.md`
14. `operations/local-cli.md`
15. `operations/codex-plugin.md`
16. `operations/claude-code-plugin.md`
17. `operations/lifecycle-hooks.md`
18. `operations/issue-tracking.md`
19. `operations/versioning.md`
20. `operations/release-version-map.md`
21. `operations/runtime-support.md`
22. `operations/npm-publishing.md`
23. `operations/release-checklist.md`
24. `operations/post-release-validation.md`
25. `operations/spec-driven-workflow.md`
26. `operations/roadmap.md`

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

Defines privacy, security, host plugin setup, coding standards, testing strategy, release plan, and roadmap.

GitHub Pages setup lives in `operations/github-pages.md`.

Substantial or cross-boundary changes follow
`operations/spec-driven-workflow.md`. Public contracts still belong in
`spec/`, durable decisions in `adr/`, and execution status in GitHub Issues.

### Implementation

Preserves implementation-stage notes when they still explain current behavior
or release history. New execution work should normally live in GitHub Issues,
not new implementation-stage pages.

### ADR

Records durable architecture decisions. New irreversible or hard-to-change decisions should get an ADR before implementation.

## Documentation Rule

If a behavior affects users, agents, storage, or package boundaries, document it here before implementing it.
