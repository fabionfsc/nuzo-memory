# Relation Hydration Benchmark

This deterministic, local benchmark is the evidence gate for batched relation
hydration in `1.2.0`. It uses only synthetic public fixtures and makes no
network calls.

Run it after building the core package:

```bash
npm run benchmark:relations
```

Use `--json` for machine-readable evidence. The harness creates fresh sparse
and relation-dense SQLite stores, exercises the realistic MCP recall limit of
50 and list limit of 200, and compares two paths over ten warm iterations:

- the pre-`1.2.0` per-memory `relations(...)` hydration shape;
- the authorized core `relationsBatch(...)` use case used by MCP recall, list,
  and recall-hook responses.

The gate requires identical ordered relation IDs for every memory. It also
requires the baseline to issue one relation query per returned memory and the
batch path to issue exactly one relation query for the whole page. The SQLite
adapter also resolves primary memories and relation endpoints through optional
bounded ID batches; stores that do not implement that compatible optimization
fall back to point lookups. Endpoint authorization remains in core, covers both
ends, and happens before the per-memory visible limit is applied.

The benchmark reports relation-query counts and min, p50, p95, and max wall
time. Wall time is descriptive because it varies by host; response equivalence
and the query-count envelope are the reproducible pass/fail criteria.

## 1.2.0 release-host evidence

The final release run must record the output here after the implementation is
stable. The first release-host run on August 14, 2026 produced:

| Store | Result limit | Relation queries | Total measured queries | p50 | p95 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Sparse | 50 | 50 -> 1 | 300 -> 3 | 16.27 ms -> 1.49 ms | 16.71 ms -> 16.92 ms |
| Sparse | 200 | 200 -> 1 | 1,200 -> 3 | 56.76 ms -> 5.65 ms | 71.90 ms -> 11.76 ms |
| Dense | 50 | 50 -> 1 | 2,100 -> 3 | 111.45 ms -> 3.42 ms | 137.62 ms -> 13.24 ms |
| Dense | 200 | 200 -> 1 | 8,400 -> 3 | 417.45 ms -> 10.59 ms | 441.87 ms -> 35.45 ms |

All four profiles returned identical ordered relation IDs. "Total measured"
counts relation and memory-record reads at the storage-port boundary. These latency
numbers describe this host and are not portable gates; the reproducible result
is the reduction from 50 or 200 relation queries to one.

The unit suite separately covers reverse relations, deterministic ordering,
per-memory limits, missing endpoints, restricted scopes, and fail-closed custom
policy errors.
