# M5 — Mobile layout and installable ChessTrace

On phones, the bottom tabs open Lens, Sandbox, Vault, and Profile. More opens Dashboard, Turning Points, and sign-out. Origin Lens offers the system image picker and a rear-camera option. Screenshots are more reliable than photos of screens. The guided review button stays above the tab bar while the review is in view. Sandbox supports tap-to-move and touch dragging, with brief feedback on supported devices.

## Install and use offline

- Android Chrome users can install ChessTrace from the browser menu. Once installed, share a PNG, JPEG, or WebP screenshot from the gallery and select ChessTrace. A shared image stays in worker memory until Lens picks it up or 90 seconds elapse. The scanner still needs a connection. [Chrome Web Share Target documentation](https://developer.chrome.com/docs/capabilities/web-apis/web-share-target)
- iOS users can add the app to their home screen and open the system picker in Lens. Safari on iOS does not support receiving gallery shares through the Web Share Target API. [Installation instructions](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable), [Web Share Target compatibility](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/share_target#browser_compatibility)
- Complete one Stockfish analysis in Sandbox after the app has loaded online. Later, open **Open offline tools** from the offline home page to play moves and analyze a position. The service worker stores built app files and Stockfish assets. Account data, API responses, and uploaded images stay out of the offline cache. Apply app updates with **Reload app** when ready.
- The existing browser worker loaded the bundled asm.js Stockfish engine in testing. The separate WASM asset remains in place and was not requested by the existing worker. Offline verification used the shipped engine. WASM execution was not measured.

## Verification scope

All measurements use a local Vite production build. Playwright used Chrome with the Pixel 7 profile and WebKit with the iPhone 14 profile. HTTP fixtures replaced the API and image scanner. Both profiles uploaded a synthetic board, confirmed the flagged square, searched, replayed, analyzed a PGN with the browser engine, saved a puzzle, and submitted a review rating. The Pixel 7 profile also exercised tap and drag, the browser-side share handoff, the app-update prompt, and offline Stockfish after reload. The test checked that API responses stayed out of Cache Storage.

The route audit covers 360, 390, 412, 768, and 1280 CSS pixels in desktop Chromium with a resized viewport. It checks visible buttons, form fields, board bounds, text size, and document overflow. See [layout measurements](layout.json) and the synthetic screenshots in [screenshots](screenshots). The mobile browser runs separately exercised the interactive review and puzzle states.

[Lighthouse scores](lighthouse.json) are single mobile-mode runs using Lighthouse 13.6.0 and Chrome 156 on this workstation. Signed-in routes used a synthetic account in local storage. The reports measure the page with fixture responses. Production performance, installed Android gallery sharing, and physical camera behavior were not measured.

| Local page | Performance | Accessibility | Best practices | SEO |
| --- | ---: | ---: | ---: | ---: |
| Landing | 87 | 100 | 100 | 100 |
| Dashboard | 87 | 100 | 100 | 63 |
| Origin Lens | 88 | 100 | 100 | 63 |
| Sandbox | 88 | 100 | 100 | 63 |
| Turning Points | 88 | 100 | 100 | 63 |
| Pattern Vault | 76 | 100 | 100 | 63 |
| Vault Review | 87 | 100 | 100 | 63 |
| Profile | 87 | 100 | 100 | 63 |

## Reproduce

From the repository root, build with the default local API and vision URLs. The verification scripts start temporary fixture servers on ports 5001 and 8000.

```sh
npm run build --prefix client-ui
npm test --prefix client-ui
npm install --prefix /tmp/chesstrace-m5-tools --no-audit --no-fund playwright@1.65.0 lighthouse@13.6.0
/tmp/chesstrace-m5-tools/node_modules/.bin/playwright install chromium webkit
export PLAYWRIGHT_PACKAGE=/tmp/chesstrace-m5-tools/node_modules/playwright
export LIGHTHOUSE_PACKAGE=/tmp/chesstrace-m5-tools/node_modules/lighthouse
export CHROME_LAUNCHER_PACKAGE=/tmp/chesstrace-m5-tools/node_modules/chrome-launcher
MOBILE_WEBKIT=1 node scripts/verify-mobile.mjs
node scripts/verify-lighthouse-mobile.mjs
```

Set `CHROME_PATH` to use an existing Chrome installation. Set `MOBILE_BASELINE` to a build directory from the parent branch for before captures. Reports and screenshots default to `/tmp/chesstrace-m5-evidence` and can be redirected with `MOBILE_EVIDENCE`.
