import {
  TILE_STEP_X,
  TILE_STEP_Y,
} from '../art/projectionContract';
type PredrawnBoardProjection = { frameWidth: number; frameHeight: number };
import { boardLabCellPosition, boardLabMetrics } from './boardProjection';
import {
  PREDRAWN_GUIDE_EPSILON,
  normalizePredrawnBoardRegistration,
  predrawnGuidesForBoard,
  predrawnRegistrationGridSize,
  validPredrawnMeshOverrides,
  validPredrawnGuides,
  type PredrawnBoardCornerRegistration,
  type PredrawnMeshNodeOverride,
  type PredrawnPoint,
} from './predrawnRegistration';
import {
  homographyForPredrawnPoints,
  projectPredrawnPoint,
  type PredrawnBoardHomography,
} from './predrawnProjective';

export {
  projectPredrawnPoint,
  type PredrawnBoardHomography,
} from './predrawnProjective';

export interface PredrawnBoardPlacement {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface PredrawnBoardRectification {
  frameToUnit: PredrawnBoardHomography;
  unitToFrame: PredrawnBoardHomography;
  columnGuides: readonly number[];
  rowGuides: readonly number[];
  mesh?: {
    columns: number;
    rows: number;
    /** Dense row-major shared nodes in the projective board plane. */
    unitNodes: readonly PredrawnPoint[];
  };
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
  const homography = homographyForPredrawnPoints(
    UNIT_CORNERS,
    [registration.north, registration.east, registration.south, registration.west],
  );
  return homography ? projectPredrawnPoint(homography, [u, v]) : undefined;
}

export function predrawnSourceGridCoordinate(
  registration: PredrawnBoardCornerRegistration,
  point: PredrawnPoint,
): PredrawnPoint | undefined {
  const homography = homographyForPredrawnPoints(
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
  return geometry ? homographyForPredrawnPoints(geometry.sources, geometry.targets) : undefined;
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
    && (
      !isUniformGuideSet(registration.columnGuides)
      || !isUniformGuideSet(registration.rowGuides)
      || Boolean(registration.meshOverrides?.length && validPredrawnMeshOverrides(registration))
    );
}

function scaledMeshOverridePoint(
  override: PredrawnMeshNodeOverride,
  registration: PredrawnBoardCornerRegistration,
  width: number,
  height: number,
): PredrawnPoint {
  return [
    override.point[0] * width / registration.sourceWidth,
    override.point[1] * height / registration.sourceHeight,
  ];
}

function meshUnitNodesForFrame(
  registration: PredrawnBoardCornerRegistration,
  frameToUnit: PredrawnBoardHomography,
  width: number,
  height: number,
): PredrawnBoardRectification['mesh'] | undefined {
  if (!registration.meshOverrides?.length || !validPredrawnMeshOverrides(registration)) return undefined;
  const dimensions = predrawnRegistrationGridSize(registration, 1, 1);
  const guides = predrawnGuidesForBoard(registration, dimensions.columns, dimensions.rows);
  const stride = dimensions.columns + 1;
  const unitNodes = Array.from(
    { length: stride * (dimensions.rows + 1) },
    (_, index): PredrawnPoint => [
      guides.columnGuides[index % stride],
      guides.rowGuides[Math.floor(index / stride)],
    ],
  );
  for (const override of registration.meshOverrides) {
    const unitPoint = projectPredrawnPoint(
      frameToUnit,
      scaledMeshOverridePoint(override, registration, width, height),
    );
    if (!unitPoint) return undefined;
    unitNodes[override.row * stride + override.column] = unitPoint;
  }
  return {
    columns: dimensions.columns,
    rows: dimensions.rows,
    unitNodes,
  };
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
  const frameToUnit = homographyForPredrawnPoints(corners, UNIT_CORNERS);
  const unitToFrame = homographyForPredrawnPoints(UNIT_CORNERS, corners);
  if (!frameToUnit || !unitToFrame) return undefined;
  const mesh = meshUnitNodesForFrame(registration, frameToUnit, width, height);
  if (registration.meshOverrides?.length && !mesh) return undefined;
  return {
    frameToUnit,
    unitToFrame,
    columnGuides: [...registration.columnGuides],
    rowGuides: [...registration.rowGuides],
    ...(mesh ? { mesh } : {}),
  };
}

function axisMeshCell(coordinate: number, cellCount: number): { index: number; fraction: number } {
  const scaled = coordinate * cellCount;
  if (scaled <= 0) return { index: 0, fraction: scaled };
  if (scaled >= cellCount) return { index: cellCount - 1, fraction: scaled - cellCount + 1 };
  const index = Math.min(cellCount - 1, Math.floor(scaled));
  return { index, fraction: scaled - index };
}

function interpolatePoint(left: PredrawnPoint, right: PredrawnPoint, fraction: number): PredrawnPoint {
  return [
    left[0] + (right[0] - left[0]) * fraction,
    left[1] + (right[1] - left[1]) * fraction,
  ];
}

function meshUnitPoint(
  mesh: NonNullable<PredrawnBoardRectification['mesh']>,
  canonical: PredrawnPoint,
): PredrawnPoint {
  const horizontal = axisMeshCell(canonical[0], mesh.columns);
  const vertical = axisMeshCell(canonical[1], mesh.rows);
  const stride = mesh.columns + 1;
  const northWest = mesh.unitNodes[vertical.index * stride + horizontal.index];
  const northEast = mesh.unitNodes[vertical.index * stride + horizontal.index + 1];
  const southWest = mesh.unitNodes[(vertical.index + 1) * stride + horizontal.index];
  const southEast = mesh.unitNodes[(vertical.index + 1) * stride + horizontal.index + 1];
  return interpolatePoint(
    interpolatePoint(northWest, northEast, horizontal.fraction),
    interpolatePoint(southWest, southEast, horizontal.fraction),
    vertical.fraction,
  );
}

function rectifiedUnitPoint(
  rectification: PredrawnBoardRectification,
  canonical: PredrawnPoint,
): PredrawnPoint {
  return rectification.mesh
    && canonical[0] >= 0
    && canonical[0] <= 1
    && canonical[1] >= 0
    && canonical[1] <= 1
    ? meshUnitPoint(rectification.mesh, canonical)
    : [
        guideValueAtCanonicalCoordinate(rectification.columnGuides, canonical[0]),
        guideValueAtCanonicalCoordinate(rectification.rowGuides, canonical[1]),
      ];
}

function rectifiedSourcePoint(
  rectification: PredrawnBoardRectification,
  destination: PredrawnPoint,
): PredrawnPoint | undefined {
  const canonical = projectPredrawnPoint(rectification.frameToUnit, destination);
  if (!canonical) return undefined;
  return projectPredrawnPoint(rectification.unitToFrame, rectifiedUnitPoint(rectification, canonical));
}

export function predrawnRectifiedSourcePoint(
  registration: PredrawnBoardCornerRegistration,
  destination: PredrawnPoint,
  frame: { width: number; height: number },
): PredrawnPoint | undefined {
  const rectification = rectificationForFrame(registration, frame.width, frame.height);
  return rectification ? rectifiedSourcePoint(rectification, destination) : destination;
}

/**
 * Resolve one canonical normalized grid coordinate to intrinsic source-image pixels.
 *
 * The coarse guides remain the base map. A v5 registration additionally evaluates the one
 * continuous shared-vertex mesh in projective board-plane coordinates.
 */
export function predrawnSourceMeshPoint(
  registration: PredrawnBoardCornerRegistration,
  u: number,
  v: number,
): PredrawnPoint | undefined {
  if (!Number.isFinite(u) || !Number.isFinite(v)) return undefined;
  if (registration.meshOverrides?.length && !validPredrawnMeshOverrides(registration)) return undefined;
  const dimensions = predrawnRegistrationGridSize(registration, 1, 1);
  const guides = predrawnGuidesForBoard(registration, dimensions.columns, dimensions.rows);
  const effectiveRegistration: PredrawnBoardCornerRegistration = {
    ...registration,
    gridColumns: dimensions.columns,
    gridRows: dimensions.rows,
    columnGuides: guides.columnGuides,
    rowGuides: guides.rowGuides,
  };
  const rectification = rectificationForFrame(
    effectiveRegistration,
    registration.sourceWidth,
    registration.sourceHeight,
  );
  if (!rectification) return undefined;
  return projectPredrawnPoint(
    rectification.unitToFrame,
    rectifiedUnitPoint(rectification, [u, v]),
  );
}

/** Resolve one shared integer grid intersection to intrinsic source-image pixels. */
export function predrawnSourceMeshNode(
  registration: PredrawnBoardCornerRegistration,
  column: number,
  row: number,
): PredrawnPoint | undefined {
  const dimensions = predrawnRegistrationGridSize(registration, 1, 1);
  if (
    !Number.isSafeInteger(column)
    || !Number.isSafeInteger(row)
    || column < 0
    || column > dimensions.columns
    || row < 0
    || row > dimensions.rows
  ) return undefined;
  return predrawnSourceMeshPoint(
    registration,
    column / dimensions.columns,
    row / dimensions.rows,
  );
}

export interface PredrawnMeshCellAddress {
  column: number;
  row: number;
}

/** Row-major logical cells that share one grid intersection. */
export function predrawnMeshCellsForNode(
  registration: PredrawnBoardCornerRegistration,
  column: number,
  row: number,
): PredrawnMeshCellAddress[] {
  const dimensions = predrawnRegistrationGridSize(registration, 1, 1);
  if (
    !Number.isSafeInteger(column)
    || !Number.isSafeInteger(row)
    || column < 0
    || column > dimensions.columns
    || row < 0
    || row > dimensions.rows
  ) return [];
  const cells: PredrawnMeshCellAddress[] = [];
  for (const cellRow of [row - 1, row]) {
    for (const cellColumn of [column - 1, column]) {
      if (
        cellColumn >= 0
        && cellColumn < dimensions.columns
        && cellRow >= 0
        && cellRow < dimensions.rows
      ) cells.push({ column: cellColumn, row: cellRow });
    }
  }
  return cells.sort((left, right) => left.row - right.row || left.column - right.column);
}

export function predrawnMeshNodeIsOverridden(
  registration: PredrawnBoardCornerRegistration,
  column: number,
  row: number,
): boolean {
  return Boolean(registration.meshOverrides?.some(
    (override) => override.column === column && override.row === row,
  ));
}

function registrationWithoutMeshKeys(
  registration: PredrawnBoardCornerRegistration,
  keys: ReadonlySet<string>,
): PredrawnBoardCornerRegistration {
  const remaining = registration.meshOverrides?.filter(
    (override) => !keys.has(`${override.column},${override.row}`),
  ) ?? [];
  if (!remaining.length) {
    const { meshOverrides: _removed, ...withoutMesh } = registration;
    return withoutMesh;
  }
  return { ...registration, meshOverrides: remaining };
}

export function clearPredrawnMeshNodeOverride(
  registration: PredrawnBoardCornerRegistration,
  column: number,
  row: number,
): PredrawnBoardCornerRegistration {
  return registrationWithoutMeshKeys(registration, new Set([`${column},${row}`]));
}

export function clearPredrawnMeshCellOverrides(
  registration: PredrawnBoardCornerRegistration,
  column: number,
  row: number,
): PredrawnBoardCornerRegistration {
  return registrationWithoutMeshKeys(registration, new Set([
    `${column},${row}`,
    `${column + 1},${row}`,
    `${column},${row + 1}`,
    `${column + 1},${row + 1}`,
  ]));
}

export function clearAllPredrawnMeshOverrides(
  registration: PredrawnBoardCornerRegistration,
): PredrawnBoardCornerRegistration {
  const { meshOverrides: _removed, ...withoutMesh } = registration;
  return withoutMesh;
}

function isBoundaryMeshNode(
  column: number,
  row: number,
  columns: number,
  rows: number,
): boolean {
  return column === 0 || column === columns || row === 0 || row === rows;
}

function canonicalSourcePoint(
  registration: PredrawnBoardCornerRegistration,
  point: PredrawnPoint,
): PredrawnPoint | undefined {
  if (
    !Array.isArray(point)
    || point.length !== 2
    || !Number.isFinite(point[0])
    || !Number.isFinite(point[1])
    || point[0] < 0
    || point[0] > registration.sourceWidth
    || point[1] < 0
    || point[1] > registration.sourceHeight
  ) return undefined;
  return [Number(point[0].toFixed(3)), Number(point[1].toFixed(3))];
}

/**
 * Set one exact shared source-pixel node. Invalid or folded whole-mesh geometry is rejected.
 *
 * Boundary intersections remain under the existing coarse corners/guides so local displacement
 * reaches zero at the board edge and cannot distort extrapolated surrounding scenery.
 */
export function setPredrawnMeshNodeOverride(
  registration: PredrawnBoardCornerRegistration,
  column: number,
  row: number,
  point: PredrawnPoint,
): PredrawnBoardCornerRegistration | undefined {
  const dimensions = predrawnRegistrationGridSize(registration, 1, 1);
  const canonicalPoint = canonicalSourcePoint(registration, point);
  if (
    !canonicalPoint
    || !Number.isSafeInteger(column)
    || !Number.isSafeInteger(row)
    || column < 0
    || column > dimensions.columns
    || row < 0
    || row > dimensions.rows
    || isBoundaryMeshNode(column, row, dimensions.columns, dimensions.rows)
  ) return undefined;
  const meshOverrides = [
    ...(registration.meshOverrides ?? []).filter(
      (override) => override.column !== column || override.row !== row,
    ),
    { column, row, point: canonicalPoint },
  ].sort((left, right) => left.row - right.row || left.column - right.column);
  return normalizePredrawnBoardRegistration({ ...registration, meshOverrides });
}

export interface PredrawnMeshNodeMove {
  registration: PredrawnBoardCornerRegistration;
  point: PredrawnPoint;
  constrained: boolean;
}

/**
 * Move a shared node toward a requested source pixel, clamping to the furthest valid point along
 * that path when the exact request would fold an adjacent cell or leave the source frame.
 */
export function movePredrawnMeshNode(
  registration: PredrawnBoardCornerRegistration,
  column: number,
  row: number,
  requestedPoint: PredrawnPoint,
): PredrawnMeshNodeMove | undefined {
  const dimensions = predrawnRegistrationGridSize(registration, 1, 1);
  if (
    !Array.isArray(requestedPoint)
    || requestedPoint.length !== 2
    || !Number.isFinite(requestedPoint[0])
    || !Number.isFinite(requestedPoint[1])
    || !Number.isSafeInteger(column)
    || !Number.isSafeInteger(row)
    || column < 0
    || column > dimensions.columns
    || row < 0
    || row > dimensions.rows
    || isBoundaryMeshNode(column, row, dimensions.columns, dimensions.rows)
  ) return undefined;
  const inFrameRequest: PredrawnPoint = [
    Math.min(registration.sourceWidth, Math.max(0, requestedPoint[0])),
    Math.min(registration.sourceHeight, Math.max(0, requestedPoint[1])),
  ];
  const exact = setPredrawnMeshNodeOverride(registration, column, row, inFrameRequest);
  if (exact) {
    return {
      registration: exact,
      point: predrawnSourceMeshNode(exact, column, row)!,
      constrained: (
        inFrameRequest[0] !== requestedPoint[0]
        || inFrameRequest[1] !== requestedPoint[1]
      ),
    };
  }

  const openingPoint = predrawnSourceMeshNode(registration, column, row);
  if (!openingPoint) return undefined;
  let minimum = 0;
  let maximum = 1;
  let bestRegistration = normalizePredrawnBoardRegistration(registration);
  if (!bestRegistration) return undefined;
  let bestPoint = predrawnSourceMeshNode(bestRegistration, column, row) ?? openingPoint;
  for (let iteration = 0; iteration < 32; iteration += 1) {
    const fraction = (minimum + maximum) / 2;
    const candidatePoint: PredrawnPoint = [
      openingPoint[0] + (inFrameRequest[0] - openingPoint[0]) * fraction,
      openingPoint[1] + (inFrameRequest[1] - openingPoint[1]) * fraction,
    ];
    const candidate = setPredrawnMeshNodeOverride(
      registration,
      column,
      row,
      candidatePoint,
    );
    if (candidate) {
      minimum = fraction;
      bestRegistration = candidate;
      bestPoint = predrawnSourceMeshNode(candidate, column, row) ?? bestPoint;
    } else {
      maximum = fraction;
    }
  }
  return {
    registration: bestRegistration,
    point: bestPoint,
    constrained: true,
  };
}

export function predrawnBoardRasterTransform(
  surface: PredrawnBoardProjection,
  cells: readonly { x: number; y: number }[],
  registration: PredrawnBoardCornerRegistration,
): PredrawnBoardRasterTransform | undefined {
  const geometry = registrationGeometry(surface, cells, registration);
  if (!geometry) return undefined;
  if (registration.meshOverrides?.length && !validPredrawnMeshOverrides(registration)) return undefined;
  const frameToBoard = homographyForPredrawnPoints(geometry.sources, geometry.targets);
  const boardToFrame = homographyForPredrawnPoints(geometry.targets, geometry.sources);
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
