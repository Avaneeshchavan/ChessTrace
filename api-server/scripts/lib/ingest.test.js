const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, writeFile, rm } = require('node:fs/promises');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { streamGames, prepareGame } = require('./pgn');
const { openCheckpoint } = require('../ingest');

async function workspace(t) {
  const dir = await mkdtemp(join(tmpdir(), 'chesstrace-ingest-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

test('streams tagged PGNs, preserving multiline moves and skipping filtered games', async t => {
  const path = join(await workspace(t), 'input.pgn');
  await writeFile(path, [
    '\uFEFF[Event "First"]', '[WhiteElo "2500"]', '[BlackElo "2475"]', '[Result "1-0"]',
    '', '1. e4 e5 ; annotation', '', '2. Nf3 Nc6 1-0', '[Event "Second"]',
    '[WhiteElo "2300"]', '[BlackElo "2450"]', '[Result "1/2-1/2"]', '',
    '1. d4 d5 1/2-1/2',
  ].join('\r\n'));
  const games = [];
  for await (const g of streamGames(path)) games.push(g);
  assert.equal(games.length, 2);
  const prepared = prepareGame(games[0], { minElo: 2400, completedOnly: true });
  assert.equal(prepared.positions.length, 4);
  assert.equal(prepared.positions[3].halfMove, 4);
  assert.equal(JSON.parse(prepared.positions[0].vector).length, 32);
  assert.equal(prepareGame(games[1], { minElo: 2400 }), null);
  assert.throws(() => prepareGame({ headers: games[1].headers, body: ['1. e4 e5 2. Qa8'] }));
});

test('checkpoint reopens at the committed game and rejects a changed identity', async t => {
  const file = join(await workspace(t), 'resume.json');
  const checkpoint = await openCheckpoint(file, 'source-and-target');
  assert.equal(checkpoint.start, 0);
  await checkpoint.checkpoint(25);
  assert.equal((await openCheckpoint(file, 'source-and-target')).start, 25);
  await assert.rejects(openCheckpoint(file, 'other-source'), /does not match/);
});

test('accepts adjacent Lichess broadcast comments without losing their text', () => {
  const game = prepareGame({
    headers: { Result: '1-0' },
    body: ['1. e4 { [%eval 0.1] } { Strong start. } { [%clk 1:00:00] } e5 1-0'],
  });
  assert.equal(game.positions.length, 2);
  assert.match(game.pgn, /\{\s*\[%eval 0\.1\]\s+Strong start\.\s+\[%clk 1:00:00\]\s*\}/);
});

test('broadcast tags with escaped quotes remain replayable', () => {
  const game = prepareGame({
    headers: { Event: String.raw`Open \"Final\"`, Result: '1-0' },
    body: ['1. e4 e5 1-0'],
  });
  assert.equal(game.positions.length, 2);
  assert.match(game.pgn, /\[Event "Open ”Final”"\]/);
});
