# ADR 0005: Stable Tool Contracts

## Status

Accepted.

## Context

Agents are sensitive to tool names, argument shapes, and response structure. Changing these casually would break integrations and force refactors.

## Decision

MCP tool names and schemas are public contracts.

Each tool must be documented in `docs/spec/tools.md` before implementation.

## Consequences

- Breaking changes require explicit versioning.
- Tests must cover tool input and output shapes.
- Implementation can change internally while agent-facing behavior remains stable.
