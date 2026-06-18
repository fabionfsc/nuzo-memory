# Nuzo Documentation

This directory is the source of truth for the project until implementation starts.

## Start Here

1. `getting-started/index.md`
2. `getting-started/clean-install.md`
3. `product/vision.md`
4. `product/positioning.md`
5. `product/competitive-landscape.md`
6. `product/requirements.md`
7. `architecture/overview.md`
8. `architecture/boundaries.md`
9. `architecture/agent-host-compatibility.md`
10. `spec/memory-model.md`
11. `spec/tools.md`
12. `implementation/stage-1-core.md`
13. `operations/local-cli.md`
14. `operations/codex-plugin.md`
15. `operations/claude-code-plugin.md`
16. `operations/lifecycle-hooks.md`
17. `operations/issue-tracking.md`
18. `operations/versioning.md`
19. `operations/roadmap.md`

## Sections

### Product

Defines what the project is, who it serves, and what is intentionally out of scope.

### Architecture

Defines system shape, storage design, package boundaries, agent host compatibility, and repository layout.

### Spec

Defines public contracts: memory model, MCP tools, CLI behavior, init behavior, and versioning.

### Operations

Defines privacy, security, host plugin setup, coding standards, testing strategy, release plan, and roadmap.

GitHub Pages setup lives in `operations/github-pages.md`.

### Implementation

Defines the next implementation stages before code lands.

### ADR

Records durable architecture decisions. New irreversible or hard-to-change decisions should get an ADR before implementation.

## Documentation Rule

If a behavior affects users, agents, storage, or package boundaries, document it here before implementing it.
