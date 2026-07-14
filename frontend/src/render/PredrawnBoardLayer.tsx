import { useEffect, useRef, useState, type CSSProperties, type ReactElement } from 'react';
import {
  TILE_STEP_X,
  TILE_STEP_Y,
  boardLabCellPosition,
  boardLabMetrics,
  predrawnBoardPlacement,
  resolvedLiveMediaUrl,
  type PredrawnBoardSurface,
} from '@chess-tactics/board-render';

export type PredrawnPoint = readonly [x: number, y: number];

export interface PredrawnBoundaryReference {
  north: PredrawnPoint;
  east: PredrawnPoint;
  south: PredrawnPoint;
  west: PredrawnPoint;
}

/**
 * Development-review registration for a generated plate. Corners are source-image pixels in
 * north/east/south/west order around the playable top plane. Optional guides record where each
 * canonical grid line actually appears between those corners. They are normalized, monotonic,
 * and include the 0/1 boundary lines, so the correction can never fold or reorder the board.
 */
export interface PredrawnBoardCornerRegistration {
  sourceWidth: number;
  sourceHeight: number;
  north: PredrawnPoint;
  east: PredrawnPoint;
  south: PredrawnPoint;
  west: PredrawnPoint;
  /** Owner-selected dimensions of the canonical grid this candidate is being refitted to. */
  gridColumns?: number;
  gridRows?: number;
  columnGuides?: readonly number[];
  rowGuides?: readonly number[];
  /** Owner-pinned painted boundary shown only as a calibration reference in the picker. */
  boundaryReference?: PredrawnBoundaryReference;
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

export interface PredrawnBoardPlate {
  surface: PredrawnBoardSurface;
  src: string;
  registration?: PredrawnBoardCornerRegistration;
}

interface RegistrationStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const PREDRAWN_REGISTRATION_STORAGE_PREFIX = 'chess-tactics:predrawn-registration:v1:';
const MAX_GUIDES_PER_AXIS = 65;
const GUIDE_EPSILON = 1e-6;

function validPredrawnGridCount(value: number | undefined): value is number {
  return Number.isSafeInteger(value) && value! >= 1 && value! < MAX_GUIDES_PER_AXIS;
}

export function normalizePredrawnGridCount(value: number, fallback = 1): number {
  const safeFallback = validPredrawnGridCount(fallback) ? fallback : 1;
  if (!Number.isFinite(value)) return safeFallback;
  return Math.min(MAX_GUIDES_PER_AXIS - 1, Math.max(1, Math.round(value)));
}

function formatRegistrationNumber(value: number): string {
  return String(Number(value.toFixed(3)));
}

function formatGuideNumber(value: number): string {
  return String(Number(value.toFixed(6)));
}

export function uniformPredrawnGuides(cellCount: number): number[] {
  if (!Number.isSafeInteger(cellCount) || cellCount < 1 || cellCount >= MAX_GUIDES_PER_AXIS) {
    return [0, 1];
  }
  return Array.from({ length: cellCount + 1 }, (_, index) => index / cellCount);
}

export function validPredrawnGuides(guides: readonly number[] | undefined): guides is readonly number[] {
  if (!guides || guides.length < 2 || guides.length > MAX_GUIDES_PER_AXIS) return false;
  if (guides.some((value) => !Number.isFinite(value) || value < 0 || value > 1)) return false;
  if (Math.abs(guides[0]) > GUIDE_EPSILON || Math.abs(guides[guides.length - 1] - 1) > GUIDE_EPSILON) {
    return false;
  }
  return guides.every((value, index) => index === 0 || value - guides[index - 1] > GUIDE_EPSILON);
}

export function predrawnGuidesForBoard(
  registration: PredrawnBoardCornerRegistration | undefined,
  columns: number,
  rows: number,
): { columnGuides: number[]; rowGuides: number[] } {
  const grid = predrawnRegistrationGridSize(registration, columns, rows);
  const columnGuides = validPredrawnGuides(registration?.columnGuides)
    && registration.columnGuides.length === grid.columns + 1
    ? [...registration.columnGuides]
    : uniformPredrawnGuides(grid.columns);
  const rowGuides = validPredrawnGuides(registration?.rowGuides)
    && registration.rowGuides.length === grid.rows + 1
    ? [...registration.rowGuides]
    : uniformPredrawnGuides(grid.rows);
  return { columnGuides, rowGuides };
}

export function predrawnRegistrationGridSize(
  registration: PredrawnBoardCornerRegistration | undefined,
  fallbackColumns: number,
  fallbackRows: number,
): { columns: number; rows: number } {
  const guideColumns = validPredrawnGuides(registration?.columnGuides)
    ? registration.columnGuides.length - 1
    : undefined;
  const guideRows = validPredrawnGuides(registration?.rowGuides)
    ? registration.rowGuides.length - 1
    : undefined;
  return {
    columns: validPredrawnGridCount(registration?.gridColumns)
      ? registration.gridColumns
      : guideColumns ?? (validPredrawnGridCount(fallbackColumns) ? fallbackColumns : 1),
    rows: validPredrawnGridCount(registration?.gridRows)
      ? registration.gridRows
      : guideRows ?? (validPredrawnGridCount(fallbackRows) ? fallbackRows : 1),
  };
}

export function clampPredrawnGuide(
  guides: readonly number[],
  index: number,
  value: number,
  minimumGap = 0.002,
): number {
  if (index <= 0 || index >= guides.length - 1 || !Number.isFinite(value)) return guides[index] ?? 0;
  const availableGap = Math.max(GUIDE_EPSILON * 2, guides[index + 1] - guides[index - 1]);
  const gap = Math.min(minimumGap, availableGap / 3);
  return Math.min(guides[index + 1] - gap, Math.max(guides[index - 1] + gap, value));
}

function serializeCornerBase(registration: PredrawnBoardCornerRegistration): string {
  return [
    registration.sourceWidth,
    registration.sourceHeight,
    ...registration.north,
    ...registration.east,
    ...registration.south,
    ...registration.west,
  ].map(formatRegistrationNumber).join(',');
}

function serializeBoundaryReference(reference: PredrawnBoundaryReference): string {
  return [reference.north, reference.east, reference.south, reference.west]
    .flat()
    .map(formatRegistrationNumber)
    .join(',');
}

/** Stable URL value for an owner-authored development registration. */
export function serializePredrawnBoardPreviewRegistration(
  registration: PredrawnBoardCornerRegistration,
): string {
  const base = serializeCornerBase(registration);
  if (!validPredrawnGuides(registration.columnGuides) || !validPredrawnGuides(registration.rowGuides)) {
    return base;
  }
  if (
    validPredrawnGridCount(registration.gridColumns)
    && validPredrawnGridCount(registration.gridRows)
    && registration.columnGuides.length === registration.gridColumns + 1
    && registration.rowGuides.length === registration.gridRows + 1
  ) {
    const gridPayload = [
      base,
      `${registration.gridColumns},${registration.gridRows}`,
      registration.columnGuides.map(formatGuideNumber).join(','),
      registration.rowGuides.map(formatGuideNumber).join(','),
    ];
    if (registration.boundaryReference) {
      return ['v4', ...gridPayload, serializeBoundaryReference(registration.boundaryReference)].join(';');
    }
    return [
      'v3',
      ...gridPayload,
    ].join(';');
  }
  return [
    'v2',
    base,
    registration.columnGuides.map(formatGuideNumber).join(','),
    registration.rowGuides.map(formatGuideNumber).join(','),
  ].join(';');
}

/** Compact, browser-independent packet intended to be pasted directly into a Codex task. */
export function serializePredrawnRegistrationHandoff(
  src: string,
  registration: PredrawnBoardCornerRegistration,
): string {
  return JSON.stringify({
    kind: 'chess-tactics/predrawn-registration',
    source: src,
    registration: serializePredrawnBoardPreviewRegistration(registration),
  });
}

function parseCornerBase(raw: string): PredrawnBoardCornerRegistration | undefined {
  const values = raw.split(',').map(Number);
  if (values.length !== 10 || values.some((value) => !Number.isFinite(value))) return undefined;
  const [sourceWidth, sourceHeight, ...coords] = values;
  if (
    !Number.isSafeInteger(sourceWidth)
    || !Number.isSafeInteger(sourceHeight)
    || sourceWidth < 1
    || sourceHeight < 1
    || sourceWidth > 16384
    || sourceHeight > 16384
  ) return undefined;
  const points = Array.from({ length: 4 }, (_, index) => [coords[index * 2], coords[index * 2 + 1]] as const);
  if (points.some(([x, y]) => x < 0 || x > sourceWidth || y < 0 || y > sourceHeight)) return undefined;
  const [north, east, south, west] = points;
  const ux = (east[0] + south[0] - north[0] - west[0]) / 4;
  const uy = (east[1] + south[1] - north[1] - west[1]) / 4;
  const vx = (west[0] + south[0] - north[0] - east[0]) / 4;
  const vy = (west[1] + south[1] - north[1] - east[1]) / 4;
  if (Math.abs(ux * vy - uy * vx) < 1) return undefined;
  return { sourceWidth, sourceHeight, north, east, south, west };
}

function parsePredrawnBoardRegistration(raw: string): PredrawnBoardCornerRegistration | undefined {
  if (raw.startsWith('v4;')) {
    const parts = raw.split(';');
    if (parts.length !== 6) return undefined;
    const registration = parsePredrawnBoardRegistration(['v3', ...parts.slice(1, 5)].join(';'));
    if (!registration) return undefined;
    const referenceRegistration = parseCornerBase(
      `${registration.sourceWidth},${registration.sourceHeight},${parts[5]}`,
    );
    if (!referenceRegistration) return undefined;
    return {
      ...registration,
      boundaryReference: {
        north: referenceRegistration.north,
        east: referenceRegistration.east,
        south: referenceRegistration.south,
        west: referenceRegistration.west,
      },
    };
  }
  if (raw.startsWith('v3;')) {
    const parts = raw.split(';');
    if (parts.length !== 5) return undefined;
    const registration = parseCornerBase(parts[1]);
    if (!registration) return undefined;
    const [gridColumns, gridRows] = parts[2].split(',').map(Number);
    const columnGuides = parts[3].split(',').map(Number);
    const rowGuides = parts[4].split(',').map(Number);
    if (
      !validPredrawnGridCount(gridColumns)
      || !validPredrawnGridCount(gridRows)
      || !validPredrawnGuides(columnGuides)
      || !validPredrawnGuides(rowGuides)
      || columnGuides.length !== gridColumns + 1
      || rowGuides.length !== gridRows + 1
    ) return undefined;
    return { ...registration, gridColumns, gridRows, columnGuides, rowGuides };
  }
  if (!raw.startsWith('v2;')) return parseCornerBase(raw);
  const parts = raw.split(';');
  if (parts.length !== 4) return undefined;
  const registration = parseCornerBase(parts[1]);
  if (!registration) return undefined;
  const columnGuides = parts[2].split(',').map(Number);
  const rowGuides = parts[3].split(',').map(Number);
  if (!validPredrawnGuides(columnGuides) || !validPredrawnGuides(rowGuides)) return undefined;
  return { ...registration, columnGuides, rowGuides };
}

export function predrawnBoardRegistrationStorageKey(src: string): string {
  return `${PREDRAWN_REGISTRATION_STORAGE_PREFIX}${src}`;
}

function browserRegistrationStorage(): RegistrationStorage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

/** Synchronously persist an owner-picked candidate registration in this browser. */
export function storePredrawnBoardRegistration(
  src: string,
  registration: PredrawnBoardCornerRegistration,
  storage = browserRegistrationStorage(),
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(predrawnBoardRegistrationStorageKey(src), JSON.stringify({
      version: 4,
      registration: serializePredrawnBoardPreviewRegistration(registration),
    }));
    return true;
  } catch {
    return false;
  }
}

