import {
  homographyForPredrawnPoints,
  projectPredrawnPoint,
  type PredrawnPoint,
} from './predrawnProjective';

export type { PredrawnPoint } from './predrawnProjective';

export interface PredrawnBoundaryReference {
  north: PredrawnPoint;
  east: PredrawnPoint;
  south: PredrawnPoint;
  west: PredrawnPoint;
}

export interface PredrawnMeshNodeOverride {
  /** Zero-based interior shared grid-intersection column. */
  column: number;
  /** Zero-based interior shared grid-intersection row. */
  row: number;
  /** Exact point selected in intrinsic source-image pixels. */
  point: PredrawnPoint;
}

/**
 * One whole-plate registration. Corners are source-image pixels in north/east/south/west
 * order. Optional monotonic guides describe the continuous row/column refit. Sparse mesh
 * overrides refine shared intersections without creating independent cell corners, and the
 * boundary reference remains review metadata rather than a second rendering transform.
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
  meshOverrides?: readonly PredrawnMeshNodeOverride[];
}

const MAX_GUIDES_PER_AXIS = 65;
export const PREDRAWN_GUIDE_EPSILON = 1e-6;
export const PREDRAWN_MESH_JACOBIAN_EPSILON = 1e-12;
export const MAX_PREDRAWN_MESH_OVERRIDES = 1024;
const MAX_SOURCE_DIMENSION = 16384;
const UNIT_CORNERS: readonly PredrawnPoint[] = [[0, 0], [1, 0], [1, 1], [0, 1]];

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

function canonicalRegistrationNumber(value: number): number {
  return Number(formatRegistrationNumber(value));
}

function canonicalGuideNumber(value: number): number {
  return Number(formatGuideNumber(value));
}

function meshNodeKey(column: number, row: number): string {
  return `${column},${row}`;
}

function sortedMeshOverrides(
  overrides: readonly PredrawnMeshNodeOverride[],
): PredrawnMeshNodeOverride[] {
  return [...overrides]
    .map(({ column, row, point }) => ({
      column,
      row,
      point: [
        canonicalRegistrationNumber(point[0]),
        canonicalRegistrationNumber(point[1]),
      ] as const,
    }))
    .sort((left, right) => left.row - right.row || left.column - right.column);
}

function coarseSourceMeshNode(
  registration: PredrawnBoardCornerRegistration,
  column: number,
  row: number,
): PredrawnPoint | undefined {
  const columns = registration.gridColumns;
  const rows = registration.gridRows;
  if (
    !validPredrawnGridCount(columns)
    || !validPredrawnGridCount(rows)
    || !validPredrawnGuides(registration.columnGuides)
    || !validPredrawnGuides(registration.rowGuides)
    || registration.columnGuides.length !== columns + 1
    || registration.rowGuides.length !== rows + 1
    || !Number.isSafeInteger(column)
    || !Number.isSafeInteger(row)
    || column < 0
    || column > columns
    || row < 0
    || row > rows
  ) return undefined;
  const unitToSource = homographyForPredrawnPoints(
    UNIT_CORNERS,
    [registration.north, registration.east, registration.south, registration.west],
  );
  return unitToSource
    ? projectPredrawnPoint(unitToSource, [
        registration.columnGuides[column],
        registration.rowGuides[row],
      ])
    : undefined;
}

function withoutCanonicalCoarseNodeNoops(
  registration: PredrawnBoardCornerRegistration,
): PredrawnMeshNodeOverride[] {
  return (registration.meshOverrides ?? []).filter((override) => {
    const coarsePoint = coarseSourceMeshNode(registration, override.column, override.row);
    return !coarsePoint
      || canonicalRegistrationNumber(coarsePoint[0]) !== override.point[0]
      || canonicalRegistrationNumber(coarsePoint[1]) !== override.point[1];
  });
}

function isBoundaryMeshNode(
  column: number,
  row: number,
  columns: number,
  rows: number,
): boolean {
  return column === 0 || column === columns || row === 0 || row === rows;
}

function subtractPoints(left: PredrawnPoint, right: PredrawnPoint): PredrawnPoint {
  return [left[0] - right[0], left[1] - right[1]];
}

function crossPoints(left: PredrawnPoint, right: PredrawnPoint): number {
  return left[0] * right[1] - left[1] * right[0];
}

function cellMeshJacobians(
  northWest: PredrawnPoint,
  northEast: PredrawnPoint,
  southEast: PredrawnPoint,
  southWest: PredrawnPoint,
): readonly number[] {
  const north = subtractPoints(northEast, northWest);
  const south = subtractPoints(southEast, southWest);
  const west = subtractPoints(southWest, northWest);
  const east = subtractPoints(southEast, northEast);
  return [
    crossPoints(north, west),
    crossPoints(north, east),
    crossPoints(south, west),
    crossPoints(south, east),
  ];
}

function meshUnitNodes(
  registration: PredrawnBoardCornerRegistration,
): readonly PredrawnPoint[] | undefined {
  const columns = registration.gridColumns;
  const rows = registration.gridRows;
  if (
    !validPredrawnGridCount(columns)
    || !validPredrawnGridCount(rows)
    || !validPredrawnGuides(registration.columnGuides)
    || !validPredrawnGuides(registration.rowGuides)
    || registration.columnGuides.length !== columns + 1
    || registration.rowGuides.length !== rows + 1
  ) return undefined;
  const sourceToUnit = homographyForPredrawnPoints(
    [registration.north, registration.east, registration.south, registration.west],
    UNIT_CORNERS,
  );
  if (!sourceToUnit) return undefined;
  const nodes = Array.from(
    { length: (columns + 1) * (rows + 1) },
    (_, index): PredrawnPoint => [
      registration.columnGuides![index % (columns + 1)],
      registration.rowGuides![Math.floor(index / (columns + 1))],
    ],
  );
  for (const override of registration.meshOverrides ?? []) {
    const projected = projectPredrawnPoint(sourceToUnit, override.point);
    if (!projected) return undefined;
    nodes[override.row * (columns + 1) + override.column] = projected;
  }
  return nodes;
}

/**
 * Explain why a sparse shared-vertex mesh cannot be applied.
 *
 * Validation covers the complete mesh, not only the edited node, so a coarse corner/guide
 * adjustment cannot silently fold a cell that happens not to be selected in the UI.
 */
