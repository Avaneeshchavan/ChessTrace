# ChessTrace query benchmarks

Measured on 2026-11-11 using `legendary_sacrifices.pgn` on PostgreSQL with pgvector 0.8.6.
The temporary database schema held **1,000 games and 79,855 positions**.
Queries use 1,000 deterministic samples from stored positions. Recall uses a separately sampled 5,000-position subset.

| Query | Samples | p50 (ms) | p95 (ms) |
| --- | ---: | ---: | ---: |
| Exact fenCore lookup (up to 100 results) | 1000 | 0.029 | 0.500 |
| ANN L2 lookup (up to 10 results) | 1000 | 0.286 | 0.449 |

| Recall against brute force | Subset positions | Result |
| --- | ---: | ---: |
| Recall@10, same position IDs | 5000 | 88.59% |
| Recall@10, accepting ties at the exact cutoff | 5000 | 99.95% |

PostgreSQL execution time from `EXPLAIN ANALYZE`, excluding planning, network, API and vector computation. The run follows a fresh import, index build and ANALYZE; the ANN query selects the top 10 neighbors before joining game metadata. This is not a cold-start test. Sequential scans were discouraged for the timed lookups and the plans were checked for the hash and HNSW indexes. HNSW uses `m=16`, `ef_construction=64` and `ef_search=40`.
Brute force scores every subset vector and breaks distance ties by ID. The second recall row counts any returned neighbor at or below the true kth distance; equal signatures can have distinct position IDs. A sampled query can itself be in the candidate set. Results describe this dataset and workload, not production API latency or quality on unseen positions.
