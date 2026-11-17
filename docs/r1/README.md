# R1 results and replay verification

These paired Chromium captures used identical local responses for the scanner, search API, and replay. The fixture represents 386 matching games with eight retained replays. It includes a centered-crop warning, one flagged square, a human PGN comment, and machine annotations. Production latency and the live corpus count were outside this run.

| Scenario | 390px | 1280px |
| --- | --- | --- |
| Sample, results and replay before | [Mobile](screenshots/before-390-sample-results-replay.webp) | [Desktop](screenshots/before-1280-sample-results-replay.webp) |
| Sample, results and replay after | [Mobile](screenshots/after-390-sample-results-replay.webp) | [Desktop](screenshots/after-1280-sample-results-replay.webp) |
| Expanded replay details | [Mobile](screenshots/after-390-replay-details.webp) | [Desktop](screenshots/after-1280-replay-details.webp) |
| Similar results before | [Mobile](screenshots/before-390-similar.webp) | [Desktop](screenshots/before-1280-similar.webp) |
| Similar results after | [Mobile](screenshots/after-390-similar.webp) | [Desktop](screenshots/after-1280-similar.webp) |
| Loading | [Mobile](screenshots/after-390-loading.webp) | [Desktop](screenshots/after-1280-loading.webp) |
| Empty | [Mobile](screenshots/after-390-empty.webp) | [Desktop](screenshots/after-1280-empty.webp) |
| Error | [Mobile](screenshots/after-390-error.webp) | [Desktop](screenshots/after-1280-error.webp) |

The browser assertions cover viewport overflow, five initially visible results, expanding the list, the active replay, the fallback warning, the sample's explanation of its flagged square, and the absence of raw PGN markup in the replay. Qualitative similarity labels describe distance bands, and the shared-feature text checks the same vector dimensions used by scoring.

To regenerate, build the tagged client as a baseline and the R1 client as `client-ui/dist`. Set `R1_BASELINE` to the baseline build directory and run `node scripts/verify-r1.mjs` with Playwright and Chromium installed. Set `PLAYWRIGHT_PACKAGE` or `CHROME_PATH` if needed.
