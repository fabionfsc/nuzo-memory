# ADR 0004: Package Boundaries

## Status

Accepted.

## Context

The project needs to support CLI, MCP, and Codex plugin interfaces without duplicating memory behavior.

## Decision

All memory business logic belongs in `packages/core`.

Interfaces may parse input and format output, but they must call core use cases for behavior.

## Consequences

- CLI and MCP stay consistent.
- Storage can evolve behind core ports.
- Codex-specific packaging does not leak into core logic.
- More up-front discipline is required when adding features.
