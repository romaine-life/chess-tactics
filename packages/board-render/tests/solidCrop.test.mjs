import assert from 'node:assert/strict';
import test from 'node:test';
import { largestSolidRect } from '../dist/index.cjs';

function coverage(isSolid, rect) {
  let count = 0;
  for (let y = rect.y; y < rect.y + rect.h; y += 1) {
    for (let x = rect.x; x < rect.x + rect.w; x += 1) {
      if (isSolid(x, y)) count += 1;
    }
  }
  return count / (rect.w * rect.h);
}

test('largestSolidRect returns the exact maximum solid rectangle', () => {
  const rows = [
    '00111100',
    '01111110',
    '11111111',
    '01111110',
    '00111100',
  ];
  const isSolid = (x, y) => rows[y][x] === '1';
  const rect = largestSolidRect(isSolid, 8, 5);

  assert.deepEqual(rect, { x: 2, y: 0, w: 4, h: 5 });
  assert.equal(coverage(isSolid, rect), 1);
});

test('largestSolidRect never substitutes a transparent bounding box for a narrow safe crop', () => {
  const isSolid = (x, y) => x === 3 || y === 3;
  const rect = largestSolidRect(isSolid, 7, 7);

  assert.ok(rect);
  assert.equal(rect.w * rect.h, 7);
  assert.equal(coverage(isSolid, rect), 1);
});

test('largestSolidRect returns null for an empty or invalid raster', () => {
  assert.equal(largestSolidRect(() => false, 6, 4), null);
  assert.equal(largestSolidRect(() => true, 0, 4), null);
});
