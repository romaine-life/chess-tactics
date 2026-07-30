import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const {
  BOARD_PREVIEW_MARGIN_RATIO,
  BOARD_PREVIEW_ASPECT,
  BOARD_THUMBNAIL_SIZE,
  boardPreviewHeight,
  cameraToContainBounds,
  centeredPlayableBoardFramingBounds,
  minimumZoomToCoverBoundsAtCenter,
  playableBoardFramingBounds,
  playableBoardVisualBounds,
  viewportForMaximumOpeningAspect,
  worldViewportForFraming,
} = require(resolve(here, '../dist/index.cjs'));

test('playable framing is stable board geometry with five percent on every side', () => {
  const visual = playableBoardVisualBounds({ cols: 8, rows: 8 });
  const framed = playableBoardFramingBounds({ cols: 8, rows: 8 });
  assert.equal(BOARD_PREVIEW_MARGIN_RATIO, 0.05);
  assert.ok(Math.abs(framed.width - visual.width * 1.1) < 1e-9);
  assert.ok(Math.abs(framed.height - visual.height * 1.1) < 1e-9);
  assert.equal(framed.minX, visual.minX - visual.width * 0.05);
  assert.equal(framed.minY, visual.minY - visual.height * 0.05);
  assert.deepEqual(visual, { minX: -384, minY: -27, width: 768, height: 432 });
});

test('ordinary previews use the canonical reference viewing-pane aspect', () => {
  assert.deepEqual(BOARD_PREVIEW_ASPECT, { width: 195, height: 124 });
  assert.deepEqual(BOARD_THUMBNAIL_SIZE, { width: 390, height: 248 });
  assert.equal(boardPreviewHeight(195), 124);
  assert.equal(1560 / 992, BOARD_PREVIEW_ASPECT.width / BOARD_PREVIEW_ASPECT.height);
});

test('a wider Play viewport preserves the reference opening safe area', () => {
  const capped = viewportForMaximumOpeningAspect(
    { width: 1750, height: 992 },
    BOARD_PREVIEW_ASPECT.width / BOARD_PREVIEW_ASPECT.height,
  );
  assert.deepEqual(capped, { width: 1560, height: 992 });
  assert.deepEqual(
    viewportForMaximumOpeningAspect(
      { width: 1200, height: 992 },
      BOARD_PREVIEW_ASPECT.width / BOARD_PREVIEW_ASPECT.height,
    ),
    { width: 1200, height: 992 },
  );
});

test('centred framing is independent of generated art and scene content', () => {
  const frame = centeredPlayableBoardFramingBounds({ cols: 5, rows: 9 });
  assert.equal(frame.minX + frame.width / 2, 0);
  assert.equal(frame.minY + frame.height / 2, -22);
});

test('camera contains the limiting axis and centres an asymmetric rectangle', () => {
  const camera = cameraToContainBounds({
    viewport: { width: 300, height: 200 },
    bounds: { minX: 50, minY: -25, width: 600, height: 250 },
  });
  assert.equal(camera.zoom, 0.5);
  assert.equal(camera.pan.x, -175);
  assert.equal(camera.pan.y, -50);
});

test('art safety may raise the opening zoom without changing the board-owned centre', () => {
  const camera = cameraToContainBounds({
    viewport: { width: 300, height: 200 },
    bounds: { minX: -300, minY: -125, width: 600, height: 250 },
    minZoom: 0.9,
  });
  assert.equal(camera.zoom, 0.9);
  assert.deepEqual(camera.pan, { x: 0, y: 0 });
});

test('rectangular art safety is measured around the board-owned centre', () => {
  const floor = minimumZoomToCoverBoundsAtCenter({
    viewport: { width: 300, height: 200 },
    coverBounds: { minX: -400, minY: -100, width: 1000, height: 400 },
    center: { x: 0, y: 0 },
  });
  assert.equal(floor, 1);
});

test('fixed-raster viewport represents the same centred contain camera', () => {
  const frame = playableBoardFramingBounds({ cols: 4, rows: 6 });
  const fitted = worldViewportForFraming({
    viewport: BOARD_THUMBNAIL_SIZE,
    bounds: frame,
  });
  assert.ok(fitted.bounds.width >= frame.width);
  assert.ok(fitted.bounds.height >= frame.height);
  assert.equal(
    fitted.bounds.minX + fitted.bounds.width / 2,
    frame.minX + frame.width / 2,
  );
  assert.equal(
    fitted.bounds.minY + fitted.bounds.height / 2,
    frame.minY + frame.height / 2,
  );
});
