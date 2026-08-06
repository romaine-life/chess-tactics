import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
} from 'react';
import { createPortal } from 'react-dom';
import {
  clearAllPredrawnMeshOverrides,
  clearPredrawnMeshCellOverrides,
  clearPredrawnMeshNodeOverride,
  movePredrawnMeshNode,
  normalizePredrawnBoardRegistration,
  predrawnMeshCellsForNode,
  predrawnMeshNodeIsOverridden,
  predrawnMeshValidationIssue,
  predrawnSourceMeshNode,
  type PredrawnMeshCellAddress,
  type PredrawnMeshNodeOverride,
} from '@chess-tactics/board-render';
import { TILE_STEP_X, TILE_STEP_Y } from '../art/projectionContract';
import {
  clampPredrawnGuide,
  normalizePredrawnGridCount,
  predrawnGuidesForBoard,
  predrawnRegistrationGridSize,
  predrawnSourceGridCoordinate,
  predrawnSourceGridPoint,
  savePredrawnBoardRegistrationLocally,
  serializePredrawnRegistrationHandoff,
  storedPredrawnBoardRegistration,
  uniformPredrawnGuides,
  type PredrawnBoundaryReference,
  type PredrawnBoardCornerRegistration,
  type PredrawnPoint,
} from '../render/PredrawnBoardLayer';
import { chromeUnitClassNames } from './chromeUnitRegistry';
import { ChromeButton } from './shared/ChromeButton';

export type PredrawnCornerName = 'north' | 'east' | 'south' | 'west';
export type PredrawnCornerPoints = Record<PredrawnCornerName, PredrawnPoint | undefined>;
type CornerPoints = PredrawnCornerPoints;
type RegistrationSaveState = 'idle' | 'pending' | 'saved' | 'error';
type HandoffCopyState = 'idle' | 'copied' | 'error';
type GridEditMode = 'coarse' | 'local';
type LocalConstraintState = 'idle' | 'constrained' | 'reset';
type ActiveControl =
  | { kind: 'corner'; corner: PredrawnCornerName }
  | { kind: 'reference-corner'; corner: PredrawnCornerName }
  | { kind: 'column'; index: number }
  | { kind: 'row'; index: number }
  | { kind: 'local-cell'; column: number; row: number }
  | {
      kind: 'local-node';
      column: number;
      row: number;
      cellColumn: number;
      cellRow: number;
      corner: PredrawnCornerName;
    }
  | { kind: 'move' };
type DragState = ActiveControl & {
  pointerId: number;
  startPoint?: PredrawnPoint;
  startCorners?: CornerPoints;
  startMeshOverrides?: readonly PredrawnMeshNodeOverride[];
  startGridSnapshot: PredrawnGridCalibrationSnapshot;
};
type ViewportPanState = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startScrollLeft: number;
  startScrollTop: number;
};
type PredrawnSourceZoom = 'fit' | 0.5 | 0.75 | 1 | 1.5 | 2 | 3 | 4;
type PredrawnViewportZoomAnchor = {
  sourceX: number;
  sourceY: number;
  viewportX: number;
  viewportY: number;
};
export interface PredrawnGridCalibrationSnapshot {
  points: PredrawnCornerPoints;
  boundaryPoints: PredrawnCornerPoints;
  gridColumns: number;
  gridRows: number;
  columnGuides: number[];
  rowGuides: number[];
  meshOverrides: PredrawnMeshNodeOverride[];
}

export interface PredrawnGridHistory {
  undo: PredrawnGridCalibrationSnapshot[];
  redo: PredrawnGridCalibrationSnapshot[];
}

const GRID_HISTORY_LIMIT = 100;
const PREDRAWN_SOURCE_ZOOM_LEVELS = [0.5, 0.75, 1, 1.5, 2, 3, 4] as const;

const CORNERS: readonly PredrawnCornerName[] = ['north', 'east', 'south', 'west'];
const CORNER_POINT_NUMBER: Record<PredrawnCornerName, number> = {
  north: 1,
  east: 2,
  south: 3,
  west: 4,
};

function clonePredrawnMeshOverrides(
  snapshot: readonly PredrawnMeshNodeOverride[],
): PredrawnMeshNodeOverride[] {
  return snapshot.map((override) => ({
    ...override,
    point: [...override.point] as PredrawnPoint,
  }));
}

function predrawnMeshOverridesMatch(
  left: readonly PredrawnMeshNodeOverride[],
  right: readonly PredrawnMeshNodeOverride[],
): boolean {
  return left.length === right.length && left.every((entry, index) => {
    const other = right[index];
    return Boolean(
      other
      && entry.column === other.column
      && entry.row === other.row
      && entry.point[0] === other.point[0]
      && entry.point[1] === other.point[1],
    );
  });
}

function clonePredrawnCornerPoints(points: PredrawnCornerPoints): PredrawnCornerPoints {
  return Object.fromEntries(CORNERS.map((corner) => [
    corner,
    points[corner] ? [...points[corner]!] as PredrawnPoint : undefined,
  ])) as PredrawnCornerPoints;
}

function predrawnCornerPointsMatch(
  left: PredrawnCornerPoints,
  right: PredrawnCornerPoints,
): boolean {
  return CORNERS.every((corner) => {
    const leftPoint = left[corner];
    const rightPoint = right[corner];
    return leftPoint === undefined
      ? rightPoint === undefined
      : rightPoint !== undefined
        && leftPoint[0] === rightPoint[0]
        && leftPoint[1] === rightPoint[1];
  });
}

