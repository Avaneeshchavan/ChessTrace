# M6 — Play the Turning Point verification

The [design note](../design/PLAY_TURNING_POINT.md) explains move grading, hints, legacy puzzles, and SM-2 suggestions. The API uses `PUZZLE_TOLERANCE_CP` for alternate moves and defaults to 50. The API validates move legality and uses browser evaluation for the centipawn loss. The stats describe personal practice.

## Results

- Prisma generated the client and validated the schema. All six migrations applied to a fresh local PGlite database with pgvector. The original HNSW migration ran in that sequence. The production Neon migration was not applied. [PGlite socket documentation](https://pglite.dev/docs/pglite-socket)
- The standard API suite passed 37 tests. One opt-in compact-corpus integration test was skipped. The Vault HTTP test also passed using real Prisma persistence in the isolated local database. The client build and all three client tests passed.
- Playwright ran Chromium at 390 CSS pixels with touch input and at 1280 CSS pixels with mouse input. Both used the real local Express API, Prisma, and the Stockfish WASM worker. The runs covered two-stage hints, an alternate correct move, underpromotion, castling, en passant, a rejected non-mating move, reveal, a rating override, and rating a legacy puzzle. The mobile run interrupted the response after the alternate move was stored and verified the retry did not duplicate the attempt.
- Both browser runs stored `d2d4` as a correct alternative to the saved `e2e4`, with a measured loss of 35 centipawns at depth 12 in that position. The player used a hint, received a Hard suggestion, and chose Easy. See [recorded attempts](recorded-attempts.json) and [synthetic screenshots](screenshots).
- The M5 Pixel 7 Chromium and iPhone 14 WebKit fixture workflows passed with the restored WASM loader. Chromium also ran offline Stockfish after reload. M6 on physical devices, production grading performance, and production attempt rates were not measured.

## Reproduce

Use a disposable local database with pgvector, a browser, and the normal local frontend defaults. Set `DATABASE_URL` and `DIRECT_URL` to localhost for Prisma. The browser script requires both to use `127.0.0.1`, starts Express on port 5001, and removes its synthetic users afterward.

```sh
(cd api-server && npm run prisma:generate && npx prisma validate && npx prisma migrate deploy)
npm test --prefix api-server
CHESSTRACE_LIVE_DB_TEST=1 node --test api-server/src/routes/vault.test.js
npm test --prefix client-ui
npm run build --prefix client-ui
npm install --prefix /tmp/chesstrace-m6-tools --no-audit --no-fund playwright@1.65.0
/tmp/chesstrace-m6-tools/node_modules/.bin/playwright install chromium
PLAYWRIGHT_PACKAGE=/tmp/chesstrace-m6-tools/node_modules/playwright node scripts/verify-puzzle-play.mjs
```

Set `CHROME_PATH` to use an existing Chrome installation. Set `PUZZLE_EVIDENCE` to choose an output directory.

## Deployment order

With the intended Neon connection already configured in the environment, run `npx prisma migrate status` and `npx prisma migrate deploy` from the API directory. Deploy the API before the frontend so the review queue can send playable solutions and the attempt endpoint is available.
