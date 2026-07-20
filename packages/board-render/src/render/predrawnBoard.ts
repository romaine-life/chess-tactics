import {
  TILE_STEP_X,
  TILE_STEP_Y,
} from '../art/projectionContract';
import type { PredrawnBoardSurface } from '../ui/boardCode';

type PredrawnBoardProjection = Omit<PredrawnBoardSurface, 'slot'>;
import { boardLabCellPosition, boardLabMetrics } from './boardProjection';
import {
  PREDRAWN_GUIDE_EPSILON,
  predrawnRegistrationGridSize,
  validPredrawnGuides,
  type PredrawnBoardCornerRegistration,
  type PredrawnPoint,
} from './predrawnRegistration';

export interface PredrawnBoardPlacement {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface PredrawnBoardHomography {
  h11: number;
  h12: number;
  h13: number;
  h21: number;
  h22: number;
  h23: number;
  h31: number;
  h32: number;
}

export interface PredrawnBoardRectification {
  frameToUnit: PredrawnBoardHomography;
  unitToFrame: PredrawnBoardHomography;
  columnGuides: readonly number[];
  rowGuides: readonly number[];
}

/**
 * Serializable inverse-raster authority for one registered complete scene.
 *
 * The DOM uses frameToBoard as its CSS matrix. Canvas renderers use boardToFrame and the optional
 * guide rectification to find the source pixel for each destination pixel. Both are derived from
 * the same four hard corner constraints here, so browser and server consumers cannot invent a
 * second registration interpretation.
 */
export interface PredrawnBoardRasterTransform {
  frameWidth: number;
  frameHeight: number;
  frameToBoard: PredrawnBoardHomography;
  boardToFrame: PredrawnBoardHomography;
  rectification?: PredrawnBoardRectification;
}

export interface PredrawnRgbaRaster {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface PredrawnRasterViewport {
  /** Board-space coordinate represented by output pixel (0, 0). */
  minX: number;
  minY: number;
  /** Board-space span represented by the complete output raster. */
  width: number;
  height: number;
  /** Physical output raster dimensions. */
  pixelWidth: number;
  pixelHeight: number;
}

const UNIT_CORNERS: readonly PredrawnPoint[] = [[0, 0], [1, 0], [1, 1], [0, 1]];

/**
 * Register a complete legacy frame against the same centred viewport that produced its source
 * board. Unregistered plates retain this whole-image scale-and-translation behavior.
 */
export function predrawnBoardPlacement(
  surface: PredrawnBoardProjection,
  cells: readonly { x: number; y: number }[],
): PredrawnBoardPlacement {
  const metrics = boardLabMetrics(cells);
  return {
    left: -(surface.frameWidth / 2) - metrics.originLeft,
    top: -(surface.frameHeight / 2) - metrics.originTop,
    width: surface.frameWidth,
    height: surface.frameHeight,
  };
}

export function predrawnBoardCellDimensions(
  cells: readonly { x: number; y: number }[],
): { columns: number; rows: number } {
  if (!cells.length) return { columns: 0, rows: 0 };
  const xs = cells.map((cell) => cell.x);
  const ys = cells.map((cell) => cell.y);
  return {
    columns: Math.max(...xs) - Math.min(...xs) + 1,
    rows: Math.max(...ys) - Math.min(...ys) + 1,
  };
}

function boardOuterCorners(
  cells: readonly { x: number; y: number }[],
  dimensions = predrawnBoardCellDimensions(cells),
): [PredrawnPoint, PredrawnPoint, PredrawnPoint, PredrawnPoint] | undefined {
  if (!cells.length) return undefined;
  const minX = Math.min(...cells.map((cell) => cell.x));
  const minY = Math.min(...cells.map((cell) => cell.y));
  const maxX = minX + dimensions.columns - 1;
  const maxY = minY + dimensions.rows - 1;
  const northSeat = boardLabCellPosition({ x: minX, y: minY });
  const eastSeat = boardLabCellPosition({ x: maxX, y: minY });
  const southSeat = boardLabCellPosition({ x: maxX, y: maxY });
  const westSeat = boardLabCellPosition({ x: minX, y: maxY });
  return [
    [northSeat.left, northSeat.top - TILE_STEP_Y],
    [eastSeat.left + TILE_STEP_X, eastSeat.top],
    [southSeat.left, southSeat.top + TILE_STEP_Y],
    [westSeat.left - TILE_STEP_X, westSeat.top],
  ];
}

function solveLinearSystem(rows: number[][], values: number[]): number[] | undefined {
  const size = values.length;
  const augmented = rows.map((row, index) => [...row, values[index]]);
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    }
    if (Math.abs(augmented[pivot][column]) < 1e-10) return undefined;
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    const divisor = augmented[column][column];
    for (let index = column; index <= size; index += 1) augmented[column][index] /= divisor;
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      for (let index = column; index <= size; index += 1) {
        augmented[row][index] -= factor * augmented[column][index];
      }
    }
  }
  return augmented.map((row) => row[size]);
}

