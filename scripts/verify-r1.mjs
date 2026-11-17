import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { startMobileFixture } from './mobile-fixture.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || 'playwright');
const baseline = process.env.R1_BASELINE;
const output = process.env.R1_EVIDENCE || '/tmp/chesstrace-r1-evidence';
const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
const pgn = '1. e4 {Controls the center. [%eval 0.18] [%clk 1:30:42]} e5 2. Nf3 Nc6';
const matches = Array.from({ length: 8 }, (_, index) => ({
  id: String(index + 1), gameId: index + 1, halfMove: 1, nextMove: 'e5',
  game: { whiteName: 'White player ' + (index + 1), blackName: 'Black player ' + (index + 1),
    event: 'Synthetic fixture', result: '1-0', playedAt: '2026-01-01' },
}));
const board = 'rnbqkbnrpppppppp....................P...........PPPP.PPPRNBQKBNR';
const squares = [...board].map((piece, index) => ({
  square: 'abcdefgh'[index % 8] + (8 - Math.floor(index / 8)),
  piece: piece === '.' ? null : (piece === piece.toUpperCase() ? 'w' : 'b') + piece.toUpperCase(),
  needs_review: piece === 'P' && index === 36,
}));
const scanner = { fen, squares, orientation: 'white_bottom', theme_match_confidence: .85,
  warnings: ['Could not confidently locate the board via contour detection; using a centered square crop.'] };
const similar = matches.slice(0, 2).map(match => ({
  ...match, similarityLabel: 'Similar structure', sharedFeatures: ['The material balance by piece type matches'],
}));
await mkdir(output, { recursive: true });
const fixture = await startMobileFixture({ baseline });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
try {
  for (const [version, origin] of [['before', fixture.baselineOrigin], ['after', fixture.origin]]) {
    if (!origin) continue;
    for (const width of [390, 1280]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      const page = await context.newPage();
      let mode = 'exact';
      let finishSearch;
      await page.route('**/parse-screenshot', route => route.fulfill({ json: scanner }));
      await page.route('**/api/search/games/*', route => route.fulfill({ json: { pgn } }));
      await page.route(/\/api\/search\?/, async route => {
        if (mode === 'loading') await new Promise(resolve => { finishSearch = resolve; });
        if (mode === 'error') return route.fulfill({ status: 422, json: { error: 'Could not search this position.' } });
        const exact = mode === 'exact';
        await route.fulfill({ json: { matchType: exact ? 'exact' : 'similar', corpusGames: 777,
          matches: exact ? matches : mode === 'empty' ? [] : similar,
          matchingGameCount: exact ? 386 : 0, replayCount: exact ? 8 : similar.length } });
      });
      async function capture(state) {
        await page.evaluate(() => document.fonts.ready);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
        await page.screenshot({ path: `${output}/${version}-${width}-${state}.png`, fullPage: true });
      }
      await page.goto(origin + '/sample');
      const replay = page.getByRole('region', { name: 'Game replay' });
      await replay.waitFor();
      if (version === 'after') {
        await page.getByText('386 matching games · 8 replays available').waitFor();
        await page.getByText('Review needed · Check the crop').waitFor();
        await page.getByText(/You can confirm it against the example/).waitFor();
        assert.equal(await page.locator('.lens-match').count(), 5);
        await capture('sample-results-replay');
        await page.getByRole('button', { name: 'Show more' }).click();
        assert.equal(await page.locator('.lens-match').count(), 8);
        assert.equal(await page.locator('.lens-match[data-selected=true]').count(), 1);
        assert.equal(await page.getByText('[%eval', { exact: false }).count(), 0);
        await replay.getByText('Move details').click();
        await replay.getByText('1:30:42').waitFor();
        await capture('replay-details');
      }
      if (version === 'before') await capture('sample-results-replay');
      const search = page.getByRole('button', { name: 'Search this position' });
      mode = 'similar';
      await search.click();
      await page.getByText(/No exact match found/).waitFor();
      if (version === 'after') await page.getByText('Similar structure', { exact: true }).first().waitFor();
      await capture('similar');
      if (version === 'after') {
        mode = 'loading';
        await search.click();
        await page.getByText('Searching the game database.').waitFor();
        await capture('loading');
        mode = 'empty';
        finishSearch();
        await page.getByText(/No similar positions were available/).waitFor();
        await capture('empty');
        mode = 'error';
        await search.click();
        await page.getByRole('alert').getByText('Could not search this position.').waitFor();
        await capture('error');
      }
      await context.close();
      console.log(`PASS ${version} ${width}px`);
    }
  }
} finally {
  await browser.close();
  fixture.close();
}
