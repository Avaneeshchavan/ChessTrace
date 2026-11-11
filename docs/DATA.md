# ChessTrace corpus and storage

Capacity measured on Neon on 2026-11-11 using the first 1,000 distinct, replayable games in the bundled `api-server/data/legendary_sacrifices.pgn`. The script created and removed a temporary schema; it did not import these games into the app's tables.

| Measurement | Result |
| --- | ---: |
| Games / positions | 1,000 / 79,855 |
| Mean positions per game | 79.855 |
| Position table plus all indexes | 44,072,960 bytes |
| HNSW index alone (included above) | 17,694,720 bytes |
| Mean bytes per Position row including indexes | 551.91 |
| Game table plus indexes | 966,656 bytes |
| Mean combined bytes per game | 45,039.62 |
| Projected games in an empty 400 MB budget | 8,881 |
| Existing database size before import (approximately) | 243,179,520 bytes |
| Projected additional games within 400 MB total | 3,481 |

400 MB means 400,000,000 bytes here. Keep it as a project budget: [Neon's current Free plan announcement](https://neon.com/blog/neon-free-plan-1-gb-per-project) lists 1 GB per project, while PostgreSQL's database size is not the same metric as Neon project storage. These estimates assume comparable game length and index density. The sample had a freshly built HNSW index; incremental ingestion, longer PGNs, existing data and growth can use more space. The ingest stage reached about 1,307 positions/s for this run, excluding index construction.

**Current Neon target: pause new corpus imports at the 400 MB budget.** After the HNSW rebuild on 2026-11-11, PostgreSQL reported 391,241,728 bytes in the database, including the valid 147,824,640-byte HNSW index. That leaves about 8.76 MB, or a theoretical 194 additional games at the measured density, before allowing for growth. The pre-rebuild projection above is historical.

For a separate target with enough headroom, start with up to 2,000 curated games across all files (about 90 MB at the measured density). Remeasure on the curated files and check actual Neon project usage before importing.

## What to download

From the [Lichess open database Broadcasts section](https://database.lichess.org/#broadcasts), download these official tournament broadcast exports (the Broadcasts section lists CC BY-SA 4.0). Attribute Lichess and retain the applicable license if distributing the corpus.

| Archive | Extract to |
| --- | --- |
| [July 2026](https://database.lichess.org/broadcast/lichess_db_broadcast_2026-07.pgn.zst) | `api-server/data/corpus/lichess_db_broadcast_2026-07.pgn` |
| [August 2026](https://database.lichess.org/broadcast/lichess_db_broadcast_2026-08.pgn.zst) | `api-server/data/corpus/lichess_db_broadcast_2026-08.pgn` |
| [September 2026](https://database.lichess.org/broadcast/lichess_db_broadcast_2026-09.pgn.zst) | `api-server/data/corpus/lichess_db_broadcast_2026-09.pgn` |

Decompress the `.zst` archives to plain PGN. For a classical GM corpus, retain classical tournament rounds using the published event schedules and prefer games with a GM in one of the two title tags or verified event rosters. Save that filtered PGN as `data/corpus/strong-classical.pgn`. The CLI additionally filters to completed games with both published ratings at least 2400 and skips unsupported variants and games it cannot replay. Missing ratings are excluded; rating alone does not establish a GM title or time control. No external files were downloaded for the measured run.

## Commands

Run from `api-server/` with the local database URLs configured. Capacity and benchmark commands create temporary schemas and need schema creation permission. They remove their own schemas on normal completion and handled errors. Use a disposable database or Neon branch when possible and ensure it has the baseline Game/Position tables and vector extension.

```sh
node scripts/measure-capacity.js data/legendary_sacrifices.pgn --games 1000
node scripts/measure-capacity.js data/corpus/strong-classical.pgn --games 1000 --min-elo 2400 --completed-only
```

The importer writes to the app database by default. The command below assumes a separate target with enough space or an explicitly revised budget; do not run it against the current target under the 400 MB budget:

```sh
node scripts/ingest.js data/corpus/strong-classical.pgn --batch-size 25 --position-chunk 4000 --min-elo 2400 --completed-only --max-games 2000
```

A checkpoint under `.ingest-checkpoints/` records the last committed game ordinal for the input file, destination and filters. Keep the input unchanged and rerun with the same arguments to resume. The reader skips the committed prefix without replaying moves. `--max-games` limits new games **per invocation**; on resume, lower it to the remaining import budget if keeping a fixed cap. Progress logs include scanned games, new games, inserted positions, skips, duplicates and positions/s. To deliberately scan again, use a new `--checkpoint` path; matching PGN records and existing half-moves are reused. Different annotations or headers can produce a different PGN identity, and historical duplicates already in the database are left intact.

`data/test.pgn` works for smoke tests but is 1,000 copies of the same game; it measures one unique game after deduplication. It should not be used for the corpus estimate. See [BENCHMARKS.md](BENCHMARKS.md) for query measurements.
