import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test, { after, before } from 'node:test';
import {
  installTestDrawableCatalogWithStructures,
  installTestPropSeats,
  resetTestDrawableCatalog,
  resetTestPropSeats,
} from './drawableCatalog.mjs';

const require = createRequire(import.meta.url);
const {
  boardDrawOps,
  fenceOverlayZIndex,
  fencePostZIndex,
  CELL_DEPTH_STRIDE,
  FENCE_POST_DEPTH_BIAS,
  fenceFrameSrc,
  fencePostSrc,
  objectBaseZIndex,
  predrawnOcclusionMaskOps,
  predrawnOcclusionMasksInFront,
  predrawnOcclusionSeedBoard,
  predrawnEnvironmentGeometryFingerprintInput,
  predrawnEnvironmentGeometryFingerprintInputV1,
  predrawnEnvironmentGeometryFingerprintInputV2,
  PREDRAWN_ENVIRONMENT_GEOMETRY_SCHEMA_V1,
  PREDRAWN_ENVIRONMENT_GEOMETRY_SCHEMA_V2,
  wallFrameSrc,
  wallOverlayZIndex,
} = require('../dist/index.cjs');

before(() => {
  installTestDrawableCatalogWithStructures();
  installTestPropSeats();
});
after(() => {
  resetTestPropSeats();
  resetTestDrawableCatalog();
});

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
  assert.deepEqual(seed.doodads, source.doodads);
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

test('a source-less temporary plate suppresses baked environment ops but can still derive canonical masks', () => {
  const source = board({
    surface: undefined,
    cells: { '0,0': 'grass-surf-0' },
    subterrain: { '0,0:south': 'earth' },
    macroTiles: [],
    units: {},
    doodads: { '0,0': { doodadId: 'unused-test-doodad' } },
    props: { '0,0': { propId: 'fieldstone' } },
    cover: { '0,0': 'filled' },
    coverTypes: { '0,0': 'grass' },
    features: { '0,0': { kind: 'road', material: 'dirt' } },
    fences: { '1,1|2,1': 'wood' },
    fencePosts: { '1,1': 'wood' },
    walls: { '0,0|0,-1': 'stone' },
  });

  assert.ok(boardDrawOps(source, { predrawnBackgroundActive: true }).every(
    (op) => op.animation?.kind === 'ground-cover-sway',
  ));
  assert.ok(predrawnOcclusionMaskOps({ ...source, props: {} }).length > 0);
});

