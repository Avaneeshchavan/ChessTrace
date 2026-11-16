# M7 — Twin Game

Open **Twin Game** from the desktop sidebar or the phone’s **More** menu. Paste a PGN or use the same Lichess and Chess.com importer as Turning Points. Chess.com links need either player’s username and the archive month. The timeline shows distinct matching games after each half-move.

The API uses one parameterized SQL query for up to 600 half-moves. The last position that meets the threshold becomes the shared position. The next user move is marked as the departure. A position reached later by a transposition can bring the line back above the threshold. If no played position qualifies, replay can start from ply zero. If the final position qualifies, the screen reports that the game stayed in the indexed line. Set `TWIN_MIN_GAMES` in the API environment to change the default threshold of three.

Both layouts match on the corpus’s existing FEN identity of piece placement, side to move, and castling rights. Compact counts come from `games_count` and can exceed the number of retained replays. The query ranks available twins by how far they match the user's positions, then by the number of shared plies, rating, and recency. Candidates must share the departure position and reach later matches after that position in their own replay. The API verifies each candidate’s recorded shared position against its PGN and counts only legal continuations from the imported position. The move and result counts are for the replay sample, capped by the active storage profile’s occurrence cap. The corpus can contain high-rated online games, so the interface describes them as corpus games.

## Evidence

- `npm test --prefix api-server` passed 39 tests. One opt-in compact search test was skipped. `npm test --prefix client-ui` and `npm run build --prefix client-ui` passed. `./venv/bin/python tests/test_pipeline.py` passed both synthetic vision fixtures.
- The [integration checks](checks.json) used real local Express, Prisma, and PostgreSQL via PGlite. They cover a Ruy Lopez departure, a departure on move three, a game that stayed in theory, a transposition, and a first-move departure in both corpus layouts. The compact fixture also verified that counts survive capping of replay rows.
- Playwright Chromium covered 390px touch emulation and 1280px desktop. Both runs handled invalid input, imported PGN, marked a departure, and opened and stepped through a transposed twin and a ply-zero replay. The Lichess and Chess.com import UI paths used stubbed provider responses and the real local Twin Game endpoint. Latest provider availability and end-to-end hosted performance were not measured. [Synthetic UI screenshots](screenshots)

## Neon timing

| Layout | Corpus games | Median SQL round trip |
| --- | ---: | ---: |
| Compact | 777 | 146.5 ms |
| Legacy | 10,473 | 239.6 ms |

Five samples per layout used the same 19-ply Ruy Lopez PGN and a single direct Neon connection. Timings include query execution and transferring the result rows to this workstation. The connection took 862.7 ms before sampling. HTTP, replay decoding, production browser timing, and confirmed cold-start latency were not measured. No migrations or corpus writes were performed. [Raw measurements](neon-timings.json)

Neon lists “100 CU-hours of compute per project per month” and “1 GB of storage per project” for Free. The benchmark used ten bounded read-only queries and created no storage. [Neon Free plan limits](https://neon.com/blog/neon-free-plan-1-gb-per-project)

## Reproduce

From the API directory, run `node scripts/benchmark-twin.js` with the intended SSL-protected Neon `DIRECT_URL`. It uses a read-only transaction, rolls back, and emits aggregate data only.

For local integration and screenshots, use an empty disposable PostgreSQL database with pgvector on `127.0.0.1`. Configure both database URLs, generate Prisma Client, and apply the existing migration history. Build the client with its local API default and run `node scripts/verify-twin-game.mjs` from the root with Playwright installed. `PLAYWRIGHT_PACKAGE` can point to a temporary installation. `CHROME_PATH` selects an existing Chrome installation and `TWIN_EVIDENCE` sets the output directory.
