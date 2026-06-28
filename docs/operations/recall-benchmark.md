# Recall Benchmark

The recall benchmark is the evidence gate for `0.5.0` recall-quality work.
It uses synthetic public fixtures only. It does not use telemetry, network
calls, embeddings, private memory exports, or host-native memory data.

Run:

```bash
npm run benchmark:recall
```

The command builds `@nuzo/memory-core`, creates a temporary SQLite store,
writes deterministic synthetic memories, runs recall cases, reports metrics,
and exits non-zero if an expected envelope fails.

For machine-readable output:

```bash
npm run benchmark:recall -- --json
```

To inspect the generated SQLite store manually:

```bash
npm run benchmark:recall -- --keep
```

To evaluate the same fixtures against another built core revision, pass its
entry module explicitly:

```bash
npm run benchmark:recall -- --core-module /path/to/core/dist/index.js
```

## Fixture Coverage

English is the primary quality bar. The benchmark keeps more English cases than
any other group and enforces a separate English envelope for top-1 accuracy,
expected recall, and zero unexpected noise. Portuguese, Unicode, multilingual,
and scope/noise cases are compatibility and safety coverage; they must pass,
but they do not replace the English bar.

The fixture set covers:

- English project recall;
- English security, documentation, Git, Node.js, error-handling,
  accessibility, backup, dependency, release, and API prompts;
- Portuguese recall with accents;
- Unicode recall;
- topical tag weighting;
- `project:*` scope isolation;
- optional `user:default` inclusion through `includeGlobal`;
- archived-memory exclusion;
- bounded-result behavior;
- no-match noise behavior;
- realistic agent prompts for release and infrastructure tasks.
- multilingual host-hook-like prompts in Spanish, French, German, Russian,
  Japanese, Korean, Chinese, Arabic, Hindi, Dutch, Polish, and Turkish;
- medium-store filler rows with generic workflow, testing, docs, release, and
  storage vocabulary.

## Metrics

The benchmark reports:

- top-1 hit rate for cases with a required first result;
- expected recall rate for required inclusions, exclusions, prefixes, and
  result counts;
- ranking-reason coverage;
- noise rate for unexpected results in cases with exact expected sets;
- average and max latency in milliseconds;
- per-case result keys and failures.

The current envelope is intentionally strict for deterministic synthetic data:

```text
failures = 0
top1 >= 100%
expected_recall >= 100%
ranking reasons >= 100%
average latency <= 25 ms
max latency <= 100 ms
```

The English group additionally requires at least 12 cases with:

```text
english top1 >= 100%
english expected_recall >= 100%
english noise <= 0%
```

Do not tune SQLite FTS, tokenization, tag weighting, or ranking explanations
unless this benchmark or a documented extension shows a reproducible
improvement without scope-isolation or latency regression.

## Current Baseline

The fixture harness was also run unchanged against the core built from tag
`v0.4.0`. That baseline measured:

```text
fixtures = 103
cases = 31
top1 = 96.8%
expected_recall = 96.8%
noise = 50.0%
ranking reasons = 100%
average latency = 0.60 ms
max latency = 2.13 ms

english cases = 13
english top1 = 92.3%
english expected_recall = 100%
english noise = 64.3%
```

Latency is machine-dependent; the relevance and noise results are
deterministic for these fixtures. Reproduce the comparison from a clean
checkout with:

```bash
git worktree add --detach /tmp/nuzo-memory-v0.4.0 v0.4.0
(cd /tmp/nuzo-memory-v0.4.0 && npm ci && npm run build -w @nuzo/memory-core)
npm run benchmark:recall -- \
  --core-module /tmp/nuzo-memory-v0.4.0/packages/core/dist/index.js
git worktree remove /tmp/nuzo-memory-v0.4.0
```

The baseline exposed noise from common prompt words and single-term matches
in otherwise specific queries. The initial tuning keeps SQLite FTS local and
simple:

- remove common English and Portuguese prompt stop words before building the
  FTS query;
- require strong evidence for multi-term queries, so weak operational terms
  such as release, review, routing, docs, workflow, or testing do not pull
  unrelated memories on their own;
- allow a strong term that appears in only one scoped FTS candidate as
  distinctive single-term evidence, without maintaining fixture-specific
  vocabulary;
- keep exact tag matches strong for short topical queries;
- require multiple exact tag matches before a long query can pass on tags
  alone, unless the tag itself is distinctive.

After that tuning, the synthetic benchmark envelope is:

```text
top1 = 100%
expected_recall = 100%
noise = 0%
ranking reasons = 100%
average latency < 1 ms on the local fixture
```

These numbers are evidence for the bundled synthetic fixture only. Future
fixtures should extend the benchmark before changing the envelope.

## Published 0.5.0 Verification

The `0.5.0` release passed the benchmark envelope, Node.js 22 and 24 CI,
CodeQL, strict documentation build, npm artifact validation, and the
75-memory/53-scenario lifecycle-hook matrix. The published
`@nuzo/memory-core`, `@nuzo/memory`, `@nuzo/memory-cli`, and
`@nuzo/mcp-server` packages expose npm provenance for `0.5.0`.

Post-publication CLI, MCP, Codex plugin, and Claude Code plugin smokes also
passed while resolving the exact public `0.5.0` packages. This confirms that
the benchmark remains development evidence only and is not bundled into the
runtime package path.