function homographyForFourPoints(
  sources: readonly PredrawnPoint[],
  targets: readonly PredrawnPoint[],
): PredrawnBoardHomography | undefined {
  const rows: number[][] = [];
  const values: number[] = [];
  sources.forEach(([x, y], index) => {
    const [targetX, targetY] = targets[index];
    rows.push([x, y, 1, 0, 0, 0, -targetX * x, -targetX * y]);
    values.push(targetX);
    rows.push([0, 0, 0, x, y, 1, -targetY * x, -targetY * y]);
    values.push(targetY);
  });
  const solved = solveLinearSystem(rows, values);
  if (!solved) return undefined;
  const [h11, h12, h13, h21, h22, h23, h31, h32] = solved;
  const homography = { h11, h12, h13, h21, h22, h23, h31, h32 };
  const residual = sources.reduce((max, point, index) => {
    const projected = projectPredrawnPoint(homography, point);
    if (!projected) return Infinity;
    return Math.max(max, Math.hypot(
      projected[0] - targets[index][0],
      projected[1] - targets[index][1],
    ));
  }, 0);
  return residual <= 1e-5 ? homography : undefined;
}

export function projectPredrawnPoint(
  homography: PredrawnBoardHomography,
  [x, y]: PredrawnPoint,
): PredrawnPoint | undefined {
  const denominator = homography.h31 * x + homography.h32 * y + 1;
  if (Math.abs(denominator) < 1e-10) return undefined;
  return [
    (homography.h11 * x + homography.h12 * y + homography.h13) / denominator,
    (homography.h21 * x + homography.h22 * y + homography.h23) / denominator,
  ];
}

function scaledRegistrationCorners(
  registration: PredrawnBoardCornerRegistration,
  width: number,
  height: number,
): [PredrawnPoint, PredrawnPoint, PredrawnPoint, PredrawnPoint] {
  const scaleX = width / registration.sourceWidth;
  const scaleY = height / registration.sourceHeight;
  return [registration.north, registration.east, registration.south, registration.west]
    .map(([x, y]) => [x * scaleX, y * scaleY] as const) as [
      PredrawnPoint,
      PredrawnPoint,
      PredrawnPoint,
      PredrawnPoint,
    ];
}

export function predrawnSourceGridPoint(
  registration: PredrawnBoardCornerRegistration,
  u: number,
  v: number,
): PredrawnPoint | undefined {
  const homography = homographyForFourPoints(
    UNIT_CORNERS,
    [registration.north, registration.east, registration.south, registration.west],
  );
  return homography ? projectPredrawnPoint(homography, [u, v]) : undefined;
}

export function predrawnSourceGridCoordinate(
  registration: PredrawnBoardCornerRegistration,
  point: PredrawnPoint,
): PredrawnPoint | undefined {
  const homography = homographyForFourPoints(
    [registration.north, registration.east, registration.south, registration.west],
    UNIT_CORNERS,
  );
  return homography ? projectPredrawnPoint(homography, point) : undefined;
}

function registrationGeometry(
  surface: PredrawnBoardProjection,
  cells: readonly { x: number; y: number }[],
  registration: PredrawnBoardCornerRegistration,
): {
  sources: [PredrawnPoint, PredrawnPoint, PredrawnPoint, PredrawnPoint];
  targets: [PredrawnPoint, PredrawnPoint, PredrawnPoint, PredrawnPoint];
  dimensions: { columns: number; rows: number };
} | undefined {
  const levelDimensions = predrawnBoardCellDimensions(cells);
  const dimensions = predrawnRegistrationGridSize(
    registration,
    levelDimensions.columns,
    levelDimensions.rows,
  );
  const targets = boardOuterCorners(cells, dimensions);
  if (!targets) return undefined;
  return {
    sources: scaledRegistrationCorners(registration, surface.frameWidth, surface.frameHeight),
    targets,
    dimensions,
  };
}

/** Exact four-point projective registration. Every source corner is a hard constraint. */
export function predrawnBoardHomography(
  surface: PredrawnBoardProjection,
  cells: readonly { x: number; y: number }[],
  registration: PredrawnBoardCornerRegistration,
): PredrawnBoardHomography | undefined {
  const geometry = registrationGeometry(surface, cells, registration);
  return geometry ? homographyForFourPoints(geometry.sources, geometry.targets) : undefined;
}

