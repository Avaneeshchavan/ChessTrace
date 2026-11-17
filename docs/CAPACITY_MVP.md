# Compact corpus capacity

M2 adds a separate compact position layout alongside legacy search. Both players must have published ratings at or above the active profile's threshold, and the benchmark accepts only completed, replayable games. It keeps the full PGN for replay even when it indexes only the first part of the game.

Neon states, “Database storage on the Neon Free plan is now 1 GB per project.” ChessTrace's MVP corpus target is 700,000,000 bytes. The difference leaves room for users, saved puzzles, and operational overhead. This is a budget for a fresh compact corpus, and PostgreSQL relation bytes do not directly measure Neon project usage. No Neon connections were made during M2. [Neon Free plan storage announcement](https://neon.com/blog/neon-free-plan-1-gb-per-project)

## Layout and collision handling

- `position_v2` stores one row per FEN core and a count of distinct games that reached it. It stores a 32-dimensional half-precision vector only if at least one occurrence falls in the profile's vector ply range. The partial HNSW index excludes null vectors.
- `position_game` stores the earliest matching ply per retained game. It keeps the top games by average published player rating, then most recent date, then ascending game ID. The stored count includes games outside that cap. The loader locks each batch and deduplicates by full PGN digest, so retries do not inflate counts.
- `Game` stores replayable PGN using PostgreSQL's LZ4 column compression where available and the value is eligible for TOAST. On servers without LZ4, the compact loader stores gzip in `compact_game`. Both forms return the same text after any parser compatibility fixes. Name and event normalization was not measured or introduced.
- The signed 64-bit key uses the first eight bytes of SHA-256 of the first three FEN fields. A distinct FEN with an occupied key aborts its import batch. Exact lookup requires both the key and full FEN core. Before returning either exact or similar matches, the API confirms that replaying the stored PGN reaches the expected core at the stored ply.

| Distinct position cores | Estimated probability of any 64-bit collision |
| ---: | ---: |
| 5 million | 0.0000678% |
| 50 million | 0.00678% |
| 300 million | 0.244% |

These are birthday-bound estimates under uniform hashes, computed as `1 - exp(-n(n-1)/(2 × 2^64))`. The API checks remain necessary even at the smallest size.

## Local measurements

PostgreSQL 17.11 and pgvector 0.8.7 ran in a local arm64 Docker container. Each run used a fresh scratch schema with PostgreSQL LZ4 enabled. The loader built HNSW after inserting the data. The bundled sample is the first 1,000 games that passed the MVP filters in the checked-in PGN. The Lichess sample is the first 10,000 passing games from the three broadcast files below, in concatenation order. Each sample retained the same games across its three variants.

| Sample | Ply cap | Source games scanned | Distinct positions | Vectors | Retained links | Corpus bytes | Bytes/distinct position | Bytes/game |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Bundled | 40 | 1,971 | 26,571 | 25,158 | 35,790 | 14,024,704 | 527.8 | 14,024.7 |
| Bundled | 50 | 1,971 | 35,405 | 33,992 | 44,643 | 18,317,312 | 517.4 | 18,317.3 |
| Bundled | 60 | 1,971 | 43,167 | 41,754 | 52,414 | 21,913,600 | 507.6 | 21,913.6 |
| Lichess | 40 | 104,587 | 261,608 | 253,388 | 329,728 | 148,684,800 | 568.3 | 14,868.5 |
| Lichess | 50 | 104,587 | 350,736 | 342,516 | 418,934 | 189,931,520 | 541.5 | 18,993.2 |
| Lichess | 60 | 104,587 | 433,342 | 425,122 | 501,594 | 227,999,744 | 526.1 | 22,800.0 |

Total corpus bytes include both game relations, both position relations, TOAST and indexes. Bytes per position divides that total by the number of distinct cores. The legacy report counts occurrence rows and uses a different dataset, so its per-position figure is a different denominator.

| Sample | Ply cap | Game tables / indexes (MiB) | position_v2 table / indexes (MiB) | position_game table / indexes (MiB) | HNSW (MiB, included) |
| --- | ---: | ---: | ---: | ---: | ---: |
| Bundled | 40 | 0.88 / 0.27 | 4.76 / 4.23 | 1.70 / 1.52 | 3.45 |
| Bundled | 50 | 0.88 / 0.27 | 6.25 / 5.99 | 2.08 / 1.99 | 4.96 |
| Bundled | 60 | 0.88 / 0.27 | 7.54 / 7.60 | 2.40 / 2.21 | 6.38 |
| Lichess | 40 | 26.54 / 2.09 | 45.48 / 40.22 | 14.44 / 13.02 | 32.51 |
| Lichess | 50 | 26.53 / 2.09 | 60.70 / 56.33 | 18.45 / 17.04 | 46.12 |
| Lichess | 60 | 26.55 / 2.09 | 74.05 / 73.27 | 22.29 / 19.19 | 61.08 |