function predrawnNumberArraysMatch(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function clonePredrawnGridCalibrationSnapshot(
  snapshot: PredrawnGridCalibrationSnapshot,
): PredrawnGridCalibrationSnapshot {
  return {
    points: clonePredrawnCornerPoints(snapshot.points),
    boundaryPoints: clonePredrawnCornerPoints(snapshot.boundaryPoints),
    gridColumns: snapshot.gridColumns,
    gridRows: snapshot.gridRows,
    columnGuides: [...snapshot.columnGuides],
    rowGuides: [...snapshot.rowGuides],
    meshOverrides: clonePredrawnMeshOverrides(snapshot.meshOverrides),
  };
}

export function predrawnGridCalibrationSnapshotsMatch(
  left: PredrawnGridCalibrationSnapshot,
  right: PredrawnGridCalibrationSnapshot,
): boolean {
  return left.gridColumns === right.gridColumns
    && left.gridRows === right.gridRows
    && predrawnCornerPointsMatch(left.points, right.points)
    && predrawnCornerPointsMatch(left.boundaryPoints, right.boundaryPoints)
    && predrawnNumberArraysMatch(left.columnGuides, right.columnGuides)
    && predrawnNumberArraysMatch(left.rowGuides, right.rowGuides)
    && predrawnMeshOverridesMatch(left.meshOverrides, right.meshOverrides);
}

export function emptyPredrawnGridHistory(): PredrawnGridHistory {
  return { undo: [], redo: [] };
}

export function recordPredrawnGridHistory(
  history: PredrawnGridHistory,
  before: PredrawnGridCalibrationSnapshot,
  after: PredrawnGridCalibrationSnapshot,
): PredrawnGridHistory {
  if (predrawnGridCalibrationSnapshotsMatch(before, after)) return history;
  return {
    undo: [...history.undo, clonePredrawnGridCalibrationSnapshot(before)].slice(-GRID_HISTORY_LIMIT),
    redo: [],
  };
}

export function stepPredrawnGridHistory(
  history: PredrawnGridHistory,
  current: PredrawnGridCalibrationSnapshot,
  direction: 'undo' | 'redo',
): { history: PredrawnGridHistory; target: PredrawnGridCalibrationSnapshot } | undefined {
  const source = history[direction];
  if (!source.length) return undefined;
  const target = clonePredrawnGridCalibrationSnapshot(source[source.length - 1]);
  const currentSnapshot = clonePredrawnGridCalibrationSnapshot(current);
  if (direction === 'undo') {
    return {
      history: {
        undo: history.undo.slice(0, -1),
        redo: [...history.redo, currentSnapshot].slice(-GRID_HISTORY_LIMIT),
      },
      target,
    };
  }
  return {
    history: {
      undo: [...history.undo, currentSnapshot].slice(-GRID_HISTORY_LIMIT),
      redo: history.redo.slice(0, -1),
    },
    target,
  };
}

function boundaryPointLabel(corner: PredrawnCornerName): string {
  return `Boundary point ${CORNER_POINT_NUMBER[corner]}`;
}

export interface PredrawnLocalCellNode {
  corner: PredrawnCornerName;
  column: number;
  row: number;
}

export function predrawnLocalCellNodes(column: number, row: number): PredrawnLocalCellNode[] {
  return [
    { corner: 'north', column, row },
    { corner: 'east', column: column + 1, row },
    { corner: 'south', column: column + 1, row: row + 1 },
    { corner: 'west', column, row: row + 1 },
  ];
}

export function predrawnLocalNodeIsBoundary(
  column: number,
  row: number,
  columns: number,
  rows: number,
): boolean {
  return column === 0 || column === columns || row === 0 || row === rows;
}

export function predrawnZoomAfterWheel(
  current: PredrawnSourceZoom,
  fitScale: number,
  deltaY: number,
): PredrawnSourceZoom {
  if (!Number.isFinite(fitScale) || fitScale <= 0 || !Number.isFinite(deltaY) || deltaY === 0) {
    return current;
  }
  const currentScale = current === 'fit' ? fitScale : current;
  const options: Array<{ value: PredrawnSourceZoom; scale: number }> = [
    { value: 'fit', scale: fitScale },
    ...PREDRAWN_SOURCE_ZOOM_LEVELS.map((value) => ({ value, scale: value })),
  ];
  const epsilon = 1e-6;
  const candidates = options
    .filter(({ scale }) => deltaY < 0
      ? scale > currentScale + epsilon
      : scale < currentScale - epsilon)
    .sort((left, right) => deltaY < 0
      ? left.scale - right.scale
      : right.scale - left.scale);
  return candidates[0]?.value ?? current;
}

export function predrawnZoomAnchorForViewport({
  scrollLeft,
  scrollTop,
  viewportX,
  viewportY,
  stageLeft,
  stageTop,
  stageWidth,
  stageHeight,
}: {
  scrollLeft: number;
  scrollTop: number;
  viewportX: number;
  viewportY: number;
  stageLeft: number;
  stageTop: number;
  stageWidth: number;
  stageHeight: number;
}): PredrawnViewportZoomAnchor {
  const clampRatio = (value: number): number => Math.min(1, Math.max(0, value));
  return {
    sourceX: clampRatio((scrollLeft + viewportX - stageLeft) / Math.max(1, stageWidth)),
    sourceY: clampRatio((scrollTop + viewportY - stageTop) / Math.max(1, stageHeight)),
    viewportX,
    viewportY,
  };
}

export function predrawnViewportScrollForZoomAnchor(
  anchor: PredrawnViewportZoomAnchor,
  {
    stageLeft,
    stageTop,
    stageWidth,
    stageHeight,
  }: {
    stageLeft: number;
    stageTop: number;
    stageWidth: number;
    stageHeight: number;
  },
): { left: number; top: number } {
  return {
    left: stageLeft + anchor.sourceX * stageWidth - anchor.viewportX,
    top: stageTop + anchor.sourceY * stageHeight - anchor.viewportY,
  };
}

interface SourceRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundedSourceCoordinate(value: number): number {
  return Number(value.toFixed(3));
}

/** Snap a placed refit grid to the exact accepted board projection at its current count. */
export function predrawnIdealGridSeed(
  sourceSize: { width: number; height: number },
  columns: number,
  rows: number,
): PredrawnCornerPoints | undefined {
  if (
    sourceSize.width <= 0
    || sourceSize.height <= 0
    || columns < 1
    || rows < 1
  ) return undefined;

  const ideal: Record<PredrawnCornerName, PredrawnPoint> = {
    north: [0, -TILE_STEP_Y],
    east: [columns * TILE_STEP_X, (columns - 1) * TILE_STEP_Y],
    south: [(columns - rows) * TILE_STEP_X, (columns + rows - 1) * TILE_STEP_Y],
    west: [-rows * TILE_STEP_X, (rows - 1) * TILE_STEP_Y],
  };
  const idealPoints = CORNERS.map((corner) => ideal[corner]);
  const idealCenter: PredrawnPoint = [
    idealPoints.reduce((sum, point) => sum + point[0], 0) / idealPoints.length,
    idealPoints.reduce((sum, point) => sum + point[1], 0) / idealPoints.length,
  ];
  const offsets = idealPoints.map(([x, y]) => [x - idealCenter[0], y - idealCenter[1]] as const);
  const idealWidth = Math.max(...offsets.map(([x]) => x)) - Math.min(...offsets.map(([x]) => x));
  const idealHeight = Math.max(...offsets.map(([, y]) => y)) - Math.min(...offsets.map(([, y]) => y));
  const scale = Math.min(sourceSize.width / idealWidth, sourceSize.height / idealHeight) * 0.8;
  const center: PredrawnPoint = [sourceSize.width / 2, sourceSize.height / 2];

  return Object.fromEntries(CORNERS.map((corner, index) => [corner, [
    roundedSourceCoordinate(center[0] + offsets[index][0] * scale),
    roundedSourceCoordinate(center[1] + offsets[index][1] * scale),
  ] as PredrawnPoint])) as PredrawnCornerPoints;
}

/** Scale every coarse corner around the shared center without changing the grid's proportions. */
export function predrawnUniformGridScale(
  points: PredrawnCornerPoints,
  sourceSize: { width: number; height: number },
  factor: number,
): PredrawnCornerPoints | undefined {
  const placed = CORNERS.map((corner) => points[corner]);
  if (
    placed.some((point) => !point)
    || sourceSize.width <= 0
    || sourceSize.height <= 0
    || !Number.isFinite(factor)
    || factor <= 0
  ) return undefined;
  const current = placed as PredrawnPoint[];
  const center: PredrawnPoint = [
    current.reduce((sum, point) => sum + point[0], 0) / current.length,
    current.reduce((sum, point) => sum + point[1], 0) / current.length,
  ];
  const next = Object.fromEntries(CORNERS.map((corner, index) => [corner, [
    roundedSourceCoordinate(center[0] + (current[index][0] - center[0]) * factor),
    roundedSourceCoordinate(center[1] + (current[index][1] - center[1]) * factor),
  ] as PredrawnPoint])) as PredrawnCornerPoints;
  if (CORNERS.some((corner) => {
    const point = next[corner]!;
    return point[0] < 0
      || point[0] > sourceSize.width
      || point[1] < 0
      || point[1] > sourceSize.height;
  })) return undefined;
  return next;
}

/** Snap a placed refit grid to the exact accepted board projection at its current count. */
export function predrawnIdealGridSnap(
  points: PredrawnCornerPoints,
  sourceSize: { width: number; height: number },
  columns: number,
  rows: number,
): PredrawnCornerPoints | undefined {
  const placed = CORNERS.map((corner) => points[corner]);
  if (
    placed.some((point) => !point)
    || sourceSize.width <= 0
    || sourceSize.height <= 0
    || columns < 1
    || rows < 1
  ) return undefined;

  const current = placed as PredrawnPoint[];
  const ideal: Record<PredrawnCornerName, PredrawnPoint> = {
    north: [0, -TILE_STEP_Y],
    east: [columns * TILE_STEP_X, (columns - 1) * TILE_STEP_Y],
    south: [(columns - rows) * TILE_STEP_X, (columns + rows - 1) * TILE_STEP_Y],
    west: [-rows * TILE_STEP_X, (rows - 1) * TILE_STEP_Y],
  };
  const currentCenter: PredrawnPoint = [
    current.reduce((sum, point) => sum + point[0], 0) / current.length,
    current.reduce((sum, point) => sum + point[1], 0) / current.length,
  ];
  const idealPoints = CORNERS.map((corner) => ideal[corner]);
  const idealCenter: PredrawnPoint = [
    idealPoints.reduce((sum, point) => sum + point[0], 0) / idealPoints.length,
    idealPoints.reduce((sum, point) => sum + point[1], 0) / idealPoints.length,
  ];
  const idealOffsets = idealPoints.map(([x, y]) => [x - idealCenter[0], y - idealCenter[1]] as const);
  const currentOffsets = current.map(([x, y]) => [x - currentCenter[0], y - currentCenter[1]] as const);
  const denominator = idealOffsets.reduce((sum, [x, y]) => sum + x * x + y * y, 0);
  const numerator = idealOffsets.reduce(
    (sum, [x, y], index) => sum + x * currentOffsets[index][0] + y * currentOffsets[index][1],
    0,
  );
  const fallbackScale = Math.sqrt(
    currentOffsets.reduce((sum, [x, y]) => sum + x * x + y * y, 0) / denominator,
  );
  let scale = numerator > 0 ? numerator / denominator : fallbackScale;
  if (!Number.isFinite(scale) || scale <= 0) return undefined;

  const idealWidth = Math.max(...idealOffsets.map(([x]) => x)) - Math.min(...idealOffsets.map(([x]) => x));
  const idealHeight = Math.max(...idealOffsets.map(([, y]) => y)) - Math.min(...idealOffsets.map(([, y]) => y));
  scale = Math.min(scale, sourceSize.width / idealWidth, sourceSize.height / idealHeight);
  const scaledOffsets = idealOffsets.map(([x, y]) => [x * scale, y * scale] as const);
  const minOffsetX = Math.min(...scaledOffsets.map(([x]) => x));
  const maxOffsetX = Math.max(...scaledOffsets.map(([x]) => x));
  const minOffsetY = Math.min(...scaledOffsets.map(([, y]) => y));
  const maxOffsetY = Math.max(...scaledOffsets.map(([, y]) => y));
  const centerX = clamp(currentCenter[0], -minOffsetX, sourceSize.width - maxOffsetX);
  const centerY = clamp(currentCenter[1], -minOffsetY, sourceSize.height - maxOffsetY);

  return Object.fromEntries(CORNERS.map((corner, index) => [corner, [
    roundedSourceCoordinate(centerX + scaledOffsets[index][0]),
    roundedSourceCoordinate(centerY + scaledOffsets[index][1]),
  ] as PredrawnPoint])) as PredrawnCornerPoints;
}

/** Convert a pointer on the displayed source image into intrinsic source-image pixels. */
export function predrawnSourcePointForClient(
  rect: SourceRect,
  client: { x: number; y: number },
  source: { width: number; height: number },
): PredrawnPoint {
  if (rect.width <= 0 || rect.height <= 0 || source.width <= 0 || source.height <= 0) return [0, 0];
  return [
    roundedSourceCoordinate(clamp((client.x - rect.left) / rect.width, 0, 1) * source.width),
    roundedSourceCoordinate(clamp((client.y - rect.top) / rect.height, 0, 1) * source.height),
  ];
}

function pointsFromRegistration(
  registration: PredrawnBoardCornerRegistration | undefined,
  sourceWidth = registration?.sourceWidth ?? 0,
  sourceHeight = registration?.sourceHeight ?? 0,
): CornerPoints {
  if (!registration) return { north: undefined, east: undefined, south: undefined, west: undefined };
  const scaleX = sourceWidth > 0 ? sourceWidth / registration.sourceWidth : 1;
  const scaleY = sourceHeight > 0 ? sourceHeight / registration.sourceHeight : 1;
  const scale = ([x, y]: PredrawnPoint): PredrawnPoint => [
    roundedSourceCoordinate(x * scaleX),
    roundedSourceCoordinate(y * scaleY),
  ];
  return {
    north: scale(registration.north),
    east: scale(registration.east),
    south: scale(registration.south),
    west: scale(registration.west),
  };
}

function boundaryPointsFromRegistration(
  registration: PredrawnBoardCornerRegistration | undefined,
  sourceWidth = registration?.sourceWidth ?? 0,
  sourceHeight = registration?.sourceHeight ?? 0,
): CornerPoints {
  if (!registration?.boundaryReference) {
    return { north: undefined, east: undefined, south: undefined, west: undefined };
  }
  return pointsFromRegistration({
    ...registration,
    north: registration.boundaryReference.north,
    east: registration.boundaryReference.east,
    south: registration.boundaryReference.south,
    west: registration.boundaryReference.west,
  }, sourceWidth, sourceHeight);
}

function boundaryReferenceFromPoints(points: CornerPoints): PredrawnBoundaryReference | undefined {
  if (!CORNERS.every((corner) => points[corner])) return undefined;
  return {
    north: points.north!,
    east: points.east!,
    south: points.south!,
    west: points.west!,
  };
}

function meshOverridesFromRegistration(
  registration: PredrawnBoardCornerRegistration | undefined,
  sourceWidth = registration?.sourceWidth ?? 0,
  sourceHeight = registration?.sourceHeight ?? 0,
): PredrawnMeshNodeOverride[] {
  if (!registration?.meshOverrides?.length) return [];
  const scaleX = sourceWidth > 0 ? sourceWidth / registration.sourceWidth : 1;
  const scaleY = sourceHeight > 0 ? sourceHeight / registration.sourceHeight : 1;
  return registration.meshOverrides.map(({ column, row, point }) => ({
    column,
    row,
    point: [
      roundedSourceCoordinate(point[0] * scaleX),
      roundedSourceCoordinate(point[1] * scaleY),
    ] as PredrawnPoint,
  }));
}

function pointLabel(point: PredrawnPoint | undefined): string {
  return point ? `${point[0]}, ${point[1]}` : 'Not set';
}

function registrationFromCalibration(
  points: CornerPoints,
  sourceSize: { width: number; height: number },
  gridColumns: number,
  gridRows: number,
  columnGuides: readonly number[],
  rowGuides: readonly number[],
  boundaryPoints: CornerPoints,
  meshOverrides: readonly PredrawnMeshNodeOverride[],
): PredrawnBoardCornerRegistration | undefined {
  if (
    !sourceSize.width
    || !sourceSize.height
    || !CORNERS.every((corner) => points[corner])
    || !Number.isSafeInteger(gridColumns)
    || !Number.isSafeInteger(gridRows)
    || gridColumns < 1
    || gridColumns > 64
    || gridRows < 1
    || gridRows > 64
    || columnGuides.length !== gridColumns + 1
    || rowGuides.length !== gridRows + 1
  ) {
    return undefined;
  }
  const registration: PredrawnBoardCornerRegistration = {
    sourceWidth: sourceSize.width,
    sourceHeight: sourceSize.height,
    north: points.north!,
    east: points.east!,
    south: points.south!,
    west: points.west!,
    gridColumns,
    gridRows,
    columnGuides: [...columnGuides],
    rowGuides: [...rowGuides],
    boundaryReference: boundaryReferenceFromPoints(boundaryPoints),
    ...(meshOverrides.length ? { meshOverrides: [...meshOverrides] } : {}),
  };
  return predrawnMeshValidationIssue(registration) ? undefined : registration;
}

export interface PredrawnGridStretchSummary {
  columnMinScale: number;
  columnMaxScale: number;
  rowMinScale: number;
  rowMaxScale: number;
  maximumDeviationPercent: number;
}

export function predrawnGridStretchSummary(
  columnGuides: readonly number[],
  rowGuides: readonly number[],
): PredrawnGridStretchSummary {
  const scales = (guides: readonly number[]): number[] => {
    const cellCount = Math.max(1, guides.length - 1);
    return guides.slice(1).map((value, index) => (value - guides[index]) * cellCount);
  };
  const columns = scales(columnGuides);
  const rows = scales(rowGuides);
  const all = [...columns, ...rows];
  return {
    columnMinScale: Math.min(...columns),
    columnMaxScale: Math.max(...columns),
    rowMinScale: Math.min(...rows),
    rowMaxScale: Math.max(...rows),
    maximumDeviationPercent: Math.max(...all.map((scale) => Math.abs(scale - 1))) * 100,
  };
}

function formatScale(value: number): string {
  return `${value.toFixed(2)}×`;
}

function activeControlLabel(control: ActiveControl): string {
  if (control.kind === 'corner') return boundaryPointLabel(control.corner);
  if (control.kind === 'reference-corner') return `Pinned ${boundaryPointLabel(control.corner).toLowerCase()}`;
  if (control.kind === 'column') return `column guide ${control.index}`;
  if (control.kind === 'row') return `row guide ${control.index}`;
  if (control.kind === 'local-cell') return `tile ${control.column + 1}, ${control.row + 1}`;
  if (control.kind === 'local-node') {
    return `Shared corner of tile ${control.cellColumn + 1}, ${control.cellRow + 1}`;
  }
  return 'whole grid';
}

export function PredrawnCornerPicker({
  src,
  initialRegistration,
  columns,
  rows,
  onChange,
  onClose,
  onSaveRegistration,
  saveLabel = 'SAVE REGISTRATION',
  showCodexHandoff = true,
}: {
  src: string;
  initialRegistration?: PredrawnBoardCornerRegistration;
  columns: number;
  rows: number;
  onChange: (registration: PredrawnBoardCornerRegistration) => void;
  onClose: () => void;
  /** Version-pipeline mode hands the exact calibration to its durable create-and-select action. */
  onSaveRegistration?: (registration: PredrawnBoardCornerRegistration) => void;
  saveLabel?: string;
  showCodexHandoff?: boolean;
}): ReactElement {
  const panelRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const normalizedForImage = useRef(false);
  const storedOpeningRegistration = useRef(onSaveRegistration ? undefined : storedPredrawnBoardRegistration(src));
  const openingRegistration = useRef(initialRegistration ?? storedOpeningRegistration.current);
  const openingGrid = useRef(predrawnRegistrationGridSize(openingRegistration.current, columns, rows));
  const openingGuides = useRef(predrawnGuidesForBoard(openingRegistration.current, columns, rows));
  const openingBoundaryPoints = useRef(boundaryPointsFromRegistration(openingRegistration.current));
  const openingMeshOverrides = useRef(meshOverridesFromRegistration(openingRegistration.current));
  const [editMode, setEditMode] = useState<GridEditMode>(
    openingMeshOverrides.current.length ? 'local' : 'coarse',
  );
  const [activeControl, setActiveControl] = useState<ActiveControl>({ kind: 'corner', corner: 'south' });
  const [selectedCell, setSelectedCell] = useState<PredrawnMeshCellAddress | null>(null);
  const [placingCorner, setPlacingCorner] = useState<PredrawnCornerName | null>(
    openingRegistration.current ? null : 'south',
  );
  const [points, setPoints] = useState<CornerPoints>(() => pointsFromRegistration(openingRegistration.current));
  const [boundaryPoints, setBoundaryPoints] = useState<CornerPoints>(openingBoundaryPoints.current);
  const [gridColumns, setGridColumns] = useState(openingGrid.current.columns);
  const [gridRows, setGridRows] = useState(openingGrid.current.rows);
  const [columnGuides, setColumnGuides] = useState<number[]>(openingGuides.current.columnGuides);
  const [rowGuides, setRowGuides] = useState<number[]>(openingGuides.current.rowGuides);
  const [meshOverrides, setMeshOverrides] = useState<PredrawnMeshNodeOverride[]>(
    openingMeshOverrides.current,
  );
  const [sourceSize, setSourceSize] = useState({
    width: openingRegistration.current?.sourceWidth ?? 0,
    height: openingRegistration.current?.sourceHeight ?? 0,
  });
  const [zoom, setZoom] = useState<PredrawnSourceZoom>('fit');
  const [loadError, setLoadError] = useState(false);
  const [saveState, setSaveState] = useState<RegistrationSaveState>(
    storedOpeningRegistration.current ? 'saved' : 'idle',
  );
  const [handoffCopyState, setHandoffCopyState] = useState<HandoffCopyState>('idle');
  const [localConstraintState, setLocalConstraintState] = useState<LocalConstraintState>('idle');
  const [localFeedback, setLocalFeedback] = useState<string | null>(null);
  const [gridHistory, setGridHistory] = useState<PredrawnGridHistory>(
    emptyPredrawnGridHistory,
  );
  const [viewportPanning, setViewportPanning] = useState(false);
  const pointsRef = useRef(points);
  const boundaryPointsRef = useRef(boundaryPoints);
  const gridColumnsRef = useRef(gridColumns);
  const gridRowsRef = useRef(gridRows);
  const columnGuidesRef = useRef(columnGuides);
  const rowGuidesRef = useRef(rowGuides);
  const meshOverridesRef = useRef(meshOverrides);
  const gridHistoryRef = useRef(gridHistory);
  const dragRef = useRef<DragState | null>(null);
  const viewportPanRef = useRef<ViewportPanState | null>(null);
  const viewportZoomAnchorRef = useRef<PredrawnViewportZoomAnchor | null>(null);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      previousFocus?.focus?.();
    };
  }, [onClose]);

  useLayoutEffect(() => {
    const anchor = viewportZoomAnchorRef.current;
    const viewport = viewportRef.current;
    const stage = stageRef.current;
    if (!anchor || !viewport || !stage) return;
    viewportZoomAnchorRef.current = null;
    const nextScroll = predrawnViewportScrollForZoomAnchor(anchor, {
      stageLeft: stage.offsetLeft,
      stageTop: stage.offsetTop,
      stageWidth: stage.offsetWidth,
      stageHeight: stage.offsetHeight,
    });
    viewport.scrollLeft = nextScroll.left;
    viewport.scrollTop = nextScroll.top;
  }, [zoom]);

  const registration = useMemo(() => registrationFromCalibration(
    points,
    sourceSize,
    gridColumns,
    gridRows,
    columnGuides,
    rowGuides,
    boundaryPoints,
    meshOverrides,
  ), [boundaryPoints, columnGuides, gridColumns, gridRows, meshOverrides, points, rowGuides, sourceSize]);
  const complete = Boolean(registration);
  const boundaryReference = boundaryReferenceFromPoints(boundaryPoints);
  const stretch = useMemo(
    () => predrawnGridStretchSummary(columnGuides, rowGuides),
    [columnGuides, rowGuides],
  );

  const currentGridSnapshot = (): PredrawnGridCalibrationSnapshot => (
    clonePredrawnGridCalibrationSnapshot({
      points: pointsRef.current,
      boundaryPoints: boundaryPointsRef.current,
      gridColumns: gridColumnsRef.current,
      gridRows: gridRowsRef.current,
      columnGuides: columnGuidesRef.current,
      rowGuides: rowGuidesRef.current,
      meshOverrides: meshOverridesRef.current,
    })
  );

  const replaceGridHistory = (next: PredrawnGridHistory): void => {
    gridHistoryRef.current = next;
    setGridHistory(next);
  };

  const clearGridHistory = (): void => {
    if (!gridHistoryRef.current.undo.length && !gridHistoryRef.current.redo.length) return;
    replaceGridHistory(emptyPredrawnGridHistory());
  };

  const recordGridEdit = (
    before: PredrawnGridCalibrationSnapshot,
    after = currentGridSnapshot(),
  ): void => {
    const next = recordPredrawnGridHistory(gridHistoryRef.current, before, after);
    if (next !== gridHistoryRef.current) replaceGridHistory(next);
  };

  const commitPoints = (nextPoints: CornerPoints): void => {
    pointsRef.current = nextPoints;
    setPoints(nextPoints);
    setSaveState('pending');
    setHandoffCopyState('idle');
    setLocalConstraintState('idle');
    setLocalFeedback(null);
  };

  const commitBoundaryPoints = (nextPoints: CornerPoints): void => {
    boundaryPointsRef.current = nextPoints;
    setBoundaryPoints(nextPoints);
    setSaveState('pending');
    setHandoffCopyState('idle');
  };

  const commitColumnGuides = (nextGuides: number[]): void => {
    columnGuidesRef.current = nextGuides;
    setColumnGuides(nextGuides);
    setSaveState('pending');
    setHandoffCopyState('idle');
  };

  const commitRowGuides = (nextGuides: number[]): void => {
    rowGuidesRef.current = nextGuides;
    setRowGuides(nextGuides);
    setSaveState('pending');
    setHandoffCopyState('idle');
  };

  const currentRegistration = (): PredrawnBoardCornerRegistration | undefined => (
    registrationFromCalibration(
      pointsRef.current,
      sourceSize,
      gridColumnsRef.current,
      gridRowsRef.current,
      columnGuidesRef.current,
      rowGuidesRef.current,
      boundaryPointsRef.current,
      meshOverridesRef.current,
    )
  );

  const commitMeshRegistration = (
    nextRegistration: PredrawnBoardCornerRegistration,
    feedback?: { state: LocalConstraintState; message: string },
  ): void => {
    const nextPoints: CornerPoints = {
      north: nextRegistration.north,
      east: nextRegistration.east,
      south: nextRegistration.south,
      west: nextRegistration.west,
    };
    const nextMeshOverrides = [...(nextRegistration.meshOverrides ?? [])];
    pointsRef.current = nextPoints;
    meshOverridesRef.current = nextMeshOverrides;
    setPoints(nextPoints);
    setMeshOverrides(nextMeshOverrides);
    setSaveState('pending');
    setHandoffCopyState('idle');
    setLocalConstraintState(feedback?.state ?? 'idle');
    setLocalFeedback(feedback?.message ?? null);
  };

  const applyGridSnapshot = (
    snapshot: PredrawnGridCalibrationSnapshot,
    feedback: { state: LocalConstraintState; message: string },
  ): void => {
    const next = clonePredrawnGridCalibrationSnapshot(snapshot);
    pointsRef.current = next.points;
    boundaryPointsRef.current = next.boundaryPoints;
    gridColumnsRef.current = next.gridColumns;
    gridRowsRef.current = next.gridRows;
    columnGuidesRef.current = next.columnGuides;
    rowGuidesRef.current = next.rowGuides;
    meshOverridesRef.current = next.meshOverrides;
    setPoints(next.points);
    setBoundaryPoints(next.boundaryPoints);
    setGridColumns(next.gridColumns);
    setGridRows(next.gridRows);
    setColumnGuides(next.columnGuides);
    setRowGuides(next.rowGuides);
    setMeshOverrides(next.meshOverrides);

    const missingCorner = CORNERS.find((corner) => !next.points[corner]);
    if (missingCorner) {
      setEditMode('coarse');
      setSelectedCell(null);
      setActiveControl({ kind: 'corner', corner: missingCorner });
      setPlacingCorner(missingCorner);
    } else {
      const selectedCellIsValid = Boolean(
        selectedCell
        && selectedCell.column >= 0
        && selectedCell.column < next.gridColumns
        && selectedCell.row >= 0
        && selectedCell.row < next.gridRows,
      );
      if (!selectedCellIsValid) setSelectedCell(null);
      const activeControlIsValid = activeControl.kind === 'move'
        || (activeControl.kind === 'corner' && Boolean(next.points[activeControl.corner]))
        || (
          activeControl.kind === 'reference-corner'
          && Boolean(next.boundaryPoints[activeControl.corner])
        )
        || (
          activeControl.kind === 'column'
          && activeControl.index >= 0
          && activeControl.index < next.columnGuides.length
        )
        || (
          activeControl.kind === 'row'
          && activeControl.index >= 0
          && activeControl.index < next.rowGuides.length
        )
        || (
          activeControl.kind === 'local-cell'
          && activeControl.column >= 0
          && activeControl.column < next.gridColumns
          && activeControl.row >= 0
          && activeControl.row < next.gridRows
        )
        || (
          activeControl.kind === 'local-node'
          && activeControl.column >= 0
          && activeControl.column <= next.gridColumns
          && activeControl.row >= 0
          && activeControl.row <= next.gridRows
          && activeControl.cellColumn >= 0
          && activeControl.cellColumn < next.gridColumns
          && activeControl.cellRow >= 0
          && activeControl.cellRow < next.gridRows
        );
      if (!activeControlIsValid) setActiveControl({ kind: 'move' });
      setPlacingCorner(null);
    }
    setSaveState('pending');
    setHandoffCopyState('idle');
    setLocalConstraintState(feedback.state);
    setLocalFeedback(feedback.message);
  };

  const applyGridHistory = (direction: 'undo' | 'redo'): void => {
    const stepped = stepPredrawnGridHistory(
      gridHistoryRef.current,
      currentGridSnapshot(),
      direction,
    );
    if (!stepped) return;
    replaceGridHistory(stepped.history);
    applyGridSnapshot(stepped.target, {
      state: 'reset',
      message: direction === 'undo'
        ? 'Undid the last grid change.'
        : 'Redid the last grid change.',
    });
  };

  const chooseCorner = (corner: PredrawnCornerName): void => {
    setEditMode('coarse');
    setActiveControl({ kind: 'corner', corner });
    setPlacingCorner(corner);
    overlayRef.current?.focus();
  };

  const saveRegistration = (): void => {
    const pending = registrationFromCalibration(
      pointsRef.current,
      sourceSize,
      gridColumns,
      gridRows,
      columnGuidesRef.current,
      rowGuidesRef.current,
      boundaryPointsRef.current,
      meshOverridesRef.current,
    );
    if (!pending) {
      setSaveState('error');
      return;
    }
    const canonical = normalizePredrawnBoardRegistration(pending);
    if (!canonical) {
      setSaveState('error');
      return;
    }
    if (onSaveRegistration) {
      onSaveRegistration(canonical);
      onChange(canonical);
      setSaveState('saved');
      setHandoffCopyState('idle');
      return;
    }
    const readBack = savePredrawnBoardRegistrationLocally(src, canonical);
    if (!readBack) {
      setSaveState('error');
      return;
    }
    onChange(readBack);
    setSaveState('saved');
    setHandoffCopyState('idle');
  };

  const copyCodexHandoff = async (): Promise<void> => {
    const savedRegistration = storedPredrawnBoardRegistration(src);
    if (!savedRegistration || saveState !== 'saved') {
      setHandoffCopyState('error');
      return;
    }
    const payload = serializePredrawnRegistrationHandoff(src, savedRegistration);
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable');
      await navigator.clipboard.writeText(payload);
      setHandoffCopyState('copied');
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = payload;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand('copy');
      textarea.remove();
      setHandoffCopyState(copied ? 'copied' : 'error');
    }
  };

  const pointForClient = (clientX: number, clientY: number): PredrawnPoint | null => {
    const stage = stageRef.current;
    if (!stage || !sourceSize.width || !sourceSize.height) return null;
    return predrawnSourcePointForClient(
      stage.getBoundingClientRect(),
      { x: clientX, y: clientY },
      sourceSize,
    );
  };

  const moveMeshNodeToPoint = (
    column: number,
    row: number,
    point: PredrawnPoint,
  ): boolean => {
    if (predrawnLocalNodeIsBoundary(column, row, gridColumns, gridRows)) {
      setLocalConstraintState('constrained');
      setLocalFeedback('Boundary corners stay locked during Local cells editing. Use Coarse grid to move the outside edge.');
      return false;
    }
    const current = currentRegistration();
    if (!current) return false;
    const moved = movePredrawnMeshNode(current, column, row, point);
    if (!moved) {
      setLocalConstraintState('constrained');
      setLocalFeedback('That shared corner could not be moved from the current valid grid.');
      return false;
    }
    const affectedCount = predrawnMeshCellsForNode(moved.registration, column, row).length;
    commitMeshRegistration(
      moved.registration,
      moved.constrained
        ? {
            state: 'constrained',
            message: `Stopped at the last safe position before ${affectedCount === 1 ? 'this tile folded' : 'an affected tile folded'}.`,
          }
        : undefined,
    );
    return true;
  };

  const commitCoarseCornerPoint = (
    corner: PredrawnCornerName,
    point: PredrawnPoint,
  ): boolean => {
    const nextPoints = { ...pointsRef.current, [corner]: point };
    if (!CORNERS.every((name) => nextPoints[name])) {
      commitPoints(nextPoints);
      return true;
    }
    const candidate = registrationFromCalibration(
      nextPoints,
      sourceSize,
      gridColumnsRef.current,
      gridRowsRef.current,
      columnGuidesRef.current,
      rowGuidesRef.current,
      boundaryPointsRef.current,
      meshOverridesRef.current,
    );
    if (!candidate) {
      setLocalConstraintState('constrained');
      setLocalFeedback(
        meshOverridesRef.current.length
          ? 'The coarse corner stayed at its previous position because that move would fold a locally adjusted tile.'
          : 'The coarse corner stayed at its previous valid position.',
      );
      return false;
    }
    commitMeshRegistration(candidate);
    return true;
  };

  const moveCornerToClient = (corner: PredrawnCornerName, clientX: number, clientY: number): void => {
    const point = pointForClient(clientX, clientY);
    if (!point) return;
    commitCoarseCornerPoint(corner, point);
  };

  const placeActiveCorner = (event: ReactMouseEvent<HTMLDivElement>): void => {
    if (!placingCorner || dragRef.current) return;
    const before = currentGridSnapshot();
    moveCornerToClient(placingCorner, event.clientX, event.clientY);
    recordGridEdit(before);
    setPlacingCorner(null);
    overlayRef.current?.focus();
  };

  const beginDrag = (
    event: ReactPointerEvent<SVGElement | HTMLSpanElement | HTMLButtonElement>,
    control: ActiveControl,
  ): void => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    setPlacingCorner(null);
    setActiveControl(control);
    const startPoint = pointForClient(event.clientX, event.clientY) ?? undefined;
    dragRef.current = {
      ...control,
      pointerId: event.pointerId,
      startPoint,
      startCorners: control.kind === 'move' ? { ...pointsRef.current } : undefined,
      startMeshOverrides: control.kind === 'move' || control.kind === 'local-node'
        ? clonePredrawnMeshOverrides(meshOverridesRef.current)
        : undefined,
      startGridSnapshot: currentGridSnapshot(),
    };
    overlayRef.current?.setPointerCapture(event.pointerId);
    overlayRef.current?.focus();
  };

  const beginViewportPan = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.button !== 2 || dragRef.current) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    event.preventDefault();
    event.stopPropagation();
    viewportPanRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startScrollLeft: viewport.scrollLeft,
      startScrollTop: viewport.scrollTop,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setViewportPanning(true);
  };

  const zoomViewport = (event: globalThis.WheelEvent): void => {
    const viewport = viewportRef.current;
    const stage = stageRef.current;
    if (!viewport || !stage || !sourceSize.width || !sourceSize.height) return;
    event.preventDefault();
    event.stopPropagation();
    const fitScale = viewport.clientWidth / sourceSize.width;
    const nextZoom = predrawnZoomAfterWheel(zoom, fitScale, event.deltaY);
    if (nextZoom === zoom) return;
    const viewportBounds = viewport.getBoundingClientRect();
    viewportZoomAnchorRef.current = predrawnZoomAnchorForViewport({
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
      viewportX: event.clientX - viewportBounds.left,
      viewportY: event.clientY - viewportBounds.top,
      stageLeft: stage.offsetLeft,
      stageTop: stage.offsetTop,
      stageWidth: stage.offsetWidth,
      stageHeight: stage.offsetHeight,
    });
    setZoom(nextZoom);
  };

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return undefined;
    viewport.addEventListener('wheel', zoomViewport, { passive: false });
    return () => viewport.removeEventListener('wheel', zoomViewport);
  }, [sourceSize.height, sourceSize.width, zoom]);

  const moveDrag = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const pan = viewportPanRef.current;
    if (pan?.pointerId === event.pointerId) {
      const viewport = viewportRef.current;
      if (!viewport) return;
      event.preventDefault();
      viewport.scrollLeft = pan.startScrollLeft - (event.clientX - pan.startClientX);
      viewport.scrollTop = pan.startScrollTop - (event.clientY - pan.startClientY);
      return;
    }
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    const point = pointForClient(event.clientX, event.clientY);
    if (!point) return;
    if (drag.kind === 'corner') {
      commitCoarseCornerPoint(drag.corner, point);
      return;
    }
    if (drag.kind === 'reference-corner') {
      commitBoundaryPoints({ ...boundaryPointsRef.current, [drag.corner]: point });
      return;
    }
    if (drag.kind === 'local-node') {
      moveMeshNodeToPoint(drag.column, drag.row, point);
      return;
    }
    if (drag.kind === 'move' && drag.startPoint && drag.startCorners) {
      const openingCorners = CORNERS.map((corner) => drag.startCorners![corner]).filter(Boolean) as PredrawnPoint[];
      const opening = [
        ...openingCorners,
        ...(drag.startMeshOverrides ?? []).map((override) => override.point),
      ];
      if (openingCorners.length !== CORNERS.length) return;
      const requestedX = point[0] - drag.startPoint[0];
      const requestedY = point[1] - drag.startPoint[1];
      const deltaX = clamp(
        requestedX,
        -Math.min(...opening.map(([x]) => x)),
        sourceSize.width - Math.max(...opening.map(([x]) => x)),
      );
      const deltaY = clamp(
        requestedY,
        -Math.min(...opening.map(([, y]) => y)),
        sourceSize.height - Math.max(...opening.map(([, y]) => y)),
      );
      const translated = Object.fromEntries(CORNERS.map((corner) => {
        const openingPoint = drag.startCorners![corner]!;
        return [corner, [
          roundedSourceCoordinate(openingPoint[0] + deltaX),
          roundedSourceCoordinate(openingPoint[1] + deltaY),
        ] as const];
      })) as CornerPoints;
      const translatedMesh = (drag.startMeshOverrides ?? []).map((override) => ({
        ...override,
        point: [
          roundedSourceCoordinate(override.point[0] + deltaX),
          roundedSourceCoordinate(override.point[1] + deltaY),
        ] as PredrawnPoint,
      }));
      const next = registrationFromCalibration(
        translated,
        sourceSize,
        gridColumns,
        gridRows,
        columnGuidesRef.current,
        rowGuidesRef.current,
        boundaryPointsRef.current,
        translatedMesh,
      );
      if (next) {
        commitMeshRegistration(next);
      } else {
        setLocalConstraintState('constrained');
        setLocalFeedback('The whole grid stayed at its previous position because the requested move was not valid.');
      }
      return;
    }
    const pending = registrationFromCalibration(
      pointsRef.current,
      sourceSize,
      gridColumns,
      gridRows,
      columnGuidesRef.current,
      rowGuidesRef.current,
      boundaryPointsRef.current,
      meshOverridesRef.current,
    );
    if (!pending) {
      setLocalConstraintState('constrained');
      setLocalFeedback('The coarse grid is not currently valid, so its guides were not changed.');
      return;
    }
    const coordinate = predrawnSourceGridCoordinate(pending, point);
    if (!coordinate) return;
    if (drag.kind === 'column') {
      const next = [...columnGuidesRef.current];
      next[drag.index] = clampPredrawnGuide(next, drag.index, coordinate[0]);
      const candidate = registrationFromCalibration(
        pointsRef.current,
        sourceSize,
        gridColumns,
        gridRows,
        next,
        rowGuidesRef.current,
        boundaryPointsRef.current,
        meshOverridesRef.current,
      );
      if (!candidate) {
        setLocalConstraintState('constrained');
        setLocalFeedback('The column stopped before it would fold a locally adjusted tile.');
        return;
      }
      commitColumnGuides(next);
    } else if (drag.kind === 'row') {
      const next = [...rowGuidesRef.current];
      next[drag.index] = clampPredrawnGuide(next, drag.index, coordinate[1]);
      const candidate = registrationFromCalibration(
        pointsRef.current,
        sourceSize,
        gridColumns,
        gridRows,
        columnGuidesRef.current,
        next,
        boundaryPointsRef.current,
        meshOverridesRef.current,
      );
      if (!candidate) {
        setLocalConstraintState('constrained');
        setLocalFeedback('The row stopped before it would fold a locally adjusted tile.');
        return;
      }
      commitRowGuides(next);
    }
  };

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const pan = viewportPanRef.current;
    if (pan?.pointerId === event.pointerId) {
      event.preventDefault();
      viewportPanRef.current = null;
      setViewportPanning(false);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      return;
    }
    const drag = dragRef.current;
    if (drag?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (overlayRef.current?.hasPointerCapture(event.pointerId)) overlayRef.current.releasePointerCapture(event.pointerId);
    recordGridEdit(drag.startGridSnapshot);
  };

  const translateAllCorners = (deltaX: number, deltaY: number): void => {
    if (!CORNERS.every((corner) => pointsRef.current[corner])) return;
    const opening = [
      ...CORNERS.map((corner) => pointsRef.current[corner]!).filter(Boolean),
      ...meshOverridesRef.current.map((override) => override.point),
    ];
    const exactDeltaX = clamp(
      deltaX,
      -Math.min(...opening.map(([x]) => x)),
      sourceSize.width - Math.max(...opening.map(([x]) => x)),
    );
    const exactDeltaY = clamp(
      deltaY,
      -Math.min(...opening.map(([, y]) => y)),
      sourceSize.height - Math.max(...opening.map(([, y]) => y)),
    );
    const next = Object.fromEntries(CORNERS.map((corner) => {
      const point = pointsRef.current[corner]!;
      return [corner, [
        roundedSourceCoordinate(point[0] + exactDeltaX),
        roundedSourceCoordinate(point[1] + exactDeltaY),
      ] as const];
    })) as CornerPoints;
    const nextMesh = meshOverridesRef.current.map((override) => ({
      ...override,
      point: [
        roundedSourceCoordinate(override.point[0] + exactDeltaX),
        roundedSourceCoordinate(override.point[1] + exactDeltaY),
      ] as PredrawnPoint,
    }));
    const translated = registrationFromCalibration(
      next,
      sourceSize,
      gridColumnsRef.current,
      gridRowsRef.current,
      columnGuidesRef.current,
      rowGuidesRef.current,
      boundaryPointsRef.current,
      nextMesh,
    );
    if (translated) {
      commitMeshRegistration(translated);
    } else {
      setLocalConstraintState('constrained');
      setLocalFeedback('The whole grid stayed at its previous position because the requested move was not valid.');
    }
  };

  const nudgeActiveControl = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    const step = event.shiftKey ? 10 : 1;
    const direction = event.key;
    if (!direction.startsWith('Arrow')) return;
    const before = currentGridSnapshot();
    if (activeControl.kind === 'local-node') {
      const boundary = predrawnLocalNodeIsBoundary(
        activeControl.column,
        activeControl.row,
        gridColumnsRef.current,
        gridRowsRef.current,
      );
      event.preventDefault();
      if (boundary) {
        setLocalConstraintState('constrained');
        setLocalFeedback('Boundary corners stay locked during Local cells editing. Use Coarse grid to move the outside edge.');
        return;
      }
      const current = currentRegistration();
      const point = current
        ? predrawnSourceMeshNode(current, activeControl.column, activeControl.row)
        : undefined;
      if (!point) return;
      const deltas: Record<string, PredrawnPoint> = {
        ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step],
      };
      const move = deltas[direction];
      const moved = moveMeshNodeToPoint(activeControl.column, activeControl.row, [
        point[0] + move[0],
        point[1] + move[1],
      ]);
      if (moved) recordGridEdit(before);
      return;
    }
    if (activeControl.kind === 'corner') {
      const point = pointsRef.current[activeControl.corner];
      if (!point || !sourceSize.width || !sourceSize.height) return;
      const deltas: Record<string, PredrawnPoint> = {
        ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step],
      };
      const move = deltas[direction];
      event.preventDefault();
      commitCoarseCornerPoint(activeControl.corner, [
        clamp(point[0] + move[0], 0, sourceSize.width),
        clamp(point[1] + move[1], 0, sourceSize.height),
      ]);
      recordGridEdit(before);
      return;
    }
    if (activeControl.kind === 'reference-corner') {
      const point = boundaryPointsRef.current[activeControl.corner];
      if (!point || !sourceSize.width || !sourceSize.height) return;
      const deltas: Record<string, PredrawnPoint> = {
        ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step],
      };
      const move = deltas[direction];
      event.preventDefault();
      commitBoundaryPoints({
        ...boundaryPointsRef.current,
        [activeControl.corner]: [
          clamp(point[0] + move[0], 0, sourceSize.width),
          clamp(point[1] + move[1], 0, sourceSize.height),
        ],
      });
      recordGridEdit(before);
      return;
    }
    if (activeControl.kind === 'move') {
      const deltas: Record<string, PredrawnPoint> = {
        ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step],
      };
      event.preventDefault();
      translateAllCorners(...deltas[direction]);
      recordGridEdit(before);
      return;
    }
    const normalizedStep = step / Math.max(sourceSize.width, sourceSize.height, 1);
    if (activeControl.kind === 'column' && (direction === 'ArrowLeft' || direction === 'ArrowRight')) {
      event.preventDefault();
      const next = [...columnGuidesRef.current];
      next[activeControl.index] = clampPredrawnGuide(
        next,
        activeControl.index,
        next[activeControl.index] + (direction === 'ArrowLeft' ? -normalizedStep : normalizedStep),
      );
      if (!registrationFromCalibration(
        pointsRef.current,
        sourceSize,
        gridColumnsRef.current,
        gridRowsRef.current,
        next,
        rowGuidesRef.current,
        boundaryPointsRef.current,
        meshOverridesRef.current,
      )) {
        setLocalConstraintState('constrained');
        setLocalFeedback('The column stopped before it would fold a locally adjusted tile.');
        return;
      }
      commitColumnGuides(next);
      recordGridEdit(before);
    } else if (activeControl.kind === 'row' && (direction === 'ArrowUp' || direction === 'ArrowDown')) {
      event.preventDefault();
      const next = [...rowGuidesRef.current];
      next[activeControl.index] = clampPredrawnGuide(
        next,
        activeControl.index,
        next[activeControl.index] + (direction === 'ArrowUp' ? -normalizedStep : normalizedStep),
      );
      if (!registrationFromCalibration(
        pointsRef.current,
        sourceSize,
        gridColumnsRef.current,
        gridRowsRef.current,
        columnGuidesRef.current,
        next,
        boundaryPointsRef.current,
        meshOverridesRef.current,
      )) {
        setLocalConstraintState('constrained');
        setLocalFeedback('The row stopped before it would fold a locally adjusted tile.');
        return;
      }
      commitRowGuides(next);
      recordGridEdit(before);
    }
  };

  const reset = (): void => {
    const before = currentGridSnapshot();
    const nextPoints = openingRegistration.current
      ? pointsFromRegistration(openingRegistration.current, sourceSize.width, sourceSize.height)
      : predrawnIdealGridSeed(sourceSize, openingGrid.current.columns, openingGrid.current.rows)
        ?? pointsFromRegistration(undefined, sourceSize.width, sourceSize.height);
    pointsRef.current = nextPoints;
    const nextBoundaryPoints = boundaryPointsFromRegistration(
      openingRegistration.current,
      sourceSize.width,
      sourceSize.height,
    );
    boundaryPointsRef.current = nextBoundaryPoints;
    columnGuidesRef.current = [...openingGuides.current.columnGuides];
    rowGuidesRef.current = [...openingGuides.current.rowGuides];
    const nextMeshOverrides = meshOverridesFromRegistration(
      openingRegistration.current,
      sourceSize.width,
      sourceSize.height,
    );
    meshOverridesRef.current = nextMeshOverrides;
    gridColumnsRef.current = openingGrid.current.columns;
    gridRowsRef.current = openingGrid.current.rows;
    setPoints(nextPoints);
    setBoundaryPoints(nextBoundaryPoints);
    setGridColumns(openingGrid.current.columns);
    setGridRows(openingGrid.current.rows);
    setColumnGuides([...openingGuides.current.columnGuides]);
    setRowGuides([...openingGuides.current.rowGuides]);
    setMeshOverrides(nextMeshOverrides);
    setEditMode(nextMeshOverrides.length ? 'local' : 'coarse');
    setSelectedCell(null);
    setActiveControl(openingRegistration.current
      ? { kind: 'corner', corner: 'south' }
      : { kind: 'move' });
    setPlacingCorner(openingRegistration.current ? null : CORNERS.find((corner) => !nextPoints[corner]) ?? null);
    setSaveState('pending');
    setHandoffCopyState('idle');
    setLocalConstraintState('reset');
    setLocalFeedback(openingRegistration.current
      ? 'Restored every coarse and local control to the opening calibration.'
      : 'Restored the centered game grid at its canonical isometric proportions.');
    recordGridEdit(before);
  };

  const resetSpacing = (): void => {
    if (meshOverridesRef.current.length) {
      const count = meshOverridesRef.current.length;
      setLocalConstraintState('constrained');
      setLocalFeedback(`Clear all ${count} local adjustment${count === 1 ? '' : 's'} before resetting coarse spacing.`);
      return;
    }
    const nextColumns = uniformPredrawnGuides(gridColumns);
    const nextRows = uniformPredrawnGuides(gridRows);
    if (!registrationFromCalibration(
      pointsRef.current,
      sourceSize,
      gridColumns,
      gridRows,
      nextColumns,
      nextRows,
      boundaryPointsRef.current,
      meshOverridesRef.current,
    )) {
      setLocalConstraintState('constrained');
      setLocalFeedback('Resetting the coarse spacing would fold a locally adjusted tile. Reset local cells first.');
      return;
    }
    const before = currentGridSnapshot();
    commitColumnGuides(nextColumns);
    commitRowGuides(nextRows);
    recordGridEdit(before);
  };

  const snapToIdealGrid = (): void => {
    if (meshOverridesRef.current.length) {
      const count = meshOverridesRef.current.length;
      setLocalConstraintState('constrained');
      setLocalFeedback(`Clear all ${count} local adjustment${count === 1 ? '' : 's'} before snapping the coarse grid.`);
      return;
    }
    const nextPoints = predrawnIdealGridSnap(pointsRef.current, sourceSize, gridColumns, gridRows);
    if (!nextPoints) return;
    const nextColumns = uniformPredrawnGuides(gridColumns);
    const nextRows = uniformPredrawnGuides(gridRows);
    const snapped = registrationFromCalibration(
      nextPoints,
      sourceSize,
      gridColumns,
      gridRows,
      nextColumns,
      nextRows,
      boundaryPointsRef.current,
      meshOverridesRef.current,
    );
    if (!snapped) {
      setLocalConstraintState('constrained');
      setLocalFeedback('Snapping the coarse grid would fold a locally adjusted tile. Reset local cells first.');
      return;
    }
    const before = currentGridSnapshot();
    columnGuidesRef.current = nextColumns;
    rowGuidesRef.current = nextRows;
    setColumnGuides(nextColumns);
    setRowGuides(nextRows);
    commitMeshRegistration(snapped);
    setActiveControl({ kind: 'move' });
    setPlacingCorner(null);
    recordGridEdit(before);
  };

  const scaleGridUniformly = (factor: number): void => {
    if (meshOverridesRef.current.length) {
      const count = meshOverridesRef.current.length;
      setLocalConstraintState('constrained');
      setLocalFeedback(`Clear all ${count} local adjustment${count === 1 ? '' : 's'} before scaling the coarse grid.`);
      return;
    }
    const nextPoints = predrawnUniformGridScale(pointsRef.current, sourceSize, factor);
    if (!nextPoints) {
      setLocalConstraintState('constrained');
      setLocalFeedback('The grid has reached the artwork edge. Move it inward or scale it down.');
      return;
    }
    const before = currentGridSnapshot();
    commitPoints(nextPoints);
    setActiveControl({ kind: 'move' });
    setPlacingCorner(null);
    setLocalFeedback(`Scaled the whole grid ${factor < 1 ? 'down' : 'up'} with its proportions locked.`);
    recordGridEdit(before);
  };

  const pinBoundaryReference = (): void => {
    if (!CORNERS.every((corner) => pointsRef.current[corner])) return;
    const before = currentGridSnapshot();
    commitBoundaryPoints({ ...pointsRef.current });
    recordGridEdit(before);
  };

  const clearBoundaryReference = (): void => {
    const before = currentGridSnapshot();
    commitBoundaryPoints({ north: undefined, east: undefined, south: undefined, west: undefined });
    if (activeControl.kind === 'reference-corner') setActiveControl({ kind: 'move' });
    recordGridEdit(before);
  };

  const changeGridColumns = (value: number): void => {
    const next = normalizePredrawnGridCount(value, gridColumns);
    if (next === gridColumns) return;
    if (meshOverridesRef.current.length) {
      const count = meshOverridesRef.current.length;
      setLocalConstraintState('constrained');
      setLocalFeedback(`Clear all ${count} local adjustment${count === 1 ? '' : 's'} before changing grid dimensions.`);
      return;
    }
    const before = currentGridSnapshot();
    gridColumnsRef.current = next;
    setGridColumns(next);
    setSelectedCell(null);
    commitColumnGuides(uniformPredrawnGuides(next));
    if (
      activeControl.kind === 'column'
      || activeControl.kind === 'local-cell'
      || activeControl.kind === 'local-node'
    ) {
      setActiveControl({ kind: 'move' });
    }
    recordGridEdit(before);
  };

  const changeGridRows = (value: number): void => {
    const next = normalizePredrawnGridCount(value, gridRows);
    if (next === gridRows) return;
    if (meshOverridesRef.current.length) {
      const count = meshOverridesRef.current.length;
      setLocalConstraintState('constrained');
      setLocalFeedback(`Clear all ${count} local adjustment${count === 1 ? '' : 's'} before changing grid dimensions.`);
      return;
    }
    const before = currentGridSnapshot();
    gridRowsRef.current = next;
    setGridRows(next);
    setSelectedCell(null);
    commitRowGuides(uniformPredrawnGuides(next));
    if (
      activeControl.kind === 'row'
      || activeControl.kind === 'local-cell'
      || activeControl.kind === 'local-node'
    ) {
      setActiveControl({ kind: 'move' });
    }
    recordGridEdit(before);
  };

  const chooseEditMode = (mode: GridEditMode): void => {
    setEditMode(mode);
    setPlacingCorner(null);
    setLocalConstraintState('idle');
    setLocalFeedback(null);
    if (mode === 'coarse') {
      if (activeControl.kind === 'local-cell' || activeControl.kind === 'local-node') {
        setActiveControl({ kind: 'move' });
      }
    } else if (selectedCell) {
      setActiveControl({ kind: 'local-cell', ...selectedCell });
    }
    overlayRef.current?.focus();
  };

  const chooseLocalCell = (column: number, row: number): void => {
    const next = { column, row };
    setSelectedCell(next);
    setActiveControl({ kind: 'local-cell', ...next });
    setLocalConstraintState('idle');
    setLocalFeedback(null);
    overlayRef.current?.focus();
  };

  const resetActiveLocalNode = (): void => {
    if (activeControl.kind !== 'local-node') return;
    const current = currentRegistration();
    if (!current || !predrawnMeshNodeIsOverridden(current, activeControl.column, activeControl.row)) return;
    const before = currentGridSnapshot();
    const next = clearPredrawnMeshNodeOverride(current, activeControl.column, activeControl.row);
    commitMeshRegistration(
      next,
      { state: 'reset', message: 'Reset this shared corner to the coarse row-and-column fit.' },
    );
    recordGridEdit(before);
  };

  const resetSelectedLocalCell = (): void => {
    if (!selectedCell) return;
    const current = currentRegistration();
    if (!current) return;
    const before = currentGridSnapshot();
    const next = clearPredrawnMeshCellOverrides(current, selectedCell.column, selectedCell.row);
    commitMeshRegistration(
      next,
      {
        state: 'reset',
        message: 'Reset this tile’s local corners. Shared neighboring corners returned to their coarse fit too.',
      },
    );
    recordGridEdit(before);
    setActiveControl({ kind: 'local-cell', ...selectedCell });
  };

  const resetAllLocalCells = (): void => {
    const current = currentRegistration();
    if (!current?.meshOverrides?.length) return;
    const before = currentGridSnapshot();
    const next = clearAllPredrawnMeshOverrides(current);
    commitMeshRegistration(
      next,
      { state: 'reset', message: 'Cleared every local cell refinement. The coarse grid is unchanged.' },
    );
    recordGridEdit(before);
    if (selectedCell) setActiveControl({ kind: 'local-cell', ...selectedCell });
  };

  const stageStyle = sourceSize.width && sourceSize.height
    ? {
        width: zoom === 'fit' ? '100%' : `${Math.round(sourceSize.width * zoom)}px`,
        aspectRatio: `${sourceSize.width} / ${sourceSize.height}`,
      } as CSSProperties
    : undefined;

  const gridLines = useMemo(() => {
    if (!registration) return null;
    const makeLine = (start: PredrawnPoint | undefined, end: PredrawnPoint | undefined) => (
      start && end ? { start, end } : null
    );
    const meshLine = (points: (PredrawnPoint | undefined)[]): PredrawnPoint[] | null => (
      points.every((point): point is PredrawnPoint => Boolean(point))
        ? points as PredrawnPoint[]
        : null
    );
    const cells = Array.from({ length: gridRows }, (_, row) => (
      Array.from({ length: gridColumns }, (__, column) => {
        const points = predrawnLocalCellNodes(column, row)
          .map((node) => predrawnSourceMeshNode(registration, node.column, node.row));
        return points.every((point): point is PredrawnPoint => Boolean(point))
          ? { column, row, points: points as PredrawnPoint[] }
          : null;
      })
    )).flat().filter(Boolean) as { column: number; row: number; points: PredrawnPoint[] }[];
    return {
      fittedColumns: Array.from({ length: gridColumns + 1 }, (_, column) => meshLine(
        Array.from({ length: gridRows + 1 }, (__, row) => (
          predrawnSourceMeshNode(registration, column, row)
        )),
      )).filter(Boolean) as PredrawnPoint[][],
      fittedRows: Array.from({ length: gridRows + 1 }, (_, row) => meshLine(
        Array.from({ length: gridColumns + 1 }, (__, column) => (
          predrawnSourceMeshNode(registration, column, row)
        )),
      )).filter(Boolean) as PredrawnPoint[][],
      canonicalColumns: uniformPredrawnGuides(gridColumns).map((guide) => makeLine(
        predrawnSourceGridPoint(registration, guide, 0),
        predrawnSourceGridPoint(registration, guide, 1),
      )).filter(Boolean) as { start: PredrawnPoint; end: PredrawnPoint }[],
      canonicalRows: uniformPredrawnGuides(gridRows).map((guide) => makeLine(
        predrawnSourceGridPoint(registration, 0, guide),
        predrawnSourceGridPoint(registration, 1, guide),
      )).filter(Boolean) as { start: PredrawnPoint; end: PredrawnPoint }[],
      columnHandles: columnGuides.slice(1, -1).map((_guide, index) => ({
        index: index + 1,
        point: predrawnSourceGridPoint(registration, columnGuides[index + 1], 0.18),
      })),
      rowHandles: rowGuides.slice(1, -1).map((_guide, index) => ({
        index: index + 1,
        point: predrawnSourceGridPoint(registration, 0.82, rowGuides[index + 1]),
      })),
      center: predrawnSourceGridPoint(registration, 0.5, 0.5),
      cells,
      localHandles: selectedCell
        ? predrawnLocalCellNodes(selectedCell.column, selectedCell.row).map((node) => ({
            ...node,
            point: predrawnSourceMeshNode(registration, node.column, node.row),
            locked: predrawnLocalNodeIsBoundary(
              node.column,
              node.row,
              gridColumns,
              gridRows,
            ),
            overridden: predrawnMeshNodeIsOverridden(registration, node.column, node.row),
            affectedCellCount: predrawnMeshCellsForNode(registration, node.column, node.row).length,
          }))
        : [],
      affectedCellKeys: activeControl.kind === 'local-node'
        ? new Set(predrawnMeshCellsForNode(
            registration,
            activeControl.column,
            activeControl.row,
          ).map((cell) => `${cell.column},${cell.row}`))
        : new Set<string>(),
    };
  }, [activeControl, columnGuides, gridColumns, gridRows, registration, rowGuides, selectedCell]);
  const selectedCellOverrideCount = registration && selectedCell
    ? predrawnLocalCellNodes(selectedCell.column, selectedCell.row).filter((node) => (
        predrawnMeshNodeIsOverridden(registration, node.column, node.row)
      )).length
    : 0;
  const activeLocalNodeOverridden = Boolean(
    registration
    && activeControl.kind === 'local-node'
    && predrawnMeshNodeIsOverridden(registration, activeControl.column, activeControl.row),
  );
  const coarseRebaseLocked = meshOverrides.length > 0;
  const coarseRebaseTitle = coarseRebaseLocked
    ? `Clear all ${meshOverrides.length} local adjustment${meshOverrides.length === 1 ? '' : 's'} before changing grid dimensions, snapping, or resetting spacing.`
    : undefined;

  return createPortal(
    <div
      className="confirm-scrim predrawn-corner-picker-scrim chrome-family-surface"
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div
        ref={panelRef}
        data-testid="predrawn-corner-picker"
        tabIndex={-1}
        className="confirm-panel predrawn-corner-picker-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="predrawn-corner-picker-title"
      >
        <header className="predrawn-corner-picker-header">
          <div>
            <h2 id="predrawn-corner-picker-title">Calibrate the artwork refit grid</h2>
            <p>Fit the whole grid first, then correct individual painted tiles with shared local corners where the artwork drifts.</p>
          </div>
          <ChromeButton unit="inner-text-button"
            className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
            onClick={onClose}
          >Close</ChromeButton>
        </header>

        <div className="predrawn-corner-picker-toolbar">
          <div className="predrawn-corner-picker-toolbar-main">
            <div className="predrawn-corner-picker-mode" role="group" aria-label="Grid editing scale">
              <ChromeButton unit="inner-text-button"
                data-testid="predrawn-grid-edit-coarse"
                className={chromeUnitClassNames(
                  'inner-text-button',
                  'le-seg-btn',
                  editMode === 'coarse' && 'active',
                )}
                aria-pressed={editMode === 'coarse'}
                onClick={() => chooseEditMode('coarse')}
              >Coarse grid</ChromeButton>
              <ChromeButton unit="inner-text-button"
                data-testid="predrawn-grid-edit-local"
                className={chromeUnitClassNames(
                  'inner-text-button',
                  'le-seg-btn',
                  editMode === 'local' && 'active',
                )}
                aria-pressed={editMode === 'local'}
                disabled={!complete}
                title={complete
                  ? 'Select one painted tile and adjust its shared interior corners.'
                  : 'Place a complete coarse grid before refining individual tiles.'}
                onClick={() => chooseEditMode('local')}
              >Local cells</ChromeButton>
            </div>
            <div className="predrawn-grid-history" role="group" aria-label="Grid edit history">
              <ChromeButton unit="inner-text-button"
                data-testid="predrawn-grid-undo"
                className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
                disabled={!gridHistory.undo.length}
                title={gridHistory.undo.length
                  ? 'Undo the last grid adjustment.'
                  : 'Nothing to undo.'}
                onClick={() => applyGridHistory('undo')}
              >Undo</ChromeButton>
              <ChromeButton unit="inner-text-button"
                data-testid="predrawn-grid-redo"
                className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
                disabled={!gridHistory.redo.length}
                title={gridHistory.redo.length
                  ? 'Redo the last undone grid adjustment.'
                  : 'Nothing to redo.'}
                onClick={() => applyGridHistory('redo')}
              >Redo</ChromeButton>
            </div>
            {editMode === 'coarse' ? (
              <div className="predrawn-corner-picker-corners" role="group" aria-label="Corner to place">
                {CORNERS.map((corner) => (
                  <ChromeButton unit="inner-text-button"
                    key={corner}
                    className={chromeUnitClassNames(
                      'inner-text-button',
                      'le-seg-btn',
                      activeControl.kind === 'corner' && activeControl.corner === corner && 'active',
                    )}
                    aria-pressed={activeControl.kind === 'corner' && activeControl.corner === corner}
                    onClick={() => chooseCorner(corner)}
                  >
                    <strong>{`Point ${CORNER_POINT_NUMBER[corner]}`}</strong>
                    <span>{pointLabel(points[corner])}</span>
                  </ChromeButton>
                ))}
              </div>
            ) : (
              <p className="predrawn-grid-local-instruction">
                {selectedCell
                  ? `Tile ${selectedCell.column + 1}, ${selectedCell.row + 1} selected · choose one of its four shared corners.`
                  : 'Click a tile to expose its four shared corner handles.'}
              </p>
            )}
          </div>
          <div className="predrawn-corner-picker-zoom" role="group" aria-label="Source image zoom">
            {(['fit', ...PREDRAWN_SOURCE_ZOOM_LEVELS] as const).map((value) => (
              <ChromeButton unit="inner-text-button"
                key={value}
                className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', zoom === value && 'active')}
                aria-pressed={zoom === value}
                onClick={() => {
                  viewportZoomAnchorRef.current = null;
                  setZoom(value);
                }}
              >{value === 'fit' ? 'Fit' : `${value * 100}%`}</ChromeButton>
            ))}
          </div>
        </div>

        <div className={`predrawn-grid-calibration-bar is-${editMode}`}>
          <div className="predrawn-grid-legend" aria-label="Grid legend">
            <span data-kind="fitted">Fitted grid</span>
            {editMode === 'coarse' ? (
              <>
                <span data-kind="canonical">Equal-spacing reference</span>
                <span data-kind="boundary">Pinned boundary</span>
              </>
            ) : (
              <>
                <span data-kind="selected">Selected tile</span>
                <span data-kind="affected">Shared neighbors</span>
                <span data-kind="locked">Locked outside edge</span>
              </>
            )}
          </div>
          {editMode === 'coarse' ? (
            <>
              <div
                className={`predrawn-grid-size-controls${coarseRebaseLocked ? ' is-locked' : ''}`}
                role="group"
                aria-label="Artwork refit target dimensions"
                title={coarseRebaseTitle}
              >
                <label title={coarseRebaseTitle}>
                  <span>Refit columns</span>
                  <input
                    data-testid="predrawn-grid-columns"
                    type="number"
                    min={1}
                    max={64}
                    step={1}
                    value={gridColumns}
                    disabled={coarseRebaseLocked}
                    title={coarseRebaseTitle}
                    onChange={(event) => {
                      if (event.currentTarget.value) changeGridColumns(Number(event.currentTarget.value));
                    }}
                  />
                </label>
                <span aria-hidden="true">×</span>
                <label title={coarseRebaseTitle}>
                  <span>Refit rows</span>
                  <input
                    data-testid="predrawn-grid-rows"
                    type="number"
                    min={1}
                    max={64}
                    step={1}
                    value={gridRows}
                    disabled={coarseRebaseLocked}
                    title={coarseRebaseTitle}
                    onChange={(event) => {
                      if (event.currentTarget.value) changeGridRows(Number(event.currentTarget.value));
                    }}
                  />
                </label>
                <small>Level remains {columns} × {rows}</small>
              </div>
              <output data-testid="predrawn-grid-stretch-summary">
                Refit {gridColumns} × {gridRows} · Columns {formatScale(stretch.columnMinScale)}–{formatScale(stretch.columnMaxScale)} · Rows {formatScale(stretch.rowMinScale)}–{formatScale(stretch.rowMaxScale)} · Max correction {stretch.maximumDeviationPercent.toFixed(1)}%
              </output>
            </>
          ) : (
            <output data-testid="predrawn-grid-local-summary">
              {selectedCell
                ? `Tile ${selectedCell.column + 1}, ${selectedCell.row + 1} · ${selectedCellOverrideCount} adjusted corner${selectedCellOverrideCount === 1 ? '' : 's'}`
                : 'No tile selected'}
              {' · '}{meshOverrides.length} local adjustment{meshOverrides.length === 1 ? '' : 's'} total
            </output>
          )}
          <div className="predrawn-grid-calibration-actions">
            {editMode === 'coarse' ? (
              <>
                <ChromeButton unit="inner-text-button"
                  data-testid="predrawn-boundary-pin"
                  className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
                  disabled={!complete}
                  onClick={pinBoundaryReference}
                >{boundaryReference ? 'Update boundary' : 'Pin boundary'}</ChromeButton>
                <ChromeButton unit="inner-text-button"
                  data-testid="predrawn-boundary-clear"
                  className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
                  disabled={!boundaryReference}
                  onClick={clearBoundaryReference}
                >Clear boundary</ChromeButton>
                <ChromeButton unit="inner-text-button"
                  data-testid="predrawn-grid-snap-ideal"
                  className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
                  disabled={!complete || coarseRebaseLocked}
                  title={coarseRebaseTitle ?? 'Snap the coarse grid to ideal board projection spacing.'}
                  onClick={snapToIdealGrid}
                >Snap ideal grid</ChromeButton>
                <div className="predrawn-grid-uniform-scale" role="group" aria-label="Uniform grid size">
                  <span>Uniform size</span>
                  <ChromeButton unit="inner-text-button"
                    data-testid="predrawn-grid-scale-down"
                    className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
                    disabled={!complete || coarseRebaseLocked}
                    title="Scale the whole grid down 2% around its center while preserving its proportions."
                    onClick={() => scaleGridUniformly(0.98)}
                  >−</ChromeButton>
                  <ChromeButton unit="inner-text-button"
                    data-testid="predrawn-grid-scale-up"
                    className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
                    disabled={!complete || coarseRebaseLocked}
                    title="Scale the whole grid up 2% around its center while preserving its proportions."
                    onClick={() => scaleGridUniformly(1.02)}
                  >+</ChromeButton>
                </div>
                <ChromeButton unit="inner-text-button"
                  data-testid="predrawn-grid-reset-spacing"
                  className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
                  disabled={coarseRebaseLocked}
                  title={coarseRebaseTitle ?? 'Reset row and column spacing to equal intervals.'}
                  onClick={resetSpacing}
                >Reset spacing</ChromeButton>
                {coarseRebaseLocked ? (
                  <ChromeButton unit="inner-text-button"
                    data-testid="predrawn-grid-clear-local-from-coarse"
                    className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', 'danger')}
                    title="Explicitly clear local cell refinements so coarse dimensions and spacing can be rebased."
                    onClick={resetAllLocalCells}
                  >Clear {meshOverrides.length} local</ChromeButton>
                ) : null}
              </>
            ) : (
              <>
                <ChromeButton unit="inner-text-button"
                  data-testid="predrawn-grid-reset-node"
                  className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
                  disabled={!activeLocalNodeOverridden}
                  title="Reset the active shared corner to the coarse grid."
                  onClick={resetActiveLocalNode}
                >Reset corner</ChromeButton>
                <ChromeButton unit="inner-text-button"
                  data-testid="predrawn-grid-reset-cell"
                  className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
                  disabled={!selectedCell || selectedCellOverrideCount === 0}
                  title="Reset all adjusted corners of this tile, including corners shared with neighbors."
                  onClick={resetSelectedLocalCell}
                >Reset tile</ChromeButton>
                <ChromeButton unit="inner-text-button"
                  data-testid="predrawn-grid-reset-local"
                  className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
                  disabled={!meshOverrides.length}
                  title={`Clear all ${meshOverrides.length} local adjustment${meshOverrides.length === 1 ? '' : 's'} without changing the coarse grid.`}
                  onClick={resetAllLocalCells}
                >Clear all local</ChromeButton>
              </>
            )}
          </div>
        </div>

        <div
          ref={viewportRef}
          className="predrawn-corner-picker-viewport"
        >
          <div
            ref={stageRef}
            className="predrawn-corner-picker-stage"
            style={stageStyle}
            onClick={placeActiveCorner}
          >
            <img
              src={src}
              alt="Untouched pre-drawn board source"
              draggable={false}
              onLoad={(event) => {
                const width = event.currentTarget.naturalWidth;
                const height = event.currentTarget.naturalHeight;
                setSourceSize({ width, height });
                setLoadError(false);
                if (!normalizedForImage.current) {
                  const normalizedPoints = openingRegistration.current
                    ? pointsFromRegistration(openingRegistration.current, width, height)
                    : predrawnIdealGridSeed(
                      { width, height },
                      openingGrid.current.columns,
                      openingGrid.current.rows,
                    ) ?? pointsFromRegistration(undefined, width, height);
                  const normalizedBoundaryPoints = boundaryPointsFromRegistration(
                    openingRegistration.current,
                    width,
                    height,
                  );
                  const normalizedMeshOverrides = meshOverridesFromRegistration(
                    openingRegistration.current,
                    width,
                    height,
                  );
                  pointsRef.current = normalizedPoints;
                  boundaryPointsRef.current = normalizedBoundaryPoints;
                  meshOverridesRef.current = normalizedMeshOverrides;
                  clearGridHistory();
                  setPoints(normalizedPoints);
                  setBoundaryPoints(normalizedBoundaryPoints);
                  setMeshOverrides(normalizedMeshOverrides);
                  if (!openingRegistration.current && CORNERS.every((corner) => normalizedPoints[corner])) {
                    setActiveControl({ kind: 'move' });
                    setPlacingCorner(null);
                    setSaveState('pending');
                    setLocalFeedback('Started with the real game grid, centered and uniformly scaled.');
                  }
                  normalizedForImage.current = true;
                }
              }}
              onError={() => setLoadError(true)}
            />
            {sourceSize.width && sourceSize.height ? (
              <div
                ref={overlayRef}
                data-testid="predrawn-corner-picker-stage"
                className={`predrawn-corner-picker-overlay${viewportPanning ? ' is-panning' : ''}`}
                tabIndex={0}
                role="application"
                aria-label={editMode === 'local'
                  ? selectedCell
                    ? `Local tile refinement for tile ${selectedCell.column + 1}, ${selectedCell.row + 1}. Choose a shared interior corner, then drag it or use arrow keys.`
                    : 'Local tile refinement. Click a painted tile to expose its four shared corners.'
                  : `Adjust ${activeControlLabel(activeControl)}. Drag handles or use arrow keys; hold Shift for ten-pixel corner movement.`}
                onKeyDown={nudgeActiveControl}
                onPointerDownCapture={beginViewportPan}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onContextMenu={(event) => event.preventDefault()}
              >
                {gridLines && !placingCorner ? (
                  <svg viewBox={`0 0 ${sourceSize.width} ${sourceSize.height}`} preserveAspectRatio="none" aria-hidden="true">
                    {editMode === 'local' ? (
                      <g className="predrawn-grid-cell-hits">
                        {gridLines.cells.map((cell) => {
                          const key = `${cell.column},${cell.row}`;
                          const selected = selectedCell?.column === cell.column
                            && selectedCell.row === cell.row;
                          const affected = gridLines.affectedCellKeys.has(key);
                          return (
                            <polygon
                              key={key}
                              data-testid={`predrawn-local-cell-${cell.column}-${cell.row}`}
                              className={[
                                'predrawn-grid-cell-hit',
                                selected ? 'is-selected' : '',
                                affected ? 'is-affected' : '',
                              ].filter(Boolean).join(' ')}
                              points={cell.points.map((point) => point.join(',')).join(' ')}
                              vectorEffect="non-scaling-stroke"
                              onClick={(event) => {
                                event.stopPropagation();
                                chooseLocalCell(cell.column, cell.row);
                              }}
                            >
                              <title>{`Select tile ${cell.column + 1}, ${cell.row + 1} for local corner refinement`}</title>
                            </polygon>
                          );
                        })}
                      </g>
                    ) : null}
                    {editMode === 'coarse' && boundaryReference ? (
                      <g className="predrawn-boundary-reference">
                        <polygon
                          points={CORNERS.map((corner) => boundaryReference[corner].join(',')).join(' ')}
                          vectorEffect="non-scaling-stroke"
                        />
                        {CORNERS.map((corner) => (
                          <circle
                            key={corner}
                            data-testid={`predrawn-boundary-${corner}`}
                            className={activeControl.kind === 'reference-corner' && activeControl.corner === corner ? 'active' : undefined}
                            cx={boundaryReference[corner][0]}
                            cy={boundaryReference[corner][1]}
                            r={7}
                            vectorEffect="non-scaling-stroke"
                            onPointerDown={(event) => beginDrag(event, { kind: 'reference-corner', corner })}
                          ><title>{`Adjust pinned ${boundaryPointLabel(corner).toLowerCase()}`}</title></circle>
                        ))}
                      </g>
                    ) : null}
                    {editMode === 'coarse' ? (
                      <g className="predrawn-grid-reference-lines">
                        {[...gridLines.canonicalColumns, ...gridLines.canonicalRows].map((line, index) => (
                          <line key={index} x1={line.start[0]} y1={line.start[1]} x2={line.end[0]} y2={line.end[1]} vectorEffect="non-scaling-stroke" />
                        ))}
                      </g>
                    ) : null}
                    <g className="predrawn-grid-fitted-lines">
                      {[...gridLines.fittedColumns, ...gridLines.fittedRows].map((line, index) => (
                        <polyline
                          key={index}
                          points={line.map((point) => point.join(',')).join(' ')}
                          vectorEffect="non-scaling-stroke"
                        />
                      ))}
                    </g>
                    {editMode === 'coarse' ? (
                      <>
                        <g className="predrawn-grid-guide-handles predrawn-grid-column-handles">
                          {gridLines.columnHandles.map(({ index, point }) => point ? (
                            <circle
                              key={index}
                              data-testid={`predrawn-column-guide-${index}`}
                              cx={point[0]}
                              cy={point[1]}
                              r={8}
                              vectorEffect="non-scaling-stroke"
                              onPointerDown={(event) => beginDrag(event, { kind: 'column', index })}
                            ><title>{`Stretch column guide ${index}`}</title></circle>
                          ) : null)}
                        </g>
                        <g className="predrawn-grid-guide-handles predrawn-grid-row-handles">
                          {gridLines.rowHandles.map(({ index, point }) => point ? (
                            <rect
                              key={index}
                              data-testid={`predrawn-row-guide-${index}`}
                              x={point[0] - 7}
                              y={point[1] - 7}
                              width={14}
                              height={14}
                              rx={2}
                              vectorEffect="non-scaling-stroke"
                              onPointerDown={(event) => beginDrag(event, { kind: 'row', index })}
                            ><title>{`Stretch row guide ${index}`}</title></rect>
                          ) : null)}
                        </g>
                      </>
                    ) : null}
                    {editMode === 'coarse' && gridLines.center ? (
                      <g
                        className="predrawn-grid-move-handle"
                        data-testid="predrawn-grid-move-handle"
                        transform={`translate(${gridLines.center[0]} ${gridLines.center[1]})`}
                        onPointerDown={(event) => beginDrag(event, { kind: 'move' })}
                      >
                        <circle r={12} vectorEffect="non-scaling-stroke" />
                        <path d="M-7 0H7M0-7V7" vectorEffect="non-scaling-stroke" />
                        <title>Move the whole grid</title>
                      </g>
                    ) : null}
                  </svg>
                ) : null}
                {editMode === 'local' && gridLines && selectedCell ? gridLines.localHandles.map((handle) => {
                  if (!handle.point) return null;
                  const active = activeControl.kind === 'local-node'
                    && activeControl.column === handle.column
                    && activeControl.row === handle.row;
                  const title = handle.locked
                    ? 'This shared corner is on the outside edge and stays locked in Local cells. Use Coarse grid to move the boundary.'
                    : `Drag this shared corner. It adjusts ${handle.affectedCellCount} highlighted tile${handle.affectedCellCount === 1 ? '' : 's'}. Arrow keys move 1 source pixel; Shift moves 10.`;
                  const control: ActiveControl = {
                    kind: 'local-node',
                    column: handle.column,
                    row: handle.row,
                    cellColumn: selectedCell.column,
                    cellRow: selectedCell.row,
                    corner: handle.corner,
                  };
                  return (
                    <button
                      key={handle.corner}
                      type="button"
                      data-testid={`predrawn-local-node-${handle.corner}`}
                      data-corner={handle.corner}
                      className={[
                        'predrawn-grid-local-node',
                        active ? 'is-active' : '',
                        handle.locked ? 'is-locked' : '',
                        handle.overridden ? 'is-overridden' : '',
                      ].filter(Boolean).join(' ')}
                      style={{
                        left: `${(handle.point[0] / sourceSize.width) * 100}%`,
                        top: `${(handle.point[1] / sourceSize.height) * 100}%`,
                      }}
                      aria-label={title}
                      aria-disabled={handle.locked}
                      title={title}
                      onFocus={() => setActiveControl(control)}
                      onPointerDown={(event) => {
                        if (event.button !== 0) return;
                        if (handle.locked) {
                          event.preventDefault();
                          event.stopPropagation();
                          setActiveControl(control);
                          setLocalConstraintState('constrained');
                          setLocalFeedback('This shared corner is on the locked outside edge. Switch to Coarse grid to move the boundary.');
                          overlayRef.current?.focus();
                          return;
                        }
                        beginDrag(event, control);
                      }}
                      onClick={(event) => event.stopPropagation()}
                    />
                  );
                }) : null}
                {editMode === 'coarse' ? CORNERS.map((corner) => {
                  const point = points[corner];
                  if (!point || placingCorner === corner) return null;
                  return (
                    <span
                      key={corner}
                      data-testid={`predrawn-corner-${corner}`}
                      data-corner={corner}
                      className={`predrawn-corner-picker-marker ${activeControl.kind === 'corner' && activeControl.corner === corner ? 'active' : ''}`.trim()}
                      style={{ left: `${(point[0] / sourceSize.width) * 100}%`, top: `${(point[1] / sourceSize.height) * 100}%` }}
                      onPointerDown={(event) => beginDrag(event, { kind: 'corner', corner })}
                    >
                      <span className="predrawn-corner-picker-marker-label">{CORNER_POINT_NUMBER[corner]}</span>
                    </span>
                  );
                }) : null}
              </div>
            ) : null}
          </div>
          {loadError ? <p className="predrawn-corner-picker-error" role="alert">The source image could not be loaded.</p> : null}
        </div>

        <footer className="predrawn-corner-picker-footer">
          <p
            className="predrawn-corner-picker-save-status"
            data-state={saveState}
            data-local-state={localConstraintState}
            role={saveState === 'error' ? 'alert' : 'status'}
            aria-live="polite"
          >
            <strong>{activeControlLabel(activeControl)}</strong>.{' '}
            {placingCorner
              ? `${boundaryPointLabel(placingCorner)} placement armed — click its destination on the image.`
              : localFeedback
                ?? (editMode === 'local'
                  ? selectedCell
                    ? 'Choose one of the tile’s four corner handles.'
                    : 'Click a painted tile to begin local refinement.'
                  : saveState === 'pending'
                    ? onSaveRegistration
                      ? `CALIBRATION CHANGED — click ${saveLabel} to save this grid and apply its fitted board.`
                      : 'CALIBRATION CHANGED — click SAVE REGISTRATION to apply the inverse warp.'
                    : saveState === 'saved'
                      ? onSaveRegistration
                        ? 'GRID SUBMITTED — saving and selecting the fitted board.'
                        : 'SAVED LOCALLY — the exact grid registration was read back and applied.'
                      : saveState === 'error'
                        ? 'LOCAL SAVE FAILED — registration was not saved.'
                        : 'Drag a handle to begin.')}
            {' '}{editMode === 'local'
              ? 'A shared corner changes every highlighted neighboring tile. Outside-edge handles are locked; switch to Coarse grid to move the boundary. Arrow keys move 1 source pixel; Shift moves 10.'
              : 'Cyan circles stretch columns, squares stretch rows, the center cross moves the whole grid and its local adjustments, and magenta handles edit the pinned boundary.'}
            {' '}Mouse wheel zooms at the cursor. Right-drag anywhere on the artwork to pan.
          </p>
          <div className="confirm-actions">
            <ChromeButton unit="inner-text-button"
              className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
              onClick={reset}
            >Restore opening calibration</ChromeButton>
            <ChromeButton unit="inner-text-button"
              data-testid="predrawn-registration-save"
              className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', 'active')}
              disabled={!complete || loadError}
              title={onSaveRegistration
                ? 'Save this exact grid and use the resulting fitted board.'
                : 'Save this exact grid registration.'}
              onClick={saveRegistration}
            >{saveLabel}</ChromeButton>
            {showCodexHandoff ? (
              <ChromeButton unit="inner-text-button"
                data-testid="predrawn-registration-copy-handoff"
                className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
                disabled={saveState !== 'saved'}
                onClick={() => { void copyCodexHandoff(); }}
              >{handoffCopyState === 'copied'
                  ? 'COPIED — PASTE IN CODEX'
                  : handoffCopyState === 'error'
                    ? 'COPY FAILED'
                    : 'COPY CODEX HANDOFF'}</ChromeButton>
            ) : null}
            <ChromeButton unit="inner-text-button"
              className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
              disabled={!complete || saveState === 'pending' || saveState === 'error'}
              onClick={onClose}
            >Done</ChromeButton>
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
