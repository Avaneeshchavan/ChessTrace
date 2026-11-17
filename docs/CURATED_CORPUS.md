# M3 curated corpus

The importer streams licensed Lichess Broadcast archives and selects completed standard games with two qualifying ratings, a GM on at least one side, and a clearly classical time control. The approved source, exclusions, and Credits copy are in the source register. [Corpus sources](../data/SOURCES.md)

Neon says, “Database storage on the Neon Free plan is now 1 GB per project.” Its Free allocation also lists “100 CU-hours of compute per project per month.” The MVP importer caps PostgreSQL database bytes at 700,000,000 by default. It checks before each batch, reserves headroom for HNSW if deferred, and rechecks before commit. Use the Neon dashboard for project-wide storage and compute, including branches and retained history. PostgreSQL relation and database bytes do not include that provider-wide usage. [Neon Free plan](https://neon.com/blog/neon-free-plan-1-gb-per-project)

## Import in stages

After verifying the target's Free plan and usage in the dashboard, set the existing ignored `DIRECT_URL` to its direct, non-pooled connection. Run from `api-server/`. Archive download instructions are in the source register.

```sh
npm ci
npm run corpus:report
npx prisma migrate status
npx prisma migrate deploy
npm run corpus:report

archive=../data/raw/lichess_db_broadcast_2026-08.pgn.zst
npm run corpus:ingest -- "$archive" --dry-run --max-games 500
npm run corpus:ingest -- "$archive" --max-games 100 --defer-index
npm run corpus:report
npm run corpus:ingest -- "$archive" --max-games 400
npm run corpus:report
npm run corpus:ingest -- --finish-index
npm run corpus:report
```

Stage limits count new games per invocation. Check the report and dashboard usage after every stage. To repeat a stage, use the same file and flags that select the profile. The checkpoint binds to the archive path, size, mtime, destination and profile. A replacement archive requires a new checkpoint. The stream starts from the beginning of each compressed archive and skips the committed prefix without replaying it. An interrupted batch can safely be retried because its normalized move identities are unique in PostgreSQL.

The move identity hashes the starting FEN state and full mainline in UCI, ignoring headers, comments and move numbers. As a trade-off, two independently played games with the same complete mainline and starting state are stored once. Each committed batch uses COPY into unlogged staging, then updates the compact tables and clears staging in one transaction. The dry run uses the M2 estimate of 22,800 bytes per eligible game before deduplication and does not write checkpoints. The guard can stop a stage early and leave its checkpoint at the last committed prefix.

Defer HNSW only on a fresh compact corpus. Keep `USE_COMPACT_STORAGE=false` until the index is built and search is verified. The report includes the compact game count, distinct positions, retained links, pre-cap distinct game-position pairs per core, Elo bands, years, ECO coverage, source attribution, HNSW bytes and database bytes. Generate public corpus counts with `npm run corpus:report`.

## Local evidence

Measured on arm64 Docker PostgreSQL 17.11 and pgvector 0.8.7 with the official August 2026 compressed Lichess Broadcast archive. The final report is checked in. [Corpus report](data/m3-local-report.json)

| Check | Result |
| --- | --- |
| Hard kill after first committed batch | SIGKILL at source checkpoint 1,000 with 8 games and 315 distinct positions persisted |
| Resume using the same checkpoint | 292 new games, for 300 total and 14,643 distinct positions |
| Full rescan from a fresh checkpoint | Added 169 previously unseen games, reaching 469 games and 21,911 distinct positions |
| Repeat full rescan | Zero new games. Game and position totals stayed at 469 and 21,911 |
| Forced 1,000,000-byte database cap | Stopped before the first eligible write and inserted zero games |
| Peak importer RSS | 123,027,456 bytes across the measured kill, resume, rescan and repeat processes. macOS `wait4` measured the Node process |
| HNSW index build | 1.67 s for 20,594 vectors. Index size 3,440,640 bytes. Sampled PostgreSQL backend high-water RSS 45,868 KiB with `maintenance_work_mem=64MB` |
| Local database after index build | 20,248,243 bytes |
| COPY versus JSON staging | 16.16 s COPY and 16.28 s JSON for a single sequential run each with 469 inserts and 25,448 plies, including decompression and parsing. The difference does not establish a speedup |
| API verification | All 35 tests passed with disposable local PostgreSQL. npm audit reported zero advisories |

## Connected Neon database

The read-only report returned **391,241,728 PostgreSQL bytes**, **9,696 legacy games**, and no compact tables. The Neon console required login, so the project's plan and remaining project-wide quota could not be verified here. Live migrations, staged imports and the hosted index build are pending. Hosted peak memory is not measured.
