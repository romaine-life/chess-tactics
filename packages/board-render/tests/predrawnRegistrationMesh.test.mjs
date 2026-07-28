import assert from 'node:assert/strict';
import test from 'node:test';
import boardRender from '../dist/index.cjs';

const {
  MAX_PREDRAWN_MESH_OVERRIDES,
  clearAllPredrawnMeshOverrides,
  clearPredrawnMeshCellOverrides,
  clearPredrawnMeshNodeOverride,
  movePredrawnMeshNode,
  parsePredrawnBoardRegistration,
  predrawnBoardRasterTransform,
  predrawnBoardSourcePoint,
  predrawnMeshCellsForNode,
  predrawnMeshNodeIsOverridden,
  predrawnMeshValidationIssue,
  predrawnSourceGridPoint,
  predrawnSourceMeshNode,
  predrawnSourceMeshPoint,
  projectPredrawnPoint,
  rectifyPredrawnFramePixels,
  serializePredrawnBoardPreviewRegistration,
  setPredrawnMeshNodeOverride,
  validPredrawnMeshOverrides,
} = boardRender;

const squareRegistration = {
  sourceWidth: 100,
  sourceHeight: 100,
  north: [0, 0],
  east: [100, 0],
  south: [100, 100],
  west: [0, 100],
  gridColumns: 2,
  gridRows: 2,
  columnGuides: [0, 0.4, 1],
  rowGuides: [0, 0.5, 1],
};

const squareCells = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: 1, y: 1 },
];

function approx(actual, expected, epsilon = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
}

function approxPoint(actual, expected, epsilon = 1e-6) {
  assert.ok(actual);
  approx(actual[0], expected[0], epsilon);
  approx(actual[1], expected[1], epsilon);
}

test('legacy through v4 registrations retain their exact compact representation', () => {
  const registrations = [
    '100,100,0,0,100,0,100,100,0,100',
    'v2;100,100,0,0,100,0,100,100,0,100;0,0.4,1;0,0.5,1',
    'v3;100,100,0,0,100,0,100,100,0,100;2,2;0,0.4,1;0,0.5,1',
    'v4;100,100,0,0,100,0,100,100,0,100;2,2;0,0.4,1;0,0.5,1;1,1,99,1,99,99,1,99',
  ];
  registrations.forEach((serialized) => {
    const parsed = parsePredrawnBoardRegistration(serialized);
    assert.ok(parsed);
    assert.equal(serializePredrawnBoardPreviewRegistration(parsed), serialized);
    assert.equal(parsed.meshOverrides, undefined);
  });
});

test('v5 serializes sparse source-pixel nodes in stable row-major order', () => {
  const registration = {
    ...squareRegistration,
    gridColumns: 3,
    gridRows: 3,
    columnGuides: [0, 0.3, 0.7, 1],
    rowGuides: [0, 0.3, 0.7, 1],
    meshOverrides: [
      { column: 2, row: 1, point: [68.1234, 32.9876] },
      { column: 1, row: 1, point: [32.0004, 31] },
    ],
  };
  const serialized = serializePredrawnBoardPreviewRegistration(registration);
  assert.equal(
    serialized,
    'v5;100,100,0,0,100,0,100,100,0,100;3,3;0,0.3,0.7,1;0,0.3,0.7,1;;1,1,32,31|2,1,68.123,32.988',
  );
  const parsed = parsePredrawnBoardRegistration(serialized);
  assert.deepEqual(parsed?.meshOverrides, [
    { column: 1, row: 1, point: [32, 31] },
    { column: 2, row: 1, point: [68.123, 32.988] },
  ]);
  assert.equal(serializePredrawnBoardPreviewRegistration(parsed), serialized);

  const withBoundary = {
    ...parsed,
    boundaryReference: {
      north: [1, 1],
      east: [99, 1],
      south: [99, 99],
      west: [1, 99],
    },
  };
  const withBoundarySerialized = serializePredrawnBoardPreviewRegistration(withBoundary);
  assert.match(withBoundarySerialized, /;1,1,99,1,99,99,1,99;1,1,32,31\|2,1,68\.123,32\.988$/);
  assert.deepEqual(
    parsePredrawnBoardRegistration(withBoundarySerialized)?.boundaryReference,
    withBoundary.boundaryReference,
  );
});

