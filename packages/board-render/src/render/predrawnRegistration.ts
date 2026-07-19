export type PredrawnPoint = readonly [x: number, y: number];

export interface PredrawnBoundaryReference {
  north: PredrawnPoint;
  east: PredrawnPoint;
  south: PredrawnPoint;
  west: PredrawnPoint;
}

/**
 * One whole-plate registration. Corners are source-image pixels in north/east/south/west
 * order. Optional monotonic guides describe the continuous row/column refit, and the boundary
 * reference remains review metadata rather than a second rendering transform.
 */
export interface PredrawnBoardCornerRegistration {
  sourceWidth: number;
  sourceHeight: number;
  north: PredrawnPoint;
  east: PredrawnPoint;
  south: PredrawnPoint;
  west: PredrawnPoint;
  gridColumns?: number;
  gridRows?: number;
  columnGuides?: readonly number[];
  rowGuides?: readonly number[];
  boundaryReference?: PredrawnBoundaryReference;
}

const MAX_GUIDES_PER_AXIS = 65;
export const PREDRAWN_GUIDE_EPSILON = 1e-6;
const MAX_SOURCE_DIMENSION = 16384;

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
  if (
    Math.abs(guides[0]) > PREDRAWN_GUIDE_EPSILON
    || Math.abs(guides[guides.length - 1] - 1) > PREDRAWN_GUIDE_EPSILON
  ) {
    return false;
  }
  return guides.every(
    (value, index) => index === 0 || value - guides[index - 1] > PREDRAWN_GUIDE_EPSILON,
  );
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
  const availableGap = Math.max(PREDRAWN_GUIDE_EPSILON * 2, guides[index + 1] - guides[index - 1]);
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

/** Stable compact value shared by URL review handoffs and persisted board-code surfaces. */
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
    return ['v3', ...gridPayload].join(';');
  }
  return [
    'v2',
    base,
    registration.columnGuides.map(formatGuideNumber).join(','),
    registration.rowGuides.map(formatGuideNumber).join(','),
  ].join(';');
}

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
    || sourceWidth > MAX_SOURCE_DIMENSION
    || sourceHeight > MAX_SOURCE_DIMENSION
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

/** Parse any supported legacy/v2/v3/v4 registration; malformed values fail closed. */
export function parsePredrawnBoardRegistration(raw: string): PredrawnBoardCornerRegistration | undefined {
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

/** Normalize an in-memory or compact persisted registration through the same parser. */
export function normalizePredrawnBoardRegistration(
  value: unknown,
): PredrawnBoardCornerRegistration | undefined {
  if (typeof value === 'string') return parsePredrawnBoardRegistration(value);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Partial<PredrawnBoardCornerRegistration>;
  try {
    return parsePredrawnBoardRegistration(serializePredrawnBoardPreviewRegistration(
      record as PredrawnBoardCornerRegistration,
    ));
  } catch {
    return undefined;
  }
}
