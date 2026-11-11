# ChessTrace status

Updated 2026-11-11 on branch `task/blockers`; B2 (1.1–1.4), B3 (2.1–2.3), and B4 (3.1–3.3) are implemented.

## Verification

| Command | Result | Details |
| --- | --- | --- |
| `npm test` / `node --test` (`api-server/`) | **PASS** | 27 tests, 0 failures, 0 skipped. Covers PGN streaming and checkpoints as well as the B2 tests. Includes SM-2, legality, 32-dimensional vectors, streaks and the registration/save/queue/review HTTP flow with mocked Prisma persistence. |
| `npm run build` (`client-ui/`) | **PASS** | Vite production build completed. |
| `python tests/test_pipeline.py` (`vision-engine/`) | **PASS** | Both synthetic board cases matched expected piece placement and passed strict FEN validation. |
| `npx prisma validate` and `npx prisma generate` (`api-server/`) | **PASS** | Schema valid and Prisma 5.22.0 client regenerated. |
| `npm start` (`api-server/`) | **PASS** | Real server returned HTTP 200 from `/api/health`. |
| `npm ci && npx prisma generate` (`api-server/`) | **PASS** | Render install/generation steps passed from its configured rootDir. `migrate deploy` succeeded on Neon after baseline recovery. |
| `python -m uvicorn app.main:app` (`vision-engine/`) | **PASS** | Real server returned HTTP 200 from `/health`. The bare local `uvicorn` executable uses another Python installation without OpenCV; use the project Python environment. Render installs requirements into its service environment. |
| Live database search diagnostic | **PASS** | Ran successfully when Neon became reachable. Now invoked explicitly with `npm run test:search`; it is not part of offline test discovery. |

Neon baseline recovery, HNSW rebuild, and SM-2 deploy succeeded. Prisma reports the database is up to date. The live register/save/queue/review flow passed; the default suite still uses mocked persistence.

## Known issues from `Claude_Context_State.md`

| Issue | Status | Evidence |
| --- | --- | --- |
| Prisma SM-2 fields | **FIXED on Neon** | `api-server/prisma/schema.prisma:105` adds the five scheduling fields; line 114 adds the compound index. `api-server/prisma/migrations/0002_saved_puzzle_sm2/migration.sql:2` preserves existing rows and supplies defaults. |
| Missing API start script | **FIXED** | `api-server/package.json:5` points main at `src/index.js`; line 12 defines `start`. |
| Vision Uvicorn module path | **FIXED** | `render.yaml:27` uses `app.main:app`, with `rootDir: vision-engine` at line 25. API build includes Prisma generation at line 6 and DIRECT_URL at line 11. |
| SM-2 test harness | **FIXED** | `api-server/src/lib/sm2.test.js:1` uses `node:test` and strict assertions. `api-server/package.json:11` runs `node --test`. |
| Chess.com import | **STILL BROKEN** | `api-server/src/routes/gameRoutes.js:27` still returns HTTP 501 for Chess.com URLs. Task 1.5 was outside this request. |

## Deployment notes

See [MIGRATIONS.md](MIGRATIONS.md) for exact Neon commands and baseline handling. The manual HNSW migration is unchanged. The named index was restored by running its unchanged SQL. See [BLOCKERS.md](../BLOCKERS.md) for remaining deployment checks.

`npm ci` reported four dependency vulnerabilities (one moderate, two high, one critical); dependencies were not upgraded in these tasks.

## B3 data pipeline

- Capacity: 1,000 historical games, 79,855 positions, 551.91 bytes per Position including indexes. [DATA.md](DATA.md) records storage assumptions and the curated corpus plan.
- The scratch CLI resume test imported two games and six positions. A complete replay with a new checkpoint added no games or positions.
- [BENCHMARKS.md](BENCHMARKS.md) records 1,000 lookup samples and recall on 5,000 candidates. No corpus was imported into the app tables. The restored HNSW index leaves the current database near 400 MB; pause imports at that budget.


## B4 vision review

- PNG template sets: classic, neo_wood, neon and wood, using local square background matching.
- `POST /detect` and `POST /parse-screenshot`: per-square scores and review flags, with bounded in-memory uploads. Both endpoint contract tests passed.
- Headless Chrome: real upload, flagged-square correction, invalid-position guard, and explicit search with the corrected FEN verified. The search response was mocked for this UI test; live search was checked separately.
- [VISION_EVAL.md](VISION_EVAL.md): 108 synthetic boards; 99.71% per square, 90.74% exact placement, 0% exact six-field FEN. Real screenshots are not yet evaluated.
