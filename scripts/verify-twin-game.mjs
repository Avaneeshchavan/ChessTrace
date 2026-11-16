import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { startMobileFixture } from './mobile-fixture.mjs';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('../api-server/node_modules/@prisma/client');
const { analyzeTwinGame, parseTwinGame } = require('../api-server/src/twin-game');
const { fenCore, positionKey } = require('../api-server/src/compact-position');
const { chromium, devices } = require(process.env.PLAYWRIGHT_PACKAGE || 'playwright');
const output = resolve(process.env.TWIN_EVIDENCE || '/tmp/chesstrace-m7-evidence');
for (const variable of ['DATABASE_URL', 'DIRECT_URL']) {
  assert.equal(new URL(process.env[variable]).hostname, '127.0.0.1', 'Use a disposable local database');
}
const prisma = new PrismaClient();
const ruy = '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6';
const transposed = '1. Nf3 d5 2. d4 Nf6 3. h3';
const games = [
  [ruy + ' 4. Ba4 Nf6 1-0', '1-0'],
  [ruy + ' 4. Ba4 d6 0-1', '0-1'],
  [ruy + ' 4. Bc4 Nf6 1/2-1/2', '1/2-1/2'],
  [ruy + ' 4. Bxc6 dxc6 1-0', '1-0'],
  ['1. d4 Nf6 2. Nf3 d5 3. e3 1-0', '1-0'],
  ['1. d4 Nf6 2. Nf3 d5 3. c4 0-1', '0-1'],
  ['1. d4 Nf6 2. Nf3 d5 3. g3 1/2-1/2', '1/2-1/2'],
];
const checks = [
  ['Ruy Lopez departure', ruy + ' 4. Bxc6', 6, 4],
  ['Departure on move three', '1. e4 e5 2. Nf3 Nc6 3. h3', 4, 4],
  ['Stayed to the end', ruy, 6, 4],
  ['Reached by transposition', transposed, 4, 3],
  ['Departure at the first move', '1. a3', 0, null],
];
const gameIds = [];
let fixture, server, browser;
try {
  assert.equal(await prisma.game.count(), 0, 'Use an empty, disposable corpus');
  for (const [index, [pgn, result]] of games.entries()) {
    const { id } = await prisma.game.create({ data: { pgn, result, whiteName: 'Fixture White ' + index, blackName: 'Fixture Black',
      whiteElo: 2600 - index, blackElo: 2600 } });
    gameIds.push(id);
    await prisma.compactGame.create({ data: { gameId: id, pgnHash: Buffer.from([index]) } });
    for (const [i, move] of parseTwinGame(pgn).entries()) {
      const core = fenCore(move.after);
      const key = positionKey(core);
      await prisma.position.create({ data: { gameId: id, halfMove: i + 1, fenCore: core } });
      await prisma.compactPosition.upsert({
        where: { key }, create: { key, fenCore: core, gamesCount: 1 }, update: { gamesCount: { increment: 1 } },
      });
      await prisma.positionGame.create({ data: { key, gameId: id, ply: i + 1 } });
    }
  }

  const testResults = [];
  for (const compact of [false, true]) {
    for (const [name, pgn, departure, anchorGames] of checks) {
      const result = await analyzeTwinGame(prisma, parseTwinGame(pgn), { compact });
      assert.equal(result.departurePly, departure, name);
      assert.equal(result.anchorGames, anchorGames, name);
      assert.equal(result.corpusGames, games.length);
      assert.equal(result.timeline.length, parseTwinGame(pgn).length);
      if (name === 'Ruy Lopez departure') {
        assert.equal(result.twin.gameId, gameIds[3], 'Twin follows the game beyond the theory threshold');
        assert.deepEqual(result.variations.find(move => move.san === 'Ba4'),
          { san: 'Ba4', lan: 'b5a4', games: 2, whiteWins: 1, draws: 0, blackWins: 1, other: 0 });
      }
      if (name === 'Reached by transposition') assert.equal(result.twin.transposed, true);
      if (departure === 0) assert.equal(result.twin.halfMove, 0);
      testResults.push({ name, compact, departure });
    }
  }
  await prisma.positionGame.delete({ where: { key_gameId: { key: positionKey(parseTwinGame(ruy).at(-1).after), gameId: gameIds[0] } } });
  const capped = await analyzeTwinGame(prisma, parseTwinGame(ruy), { compact: true });
  assert.equal(capped.timeline.at(-1).games, 4);
  assert.equal(capped.replaySample, 3);

  await mkdir(output, { recursive: true });
  fixture = await startMobileFixture({ apiPort: 0, visionPort: 0 });
  process.env.CORS_ORIGIN = fixture.origin;
  process.env.JWT_SECRET = 'twin-game-fixture';
  const app = require('../api-server/src/index.js');
  server = app.listen(5001, 'localhost');
  await new Promise((done, reject) => { server.once('listening', done); server.once('error', reject); });
  const api = 'http://localhost:5001';
  const unauthorized = await fetch(api + '/api/search/twin', { method: 'POST' });
  assert.equal(unauthorized.status, 401);
  const jwt = require('../api-server/node_modules/jsonwebtoken');
  const token = jwt.sign({ id: 'twin-test-user' }, process.env.JWT_SECRET);
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
  for (const width of [390, 1280]) {
    const context = await browser.newContext({
      ...(width === 390 ? devices['Pixel 7'] : {}), viewport: { width, height: width === 390 ? 844 : 900 },
    });
    await context.addInitScript(session => {
      localStorage.setItem('token', session);
      localStorage.setItem('user', JSON.stringify({ id: 'twin-test-user' }));
    }, token);
    const page = await context.newPage();
    const capture = async name => {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: resolve(output, width + '-' + name + '.jpg'), fullPage: true,
        scale: 'css', type: 'jpeg', quality: 82 });
    };
    await page.goto(fixture.origin + '/dashboard');
    if (width === 390) await page.getByRole('button', { name: 'More' }).click();
    await page.getByRole('link', { name: 'Twin Game' }).waitFor();
    await capture('navigation');
    const nav = width === 390 ? page.getByRole('navigation', { name: 'More study pages' })
      : page.getByRole('navigation', { name: 'Study navigation' });
    await nav.getByRole('link', { name: 'Turning Points', exact: true }).click();
    await page.getByRole('heading', { name: 'Turning Points' }).waitFor();
    await capture('turning-points-import');
    if (width === 390) await page.getByRole('button', { name: 'More' }).click();
    await page.getByRole('link', { name: 'Twin Game' }).click();
    await page.getByRole('heading', { name: 'Twin Game' }).waitFor();
    const input = page.getByLabel('Game link or PGN');
    const submit = page.getByRole('button', { name: 'Find my twin game' });
    await input.fill('1. ILLEGAL');
    await submit.click();
    await page.getByRole('alert').getByText(/PGN could not be read/).waitFor();
    await input.fill(ruy + ' 4. Bxc6');
    await submit.click();
    await page.getByRole('heading', { name: 'You left the indexed line at 4. Bxc6' }).waitFor();
    await page.getByText('Based on 7 corpus games.', { exact: false }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 0);
    await capture('departure');
    await input.fill(transposed);
    await submit.click();
    await page.getByText('The shared position was reached by a different move order.').waitFor();
    await page.getByRole('button', { name: 'Replay twin from the departure' }).click();
    await page.getByRole('region', { name: 'Game replay' }).waitFor();
    await page.getByRole('button', { name: 'Next move' }).click();
    await page.getByText('e3 · 5/5', { exact: true }).waitFor();
    await capture('transposed-replay');
    await input.fill('1. a3');
    await submit.click();
    await page.getByRole('button', { name: 'Replay twin from the departure' }).click();
    await page.getByText('Start · 0/8', { exact: true }).waitFor();
    for (const provider of [
      { url: 'https://lichess.org/diwRghmF', username: '', month: '' },
      { url: 'https://www.chess.com/game/live/123456', username: 'fixture-player', month: '2026-01' },
    ]) {
      const imported = page.waitForRequest('**/api/games/fetch');
      await page.route('**/api/games/fetch', route => route.fulfill({ json: { pgn: ruy } }), { times: 1 });
      await input.fill(provider.url);
      if (provider.username) {
        await page.getByLabel(/Chess.com username/).fill(provider.username);
        await page.getByLabel(/Month the game ended/).fill(provider.month);
      }
      await submit.click();
      assert.deepEqual((await imported).postDataJSON(), provider);
      await page.getByRole('heading', { name: 'This game stayed in the indexed line' }).waitFor();
    }
    await context.close();
  }
  await writeFile(resolve(output, 'checks.json'), JSON.stringify(testResults, null, 2) + '\n');
  console.log('Twin Game passed five scenarios in both layouts and Playwright at 390px and 1280px.');
} finally {
  await browser?.close();
  server?.close();
  fixture?.close();
  if (server) await require('../api-server/src/db.js').$disconnect();
  if (gameIds.length) {
    const where = { gameId: { in: gameIds } };
    await prisma.positionGame.deleteMany({ where });
    await prisma.compactGame.deleteMany({ where });
    await prisma.compactPosition.deleteMany();
    await prisma.game.deleteMany({ where: { id: { in: gameIds } } });
  }
  await prisma.$disconnect();
}
