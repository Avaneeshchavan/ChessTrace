import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { startMobileFixture, pgn, user } from './mobile-fixture.mjs';

const require = createRequire(import.meta.url);
const { chromium, webkit, devices } = require(process.env.PLAYWRIGHT_PACKAGE || 'playwright');
const directory = resolve(process.env.MOBILE_EVIDENCE || '/tmp/chesstrace-m5-evidence');
const fixture = await startMobileFixture({ baseline: process.env.MOBILE_BASELINE });
const image = resolve('vision-engine/examples/synthetic_chesscom_neo.png');
const routes = ['/', '/auth', '/auth?mode=register', '/dashboard', '/lens', '/sandbox', '/turning-points', '/vault', '/vault/review', '/settings'];
const profiles = [['Pixel 7', chromium], ['iPhone 14', process.env.MOBILE_WEBKIT ? webkit : chromium]];
const results = [];

async function signIn(context) {
  await context.addInitScript(account => {
    localStorage.setItem('token', 'mobile-fixture');
    localStorage.setItem('user', JSON.stringify(account));
  }, user);
}

async function verifyLayout(page, path) {
  if (path === '/vault/review') await page.getByRole('button', { name: 'Reveal Answer' }).waitFor();
  else await page.getByRole('heading', { level: 1 }).first().waitFor();
  if (path === '/dashboard') await page.getByText('No activity yet.').waitFor();
  if (path === '/vault') await page.getByRole('link', { name: /start review/i }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const visible = el => !!el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
    const controls = [...document.querySelectorAll('button,summary,input:not([type=hidden]),select')].filter(visible);
    const undersized = controls.filter(el => {
      const target = el.matches('[type=checkbox],[type=radio]') ? el.labels?.[0] ?? el : el;
      const { height, width } = target.getBoundingClientRect();
      return height < 43.5 || width < 43.5;
    }).map(el => (el.getAttribute('aria-label') || el.textContent.trim() || el.id || el.type).slice(0, 75));
    const smallText = [...document.querySelectorAll('main *, .study-tabs > *')].filter(el =>
      visible(el) && !el.closest('svg, cg-board') && [...el.childNodes].some(node => node.nodeType === 3 && node.textContent.trim()) &&
      Number.parseFloat(getComputedStyle(el).fontSize) < 12
    ).map(el => el.textContent.trim().slice(0, 60));
    const boards = [...document.querySelectorAll('.ct-board-surface')].filter(visible).map(el => el.getBoundingClientRect());
    return {
      overflow: document.documentElement.scrollWidth - width,
      boardsOutside: boards.filter(board => board.left < -1 || board.right > width + 1).length,
      undersized: [...new Set(undersized)],
      smallText: [...new Set(smallText)],
    };
  });
}

function routeName(path) {
  return path === '/' ? 'landing' : path.slice(1).replace('?mode=', '-').replace('/', '-');
}

async function captureState(page, name) {
  const viewport = page.viewportSize();
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: width === 1280 ? 900 : 844 });
    await page.screenshot({ path: resolve(directory, 'after-' + width + '-' + name + '.jpg'), type: 'jpeg', quality: 80 });
  }
  await page.setViewportSize(viewport);
}

async function captureLayout(browser) {
  for (const [phase, origin] of [['before', fixture.baselineOrigin], ['after', fixture.origin]]) {
    if (!origin) continue;
    const context = await browser.newContext({ serviceWorkers: 'block' });
    await signIn(context);
    const page = await context.newPage();
    for (const width of phase === 'before' ? [390, 1280] : [360, 390, 412, 768, 1280]) {
      await page.setViewportSize({ width, height: width === 1280 ? 900 : 844 });
      for (const path of phase === 'before' ? routes : [...routes, '/offline']) {
        await page.goto(origin + path);
        const result = await verifyLayout(page, path).catch(async error => {
          const text = await page.locator('body').innerText().catch(() => '');
          throw new Error(phase + ' ' + width + ' ' + path + ' did not settle. ' + text.slice(0, 600), { cause: error });
        });
        results.push({ phase, width, path, ...result });
        if ([390, 1280].includes(width)) {
          const capture = name => page.screenshot({
            path: resolve(directory, phase + '-' + width + '-' + name + '.jpg'), type: 'jpeg', quality: 80, fullPage: true,
          });
          await capture(routeName(path));
          if (path === '/lens') {
            await page.getByLabel('Board screenshot').setInputFiles(image);
            await page.getByRole('button', { name: 'Review next square' }).waitFor();
            await capture('lens-review');
            if (phase === 'after' && width === 390) {
              await page.getByRole('button', { name: 'More', exact: true }).click();
              await capture('navigation-sheet');
            }
          }
        }
      }
    }
    await context.close();
  }
}