test('v5 validates the exact rounded mesh and guide geometry that it serializes', () => {
  const roundingIntoFold = {
    ...squareRegistration,
    meshOverrides: [{ column: 1, row: 1, point: [99.9996, 50] }],
  };
  assert.equal(predrawnMeshValidationIssue(roundingIntoFold), undefined);
  assert.throws(
    () => serializePredrawnBoardPreviewRegistration(roundingIntoFold),
    /folds or degenerates cell/,
  );

  const roundingGuidesTogether = {
    ...squareRegistration,
    columnGuides: [0, 0.0000014, 1],
    meshOverrides: [{ column: 1, row: 1, point: [1, 50] }],
  };
  assert.equal(predrawnMeshValidationIssue(roundingGuidesTogether), undefined);
  assert.throws(
    () => serializePredrawnBoardPreviewRegistration(roundingGuidesTogether),
    /canonically distinct valid guides/,
  );
});

test('canonical coarse-node no-ops collapse back to the historical registration format', () => {
  const serialized = serializePredrawnBoardPreviewRegistration({
    ...squareRegistration,
    meshOverrides: [{ column: 1, row: 1, point: [40.0004, 49.9996] }],
  });
  assert.equal(
    serialized,
    'v3;100,100,0,0,100,0,100,100,0,100;2,2;0,0.4,1;0,0.5,1',
  );
  assert.equal(parsePredrawnBoardRegistration(serialized)?.meshOverrides, undefined);

  const parsedNoopV5 = parsePredrawnBoardRegistration(
    'v5;100,100,0,0,100,0,100,100,0,100;2,2;0,0.4,1;0,0.5,1;;1,1,40,50',
  );
  assert.ok(parsedNoopV5);
  assert.equal(parsedNoopV5.meshOverrides, undefined);
  assert.equal(serializePredrawnBoardPreviewRegistration(parsedNoopV5), serialized);

  const setNoop = setPredrawnMeshNodeOverride(squareRegistration, 1, 1, [40, 50]);
  assert.ok(setNoop);
  assert.equal(setNoop.meshOverrides, undefined);
});

test('v5 parsing rejects out-of-frame, duplicate, boundary, and folded nodes', () => {
  const prefix = 'v5;100,100,0,0,100,0,100,100,0,100;2,2;0,0.4,1;0,0.5,1;;';
  assert.equal(parsePredrawnBoardRegistration(`${prefix}1,1,101,50`), undefined);
  assert.equal(parsePredrawnBoardRegistration(`${prefix}1,1,40,50|1,1,41,50`), undefined);
  assert.equal(parsePredrawnBoardRegistration(`${prefix}0,0,1,1`), undefined);
  assert.equal(parsePredrawnBoardRegistration(`${prefix}1,0,40,1`), undefined);
  assert.equal(parsePredrawnBoardRegistration(`${prefix}1,1,100,50`), undefined);

  const folded = {
    ...squareRegistration,
    meshOverrides: [{ column: 1, row: 1, point: [100, 50] }],
  };
  assert.match(predrawnMeshValidationIssue(folded), /folds or degenerates cell/);
  assert.equal(validPredrawnMeshOverrides(folded), false);
  assert.throws(
    () => serializePredrawnBoardPreviewRegistration(folded),
    /folds or degenerates cell/,
  );
});

