import assert from 'node:assert/strict';
import test from 'node:test';
import boardRender from '../dist/index.cjs';

const {
  decodeBoard,
  encodeBoard,
  withPredrawnBoardSurface,
} = boardRender;

const registration = {
  sourceWidth: 1672,
  sourceHeight: 941,
  north: [1034.223, 96.015],
  east: [1375.402, 300.134],
  south: [611.986, 723.847],
  west: [281.123, 532.992],
  gridColumns: 5,
  gridRows: 11,
  columnGuides: [0, 0.2, 0.4, 0.6, 0.8, 1],
  rowGuides: [0, 0.090909, 0.181818, 0.272727, 0.363636, 0.454545, 0.545455, 0.636364, 0.727273, 0.818182, 0.909091, 1],
  boundaryReference: {
    north: [1020.229, 112.223],
    east: [1346.622, 295.818],
    south: [628.558, 699.729],
    west: [302.166, 516.133],
  },
};

const surface = {
  kind: 'predrawn',
  slot: 'boards/fortress-gate/plate.png',
  frameWidth: 1672,
  frameHeight: 941,
  registration,
};

function board() {
  return {
    cols: 5,
    rows: 11,
    playerFaction: 'navy-blue',
    cells: { '0,0': 'sand-surf-1', '4,10': 'sand-surf-2' },
    units: {
      '0,10': { unitId: 'rook-blender-v4-calibrated', direction: 'north', faction: 'navy-blue' },
      '0,0': { unitId: 'knight-fur', direction: 'south', faction: 'crimson' },
    },
    doodads: {},
    props: { '4,5': { propId: 'cottage-small' }, '0,5': { propId: 'fieldstone' } },
    cover: { '3,0': 'filled' },
    features: { '1,5': { kind: 'road', material: 'cobble' } },
    fences: { '0,5|0,6': 'stone', '1,5|2,5': 'stone' },
    featureCuts: {},
    featureExits: { '4,3|5,3': true },
  };
}

function level() {
  return {
    formatVersion: 1,
    id: 'off-l-fortress-gate',
    name: 'Fortress Gate',
    notes: 'Enemy pieces begin from elevated stone ground.',
    board: { cols: 5, rows: 11, heightLevels: 1 },
    objective: 'rival-kings',
    difficulty: 'hard',
    economy: { startingFunds: 1600, incomePerTurn: 120 },
    theme: 'grassland',
    boardCode: encodeBoard(board()),
    victory: [{ id: 'win', if: [{ kind: 'eliminate', side: 'enemy' }], do: [{ kind: 'win', side: 'player' }] }],
    events: [{ id: 'draws', trigger: { kind: 'setup' }, do: [{ kind: 'chess-draws', fiftyMove: true }] }],
    layers: {
      terrain: [{ x: 0, y: 0, terrain: 'sand', elevation: 0 }],
      decals: [],
      zones: [],
      units: [{ x: 0, y: 10, side: 'player', type: 'rook', facing: 'north' }],
      props: [{ x: 4, y: 5, propId: 'cottage-small' }],
      fences: ['0,5|0,6'],
    },
  };
}

test('withPredrawnBoardSurface changes only boardCode and preserves all gameplay fields', () => {
  const source = level();
  const patched = withPredrawnBoardSurface(source, surface);
  const { boardCode: sourceCode, ...sourceFields } = source;
  const { boardCode: patchedCode, ...patchedFields } = patched;

  assert.notEqual(patchedCode, sourceCode);
  assert.deepEqual(patchedFields, sourceFields);
  assert.equal(patched.layers, source.layers);
  assert.equal(patched.victory, source.victory);
  assert.equal(patched.events, source.events);
  assert.equal(patched.economy, source.economy);

  const sourceBoard = decodeBoard(sourceCode);
  const patchedBoard = decodeBoard(patchedCode);
  const { surface: sourceSurface, ...sourceBoardFields } = sourceBoard;
  const { surface: patchedSurface, ...patchedBoardFields } = patchedBoard;
  assert.equal(sourceSurface, undefined);
  assert.deepEqual(patchedSurface, surface);
  assert.deepEqual(patchedBoardFields, sourceBoardFields);
  assert.deepEqual(source, level());
  assert.equal(withPredrawnBoardSurface(source, surface).boardCode, patchedCode);
});

test('withPredrawnBoardSurface rejects levels without a valid lossless board', () => {
  assert.throws(() => withPredrawnBoardSurface({ ...level(), boardCode: undefined }, surface), /no lossless boardCode/);
  assert.throws(() => withPredrawnBoardSurface({ ...level(), boardCode: 'not-board-code' }, surface), /invalid boardCode/);
});
