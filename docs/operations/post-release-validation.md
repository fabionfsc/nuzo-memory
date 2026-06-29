# Post-Release Validation

This page defines the product-hardening loop after each public release. The
loop preserves read-only task-start recall, explicit save requests, inferred
capture drafts, confirmed writes, duplicate/update guidance, structured update
conflicts, and session-continuity validation across release goals.

## Current Focus

For every current release, prioritize:

- continued installed-package validation over source-tree-only validation;
- continued Codex and Claude Code host behavior through official plugin paths;
- read-only recall before work starts;
- capture suggestions that require explicit confirmation;
- the active goal's benchmark and public-contract exit criteria;
- conflict handling with expected revisions in host-facing flows;
- clear rejection, ambiguity, and blocked-content messages;
- documentation that matches commands tested against published packages.

Defer features that do not strengthen this flow, including sync, UI,
background capture, local installer scripts, and host-specific memory formats.
Optional embeddings shipped in `0.7.0` remain outside host lifecycle hooks and
must not become a default or capture dependency.

For `0.6.0`, this loop must additionally prove read-only relationship evidence
before confirmed create or update decisions. For `0.7.0`, post-release checks
also prove default FTS behavior, explicit model provisioning, derived-index
rebuild/clear, hybrid paraphrase recall, and visible FTS fallback. Semantic
retrieval must not be pulled into capture classification.

## Published 0.6.0 Verification

The `0.6.0` release was published from `main` at commit
`c469a3f5c69bcecd862e21eef0a27398353efaff` through the GitHub Release
[`v0.6.0`](https://github.com/fabionfsc/nuzo-memory/releases/tag/v0.6.0).

The npm trusted-publishing workflow completed successfully for:

- `@nuzo/memory-core@0.6.0`;
- `@nuzo/memory@0.6.0`;
- `@nuzo/memory-cli@0.6.0`;
- `@nuzo/mcp-server@0.6.0`.

Post-publication validation passed with:

```bash
npm run smoke:published:cli
npm run smoke:published:mcp
NUZO_PLUGIN_SMOKE_PUBLISHED=1 npm run smoke:claude-code-plugin
NUZO_PLUGIN_SMOKE_PUBLISHED=1 npm run smoke:codex-plugin
```

This confirms that the published CLI, MCP runtime, generated Codex artifact,
and generated Claude Code artifact resolve the exact public `0.6.0` packages
and preserve the confirmed-capture session-continuity contract.

## Published 0.7.0 Verification

The `0.7.0` release was published from `main` at commit
`b8c1d8287e3f24314bdcd34529411d461fc2fa39` through the GitHub Release
[`v0.7.0`](https://github.com/fabionfsc/nuzo-memory/releases/tag/v0.7.0).
The npm dry run passed in
[workflow run 28354901494](https://github.com/fabionfsc/nuzo-memory/actions/runs/28354901494),
then trusted publishing completed in
[workflow run 28354962114](https://github.com/fabionfsc/nuzo-memory/actions/runs/28354962114).

Registry metadata and npm attestations verified the exact release and
provenance for:

- `@nuzo/memory-core@0.7.0`;
- `@nuzo/memory@0.7.0`;
- `@nuzo/memory-cli@0.7.0`;
- `@nuzo/mcp-server@0.7.0`.

The published CLI, MCP, optional-semantics, Codex plugin, and Claude Code plugin smokes passed.
A clean default installation contained neither Transformers.js nor model
files, and an explicit hybrid request reported FTS fallback with
`SEMANTIC_INDEX_MISSING`. After installing the exact optional peer and using
the checksum-verified pinned model, the published CLI rebuilt the derived
index and recovered a paraphrased memory in effective `semantic` and `hybrid`
mode without fallback. This validation used only fake memory content.

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
10. Confirm a new memory through `memory.confirm_capture` with
    `decision: "create"`.
11. When the release supports replacement evidence, confirm updates through
    `memory.confirm_capture` with `decision: "update"`, `target_memory_id`,
    and `expected_revision`, then test the conflict path.
12. Run `memory.doctor` or `nuzo memory doctor` against the same store.

Use fake memory content only.

## Host Validation

Codex and Claude Code are the priority hosts.

Validate each host with the generated release artifact and the published
`@nuzo/memory` package. Development-only direct MCP configuration remains
useful for debugging, but it is not enough to prove release readiness.

For each host, capture evidence for:

- plugin metadata loads as `Nuzo`;
- the `nuzo` MCP server connects;
- `memory.doctor` works;
- `memory.recall_hook` can read existing test memory;
- `memory.suggest_capture` returns a read-only draft;
- confirmed creation calls `memory.confirm_capture` with `decision: "create"`;
- confirmed replacement calls `memory.confirm_capture` with
  `decision: "update"` and the displayed revision;
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

The focused published optional-semantics smoke is:

```bash
npm run smoke:published:semantics
```

It installs the current released package into a temporary npm prefix, confirms
the default install does not include Transformers.js or model files, and checks
that hybrid recall falls back visibly when no sidecar exists. To require a real
local semantic rebuild and recall through the exact published package, run:

```bash
NUZO_SEMANTIC_MODEL_PATH=/absolute/path/to/pinned-model \
  npm run smoke:published:semantics -- --require-model
```

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
- confirmation calls `memory.confirm_capture`;
- rejected drafts are not persisted;
- duplicate suggestions do not create new active memories;
- secrets and unsafe content are blocked by core policy.

## Release Acceptance Invariants

A release that changes capture or host behavior is ready only when:

- published CLI and MCP packages continue to pass session-continuity smoke tests;
- Codex and Claude Code release artifacts continue to validate against the
  published MCP runtime;
- task-start recall remains read-only and does not add capture suggestions;
- explicit save requests go through `memory.suggest_capture` before confirmed
  writes;
- rejected capture drafts are not persisted;
- duplicate and update decisions are documented and validated;
- stale update revisions return structured conflict errors;
- docs describe only install and verification paths that were tested;
- issue hunting finds no release-blocking doc drift, stale version references,
  or untracked runtime artifacts;
- open work that remains is represented by focused GitHub Issues;
- no new hidden-write memory path has been introduced.

## Issue Tracking

Create focused issues from the active release goal only when their contract,
boundary, and acceptance evidence are concrete. Keep broad product direction
in the roadmap and use issues for assignable work. After release, close
completed issues and carry documented non-blockers into the next applicable
milestone.
