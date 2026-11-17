import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { startMobileFixture } from './mobile-fixture.mjs';

const require = createRequire(import.meta.url);
const { chromium, devices } = require(process.env.PLAYWRIGHT_PACKAGE || 'playwright');
const output = resolve(process.env.POLISH_EVIDENCE || '/tmp/chesstrace-m8-evidence');
const sampleCore = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq';
const puzzleFen = sampleCore + ' - 0 1';
const password = 'Synthetic-test-password';
const apiUrl = 'http://localhost:5001';

for (const variable of ['DATABASE_URL', 'DIRECT_URL']) {
  assert.equal(new URL(process.env[variable]).hostname, '127.0.0.1', 'Use a disposable local database');
}
const frontend = await startMobileFixture({ apiPort: 0, visionPort: 0, frontendPort: 5173 });
process.env.CORS_ORIGIN = frontend.origin;
process.env.JWT_SECRET = randomUUID();
process.env.USE_COMPACT_STORAGE = 'false';
const app = require('../api-server/src/index.js');
const prisma = require('../api-server/src/db.js');
const api = app.listen(5001, 'localhost');
const ready = new Promise((done, reject) => { api.once('listening', done); api.once('error', reject); });
let game;
let browser;
const users = [];

async function request(path, method, data, token) {
  return fetch(apiUrl + path, {
    method, headers: { 'Content-Type': 'application/json', ...(token && { Authorization: 'Bearer ' + token }) },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
}

async function setup() {
  const response = await request('/api/auth/register', 'POST', {
    email: 'polish-' + randomUUID() + '@example.test', displayName: 'Study tester', password,
  });
  assert.equal(response.status, 201);
  const user = await response.json();
  users.push(user.user.id);
  const saved = await request('/api/vault', 'POST', { fen: puzzleFen, solutionPgn: '1... e5', tags: ['Opening'] }, user.token);
  assert.equal(saved.status, 201);
  const { puzzle } = await saved.json();
  const attempt = await request('/api/vault/' + puzzle.id + '/attempts', 'POST', {
    attemptId: randomUUID(), moveUci: 'e7e5', usedHint: false, evalLoss: 0, millis: 100,
  }, user.token);
  assert.equal(attempt.status, 201);
  const review = await request('/api/vault/' + puzzle.id + '/review', 'POST', { quality: 4 }, user.token);
  assert.equal(review.status, 200);
  return user;
}

try {
  await ready;
  assert.equal(await prisma.game.count(), 0, 'Use an empty corpus');
  game = await prisma.game.create({ data: {
    whiteName: 'Sample White', blackName: 'Sample Black', result: '1-0',
    pgn: '1. e4 e5 2. Nf3 Nc6 1-0', positions: { create: { fenCore: sampleCore, halfMove: 1 } },
  } });
  await mkdir(output, { recursive: true });
  assert.equal((await request('/api/users/me', 'DELETE', { password })).status, 401);
  const unmatched = await request('/api/search?includeCorpusCount=1&fen=' + encodeURIComponent('4k3/8/8/8/8/8/8/4K3 w -'), 'GET');
  assert.equal(unmatched.status, 200);
  const empty = await unmatched.json();
  assert.deepEqual(empty.matches, []);
  assert.equal(empty.corpusGames, 1);

  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
  for (const width of [390, 1280]) {
    const context = await browser.newContext({
      ...(width === 390 ? devices['Pixel 7'] : {}),
      viewport: { width, height: width === 390 ? 844 : 900 }, reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    const capture = async name => {
      await page.evaluate(async () => { await document.fonts.ready; window.scrollTo(0, 0); });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 0);
      await page.screenshot({ path: resolve(output, width + '-' + name + '.png'), fullPage: name !== 'delete-dialog', scale: 'css' });
    };
    await page.goto(frontend.origin);
    await page.getByRole('heading', { name: /Every position/ }).waitFor();
    await capture('landing');
    await page.screenshot({ path: resolve(output, width + '-landing-crop.png'), scale: 'css' });
    await page.getByRole('link', { name: 'Trace a sample board' }).click();
    const replay = page.getByRole('region', { name: 'Game replay' });
    await replay.getByText('1. e4').waitFor();
    await page.getByText('Piece placement matches the example.', { exact: false }).waitFor();
    assert.equal(await page.evaluate(() => localStorage.getItem('token')), null);
    await capture('guided-sample');
    const a8 = page.getByRole('button', { name: /^a8: Black rook/ });
    await a8.focus();
    await page.keyboard.press('ArrowRight');
    const b8 = page.getByRole('button', { name: /^b8: Black knight/ });
    assert.equal(await b8.evaluate(el => el === document.activeElement), true);
    await page.getByLabel(/Side to move/).selectOption('w');
    await page.getByRole('button', { name: 'Search this position' }).click();
    await page.getByText('No exact match found in 1 game.', { exact: false }).waitFor();
    await capture('empty-search');

    for (const [route, title] of [['about', 'About and credits'], ['privacy', 'Privacy']]) {
      await page.goto(frontend.origin + '/' + route);
      await page.getByRole('heading', { name: title, exact: true }).waitFor();
      await capture(route);
    }

    const session = await setup();
    await context.addInitScript(({ token, user }) => {
      if (!sessionStorage.getItem('polish-session-set')) {
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(user));
        sessionStorage.setItem('polish-session-set', 'yes');
      }
    }, session);
    await page.goto(frontend.origin + '/sandbox');
    const board = page.getByRole('group', { name: 'Interactive chessboard, white at bottom' });
    await board.focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');
    await page.getByText('e4', { exact: true }).waitFor();
    await capture('keyboard-board');
    await page.goto(frontend.origin + '/settings');
    await page.getByRole('heading', { name: 'Settings', exact: true }).waitFor();
    await capture('settings');
    await page.getByRole('button', { name: 'Delete account', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Confirm account deletion' });
    await dialog.getByLabel('Current password').fill('incorrect');
    await dialog.getByRole('button', { name: 'Permanently delete account' }).click();
    await dialog.getByRole('alert').getByText('Current password is incorrect.').waitFor();
    assert.equal(await prisma.user.count({ where: { id: session.user.id } }), 1);
    await page.keyboard.press('Escape');
    assert.equal(await dialog.isVisible(), false);
    assert.equal(await page.getByRole('button', { name: 'Delete account', exact: true }).evaluate(el => el === document.activeElement), true);
    await page.getByRole('button', { name: 'Delete account', exact: true }).click();
    await capture('delete-dialog');
    await dialog.getByLabel('Current password').fill(password);
    const deletion = page.waitForResponse(response => response.request().method() === 'DELETE' && response.url().endsWith('/api/users/me'));
    await dialog.getByRole('button', { name: 'Permanently delete account' }).click();
    const response = await deletion;
    assert.equal(response.status(), 204, 'Delete response: ' + response.status());
    await page.getByText('Your account was deleted.').waitFor({ timeout: 8_000 }).catch(async error => {
      throw new Error('Deletion did not confirm at ' + new URL(page.url()).pathname + ': ' + (await page.locator('main').innerText()).slice(-400), { cause: error });
    });
    await capture('account-deleted');
    assert.equal(await page.evaluate(() => localStorage.getItem('token')), null);
    const where = { userId: session.user.id };
    assert.equal(await prisma.user.count({ where: { id: session.user.id } }), 0);
    assert.equal(await prisma.savedPuzzle.count({ where }), 0);
    assert.equal(await prisma.attempt.count({ where }), 0);
    assert.equal(await prisma.activityLog.count({ where }), 0);
    const signIn = await request('/api/auth/login', 'POST', { password, email: session.user.email });
    assert.equal(signIn.status, 401);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await context.setOffline(true);
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.overrideNetworkState', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
    await page.goto(frontend.origin + '/sample');
    await page.getByText('Reconnect to scan a screenshot and search the corpus.').waitFor();
    await capture('offline-sample');
    await context.close();
  }
  console.log('Product polish passed on 390px and 1280px with a real scanner, API, and local database.');
} finally {
  await browser?.close();
  await prisma.activityLog.deleteMany({ where: { userId: { in: users } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  if (game) await prisma.game.delete({ where: { id: game.id } });
  await prisma.$disconnect();
  api.close();
  frontend.close();
}
