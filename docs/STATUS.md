# ChessTrace status

Updated 2026-11-11 on branch `task/blockers`; B2 (1.1–1.4), B3 (2.1–2.3), B4 (3.1–3.3), B5 (4.1–4.4), and B6 (5.1–5.4) are implemented.

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
| Chess.com import | **FIXED** | Turning Points resolves completed standard games in the public monthly archive using the game URL, either player’s username, and the month it ended. |

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


## B5 features

- Turning Points accepts Lichess, Chess.com, or a single pasted PGN. PGN parsing and Stockfish run in workers. The depth defaults to 12. The three largest mover losses above 150 centipawns with a usable engine move become puzzles.
- Vault saves and edits multiple motifs. An SM-2 review and its history are recorded atomically. The weekly chart uses ratings from the last 90 days and counts quality 3 or higher as a reported solve.
- Sandbox validates drops and gates search on FEN validity. Stockfish can still use corrected castling or en passant metadata when the board is safe to analyze.
- Similar positions returns up to ten HNSW matches. Opening and decade filters apply to the nearest 1,000 candidates. A result opens its stored game at the matching ply. Live PostgreSQL EXPLAIN confirmed the HNSW index scan.


## B6 study room

- The dark study-room palette, self-hosted fonts, walnut board, animated evaluation, and move list apply to the client. The public landing page uses Chrome captures of the running application.
- Origin Lens supports keyboard upload, piece correction, castling edits, distinct game results, and direct replay. The live browser check found the Anand–Bareev position and opened its stored game.
- The production landing page scored 98 performance and 100 accessibility, best practices, and SEO in mobile Lighthouse. Chrome checked 390px navigation and board resizing with reduced motion enabled.
- [UI captures and critique](ui/README.md) show the desktop and mobile states and document Astra’s ten ranked findings and the five applied changes.