/** Read the last registration written for this exact candidate source. */
export function storedPredrawnBoardRegistration(
  src: string,
  storage = browserRegistrationStorage(),
): PredrawnBoardCornerRegistration | undefined {
  if (!storage) return undefined;
  try {
    const raw = storage.getItem(predrawnBoardRegistrationStorageKey(src));
    if (!raw) return undefined;
    const record = JSON.parse(raw) as { version?: unknown; registration?: unknown };
    if (
      record.version !== 1
      && record.version !== 2
      && record.version !== 3
      && record.version !== 4
    ) return undefined;
    if (typeof record.registration !== 'string') return undefined;
    return parsePredrawnBoardRegistration(record.registration);
  } catch {
    return undefined;
  }
}

/** Write and synchronously prove that this browser retained the exact registration. */
export function savePredrawnBoardRegistrationLocally(
  src: string,
  registration: PredrawnBoardCornerRegistration,
  storage = browserRegistrationStorage(),
): PredrawnBoardCornerRegistration | undefined {
  if (!storage || !storePredrawnBoardRegistration(src, registration, storage)) return undefined;
  const readBack = storedPredrawnBoardRegistration(src, storage);
  if (
    !readBack
    || serializePredrawnBoardPreviewRegistration(readBack)
      !== serializePredrawnBoardPreviewRegistration(registration)
  ) return undefined;
  return readBack;
}