| Sample | Ply cap | Exact p50 / p95 (ms) | ANN p50 / p95 (ms) | Recall@10 by ID / ties accepted | Games/s | Positions/s | HNSW build (s) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Bundled | 40 | 10.45 / 25.61 | 35.61 / 62.47 | 91.5% / 100.0% | 75.5 | 2,983 | 2.5 |
| Bundled | 50 | 9.97 / 23.94 | 34.93 / 64.28 | 94.8% / 100.0% | 70.9 | 3,434 | 3.1 |
| Bundled | 60 | 10.19 / 24.16 | 31.69 / 58.33 | 96.2% / 99.6% | 71.1 | 3,999 | 3.7 |
| Lichess | 40 | 14.33 / 40.54 | 60.64 / 114.86 | 90.9% / 100.0% | 67.3 | 2,616 | 23.8 |
| Lichess | 50 | 13.04 / 28.51 | 52.45 / 90.44 | 93.7% / 100.0% | 63.8 | 3,053 | 31.8 |
| Lichess | 60 | 12.95 / 29.06 | 58.48 / 102.92 | 96.1% / 99.9% | 62.2 | 3,496 | 51.4 |

Latencies are Node wall-clock times for 100 deterministic vector-bearing positions per run. They include local database round trips, vector computation for ANN, and replay verification, and exclude HTTP and hosted network time. The full candidate probe used the partial HNSW index. Recall compares the top ten neighbor keys with a brute-force result on 5,000 deterministic halfvec candidates at `hnsw.ef_search=40`. Ties-accepted recall counts any result at or below the true tenth distance. It measures ANN behavior in halfvec space. The ingest rate includes PGN parsing, filtering and writes, and excludes HNSW build time.

### Projected games in the 700 MB corpus budget

| Sample | 40 plies | 50 plies | 60 plies |
| --- | ---: | ---: | ---: |
| Bundled | 49,911 | 38,215 | 31,943 |
| Lichess | 47,079 | 36,855 | 30,701 |

The 60-ply MVP default projects **30,701 games** at the 10,000-game Lichess sample's density of 22,800.0 bytes/game. This is an extrapolation from a freshly built local corpus. Existing legacy tables, corpus mix, incremental index growth, and actual hosted usage can change available capacity. M3 must measure and enforce the target database's remaining budget before loading it.

The broadcast import uncovered two chess.js parser incompatibilities. The loader combines adjacent PGN annotation blocks and normalizes escaped straight quotes in tag values when needed so the stored PGN can replay. Both fixes have regression tests.

Verification: Prisma client generation, schema validation, fresh scratch migrations, the client build, and all 33 API tests passed. The API suite included a real PostgreSQL and HTTP compatibility check for rank, cap, retry, filtered ANN, gzip replay, and collision rejection. The existing vault test used mocked persistence.

## Reproduce locally

From `api-server/`, start a disposable PostgreSQL container on a loopback-only port. The scratch tool requires an explicit loopback URL, a dedicated `chesstrace_m2_*` database, and no existing vector extension. Each variant applies migrations to a temporary schema and drops that schema afterward. Do not reuse a database with application data.

```sh
docker run --rm -d --name chesstrace-m2-pg -e POSTGRES_HOST_AUTH_METHOD=trust -p 127.0.0.1:55432:5432 pgvector/pgvector:pg17
docker exec chesstrace-m2-pg createdb -U postgres chesstrace_m2_bench
export COMPACT_SCRATCH_URL=postgresql://postgres@127.0.0.1:55432/chesstrace_m2_bench
npm ci
npm run prisma:generate
npm test
node scripts/benchmark-compact.js data/legendary_sacrifices.pgn --games 1000 --plies 40,50,60
```

For the second sample, download the official August, July, and September 2026 Lichess broadcast PGNs, in that order. The exports are under CC BY-SA 4.0 and were used only as local benchmark input. [Lichess broadcasts and license](https://database.lichess.org/#broadcasts)

```sh
(
  set -e
  sample_dir="$(mktemp -d)"
  for month in 08 07 09; do
    archive="lichess_db_broadcast_2026-${month}.pgn.zst"
    curl -fL --retry 2 "https://database.lichess.org/broadcast/${archive}" -o "${sample_dir}/${archive}"
  done
  zstd -dc "${sample_dir}"/lichess_db_broadcast_2026-{08,07,09}.pgn.zst > "${sample_dir}/broadcast-m2.pgn"
  node scripts/benchmark-compact.js "${sample_dir}/broadcast-m2.pgn" --games 10000 --plies 40,50,60
)
docker stop chesstrace-m2-pg
```

## What changes at scale

| Setting | MVP | Scale starting profile |
| --- | ---: | ---: |
| Minimum rating per player | 2300 | 2100 |
| Maximum indexed ply | 60 | 160 |
| Retained games per position | 25 | 100 |
| Vector ply range | 10–60 | 6–160 |
| Filtered ANN candidate pool | 1,000 | 1,000 |
| ANN recall benchmark subset | 5,000 | 20,000 |
| Corpus budget (bytes) | 700,000,000 | 50,000,000,000 |

Use a fresh corpus for a profile change so earlier cap pruning and excluded plies can be rebuilt from the input PGNs. Remeasure size and query quality on the target PostgreSQL instance. Set `STORAGE_PROFILE=scale` on the larger instance, and enable `USE_COMPACT_STORAGE=true` only after importing and verifying the corpus. The default is legacy search. M2 does not enforce the byte budget during production ingestion or migrate legacy corpus rows. M3 owns the production ingest path. No production cutover, deployment, or storage measurement was performed.
