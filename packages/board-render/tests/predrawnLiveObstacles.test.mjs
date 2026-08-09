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
const { boardDrawOps } = require('../dist/index.cjs');

before(() => {
  installTestDrawableCatalogWithStructures();
  installTestPropSeats();
});
after(() => {
  resetTestPropSeats();
  resetTestDrawableCatalog();
});

// ADR-0534. A plate paints its own scenery, so an ordinary prop under one is already in the
// picture. A rock the owner stands ON the plate is depicted by nothing and has to draw live.
function board(overrides = {}) {
  return {
    cols: 5,
    rows: 11,
    cells: Object.fromEntries(
      Array.from({ length: 55 }, (_, index) => [`${index % 5},${Math.floor(index / 5)}`, 'unused-test-tile']),
    ),
    backgroundMode: 'ai',
    surface: {
      kind: 'predrawn',
      slot: 'boards/review/plate.png',
      frameWidth: 1680,
      frameHeight: 935,
    },
    units: {},
    doodads: {},
    props: {},
    cover: {},
    features: {},
    featureCuts: {},
    featureExits: {},
    fences: {},
    fencePosts: {},
    walls: {},
    wallArt: {},
    zoneEntries: [],
    zones: {},
    generatedRegions: [],
    ...overrides,
  };
}

const structureOpsAt = (source, anchor) => boardDrawOps(source)
  .filter((op) => op.structure && `${op.structure.x},${op.structure.y}` === anchor);

test('a plate suppresses the props it painted and draws the obstacle standing on it', () => {
  const source = board({
    props: { '1,1': { propId: 'fieldstone' }, '3,3': { propId: 'rock' } },
    liveProps: ['3,3'],
  });

  // The baked one is already in the raster; drawing it again would stand a second rock on its twin.
  assert.equal(structureOpsAt(source, '1,1').length, 0);
  const live = structureOpsAt(source, '3,3');
  assert.ok(live.length > 0, 'a live obstacle must draw over the plate');
  assert.ok(live.every((op) => op.layer === 'scene'), 'live obstacles ride the layer the plate occludes');
  assert.ok(live.every((op) => op.structure.kind === 'rock'));
});

test('a live obstacle carries the identity the board entrance falls by', () => {
  const source = board({ props: { '3,3': { propId: 'rock' } }, liveProps: ['3,3'] });
  const ops = structureOpsAt(source, '3,3');
  // ADR-0518 resolves the drop from `structure.kind` and holds a prop's clipped halves together by
  // `structure.key`, so a rock over artwork falls exactly as one standing on tiles does.
  assert.ok(ops.length > 0);
  assert.ok(ops.every((op) => op.structure.kind === 'rock'));
  assert.deepEqual([...new Set(ops.map((op) => op.structure.key))], ['3,3']);
});

test('the plate still owns its scenery: a marked tree or house does not stand on artwork', () => {
  // The kind gate lives at render, not only in the editor, so a hand-authored board code cannot
  // plant a cottage on a painting that already drew its own.
  const marked = board({
    props: { '1,1': { propId: 'oak' }, '3,3': { propId: 'cottage' } },
    liveProps: ['1,1', '3,3'],
  });
  assert.equal(structureOpsAt(marked, '1,1').length, 0);
  assert.equal(structureOpsAt(marked, '3,3').length, 0);
});

test('a board with no plate is untouched: every prop draws, marked or not', () => {
  const tileset = board({
    backgroundMode: 'legacy',
    surface: undefined,
    props: { '1,1': { propId: 'oak' }, '3,3': { propId: 'rock' } },
  });
  assert.ok(structureOpsAt(tileset, '1,1').length > 0);
  assert.ok(structureOpsAt(tileset, '3,3').length > 0);
});
