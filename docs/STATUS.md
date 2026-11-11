# ChessTrace status

Updated 2026-11-11 on branch `task/blockers`; B2 code (1.1–1.4) and B3 (2.1–2.3) are implemented.

## Verification

| Command | Result | Details |
| --- | --- | --- |
| `npm test` / `node --test` (`api-server/`) | **PASS** | 27 tests, 0 failures, 0 skipped. Covers PGN streaming and checkpoints as well as the B2 tests. Includes SM-2, legality, 32-dimensional vectors, streaks and the registration/save/queue/review HTTP flow with mocked Prisma persistence. |
| `npm run build` (`client-ui/`) | **PASS** | Vite production build completed. |
| `python tests/test_pipeline.py` (`vision-engine/`) | **PASS** | Both synthetic board cases matched expected piece placement and passed strict FEN validation. |
| `npx prisma validate` and `npx prisma generate` (`api-server/`) | **PASS** | Schema valid and Prisma 5.22.0 client regenerated. |
| `npm start` (`api-server/`) | **PASS** | Real server returned HTTP 200 from `/api/health`. |
| `npm ci && npx prisma generate` (`api-server/`) | **PASS** | Render install/generation steps passed from its configured rootDir. `migrate deploy` is intentionally pending the Neon baseline/application commands in MIGRATIONS.md. |
| `python -m uvicorn app.main:app` (`vision-engine/`) | **PASS** | Real server returned HTTP 200 from `/health`. The bare local `uvicorn` executable uses another Python installation without OpenCV; use the project Python environment. Render installs requirements into its service environment. |
| Live database search diagnostic | **PASS** | Ran successfully when Neon became reachable. Now invoked explicitly with `npm run test:search`; it is not part of offline test discovery. |

Neon initially failed to connect, then became reachable. Its schema matches the pre-SM-2 baseline (read-only diff was empty), but the SM-2 columns are absent. The default vault HTTP test mocks only Prisma and exercises real routing, bcrypt, JWT and SM-2. After migration, run `CHESSTRACE_LIVE_DB_TEST=1 node --test src/routes/vault.test.js` to verify live persistence. The November 11 read-only check confirmed a failed baseline record after the terminal P1001/P3018 sequence. The database still matches the baseline. No migrations were applied by this run; see the fail-fast recovery sequence in [MIGRATIONS.md](MIGRATIONS.md).

## Known issues from `Claude_Context_State.md`

| Issue | Status | Evidence |
| --- | --- | --- |
| Prisma SM-2 fields | **FIXED in code; Neon application pending** | `api-server/prisma/schema.prisma:105` adds the five scheduling fields; line 114 adds the compound index. `api-server/prisma/migrations/0002_saved_puzzle_sm2/migration.sql:2` preserves existing rows and supplies defaults. |
| Missing API start script | **FIXED** | `api-server/package.json:5` points main at `src/index.js`; line 12 defines `start`. |
| Vision Uvicorn module path | **FIXED** | `render.yaml:27` uses `app.main:app`, with `rootDir: vision-engine` at line 25. API build includes Prisma generation at line 6 and DIRECT_URL at line 11. |
| SM-2 test harness | **FIXED** | `api-server/src/lib/sm2.test.js:1` uses `node:test` and strict assertions. `api-server/package.json:11` runs `node --test`. |
| Chess.com import | **STILL BROKEN** | `api-server/src/routes/gameRoutes.js:27` still returns HTTP 501 for Chess.com URLs. Task 1.5 was outside this request. |

## Deployment notes

See [MIGRATIONS.md](MIGRATIONS.md) for exact Neon commands and baseline handling. The manual HNSW migration is unchanged. Neon records it as applied, but the named index is absent; the guide includes an idempotent command to restore it. See [BLOCKERS.md](../BLOCKERS.md) for remaining deployment checks.

`npm ci` reported four dependency vulnerabilities (one moderate, two high, one critical); dependencies were not upgraded in these tasks.

## B3 data pipeline

- Capacity: 1,000 historical games, 79,855 positions, 551.91 bytes per Position including indexes. [DATA.md](DATA.md) records storage assumptions and the curated corpus plan.
- The scratch CLI resume test imported two games and six positions. A complete replay with a new checkpoint added no games or positions.
- [BENCHMARKS.md](BENCHMARKS.md) records 1,000 lookup samples and recall on 5,000 candidates. No corpus was imported into the app tables.
