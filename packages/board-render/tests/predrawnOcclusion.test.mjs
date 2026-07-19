import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  fenceOverlayZIndex,
  fencePostZIndex,
  CELL_DEPTH_STRIDE,
  FENCE_POST_DEPTH_BIAS,
  objectBaseZIndex,
  predrawnOcclusionMaskOps,
  predrawnOcclusionMasksInFront,
  predrawnOcclusionSeedBoard,
  wallOverlayZIndex,
} = require('../dist/index.cjs');

function board(overrides = {}) {
  return {
    cols: 5,
    rows: 11,
    cells: { '0,0': 'unused-test-tile' },
    surface: {
      kind: 'predrawn',
      slot: 'boards/review/plate.png',
      frameWidth: 1680,
      frameHeight: 935,
    },
    macroTiles: [{ assetId: 'unused-test-macro', x: 0, y: 0 }],
    units: { '1,1': { unitId: 'unused-test-unit', direction: 'south', faction: 'navy-blue' } },
    doodads: { '2,2': { doodadId: 'unused-test-doodad' } },
    props: { '0,5': { propId: 'fieldstone' } },
    cover: { '3,3': 'filled' },
    coverTypes: { '3,3': 'grass' },
    features: { '1,3': { kind: 'road', material: 'stone' } },
    featureCuts: { '1,3|2,3': true },
    featureExits: { '1,3|1,2': true },
    fences: { '0,5|0,6': 'stone' },
    fencePosts: { '0,5': 'stone' },
    walls: { '0,0|0,-1': 'stone' },
    wallArt: {},
    zoneEntries: [],
    zones: {},
    generatedRegions: [],
    ...overrides,
  };
}

test('predrawnOcclusionSeedBoard keeps raised authored geometry and removes unrelated families', () => {
  const source = board();
  const seed = predrawnOcclusionSeedBoard(source);

  assert.equal(seed.surface, undefined);
  assert.deepEqual(seed.macroTiles, []);
  assert.deepEqual(seed.units, {});
  assert.deepEqual(seed.doodads, {});
  assert.deepEqual(seed.cover, {});
  assert.deepEqual(seed.coverTypes, {});
  assert.deepEqual(seed.features, {});
  assert.deepEqual(seed.featureCuts, {});
  assert.deepEqual(seed.featureExits, {});
  assert.deepEqual(seed.props, source.props);
  assert.deepEqual(seed.fences, source.fences);
  assert.deepEqual(seed.fencePosts, source.fencePosts);
  assert.deepEqual(seed.walls, source.walls);
  assert.deepEqual(seed.wallArt, source.wallArt);
});

test('predrawnOcclusionMaskOps reuses canonical rail/post alpha geometry at edge-plane depth', () => {
  const masks = predrawnOcclusionMaskOps(board({
    cells: {},
    props: {},
    walls: {},
    fences: { '1,1|2,1': 'wood' },
    fencePosts: {},
  }));
  const rail = masks.find((op) => op.src === '/assets/tiles/feature/fence-wood-2.png');
  const posts = masks.filter((op) => op.src === '/assets/tiles/feature/fence-wood-post.png');

  assert.ok(rail);
  assert.equal(rail.layer, 'scene');
  const railDelta = 2 + CELL_DEPTH_STRIDE / 2;
  const postDelta = railDelta - FENCE_POST_DEPTH_BIAS;
  assert.equal(rail.z, fenceOverlayZIndex({ x: 1, y: 1 }) + railDelta);
  assert.equal(posts.length, 2);
  assert.deepEqual(
    posts.map((op) => op.z).sort((a, b) => a - b),
    [
      fencePostZIndex({ x: 2, y: 1 }) + postDelta,
      fencePostZIndex({ x: 2, y: 2 }) + postDelta,
    ],
  );
  assert.ok(masks.every((op) => op.layer === 'scene'));
  assert.ok(masks.every((op) => !op.src.includes('/road-')));
});

