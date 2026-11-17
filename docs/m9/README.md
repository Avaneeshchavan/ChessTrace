# M9 final audit and screenshot theme coverage

The scanner now compares 35 flat piece sets and estimates the local background separately from the pieces. Automatic selection ranks all sets at low resolution, then matches the six closest candidates at full resolution. Origin Lens warns when the best template fit is weak and highlights squares to check. FEN validation now rejects an empty board and other invalid positions before search.

## Recognition results

| Scope | Exact piece placement | Per-square accuracy | Review |
| --- | ---: | ---: | --- |
| 15 supplied screenshots using the Cases set, automatic orientation | 15/15 | 100% | No squares flagged or corrected |
| 210 synthetic screenshots across 35 flat piece sets, six board textures, three sizes and both orientations supplied to the scanner | 200/210 | 99.88% | 164 squares flagged, including 15 of the 16 wrong squares |

Every piece set passed the 98% per-square gate. GitHub CI runs this same deterministic test on public builds. [Full matrix and reproduction command](theme-matrix.md)

The supplied screenshots previously exposed missing Cases support. Other real piece sets, unseen custom assets, 3D themes, and photos of physical boards were **not measured**. The matrix measures square contents, including empty squares. Exact six-field FEN was **not measured** on the supplied screenshots. A board image cannot reliably establish historical metadata, so confirm side to move and castling rights when searching.

One local Linux container scan of the bundled e4 example returned the exact piece placement in **12.65 s**, including startup of the template cache and the HTTP round trip. Container peak memory was **79.9 MiB**. The test used a 0.1 vCPU limit and 512 MB memory limit, matching Render's listed Free compute size of “0.1 CPU” and “512 MB”. Render cold starts, hosted scan latency for this release, and concurrent uploads were **not measured**. [Render instance specifications](https://render.com/docs/compute-plans)

[390px mobile review](screenshots/390-theme-review.webp) · [1280px desktop review](screenshots/1280-theme-review.webp). The screenshots use the checked-in synthetic board and a simulated weak-fit response so both layouts show the same warning.

## Final audit

| Command or check | Result and scope |
| --- | --- |
| `npm test --prefix client-ui` and `npm run build --prefix client-ui` | 3 tests passed and Vite built successfully. |
| `npm run prisma:generate --prefix api-server`, `npx prisma migrate deploy` from `api-server/`, and `npm test --prefix api-server` | All six migrations applied to a disposable local PostgreSQL 17/pgvector database. All 40 tests passed with the live database and compact scratch tests enabled. |
| `python tests/test_pipeline.py` and `python -m unittest discover -s tests -p test_detect.py` from `vision-engine/` | Passed, including blank-board rejection and matcher scoring equivalence. |
| `python tests/eval/evaluate.py --cross-theme --per-size 2 --min-theme-square-accuracy 0.98` from `vision-engine/` | Passed for all 35 piece sets. |
| `node scripts/verify-theme-review.mjs` and `node scripts/verify-mobile.mjs` | Local Playwright fixtures passed. Chromium and WebKit covered upload, review, search, replay and puzzle save/rating. Chromium also covered touch, offline Stockfish and app updates. |
| `VERIFY_READ_ONLY=1 node scripts/verify-deploy.mjs` with the public origins | 11 checks passed against the deployed Vercel client/API and Render vision service. See the [production smoke result](production-smoke.txt). |
| `npm audit --json` in both JavaScript packages | Zero reported npm advisories in either package at audit time. |

Mobile Lighthouse 13.6.0 measured these routes. The local authenticated page used a fixture.

| Scope | Performance | Accessibility | Best practices | SEO |
| --- | ---: | ---: | ---: | ---: |
| Deployed public landing page | 96 | 100 | 100 | 100 |
| Local candidate landing page | 86 | 100 | 100 | 100 |
| Local candidate Settings | 71 | 100 | 100 | 63 |

## Release and pending checks

- Production checks exercised the previously deployed release. The M9 scan changes, live signup and puzzle writes still need verification after rollout. The read-only Neon check found `0005_puzzle_attempts` pending. See the [migration guide](../MIGRATIONS.md).
- Physical-device install, camera and gallery sharing, external uptime monitoring, and the scale target's actual capacity and latency remain unverified.
- The [scale-up runbook](../SCALE_UP.md) covers restore, re-ingest, cutover and rollback. Local PostgreSQL 17 accepted the dump, restore, compact reset, and account-copy commands with all six migration records retained. Oracle provisioning and a hosted scale rehearsal are pending.
