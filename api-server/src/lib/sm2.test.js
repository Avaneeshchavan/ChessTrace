const { test } = require('node:test');
const assert = require('node:assert/strict');
const { calculateNextReview, addDays } = require('./sm2');

for (const quality of [0, 1, 2]) {
  test(`quality ${quality} resets repetitions and interval on failure`, () => {
    const before = new Date();
    const result = calculateNextReview({ easeFactor: 2.5, intervalDays: 30, repetitions: 7, quality });
    assert.equal(result.repetitions, 0);
    assert.equal(result.intervalDays, 1);
    assert.equal(result.easeFactor, 2.5);
    assert.ok(result.nextReviewAt >= addDays(before, 1));
    assert.ok(result.nextReviewAt <= addDays(new Date(), 1));
  });
}

test('first, second and later successes use 1, 6 and rounded growing intervals', () => {
  const first = calculateNextReview({ easeFactor: 2.5, intervalDays: 0, repetitions: 0, quality: 5 });
  assert.equal(first.repetitions, 1);
  assert.equal(first.intervalDays, 1);
  assert.equal(first.easeFactor, 2.6);
  const second = calculateNextReview({ ...first, quality: 4 });
  assert.equal(second.repetitions, 2);
  assert.equal(second.intervalDays, 6);
  const third = calculateNextReview({ ...second, quality: 5 });
  assert.equal(third.repetitions, 3);
  assert.equal(third.intervalDays, 16);
  assert.equal(third.intervalDays, Math.round(second.intervalDays * third.easeFactor));
  const later = calculateNextReview({ easeFactor: 2.5, intervalDays: 30, repetitions: 7, quality: 3 });
  assert.equal(later.repetitions, 8);
  assert.equal(later.intervalDays, 71);
});

test('ease factor stays at or above 1.3 after repeated difficult successes', () => {
  let state = { easeFactor: 1.4, intervalDays: 1, repetitions: 2 };
  for (let i = 0; i < 10; i++) {
    state = calculateNextReview({ ...state, quality: 3 });
    assert.equal(state.easeFactor, 1.3);
  }
});
