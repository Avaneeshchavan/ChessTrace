const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Chess } = require('chess.js');
const { savedSolution, legalAttempt, weeklyRates } = require('./puzzleAttempts');

test('saved solutions replay from the stored FEN with or without PGN headers', () => {
  const fen = '4k3/8/8/8/8/8/8/4K2R w K - 0 12';
  const game = new Chess(fen);
  game.move('O-O');
  for (const solutionPgn of ['12. O-O', game.pgn()]) {
    const solution = savedSolution({ fen, solutionPgn });
    assert.equal(solution.moves[0].lan, 'e1g1');
    assert.equal(solution.moves[0].after, game.fen());
    assert.equal(solution.mateIn, null);
  }
  assert.equal(savedSolution({ fen, solutionPgn: '12. a4' }), null);
  assert.equal(savedSolution({ fen, solutionPgn: '' }), null);
});

test('legal attempts distinguish underpromotion and accept en passant', () => {
  const promotion = '4k3/P7/8/8/8/8/8/4K3 w - - 0 1';
  assert.equal(legalAttempt(promotion, 'a7a8n'), true);
  assert.equal(legalAttempt(promotion, 'a7a8'), false);
  assert.equal(legalAttempt(promotion, 'a7a8k'), false);
  const enPassant = '4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1';
  assert.equal(legalAttempt(enPassant, 'e5d6'), true);
  assert.equal(savedSolution({ fen: enPassant, solutionPgn: '1. exd6' }).moves[0].lan, 'e5d6');
});

test('weekly rates use UTC Mondays and count a motif once per move', () => {
  const result = weeklyRates([
    { createdAt: '2026-11-08T23:59:59Z', motifs: ['Fork', 'Fork'], correct: true },
    { createdAt: '2026-11-09T00:00:00Z', motifs: ['Fork'], correct: false },
  ]);
  assert.deepEqual(result, [
    { week: '2026-11-02', motif: 'Fork', solved: 1, attempts: 1 },
    { week: '2026-11-09', motif: 'Fork', solved: 0, attempts: 1 },
  ]);
});
