# 0.6.0 Capture Release Gates

This page records the final source-tree release gates for the `0.6.0` Capture
Intelligence milestone. It is evidence for release preparation, not the public
release record.

Publication and post-publication smokes still happen after version preparation
and npm publishing. See [Release Checklist](release-checklist.md) and
[Post-Release Validation](post-release-validation.md).

## Scope

The milestone proves that capture can classify a proposed memory before any
write and then apply an explicit user decision through the confirmed capture
boundary.

The release candidate must prove:

- `memory.suggest_capture` is read-only;
- bounded relationship evidence is scope-safe and output-bounded;
- exact duplicates, blocked candidates, rejected drafts, and unresolved
  ambiguous candidates remain write-free;
- confirmed create, update, keep-separate, clarify, and reject decisions go
  through `memory.confirm_capture`;
- confirmed updates pass the displayed memory ID and revision;
- stale revisions return `MEMORY_REVISION_CONFLICT` without silent retry;
- Codex and Claude Code generated artifacts resolve the version-pinned Nuzo
  runtime and keep host wrappers thin.

## Source-Tree Gate Evidence

These commands were run before closing the milestone implementation gate:

```bash
npm run check
npm test
npm run release:check
npm run build
npm run benchmark:recall
npm run benchmark:capture
npm run benchmark:capture -- --expect bounded
npm run validate:npm
npm run smoke:cli
npm run smoke:host-hooks
npm run smoke:claude-code-plugin
npm run smoke:codex-plugin
npm run package:plugins
.venv-docs/bin/mkdocs build --strict --site-dir /tmp/nuzo-release-gates-site
git diff --check
```

The build-mutating gates should be run sequentially because `dist/` and
`build/` are recreated by several commands.

## Benchmark Evidence

### Recall Benchmark

`npm run benchmark:recall` passed with:

- `top1=100.0%`;
- `expected_recall=100.0%`;
- `noise=0.0%`;
- English group `top1=100.0%` and `expected_recall=100.0%`.

### Capture Baseline Profile

`npm run benchmark:capture` passed as the reproducible `0.5.0` baseline profile:

- `profile_accuracy=100.0%`;
- `contract_coverage=0.0%`;
- `exact_duplicate_recall=100.0%`;
- `policy_accuracy=100.0%`;
- `safety=100.0%`;
- `zero_writes=100.0%`;
- `memory_writes=0`;
- `audit_writes=0`;
- `scope_violations=0`;
- `archived_violations=0`;
- `bound_violations=0`.

This baseline intentionally does not claim bounded relationship evidence.

### Capture Bounded Profile

`npm run benchmark:capture -- --expect bounded` passed as the `0.6.0` release
quality profile:

- `target_relationship_accuracy=100.0%`;
- `profile_accuracy=100.0%`;
- `contract_coverage=100.0%`;
- `exact_duplicate_recall=100.0%`;
- `primary_accuracy=100.0%`;
- `policy_accuracy=100.0%`;
- `safety=100.0%`;
- `zero_writes=100.0%`;
- `evidence_reasons=100.0%`;
- `memory_writes=0`;
- `audit_writes=0`;
- `scope_violations=0`;
- `archived_violations=0`;
- `bound_violations=0`.

English quality is gated independently and passed:

- English `target=100.0%`;
- English `profile=100.0%`;
- English `contract=100.0%`;
- English `safety=100.0%`.

## Staged Package And Host Evidence

`npm run validate:npm` passed against staged npm tarballs. It validates:

- installed CLI session continuity;
- installed MCP session continuity;
- read-only capture suggestions;
- explicit `memory.confirm_capture` create, update, reject, duplicate-skip, and
  stale revision conflict behavior;
- exact public MCP tool set;
- `memory.doctor` without exposing stored memory content.

`npm run smoke:host-hooks` passed the lifecycle-hook matrix with 75 memories and
53 scenarios. It proves bounded read-only recall and no hook writes.

`npm run smoke:claude-code-plugin` and `npm run smoke:codex-plugin` passed
against generated host artifacts and staged npm tarballs. They prove the same
separate-session MCP continuity flow through the release-layout host packages.

## Post-Publication Gates

After version preparation and npm publication, run:

```bash
npm run smoke:published:cli
npm run smoke:published:mcp
NUZO_PLUGIN_SMOKE_PUBLISHED=1 npm run smoke:claude-code-plugin
NUZO_PLUGIN_SMOKE_PUBLISHED=1 npm run smoke:codex-plugin
```

Those commands resolve public npm packages and should be treated as
post-publication evidence, not as source-tree milestone closure.
