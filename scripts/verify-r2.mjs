import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { startMobileFixture, user } from './mobile-fixture.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || 'playwright');
const output = process.env.R2_EVIDENCE || '/tmp/chesstrace-r2-evidence';
const file = 'client-ui/public/product/guided-e4.png';
const scanPath = 'http://localhost:8000/parse-screenshot';
await mkdir(output, { recursive: true });
const fixture = await startMobileFixture();
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
try {
  for (const width of [390, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block' });
    await context.tracing.start({ screenshots: true, snapshots: true });
    const page = await context.newPage();
    page.on('pageerror', error => console.error(error.message));
    async function capture(name) {
      await page.evaluate(() => document.fonts.ready);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
      await page.screenshot({ path: `${output}/${width}-${name}.png`, fullPage: true });
    }
    let backendRequests = 0;
    const deny = route => { backendRequests++; return route.abort(); };
    await context.route(/http:\/\/localhost:(5001|8000)\//, deny);
    await page.goto(fixture.origin + '/sample');
    const replay = page.getByRole('region', { name: 'Game replay' });
    await replay.getByText('1. e4').waitFor();
    await replay.getByRole('button', { name: 'Next move' }).click();
    await replay.getByText('1… e5').waitFor();
    await page.getByText('Three example replays').waitFor();
    assert.equal(backendRequests, 0);
    await capture('walkthrough');
    await context.tracing.stop({ path: `${output}/${width}-backends-blocked.zip` });
    await context.unroute(/http:\/\/localhost:(5001|8000)\//, deny);

    await context.addInitScript(account => {
      localStorage.setItem('token', 'fixture-token');
      localStorage.setItem('user', JSON.stringify(account));
    }, user);
    let wakeRequests = 0;
    await context.route('http://localhost:8000/health', route => {
      wakeRequests++;
      return route.fulfill({ json: { status: 'ok' } });
    });
    let scanCount = 0;
    let mode = 'delay';
    let release;
    await context.route(scanPath, async route => {
      scanCount++;
      if (mode === 'delay') {
        await new Promise(resolve => { release = resolve; });
        return route.abort().catch(() => {});
      }
      if (mode === 'offline') {
        await context.setOffline(true);
        await page.waitForFunction(() => !navigator.onLine, { timeout: 3000 });
        return route.abort('internetdisconnected');
      }
      return route.fulfill({ status: mode === 'busy' ? 429 : 503,
        headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Retry-After', 'Retry-After': '7' },
        json: { detail: 'Synthetic failure' } });
    });
    await page.goto(fixture.origin + '/lens');
    const upload = page.getByLabel('Board screenshot');
    const preview = page.getByAltText('Board screenshot preview');
    await upload.waitFor({ state: 'attached' });
    assert.equal(wakeRequests, 0);
    await capture('empty');
    await upload.setInputFiles(file);
    await page.getByText(/Taking longer than usual \(3 s\)/).waitFor();
    await preview.waitFor();
    await capture('slow');
    await page.getByRole('button', { name: 'Cancel scan' }).click();
    release();
    await page.getByText('Scan canceled. Your screenshot is still here.').waitFor();
    await preview.waitFor();
    await capture('canceled');

    for (const [state, message] of [
      ['busy', 'The service is busy. Try again in 7 seconds.'],
      ['server', 'The service returned an error. Try again.'],
      ['offline', 'You’re offline. Reconnect and try again.'],
    ]) {
      mode = state;
      await page.getByRole('button', { name: 'Retry scan' }).click();
      await page.getByRole('alert').getByText(message).waitFor({ timeout: 8000 }).catch(async error => {
        console.error('Actual alert:', await page.getByRole('alert').allTextContents());
        throw error;
      });
      await preview.waitFor();
      await capture(state);
    }
    assert.equal(scanCount, 4);
    assert.equal(wakeRequests, 1);
    await context.setOffline(false);
    await page.getByRole('link', { name: 'Set up the board manually' }).click();
    await page.getByRole('heading', { name: 'Set up the position' }).waitFor();
    await page.getByRole('button', { name: 'e1: empty' }).click();
    await page.getByLabel('Piece on e1').selectOption('wK');
    await page.getByRole('button', { name: 'e8: empty' }).click();
    await page.getByLabel('Piece on e8').selectOption('bK');
    await page.getByRole('button', { name: 'Use this position' }).click();
    await page.getByRole('button', { name: 'Start Stockfish analysis' }).waitFor({ timeout: 6000 }).catch(async error => {
      console.error('Manual board state:', await page.locator('body').innerText());
      throw error;
    });
    console.log(`PASS ${width}px walkthrough without backends, scanner recovery and manual setup`);
    await context.close();
  }
} finally {
  await browser.close();
  fixture.close();
}
