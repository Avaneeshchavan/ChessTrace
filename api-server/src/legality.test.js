const { test } = require('node:test');
const assert = require('node:assert/strict');
const { checkSyntacticLegality } = require('./legality');

test('accepts starting position and a legal checked side to move', () => {
  for (const fen of [
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    '4k3/8/8/8/8/8/4r3/4K3 w - - 0 1',
  ]) assert.deepEqual(checkSyntacticLegality(fen), { legal: true, reasons: [] });
});

for (const [name, fen, reason] of [
  ['malformed board', '8/8/8 w -', /Unparseable board/],
  ['missing king', '4k3/8/8/8/8/8/8/8 w -', /White must have exactly 1 king/],
  ['pawn on back rank', 'P3k3/8/8/8/8/8/8/4K3 w -', /Pawn on rank 8/],
  ['impossible castling rights', '4k3/8/8/8/8/8/8/4K3 w K', /required king\/rook/],
  ['side not to move in check', '4k3/4R3/8/8/8/8/8/4K3 w -', /Side not to move/],
  ['impossible promoted pieces', '4k3/8/8/8/8/QQ6/PPPPPPPP/4K3 w -', /at most 1 are possible/],
]) {
  test(`rejects ${name}`, () => {
    const result = checkSyntacticLegality(fen);
    assert.equal(result.legal, false);
    assert.match(result.reasons.join('; '), reason);
  });
}
