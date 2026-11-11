const { test } = require('node:test');
const assert = require('node:assert/strict');
const { computeStructuralVector, toPgvectorLiteral } = require('./vector');

for (const fen of [
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  '4k3/8/8/8/8/8/4r3/4K3 w - - 0 1',
  'k7/8/8/8/8/8/8/7K w - - 0 1',
]) {
  test(`vector has exactly 32 finite features: ${fen}`, () => {
    const vector = computeStructuralVector(fen);
    assert.equal(vector.length, 32);
    assert.ok(vector.every(Number.isFinite));
    assert.deepEqual(JSON.parse(toPgvectorLiteral(vector)), vector);
    assert.deepEqual(computeStructuralVector(fen), vector);
  });
}

test('material features distinguish an extra white queen', () => {
  const equal = computeStructuralVector('4k3/8/8/8/8/8/8/4K3 w - - 0 1');
  const extra = computeStructuralVector('4k3/8/8/8/8/8/Q7/4K3 w - - 0 1');
  assert.deepEqual(equal.slice(26), [0, 0, 0, 0, 0, 0]);
  assert.equal(extra[30], 1 / 9);
  assert.equal(extra[31], 9 / 46);
});

test('rejects a board missing a king', () => {
  assert.throws(() => computeStructuralVector('8/8/8/8/8/8/8/4K3 w - - 0 1'));
});
