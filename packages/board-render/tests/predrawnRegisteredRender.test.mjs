import assert from 'node:assert/strict';
import test from 'node:test';
import boardRender from '../dist/index.cjs';

const {
  boardBounds,
  boardDrawOps,
  boardSocialFramingBounds,
  predrawnBoardFramePolygon,
  predrawnBoardHomography,
  predrawnBoardPlacement,
  predrawnBoardRasterBounds,
  predrawnBoardRasterTransform,
  predrawnBoardSourcePoint,
  predrawnSourceGridPoint,
  projectPredrawnPoint,
} = boardRender;

const exactRegistration = {
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

const exactSurface = {
  kind: 'predrawn',
  slot: 'boards/fortress-gate/plate.png',
  frameWidth: 1672,
  frameHeight: 941,
  registration: exactRegistration,
};

const exactCells = Array.from({ length: 11 }, (_, y) => (
  Array.from({ length: 5 }, (__, x) => ({ x, y }))
)).flat();

function approx(actual, expected, epsilon = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
}

function approxPoint(actual, expected, epsilon = 1e-6) {
  assert.ok(actual);
  approx(actual[0], expected[0], epsilon);
  approx(actual[1], expected[1], epsilon);
}

function blankBoard(surface) {
  return {
    cols: 5,
    rows: 11,
    cells: {},
    units: {},
    doodads: {},
    props: {},
    cover: {},
    features: {},
    featureCuts: {},
    featureExits: {},
    surface,
  };
}

test('exact saved v4 registration drives the shared homography and complete frame bounds', () => {
  const homography = predrawnBoardHomography(exactSurface, exactCells, exactRegistration);
  assert.ok(homography);
  const sourceCorners = [
    exactRegistration.north,
    exactRegistration.east,
    exactRegistration.south,
    exactRegistration.west,
  ];
  const boardCorners = [[0, -27], [240, 108], [-288, 405], [-528, 270]];
  sourceCorners.forEach((point, index) => {
    approxPoint(projectPredrawnPoint(homography, point), boardCorners[index]);
  });

  const transform = predrawnBoardRasterTransform(exactSurface, exactCells, exactRegistration);
  assert.ok(transform);
  assert.deepEqual(transform.rectification, undefined);
  const polygon = predrawnBoardFramePolygon(transform);
  assert.ok(polygon);
  const expectedPolygon = [
    [-717.9590863698714, -93.19502639775246],
    [424.0209070110784, -86.65465099816413],
    [481.1032015216235, 554.5226389031735],
    [-747.0930638760369, 571.3938801089367],
  ];
  polygon.forEach((point, index) => approxPoint(point, expectedPolygon[index]));
  const rasterBounds = predrawnBoardRasterBounds(transform);
  assert.ok(rasterBounds);
  approx(rasterBounds.minX, -747.0930638760369);
  approx(rasterBounds.minY, -93.19502639775246);
  approx(rasterBounds.width, 1228.1962653976605);
  approx(rasterBounds.height, 664.5889065066892);

  const board = blankBoard(exactSurface);
  const plate = boardDrawOps(board)[0];
  assert.deepEqual(plate.predrawnTransform, transform);
  assert.equal(plate.dx, rasterBounds.minX);
  assert.equal(plate.dy, rasterBounds.minY);
  assert.equal(plate.dw, rasterBounds.width);
  assert.equal(plate.dh, rasterBounds.height);
  assert.deepEqual(boardSocialFramingBounds(board), boardBounds(board));
});

test('guide remap changes the inverse source lookup while pinned boundary metadata does not', () => {
  const registration = {
    sourceWidth: 100,
    sourceHeight: 100,
    north: [0, 0],
    east: [100, 0],
    south: [100, 100],
    west: [0, 100],
    gridColumns: 2,
    gridRows: 2,
    columnGuides: [0, 0.25, 1],
    rowGuides: [0, 0.5, 1],
    boundaryReference: { north: [1, 2], east: [3, 4], south: [5, 6], west: [7, 8] },
  };
  const surface = {
    kind: 'predrawn',
    slot: 'boards/test/plate.png',
    frameWidth: 100,
    frameHeight: 100,
    registration,
  };
  const cells = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }];
  const transform = predrawnBoardRasterTransform(surface, cells, registration);
  assert.ok(transform?.rectification);
  const rectifiedFramePoint = predrawnSourceGridPoint(registration, 0.25, 0.5);
  assert.ok(rectifiedFramePoint);
  const boardPoint = projectPredrawnPoint(transform.frameToBoard, rectifiedFramePoint);
  assert.ok(boardPoint);
  approxPoint(predrawnBoardSourcePoint(transform, boardPoint), [12.5, 50]);

  const changedBoundary = {
    ...registration,
    boundaryReference: { north: [90, 90], east: [91, 91], south: [92, 92], west: [93, 93] },
  };
  const changedSurface = { ...surface, registration: changedBoundary };
  assert.deepEqual(
    predrawnBoardRasterTransform(changedSurface, cells, changedBoundary),
    transform,
  );
});

test('legacy unregistered plates retain byte-for-byte rectangular placement behavior', () => {
  const surface = {
    kind: 'predrawn',
    slot: 'boards/test/legacy.png',
    frameWidth: 1680,
    frameHeight: 935,
  };
  const board = blankBoard(surface);
  const placement = predrawnBoardPlacement(surface, exactCells);
  assert.deepEqual(boardDrawOps(board)[0], {
    layer: 'terrain',
    src: '/assets/boards/test/legacy.png',
    dx: placement.left,
    dy: placement.top,
    dw: placement.width,
    dh: placement.height,
    z: -100000,
  });
});
