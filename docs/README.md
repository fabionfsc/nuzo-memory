# Nuzo Documentation

This directory is the source of truth for Nuzo product, architecture, public
contracts, and operations documentation.

## Start Here

1. `getting-started/index.md`
2. `getting-started/clean-install.md`
3. `getting-started/agent-memory-loop.md`
4. `product/vision.md`
5. `product/positioning.md`
6. `product/competitive-landscape.md`
7. `product/requirements.md`
8. `architecture/overview.md`
9. `architecture/boundaries.md`
10. `architecture/memory-trust-boundary.md`
11. `architecture/repository-layout.md`
12. `architecture/agent-host-compatibility.md`
13. `spec/memory-model.md`
14. `spec/capture-suggestions.md`
15. `spec/tools.md`
16. `operations/local-cli.md`
17. `operations/codex-plugin.md`
18. `operations/claude-code-plugin.md`
19. `operations/lifecycle-hooks.md`
20. `operations/issue-tracking.md`
21. `operations/versioning.md`
22. `operations/release-goals.md`
23. `operations/release-version-map.md`
24. `operations/runtime-support.md`
25. `operations/npm-publishing.md`
26. `operations/release-checklist.md`
27. `operations/post-release-validation.md`
28. `operations/recall-benchmark.md`
29. `operations/capture-benchmark.md`
30. `operations/semantic-benchmark.md`
31. `operations/capture-release-gates-0.6.0.md`
32. `operations/spec-driven-workflow.md`
33. `operations/roadmap.md`

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
