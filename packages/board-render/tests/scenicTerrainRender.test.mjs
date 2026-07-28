import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import boardRender from '../dist/index.cjs';
import { installTestDrawableCatalog, resetTestDrawableCatalog } from './drawableCatalog.mjs';

const {
  boardBounds,
  boardDrawOps,
  boardVisualTerrainCells,
  fenceFrameSrc,
  subterrainMaterialSrc,
  uniqueDrawSrcs,
  wallFrameSrc,
} = boardRender;

before(installTestDrawableCatalog);
after(resetTestDrawableCatalog);

function blankBoard(overrides = {}) {
  return {
    cols: 2,
    rows: 1,
    cells: { '0,0': 'grass-surf-0', '1,0': 'grass-surf-0' },
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

function topTerrainOps(board) {
  return boardDrawOps(board, { topSurfacesOnly: true })
    .filter((op) => op.layer === 'terrain');
}

test('generation-reference rendering includes active scenic rectangle and footprint but ignores retained inactive material', () => {
  const playableOnly = blankBoard();
  const scenic = blankBoard({
    decorativeApron: { top: 0, right: 1, bottom: 1, left: 0 },
    decorativeFootprint: ['-7,-3'],
    decorativeCells: {
      '0,1': 'stone-surf-0',
      '-7,-3': 'sand-surf-5',
      '9,9': 'dirt-surf-6',
    },
  });

  const visualCells = boardVisualTerrainCells(scenic);
  assert.deepEqual(
    visualCells.filter((cell) => cell.decorative).map((cell) => cell.key),
    ['-7,-3', '2,0', '0,1', '1,1', '2,1'],
  );
  assert.equal(visualCells.find((cell) => cell.key === '0,1')?.tileId, 'stone-surf-0');
  assert.equal(visualCells.find((cell) => cell.key === '-7,-3')?.tileId, 'sand-surf-5');
  assert.equal(visualCells.some((cell) => cell.key === '9,9'), false);
  assert.equal(topTerrainOps(scenic).length, 7);

  const expectedActiveSources = new Set([
    topTerrainOps(blankBoard({ cells: { '0,0': 'grass-surf-0' } }))[0].src,
    topTerrainOps(blankBoard({ cells: { '0,0': 'stone-surf-0' } }))[0].src,
    topTerrainOps(blankBoard({ cells: { '0,0': 'sand-surf-5' } }))[0].src,
  ]);
  assert.deepEqual(new Set(uniqueDrawSrcs(scenic, { topSurfacesOnly: true })), expectedActiveSources);

  const scenicBounds = boardBounds(scenic, { topSurfacesOnly: true });
  const playableBounds = boardBounds(playableOnly, { topSurfacesOnly: true });
  assert.ok(scenicBounds.minY < playableBounds.minY);
  assert.ok(scenicBounds.width > playableBounds.width);

  const retainedOnly = blankBoard({
    decorativeApron: { top: 0, right: 0, bottom: 0, left: 0 },
    decorativeFootprint: [],
    decorativeCells: { '9,9': 'dirt-surf-6' },
  });
  assert.deepEqual(topTerrainOps(retainedOnly), topTerrainOps(playableOnly));
  assert.deepEqual(
    boardBounds(retainedOnly, { topSurfacesOnly: true }),
    boardBounds(playableOnly, { topSurfacesOnly: true }),
  );
  assert.deepEqual(
    uniqueDrawSrcs(retainedOnly, { topSurfacesOnly: true }),
    uniqueDrawSrcs(playableOnly, { topSurfacesOnly: true }),
  );
});

test('scenic inheritance clamps to the exact boundary, preserves boundary voids, and accepts an authored override', () => {
  const inherited = blankBoard({
    cells: { '0,0': 'grass-surf-0' },
    decorativeApron: { top: 0, right: 0, bottom: 1, left: 0 },
  });
  const inheritedCells = new Map(boardVisualTerrainCells(inherited).map((cell) => [cell.key, cell.tileId]));
  assert.equal(inheritedCells.get('0,1'), 'grass-surf-0');
  assert.equal(inheritedCells.get('1,1'), undefined);
  assert.equal(topTerrainOps(inherited).length, 2);

  const authored = {
    ...inherited,
    decorativeCells: { '1,1': 'stone-surf-0' },
  };
  const authoredCells = new Map(boardVisualTerrainCells(authored).map((cell) => [cell.key, cell.tileId]));
  assert.equal(authoredCells.get('1,1'), 'stone-surf-0');
  assert.equal(topTerrainOps(authored).length, 3);
});

test('generation-reference mode preserves authored Subterrain faces without synthesizing scenic skirts', () => {
  const board = blankBoard({
    cols: 1,
    cells: { '0,0': 'grass-surf-0' },
    decorativeApron: { top: 0, right: 1, bottom: 0, left: 0 },
    subterrain: {
      '0,0:south': 'earth',
      '1,0:south': 'bedrock',
    },
  });
  const sideSources = new Set([
    subterrainMaterialSrc('earth'),
    subterrainMaterialSrc('bedrock'),
  ]);

  const generationReferenceSideOps = boardDrawOps(board, { topSurfacesOnly: true })
    .filter((op) => sideSources.has(op.src));
  assert.equal(generationReferenceSideOps.length, 2);
  assert.deepEqual(new Set(generationReferenceSideOps.map((op) => op.src)), sideSources);

  const withoutAuthoredSubterrain = { ...board, subterrain: {} };
  assert.equal(
    boardDrawOps(withoutAuthoredSubterrain, { topSurfacesOnly: true })
      .filter((op) => sideSources.has(op.src)).length,
    0,
  );
});

test('scenic fences and walls use the shared scene pass exactly once', () => {
  const board = blankBoard({
    decorativeFootprint: ['-1,0'],
    decorativeCells: { '-1,0': 'grass-surf-0' },
    decorativeFences: { '-1,0|0,0': 'wood' },
    decorativeWalls: { '-2,0|-1,0': 'stone' },
  });
  const ops = boardDrawOps(board, { topSurfacesOnly: true });

  assert.equal(ops.filter((op) => op.src === fenceFrameSrc('wood', 2)).length, 1);
  assert.equal(ops.filter((op) => op.src === wallFrameSrc('stone', 8)).length, 1);
});
