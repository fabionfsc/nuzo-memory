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
```

The command uses only public synthetic fixtures. It builds the core package,
creates a temporary store, runs the same queries through FTS, semantic-only,
and hybrid retrieval, reports each mode independently, and exits non-zero if
the acceptance envelope fails.

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

A quality improvement cannot offset a safety failure. Machine latency is
reported for regressions but is not a portable release threshold until a real
provider is selected; provider model loading and hardware vary substantially.

## Initial Evidence

The first deterministic run used 78 fixtures and 20 quality cases. It
measured:

| Mode | Overall top-1 | English top-1 | English MRR | Overall noise |
| --- | ---: | ---: | ---: | ---: |
| FTS | 65.0% | 62.5% | 62.5% | 7.1% |
| Semantic candidate | 90.0% | 87.5% | 87.5% | 0.0% |
| Hybrid | 95.0% | 93.8% | 93.8% | 5.0% |

The hybrid lift was 31.3 percentage points for English top-1 and MRR. All
safety gates passed. These numbers justify defining the optional provider and
index boundary and building a local prototype; they do not yet authorize a
runtime semantic implementation. Issue `#145` owns the final ship-or-defer
decision against that prototype.

The `0.7.0` prototype now runs this fixture provider through the exported core
provider contract, derived SQLite sidecar, revision checks, cosine search, and
hybrid fusion implementation. The provider remains benchmark-only; the
sidecar and fusion measurements therefore validate runtime mechanics without
claiming that a fixture concept map is a general embedding model.

## Runtime Separation

The benchmark remains in `tools/` and must not be included in npm runtime
artifacts. Normal Nuzo use continues to require no embedding provider, model,
account, API key, or network access.