function guideValueAtCanonicalCoordinate(guides: readonly number[], coordinate: number): number {
  const cellCount = guides.length - 1;
  if (coordinate <= 0) return guides[0] + coordinate * cellCount * (guides[1] - guides[0]);
  if (coordinate >= 1) {
    return guides[cellCount]
      + (coordinate - 1) * cellCount * (guides[cellCount] - guides[cellCount - 1]);
  }
  const scaled = coordinate * cellCount;
  const index = Math.min(cellCount - 1, Math.floor(scaled));
  const fraction = scaled - index;
  return guides[index] + (guides[index + 1] - guides[index]) * fraction;
}

function isUniformGuideSet(guides: readonly number[]): boolean {
  const cells = guides.length - 1;
  return guides.every((value, index) => (
    Math.abs(value - index / cells) <= PREDRAWN_GUIDE_EPSILON
  ));
}

export function predrawnBoardHasApplicableRectification(
  registration: PredrawnBoardCornerRegistration,
  columns: number,
  rows: number,
): boolean {
  const refitDimensions = predrawnRegistrationGridSize(registration, columns, rows);
  return validPredrawnGuides(registration.columnGuides)
    && validPredrawnGuides(registration.rowGuides)
    && registration.columnGuides.length === refitDimensions.columns + 1
    && registration.rowGuides.length === refitDimensions.rows + 1
    && (!isUniformGuideSet(registration.columnGuides) || !isUniformGuideSet(registration.rowGuides));
}

function rectificationForFrame(
  registration: PredrawnBoardCornerRegistration,
  width: number,
  height: number,
): PredrawnBoardRectification | undefined {
  if (!validPredrawnGuides(registration.columnGuides) || !validPredrawnGuides(registration.rowGuides)) {
    return undefined;
  }
  const corners = scaledRegistrationCorners(registration, width, height);
  const frameToUnit = homographyForFourPoints(corners, UNIT_CORNERS);
  const unitToFrame = homographyForFourPoints(UNIT_CORNERS, corners);
  if (!frameToUnit || !unitToFrame) return undefined;
  return {
    frameToUnit,
    unitToFrame,
    columnGuides: [...registration.columnGuides],
    rowGuides: [...registration.rowGuides],
  };
}

function rectifiedSourcePoint(
  rectification: PredrawnBoardRectification,
  destination: PredrawnPoint,
): PredrawnPoint | undefined {
  const canonical = projectPredrawnPoint(rectification.frameToUnit, destination);
  if (!canonical) return undefined;
  return projectPredrawnPoint(rectification.unitToFrame, [
    guideValueAtCanonicalCoordinate(rectification.columnGuides, canonical[0]),
    guideValueAtCanonicalCoordinate(rectification.rowGuides, canonical[1]),
  ]);
}

export function predrawnRectifiedSourcePoint(
  registration: PredrawnBoardCornerRegistration,
  destination: PredrawnPoint,
  frame: { width: number; height: number },
): PredrawnPoint | undefined {
  const rectification = rectificationForFrame(registration, frame.width, frame.height);
  return rectification ? rectifiedSourcePoint(rectification, destination) : destination;
}

export function predrawnBoardRasterTransform(
  surface: PredrawnBoardProjection,
  cells: readonly { x: number; y: number }[],
  registration: PredrawnBoardCornerRegistration,
): PredrawnBoardRasterTransform | undefined {
  const geometry = registrationGeometry(surface, cells, registration);
  if (!geometry) return undefined;
  const frameToBoard = homographyForFourPoints(geometry.sources, geometry.targets);
  const boardToFrame = homographyForFourPoints(geometry.targets, geometry.sources);
  if (!frameToBoard || !boardToFrame) return undefined;
  const levelDimensions = predrawnBoardCellDimensions(cells);
  const rectification = predrawnBoardHasApplicableRectification(
    registration,
    levelDimensions.columns,
    levelDimensions.rows,
  )
    ? rectificationForFrame(registration, surface.frameWidth, surface.frameHeight)
    : undefined;
  return {
    frameWidth: surface.frameWidth,
    frameHeight: surface.frameHeight,
    frameToBoard,
    boardToFrame,
    ...(rectification ? { rectification } : {}),
  };
}

export function predrawnBoardFramePolygon(
  transform: PredrawnBoardRasterTransform,
): [PredrawnPoint, PredrawnPoint, PredrawnPoint, PredrawnPoint] | undefined {
  const frameCorners: readonly PredrawnPoint[] = [
    [0, 0],
    [transform.frameWidth, 0],
    [transform.frameWidth, transform.frameHeight],
    [0, transform.frameHeight],
  ];
  const projected = frameCorners.map((point) => projectPredrawnPoint(transform.frameToBoard, point));
  return projected.every((point): point is PredrawnPoint => point !== undefined)
    ? projected as [PredrawnPoint, PredrawnPoint, PredrawnPoint, PredrawnPoint]
    : undefined;
}