/** Resolve the accepted live-media version for an ordinary saved pre-drawn board. */
export function runtimePredrawnBoardPlate(surface: PredrawnBoardSurface): PredrawnBoardPlate {
  return { surface, src: resolvedLiveMediaUrl(surface.slot) };
}

const TEMPORARY_PREDRAWN_REVIEW_SLOT = 'boards/review/uncommitted/plate.png';

/**
 * Mount a registered development candidate in the real editor even before it has an accepted
 * live-media surface. The synthetic surface supplies source-frame dimensions only; it is never
 * written to the EditorBoard and therefore cannot become a packaged or runtime media pointer.
 */
export function predrawnBoardPlateForEditorReview(
  surface: PredrawnBoardSurface | undefined,
  src: string | null,
  registration: PredrawnBoardCornerRegistration | undefined,
): PredrawnBoardPlate | undefined {
  if (src && registration) {
    return {
      surface: surface ?? {
        kind: 'predrawn',
        slot: TEMPORARY_PREDRAWN_REVIEW_SLOT,
        frameWidth: registration.sourceWidth,
        frameHeight: registration.sourceHeight,
      },
      src,
      registration,
    };
  }
  return surface ? runtimePredrawnBoardPlate(surface) : undefined;
}

/**
 * A development-only candidate seam used by temporary board links. It is deliberately restricted
 * to same-origin Vite review files and cannot turn a saved level into an arbitrary remote image.
 */
