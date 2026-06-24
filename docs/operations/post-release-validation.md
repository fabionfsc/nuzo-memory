# Post-Release Validation

This page defines the next product-hardening loop after the `0.1.1` release.

The goal for `0.1.2` is not to add many new features. It is to prove that Nuzo
works naturally in real agent workflows: a user can store useful memory, start a
fresh session, recall that memory through the supported runtime path, and audit
or reject inferred writes.

## Current Focus

For `0.1.2`, prioritize:

- real installed-package validation over source-tree-only validation;
- memory continuity across separate sessions and processes;
- Codex and Claude Code host behavior through official plugin paths;
- read-only recall before work starts;
- capture suggestions that require explicit confirmation;
- documentation that matches commands tested against published packages.

Defer features that do not strengthen this flow, including sync, embeddings,
UI, background capture, local installer scripts, and host-specific memory
formats.

The `0.2.0` phase should focus on the complete capture lifecycle and agent UX.
Post-`0.2.0` work may explore optional semantic search, local embeddings, or
provider plugins, but those must remain opt-in and must not introduce network
calls, telemetry, or inferred writes by default.

## Real Flow To Prove

The canonical post-release smoke is:

1. Install the released CLI or MCP runtime from npm.
2. Initialize a temporary local memory store.
3. Store a fake durable memory in session A.
4. Start session B as a separate process.
5. Recall the memory from session B.
6. Call `memory.recall_hook` and confirm it is read-only.
7. Call `memory.suggest_capture` or `nuzo memory suggest-capture`.
8. Confirm the suggestion does not write before user confirmation.
9. Confirm a duplicate suggestion reports the existing memory instead of
   proposing a redundant write.
10. Run `memory.doctor` or `nuzo memory doctor` against the same store.

Use fake memory content only.

## Host Validation

Codex and Claude Code are the priority hosts.

Validate each host with the generated release artifact and the published
`@nuzo/mcp-server` package. Development-only direct MCP configuration remains
useful for debugging, but it is not enough to prove release readiness.

For each host, capture evidence for:

- plugin metadata loads as `Nuzo`;
- the `nuzo` MCP server connects;
- `memory.doctor` works;
- `memory.recall_hook` can read existing test memory;
- `memory.suggest_capture` returns a read-only draft;
- confirmed capture calls `memory.remember`;
- no host wrapper duplicates core memory logic.

If a host cannot automate one of these checks yet, document the manual command
or UI path and create a focused GitHub Issue.

## Automation Direction

Repeated post-release checks should become scripts or tests.

Add automation in this order:

1. installed CLI session-continuity smoke;
2. installed MCP stdio session-continuity smoke;
3. generated Codex plugin release-layout validation;
4. generated Claude Code plugin release-layout validation;
5. host-native validation when the upstream host CLI supports it.

Prefer extending `npm run validate:npm` or adding a focused release smoke script
over copying manual command lists into multiple docs.

The focused CLI smoke is:

```bash
npm run smoke:published:cli
```

It installs the current released CLI package into a temporary npm prefix, uses a
temporary SQLite store, runs separate CLI processes for session-style writes and
recall, validates read-only capture suggestions, checks duplicate detection,
and confirms `doctor` does not expose memory content.

The focused MCP smoke is:

```bash
npm run smoke:published:mcp
```

It installs the current released MCP package into a temporary npm prefix,
connects through the official MCP SDK over stdio, runs separate server
processes for session-style writes and recall, validates read-only capture
suggestions, checks duplicate detection, and confirms `memory.doctor` does not
expose memory content.

The generated Codex plugin artifact smoke is:

```bash
npm run smoke:codex-plugin
```

It regenerates the release-layout Codex plugin, verifies the plugin metadata
loads as `Nuzo`, reads the bundled `nuzo` MCP server config, resolves the
published version-pinned MCP runtime through that config, and validates the
same read-only recall, capture suggestion, confirmed write, duplicate, and
doctor flow through separate stdio sessions.

The generated Claude Code plugin artifact smoke is:

```bash
npm run smoke:claude-code-plugin
```

It regenerates the release-layout Claude Code plugin, verifies the plugin
metadata loads as `Nuzo`, resolves `${CLAUDE_PLUGIN_ROOT}` to an isolated
temporary plugin install path, reads the bundled `nuzo` MCP server config, and
validates the same read-only recall, capture suggestion, confirmed write,
duplicate, and doctor flow through separate stdio sessions.

## Capture Suggestion Boundary

Automatic memory should remain suggestion-first.

Nuzo may help identify candidate memories, but inferred writes must stay drafts
until the user confirms them. The validation loop must prove:

- candidate detection is outside core storage;
- `memory.suggest_capture` is read-only;
- confirmation calls `memory.remember`;
- rejected drafts are not persisted;
- duplicate suggestions do not create new active memories;
- secrets and unsafe content are blocked by core policy.

## Acceptance Criteria For 0.1.2

`0.1.2` should be considered ready when:

- published CLI and MCP packages pass session-continuity smoke tests;
- Codex and Claude Code release artifacts are validated against the published
  MCP runtime;
- docs describe only install and verification paths that were tested;
- issue hunting finds no release-blocking doc drift, stale version references,
  or untracked runtime artifacts;
- open work that remains is represented by focused GitHub Issues;
- no new hidden-write memory path has been introduced.

## Issue Seeds

Create or update GitHub Issues for:

- installed CLI memory continuity across separate process sessions;
- installed MCP memory continuity through stdio;
- Codex plugin release-artifact recall and capture suggestion smoke;
- Claude Code plugin release-artifact recall and capture suggestion smoke;
- capture suggestion candidate criteria and rejection examples;
- docs drift checks for published package commands.

Keep issues executable. Broad product notes belong in roadmap docs; assignable
work belongs in GitHub Issues.