async function exerciseFlow(browser, device) {
  const context = await browser.newContext({ ...devices[device] });
  const page = await context.newPage();
  await signIn(context);
  try {
    await page.goto(fixture.origin + '/lens');
    await page.getByLabel('Board screenshot').setInputFiles(image);
    await page.getByRole('button', { name: 'Review next square' }).tap();
    await page.getByRole('button', { name: 'Confirm square' }).tap();
    await page.getByText('No squares left to review').waitFor();
    await page.getByRole('button', { name: 'Search this position' }).tap();
    await page.getByRole('button', { name: 'Replay', exact: true }).tap();
    await page.getByRole('button', { name: 'Next move' }).tap();
    await page.getByText('e5 · 2/4', { exact: true }).waitFor();

    const nav = page.getByRole('navigation', { name: 'Mobile study navigation' });
    await nav.getByRole('button', { name: 'More' }).tap();
    await page.getByRole('dialog').getByRole('link', { name: 'Turning Points' }).tap();
    await page.getByLabel('Game link or PGN').fill(pgn);
    await page.getByLabel('Engine depth').fill('4');
    await page.getByRole('button', { name: 'Analyze', exact: true }).tap();
    await page.getByRole('button', { name: 'Save to Vault' }).first().tap({ timeout: 35_000 });
    await page.getByRole('button', { name: 'Saved', exact: true }).waitFor();
    assert.ok(fixture.requests.some(req => req.method === 'POST' && req.path === '/api/vault'));

    await nav.getByRole('link', { name: 'Vault' }).tap();
    await page.getByRole('link', { name: /start review/i }).tap();
    await page.getByRole('button', { name: 'Reveal Answer' }).tap();
    await page.getByRole('button', { name: 'Good' }).tap();
    await page.getByText("You're all caught up!").waitFor();
    assert.equal(JSON.parse(fixture.requests.findLast(req => req.path.endsWith('/review')).body).quality, 4);
    console.log(device + ' passed screenshot upload, guided review, search, replay, Stockfish extraction, puzzle save and rating.');
  } finally {
    await context.close();
  }
}

