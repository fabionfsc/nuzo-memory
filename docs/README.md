# Nuzo Documentation

This directory is the source of truth for the project until implementation starts.

## Start Here

1. `getting-started/index.md`
2. `product/vision.md`
3. `product/positioning.md`
4. `product/competitive-landscape.md`
5. `product/requirements.md`
6. `architecture/overview.md`
7. `architecture/boundaries.md`
8. `architecture/agent-host-compatibility.md`
9. `spec/memory-model.md`
10. `spec/tools.md`
11. `implementation/stage-1-core.md`
12. `operations/codex-plugin.md`
13. `operations/claude-code-plugin.md`
14. `operations/lifecycle-hooks.md`
15. `operations/roadmap.md`

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
