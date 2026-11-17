# MVP production rollout

The [tagged source](https://github.com/Avaneeshchavan/ChessTrace/tree/v0.1.0-mvp-rc.1) at `05face9` passed [GitHub CI](https://github.com/Avaneeshchavan/ChessTrace/actions/runs/44061375496) and shipped on November 17, 2026. The approved rollout reused the existing projects and free plans. GitHub `main` was not changed as part of the deploy.

## Deployed components

| Component | Public endpoint | Release |
| --- | --- | --- |
| Client | [chesstrace.vercel.app](https://chesstrace.vercel.app) | `05face9` · [Vercel deployment](https://vercel.com/avaneeshchavans-projects/chesstrace/H5VrK8VjiDxjGZ3cqapvEPShxJ5X) |
| Express API | [chesstrace-express.vercel.app](https://chesstrace-express.vercel.app) | `05face9` · [Vercel deployment](https://vercel.com/avaneeshchavans-projects/chesstrace-express/5Gzqt71QH7K4hD4x4cjL8v6a51mK) |
| Vision | [chesstrace-vision.onrender.com](https://chesstrace-vision.onrender.com) | Render reported `05face9` live after a specific-commit deploy. The owner approved switching the service to manual releases because the linked branch is still the M4 branch. |
| PostgreSQL | Neon | `prisma migrate deploy` applied only `0005_puzzle_attempts`. The subsequent `prisma migrate status` reported all six migrations current. |

Vercel CLI confirmed the workspace is Hobby. The frontend and API built with production configuration, with domains assigned after the staged API health and exact search and the staged frontend deep link passed. The previous Vercel deployments remain restorable from the project deployment list. The Render rollback target was `5009082`. If rolling back the UI plus API, switch the UI first and keep the additive schema. Avoid redeploying the older Render source by accident when changing its automatic deploy settings. [Vercel promote](https://vercel.com/docs/cli/promote) · [Render manual deploy behavior](https://render.com/docs/deploys#deploying-a-specific-commit)

The rollout did not import additional games. After migration, the read-only corpus report returned 777 compact games, 34,822 distinct positions, 33,037 vectors, and 410,165,248 PostgreSQL database bytes. That database size is scoped to PostgreSQL and excludes other project-wide usage. Neon Free lists “1 GB of storage per project” and “100 CU-hrs monthly per project”. Before the Render deploy, its dashboard showed 3.25 of 750 Free instance hours and one of 500 included pipeline minutes used for the billing month. Vercel Hobby is “non-commercial, personal use only”. [Neon pricing](https://neon.com/pricing) · [Render Free limits](https://render.com/docs/free) · [Vercel Hobby](https://vercel.com/docs/plans/hobby)

## Production verification

- The post-cutover read-only verifier passed all 11 checks, including both deep links, Stockfish WASM headers, API and vision health, CORS, exact and similar search, replay, and the bundled screenshot.
- Fresh Chromium contexts completed the public sample through scanning, matching and replay at 390px and 1280px without horizontal overflow. In the 390px context, one disposable browser signup reached the dashboard in 580 ms from clicking Sign up. This is one browser run on a responsive emulator, with no confirmed cold start. The disposable browser account was deleted. [390px capture](release/screenshots/390-guided-sample.webp) · [1280px capture](release/screenshots/1280-guided-sample.webp)
- A synthetic 8-Bit piece-set image matched all 64 squares and selected the new theme in 4.43 seconds. The test supplied its orientation. This is one HTTPS request from the release workstation after the service was live. Idle wake-up and tail latency were not measured.
- Exact search returned 25 results in 913 ms, and similar search returned 10 in 340 ms, in one pair of requests from the release workstation after API promotion. An earlier read-only smoke against the previous deployment timed out after exact search. These observations do not establish that future requests cannot time out.
- A disposable account passed signup, login, puzzle save, due queue, correct attempt, retry with the same attempt ID, SM-2 rating, and both motif histories. The verifier used the existing Fork tag and checked each chart counted one attempt and one solve. The account was deleted and its credentials no longer authenticated.

Re-run the read-only verifier from the repository root:

```sh
VERIFY_READ_ONLY=1 API_URL=https://chesstrace-express.vercel.app \
  VISION_URL=https://chesstrace-vision.onrender.com \
  node scripts/verify-deploy.mjs https://chesstrace.vercel.app
```

The managed services still have cold paths. Hosted concurrency, independent uptime monitoring, and installed-device behavior remain unverified. See the [Claude handoff](CLAUDE_HANDOFF.md) for broader product questions.
