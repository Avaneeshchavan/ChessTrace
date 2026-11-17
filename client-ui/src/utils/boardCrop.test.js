import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fitCrop, dragCorner } from './boardCrop.js';

test('movement and scaling stay square, in frame and above the minimum size', () => {
  assert.deepEqual(fitCrop({ x: -4, y: 150, size: 20 }, 400, 240), { x: 0, y: 150, size: 64 });
  assert.deepEqual(fitCrop({ x: 200, y: 200, size: 500 }, 400, 240), { x: 160, y: 0, size: 240 });
  const initial = { x: 30, y: 50, size: 100 };
  assert.deepEqual(dragCorner(initial, 'nw', -100, -100, 400, 240), { x: 0, y: 20, size: 130 });
  assert.deepEqual(dragCorner(initial, 'se', -100, -100, 400, 240), { x: 30, y: 50, size: 64 });
});