test('predrawnOcclusionMaskOps reuses canonical rail/post alpha geometry at edge-plane depth', () => {
  const masks = predrawnOcclusionMaskOps(board({
    cells: {},
    props: {},
    walls: {},
    fences: { '1,1|2,1': 'wood' },
    fencePosts: {},
  }));
  const rail = masks.find((op) => op.src === fenceFrameSrc('wood', 2));
  const posts = masks.filter((op) => op.src === fencePostSrc('wood'));

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
  const rail = masks.find((op) => op.src === fenceFrameSrc('wood', 2));
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
  const wall = masks.find((op) => op.src === wallFrameSrc('stone', 1));

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

test('split doodads remain raised occluders in a complete painted scene', () => {
  const masks = predrawnOcclusionMaskOps(board({
    cells: {},
    doodads: { '2,2': { doodadId: 'unused-test-doodad' } },
    props: {},
    fences: {},
    fencePosts: {},
    walls: {},
  }));
  assert.ok(masks.length >= 2);
  assert.ok(masks.some((op) => op.z === objectBaseZIndex({ x: 2, y: 2 }) - 1));
  assert.ok(masks.some((op) => op.z === objectBaseZIndex({ x: 2, y: 2 }) + 1));
});

test('decorative fences appear once at fence depth and decorative walls keep wall depth', () => {
  const source = board({
    cells: {},
    decorativeFootprint: ['-1,0', '-1,1'],
    decorativeCells: { '-1,0': 'grass-surf-0', '-1,1': 'grass-surf-0' },
    doodads: {},
    props: {},
    fences: {},
    fencePosts: {},
    walls: {},
    decorativeFences: { '-1,1|0,1': 'wood' },
    decorativeFencePosts: {},
    decorativeWalls: { '-1,0|-1,-1': 'stone' },
  });
  const masks = predrawnOcclusionMaskOps(source);
  const rail = masks.filter((op) => op.src === fenceFrameSrc('wood', 2));
  const wallSources = new Set([1, 8, 9].map((mask) => wallFrameSrc('stone', mask)));
  const wall = masks.find((op) => wallSources.has(op.src));
  assert.equal(rail.length, 1);
  assert.ok(wall);
  assert.equal(wall.z, wallOverlayZIndex({ x: -1, y: 0 }));
});

test('v2 environment geometry is canonical and excludes live selection and cover state', () => {
  const source = board({
    cells: { '1,0': 'stone', '0,0': 'grass' },
    props: { '2,2': { propId: 'fieldstone' }, '0,5': { propId: 'fieldstone' } },
  });
  const reordered = board({
    ...source,
    surface: undefined,
    cells: { '0,0': 'grass', '1,0': 'stone' },
    props: { '0,5': { propId: 'fieldstone' }, '2,2': { propId: 'fieldstone' } },
    units: {},
    zones: { '0,0': 'objective' },
  });
  const fingerprint = predrawnEnvironmentGeometryFingerprintInput(source);
  assert.equal(fingerprint, predrawnEnvironmentGeometryFingerprintInputV2(source));
  assert.equal(JSON.parse(fingerprint).schema, PREDRAWN_ENVIRONMENT_GEOMETRY_SCHEMA_V2);
  assert.equal(Object.hasOwn(JSON.parse(fingerprint), 'cover'), false);
  assert.equal(Object.hasOwn(JSON.parse(fingerprint), 'coverTypes'), false);

  assert.equal(predrawnEnvironmentGeometryFingerprintInput(reordered), fingerprint);
  assert.equal(
    predrawnEnvironmentGeometryFingerprintInput({
      ...source,
      cover: { '0,0': 'filled', '4,10': 'sparse' },
      coverTypes: { '0,0': 'sand', '4,10': 'water' },
    }),
    fingerprint,
  );
  assert.notEqual(
    predrawnEnvironmentGeometryFingerprintInput({ ...source, cells: { ...source.cells, '0,0': 'stone' } }),
    fingerprint,
  );
  assert.notEqual(
    predrawnEnvironmentGeometryFingerprintInput({ ...source, walls: { '1,0|1,-1': 'stone' } }),
    fingerprint,
  );
  assert.notEqual(
    predrawnEnvironmentGeometryFingerprintInput({ ...source, subterrain: { '0,0:south': 'earth' } }),
    fingerprint,
  );
});

test('legacy v1 environment geometry retains actual cover solely for binding verification', () => {
  const source = board();
  const fingerprint = predrawnEnvironmentGeometryFingerprintInputV1(source);
  const parsed = JSON.parse(fingerprint);
  assert.equal(parsed.schema, PREDRAWN_ENVIRONMENT_GEOMETRY_SCHEMA_V1);
  assert.deepEqual(parsed.cover, source.cover);
  assert.deepEqual(parsed.coverTypes, source.coverTypes);
  assert.notEqual(
    predrawnEnvironmentGeometryFingerprintInputV1({
      ...source,
      cover: { ...source.cover, '4,10': 'sparse' },
      coverTypes: { ...source.coverTypes, '4,10': 'water' },
    }),
    fingerprint,
  );
  assert.equal(
    predrawnEnvironmentGeometryFingerprintInputV2({
      ...source,
      cover: { ...source.cover, '4,10': 'sparse' },
      coverTypes: { ...source.coverTypes, '4,10': 'water' },
    }),
    predrawnEnvironmentGeometryFingerprintInputV2(source),
  );
});

test('environment geometry fingerprint does not depend on the host locale collation', () => {
  const originalLocaleCompare = String.prototype.localeCompare;
  String.prototype.localeCompare = () => { throw new Error('locale-sensitive comparison used'); };
  try {
    assert.doesNotThrow(() => predrawnEnvironmentGeometryFingerprintInput(board({
      cells: { '1,0': 'stone', '0,0': 'grass' },
      macroTiles: [
        { assetId: 'zeta', x: 0, y: 0 },
        { assetId: 'alpha', x: 1, y: 0 },
      ],
    })));
  } finally {
    String.prototype.localeCompare = originalLocaleCompare;
  }
});
