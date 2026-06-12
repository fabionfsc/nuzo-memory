# Nuzo Memory Documentation

This directory is the source of truth for the project until implementation starts.

## Start Here

1. `product/vision.md`
2. `product/requirements.md`
3. `architecture/overview.md`
4. `architecture/boundaries.md`
5. `spec/memory-model.md`
6. `spec/tools.md`
7. `spec/init.md`
8. `operations/roadmap.md`

## Sections

### Product

Defines what the project is, who it serves, and what is intentionally out of scope.

### Architecture

Defines system shape, storage design, package boundaries, and repository layout.

### Spec

Defines public contracts: memory model, MCP tools, CLI behavior, init behavior, and versioning.

### Operations

Defines privacy, security, coding standards, testing strategy, release plan, and roadmap.

GitHub Pages setup lives in `operations/github-pages.md`.

### ADR

Records durable architecture decisions. New irreversible or hard-to-change decisions should get an ADR before implementation.

## Documentation Rule

If a behavior affects users, agents, storage, or package boundaries, document it here before implementing it.