test('shared-node setters normalize interior pixels, reject boundaries, and reset sparsely', () => {
  const threeByThree = {
    ...squareRegistration,
    gridColumns: 3,
    gridRows: 3,
    columnGuides: [0, 0.3, 0.7, 1],
    rowGuides: [0, 0.3, 0.7, 1],
  };
  const withCenter = setPredrawnMeshNodeOverride(threeByThree, 1, 1, [32.1234, 31.9876]);
  assert.ok(withCenter);
  assert.deepEqual(withCenter.meshOverrides, [
    { column: 1, row: 1, point: [32.123, 31.988] },
  ]);
  assert.equal(predrawnMeshNodeIsOverridden(withCenter, 1, 1), true);
  assert.deepEqual(predrawnMeshCellsForNode(withCenter, 1, 1), [
    { column: 0, row: 0 },
    { column: 1, row: 0 },
    { column: 0, row: 1 },
    { column: 1, row: 1 },
  ]);

  const withSecond = setPredrawnMeshNodeOverride(withCenter, 2, 1, [68, 32]);
  assert.ok(withSecond);
  assert.deepEqual(predrawnMeshCellsForNode(withSecond, 2, 1), [
    { column: 1, row: 0 },
    { column: 2, row: 0 },
    { column: 1, row: 1 },
    { column: 2, row: 1 },
  ]);
  const clearedCenter = clearPredrawnMeshNodeOverride(withSecond, 1, 1);
  assert.deepEqual(clearedCenter.meshOverrides, [
    { column: 2, row: 1, point: [68, 32] },
  ]);
  assert.equal(clearPredrawnMeshCellOverrides(withSecond, 1, 0).meshOverrides, undefined);
  assert.equal(clearAllPredrawnMeshOverrides(withSecond).meshOverrides, undefined);

  assert.equal(setPredrawnMeshNodeOverride(withCenter, 0, 0, [2, 3]), undefined);
  assert.equal(setPredrawnMeshNodeOverride(withCenter, 1, 0, [32, 1]), undefined);
  assert.equal(movePredrawnMeshNode(withCenter, 0, 0, [2, 3]), undefined);
});

test('mesh lookup preserves the coarse map and changes only cells sharing moved nodes', () => {
  approxPoint(predrawnSourceMeshPoint(squareRegistration, 0.25, 0.5), [20, 50]);
  const withCenter = setPredrawnMeshNodeOverride(squareRegistration, 1, 1, [44, 60]);
  assert.ok(withCenter);
  approxPoint(predrawnSourceMeshNode(withCenter, 1, 1), [44, 60]);
  approxPoint(predrawnSourceMeshPoint(withCenter, 0.5, 0.5), [44, 60]);

  const fromWest = predrawnSourceMeshPoint(withCenter, 0.5 - 1e-9, 0.25);
  const fromEast = predrawnSourceMeshPoint(withCenter, 0.5 + 1e-9, 0.25);
  approxPoint(fromWest, fromEast, 1e-6);

  const threeByThree = {
    ...squareRegistration,
    gridColumns: 3,
    gridRows: 3,
    columnGuides: [0, 0.2, 0.65, 1],
    rowGuides: [0, 0.3, 0.7, 1],
  };
  const local = setPredrawnMeshNodeOverride(threeByThree, 1, 1, [25, 35]);
  assert.ok(local);
  approxPoint(
    predrawnSourceMeshPoint(local, 5 / 6, 5 / 6),
    predrawnSourceMeshPoint(threeByThree, 5 / 6, 5 / 6),
  );

  const diamond = {
    ...squareRegistration,
    north: [50, 0],
    east: [100, 50],
    south: [50, 100],
    west: [0, 50],
    columnGuides: [0, 0.5, 1],
  };
  const diamondLocal = setPredrawnMeshNodeOverride(diamond, 1, 1, [55, 52]);
  assert.ok(diamondLocal);
  approxPoint(predrawnSourceMeshNode(diamondLocal, 1, 1), [55, 52]);
});

