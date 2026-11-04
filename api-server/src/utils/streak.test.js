const { test } = require('node:test');
const assert = require('node:assert/strict');
const { calculateStreak } = require('./streak');
const logs = days => days.map(day => ({ createdAt: new Date(`2026-11-${String(day).padStart(2, '0')}T12:00:00Z`) }));

for (const [name, days, expected] of [
  ['no activity', [], 0],
  ['today and preceding days', [4, 3, 2], 3],
  ['yesterday with no activity today', [3, 2, 1], 3],
  ['duplicate and unordered logs', [2, 4, 3, 4, 2], 3],
  ['a gap stops the count', [4, 2, 1], 1],
  ['stale activity', [2, 1], 0],
]) {
  test(`streak: ${name}`, t => {
    t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-04T12:00:00Z') });
    assert.equal(calculateStreak(logs(days)), expected);
  });
}