export function predrawnBoardRasterBounds(
  transform: PredrawnBoardRasterTransform,
): { minX: number; minY: number; width: number; height: number } | undefined {
  const polygon = predrawnBoardFramePolygon(transform);
  if (!polygon) return undefined;
  const xs = polygon.map(([x]) => x);
  const ys = polygon.map(([, y]) => y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return {
    minX,
    minY,
    width: Math.max(...xs) - minX,
    height: Math.max(...ys) - minY,
  };
}

/** Find the source-frame pixel coordinate painted at one board-space destination point. */
export function predrawnBoardSourcePoint(
  transform: PredrawnBoardRasterTransform,
  destination: PredrawnPoint,
): PredrawnPoint | undefined {
  const framePoint = projectPredrawnPoint(transform.boardToFrame, destination);
  if (!framePoint) return undefined;
  return transform.rectification
    ? rectifiedSourcePoint(transform.rectification, framePoint)
    : framePoint;
}

function sampleBilinear(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  target: Uint8ClampedArray,
  targetIndex: number,
): void {
  if (x < 0 || y < 0 || x > width - 1 || y > height - 1) return;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  const weights = [(1 - tx) * (1 - ty), tx * (1 - ty), (1 - tx) * ty, tx * ty];
  const offsets = [
    (y0 * width + x0) * 4,
    (y0 * width + x1) * 4,
    (y1 * width + x0) * 4,
    (y1 * width + x1) * 4,
  ];
  for (let channel = 0; channel < 4; channel += 1) {
    target[targetIndex + channel] = Math.round(offsets.reduce(
      (sum, offset, index) => sum + source[offset + channel] * weights[index],
      0,
    ));
  }
}

function assertRaster(raster: PredrawnRgbaRaster): void {
  if (!Number.isInteger(raster.width) || !Number.isInteger(raster.height)
    || raster.width <= 0 || raster.height <= 0
    || raster.data.length !== raster.width * raster.height * 4) {
    throw new Error('invalid pre-drawn source raster');
  }
}

/**
 * Deterministically inverse-sample a registered scene into an arbitrary board-space viewport.
 * Browser and server thumbnails both call this implementation; boundaryReference is intentionally
 * absent from the transform and therefore cannot affect pixels.
 */
export function rasterizePredrawnBoardPixels(
  source: PredrawnRgbaRaster,
  transform: PredrawnBoardRasterTransform,
  viewport: PredrawnRasterViewport,
): Uint8ClampedArray {
  assertRaster(source);
  const pixelWidth = Math.floor(viewport.pixelWidth);
  const pixelHeight = Math.floor(viewport.pixelHeight);
  if (pixelWidth <= 0 || pixelHeight <= 0
    || !Number.isFinite(viewport.minX) || !Number.isFinite(viewport.minY)
    || !Number.isFinite(viewport.width) || !Number.isFinite(viewport.height)
    || viewport.width <= 0 || viewport.height <= 0) {
    throw new Error('invalid pre-drawn raster viewport');
  }
  const output = new Uint8ClampedArray(pixelWidth * pixelHeight * 4);
  const stepX = viewport.width / pixelWidth;
  const stepY = viewport.height / pixelHeight;
  for (let y = 0; y < pixelHeight; y += 1) {
    const boardY = viewport.minY + y * stepY;
    for (let x = 0; x < pixelWidth; x += 1) {
      const sourcePoint = predrawnBoardSourcePoint(transform, [
        viewport.minX + x * stepX,
        boardY,
      ]);
      if (!sourcePoint) continue;
      sampleBilinear(
        source.data,
        source.width,
        source.height,
        sourcePoint[0],
        sourcePoint[1],
        output,
        (y * pixelWidth + x) * 4,
      );
    }
  }
  return output;
}

/** Apply the same guide-remap pass used by the DOM's rectified overlay canvas. */
export function rectifyPredrawnFramePixels(
  source: PredrawnRgbaRaster,
  registration: PredrawnBoardCornerRegistration,
): Uint8ClampedArray {
  assertRaster(source);
  const rectification = rectificationForFrame(registration, source.width, source.height);
  if (!rectification) return new Uint8ClampedArray(source.data);
  const output = new Uint8ClampedArray(source.data);
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const sourcePoint = rectifiedSourcePoint(rectification, [x, y]);
      if (!sourcePoint) continue;
      sampleBilinear(
        source.data,
        source.width,
        source.height,
        sourcePoint[0],
        sourcePoint[1],
        output,
        (y * source.width + x) * 4,
      );
    }
  }
  return output;
}
