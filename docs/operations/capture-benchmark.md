# Capture Intelligence Benchmark

The capture benchmark is the evidence gate for the two-pass `0.6.0` Capture
Intelligence goal. It fixes public fixture expectations before relationship
classification is implemented or tuned.

The benchmark uses synthetic data only. It makes no network calls, uses no
telemetry, embeddings, remote models, private exports, or host-native memory.
It is a development tool and is not part of published runtime packages.

## Commands

Run the current baseline profile:

```bash
npm run benchmark:capture
```

The command builds `@nuzo/memory-core`, creates a temporary SQLite store,
writes deterministic fixtures, calls `suggestCapture` in the requested bounded
mode, and checks the observed result against the selected expectation profile.

Machine-readable output:

```bash
npm run benchmark:capture -- --json
```

Keep the generated store for manual inspection:

```bash
npm run benchmark:capture -- --keep
```

Evaluate another built core revision with the unchanged harness:

```bash
npm run benchmark:capture -- \
  --expect baseline \
  --core-module /path/to/core/dist/index.js
```

Exercise the bounded contract gate:

```bash
npm run benchmark:capture -- --expect bounded
```

The bounded command intentionally exits non-zero on `v0.5.0`, because that
release implements exact duplicate detection but not the opt-in relationship
contract. Current `0.6.0` development builds must pass this profile through
evidence-backed core behavior; they must not weaken fixture expectations to
obtain a green result.

## Expectation Profiles

`baseline` preserves the exact `v0.5.0` behavior for reproducibility checks:

- exact duplicates return `exact_duplicate` through the legacy duplicate
  result;
- non-exact allowed suggestions return `legacy_ready`;
- policy failures return their expected structured error;
- no successful case returns bounded relationship evidence;
- every safety invariant and latency envelope passes.

`bounded` is the implementation gate defined by ADR 0008 and the capture
suggestion contract. It requires every successful case to return versioned
bounded evidence, the expected relationship and primary candidate, correct
status mapping, and all evidence limits.

The baseline profile is a reproducibility gate, not the `0.6.0` quality bar.
The bounded profile is the release quality bar for Pass 1 relationship
evidence.

## Fixture Coverage

The current fixture contains 74 active or archived memories and 37 cases.
English is the primary quality group with 21 cases, more than every other
group, and reports its own target accuracy, profile accuracy, contract
coverage, and safety rate.

Expected outcomes are fixed before classifier work:

```text
exact_duplicate = 7
update_candidate = 8
related = 8
independent = 8
uncertain = 3
blocked = 3
```

Coverage includes:

- English preferences, facts, instructions, and project decisions;
- Portuguese and Unicode exact, update, related, independent, and ambiguous
  cases;
- exact matching with different kind or tags;
- blocked fake-secret, invalid-tag, and unauthorized-scope cases;
- same content in another project scope;
- archived-memory exclusion;
- an empty target scope;
- 24 dense related candidates that exercise the 20-evaluated/3-returned
  evidence bounds;
- 30 unrelated filler memories for a medium local store.

The relationship expectations describe evidence, not permission to write.
Every suggestion case remains unconfirmed and read-only.

## Metrics And Safety Gates

The report includes:

- target relationship accuracy against the future taxonomy;
- selected-profile accuracy;
- bounded-contract coverage;
- exact-duplicate recall;
- expected-primary accuracy;
- policy-block accuracy;
- evidence-reason coverage;
- unexpected-candidate rate;
- average and maximum latency;
- per-group and per-case outcomes;
- memory-write, audit-write, scope-violation, archived-candidate, and
  bound-violation counts.

Every case snapshots all memory records, revisions, timestamps, archived
state, and audit events immediately before and after suggestion evaluation.
The command exits non-zero if any state changes, a candidate crosses scope,
an archived memory appears, a policy error changes, a bound is violated, the
selected profile drifts, English coverage falls below 18 cases, average
latency exceeds 25 ms, or maximum latency exceeds 100 ms.

## `v0.5.0` Baseline

The unchanged harness against the core built from tag `v0.5.0` measured:

```text
fixtures = 74
cases = 37
target relationship accuracy = 20.6%
selected-profile accuracy = 100.0%
bounded-contract coverage = 0.0%
exact-duplicate recall = 100.0%
expected-primary accuracy = 30.4%
policy accuracy = 100.0%
safety = 100.0%
zero writes = 100.0%
unexpected candidates = 0.0%
memory writes = 0
audit writes = 0
scope violations = 0
archived violations = 0
bound violations = 0
average latency = 0.42 ms
maximum latency = 0.80 ms

actual outcomes:
blocked = 3
exact_duplicate = 7
legacy_ready = 27

english cases = 21
english target accuracy = 23.8%
english profile accuracy = 100.0%
english contract coverage = 0.0%
english safety = 100.0%
```

Latency is machine-dependent. Outcome counts, relationship metrics, policy
results, and safety counts are deterministic for these fixtures.

Reproduce the tagged baseline from a clean checkout with:

```bash
git worktree add --detach /tmp/nuzo-memory-v0.5.0 v0.5.0
(cd /tmp/nuzo-memory-v0.5.0 && npm ci && npm run build -w @nuzo/memory-core)
npm run benchmark:capture -- \
  --expect baseline \
  --core-module /tmp/nuzo-memory-v0.5.0/packages/core/dist/index.js
git worktree remove /tmp/nuzo-memory-v0.5.0
```

The 20.6% target accuracy is expected: `v0.5.0` can identify the seven exact
duplicates but returns legacy `ready` for all 27 non-exact allowed cases. It
does not distinguish update, related, independent, or uncertain, and it does
not claim bounded evidence. This measured gap is the justification for #127.

Current development builds after #127 should report 100% target accuracy,
100% bounded-contract coverage, 100% safety, zero memory or audit writes, and
no scope, archived, bound, or unexpected-candidate violations under
`--expect bounded`.

## Change Control

Do not implement fixture-specific vocabulary or change an expected
relationship merely because a classifier misses it. Fixture changes require a
documented contract correction or a new realistic public case. Any classifier
tuning must improve the bounded profile without regressing exact duplicate
recall, policy behavior, scope isolation, archived exclusion, zero-write
invariants, latency, the recall benchmark, or lifecycle hooks.
