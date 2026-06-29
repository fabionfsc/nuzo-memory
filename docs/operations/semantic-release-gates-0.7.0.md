# 0.7.0 Optional Semantics Release Gates

This page records release-level evidence for Nuzo `0.7.0`. It complements the
benchmark methodology and ship decision with package, interface, security,
and staged-install proof.

## Shipped Boundary

- FTS remains the default for core, CLI, MCP, and lifecycle hooks.
- Semantic and hybrid recall require an explicit mode.
- The local inference runtime is an exact optional peer and is absent from
  normal installs.
- Model provisioning is a separate command requiring `--allow-network --yes`.
- Rebuild and recall use a pinned checksum-verified local model with remote
  loading disabled.
- The semantic SQLite sidecar is derived, disposable, revision-aware, and
  excluded from memory exports.
- Canonical writes never call the provider.
- Hybrid fallback remains machine-readable even when FTS returns no results.

## Quality Evidence

The deterministic offline fixture profile passed with 78 memories, 20 quality
cases, and 5 independent safety cases:

```text
FTS English top-1 / MRR = 62.5% / 62.5%
fixture hybrid English top-1 / MRR = 93.8% / 93.8%
fixture hybrid overall noise = 5.0%
English top-1 / MRR lift = 31.3 percentage points
```

The pinned real provider passed over the same raw text:

```text
provider = @huggingface/transformers 4.2.0
model revision = aff7a1dc4e8a1ea593e6ea21e95c22ef0a25966f
model dtype / dimensions = q4 / 384
similarity floor = 0.34
semantic contribution limit = 1

real hybrid English top-1 / MRR = 100.0% / 100.0%
real hybrid overall noise = 9.5%
English top-1 / MRR lift = 37.5 percentage points
average warm benchmark query = 9.17 ms
```

Semantic-only noise was 38.7%, so the release recommends conservative hybrid
instead of semantic-only recall. Raising the absolute floor removed useful
paraphrases and did not provide a better gate.

## Independent Safety Evidence

FTS, semantic, and hybrid modes independently passed:

- project scope isolation;
- explicit global-scope inclusion;
- archived exclusion;
- bounded results;
- unrelated-query quiet behavior;
- zero canonical memory writes;
- zero audit writes;
- no network during rebuild or recall.

Additional tests prove stale, missing, incompatible, malformed, and cleared
sidecars; model/dependency absence; network consent; download checksum
rejection; provider failure; cross-scope freshness; and fallback with an empty
result set.

The core, CLI, and MCP suites passed with 90, 31, and 26 tests respectively.
The existing recall benchmark remained at 100% top-1/expected recall and zero
noise. Both capture benchmark profiles retained 100% of their applicable
quality and safety gates.

## Model And Resource Evidence

Explicit provisioning downloaded and verified:

```text
files = 5
bytes = 55,035,424
model disk = approximately 53 MiB
output dimensions = 384 finite numbers
```

On the release-gate Linux host:

```text
optional Transformers.js dependency tree = approximately 660 MiB
cold one-memory hybrid CLI wall time = 0.91 seconds
cold one-memory hybrid CLI peak RSS = approximately 182 MiB
```

These are local observations, not portable performance promises. They are
documented so users can make an informed opt-in decision.

## Staged Artifact Evidence

`npm run validate:npm` installed the generated `@nuzo/memory-core` and
`@nuzo/memory` tarballs into a clean temporary project and proved:

- normal install did not contain `@huggingface/transformers`;
- normal package trees contained no ONNX/model files;
- both packages declared the exact optional peer;
- default FTS CLI, MCP, and host-hook continuity passed;
- hybrid without a sidecar returned visible FTS fallback.

With `NUZO_SEMANTIC_MODEL_PATH` set, the same staged validation installed the
exact optional peer, wrote fake canonical memory, rebuilt the sidecar through
the staged CLI, and recalled the expected paraphrase with effective mode
`hybrid` and no fallback.

The generated Codex and Claude Code plugin smokes passed without enabling
semantic lifecycle behavior.

## Security And Release Evidence

- `npm audit --audit-level=moderate` found zero vulnerabilities.
- `npm audit signatures` verified 177 registry signatures and 31 attestations.
- Node.js 22 and 24, strict docs, and CodeQL remain required PR checks.
- A CodeQL high-severity TOCTOU alert in JSON import was fixed by opening the
  file once without following symlinks, then applying type, size, and read
  operations to that same descriptor.
- The pinned-model network write is accepted only after its committed SHA-256
  matches; the corresponding CodeQL review was documented as a false positive.
- `npm run release:rehearse -- 0.7.0` passed release preparation, state checks,
  host packaging, npm packaging, and installed-artifact validation in an
  isolated copy.
- Runtime memory, model, sidecar, build, docs, credential, and local operator
  files remain ignored and excluded from release artifacts.

## Publication Evidence

GitHub Release [`v0.7.0`](https://github.com/fabionfsc/nuzo-memory/releases/tag/v0.7.0)
and its tag resolve to release commit
`b8c1d8287e3f24314bdcd34529411d461fc2fa39`.
[The npm dry run](https://github.com/fabionfsc/nuzo-memory/actions/runs/28354901494)
and [trusted publication](https://github.com/fabionfsc/nuzo-memory/actions/runs/28354962114)
passed. The four public `0.7.0` packages expose npm provenance attestations.

Post-publication CLI, MCP, Codex plugin, and Claude Code plugin smokes passed
against registry packages. A separate clean-project check proved both sides
of the optional boundary: the default installation omitted Transformers.js
and returned visible FTS fallback, while the exact optional peer plus the
pinned local model rebuilt the sidecar and completed hybrid paraphrase recall.

## Commands

```bash
npm ci
npm run check
npm run release:check
npm test
npm run benchmark:recall
npm run benchmark:capture
npm run benchmark:capture -- --expect bounded
npm run benchmark:semantics
node tools/semantic-benchmark.mjs \
  --local-transformers-model /absolute/path/to/pinned-model \
  --similarity-floor 0.34
npm run package:plugins
npm run validate:npm
NUZO_SEMANTIC_MODEL_PATH=/absolute/path/to/pinned-model npm run validate:npm
npm run smoke:cli
npm run smoke:host-hooks
NUZO_USE_EXISTING_ARTIFACTS=1 npm run smoke:claude-code-plugin
NUZO_USE_EXISTING_ARTIFACTS=1 npm run smoke:codex-plugin
.venv-docs/bin/mkdocs build --strict
npm audit --audit-level=moderate
npm audit signatures
npm run release:rehearse -- 0.7.0
```
