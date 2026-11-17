# Scale ChessTrace from Neon to PostgreSQL

The MVP uses a compact corpus on Neon. The `scale` profile rebuilds the compact corpus from licensed PGNs with deeper indexing and more replay links per position. The API and database can run together on a self-hosted machine with PostgreSQL bound to loopback. The Vercel client and Render scanner can continue using separate HTTPS origins.

This is a runbook for a future migration. It was not executed against production during M9. The optional no-cost VM path is in [Oracle steps 2–4](CODEX_PROMPTS_ZERO_COST.md#2-provision-an-always-free-vm).

## 1. Provision a staging target

The read-only M9 audit saw PostgreSQL **18.7** on the connected Neon project. Recheck the source version before migrating and use a matching or newer PostgreSQL major version and client tools. On Ubuntu 24.04, the PostgreSQL project's Apt repository provides versioned PostgreSQL and pgvector packages. [Ubuntu PostgreSQL packages](https://www.postgresql.org/download/linux/ubuntu/) · [pgvector packages and version guidance](https://github.com/pgvector/pgvector#installation)

```sh
sudo apt-get update
sudo apt-get install -y postgresql-common
sudo /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh
sudo apt-get install -y postgresql-18 postgresql-18-pgvector zstd
sudo -u postgres createuser --pwprompt chesstrace
sudo -u postgres createdb --owner=chesstrace chesstrace_scale
sudo -u postgres psql -d chesstrace_scale -c 'CREATE EXTENSION IF NOT EXISTS vector;'
sudo -u postgres psql -d postgres -c 'SHOW listen_addresses;'
```

Keep port 5432 off the public network. Enable SSH only from your management network. Plan disk space for imported data, HNSW builds, backups and source archives. Monitor actual storage and memory during a rehearsal. Keep credentials in protected environment configuration and use a separate runtime role where possible.

## 2. Restore and rebuild on the target

Run from a trusted host that can reach both databases. Here `SOURCE_DIRECT_URL` is the existing Neon direct URL and `TARGET_DIRECT_URL` is the isolated target. Use a protected working directory for backups. Keep a copy of the old deployment's environment and release SHA for rollback.

```sh
umask 077
pg_dump --format=custom --no-owner --no-acl --dbname="$SOURCE_DIRECT_URL" --file=chesstrace-source.dump
pg_restore --list chesstrace-source.dump > chesstrace-restore.list
awk '!/ EXTENSION - vector([[:space:]]|$)/ && !/ COMMENT - EXTENSION vector([[:space:]]|$)/' \
  chesstrace-restore.list > chesstrace-target.list
pg_restore --exit-on-error --single-transaction --no-owner --no-acl \
  --use-list=chesstrace-target.list --dbname="$TARGET_DIRECT_URL" chesstrace-source.dump
```

The restore list leaves the administrator-installed vector extension and its comment in place. Review the extension entries in the list before restoring and review installed extensions, row counts, and migrations on the target. The restore carries Prisma's migration history. In the new environment point both URLs at the target before applying the release's additive migrations. The target database must be isolated while rebuilding it. Set up Node.js 22 on the import host and place the approved August 2026 Lichess Broadcast archive in `data/raw/`. The first migration status check can report pending migrations before deployment.

```sh
cd api-server
export DATABASE_URL="$TARGET_DIRECT_URL" DIRECT_URL="$TARGET_DIRECT_URL"
export STORAGE_PROFILE=scale USE_COMPACT_STORAGE=false
npm ci
npm run prisma:generate
npx prisma migrate status
npx prisma migrate deploy
npx prisma migrate status

psql "$TARGET_DIRECT_URL" -v ON_ERROR_STOP=1 -c \
  'TRUNCATE public.position_game, public.position_v2, public.compact_game, public.corpus_position_stage, public.corpus_game_stage;'

npm run corpus:ingest -- ../data/raw/lichess_db_broadcast_2026-08.pgn.zst \
  --source lichess-broadcast --max-games 500 --batch-size 25 --defer-index
npm run corpus:report
```

The truncate command is for the isolated target only. It clears the compact index input and staging tables. The original corpus and user data remain on the target so legacy search and account data can be checked during the rehearsal. The `scale` profile uses minimum rating 2100, 160 plies, a cap of 100 replay links, vectors on plies 6–160, and a 50,000,000,000-byte budget measured by PostgreSQL. Those are configuration values. Actual capacity on a given host must be measured.

Repeat the ingestion command for each approved archive. On a single archive keep the same path, target, profile, and default checkpoint when resuming. `--max-games` caps new games for the current run. Use smaller batches if memory pressure appears. The scale profile has no measured dry-run extrapolation. Finish the index after loading, then report again. [Approved source register](../data/SOURCES.md)

```sh
npm run corpus:ingest -- --finish-index
npm run corpus:report
```

## 3. Rehearse, cut over, and roll back

1. Run a preview of Express on the target. Use `STORAGE_PROFILE=scale` and `USE_COMPACT_STORAGE=true` once the compact index is ready. Set `CORS_ORIGIN` to the exact client origin. Use the current session-signing key if existing sessions should survive. Expose the API via HTTPS and set the frontend's `VITE_API_BASE_URL` to that HTTPS origin. A serverless API cannot reach PostgreSQL bound to another host's loopback.
2. Compare before and after `npm run corpus:report` output, including database bytes, retained links, and ANN index bytes. Re-measure exact and ANN query p50 and p95 on reproducible PGNs, ANN recall@10 against brute force, ingestion rate, and HNSW build time and peak memory. For repeatable recall on a fresh local scratch database use `COMPACT_SCRATCH_URL=postgresql://...@127.0.0.1/chesstrace_m2_benchmark node scripts/benchmark-compact.js FILE --profile scale --games 1000`. See [benchmark methodology](CAPACITY_MVP.md#local-measurements).
3. Verify exact matches, similar matches, replay, screenshot parsing, login, saved puzzles, review history, account deletion with a disposable account, Twin Game, and the queue using the staged client and API. Compare both storage flags against the staged copy before switching. The deployment verifier accepts `VERIFY_READ_ONLY=1` when account writes are out of scope.
4. Schedule a write freeze across the old API before the final copy of user data. Bring the old API into maintenance for every public origin that can still reach it. Back up the source again and copy the latest account tables below to the already-built target. Verify the source migration status first. If the source has not applied `0005_puzzle_attempts`, resolve migration order during the rehearsal before running this cutover command.
5. Switch the API's `DATABASE_URL` and `DIRECT_URL` to the target, with `STORAGE_PROFILE=scale` and `USE_COMPACT_STORAGE=true`. If the API moved, publish the frontend with the new API origin as well. Run read-only smoke checks before allowing writes. Retain the source and backups throughout the observation window.
6. If compact query behavior is the problem, flip `USE_COMPACT_STORAGE=false` on the same database to keep new account writes. If the host is the problem before reopening writes, restore the old API and frontend environment, database URLs, and storage flags. If users have written to the new target, freeze writes and reconcile those changes before switching back. Never direct writes to both databases.

Run the final account copy from the protected working directory during the freeze:

```sh
pg_dump --data-only --no-owner --no-acl --dbname="$SOURCE_DIRECT_URL" \
  --table='public."User"' --table='public."SavedPuzzle"' --table='public."Tag"' \
  --table='public."_PuzzleTags"' --table='public."ActivityLog"' --table='public."Attempt"' \
  --file=chesstrace-accounts.sql

{
  printf '%s\n' 'TRUNCATE public."Attempt", public."ActivityLog", public."_PuzzleTags", public."SavedPuzzle", public."Tag", public."User";'
  cat chesstrace-accounts.sql
} | psql "$TARGET_DIRECT_URL" --single-transaction --set=ON_ERROR_STOP=1
```

[PostgreSQL dump and restore documentation](https://www.postgresql.org/docs/18/app-pgdump.html) · [Current migration history](MIGRATIONS.md)
