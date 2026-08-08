import assert from 'node:assert/strict';
import test from 'node:test';
import boardRender from '../dist/index.cjs';
import {
  installTestDrawableCatalog,
  resetTestDrawableCatalog,
} from './drawableCatalog.mjs';

const {
  decodeBoard,
  encodeBoard,
  LEVEL_FORMAT_VERSION,
  withPredrawnBoardSurface,
  withoutPredrawnBoardOcclusionMask,
  withoutPredrawnBoardSurface,
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

const versionedSurface = {
  kind: 'predrawn',
  schemaVersion: 2,
  backgroundVersionId: '39ec915c-cec2-47a7-8111-d5bcaf0b5b38',
  occlusionVersionId: '2c7c3d23-4913-4671-b7d9-5fddbe564150',
  frameWidth: 1672,
  frameHeight: 941,
  worldBounds: { minX: -128, minY: 12, width: 1672, height: 941 },
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
    formatVersion: LEVEL_FORMAT_VERSION,
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

function boardWire(code) {
  return JSON.parse(Buffer.from(code, 'base64url').toString('latin1'));
}

function boardCodeFromWire(wire) {
  return Buffer.from(JSON.stringify(wire), 'latin1').toString('base64url');
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
  const {
    surface: sourceSurface,
    backgroundMode: sourceBackgroundMode,
    ...sourceBoardFields
  } = sourceBoard;
  const {
    surface: patchedSurface,
    backgroundMode: patchedBackgroundMode,
    ...patchedBoardFields
  } = patchedBoard;
  assert.equal(sourceSurface, undefined);
  assert.equal(sourceBackgroundMode, 'legacy');
  assert.deepEqual(patchedSurface, surface);
  assert.equal(patchedBackgroundMode, 'ai');
  assert.deepEqual(patchedBoardFields, sourceBoardFields);
  assert.deepEqual(source, level());
  assert.equal(withPredrawnBoardSurface(source, surface).boardCode, patchedCode);
});

test('withPredrawnBoardSurface rejects levels without a valid lossless board', () => {
  assert.throws(() => withPredrawnBoardSurface({ ...level(), boardCode: undefined }, surface), /no lossless boardCode/);
  assert.throws(() => withPredrawnBoardSurface({ ...level(), boardCode: 'not-board-code' }, surface), /invalid boardCode/);
});

test('withoutPredrawnBoardSurface forgets only a dormant Legacy selection', () => {
  const selected = withPredrawnBoardSurface(level(), versionedSurface);
  const selectedBoard = decodeBoard(selected.boardCode);
  const dormant = {
    ...selected,
    boardCode: encodeBoard({ ...selectedBoard, backgroundMode: 'legacy' }),
  };
  const cleared = withoutPredrawnBoardSurface(dormant);
  const { boardCode: dormantCode, ...dormantFields } = dormant;
  const { boardCode: clearedCode, ...clearedFields } = cleared;
  const { surface: dormantSurface, ...dormantBoardFields } = decodeBoard(dormantCode);
  const { surface: clearedSurface, ...clearedBoardFields } = decodeBoard(clearedCode);

  assert.deepEqual(clearedFields, dormantFields);
  assert.deepEqual(dormantSurface, versionedSurface);
  assert.equal(clearedSurface, undefined);
  assert.equal(clearedBoardFields.backgroundMode, 'legacy');
  assert.deepEqual(clearedBoardFields, dormantBoardFields);
});

test('withoutPredrawnBoardSurface preserves unavailable wall, wall-art, and fence wire fields', () => {
  installTestDrawableCatalog();
  try {
    const selected = withPredrawnBoardSurface(level(), versionedSurface);
    const dormantWire = {
      ...boardWire(selected.boardCode),
      bm: 'legacy',
      wl: { '0,0|1,0': 'retired-wall-material' },
      wa: { '0,0|1,0': 'retired-wall-art' },
      fe: { '0,0|0,1': 'retired-fence-material' },
      fp: { '0,0': 'retired-fence-material' },
    };
    const dormant = {
      ...selected,
      boardCode: boardCodeFromWire(dormantWire),
    };

    // These database-owned values are deliberately unavailable to the active catalog. The
    // ordinary editor decode omits several of them, which is why archive detach must not re-encode.
    const catalogResolvedBoard = decodeBoard(dormant.boardCode);
    assert.deepEqual(catalogResolvedBoard.walls, {});
    assert.deepEqual(catalogResolvedBoard.wallArt, {});
    assert.deepEqual(catalogResolvedBoard.fencePosts, {});

    const cleared = withoutPredrawnBoardSurface(dormant);
    const expectedWire = structuredClone(dormantWire);
    delete expectedWire.pd;

    assert.deepEqual(boardWire(cleared.boardCode), expectedWire);
    assert.deepEqual(boardWire(dormant.boardCode), dormantWire);
  } finally {
    resetTestDrawableCatalog();
  }
});

test('withoutPredrawnBoardSurface is exact for an empty Legacy selection and rejects active AI', () => {
  const legacy = level();
  assert.equal(withoutPredrawnBoardSurface(legacy), legacy);
  assert.throws(
    () => withoutPredrawnBoardSurface(withPredrawnBoardSurface(legacy, surface)),
    /must use Legacy background mode/,
  );
});

test('withoutPredrawnBoardSurface rejects levels without a valid lossless board', () => {
  assert.throws(() => withoutPredrawnBoardSurface({ ...level(), boardCode: undefined }), /no lossless boardCode/);
  assert.throws(() => withoutPredrawnBoardSurface({ ...level(), boardCode: 'not-board-code' }), /invalid boardCode/);
});

test('withoutPredrawnBoardOcclusionMask preserves the exact base surface, mode, and unrelated wire fields', () => {
  installTestDrawableCatalog();
  try {
    const selected = withPredrawnBoardSurface(level(), versionedSurface);
    const selectedWire = {
      ...boardWire(selected.boardCode),
      bm: 'legacy',
      wl: { '0,0|1,0': 'retired-wall-material' },
      wa: { '0,0|1,0': 'retired-wall-art' },
      fe: { '0,0|0,1': 'retired-fence-material' },
    };
    const dormant = { ...selected, boardCode: boardCodeFromWire(selectedWire) };
    const detached = withoutPredrawnBoardOcclusionMask(
      dormant,
      versionedSurface.backgroundVersionId,
      versionedSurface.occlusionVersionId,
    );
    const expectedWire = structuredClone(selectedWire);
    expectedWire.pd[2] = null;

    assert.deepEqual(boardWire(detached.boardCode), expectedWire);
    assert.equal(decodeBoard(detached.boardCode).backgroundMode, 'legacy');
    assert.equal(
      decodeBoard(detached.boardCode).surface.backgroundVersionId,
      versionedSurface.backgroundVersionId,
    );
    assert.equal(decodeBoard(detached.boardCode).surface.occlusionVersionId, undefined);
    assert.deepEqual(boardWire(dormant.boardCode), selectedWire);
  } finally {
    resetTestDrawableCatalog();
  }
});

test('withoutPredrawnBoardOcclusionMask preserves schema-v3 move-highlight calibration', () => {
  const v3Surface = {
    ...versionedSurface,
    schemaVersion: 3,
    moveHighlightProfile: {
      schema: 'predrawn-move-highlight-profile-v1',
      backgroundVersionId: versionedSurface.backgroundVersionId,
      coordinateBasis: 'cell-diamond-10000-v1',
      environmentGeometrySha256: 'a'.repeat(64),
      profileSha256: 'b'.repeat(64),
      cells: {
        '1,0': [5000, 1000, 9000, 5000, 5000, 9000, 1000, 5000],
      },
    },
  };
  const selected = withPredrawnBoardSurface(level(), v3Surface);
  const detached = withoutPredrawnBoardOcclusionMask(
    selected,
    v3Surface.backgroundVersionId,
    v3Surface.occlusionVersionId,
  );
  const { occlusionVersionId: _removedOcclusionVersionId, ...expectedSurface } = v3Surface;

  assert.deepEqual(decodeBoard(detached.boardCode).surface, expectedSurface);
  assert.equal(decodeBoard(detached.boardCode).backgroundMode, 'ai');
  assert.throws(
    () => withoutPredrawnBoardOcclusionMask(
      selected,
      '11111111-1111-4111-8111-111111111111',
      v3Surface.occlusionVersionId,
    ),
    /does not select the expected background and occlusion mask/,
  );
});

test('a grown or hand-placed grid never moves or rescales the artwork it sits on', () => {
  installTestDrawableCatalog();
  try {
    const { boardDrawOps, predrawnRenderSurface } = boardRender;
    const plateOp = (b) => boardDrawOps(b).find((op) => op.z === -100000);
    const base = { ...board(), backgroundMode: 'ai', surface: versionedSurface };

    // Growing the grid is exactly the case the owner asked for: 5x11 becomes 6x12 and the picture
    // stays pinned to its own recorded world bounds rather than stretching to the new dimensions.
    const grown = { ...base, cols: 6, rows: 12, predrawnGridDetached: true };
    assert.deepEqual(plateOp(grown), plateOp(base));
    assert.equal(plateOp(base).dx, versionedSurface.worldBounds.minX);
    assert.equal(plateOp(base).dw, versionedSurface.worldBounds.width);

    // Sliding the grid moves the PICTURE under it by that step, and never its size.
    const slid = { ...base, predrawnPlateOffset: { left: -64, top: 32 } };
    assert.equal(plateOp(slid).dx, versionedSurface.worldBounds.minX - 64);
    assert.equal(plateOp(slid).dy, versionedSurface.worldBounds.minY + 32);
    assert.equal(plateOp(slid).dw, plateOp(base).dw);
    assert.equal(plateOp(slid).dh, plateOp(base).dh);

    // The offset is a render-time placement only. The selection keeps the exact bounds every
    // lineage and identity check compares, so a moved plate is still the same artifact.
    assert.deepEqual(slid.surface.worldBounds, versionedSurface.worldBounds);
    assert.deepEqual(predrawnRenderSurface(base).worldBounds, versionedSurface.worldBounds);
  } finally {
    resetTestDrawableCatalog();
  }
});