async function verifyOffline(browser) {
  const context = await browser.newContext({ ...devices['Pixel 7'] });
  await signIn(context);
  const page = await context.newPage();
  const engineRequests = [];
  context.on('request', request => {
    if (new URL(request.url()).pathname.startsWith('/stockfish/')) engineRequests.push(request.url());
  });
  await page.goto(fixture.origin + '/sandbox');
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  assert.equal(engineRequests.length, 0, 'Stockfish loaded before analysis was enabled');
  const board = page.locator('cg-board');
  const { x, y, width, height } = await board.boundingBox();
  await page.touchscreen.tap(x + 4.5 * width / 8, y + 6.5 * height / 8);
  await board.locator('square.selected').waitFor({ timeout: 4000 });
  await page.touchscreen.tap(x + 4.5 * width / 8, y + 4.5 * height / 8);
  await page.getByText('e4', { exact: true }).waitFor();
  const cdp = await context.newCDPSession(page);
  const point = (column, row) => ({ x: x + column * width / 8, y: y + row * height / 8 });
  const scrollBefore = await page.evaluate(() => window.scrollY);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(4.5, 1.5)] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point(4.5, 2.5)] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point(4.5, 3.5)] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.getByText('e5', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.scrollY), scrollBefore, 'Touch drag scrolled the page');
  await page.getByRole('button', { name: 'Start Stockfish analysis' }).tap();
  await page.waitForFunction(() => document.querySelector('.engine-panel')?.innerText.includes('14 / 14'));
  assert.ok(engineRequests.some(url => url.endsWith('/stockfish.wasm.js')), 'Expected the Stockfish worker request');

  await page.evaluate(async () => {
    await fetch('/api/dashboard/summary');
    const keys = await caches.keys();
    const all = (await Promise.all(keys.map(async key => (await caches.open(key)).keys()))).flat();
    if (all.some(request => new URL(request.url).pathname.startsWith('/api/'))) throw new Error('An API response entered the offline cache.');
    const paths = new Set(all.map(request => new URL(request.url).pathname));
    for (const path of ['/stockfish/stockfish.wasm.js', '/stockfish/stockfish.wasm']) {
      if (!paths.has(path)) throw new Error('Stockfish asset was not cached: ' + path);
    }
  });

  await page.goto(fixture.origin + '/lens');
  const before = fixture.requests.filter(req => req.path === '/parse-screenshot').length;
  await page.evaluate(() => {
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = '/share-image';
    form.enctype = 'multipart/form-data';
    form.innerHTML = '<input type="file" name="image">';
    document.body.append(form);
  });
  await page.locator('form[action="/share-image"] input').setInputFiles(image);
  await page.evaluate(() => document.querySelector('form[action="/share-image"]').submit());
  await page.getByRole('button', { name: 'Review next square' }).waitFor();
  assert.equal(fixture.requests.filter(req => req.path === '/parse-screenshot').length, before + 1);
  assert.ok(!fixture.requests.some(req => req.path === '/share-image'), 'Share should be intercepted locally');
  assert.equal(new URL(page.url()).search, '');

  fixture.updateWorker();
  await page.evaluate(async () => (await navigator.serviceWorker.ready).update());
  const update = page.getByRole('button', { name: 'Reload app' });
  await update.waitFor();
  await captureState(page, 'app-update');
  await Promise.all([page.waitForEvent('load'), update.tap()]);
  await page.waitForFunction(async () => (await caches.keys()).includes('chesstrace-app-fixture-update'));

  await context.setOffline(true);
  await cdp.send('Network.overrideNetworkState', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  await page.goto(fixture.origin);
  await page.getByRole('link', { name: 'Open offline tools' }).tap();
  await page.getByRole('link', { name: 'Open Sandbox' }).tap();
  await page.getByRole('button', { name: 'Start Stockfish analysis' }).tap();
  await page.waitForFunction(() => document.querySelector('.engine-panel')?.innerText.includes('14 / 14'));
  await page.getByText('Suggested continuation').scrollIntoViewIfNeeded();
  await captureState(page, 'sandbox-offline-analysis');
  await page.waitForFunction(() => !navigator.onLine);
  assert.equal(await page.getByRole('button', { name: 'Find matching games' }).isDisabled(), true);
  assert.equal(await page.evaluate(async () => {
    try { await fetch('/api/dashboard/summary', { cache: 'no-store' }); return true; }
    catch { return false; }
  }), false, 'The offline test could still reach the API');
  console.log('Pixel 7 passed lazy Stockfish load, tap-to-move, touch drag, local share handoff, app update and offline Stockfish after reload.');
  await context.close();
}

await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
try {
  if (!process.env.SKIP_LAYOUT) await captureLayout(browser);
  if (results.length) await writeFile(resolve(directory, 'layout.json'), JSON.stringify(results, null, 2) + '\n');
  if (!process.env.ONLY_LAYOUT && !process.env.ONLY_OFFLINE) {
    for (const [device, type] of profiles) {
      const engine = type === chromium ? browser : await type.launch();
      try { await exerciseFlow(engine, device); }
      finally { if (engine !== browser) await engine.close(); }
    }
  }
  if (!process.env.ONLY_LAYOUT) await verifyOffline(browser);
  const after = results.filter(row => row.phase === 'after');
  assert.equal(after.filter(row => row.overflow > 0 || row.boardsOutside > 0).length, 0, 'Check layout.json for overflowing routes');
  assert.equal(after.filter(row => row.undersized.length || row.smallText.length).length, 0, 'Check layout.json for undersized controls or text');
  console.log('Mobile evidence saved to ' + directory);
} finally {
  await browser.close();
  fixture.close();
}
