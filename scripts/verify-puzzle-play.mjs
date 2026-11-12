import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { startMobileFixture } from './mobile-fixture.mjs';

const require = createRequire(import.meta.url);
const { chromium, devices } = require(process.env.PLAYWRIGHT_PACKAGE || 'playwright');
for (const variable of ['DATABASE_URL', 'DIRECT_URL']) {
  assert.equal(new URL(process.env[variable]).hostname, '127.0.0.1', 'Use a disposable database on loopback');
}
const apiOrigin = 'http://localhost:5001';
const output = resolve(process.env.PUZZLE_EVIDENCE || '/tmp/chesstrace-m6-evidence');
const frontend = await startMobileFixture({ apiPort: 0, visionPort: 0 });
process.env.CORS_ORIGIN = frontend.origin;
process.env.JWT_SECRET = randomUUID();
const app = require('../api-server/src/index.js');
const prisma = require('../api-server/src/db.js');
const api = app.listen(5001, 'localhost');
const apiReady = new Promise((resolve, reject) => { api.once('listening', resolve); api.once('error', reject); });
const results = [];
const users = [];

async function request(path, body, token) {
  const response = await fetch(apiOrigin + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: 'Bearer ' + token }) },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  assert.ok(response.ok, path + ' returned ' + response.status + ' ' + JSON.stringify(data));
  return data;
}

async function setupUser() {
  const account = await request('/api/auth/register', {
    email: 'puzzle-' + randomUUID() + '@example.test', password: randomUUID(), displayName: 'Puzzle tester',
  });
  users.push(account.user.id);
  for (const [fen, solutionPgn, motif, mateIn] of [
    ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', '1. e4', 'Fork', null],
    ['4k3/P7/8/8/8/8/8/4K3 w - - 0 1', '1. a8=N', 'Promotion', null],
    ['rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2', '2... Qh4#', 'Back Rank', 1],
    ['4k3/8/8/8/8/8/8/4K2R w K - 0 12', '12. O-O', 'Castling', null],
    ['4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1', '1. exd6', 'En passant', null],
    ['4k3/8/8/8/8/8/8/4K3 w - - 0 1', null, 'Legacy', null],
  ]) {
    await request('/api/vault', { fen, solutionPgn, tags: [motif], mateIn }, account.token);
  }
  return account;
}

async function playMove(page, from, to, mobile, orientation = 'white') {
  const board = page.locator('cg-board');
  await board.scrollIntoViewIfNeeded();
  const tap = async square => {
    const bounds = await board.boundingBox();
    let column = square.charCodeAt(0) - 97;
    let row = 8 - Number(square[1]);
    if (orientation === 'black') { column = 7 - column; row = 7 - row; }
    const x = bounds.x + (column + .5) * bounds.width / 8;
    const y = bounds.y + (row + .5) * bounds.height / 8;
    await (mobile ? page.touchscreen.tap(x, y) : page.mouse.click(x, y));
  };
  await tap(from);
  await board.locator('square.selected').waitFor();
  await tap(to);
}