test('canonical fence edge depth masks the owner-cell unit but not the adjacent front-cell unit', () => {
  const masks = predrawnOcclusionMaskOps(board({
    cells: {},
    props: {},
    walls: {},
    fences: { '1,1|2,1': 'wood' },
    fencePosts: {},
  }));
  const rail = masks.find((op) => op.src === '/assets/tiles/feature/fence-wood-2.png');
  const postDelta = 2 + CELL_DEPTH_STRIDE / 2 - FENCE_POST_DEPTH_BIAS;
  const backPost = masks.find((op) => op.z === fencePostZIndex({ x: 2, y: 1 }) + postDelta);

  assert.ok(rail);
  assert.ok(backPost);

  const overlappingOp = (z) => ({
    src: '/unit.png',
    dx: rail.dx,
    dy: rail.dy,
    dw: rail.dw,
    dh: rail.dh,
    z,
    layer: 'scene',
  });
  const ownerCellUnit = overlappingOp(objectBaseZIndex({ x: 1, y: 1 }));
  const adjacentFrontCellUnit = overlappingOp(objectBaseZIndex({ x: 2, y: 1 }));
  const equalDepthOp = overlappingOp(rail.z);

  assert.deepEqual(predrawnOcclusionMasksInFront(ownerCellUnit, [rail]), [rail]);
  assert.deepEqual(predrawnOcclusionMasksInFront(adjacentFrontCellUnit, [rail]), []);
  assert.deepEqual(predrawnOcclusionMasksInFront(equalDepthOp, [rail]), []);
  assert.deepEqual(predrawnOcclusionMasksInFront(ownerCellUnit, [backPost]), [backPost]);
  assert.deepEqual(predrawnOcclusionMasksInFront(adjacentFrontCellUnit, [backPost]), []);
  assert.deepEqual(predrawnOcclusionMasksInFront(overlappingOp(backPost.z), [backPost]), []);
});

test('non-fence raised masks keep their canonical depth', () => {
  const masks = predrawnOcclusionMaskOps(board({
    cells: {},
    props: {},
    fences: { '1,1|2,1': 'wood' },
    fencePosts: {},
    walls: { '0,0|0,-1': 'stone' },
  }));
  const wall = masks.find((op) => op.src === '/assets/tiles/feature/wall-stone-1.png');

  assert.ok(wall);
  assert.equal(wall.z, wallOverlayZIndex({ x: 0, y: 0 }));
});

test('predrawnOcclusionMaskOps and fence selection are deterministic', () => {
  const source = board({
    cells: {},
    props: {},
    fences: {
      '1,1|2,1': 'wood',
      '2,1|2,2': 'stone',
    },
    fencePosts: { '2,1': 'stone' },
  });
  const first = predrawnOcclusionMaskOps(source);
  const second = predrawnOcclusionMaskOps(source);
  const unit = { src: '/unit.png', dx: -200, dy: -200, dw: 400, dh: 400, z: 20_002, layer: 'scene' };

  assert.deepEqual(second, first);
  assert.deepEqual(
    predrawnOcclusionMasksInFront(unit, second),
    predrawnOcclusionMasksInFront(unit, first),
  );
});

test('predrawnOcclusionMasksInFront requires strict depth and positive rectangle overlap', () => {
  const op = { src: '/unit.png', dx: 10, dy: 20, dw: 30, dh: 40, z: 50, layer: 'scene' };
  const frontOverlap = { src: '/front.png', dx: 20, dy: 30, dw: 10, dh: 10, z: 51, layer: 'scene' };
  const equalOverlap = { src: '/equal.png', dx: 20, dy: 30, dw: 10, dh: 10, z: 50, layer: 'scene' };
  const behindOverlap = { src: '/behind.png', dx: 20, dy: 30, dw: 10, dh: 10, z: 49, layer: 'scene' };
  const touching = { src: '/touching.png', dx: 40, dy: 30, dw: 10, dh: 10, z: 60, layer: 'scene' };
  const disjoint = { src: '/disjoint.png', dx: 100, dy: 100, dw: 10, dh: 10, z: 60, layer: 'scene' };

  assert.deepEqual(
    predrawnOcclusionMasksInFront(op, [equalOverlap, disjoint, frontOverlap, touching, behindOverlap]),
    [frontOverlap],
  );
});

test('predrawnOcclusionMasksInFront handles mirrored draw rectangles conservatively', () => {
  const op = { src: '/unit.png', dx: 10, dy: 10, dw: 20, dh: 20, z: 1 };
  const reversedMask = { src: '/mask.png', dx: 35, dy: 25, dw: -10, dh: -10, z: 2 };

  assert.deepEqual(predrawnOcclusionMasksInFront(op, [reversedMask]), [reversedMask]);
});
