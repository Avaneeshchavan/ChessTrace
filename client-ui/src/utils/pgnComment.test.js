import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePgnComment, chessMoveLabel } from './pgnComment.js';

test('separates PGN metadata from readable commentary', () => {
  assert.deepEqual(parsePgnComment('A threat [%eval -0.45,17] [%clk 0:12:34.1] [%cal Ge2e4] remains.'), {
    text: 'A threat remains.',
    annotations: [
      { label: 'Evaluation', value: '-0.45' },
      { label: 'Clock', value: '0:12:34.1' },
      { label: 'cal', value: 'Ge2e4' },
    ],
  });
  assert.deepEqual(parsePgnComment('[%eval #3]'), {
    text: '', annotations: [{ label: 'Evaluation', value: 'Mate in 3' }],
  });
  assert.deepEqual(parsePgnComment('Plain <b>comment</b>'), { text: 'Plain <b>comment</b>', annotations: [] });
  assert.equal(chessMoveLabel({ before: '8 b - - 0 14', color: 'b', san: 'Nf6' }), '14… Nf6');
});
