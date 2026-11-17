const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Chess } = require('chess.js');
const { positionKey, fenCore, verifiesPosition } = require('./compact-position');
const { scratchUrl } = require('../scripts/lib/compact-scratch');

test('compact key is a stable signed 64-bit hash of the first three FEN fields', () => {
  const game = new Chess();
  const start = game.fen();
  assert.equal(positionKey(start), 1336532877713073088n);
  assert.equal(positionKey(fenCore(start) + ' - 13 42'), positionKey(start));
  game.move('e4');
  assert.notEqual(positionKey(game.fen()), positionKey(start));
  assert.notEqual(positionKey(start.replace(' w ', ' b ')), positionKey(start));
  assert.notEqual(positionKey(start.replace('KQkq', '-')), positionKey(start));
});

test('compact matches must be confirmed by the replay at the exact ply', () => {
  const pgn = '1. e4 e5 2. Nf3 Nc6 1-0';
  const game = new Chess();
  game.move('e4');
  const expected = fenCore(game.fen());
  const cache = new Map();
  assert.equal(verifiesPosition(pgn, 1, expected, cache), true);
  assert.equal(verifiesPosition(pgn, 2, expected, cache), false);
  assert.equal(verifiesPosition('not a PGN', 1, expected, cache), false);
});

test('compact scratch commands require a dedicated loopback database', () => {
  assert.equal(scratchUrl('postgresql://postgres@127.0.0.1:55432/chesstrace_m2_test').hostname, '127.0.0.1');
  for (const bad of ['postgresql://example.com/chesstrace_m2_test',
    'postgresql://127.0.0.1/live', 'postgresql://127.0.0.1/chesstrace_m2_test?host=example.com']) {
    assert.throws(() => scratchUrl(bad), /dedicated/);
  }
});