export function predrawnBoardPreviewSrc(
  search: string,
  origin: string,
  dev = import.meta.env.DEV,
): string | null {
  if (!dev) return null;
  const raw = new URLSearchParams(search).get('predrawnPreview');
  if (!raw) return null;
  try {
    const url = new URL(raw, origin);
    if (url.origin !== origin || !url.pathname.startsWith('/tmp-shots/')) return null;
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

/** Parse legacy corners, fitted guides, refit dimensions, and optional pinned boundary metadata. */
export function predrawnBoardPreviewRegistration(
  search: string,
  dev = import.meta.env.DEV,
): PredrawnBoardCornerRegistration | undefined {
  if (!dev) return undefined;
  const raw = new URLSearchParams(search).get('predrawnCorners');
  if (!raw) return undefined;
  return parsePredrawnBoardRegistration(raw);
}

function boardOuterCorners(
  cells: readonly { x: number; y: number }[],
  dimensions = boardCellDimensions(cells),
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

function boardCellDimensions(cells: readonly { x: number; y: number }[]): { columns: number; rows: number } {
  if (!cells.length) return { columns: 0, rows: 0 };
  const xs = cells.map((cell) => cell.x);
  const ys = cells.map((cell) => cell.y);
  return {
    columns: Math.max(...xs) - Math.min(...xs) + 1,
    rows: Math.max(...ys) - Math.min(...ys) + 1,
  };
}

/**
 * Grid cells shown while reviewing a registered candidate. The fitted target may deliberately
 * describe more painted rows/columns than the authored level so generation mistakes remain
 * visible after the picker closes. Gameplay cells and hit targets are not changed.
 */
export function predrawnReviewGridCells(
  cells: readonly { x: number; y: number }[],
  registration: PredrawnBoardCornerRegistration | undefined,
): { x: number; y: number }[] {
  if (!cells.length || !registration) return [...cells];
  const levelDimensions = boardCellDimensions(cells);
  const refitDimensions = predrawnRegistrationGridSize(
    registration,
    levelDimensions.columns,
    levelDimensions.rows,
  );
  const minX = Math.min(...cells.map((cell) => cell.x));
  const minY = Math.min(...cells.map((cell) => cell.y));
  return Array.from({ length: refitDimensions.rows }, (_, row) =>
    Array.from({ length: refitDimensions.columns }, (__, column) => ({
      x: minX + column,
      y: minY + row,
    })),
  ).flat();
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
    return Math.max(max, Math.hypot(projected[0] - targets[index][0], projected[1] - targets[index][1]));
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
    .map(([x, y]) => [x * scaleX, y * scaleY] as const) as [PredrawnPoint, PredrawnPoint, PredrawnPoint, PredrawnPoint];
}

const UNIT_CORNERS: readonly PredrawnPoint[] = [[0, 0], [1, 0], [1, 1], [0, 1]];

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

/** Exact four-point projective registration. Every source corner is a hard constraint. */
export function predrawnBoardHomography(
  surface: PredrawnBoardSurface,
  cells: readonly { x: number; y: number }[],
  registration: PredrawnBoardCornerRegistration,
): PredrawnBoardHomography | undefined {
  const levelDimensions = boardCellDimensions(cells);
  const refitDimensions = predrawnRegistrationGridSize(
    registration,
    levelDimensions.columns,
    levelDimensions.rows,
  );
  const targets = boardOuterCorners(cells, refitDimensions);
  if (!targets) return undefined;
  const sources = scaledRegistrationCorners(registration, surface.frameWidth, surface.frameHeight);
  return homographyForFourPoints(sources, targets);
}

/**
 * Full painted-frame boundary in board-centred coordinates. ViewPane uses this exact transformed
 * polygon to derive the zoom floor that keeps a pre-drawn scene covering its viewport.
 */
export function predrawnBoardCoverPolygon(
  plate: PredrawnBoardPlate,
  cells: readonly { x: number; y: number }[],
): { x: number; y: number }[] {
  const metrics = boardLabMetrics(cells);
  const homography = plate.registration
    ? predrawnBoardHomography(plate.surface, cells, plate.registration)
    : undefined;
  if (homography) {
    const frameCorners: readonly PredrawnPoint[] = [
      [0, 0],
      [plate.surface.frameWidth, 0],
      [plate.surface.frameWidth, plate.surface.frameHeight],
      [0, plate.surface.frameHeight],
    ];
    const projected = frameCorners.map((point) => projectPredrawnPoint(homography, point));
    if (projected.every((point): point is PredrawnPoint => point !== undefined)) {
      return projected.map(([x, y]) => ({ x: x + metrics.originLeft, y: y + metrics.originTop }));
    }
  }
  const placement = predrawnBoardPlacement(plate.surface, cells);
  const left = placement.left + metrics.originLeft;
  const top = placement.top + metrics.originTop;
  return [
    { x: left, y: top },
    { x: left + placement.width, y: top },
    { x: left + placement.width, y: top + placement.height },
    { x: left, y: top + placement.height },
  ];
}

function guideValueAtCanonicalCoordinate(guides: readonly number[], coordinate: number): number {
  const cellCount = guides.length - 1;
  if (coordinate <= 0) return guides[0] + coordinate * cellCount * (guides[1] - guides[0]);
  if (coordinate >= 1) {
    return guides[cellCount] + (coordinate - 1) * cellCount * (guides[cellCount] - guides[cellCount - 1]);
  }
  const scaled = coordinate * cellCount;
  const index = Math.min(cellCount - 1, Math.floor(scaled));
  const fraction = scaled - index;
  return guides[index] + (guides[index + 1] - guides[index]) * fraction;
}

export function predrawnRectifiedSourcePoint(
  registration: PredrawnBoardCornerRegistration,
  destination: PredrawnPoint,
  frame: { width: number; height: number },
): PredrawnPoint | undefined {
  if (!validPredrawnGuides(registration.columnGuides) || !validPredrawnGuides(registration.rowGuides)) {
    return destination;
  }
  const corners = scaledRegistrationCorners(registration, frame.width, frame.height);
  const destinationToUnit = homographyForFourPoints(corners, UNIT_CORNERS);
  const unitToSource = homographyForFourPoints(UNIT_CORNERS, corners);
  if (!destinationToUnit || !unitToSource) return undefined;
  const canonical = projectPredrawnPoint(destinationToUnit, destination);
  if (!canonical) return undefined;
  return projectPredrawnPoint(unitToSource, [
    guideValueAtCanonicalCoordinate(registration.columnGuides, canonical[0]),
    guideValueAtCanonicalCoordinate(registration.rowGuides, canonical[1]),
  ]);
}

function isUniformGuideSet(guides: readonly number[]): boolean {
  const cells = guides.length - 1;
  return guides.every((value, index) => Math.abs(value - index / cells) <= GUIDE_EPSILON);
}

function hasApplicableRectification(
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

function drawRectifiedPlate(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  registration: PredrawnBoardCornerRegistration,
  width: number,
  height: number,
): boolean {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return false;
  const sourceCanvas = document.createElement('canvas');
  sourceCanvas.width = width;
  sourceCanvas.height = height;
  const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true });
  if (!sourceContext) return false;
  sourceContext.drawImage(image, 0, 0, width, height);
  const sourceImage = sourceContext.getImageData(0, 0, width, height);
  const outputImage = context.createImageData(width, height);
  outputImage.data.set(sourceImage.data);

  const corners = scaledRegistrationCorners(registration, width, height);
  const destinationToUnit = homographyForFourPoints(corners, UNIT_CORNERS);
  const unitToSource = homographyForFourPoints(UNIT_CORNERS, corners);
  if (!destinationToUnit || !unitToSource || !registration.columnGuides || !registration.rowGuides) return false;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const unitDenominator = destinationToUnit.h31 * x + destinationToUnit.h32 * y + 1;
      if (Math.abs(unitDenominator) < 1e-10) continue;
      const canonicalU = (destinationToUnit.h11 * x + destinationToUnit.h12 * y + destinationToUnit.h13) / unitDenominator;
      const canonicalV = (destinationToUnit.h21 * x + destinationToUnit.h22 * y + destinationToUnit.h23) / unitDenominator;
      const sourceU = guideValueAtCanonicalCoordinate(registration.columnGuides, canonicalU);
      const sourceV = guideValueAtCanonicalCoordinate(registration.rowGuides, canonicalV);
      const sourceDenominator = unitToSource.h31 * sourceU + unitToSource.h32 * sourceV + 1;
      if (Math.abs(sourceDenominator) < 1e-10) continue;
      const sourceX = (unitToSource.h11 * sourceU + unitToSource.h12 * sourceV + unitToSource.h13) / sourceDenominator;
      const sourceY = (unitToSource.h21 * sourceU + unitToSource.h22 * sourceV + unitToSource.h23) / sourceDenominator;
      sampleBilinear(sourceImage.data, width, height, sourceX, sourceY, outputImage.data, (y * width + x) * 4);
    }
  }
  context.putImageData(outputImage, 0, 0);
  return true;
}

