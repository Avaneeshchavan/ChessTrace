# R2 first-run resilience

The guided sample ships the recognized e4 board and three replay records. The displayed list describes the bundled examples. The live scan action runs recognition and queries current corpus results. The bundled PGNs come from the Quantbox Chennai Grandmasters 2026 broadcast, via Lichess Broadcasts, which states “Broadcast games are released under the Creative Commons Attribution-ShareAlike 4.0 license.” The import normalizes PGN notation for replay. The bundled game data retains the same license. [Lichess Broadcasts](https://database.lichess.org/#broadcasts) · [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)

Open Lens without a scan and the scanner receives no wake request. Selecting a file, dropping an image, opening the camera, and selecting **Scan it live** can initiate one health probe per ten minutes for that browser tab. The upload itself has a 90-second deadline. Search and API calls default to a 15-second deadline across attempts, configurable via `VITE_API_TIMEOUT_MS` at build time. Individual calls may specify a shorter or longer deadline. Idempotent requests retry transient errors within the deadline. Scanner uploads and current account mutations submit once. The scan wait copy reflects Render's documented idle behavior. Render says a Free service spins down after “15 minutes without receiving any inbound traffic” and waking “takes about one minute.” Hosted idle wake-up duration was not measured for R2. [Render Free](https://render.com/docs/free)

## Browser captures

Chromium blocked all API and scanner requests while opening the sample and stepping through a replay. In a separate run with simulated scanner responses, Chrome verified a delayed upload, cancellation, HTTP 429 with Retry-After, HTTP 503, and loss of connectivity during the upload. The same file preview remained through those failures and retries. It also verified the fallback editor starts with an empty board and can hand a position to Sandbox. The browser tests ran at both viewport widths. Playwright stores its blocked-service traces locally in `R2_EVIDENCE`.

| State | 390px | 1280px |
| --- | --- | --- |
| Walkthrough with backends blocked | [Mobile](screenshots/390-walkthrough.webp) | [Desktop](screenshots/1280-walkthrough.webp) |
| Lens before upload | [Mobile](screenshots/390-empty.webp) | [Desktop](screenshots/1280-empty.webp) |
| Waiting for a scan | [Mobile](screenshots/390-slow.webp) | [Desktop](screenshots/1280-slow.webp) |
| Canceled | [Mobile](screenshots/390-canceled.webp) | [Desktop](screenshots/1280-canceled.webp) |
| Busy | [Mobile](screenshots/390-busy.webp) | [Desktop](screenshots/1280-busy.webp) |
| Server error | [Mobile](screenshots/390-server.webp) | [Desktop](screenshots/1280-server.webp) |
| Offline during upload | [Mobile](screenshots/390-offline.webp) | [Desktop](screenshots/1280-offline.webp) |

Run `npm test --prefix client-ui`, `npm run build --prefix client-ui`, and `node scripts/verify-r2.mjs` from the repository root. The browser verifier requires Playwright and Chromium. Set `PLAYWRIGHT_PACKAGE`, `CHROME_PATH`, or `R2_EVIDENCE` to override the defaults.