export function predrawnMeshValidationIssue(
  registration: PredrawnBoardCornerRegistration,
): string | undefined {
  const overrides = registration.meshOverrides;
  if (overrides === undefined) return undefined;
  if (!Array.isArray(overrides)) return 'mesh overrides must be an array';
  if (overrides.length === 0) return undefined;
  const columns = registration.gridColumns;
  const rows = registration.gridRows;
  if (
    !Number.isSafeInteger(registration.sourceWidth)
    || !Number.isSafeInteger(registration.sourceHeight)
    || registration.sourceWidth < 1
    || registration.sourceHeight < 1
    || registration.sourceWidth > MAX_SOURCE_DIMENSION
    || registration.sourceHeight > MAX_SOURCE_DIMENSION
  ) return 'mesh registration source dimensions are invalid';
  if (
    [registration.north, registration.east, registration.south, registration.west].some(
      (point) => (
        !Array.isArray(point)
        || point.length !== 2
        || !Number.isFinite(point[0])
        || !Number.isFinite(point[1])
        || point[0] < 0
        || point[0] > registration.sourceWidth
        || point[1] < 0
        || point[1] > registration.sourceHeight
      ),
    )
  ) return 'mesh registration corners lie outside the source image';
  if (
    !validPredrawnGridCount(columns)
    || !validPredrawnGridCount(rows)
    || !validPredrawnGuides(registration.columnGuides)
    || !validPredrawnGuides(registration.rowGuides)
    || registration.columnGuides.length !== columns + 1
    || registration.rowGuides.length !== rows + 1
  ) return 'mesh overrides require exact grid dimensions and matching valid guides';
  if (
    overrides.length > MAX_PREDRAWN_MESH_OVERRIDES
    || overrides.length > Math.max(0, (columns - 1) * (rows - 1))
  ) {
    return `mesh override count exceeds the ${MAX_PREDRAWN_MESH_OVERRIDES}-node interior limit`;
  }

  const keys = new Set<string>();
  for (const override of overrides) {
    if (!override || typeof override !== 'object') return 'mesh override must be an object';
    if (
      !Number.isSafeInteger(override.column)
      || !Number.isSafeInteger(override.row)
      || override.column < 0
      || override.column > columns
      || override.row < 0
      || override.row > rows
    ) return 'mesh override address lies outside the registration grid';
    if (isBoundaryMeshNode(override.column, override.row, columns, rows)) {
      return 'mesh overrides must address interior intersections';
    }
    if (
      !Array.isArray(override.point)
      || override.point.length !== 2
      || !Number.isFinite(override.point[0])
      || !Number.isFinite(override.point[1])
      || override.point[0] < 0
      || override.point[0] > registration.sourceWidth
      || override.point[1] < 0
      || override.point[1] > registration.sourceHeight
    ) return 'mesh override point lies outside the source image';
    const key = meshNodeKey(override.column, override.row);
    if (keys.has(key)) return 'mesh override addresses must be unique';
    keys.add(key);
  }

  const nodes = meshUnitNodes(registration);
  if (!nodes) return 'mesh overrides cannot be projected into the registered board plane';
  const stride = columns + 1;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const northWest = nodes[row * stride + column];
      const northEast = nodes[row * stride + column + 1];
      const southWest = nodes[(row + 1) * stride + column];
      const southEast = nodes[(row + 1) * stride + column + 1];
      if (cellMeshJacobians(northWest, northEast, southEast, southWest).some(
        (jacobian) => !Number.isFinite(jacobian) || jacobian <= PREDRAWN_MESH_JACOBIAN_EPSILON,
      )) {
        return `mesh override folds or degenerates cell ${column},${row}`;
      }
    }
  }
  return undefined;
}

