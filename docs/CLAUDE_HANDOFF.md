# ChessTrace handoff for Claude

## Review assignment

Critique the product and recommend what to change. Read this handoff and the evidence linked below before trying the live site. Check which version you are exercising. Start with the [public sample](https://chesstrace.vercel.app/sample) as a first-time visitor, then look at the same workflows on a 390px phone viewport and a 1280px desktop viewport. If you have a disposable account, test the authenticated path from a real screenshot or imported game to one saved puzzle and one review. Note which steps you personally reproduced.

Rank findings by how much they interfere with the main workflow, how frequently they are likely to occur, and how strong the evidence is. For each finding, give the route or code area, the user impact, the smallest proposed change, an acceptance test, and any free-tier or privacy trade-off. Finish with the three improvements you would do first, one decision the owner needs to make, and one feature you would defer. Separate observations, hypotheses, and ideas. Recommend changes and leave implementation for a follow-up.

## Product and intended audience

ChessTrace helps chess players take a position they already have and see how real games reached it or continued from it. The core flow is **screenshot → check the board → find a historical match → replay from the matching move → study**. The same player can paste or import a game, find mistakes with Stockfish, save those positions as puzzles, and practice them on a spaced schedule.

- **Origin Lens** accepts a screenshot, previews the detected board and uncertain squares, and lets you fix pieces, orientation, turn, and castling before exact or similar-position search. A result opens a replay at the matching ply.
- **Sandbox** supports legal board moves, editing a FEN, Stockfish analysis, and filtered similar-position search.
- **Turning Points** uses a Lichess game link, a completed Chess.com game, or pasted PGN and extracts up to three reviewable positions from evaluation drops.
- **Twin Game** compares an imported game with the corpus in one batched request. It identifies the departure from the indexed line, shows continuations and the replay sample, and handles transpositions. The default shared-position threshold is three corpus games.
- **Pattern Vault** stores positions and motifs, schedules SM-2 reviews, and supports playing a solution, two hints, reveal, and overriding the suggested rating. It presents move-based and self-rated results separately.
- **Guest sample, mobile and offline** include a guided sample, mobile tabs, touch and keyboard board controls, a service worker, and offline Sandbox analysis after Stockfish assets have loaded. Web Share Target is Android Chrome-specific and still needs a real-device check.

## Code and infrastructure map

| Area | Entry points and design |
| --- | --- |
| Client | React, Vite, React Router, Chessground, chess.js and CSS. Start at `client-ui/src/App.jsx`, `pages/OriginLens.jsx`, `components/Board/ScreenshotReview.jsx`, `pages/VaultReview.jsx` and `components/Vault/PuzzlePlay.jsx`. |
| Engine | Browser-only Stockfish WASM and a PGN parser worker. See `client-ui/src/hooks/stockfishClient.js`, `hooks/useStockfish.js` and `workers/parseGame.js`. The server validates legal moves. Alternate move grading uses client-reported evaluation, so the result is suitable for personal study. |
| API and auth | Express, Prisma, bcrypt and JWT. See `api-server/src/index.js`, `routes/authRoutes.js`, `routes/vaultRoutes.js`, `routes/userRoutes.js` and `client-ui/src/context/AuthContext.jsx`. Stable API endpoint is on Vercel. |
| Search | PostgreSQL plus pgvector, legacy and compact implementations behind `USE_COMPACT_STORAGE`. Compact search hashes the first three FEN fields, verifies the full key and the replay, and uses 32-dimensional structural vectors, L2 distance and a partial HNSW index. See `compact-search.js`, `vector.js`, `twin-game.js` and `api-server/config/storage.js`. Exact search uses position, turn and castling as its identity. |
| Corpus | Official Lichess Broadcast PGNs, curated for eligible rated classical games, are the primary approved source. The streaming loader has checkpoints, retry deduplication, COPY staging, an index-build step and a byte guard. Review the [source decisions](../data/SOURCES.md) and [import evidence](CURATED_CORPUS.md) before proposing new data. |
| Scanner | FastAPI, OpenCV, NumPy, python-chess and optional Tesseract. See `vision-engine/app/main.py`, `app/pipeline/board_detection.py`, `orientation.py`, `sprite_matching.py`, and `tests/eval/evaluate.py`. The current candidate compares 35 flat piece sets, matches against local square backgrounds, warns on weak fits, and rejects illegal provisional positions. |
| Hosting | [Vercel client](https://chesstrace.vercel.app) and [Vercel API](https://chesstrace-express.vercel.app), [Render vision](https://chesstrace-vision.onrender.com), Neon Postgres. The API uses request-driven auth without a separate frontend wake-up poll. Render vision can suspend after “15 minutes without receiving any inbound traffic” and says waking takes “about one minute.” Postgres and the API can also have cold paths. [Render Free documentation](https://render.com/docs/free) · [Hosting runbook](HOSTING.md) |

## Sprint reconciliation

The original prompt numbering ends at M9. M0 is the standing contract in [AGENTS.md](../AGENTS.md). There is no M10 in the supplied plan.

| Step | Delivered and remaining verification |
| --- | --- |
| M1 | Repository cleanup, CI and UI follow-up merged to GitHub main. [Evidence](M1.md) |
| M2 | Both storage layouts, collision and replay checks, compatibility tests and 1,000/10,000-game local measurements. The 60-ply Lichess run extrapolated 30,701 games for a fresh 700 MB corpus. Hosted capacity can differ because existing data and index growth use space. [Benchmarks](CAPACITY_MVP.md) |
| M3 | Loader, licensing register, kill/resume proof, report, and a small compact corpus already on Neon. The planned broader production import and hosted HNSW build-resource measurement remain incomplete. [Import evidence](CURATED_CORPUS.md) |
| M4 | Client, API, scanner, and DB deployed. Earlier hosted auth, vault and search smoke checks passed. API moved from Render to Vercel to remove Render wake-up from auth. Independent uptime monitoring has been documented and remains unverified. [Hosting](HOSTING.md) |
| M5 | Mobile and offline flows passed browser emulation. Installed-device camera/gallery sharing, lifecycle and offline tests remain. [Mobile evidence](m5/README.md) |
| M6 | Playable attempts, alternate grading, retry-safe persistence and ratings tested locally. Neon migration `0005_puzzle_attempts` was applied and Prisma confirmed the schema is current. See the release section for serving-code verification. [Attempt flow](m6/README.md) |
| M7 | Twin Game and transpositions verified locally in both layouts. On Neon, a 19-ply query measured median 146.5 ms compact and 239.6 ms legacy across five samples each, including DB round trip. Hosted user-path latency was not measured here. [Twin Game evidence](m7/README.md) |
| M8 | Guest sample, clearer empty and offline states, About, Privacy, account deletion and accessibility work implemented. Case-specific vision evaluation used 15 supplied screenshots. The originally requested 40 diverse real screenshots have not been collected. [Polish](m8/README.md) · [Real screenshot evaluation](m8/vision-real.md) |
| M9 | Scale-up guide and final audit completed. Local PostgreSQL dump, restore and account-copy commands rehearsed. No larger hosted database was provisioned. [Audit](m9/README.md) · [Scale-up and rollback](SCALE_UP.md) |

## Evidence to interpret carefully

- **Recognition.** The scanner matched all 15 user screenshots, all from the Cases piece set and previously used to identify the coverage gap. The 210 rendered boards mixed 35 flat piece sets, six textures, three sizes and both orientations, which the synthetic harness supplied. It measured 200 exact boards, 99.88% of square labels, and flags on 15 of the 16 wrong squares. Independent real-theme generalization, physical boards, 3D pieces, real OCR accuracy across platforms, and exact six-field FEN were not measured. A reported template fit is a score. It does not give a calibrated probability of a correct board.
- **Recognition latency.** One bundled synthetic sample took 12.65 seconds in a local Linux container limited to 0.1 CPU and 512 MB, including the initial template cache load and local HTTP round trip. Peak cgroup memory was 79.9 MiB for that single scan. Hosted tail latency and concurrent uploads were not measured by that experiment.
- **Corpus.** The post-migration read-only production inventory was 777 compact broadcast games, 34,822 distinct positions, and 33,037 vector-indexed positions. Local benchmark input and legacy rows are separate from the searchable compact count. The corpus can verify a match or show absence within its own coverage. A missed match cannot establish that a position has never been played.
- **Release candidate.** The [M9 tag](https://github.com/Avaneeshchavan/ChessTrace/tree/v0.1.0-mvp-rc.1) is commit `05face9`. [GitHub CI](https://github.com/Avaneeshchavan/ChessTrace/actions/runs/44061375496) passed. The M9 audit also passed 40 API tests with disposable real PostgreSQL, three client tests and a build, vision endpoint tests, and the theme matrix. The M9 read-only production smoke passed 11 checks on the then-deployed version. The separate mobile Lighthouse run measured public landing 96 performance and 100 accessibility, best practices, and SEO. The local candidate Settings performance score was 71. These are individual test runs under their stated scopes.
- **Current production rollout.** The Vercel client, Vercel API, and Render scanner now serve the tagged `05face9` release. Neon has all six migrations. The promoted API passed a disposable signup, login, puzzle attempt, safe retry, rating and account deletion. The live sample reached replay at both target viewport sizes and mobile Chrome emulation reached the dashboard after signup. The tagged code is ahead of GitHub main, so use the release tag when reading source. [Production release and verification](RELEASE_MVP.md)

## Two concrete findings to start with

- The public sample says “25 games with this position.” A read-only Neon query found 386 distinct corpus games reached the sample's FEN core and 25 retained replay links. The interface is showing the replay-list length as though it were the total. Compare the lightest fix, a label such as “25 replays shown,” with returning the total and showing “386 matches · 25 replays available.” Review `OriginLens.jsx` and `searchRoutes.js`. [Live desktop capture](release/screenshots/1280-guided-sample.webp)
- The sample's replay shows raw PGN annotation tokens such as `[%eval 0.18] [%clk 1:30:42]` underneath the move list. Evaluate whether to format those for readers or collapse them behind a details control while retaining the original game data. [Live desktop capture](release/screenshots/1280-guided-sample.webp)

## What to challenge

1. **Onboarding and navigation.** Start from [the landing page](https://chesstrace.vercel.app) and try the guest sample. Can someone explain the value before they see a signup form? Can they find Lens and locate later tools like Twin Game without guessing? Consider a guest scan or browser-local manual board fallback. Check whether the main action is still clear when the scanner is slow or offline.
2. **Trust in recognition.** Compare review order and wording on a clean screenshot versus a cropped, highlighted, flipped or unfamiliar board. Consider a crop/orientation correction card, a lower-confidence manual-entry path, and clearer disclosure of turn and castling assumptions. Propose a small held-out, consented test set covering multiple sites, mobile, crop, arrows and both orientations. Score exact positions, correction count, flags that miss errors, and time to a successful search.
3. **Search usefulness.** Walk through exact, similar and no-match results. Evaluate whether the reason for a similarity match is visible and whether a no-match user can recover. Consider “why this match” explanations from the current structural vector, and better corpus selection before adding new search modes.
4. **Study UX.** Follow one position through review, replay, save, and the next due session. Look for keyboard and touch friction, unexplained rating suggestions, and unnecessary context changes. Consider collections or a daily review session only if there is a clear gap in the existing workflow.
5. **Operational readiness.** Check what can fail between the three services, what distinguishes a cold start from a real outage, and how failures are surfaced. Propose a zero-cost measurement plan for sign-in latency, scan latency, time to first replay, and warm/cold success rates. Keep monitoring from defeating Render’s idle behavior. Review auth abuse controls, ownership tests, token storage, and deletion/retention claims as a defensive code review. Report gaps with evidence.
6. **Mobile, privacy and accessibility.** Try real Android and iOS where possible. Check touch targets, focus after scanning, reduced motion, labels for board controls, PWA install/update, offline recovery, and where screenshots are processed. Ask whether the information retained matches what the Privacy page says.
7. **Product focus.** Compare three directions: make Lens dependable for more users, deepen the existing study loop, or expand the corpus. Rank them with evidence from the current bottlenecks. Consider a four-week plan with a single end-to-end success measure and identify what to defer.

## Boundaries for recommendations

Keep the hobby deployment at zero cost. Neon Free currently lists “100 CU-hrs monthly per project” and “1 GB of storage per project.” Vercel Hobby is “non-commercial, personal use only.” Retain migration history, use portable PostgreSQL/pgvector, keep Stockfish browser-only, and keep real screenshots and secrets out of Git. Suggest hosted changes only with current provider terms and a rollback plan. Real users’ screenshots and account credentials are outside this review package. [Neon pricing](https://neon.com/pricing) · [Vercel Hobby terms](https://vercel.com/docs/plans/hobby)