async function run(browser, width) {
  const mobile = width === 390;
  const { token, user } = await setupUser();
  const context = await browser.newContext({
    ...(mobile ? devices['Pixel 7'] : {}),
    viewport: { width, height: mobile ? 844 : 900 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await context.addInitScript(({ token, user }) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
  }, { token, user });
  const capture = async name => {
    await page.screenshot({ path: resolve(output, width + '-' + name + '.jpg'), fullPage: true, scale: 'css', type: 'jpeg', quality: 82 });
  };

  try {
    await page.goto(frontend.origin + '/vault/review');
    await page.getByRole('heading', { name: 'Play the turning point' }).waitFor();
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await page.getByRole('button', { name: 'Hint: show piece' }).click();
    await page.locator('square.ct-hint-piece').waitFor();
    assert.equal(await page.locator('square.ct-hint-destination').count(), 0);
    await page.getByRole('button', { name: 'Hint: show destination' }).click();
    await page.locator('square.ct-hint-destination').waitFor();
    await capture('hints');

    let retried = false;
    if (mobile) {
      await page.route('**/api/vault/*/attempts', async route => {
        const original = await route.fetch();
        assert.equal(original.status(), 201);
        retried = true;
        await route.abort('failed');
      }, { times: 1 });
    }
    await playMove(page, 'd2', 'd4', mobile);
    if (mobile) await page.getByRole('button', { name: 'Retry move' }).click();
    await page.getByText('d4 is different, but also strong.').waitFor({ timeout: 30_000 });
    await page.waitForFunction(async () => !!await caches.match('/stockfish/stockfish.wasm'));
    if (mobile) assert.equal(retried, true);
    assert.equal(await page.getByRole('button', { name: 'Retry move' }).count(), 0);
    assert.equal(await page.getByText(/Suggested rating: Hard/).isVisible(), true);
    await capture('alternate-move');
    await page.getByRole('button', { name: 'Easy' }).click();

    await page.getByText('Review 2 of 6').waitFor();
    await playMove(page, 'a7', 'a8', mobile);
    await page.getByRole('button', { name: 'Knight', exact: true }).waitFor();
    await capture('promotion');
    await page.getByRole('button', { name: 'Cancel promotion' }).click();
    await playMove(page, 'a7', 'a8', mobile);
    await page.getByRole('button', { name: 'Knight', exact: true }).click();
    await page.getByText('a8=N is the saved solution.').waitFor();
    await page.getByText(/Suggested rating: Good/).waitFor();
    await page.getByRole('button', { name: 'Good' }).click();

    await page.getByText('Black to move · Mate in 1').waitFor();
    await playMove(page, 'b8', 'c6', mobile, 'black');
    await page.getByText(/falls short of the saved solution/).waitFor();
    await page.getByText(/Suggested rating: Again/).waitFor();
    await page.getByRole('button', { name: 'Reveal Answer' }).click();
    await page.getByText('Qh4#', { exact: true }).waitFor();
    await capture('mate-reveal');
    await page.getByRole('button', { name: 'Again' }).click();

    await page.getByText('Review 4 of 6').waitFor();
    await playMove(page, 'e1', 'g1', mobile);
    await page.getByText('O-O is the saved solution.').waitFor();
    await page.getByRole('button', { name: 'Good' }).click();

    await page.getByText('Review 5 of 6').waitFor();
    await playMove(page, 'e5', 'd6', mobile);
    await page.getByText('exd6 is the saved solution.').waitFor();
    await page.getByRole('button', { name: 'Good' }).click();

    await page.getByText('Review 6 of 6').waitFor();
    await page.getByRole('button', { name: 'Reveal Answer' }).click();
    await page.getByText('No engine solution was saved for this puzzle.').waitFor();
    await page.getByRole('button', { name: 'Good' }).click();
    await page.getByText("You're all caught up!").waitFor();

    await page.getByRole('link', { name: 'Back to Vault' }).click();
    for (const name of ['Move-based solve rate by motif', 'Self-rated solve rate by motif']) {
      await page.getByRole('region', { name }).getByRole('combobox').selectOption('Fork');
    }
    await capture('vault-stats');
    const sizes = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    assert.equal(sizes[0], sizes[1], 'Vault overflows the viewport');

    const attempts = await prisma.attempt.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'asc' } });
    const alternate = attempts[0];
    assert.equal(attempts.length, 5);
    assert.deepEqual(attempts.map(({ moveUci, correct, usedHint }) => [moveUci, correct, usedHint]),
      [['d2d4', true, true], ['a7a8n', true, false], ['b8c6', false, false], ['e1g1', true, false], ['e5d6', true, false]]);
    assert.ok(alternate.evalLoss >= 0 && alternate.evalLoss <= 50);
    const stats = await request('/api/vault/review-stats', undefined, token);
    assert.equal(stats.attemptWeeks.find(row => row.motif === 'Fork').solved, 1);
    assert.equal(stats.attemptWeeks.find(row => row.motif === 'Fork').attempts, 1);
    assert.equal(stats.weeks.find(row => row.motif === 'Fork').solved, 1);
    const rating = await prisma.activityLog.findFirst({ where: { userId: user.id, type: 'PUZZLE_REVIEWED', refId: alternate.puzzleId } });
    assert.equal(rating.metadata.quality, 5);
    assert.deepEqual(errors, []);
    results.push({
      viewport: width, alternateMove: alternate.moveUci, savedMove: 'e2e4', centipawnLoss: alternate.evalLoss,
      correct: alternate.correct, usedHint: alternate.usedHint, suggestedRating: 'Hard', chosenRating: 'Easy',
      attemptsRecorded: attempts.length, interruptedWriteRetried: retried,
    });
    console.log('Verified puzzle attempts at ' + width + 'px with ' + alternate.evalLoss + ' cp loss for d4.');
  } finally {
    await context.close();
  }
}

let browser;
try {
  await mkdir(output, { recursive: true });
  await apiReady;
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
  for (const width of [390, 1280]) await run(browser, width);
  await writeFile(resolve(output, 'recorded-attempts.json'), JSON.stringify(results, null, 2) + '\n');
} finally {
  await browser?.close();
  if (users.length) {
    const where = { userId: { in: users } };
    await prisma.activityLog.deleteMany({ where });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  }
  await prisma.$disconnect();
  api.close();
  frontend.close();
}
