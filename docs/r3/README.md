# R3 recognition recovery

Lens locates a candidate crop, then sends the user-confirmed square for recognition. A centered fallback needs the same confirmation as a detected crop and displays its own warning. Crop placement can be dragged, resized from its corners, pinched, or adjusted with the keyboard. The scanner validates that submitted coordinates define a square of at least 64 pixels wholly within the decoded image.

The review shows uncertain squares directly and exposes the orientation guess. Exact search uses the confirmed turn and castling rights. En passant is available for the position sent to Sandbox, while the current corpus identity uses piece layout, turn and castling rights. Broader search queries the existing exact index for allowable turn and castling combinations and lists available replays. Sandbox receives the edited board through navigation state. There is also an empty board editor for failed scans and the initial upload screen.

## Before and after

| Scenario | 390px before | 390px after | 1280px before | 1280px after |
| --- | --- | --- | --- | --- |
| Clean screenshot | [Before](screenshots/before-390-clean-review.webp) | [After](screenshots/after-390-clean-review.webp) | [Before](screenshots/before-1280-clean-review.webp) | [After](screenshots/after-1280-clean-review.webp) |
| Already cropped | [Before](screenshots/before-390-cropped-review.webp) | [After](screenshots/after-390-cropped-review.webp) | [Before](screenshots/before-1280-cropped-review.webp) | [After](screenshots/after-1280-cropped-review.webp) |
| Black at bottom | [Before](screenshots/before-390-flipped-review.webp) | [After](screenshots/after-390-flipped-review.webp) | [Before](screenshots/before-1280-flipped-review.webp) | [After](screenshots/after-1280-flipped-review.webp) |
| Centered fallback | [Before](screenshots/before-390-fallback-review.webp) | [After](screenshots/after-390-fallback-review.webp) | [Before](screenshots/before-1280-fallback-review.webp) | [After](screenshots/after-1280-fallback-review.webp) |

The other captures show the crop controls, centered proposal and adjusted crop, and how the UI handles empty input, loading, invalid files, broader no-results and manual recovery.

## Verification

- `npm test --prefix client-ui` passed nine tests. The frontend built successfully.
- `COMPACT_SCRATCH_URL=… npm test --prefix api-server` passed 41 tests against disposable PostgreSQL with pgvector, including broader lookup in both storage modes.
- `python -m unittest discover -s tests -p test_detect.py` passed six endpoint tests. They cover location, fallback and crop validation.
- `node scripts/verify-r3.mjs` passed with a real local vision service and fixture search responses at 390px and 1280px. The test exercised keyboard crop resize, touch pinch in mobile Chromium, pointer recovery of the centered fallback, game-state confirmation, broader search and carrying the detected board into Sandbox.
- The synthetic dev run with the supplied crop or orientation data recorded four exact placements, zero square corrections and zero missed flags. A disposable API corpus seeded with one e4 game matched three e4 cases and returned no match for the flipped fixture's different position. The harness rejected byte-identical images across splits.
- Real held-out recognition accuracy and physical-device camera behavior were **not measured**. The four dev examples are generated from public assets. The [private evaluation instructions](../../vision-engine/tests/eval/README.md) describe how to add an independent set and run the harness.

Render lists “750 Free instance hours to each workspace per calendar month” for free web services. The rollout uses the existing Free scanner and existing Vercel Hobby projects. [Render Free](https://render.com/docs/free) · [Vercel Hobby](https://vercel.com/docs/plans/hobby)
