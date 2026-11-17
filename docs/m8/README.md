# M8 — Product polish verification

## Guided Origin Lens sample

The guest sample starts after **1. e4**, with Black to move and all castling rights available. It uploads a generated board, checks recognition against the known placement, and uses the known metadata from the game position. It then searches the configured corpus and opens the first exact match. Review remains editable if the scanner detects a different position. The sample still uses the live scanner and search API when hosted, so the first run can wait for services to resume.

The local scanner verified the generated image's placement and returned one flagged square. A read-only Neon check returned 25 exact occurrences from the compact replay sample. The first replay opened Abdusattorov, Nodirbek vs. Erigaisi Arjun at half-move 1, game 10217. The 25 occurrences reflect the returned replay list, which is capped by ingestion. The sample uses an app-generated image and live API data.

The read-only `npm run corpus:report` measured 777 compact games from Lichess Broadcasts, 34,822 distinct positions, 33,037 vector-bearing positions, and 410,058,752 total PostgreSQL database bytes on November 17, 2026. PostgreSQL bytes and provider-billed usage measure different things. The live homepage returned HTTP 200 during this check. Production M8 deployment was outside this run.

## Browser and API checks

`npm run build --prefix client-ui`, `npm test --prefix client-ui`, and `npm test --prefix api-server` passed. API results were 39 passed and one skipped opt-in search test. Both vision test scripts passed with local synthetic fixtures.

Playwright ran with Chromium at 390px touch emulation and 1280px desktop. The guided sample, search, and replay used the real local FastAPI scanner, Express API, and PostgreSQL via PGlite, with one synthetic game in the local corpus. The browser checks covered guest access, review-square arrow-key navigation, keyboard-only chess moves, reduced motion, the no-match count, offline guidance, account deletion confirmation, incorrect password, Escape focus restoration, and sign-out. Both synthetic deletions removed the user, saved puzzles, attempts, and activity. The test confirmed the deleted credentials could no longer sign in. No live account data was modified.

Set `DATABASE_URL` and `DIRECT_URL` to an empty disposable pgvector database at `127.0.0.1`, apply the existing migration history, and use the normal local build. Start the vision app with `python -m uvicorn app.main:app --host localhost --port 8000` from its directory. From the repository root run `node scripts/verify-product-polish.mjs` with Playwright installed. The script starts local Express on port 5001 and serves the client on port 5173. Set `PLAYWRIGHT_PACKAGE` for a temporary install and `CHROME_PATH` for an existing Chrome.

The [synthetic screenshots](screenshots) include landing viewport crops, the guest sample and empty search, keyboard focus, the account deletion flow, offline messaging, About, and Privacy.

## Vision evaluation

The [real screenshot evaluation](vision-real.md) measured 15 privately supplied Chess.com Cases boards before and after adding Cases templates. Exact placement improved from **0/15 to 15/15** on this batch. The [initial synthetic run](vision-synthetic.md) used rendered boards with orientation supplied to the detector.

To run the private benchmark, place the labeled screenshots under `vision-engine/tests/eval/images/` and a CSV with `image,expected_fen,orientation` at `vision-engine/tests/eval/manifest.csv`. Both paths are ignored by Git. Use independently verified piece placement or a full six-field FEN for each image. Leave orientation blank to measure automatic orientation detection. From `vision-engine/` run:

```sh
python tests/eval/evaluate.py --manifest tests/eval/manifest.csv --images tests/eval/images --output /tmp/chesstrace-real-eval.md
```

The harness reports aggregate exact placement, per-piece accuracy, flag coverage, and needed corrections. It keeps images and the labeled manifest local.

## Mobile Lighthouse

| Local page | Performance | Accessibility | Best practices | SEO |
| --- | ---: | ---: | ---: | ---: |
| Landing | 86 | 100 | 100 | 100 |
| Signed-in Settings | 86 | 100 | 100 | 63 |

These are individual Lighthouse 13.6.0 mobile runs in local headless Chrome. Settings used a synthetic signed-in account and fixture API responses. Lighthouse flags links that require authentication in its SEO check. The scores apply to the tested local builds. Hosted Lighthouse and physical-device accessibility were not measured. [Score data](lighthouse.json)
