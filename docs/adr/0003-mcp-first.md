# ADR 0003: MCP First

## Status

Accepted.

## Context

The project should work with Codex and other agents. MCP gives a common tool boundary and avoids coupling the memory system to one assistant UI.

## Decision

Expose the first agent integration as an MCP server.

The Codex plugin should package and configure that MCP server rather than inventing a separate runtime contract.

## Consequences

- Codex compatibility is achievable without making Codex the only target.
- Other MCP-compatible agents can use the same server.
- Tool contracts must be stable and documented.
