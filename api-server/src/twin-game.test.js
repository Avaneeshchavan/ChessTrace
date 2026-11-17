const assert = require('node:assert/strict');
const { test } = require('node:test');
const { parseTwinGame, positionInput, analyzeTwinGame } = require('./twin-game');

test('Twin Game reads one standard game and indexes positions from both move orders', () => {
  assert.throws(() => parseTwinGame('garbage'), /PGN/);
  assert.throws(() => parseTwinGame(''), /single PGN/);
  assert.throws(() => parseTwinGame('[Variant "Atomic"]\n\n1. e4 *'), /standard chess/);
  const first = positionInput(parseTwinGame('1. Nf3 d5 2. d4 Nf6'));
  const second = positionInput(parseTwinGame('1. d4 Nf6 2. Nf3 d5'));
  assert.equal(first.at(-1).key, second.at(-1).key);
  assert.notEqual(first.find(row => row.ply === 1).key, second.find(row => row.ply === 1).key);
  assert.equal(first.filter(row => row.ply === 0).length, 20);
});

test('Twin Game does one database query and verifies replays before proposing a transposition', async () => {
  let calls = 0;
  const prisma = { $queryRaw: async () => {
    calls++;
    return [{
      departure: 4, corpusGames: 10, anchorGames: 3, timeline: [[1, 0], [2, 0], [3, 0], [4, 3], [5, 0]],
      candidates: [
        { game_id: 1, pgn: '1. e4 e5 2. Nf3 Nc6 3. Bb5', anchor: 4, deepest: 4 },
        { game_id: 2, pgn: '1. d4 Nf6 2. Nf3 d5 3. e3', anchor: 4, deepest: 4, result: '1-0' },
      ],
    }];
  } };
  const result = await analyzeTwinGame(prisma, parseTwinGame('1. Nf3 d5 2. d4 Nf6 3. h3'), { compact: true });
  assert.equal(calls, 1);
  assert.equal(result.departurePly, 4);
  assert.equal(result.twin.gameId, 2);
  assert.equal(result.twin.transposed, true);
  assert.equal(result.variations[0].san, 'e3');
  assert.equal(result.variations[0].whiteWins, 1);
  assert.equal(result.replaySample, 1);
});