export function validPredrawnMeshOverrides(
  registration: PredrawnBoardCornerRegistration,
): boolean {
  return predrawnMeshValidationIssue(registration) === undefined;
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
  if (registration.meshOverrides?.length) {
    if (
      !validPredrawnGridCount(registration.gridColumns)
      || !validPredrawnGridCount(registration.gridRows)
      || !validPredrawnGuides(registration.columnGuides)
      || !validPredrawnGuides(registration.rowGuides)
      || registration.columnGuides.length !== registration.gridColumns + 1
      || registration.rowGuides.length !== registration.gridRows + 1
    ) throw new Error('mesh overrides require exact grid dimensions and matching valid guides');
    const canonicalCorners = parseCornerBase(base);
    if (!canonicalCorners) {
      throw new Error('mesh registration corners cannot be canonically serialized');
    }
    const columnGuides = registration.columnGuides.map(canonicalGuideNumber);
    const rowGuides = registration.rowGuides.map(canonicalGuideNumber);
    if (
      !validPredrawnGuides(columnGuides)
      || !validPredrawnGuides(rowGuides)
      || columnGuides.length !== registration.gridColumns + 1
      || rowGuides.length !== registration.gridRows + 1
    ) {
      throw new Error('mesh overrides require canonically distinct valid guides');
    }
    let boundaryReference: PredrawnBoundaryReference | undefined;
    if (registration.boundaryReference) {
      const canonicalBoundary = parseCornerBase(
        `${canonicalCorners.sourceWidth},${canonicalCorners.sourceHeight},${serializeBoundaryReference(registration.boundaryReference)}`,
      );
      if (!canonicalBoundary) {
        throw new Error('mesh registration boundary cannot be canonically serialized');
      }
      boundaryReference = {
        north: canonicalBoundary.north,
        east: canonicalBoundary.east,
        south: canonicalBoundary.south,
        west: canonicalBoundary.west,
      };
    }
    const canonicalRegistration: PredrawnBoardCornerRegistration = {
      ...canonicalCorners,
      gridColumns: registration.gridColumns,
      gridRows: registration.gridRows,
      columnGuides,
      rowGuides,
      ...(boundaryReference ? { boundaryReference } : {}),
      meshOverrides: sortedMeshOverrides(registration.meshOverrides),
    };
    const issue = predrawnMeshValidationIssue(canonicalRegistration);
    if (issue) throw new Error(issue);
    const meshOverrides = withoutCanonicalCoarseNodeNoops(canonicalRegistration);
    if (!meshOverrides.length) {
      const { meshOverrides: _removed, ...coarseRegistration } = canonicalRegistration;
      return serializePredrawnBoardPreviewRegistration(coarseRegistration);
    }
    const boundary = boundaryReference
      ? serializeBoundaryReference(boundaryReference)
      : '';
    const mesh = meshOverrides
      .map(({ column, row, point }) => [
        column,
        row,
        formatRegistrationNumber(point[0]),
        formatRegistrationNumber(point[1]),
      ].join(','))
      .join('|');
    return [
      'v5',
      serializeCornerBase(canonicalRegistration),
      `${canonicalRegistration.gridColumns},${canonicalRegistration.gridRows}`,
      columnGuides.map(formatGuideNumber).join(','),
      rowGuides.map(formatGuideNumber).join(','),
      boundary,
      mesh,
    ].join(';');
  }
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

/** Parse any supported legacy/v2/v3/v4/v5 registration; malformed values fail closed. */
export function parsePredrawnBoardRegistration(raw: string): PredrawnBoardCornerRegistration | undefined {
  if (raw.startsWith('v5;')) {
    const parts = raw.split(';');
    if (parts.length !== 7 || !parts[6]) return undefined;
    const registration = parsePredrawnBoardRegistration(['v3', ...parts.slice(1, 5)].join(';'));
    if (!registration) return undefined;
    let boundaryReference: PredrawnBoundaryReference | undefined;
    if (parts[5]) {
      const referenceRegistration = parseCornerBase(
        `${registration.sourceWidth},${registration.sourceHeight},${parts[5]}`,
      );
      if (!referenceRegistration) return undefined;
      boundaryReference = {
        north: referenceRegistration.north,
        east: referenceRegistration.east,
        south: referenceRegistration.south,
        west: referenceRegistration.west,
      };
    }
    const meshOverrides: PredrawnMeshNodeOverride[] = [];
    for (const rawOverride of parts[6].split('|')) {
      const values = rawOverride.split(',').map(Number);
      if (values.length !== 4 || values.some((value) => !Number.isFinite(value))) return undefined;
      const [column, row, x, y] = values;
      meshOverrides.push({ column, row, point: [x, y] });
    }
    const candidate: PredrawnBoardCornerRegistration = {
      ...registration,
      ...(boundaryReference ? { boundaryReference } : {}),
      meshOverrides: sortedMeshOverrides(meshOverrides),
    };
    if (!validPredrawnMeshOverrides(candidate)) return undefined;
    const canonicalOverrides = withoutCanonicalCoarseNodeNoops(candidate);
    if (!canonicalOverrides.length) {
      const { meshOverrides: _removed, ...coarseRegistration } = candidate;
      return coarseRegistration;
    }
    return { ...candidate, meshOverrides: canonicalOverrides };
  }
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
