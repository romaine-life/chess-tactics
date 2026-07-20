import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test, { after, before } from 'node:test';
import { installTestDrawableCatalog, resetTestDrawableCatalog } from './drawableCatalog.mjs';

const require = createRequire(import.meta.url);
const {
  buildPredrawnGenerationDefinition,
  decodeBoard,
  encodeBoard,
} = require('../dist/index.cjs');

before(installTestDrawableCatalog);
after(resetTestDrawableCatalog);

const HOLD_BRIDGE = [
  'RRRRRVVRAAGR',
  'RGGARVGRGGGR',
  'RGGGRVVRGGGR',
  'RGGGRSSRGGGR',
  'RGGGRSSRGGGR',
  'RGGGRVVRGGGR',
  'RGGGRGVRGGSR',
  'RSAGRVVRRRRR',
];

const TILE_FOR = {
  R: 'dirt-surf-6',
  G: 'grass-surf-0',
  S: 'stone-surf-0',
  A: 'sand-surf-5',
};

function holdBridgeLevel() {
  const cells = {};
  const features = {};
  const terrain = [];
  HOLD_BRIDGE.forEach((row, y) => [...row].forEach((token, x) => {
    if (token !== 'V') cells[`${x},${y}`] = TILE_FOR[token];
    if (token === 'R') features[`${x},${y}`] = { kind: 'road', material: 'dirt' };
    terrain.push({
      x,
      y,
      terrain: token === 'V'
        ? 'void'
        : token === 'R'
          ? 'road'
          : token === 'G'
            ? 'grass'
            : token === 'S'
              ? 'stone'
              : 'sand',
      elevation: 0,
    });
  }));
  // The river continues visibly into scenic terrain, but only its playable endpoint is semantic.
  features['-1,0'] = { kind: 'road', material: 'dirt' };
  features['-2,0'] = { kind: 'river', material: 'water' };
  const board = {
    cols: 12,
    rows: 8,
    cells,
    decorativeApron: { top: 1, right: 1, bottom: 1, left: 1 },
    decorativeFootprint: ['-2,0', '12,0'],
    decorativeCells: { '-2,0': 'grass-surf-0', '12,0': 'stone-surf-0' },
    predrawnGenerationFrame: { version: 1, x: -500, y: -200, width: 1536, height: 864 },
    units: {},
    doodads: { '12,0': { doodadId: 'scenic-rock' } },
    props: { '-2,0': { propId: 'scenic-tree' } },
    cover: {
      '8,1': 'sparse',
      '2,5': 'sparse',
      '1,6': 'sparse',
      '8,2': 'sparse',
      '8,3': 'sparse',
      '2,1': 'sparse',
      '2,2': 'sparse',
    },
    features,
    fences: {},
    fencePosts: {},
    walls: {},
    wallArt: {},
    featureCuts: {
      '4,2|4,3': true,
      '7,4|7,5': true,
    },
    featureExits: {
      '4,3|5,3': true,
      '4,4|5,4': true,
      '6,3|7,3': true,
      '6,4|7,4': true,
    },
    zoneEntries: [],
    zones: {},
  };
  return {
    formatVersion: 1,
    id: 'off-l-hold-bridge',
    name: 'Hold the Bridge',
    notes: 'story copy must not enter generation semantics',
    board: { cols: 12, rows: 8, heightLevels: 1 },
    objective: 'rival-kings',
    difficulty: 'hard',
    economy: { startingFunds: 1400, incomePerTurn: 200 },
    theme: 'riverlands',
    boardCode: encodeBoard(board),
    layers: { terrain, decals: [], zones: [], units: [], props: [], fences: [] },
  };
}

function definitionFor(level) {
  return buildPredrawnGenerationDefinition(level, {
    runId: 'hold-bridge-isolated-test',
    referenceSourceSlot: 'canonical-level-export/off-l-hold-bridge/authored-surface-no-cover',
    provider: 'test-provider',
    model: 'test-model',
    resolveProp: () => undefined,
  });
}

test('Hold Bridge definition is derived as a 12x8 irregular board with exact internal road stubs', () => {
  const definition = definitionFor(holdBridgeLevel());
  const road = definition.linearFeatures.find((feature) => feature.kind === 'road');

  assert.equal(definition.schemaVersion, 3);
  assert.deepEqual(definition.reference.viewport, {
    version: 1,
    coordinateSpace: 'canonical-board-render-px-1x',
    x: -500,
    y: -200,
    width: 1536,
    height: 864,
  });
  assert.equal(definition.board.columns, 12);
  assert.equal(definition.board.rows, 8);
  assert.equal(definition.board.cells.flat().filter((cell) => !cell.playable).length, 10);
  assert.equal(road.cells.length, 38);
  assert.deepEqual(road.exits, [
    [[0, 0], [-1, 0]],
    [[4, 3], [5, 3]],
    [[4, 4], [5, 4]],
    [[7, 3], [6, 3]],
    [[7, 4], [6, 4]],
  ]);
  assert.equal(definition.outerPerimeter.edges.length, 40);
  assert.deepEqual(definition.outerPerimeter.openings, [{ cell: [0, 0], neighbor: [-1, 0] }]);
  assert.equal(definition.linearFeatures.some((feature) => feature.kind === 'river'), false);
  assert.equal(definition.impassableTransitions.length, 20);
  assert.deepEqual(definition.barriers, []);
  // Scenic objects are appearance owned by Image 1, never gameplay footprints.
  assert.deepEqual(definition.footprints, []);
  assert.deepEqual(definition.board.projection.axisX, { screenDx: 48, screenDy: 27 });
  assert.deepEqual(definition.board.projection.axisY, { screenDx: -48, screenDy: 27 });
  assert.equal(JSON.stringify(definition).includes('riverlands'), false);
  assert.equal(JSON.stringify(definition).includes('story copy'), false);
});

test('definition generation fails closed without a saved canonical generation frame', () => {
  const level = holdBridgeLevel();
  const board = decodeBoard(level.boardCode);
  delete board.predrawnGenerationFrame;
  level.boardCode = encodeBoard(board);

  assert.throws(
    () => definitionFor(level),
    /canonical level is missing its saved generation frame/,
  );
});

test('definition generation fails closed when durable terrain and boardCode disagree', () => {
  const level = holdBridgeLevel();
  level.layers.terrain.find((cell) => cell.x === 5 && cell.y === 0).terrain = 'grass';

  assert.throws(
    () => definitionFor(level),
    /boardCode and terrain disagree about void coordinate 5,0/,
  );
});
