# Optional Semantics Benchmark

The optional-semantics benchmark is the evidence gate for `0.7.0`. It asks a
narrow question: can an offline semantic candidate and hybrid ranking recover
useful paraphrases that the current SQLite FTS path misses, without weakening
Nuzo's safety properties?

Run:

```bash
npm run benchmark:semantics
```

For machine-readable output or to retain the temporary SQLite store:

```bash
npm run benchmark:semantics -- --json
npm run benchmark:semantics -- --keep
npm run benchmark:semantics -- --store-size medium
```

Maintainers can evaluate an unbundled provider adapter over the same raw-text
fixtures:

```bash
node tools/semantic-benchmark.mjs \
  --provider-module /absolute/path/to/provider.mjs \
  --similarity-floor 0.34
```

The module must export an `EmbeddingProvider` as its default export or an async
`createProvider()` function. This is a development hook that executes the
specified local JavaScript file with the maintainer's authority; it is not a
runtime plugin loader or an end-user configuration field.

After installing the optional runtime peer and explicitly provisioning the
pinned model, run the selected `0.7.0` provider directly through core:

```bash
node tools/semantic-benchmark.mjs \
  --local-transformers-model /absolute/path/to/pinned-model \
  --similarity-floor 0.34
```

The command uses only public synthetic fixtures. It builds the core package,
creates a temporary store, runs the same queries through FTS, semantic-only,
and hybrid retrieval, reports each mode independently, and exits non-zero if
the acceptance envelope fails.

`--store-size medium` keeps the same quality and safety cases, then adds
synthetic active memories across `project:nuzo`, `project:other`, and
`user:default`. It measures scoped status, missing-index fallback, cold hybrid
recall, warm hybrid recall, peak RSS, canonical row counts, and vector row
counts. This catches regressions where scoped semantic work accidentally scans
or validates unrelated project vectors.

## What This Benchmark Proves

The benchmark includes 16 independently gated English cases, compatibility
cases in Portuguese, Spanish, and German, medium-store noise, global/project
scope behavior, archived records, and bounded-result clusters. English is the
primary product-quality bar; compatibility results cannot compensate for an
English failure.

The candidate encoder is a deterministic public concept-hash fixture. It
normalizes a documented set of concepts and hashes them into a fixed vector.
This makes ranking experiments offline, inspectable, and reproducible on Node
22 and 24. Its descriptor explicitly sets `runtimeCandidate: false`: it is not
an embedding model, is not bundled into published packages, and cannot by
itself justify a production provider. It proves the index and fusion evidence
gate, while the provider boundary and runtime prototype must supply their own
tests and benchmark adapter.

This distinction prevents an oracle-like fixture from being represented as a
general semantic model. A production provider must embed raw memory and query
text through the same public interface and meet this envelope without fixture
keys or expected answers.

## Metrics

Each retrieval mode reports:

- top-1 accuracy;
- mean reciprocal rank (MRR);
- unexpected-result noise;
- average and maximum local latency;
- English and compatibility groups separately;
- per-case ranks and result keys in JSON output.

The medium-store profile additionally reports:

- active canonical rows by scope;
- semantic vector rows by scope;
- authorized vector rows for `project:nuzo`;
- authorized vector rows for `project:nuzo` plus `user:default`;
- scoped status latency;
- missing-index fallback latency;
- cold and warm hybrid recall latency;
- process peak RSS.

Hybrid retrieval uses reciprocal-rank fusion over independently ranked FTS and
semantic candidate lists. The benchmark does not tune or mutate the canonical
FTS implementation.

## Acceptance Envelope

The hybrid candidate must satisfy all of these quality gates:

```text
English cases >= 16
English top-1 >= 87.5%
English MRR >= 90%
English noise <= 10%
English top-1 lift over FTS >= 20 percentage points
English MRR lift over FTS >= 15 percentage points
```

The following safety gates fail independently from quality:

```text
project scope isolation = pass in every mode
archived exclusion = pass in every mode
global scope is opt-in = pass in every mode
bounded output = pass in every mode
unrelated query remains quiet = pass in every mode
memory and audit writes during evaluation = 0
network requests by the candidate = 0
```

The medium-store envelope is intentionally local and conservative for host
workflow gating rather than a cloud-scale search claim:

```text
scoped semantic status <= 50 ms
missing-index hybrid fallback <= 50 ms
cold hybrid recall <= 100 ms
warm hybrid recall <= 75 ms
peak RSS <= 512 MiB
scoped status vector count = authorized project vectors only
include-global status vector count = project vectors + user:default vectors
```

A quality improvement cannot offset a safety failure. Machine latency is
reported for regressions. Provider model loading and hardware vary
substantially, so the envelope covers local index/status/search overhead and
does not include downloading or first-time model provisioning.

## Initial Evidence

The first deterministic run used 78 fixtures and 20 quality cases. It
measured:

| Mode | Overall top-1 | English top-1 | English MRR | Overall noise |
| --- | ---: | ---: | ---: | ---: |
| FTS | 65.0% | 62.5% | 62.5% | 7.1% |
| Semantic candidate | 90.0% | 87.5% | 87.5% | 0.0% |
| Hybrid | 95.0% | 93.8% | 93.8% | 5.0% |

The hybrid lift was 31.3 percentage points for English top-1 and MRR. All
safety gates passed. These initial numbers justified defining the optional
provider and index boundary and building a local prototype, but did not by
themselves authorize a runtime implementation. Issue `#145` subsequently
recorded the real-provider comparison and ship decision.

The `0.7.0` prototype now runs this fixture provider through the exported core
provider contract, derived SQLite sidecar, revision checks, cosine search, and
hybrid fusion implementation. The provider remains benchmark-only; the
sidecar and fusion measurements therefore validate runtime mechanics without
claiming that a fixture concept map is a general embedding model.

The `0.8.0` medium-store profile measured 1,628 synthetic memories: 824 active
`project:nuzo` rows, 751 active `project:other` rows, 52 active
`user:default` rows, and one archived row excluded from the sidecar. Scoped
status reported only the 824 authorized project vectors, while
`includeGlobal` reported 876 vectors (`project:nuzo` plus `user:default`).
On the release-gate Linux host the deterministic profile measured
approximately 7.5 ms scoped status, 7.4 ms missing-index fallback, 43.2 ms
cold hybrid recall, 39.3 ms warm hybrid recall, and 87.3 MiB peak RSS. Quality
and safety gates stayed unchanged: hybrid English top-1 and MRR remained
93.8%, overall hybrid top-1 remained 95.0%, zero writes passed, and no network
was used.

## Runtime Separation

The benchmark remains in `tools/` and must not be included in npm runtime
artifacts. Normal Nuzo use continues to require no embedding provider, model,
account, API key, or network access.
