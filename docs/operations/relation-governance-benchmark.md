# Relation Governance Benchmark

The `1.2.0` relation-governance gate uses fresh SQLite stores containing only
public synthetic fixtures:

```bash
npm run benchmark:governance
```

It runs the same report ten times against a sparse 50-memory store and a
relation-dense 200-memory store with 2,000 explicit relations. The gate fails
unless every run:

- returns one or more candidate pairs;
- has byte-identical JSON ordering;
- contains no synthetic memory content;
- leaves memory, relation, and audit-event counts unchanged; and
- completes below a deliberately generous 1,000 ms p95 bound.

Use `--json` for machine-readable evidence. Latency is host-specific and is
reported as min, p50, p95, and max; determinism, content-free output, unchanged
state, and the upper bound are the portable pass/fail contract.

## 1.2.0 release-host evidence

The first release-host run on August 14, 2026 passed:

| Profile | Memories | Explicit relations | Candidates | p50 | p95 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Sparse | 50 | 0 | 25 | 84.76 ms | 129.68 ms |
| Relation-dense | 200 | 2,000 | 100 | 323.95 ms | 342.34 ms |

All ten runs per profile had byte-identical ordering, content-free output, and
unchanged memory, relation, and audit-event counts. Latency remains descriptive;
the final release run repeats the same gate.
