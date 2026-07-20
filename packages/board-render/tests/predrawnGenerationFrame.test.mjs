import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import boardRender from '../dist/index.cjs';
import { installTestDrawableCatalog, resetTestDrawableCatalog } from './drawableCatalog.mjs';

const {
  boardDrawOps,
  boardLabMetrics,
  decodeBoard,
  encodeBoard,
  initialPredrawnGenerationFrame,
  normalizePredrawnGenerationFrame,
  predrawnGenerationFrameBoardPan,
  predrawnGenerationRequiredBounds,
  subterrainMaterialSrc,
  TILE_STEP_X,
  TILE_STEP_Y,
  validatePredrawnGenerationFrame,
} = boardRender;

before(installTestDrawableCatalog);
after(resetTestDrawableCatalog);

function board(overrides = {}) {
  return {
    cols: 2,
    rows: 1,
    cells: { '0,0': 'grass-surf-0', '1,0': 'stone-surf-0' },
    units: {},
    doodads: {},
    props: {},
    cover: {},
    features: {},
    fences: {},
    fencePosts: {},
    walls: {},
    wallArt: {},
    featureCuts: {},
    featureExits: {},
    ...overrides,
  };
}

function wireCode(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

test('strictly normalizes only bounded versioned native-pixel 16:9 frames', () => {
  const frame = { version: 1, x: -123, y: 45, width: 1600, height: 900 };
  assert.deepEqual(normalizePredrawnGenerationFrame(frame), frame);

  for (const malformed of [
    { ...frame, version: 2 },
    { ...frame, x: 0.5 },
    { ...frame, y: Number.MAX_SAFE_INTEGER },
    { ...frame, width: 0 },
    { ...frame, height: -9 },
    { ...frame, width: 8208, height: 4617 },
    { ...frame, width: 1600, height: 901 },
    [1, -123, 45, 1600, 900],
  ]) {
    assert.equal(normalizePredrawnGenerationFrame(malformed), undefined);
  }
});

test('boardCode round-trips pgf and drops missing or malformed generic-board values', () => {
  const predrawnGenerationFrame = { version: 1, x: -320, y: -180, width: 1600, height: 900 };
  assert.deepEqual(
    decodeBoard(encodeBoard(board({ predrawnGenerationFrame })))?.predrawnGenerationFrame,
    predrawnGenerationFrame,
  );
  assert.equal(decodeBoard(encodeBoard(board()))?.predrawnGenerationFrame, undefined);

  for (const pgf of [
    [2, -320, -180, 1600, 900],
    [1, -320.5, -180, 1600, 900],
    [1, -320, -180, 1600, 901],
    [1, -320, -180, 1600, 900, 0],
    { version: 1, x: -320, y: -180, width: 1600, height: 900 },
  ]) {
    const decoded = decodeBoard(wireCode({ c: 2, r: 1, f: 'grass-surf-0', pgf }));
    assert.ok(decoded);
    assert.equal(decoded.predrawnGenerationFrame, undefined);
  }
});

test('persisting a generation frame preserves every explicit Hold Bridge-shaped Subterrain face in the final draw plan', () => {
  const holes = new Set([
    '5,0', '6,0', '5,1', '5,2', '6,2',
    '5,5', '6,5', '6,6', '5,7', '6,7',
  ]);
  const cells = Object.fromEntries(
    Array.from({ length: 8 }, (_, y) => (
      Array.from({ length: 12 }, (__, x) => [`${x},${y}`, 'grass-surf-0'])
    )).flat().filter(([key]) => !holes.has(key)),
  );
  const subterrain = {
    '5,-1:south': 'bedrock',
    '6,-1:south': 'bedrock',
    '5,4:south': 'bedrock',
    '6,4:south': 'bedrock',
    '5,6:south': 'roots',
    '5,6:east': 'roots',
    '4,5:east': 'roots',
    '4,7:east': 'roots',
    '4,2:east': 'sand',
    '4,1:east': 'sand',
    '4,0:east': 'sand',
    '6,1:south': 'earth',
  };
  const source = board({
    cols: 12,
    rows: 8,
    cells,
    decorativeFootprint: ['5,-1', '6,-1'],
    decorativeCells: { '5,-1': 'stone-surf-0', '6,-1': 'stone-surf-0' },
    subterrain,
  });
  const predrawnGenerationFrame = initialPredrawnGenerationFrame(source);
  const reopened = decodeBoard(encodeBoard({ ...source, predrawnGenerationFrame }));

  assert.ok(reopened);
  assert.deepEqual(reopened.predrawnGenerationFrame, predrawnGenerationFrame);
  assert.deepEqual(reopened.subterrain, subterrain);
  assert.equal(validatePredrawnGenerationFrame(reopened, reopened.predrawnGenerationFrame).ok, true);

  const sideSources = new Set(Object.values(subterrain).map(subterrainMaterialSrc));
  const finalReferenceSideOps = boardDrawOps(reopened, { topSurfacesOnly: true })
    .filter((op) => op.layer === 'terrain' && sideSources.has(op.src));
  assert.equal(finalReferenceSideOps.length, Object.keys(subterrain).length);
});

test('required bounds remove scenic channels and off-board visual objects', () => {
  const baseline = predrawnGenerationRequiredBounds(board());
  const withScenery = board({
    decorativeApron: { top: 3, right: 3, bottom: 3, left: 3 },
    decorativeFootprint: ['-12,-8'],
    decorativeCells: { '-12,-8': 'sand-surf-5' },
    decorativeFeatures: { '-12,-8': { kind: 'road', material: 'dirt' } },
    decorativeFences: { '-12,-8|-11,-8': 'wood' },
    decorativeFencePosts: { '-12,-8': 'wood' },
    decorativeWalls: { '-13,-8|-12,-8': 'stone' },
    // This deliberately unknown id would fail render resolution if the off-board object survived.
    doodads: { '-12,-8': { doodadId: 'offboard-scenic-only' } },
    props: { '-12,-8': { propId: 'offboard-scenic-only' } },
    subterrain: { '-12,-8:south': 'earth' },
  });

  assert.deepEqual(predrawnGenerationRequiredBounds(withScenery), baseline);
});

test('required bounds retain the complete outer envelope around sparse playable terrain', () => {
  const source = board({
    cols: 3,
    rows: 2,
    cells: { '1,0': 'grass-surf-0' },
  });
  const bounds = predrawnGenerationRequiredBounds(source);

  assert.ok(bounds.minX <= -source.rows * TILE_STEP_X);
  assert.ok(bounds.minX + bounds.width >= source.cols * TILE_STEP_X);
  assert.ok(bounds.minY <= -TILE_STEP_Y);
  assert.ok(bounds.minY + bounds.height >= (source.cols + source.rows - 1) * TILE_STEP_Y);
});

test('initial frame is explicit 16:9, validates required clearance, and detects a clipped side', () => {
  const source = board({
    decorativeApron: { top: 2, right: 3, bottom: 2, left: 3 },
  });
  const frame = initialPredrawnGenerationFrame(source);
  const validation = validatePredrawnGenerationFrame(source, frame);

  assert.equal(frame.version, 1);
  assert.equal(frame.width * 9, frame.height * 16);
  assert.ok(frame.width <= 8192 && frame.height <= 8192);
  assert.equal(validation.ok, true);
  assert.ok(validation.clearance.left >= 1);
  assert.ok(validation.clearance.top >= 1);
  assert.ok(validation.clearance.right >= 1);
  assert.ok(validation.clearance.bottom >= 1);

  const required = predrawnGenerationRequiredBounds(source);
  assert.ok(
    frame.width === 16
    || frame.width - 16 < required.width + 2
    || frame.height - 9 < required.height + 2,
    'one smaller 16:9 step cannot retain the required one-pixel inset',
  );
  const clipped = validatePredrawnGenerationFrame(source, {
    ...frame,
    x: required.minX,
  });
  assert.equal(clipped.ok, false);
  assert.match(clipped.errors.join('\n'), /left clearance must be at least 1px/);
});

test('native frame maps directly into TileGrid boardPan at boardZoom 1', () => {
  const source = board({ decorativeApron: { top: 1, right: 2, bottom: 1, left: 2 } });
  const frame = initialPredrawnGenerationFrame(source);
  const pan = predrawnGenerationFrameBoardPan(source, frame);
  const metrics = boardLabMetrics([{ x: 0, y: 0 }, { x: 1, y: 0 }]);

  assert.equal(frame.x + metrics.originLeft + frame.width / 2 + pan.x, 0);
  assert.equal(frame.y + metrics.originTop + frame.height / 2 + pan.y, 0);
  assert.throws(
    () => predrawnGenerationFrameBoardPan(source, { ...frame, width: frame.width + 1 }),
    /invalid predrawnGenerationFrame/,
  );
});
