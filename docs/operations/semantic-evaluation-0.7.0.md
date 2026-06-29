# 0.7.0 Optional Semantics Evaluation

This page records the ship-or-defer decision for optional semantic retrieval.
It separates the deterministic fixture-provider evidence from evaluation of a
real local embedding model over raw text.

## Decision

Proceed with a conservative opt-in hybrid profile for `0.7.0`.

The runtime profile is eligible to ship only with all of these properties:

- SQLite FTS remains the omitted and installed default;
- local model inference is optional and installed separately;
- model provisioning is an explicit network action;
- rebuild and recall use pinned local model files only;
- hybrid contributes the strongest semantic candidate and the bounded FTS
  list through reciprocal-rank fusion;
- semantic-only mode remains available for explicit evaluation but is not the
  recommended default;
- missing, stale, incompatible, or failed semantic state falls hybrid back to
  FTS with a machine-readable diagnostic;
- canonical writes never invoke the provider.

Issues [#150](https://github.com/fabionfsc/nuzo-memory/issues/150),
[#151](https://github.com/fabionfsc/nuzo-memory/issues/151), and
[#152](https://github.com/fabionfsc/nuzo-memory/issues/152) own provider,
interface, and release hardening. Failure of any of those gates changes the
decision to defer the user-facing provider; it does not justify weakening the
envelope.

## Evaluated Provider

The raw-text evaluation used:

```text
runtime: @huggingface/transformers 4.2.0
task: feature-extraction
model: onnx-community/all-MiniLM-L6-v2-ONNX
model revision: aff7a1dc4e8a1ea593e6ea21e95c22ef0a25966f
dtype: q4
dimensions: 384
pooling: mean
normalization: L2
similarity floor: 0.34
hybrid semantic contribution limit: 1
network during rebuild/recall: disabled
local model footprint: approximately 53 MiB
```

The model was provisioned before evaluation. The provider loaded an absolute
local directory with `local_files_only` enabled and remote models disabled.
No model file is committed or bundled in Nuzo.

## Results

The benchmark contained 78 public synthetic memories, 20 quality cases, and 5
independent safety cases.

| Mode | Overall top-1 | Overall MRR | Overall noise | English top-1 | English MRR | Average query latency |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| FTS | 65.0% | 65.0% | 7.1% | 62.5% | 62.5% | 0.51 ms |
| Local semantic | 90.0% | 92.5% | 38.7% | 93.8% | 93.8% | 9.07 ms |
| Conservative hybrid | 95.0% | 95.0% | 9.5% | 100.0% | 100.0% | 8.73 ms |

The conservative hybrid improved English top-1 and MRR by 37.5 percentage
points over FTS. It met the English top-1, MRR, noise, and lift envelope.
Scope isolation, archived exclusion, global opt-in, bounded output, unrelated
query, zero-write, and no-network gates passed in all three modes.

Latency is a local observation, not a portable threshold. It excludes initial
model load and depends on CPU, ONNX Runtime, memory pressure, and query batch
shape.

## Why Semantic-Only Is Not The Recommended Profile

At a `0.34` similarity floor, the model found paraphrases well but returned
too many plausible secondary memories for single-answer benchmark cases. Its
38.7% noise failed the release envelope. Raising the floor reduced noise but
also removed enough correct paraphrases to erase the required quality lift.

Hybrid retrieval solved the practical tradeoff by admitting only the strongest
semantic candidate while retaining lexical results. This is intentionally
conservative. A future release may widen semantic contribution only after a
larger benchmark proves that the noise envelope remains green.

## Sensitivity Check

The same provider was evaluated with higher absolute floors:

| Floor | Hybrid English top-1 | Hybrid English MRR | Overall noise | Outcome |
| ---: | ---: | ---: | ---: | --- |
| 0.34 | 100.0% | 100.0% | 9.5% | Pass with semantic contribution limit 1. |
| 0.42 | 87.5% | 87.5% | 19.0% before conservative limiting | Fail MRR/noise. |
| 0.46 | 75.0% | 75.0% | 11.8% before conservative limiting | Fail quality/lift. |
| 0.50 | 62.5% | 62.5% | 7.1% | No improvement over FTS. |

This evidence favors conservative rank fusion over selecting a high global
similarity floor.

## Limitations

- Fixtures are synthetic and smaller than a long-lived personal store.
- English is the strongest independently gated group; Portuguese, Spanish,
  and German cases provide compatibility evidence, not equal quality claims.
- Model load time and peak memory are reported during release hardening, not in
  per-query latency above.
- The optional dependency and model add disk and native-runtime complexity.
- Semantic vectors are less inspectable than FTS term matches and remain
  sensitive derived data.

These limitations are acceptable only because the capability is explicit,
disposable, offline during use, visibly fallible, and never replaces FTS.
