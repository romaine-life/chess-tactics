const assert = require('node:assert/strict');
const { test } = require('node:test');
const { paintBoardThumbnailOp } = require('./boardThumbnail');

function recordingContext(initialAlpha = 1) {
  const calls = [];
  let alpha = initialAlpha;
  const record = (name, ...args) => { calls.push({ name, args, alpha }); };
  const ctx = {
    get globalAlpha() { return alpha; },
    set globalAlpha(value) { alpha = value; record('globalAlpha', value); },
    save: () => record('save'),
    restore: () => record('restore'),
    beginPath: () => record('beginPath'),
    moveTo: (...args) => record('moveTo', ...args),
    lineTo: (...args) => record('lineTo', ...args),
    closePath: () => record('closePath'),
    clip: () => record('clip'),
    translate: (...args) => record('translate', ...args),
    scale: (...args) => record('scale', ...args),
    drawImage: (...args) => record('drawImage', ...args),
  };
  return { ctx, calls };
}

test('server thumbnail composes fixed board clipping, op-box flip, and multiplicative opacity', () => {
  const { ctx, calls } = recordingContext(0.5);
  const image = { width: 8, height: 8 };
  const op = {
    src: '/reflection.png',
    dx: 30,
    dy: 40,
    dw: 10,
    dh: 12,
    z: 1,
    flipX: true,
    opacity: 0.4,
    clipPolygons: [[31, 41, 39, 41, 39, 51, 31, 51]],
  };

  paintBoardThumbnailOp(ctx, image, op, 5, 7, { minX: 10, minY: 20 }, 2);

  const moveIndex = calls.findIndex((call) => call.name === 'moveTo');
  const translateIndex = calls.findIndex((call) => call.name === 'translate');
  const draw = calls.find((call) => call.name === 'drawImage');
  assert.deepEqual(calls[moveIndex].args, [47, 49]);
  assert.ok(moveIndex < translateIndex);
  assert.deepEqual(calls[translateIndex].args, [65, 47]);
  assert.deepEqual(calls.find((call) => call.name === 'scale').args, [-1, 1]);
  assert.deepEqual(draw.args, [image, 0, 0, 20, 24]);
  assert.equal(draw.alpha, 0.2);
  assert.equal(calls.filter((call) => call.name === 'restore').length, 2);
  assert.equal(ctx.globalAlpha, 0.5);
});

test('server thumbnail preserves source rectangles inside a flipped op box', () => {
  const { ctx, calls } = recordingContext();
  const image = { width: 64, height: 64 };
  const op = {
    src: '/sheet.png',
    dx: 12,
    dy: 18,
    dw: 32,
    dh: 40,
    z: 1,
    sx: 4,
    sy: 5,
    sw: 16,
    sh: 20,
    flipX: true,
  };

  paintBoardThumbnailOp(ctx, image, op, 3, 4, { minX: 2, minY: 8 }, 2);

  assert.deepEqual(calls.find((call) => call.name === 'translate').args, [87, 24]);
  assert.deepEqual(calls.find((call) => call.name === 'drawImage').args, [
    image, 4, 5, 16, 20, 0, 0, 64, 80,
  ]);
});

test('server thumbnail preserves contain sizing and centering inside a flipped op box', () => {
  const { ctx, calls } = recordingContext();
  const image = { width: 200, height: 50 };
  const op = {
    src: '/piece.png',
    dx: 0,
    dy: 0,
    dw: 100,
    dh: 120,
    z: 1,
    contain: true,
    flipX: true,
  };

  paintBoardThumbnailOp(ctx, image, op, 0, 0, { minX: 0, minY: 0 }, 2);

  assert.deepEqual(calls.find((call) => call.name === 'translate').args, [200, 0]);
  assert.deepEqual(calls.find((call) => call.name === 'drawImage').args, [
    image, 0, 95, 200, 50,
  ]);
});
