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

The first `0.5.0` benchmark run against the `0.4.0` recall behavior exposed
noise from common prompt words and single-term matches in otherwise specific
queries. The initial tuning keeps SQLite FTS local and simple:

- remove common English and Portuguese prompt stop words before building the
  FTS query;
- require strong evidence for multi-term queries, so weak operational terms
  such as release, review, routing, docs, workflow, or testing do not pull
  unrelated memories on their own;
- allow a small set of distinctive single-term matches for host-like prompts
  where the domain term is itself enough evidence;
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