test('the inverse raster transform consumes v5 mesh points and keeps outside scenery on the coarse map', () => {
  const withCenter = setPredrawnMeshNodeOverride(squareRegistration, 1, 1, [44, 60]);
  assert.ok(withCenter);
  const surface = { frameWidth: 100, frameHeight: 100 };
  const oldTransform = predrawnBoardRasterTransform(surface, squareCells, squareRegistration);
  const meshTransform = predrawnBoardRasterTransform(surface, squareCells, withCenter);
  assert.ok(oldTransform);
  assert.ok(meshTransform?.rectification?.mesh);

  const coarseCenter = predrawnSourceGridPoint(squareRegistration, 0.5, 0.5);
  const boardCenter = projectPredrawnPoint(meshTransform.frameToBoard, coarseCenter);
  approxPoint(predrawnBoardSourcePoint(meshTransform, boardCenter), [44, 60]);

  const scaledTransform = predrawnBoardRasterTransform(
    { frameWidth: 200, frameHeight: 200 },
    squareCells,
    withCenter,
  );
  assert.ok(scaledTransform);
  const scaledCoarseCenter = predrawnSourceGridPoint({
    ...squareRegistration,
    sourceWidth: 200,
    sourceHeight: 200,
    north: [0, 0],
    east: [200, 0],
    south: [200, 200],
    west: [0, 200],
  }, 0.5, 0.5);
  assert.ok(scaledCoarseCenter);
  const scaledBoardCenter = projectPredrawnPoint(scaledTransform.frameToBoard, scaledCoarseCenter);
  approxPoint(predrawnBoardSourcePoint(scaledTransform, scaledBoardCenter), [88, 120]);

  const outsideFramePoint = predrawnSourceGridPoint(squareRegistration, -0.1, 0.25);
  const outsideBoardPoint = projectPredrawnPoint(meshTransform.frameToBoard, outsideFramePoint);
  const outsideSource = predrawnBoardSourcePoint(meshTransform, outsideBoardPoint);
  const oldOutsideSource = predrawnBoardSourcePoint(oldTransform, outsideBoardPoint);
  assert.ok(outsideSource);
  assert.ok(Number.isFinite(outsideSource[0]) && Number.isFinite(outsideSource[1]));
  approxPoint(outsideSource, oldOutsideSource);

  assert.equal(oldTransform.rectification?.mesh, undefined);
});

test('the deterministic raster pass samples pixels through the shared mesh', () => {
  const registration = {
    ...squareRegistration,
    sourceWidth: 5,
    sourceHeight: 5,
    north: [0, 0],
    east: [4, 0],
    south: [4, 4],
    west: [0, 4],
    columnGuides: [0, 0.5, 1],
  };
  const withCenter = setPredrawnMeshNodeOverride(registration, 1, 1, [3, 2]);
  assert.ok(withCenter);
  const data = new Uint8ClampedArray(5 * 5 * 4);
  for (let y = 0; y < 5; y += 1) {
    for (let x = 0; x < 5; x += 1) {
      const index = (y * 5 + x) * 4;
      data[index] = x * 20;
      data[index + 1] = y * 20;
      data[index + 3] = 255;
    }
  }
  const coarse = rectifyPredrawnFramePixels({ width: 5, height: 5, data }, registration);
  const refined = rectifyPredrawnFramePixels({ width: 5, height: 5, data }, withCenter);
  const center = (2 * 5 + 2) * 4;
  assert.equal(coarse[center], 40);
  assert.equal(refined[center], 60);
  assert.equal(refined[center + 1], 40);
});

test('invalid exact moves are clamped to the furthest valid shared-node point', () => {
  assert.equal(setPredrawnMeshNodeOverride(squareRegistration, 1, 1, [100, 50]), undefined);
  const moved = movePredrawnMeshNode(squareRegistration, 1, 1, [100, 50]);
  assert.ok(moved);
  assert.equal(moved.constrained, true);
  assert.ok(moved.point[0] < 100);
  assert.ok(moved.point[0] > 40);
  assert.equal(validPredrawnMeshOverrides(moved.registration), true);
  assert.equal(MAX_PREDRAWN_MESH_OVERRIDES, 1024);
});

test('the canonical sparse-node limit remains below the derivative operation payload cap', () => {
  const cellCount = 34;
  const guides = Array.from({ length: cellCount + 1 }, (_, index) => index / cellCount);
  const available = [];
  for (let row = 1; row < cellCount; row += 1) {
    for (let column = 1; column < cellCount; column += 1) {
      available.push({
        column,
        row,
        point: [
          Number((column / cellCount * 100 + 0.01).toFixed(3)),
          Number((row / cellCount * 100).toFixed(3)),
        ],
      });
    }
  }
  const atLimit = {
    ...squareRegistration,
    gridColumns: cellCount,
    gridRows: cellCount,
    columnGuides: guides,
    rowGuides: guides,
    meshOverrides: available.slice(0, MAX_PREDRAWN_MESH_OVERRIDES),
  };
  const serialized = serializePredrawnBoardPreviewRegistration(atLimit);
  assert.ok(serialized.length < 64 * 1024);
  assert.match(
    predrawnMeshValidationIssue({
      ...atLimit,
      meshOverrides: available.slice(0, MAX_PREDRAWN_MESH_OVERRIDES + 1),
    }),
    /1024-node interior limit/,
  );
});