function PredrawnRectifiedCanvas({
  plate,
  style,
}: {
  plate: PredrawnBoardPlate & { registration: PredrawnBoardCornerRegistration };
  style: CSSProperties;
}): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const registrationKey = serializePredrawnBoardPreviewRegistration(plate.registration);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      if (cancelled || !canvasRef.current) return;
      const canvas = canvasRef.current;
      canvas.width = plate.surface.frameWidth;
      canvas.height = plate.surface.frameHeight;
      try {
        setReady(drawRectifiedPlate(
          canvas,
          image,
          plate.registration,
          plate.surface.frameWidth,
          plate.surface.frameHeight,
        ));
      } catch {
        setReady(false);
      }
    };
    image.src = plate.src;
    return () => { cancelled = true; };
  }, [plate.src, plate.surface.frameHeight, plate.surface.frameWidth, registrationKey]);

  return (
    <canvas
      ref={canvasRef}
      className="predrawn-board-layer predrawn-board-layer-rectified"
      data-testid="predrawn-board-rectified-layer"
      aria-hidden="true"
      style={{ ...style, visibility: ready ? 'visible' : 'hidden' }}
    />
  );
}

export function PredrawnBoardLayer({
  plate,
  cells,
}: {
  plate: PredrawnBoardPlate;
  cells: readonly { x: number; y: number }[];
}): ReactElement {
  const homography = plate.registration
    ? predrawnBoardHomography(plate.surface, cells, plate.registration)
    : undefined;
  const placement = homography ? undefined : predrawnBoardPlacement(plate.surface, cells);
  const style = (homography ? {
    left: '0px',
    top: '0px',
    width: `${plate.surface.frameWidth}px`,
    height: `${plate.surface.frameHeight}px`,
    transform: `matrix3d(${[
      homography.h11, homography.h21, 0, homography.h31,
      homography.h12, homography.h22, 0, homography.h32,
      0, 0, 1, 0,
      homography.h13, homography.h23, 0, 1,
    ].join(',')})`,
    transformOrigin: '0 0',
  } : {
    left: `${placement!.left}px`,
    top: `${placement!.top}px`,
    width: `${placement!.width}px`,
    height: `${placement!.height}px`,
  }) as CSSProperties;
  const dimensions = boardCellDimensions(cells);
  const rectified = Boolean(
    homography
    && plate.registration
    && hasApplicableRectification(plate.registration, dimensions.columns, dimensions.rows),
  );

  return (
    <>
      <img
        className="predrawn-board-layer"
        data-testid="predrawn-board-layer"
        src={plate.src}
        alt=""
        aria-hidden="true"
        decoding="async"
        draggable={false}
        style={style}
      />
      {rectified ? (
        <PredrawnRectifiedCanvas
          plate={plate as PredrawnBoardPlate & { registration: PredrawnBoardCornerRegistration }}
          style={style}
        />
      ) : null}
    </>
  );
}
