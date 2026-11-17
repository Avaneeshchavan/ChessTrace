import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { startMobileFixture, user } from './mobile-fixture.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || 'playwright');
const output = process.env.R3_EVIDENCE || '/tmp/chesstrace-r3-evidence';
const baseline = process.env.R3_BASELINE;
const dev = resolve('vision-engine/tests/eval/dev');
const [, ...labels] = (await readFile(dev + '/manifest.csv', 'utf8')).trim().split(/\r?\n/);
const scratch = await startMobileFixture({ baseline, visionPort: 0 });
const origins = [scratch.origin, scratch.baselineOrigin].filter(Boolean);
const vision = spawn(process.env.VISION_PYTHON || './venv/bin/python', ['-m', 'uvicorn', 'app.main:app', '--port', '8000'],
  { cwd: 'vision-engine', env: { ...process.env, ALLOWED_ORIGINS: origins.join(',') }, stdio: 'ignore' });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
let requests = 0;
let submittedCrop;
try {
  await mkdir(output, { recursive: true });
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    if (await fetch('http://127.0.0.1:8000/health').then(response => response.ok).catch(() => false)) {
      ready = true;
      break;
    }
    await delay(250);
  }
  assert.ok(ready, 'Local scanner did not become ready');

  for (const [version, origin] of [['before', scratch.baselineOrigin], ['after', scratch.origin]]) {
    if (!origin) continue;
    for (const width of [390, 1280]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width === 390, reducedMotion: 'reduce' });
      await context.addInitScript(account => {
        localStorage.setItem('token', 'fixture-token');
        localStorage.setItem('user', JSON.stringify(account));
      }, user);
      await context.route('**/api/search?*', route => route.fulfill({ json: { matchType: 'similar', matches: [], corpusGames: 3 } }));
      await context.route('**/api/search/placement?*', route => route.fulfill({ json: { matchType: 'placement', matches: [], replayCount: 0 } }));
      const page = await context.newPage();
      page.on('request', request => {
        if (new URL(request.url()).pathname === '/parse-screenshot') {
          requests++;
          submittedCrop = new URL(request.url()).searchParams;
        }
      });
      async function capture(name) {
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({ path: `${output}/${version}-${width}-${name}.png`, fullPage: true });
      }
      for (const label of labels) {
        const [file, , orientation, , , expectedSide] = label.split(',');
        const scenario = file.split('.')[0];
        await page.goto(origin + '/lens');
        const prior = requests;
        let releaseLocate;
        if (version === 'after' && scenario === 'clean') {
          await page.getByLabel('Board screenshot').waitFor({ state: 'attached' });
          await capture('empty');
          await page.route('**/locate-board', async route => {
            await new Promise(resolve => { releaseLocate = resolve; });
            await route.continue();
          }, { times: 1 });
        }
        await page.getByLabel('Board screenshot').setInputFiles(dev + '/images/' + file);
        if (version === 'after' && scenario === 'clean') {
          await page.getByRole('button', { name: 'Cancel scan' }).waitFor();
          await capture('locating');
          releaseLocate();
        }
        if (version === 'after') {
          const crop = page.getByRole('group', { name: 'Crop position' });
          await crop.waitFor();
          assert.equal(requests, prior);
          if (scenario === 'fallback') {
            await page.getByText(/A centered crop is shown/).waitFor();
            await capture('centered-proposal');
            const corner = page.getByRole('button', { name: 'Bottom right crop corner' });
            await corner.scrollIntoViewIfNeeded();
            const handle = await corner.boundingBox();
            const box = await crop.boundingBox();
            const center = { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 };
            await page.mouse.move(center.x, center.y);
            await page.mouse.down();
            await page.mouse.move(center.x - box.width * 2 / 3, center.y - box.height * 2 / 3, { steps: 5 });
            await page.mouse.up();
            const shrunk = await crop.boundingBox();
            const mid = { x: shrunk.x + shrunk.width / 2, y: shrunk.y + shrunk.height / 2 };
            await page.mouse.move(mid.x, mid.y);
            await page.mouse.down();
            await page.mouse.move(mid.x, mid.y + box.height / 3, { steps: 5 });
            await page.mouse.up();
            await capture('centered-adjusted');
          }
          if (scenario === 'clean') {
            const handle = page.getByRole('button', { name: 'Bottom right crop corner' });
            const before = await crop.getAttribute('style');
            await handle.press('Shift+ArrowLeft');
            assert.notEqual(await crop.getAttribute('style'), before);
            await page.getByRole('button', { name: 'Reset crop' }).click();
            if (width === 390) {
              const box = await crop.boundingBox();
              const cdp = await context.newCDPSession(page);
              const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
              const touchPoints = distance => [{ x: center.x - distance, y: center.y }, { x: center.x + distance, y: center.y }];
              await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touchPoints(55) });
              await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: touchPoints(26) });
              await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
              assert.notEqual(await crop.getAttribute('style'), before, 'Pinching should resize the square');
              await page.getByRole('button', { name: 'Reset crop' }).click();
            }
            await capture('crop-controls');
          }
          await page.getByRole('button', { name: 'Looks right' }).click();
        }
        await page.getByRole('heading', { name: 'Review the detected board' }).waitFor();
        if (version === 'after') {
          assert.equal(requests, prior + 1);
          assert.equal(submittedCrop.get('width'), submittedCrop.get('height'));
          if (scenario === 'fallback') {
            assert.ok(Math.abs(Number(submittedCrop.get('width')) - Number(expectedSide)) <= 3);
            await page.getByRole('button', { name: /^e4: White pawn/ }).waitFor();
          }
          const search = page.getByRole('button', { name: 'Search this position' });
          assert.ok(await search.isDisabled());
          if (orientation === 'black_bottom') {
            const flip = page.getByRole('button', { name: 'Black at bottom', exact: true });
            await flip.click();
            assert.equal(await flip.getAttribute('aria-pressed'), 'true');
          }
          if (scenario === 'clean') {
            await page.getByLabel('Confirm the game state for exact search').check();
            await search.click();
            await page.getByRole('button', { name: 'Search ignoring castling and turn' }).click();
            await page.getByText(/No available replay has this piece layout/).waitFor();
            await capture('broader-no-results');
          }
        }
        await capture(scenario + '-review');
      }
      if (version === 'after') {
        await page.goto(origin + '/lens');
        await page.getByLabel('Board screenshot').setInputFiles(dev + '/images/clean.png');
        await page.getByRole('button', { name: 'Looks right' }).click();
        await page.getByRole('button', { name: /^e4: White pawn/ }).waitFor();
        await page.getByRole('link', { name: 'Set up the position by hand' }).click();
        await page.getByRole('heading', { name: 'Set up the position' }).waitFor();
        await page.getByRole('button', { name: /^e4: White pawn/ }).waitFor();
        await capture('manual-from-scan');
        await page.goto(origin + '/lens');
        await page.getByLabel('Board screenshot').setInputFiles({ name: 'invalid.png', mimeType: 'image/png', buffer: Buffer.from('invalid') });
        await page.getByRole('alert').getByText(/decodable board image/).waitFor();
        await page.getByRole('link', { name: 'Set up the position by hand' }).waitFor();
        await capture('invalid-image');
      }
      await context.close();
      console.log(`PASS ${version} ${width}px crop and review browser scenarios`);
    }
  }
} finally {
  await browser.close();
  scratch.close();
  vision.kill();
}
