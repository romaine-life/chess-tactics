import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactElement,
} from 'react';
import { createPortal } from 'react-dom';
import {
  TILE_TOP_HEIGHT,
  TILE_TOP_WIDTH,
  type EditorBoard,
  type VersionedPredrawnBoardSurface,
} from '@chess-tactics/board-render';
import {
  FULL_CELL_MOVE_HIGHLIGHT_FOOTPRINT,
  PREDRAWN_VISUAL_FOOTPRINT_CLIP_CSS_PROPERTY,
  comparePredrawnMoveHighlightCellKeys,
  isFullCellMoveHighlightFootprint,
  normalizePredrawnMoveHighlightFootprint,
  predrawnMoveHighlightClipPath,
  type PredrawnMoveHighlightCells,
  type PredrawnMoveHighlightFootprint,
} from '@chess-tactics/board-render/render/predrawnMoveHighlight';
import { StudioReadOnlyBoard } from '../render/StudioReadOnlyBoard';
import { PredrawnMoveHighlightPaint } from '../render/PredrawnMoveHighlightPaint';
import {
  predrawnBoardCoverPolygon,
  runtimePredrawnBoardPlate,
} from '../render/PredrawnBoardLayer';
import { chromeUnitClassNames } from './chromeUnitRegistry';
import { DirectionArrowIcon } from './shared/DirectionArrowIcon';
import type { PredrawnBoardArtifact } from './predrawnBoardArtifacts';
import { predrawnDirectRegistrationForBackground } from './predrawnBackgroundVersionPolicy';
import { ViewPane } from './shared/ViewPane';
import { ChromeButton } from './shared/ChromeButton';

const MOVE_HIGHLIGHT_HISTORY_LIMIT = 100;
const MINIMUM_EDITOR_ZOOM = 0.2;
const MAXIMUM_EDITOR_ZOOM = 4;
const EDITOR_ZOOM_STEP = 0.1;
const HANDLE_LARGE_NUDGE_PIXELS = 10;
const MOVE_HIGHLIGHT_EDITOR_FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');
const FOOTPRINT_HANDLE_NAMES = ['top', 'right', 'bottom', 'left'] as const;
const FOOTPRINT_EDGE_NAMES = [
  'upper-right',
  'lower-right',
  'lower-left',
  'upper-left',
] as const;
const FOOTPRINT_EDGE_HANDLES = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 0],
] as const;
const FOOTPRINT_EDGE_NEIGHBOR_DELTAS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
] as const;
const FOOTPRINT_EDGE_TANGENT_DELTAS = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
] as const;

export type FootprintHandleIndex = 0 | 1 | 2 | 3;
export type FootprintEdgeIndex = 0 | 1 | 2 | 3;
export type PredrawnMoveHighlightAxisConstraint = 'free' | 'x' | 'y';
export type PredrawnMoveHighlightEditTarget =
  | Readonly<{
      kind: 'point';
      handle: FootprintHandleIndex;
      cellKey?: string;
    }>
  | Readonly<{
      kind: 'edge';
      edge: FootprintEdgeIndex;
      anchorCellKey?: string;
    }>;

function parseMoveHighlightCellKey(
  key: string,
): Readonly<{ x: number; y: number }> | undefined {
  const match = /^(-?\d+),(-?\d+)$/.exec(key);
  if (!match) return undefined;
  return { x: Number(match[1]), y: Number(match[2]) };
}

function moveHighlightCellKey(x: number, y: number): string {
  return `${x},${y}`;
}

function predrawnMoveHighlightEdgeIsExposed(
  selectedCellKeys: ReadonlySet<string>,
  cellKey: string,
  edge: FootprintEdgeIndex,
): boolean {
  const cell = parseMoveHighlightCellKey(cellKey);
  if (!cell || !selectedCellKeys.has(cellKey)) return false;
  const [neighborX, neighborY] = FOOTPRINT_EDGE_NEIGHBOR_DELTAS[edge];
  return !selectedCellKeys.has(moveHighlightCellKey(
    cell.x + neighborX,
    cell.y + neighborY,
  ));
}

/**
 * Resolve the maximal contiguous outer border bar containing one clicked tile edge.
 *
 * Top/bottom screen edges continue across board X; left/right screen edges continue across
 * board Y. A selected neighbor across the edge makes that segment internal and ineligible.
 */
export function predrawnMoveHighlightBoundaryBar(
  selectedCellKeys: readonly string[],
  anchorCellKey: string,
  edge: FootprintEdgeIndex,
): readonly string[] {
  const selected = new Set(selectedCellKeys);
  const anchor = parseMoveHighlightCellKey(anchorCellKey);
  if (
    !anchor
    || !predrawnMoveHighlightEdgeIsExposed(selected, anchorCellKey, edge)
  ) return [];

  const [stepX, stepY] = FOOTPRINT_EDGE_TANGENT_DELTAS[edge];
  const before: string[] = [];
  const after: string[] = [];
  for (let direction = -1; direction <= 1; direction += 2) {
    for (let distance = 1; ; distance += 1) {
      const candidateKey = moveHighlightCellKey(
        anchor.x + stepX * distance * direction,
        anchor.y + stepY * distance * direction,
      );
      if (!predrawnMoveHighlightEdgeIsExposed(selected, candidateKey, edge)) break;
      if (direction < 0) before.unshift(candidateKey);
      else after.push(candidateKey);
    }
  }
  return [...before, anchorCellKey, ...after];
}

export function predrawnMoveHighlightSelectionAfterClick(
  selectedCellKeys: readonly string[],
  cellKey: string,
  additive: boolean,
): readonly string[] {
  if (!additive) return [cellKey];
  if (!selectedCellKeys.includes(cellKey)) return [...selectedCellKeys, cellKey];
  return selectedCellKeys.length > 1
    ? selectedCellKeys.filter((candidate) => candidate !== cellKey)
    : selectedCellKeys;
}

export function constrainPredrawnMoveHighlightDragPoint(
  originX: number,
  originY: number,
  candidateX: number,
  candidateY: number,
  constraint: PredrawnMoveHighlightAxisConstraint,
): readonly [number, number] {
  if (constraint === 'free') return [candidateX, candidateY];
  if (constraint === 'x') {
    const fixedY = Math.max(0, Math.min(10000, Math.round(originY)));
    const maximumOffset = 5000 - Math.abs(fixedY - 5000);
    return [
      Math.max(5000 - maximumOffset, Math.min(5000 + maximumOffset, Math.round(candidateX))),
      fixedY,
    ];
  }
  const fixedX = Math.max(0, Math.min(10000, Math.round(originX)));
  const maximumOffset = 5000 - Math.abs(fixedX - 5000);
  return [
    fixedX,
    Math.max(5000 - maximumOffset, Math.min(5000 + maximumOffset, Math.round(candidateY))),
  ];
}

export function predrawnMoveHighlightNativePixelSteps(
  surface: Pick<
    VersionedPredrawnBoardSurface,
    'frameWidth' | 'frameHeight' | 'worldBounds'
  >,
): Readonly<{ x: number; y: number }> {
  const delta = predrawnMoveHighlightNativePixelDelta(surface, 1, 1);
  return { x: delta.x, y: delta.y };
}

export function predrawnMoveHighlightNativePixelVector(
  surface: Pick<
    VersionedPredrawnBoardSurface,
    'frameWidth' | 'frameHeight' | 'worldBounds'
  >,
  xPixels: number,
  yPixels: number,
): Readonly<{ x: number; y: number }> {
  return {
    x: (
      xPixels
      * surface.worldBounds.width
      / surface.frameWidth
      / TILE_TOP_WIDTH
    ) * 10000,
    y: (
      yPixels
      * surface.worldBounds.height
      / surface.frameHeight
      / TILE_TOP_HEIGHT
    ) * 10000,
  };
}

export function predrawnMoveHighlightNativePixelDelta(
  surface: Pick<
    VersionedPredrawnBoardSurface,
    'frameWidth' | 'frameHeight' | 'worldBounds'
  >,
  xPixels: number,
  yPixels: number,
): Readonly<{ x: number; y: number }> {
  const vector = predrawnMoveHighlightNativePixelVector(
    surface,
    xPixels,
    yPixels,
  );
  const scaledCoordinate = (pixels: number, scale: number): number => {
    if (pixels === 0) return 0;
    const rounded = Math.round(scale);
    return rounded === 0 ? Math.sign(pixels) : rounded;
  };
  return {
    x: scaledCoordinate(xPixels, vector.x),
    y: scaledCoordinate(yPixels, vector.y),
  };
}

export interface PredrawnMoveHighlightHistory {
  undo: PredrawnMoveHighlightCells[];
  redo: PredrawnMoveHighlightCells[];
}

function cloneFootprint(
  footprint: PredrawnMoveHighlightFootprint,
): PredrawnMoveHighlightFootprint {
  return [...footprint] as unknown as PredrawnMoveHighlightFootprint;
}

export function normalizePredrawnMoveHighlightCellsForEditor(
  cells: PredrawnMoveHighlightCells,
): PredrawnMoveHighlightCells {
  const normalized: Record<string, PredrawnMoveHighlightFootprint> = {};
  for (const [key, candidate] of Object.entries(cells).sort(
    ([left], [right]) => comparePredrawnMoveHighlightCellKeys(left, right),
  )) {
    const footprint = normalizePredrawnMoveHighlightFootprint(candidate);
    if (!footprint || isFullCellMoveHighlightFootprint(footprint)) continue;
    normalized[key] = cloneFootprint(footprint);
  }
  return normalized;
}

export function clonePredrawnMoveHighlightCells(
  cells: PredrawnMoveHighlightCells,
): PredrawnMoveHighlightCells {
  return Object.fromEntries(
    Object.entries(cells)
      .sort(([left], [right]) => comparePredrawnMoveHighlightCellKeys(left, right))
      .map(([key, footprint]) => [key, cloneFootprint(footprint)]),
  );
}

export function predrawnMoveHighlightCellsMatch(
  left: PredrawnMoveHighlightCells,
  right: PredrawnMoveHighlightCells,
): boolean {
  const leftEntries = Object.entries(left).sort(
    ([leftKey], [rightKey]) => comparePredrawnMoveHighlightCellKeys(leftKey, rightKey),
  );
  const rightEntries = Object.entries(right).sort(
    ([leftKey], [rightKey]) => comparePredrawnMoveHighlightCellKeys(leftKey, rightKey),
  );
  return leftEntries.length === rightEntries.length
    && leftEntries.every(([key, footprint], entryIndex) => {
      const other = rightEntries[entryIndex];
      return Boolean(
        other
        && other[0] === key
        && footprint.every((coordinate, coordinateIndex) => (
          coordinate === other[1][coordinateIndex]
        )),
      );
    });
}

export function emptyPredrawnMoveHighlightHistory(): PredrawnMoveHighlightHistory {
  return { undo: [], redo: [] };
}

export function recordPredrawnMoveHighlightHistory(
  history: PredrawnMoveHighlightHistory,
  before: PredrawnMoveHighlightCells,
  after: PredrawnMoveHighlightCells,
): PredrawnMoveHighlightHistory {
  if (predrawnMoveHighlightCellsMatch(before, after)) return history;
  return {
    undo: [
      ...history.undo,
      clonePredrawnMoveHighlightCells(before),
    ].slice(-MOVE_HIGHLIGHT_HISTORY_LIMIT),
    redo: [],
  };
}

export function stepPredrawnMoveHighlightHistory(
  history: PredrawnMoveHighlightHistory,
  current: PredrawnMoveHighlightCells,
  direction: 'undo' | 'redo',
): {
  history: PredrawnMoveHighlightHistory;
  target: PredrawnMoveHighlightCells;
} | undefined {
  const source = history[direction];
  if (!source.length) return undefined;
  const target = clonePredrawnMoveHighlightCells(source[source.length - 1]);
  const displaced = clonePredrawnMoveHighlightCells(current);
  return direction === 'undo'
    ? {
        history: {
          undo: history.undo.slice(0, -1),
          redo: [...history.redo, displaced].slice(-MOVE_HIGHLIGHT_HISTORY_LIMIT),
        },
        target,
      }
    : {
        history: {
          undo: [...history.undo, displaced].slice(-MOVE_HIGHLIGHT_HISTORY_LIMIT),
          redo: history.redo.slice(0, -1),
        },
        target,
      };
}

export function clampPredrawnMoveHighlightPointToDiamond(
  x: number,
  y: number,
): readonly [number, number] {
  const finiteX = Number.isFinite(x) ? x : 5000;
  const finiteY = Number.isFinite(y) ? y : 5000;
  const dx = finiteX - 5000;
  const dy = finiteY - 5000;
  const distance = Math.abs(dx) + Math.abs(dy);
  const scale = distance > 5000 ? 5000 / distance : 1;
  return [
    Math.max(0, Math.min(10000, Math.round(5000 + dx * scale))),
    Math.max(0, Math.min(10000, Math.round(5000 + dy * scale))),
  ];
}

export function predrawnMoveHighlightFootprintWithHandle(
  footprint: PredrawnMoveHighlightFootprint,
  handle: FootprintHandleIndex,
  x: number,
  y: number,
): PredrawnMoveHighlightFootprint | undefined {
  const [nextX, nextY] = clampPredrawnMoveHighlightPointToDiamond(x, y);
  const candidate = [...footprint];
  candidate[handle * 2] = nextX;
  candidate[handle * 2 + 1] = nextY;
  return normalizePredrawnMoveHighlightFootprint(candidate);
}

export function predrawnMoveHighlightCellsWithFootprint(
  cells: PredrawnMoveHighlightCells,
  key: string,
  footprint: PredrawnMoveHighlightFootprint,
): PredrawnMoveHighlightCells {
  const next: Record<string, PredrawnMoveHighlightFootprint> = {
    ...clonePredrawnMoveHighlightCells(cells),
  };
  if (isFullCellMoveHighlightFootprint(footprint)) delete next[key];
  else next[key] = cloneFootprint(footprint);
  return normalizePredrawnMoveHighlightCellsForEditor(next);
}

export function predrawnMoveHighlightCellsAfterNudge({
  cells,
  cellKey,
  target,
  dx,
  dy,
  axisConstraint,
}: {
  cells: PredrawnMoveHighlightCells;
  cellKey: string;
  target: PredrawnMoveHighlightEditTarget;
  dx: number;
  dy: number;
  axisConstraint: PredrawnMoveHighlightAxisConstraint;
}): PredrawnMoveHighlightCells | undefined {
  const nudgeAxis: PredrawnMoveHighlightAxisConstraint | undefined = dx !== 0 && dy === 0
    ? 'x'
    : dx === 0 && dy !== 0
      ? 'y'
      : undefined;
  if (
    !nudgeAxis
    || (axisConstraint === 'x' && nudgeAxis === 'y')
    || (axisConstraint === 'y' && nudgeAxis === 'x')
  ) return undefined;
  const current = cells[cellKey] ?? FULL_CELL_MOVE_HIGHLIGHT_FOOTPRINT;
  let nextFootprint: PredrawnMoveHighlightFootprint | undefined;
  if (target.kind === 'point') {
    const originX = current[target.handle * 2];
    const originY = current[target.handle * 2 + 1];
    const [x, y] = constrainPredrawnMoveHighlightDragPoint(
      originX,
      originY,
      originX + dx,
      originY + dy,
      nudgeAxis,
    );
    nextFootprint = predrawnMoveHighlightFootprintWithHandle(
      current,
      target.handle,
      x,
      y,
    );
  } else {
    nextFootprint = predrawnMoveHighlightFootprintWithEdgeNudge(
      current,
      target.edge,
      dx,
      dy,
    );
  }
  if (!nextFootprint) return undefined;
  const next = predrawnMoveHighlightCellsWithFootprint(
    cells,
    cellKey,
    nextFootprint,
  );
  return predrawnMoveHighlightCellsMatch(cells, next) ? undefined : next;
}

/**
 * Move every cell edge in one selected outer border bar as one all-or-nothing edit.
 *
 * A segment that cannot advance without leaving the canonical diamond rejects the complete
 * bar, preventing a partial nudge from tearing a visually continuous selection boundary.
 */
export function predrawnMoveHighlightCellsAfterBoundaryNudge({
  cells,
  cellKeys,
  edge,
  dx,
  dy,
  axisConstraint,
}: {
  cells: PredrawnMoveHighlightCells;
  cellKeys: readonly string[];
  edge: FootprintEdgeIndex;
  dx: number;
  dy: number;
  axisConstraint: PredrawnMoveHighlightAxisConstraint;
}): PredrawnMoveHighlightCells | undefined {
  const uniqueCellKeys = [...new Set(cellKeys)];
  if (!uniqueCellKeys.length) return undefined;
  let next = cells;
  for (const cellKey of uniqueCellKeys) {
    const moved = predrawnMoveHighlightCellsAfterNudge({
      cells: next,
      cellKey,
      target: { kind: 'edge', edge },
      dx,
      dy,
      axisConstraint,
    });
    if (!moved) return undefined;
    next = moved;
  }
  return predrawnMoveHighlightCellsMatch(cells, next) ? undefined : next;
}

type FootprintPoint = readonly [x: number, y: number];

function footprintPoint(
  footprint: PredrawnMoveHighlightFootprint,
  handle: FootprintHandleIndex,
): FootprintPoint {
  return [footprint[handle * 2], footprint[handle * 2 + 1]];
}

function crossProduct(left: FootprintPoint, right: FootprintPoint): number {
  return left[0] * right[1] - left[1] * right[0];
}

function subtractPoint(left: FootprintPoint, right: FootprintPoint): FootprintPoint {
  return [left[0] - right[0], left[1] - right[1]];
}

function intersectSupportingLines(
  firstStart: FootprintPoint,
  firstEnd: FootprintPoint,
  secondStart: FootprintPoint,
  secondEnd: FootprintPoint,
): FootprintPoint | undefined {
  const firstDirection = subtractPoint(firstEnd, firstStart);
  const secondDirection = subtractPoint(secondEnd, secondStart);
  const denominator = crossProduct(firstDirection, secondDirection);
  if (!Number.isFinite(denominator) || Math.abs(denominator) < 0.000001) {
    return undefined;
  }
  const distance = crossProduct(
    subtractPoint(secondStart, firstStart),
    secondDirection,
  ) / denominator;
  const x = firstStart[0] + firstDirection[0] * distance;
  const y = firstStart[1] + firstDirection[1] * distance;
  return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : undefined;
}

function integerChoices(value: number): readonly number[] {
  return [...new Set([Math.floor(value), Math.ceil(value)])];
}

/**
 * Move one complete footprint side as a supporting line.
 *
 * The neighboring sides stay on their current supporting lines, so both selected endpoints
 * update together and the selected side stays parallel to itself. Integer persistence is chosen
 * jointly across both intersections; endpoints are never clamped independently.
 */
export function predrawnMoveHighlightFootprintWithEdgeNudge(
  footprint: PredrawnMoveHighlightFootprint,
  edge: FootprintEdgeIndex,
  dx: number,
  dy: number,
): PredrawnMoveHighlightFootprint | undefined {
  if (
    !Number.isFinite(dx)
    || !Number.isFinite(dy)
    || (dx === 0 && dy === 0)
    || (dx !== 0 && dy !== 0)
  ) return undefined;

  const firstHandle = edge;
  const secondHandle = ((edge + 1) % 4) as FootprintHandleIndex;
  const previousHandle = ((edge + 3) % 4) as FootprintHandleIndex;
  const nextHandle = ((edge + 2) % 4) as FootprintHandleIndex;
  const previous = footprintPoint(footprint, previousHandle);
  const first = footprintPoint(footprint, firstHandle);
  const second = footprintPoint(footprint, secondHandle);
  const next = footprintPoint(footprint, nextHandle);
  const shiftedFirst: FootprintPoint = [first[0] + dx, first[1] + dy];
  const shiftedSecond: FootprintPoint = [second[0] + dx, second[1] + dy];
  const firstIntersection = intersectSupportingLines(
    previous,
    first,
    shiftedFirst,
    shiftedSecond,
  );
  const secondIntersection = intersectSupportingLines(
    shiftedFirst,
    shiftedSecond,
    second,
    next,
  );
  if (!firstIntersection || !secondIntersection) return undefined;
  const originalEdgeDirection = subtractPoint(second, first);

  let best:
    | Readonly<{
        footprint: PredrawnMoveHighlightFootprint;
        parallelError: number;
        error: number;
        progress: number;
        key: string;
      }>
    | undefined;
  for (const firstX of integerChoices(firstIntersection[0])) {
    for (const firstY of integerChoices(firstIntersection[1])) {
      for (const secondX of integerChoices(secondIntersection[0])) {
        for (const secondY of integerChoices(secondIntersection[1])) {
          const candidate = [...footprint];
          candidate[firstHandle * 2] = firstX;
          candidate[firstHandle * 2 + 1] = firstY;
          candidate[secondHandle * 2] = secondX;
          candidate[secondHandle * 2 + 1] = secondY;
          const normalized = normalizePredrawnMoveHighlightFootprint(candidate);
          if (!normalized) continue;
          const error = (
            (firstX - firstIntersection[0]) ** 2
            + (firstY - firstIntersection[1]) ** 2
            + (secondX - secondIntersection[0]) ** 2
            + (secondY - secondIntersection[1]) ** 2
          );
          const progress = dx !== 0
            ? Math.sign(dx) * (((firstX - first[0]) + (secondX - second[0])) / 2)
            : Math.sign(dy) * (((firstY - first[1]) + (secondY - second[1])) / 2);
          if (progress <= 0) continue;
          const candidateEdgeDirection: FootprintPoint = [
            secondX - firstX,
            secondY - firstY,
          ];
          const parallelError = Math.abs(crossProduct(
            candidateEdgeDirection,
            originalEdgeDirection,
          ));
          const key = normalized.join(',');
          if (
            !best
            || parallelError < best.parallelError
            || (parallelError === best.parallelError && error < best.error)
            || (
              parallelError === best.parallelError
              && error === best.error
              && progress > best.progress
            )
            || (
              parallelError === best.parallelError
              && error === best.error
              && progress === best.progress
              && key < best.key
            )
          ) {
            best = { footprint: normalized, parallelError, error, progress, key };
          }
        }
      }
    }
  }
  if (
    !best
    || predrawnMoveHighlightCellsMatch(
      { footprint: best.footprint },
      { footprint },
    )
  ) return undefined;
  return best.footprint;
}

function footprintPointsAttribute(footprint: PredrawnMoveHighlightFootprint): string {
  return [0, 1, 2, 3]
    .map((index) => `${footprint[index * 2]},${footprint[index * 2 + 1]}`)
    .join(' ');
}

export function footprintEdgeButtonStyle(
  footprint: PredrawnMoveHighlightFootprint,
  edge: FootprintEdgeIndex,
): CSSProperties {
  const [firstHandle, secondHandle] = FOOTPRINT_EDGE_HANDLES[edge];
  const firstX = footprint[firstHandle * 2];
  const firstY = footprint[firstHandle * 2 + 1];
  const secondX = footprint[secondHandle * 2];
  const secondY = footprint[secondHandle * 2 + 1];
  const deltaX = secondX - firstX;
  const deltaY = secondY - firstY;
  const projectedDeltaX = deltaX * TILE_TOP_WIDTH;
  const projectedDeltaY = deltaY * TILE_TOP_HEIGHT;
  return {
    left: `${(firstX + secondX) / 200}%`,
    top: `${(firstY + secondY) / 200}%`,
    width: `${Math.hypot(projectedDeltaX, projectedDeltaY) / TILE_TOP_WIDTH / 100}%`,
    transform: `translate(-50%, -50%) rotate(${Math.atan2(projectedDeltaY, projectedDeltaX) * 180 / Math.PI}deg)`,
  };
}

function clampEditorZoom(value: number, minimum: number): number {
  return Math.min(
    MAXIMUM_EDITOR_ZOOM,
    Math.max(minimum, Number(value.toFixed(2))),
  );
}

function centeredPlayableCellIndex(
  cells: readonly { x: number; y: number }[],
  board: EditorBoard,
): number {
  const centerX = Math.max(0, Math.floor((board.cols - 1) / 2));
  const centerY = Math.max(0, Math.floor((board.rows - 1) / 2));
  const index = cells.findIndex((cell) => cell.x === centerX && cell.y === centerY);
  return Math.max(0, index);
}

/**
 * Viewport-level post-warp editor for each cell's visual highlight footprint.
 *
 * Cyan is the high-contrast authoring sample. The sparse four-corner profiles clip every
 * square-local highlight, while the full canonical diamond remains the hit target and logical
 * movement, addressing, selection, and board geometry never change.
 */
export function PredrawnMoveHighlightEditor({
  artifact,
  board,
  initialCells,
  saving,
  error,
  onSave,
  onClose,
}: {
  artifact: PredrawnBoardArtifact;
  board: EditorBoard;
  initialCells: PredrawnMoveHighlightCells;
  saving: boolean;
  error?: string;
  onSave: (cells: PredrawnMoveHighlightCells) => void;
  onClose: () => void;
}): ReactElement {
  const workspaceRef = useRef<HTMLElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const savingRef = useRef(saving);
  const onCloseRef = useRef(onClose);
  const shapeRef = useRef<HTMLDivElement>(null);
  const cellsRef = useRef<PredrawnMoveHighlightCells>(
    normalizePredrawnMoveHighlightCellsForEditor(initialCells),
  );
  const historyRef = useRef<PredrawnMoveHighlightHistory>(
    emptyPredrawnMoveHighlightHistory(),
  );
  const openingCellsRef = useRef<PredrawnMoveHighlightCells>(
    clonePredrawnMoveHighlightCells(cellsRef.current),
  );
  const dragRef = useRef<{
    pointerId: number;
    cellKey: string;
    handle: FootprintHandleIndex;
    before: PredrawnMoveHighlightCells;
    originX: number;
    originY: number;
    constraint: PredrawnMoveHighlightAxisConstraint;
  } | null>(null);
  const [cells, setCells] = useState<PredrawnMoveHighlightCells>(cellsRef.current);
  const [history, setHistory] = useState<PredrawnMoveHighlightHistory>(
    historyRef.current,
  );
  const [selectedCellIndex, setSelectedCellIndex] = useState(0);
  const [selectedCellKeys, setSelectedCellKeys] = useState<string[]>([]);
  const [activeTarget, setActiveTarget] = useState<PredrawnMoveHighlightEditTarget | null>(null);
  const [axisConstraint, setAxisConstraint] = useState<PredrawnMoveHighlightAxisConstraint>('free');
  const [paintedLayers, setPaintedLayers] = useState(0);
  const [paintError, setPaintError] = useState<string>();
  const [viewZoom, setViewZoom] = useState(0.55);
  const [viewMinimumZoom, setViewMinimumZoom] = useState(0.55);
  const [viewPan, setViewPan] = useState({ x: 0, y: 0 });
  savingRef.current = saving;
  onCloseRef.current = onClose;

  const playableCells = useMemo(
    () => Object.keys(board.cells)
      .map((key) => {
        const match = /^(\d+),(\d+)$/.exec(key);
        if (!match) return undefined;
        const x = Number(match[1]);
        const y = Number(match[2]);
        return x < board.cols && y < board.rows ? { x, y, key } : undefined;
      })
      .filter((cell): cell is { x: number; y: number; key: string } => Boolean(cell))
      .sort((left, right) => left.y - right.y || left.x - right.x),
    [board.cells, board.cols, board.rows],
  );
  const initialCellsSignature = useMemo(
    () => JSON.stringify(normalizePredrawnMoveHighlightCellsForEditor(initialCells)),
    [initialCells],
  );
  const playableCellsSignature = useMemo(
    () => playableCells.map((cell) => cell.key).join('|'),
    [playableCells],
  );
  const openingSelectedCellIndex = useMemo(
    () => centeredPlayableCellIndex(playableCells, board),
    [board.cols, board.rows, playableCells, playableCellsSignature],
  );
  const previewBoard = useMemo<EditorBoard>(() => ({
    ...board,
    backgroundMode: 'ai',
    surface: artifact.surface,
  }), [artifact.surface, board]);
  const reviewGridRegistration = useMemo(
    () => predrawnDirectRegistrationForBackground(artifact.backgroundVersion),
    [artifact.backgroundVersion],
  );
  const coverPolygon = useMemo(
    () => predrawnBoardCoverPolygon(
      runtimePredrawnBoardPlate(artifact.surface),
      playableCells,
    ),
    [artifact.surface, playableCells],
  );

  const selectedCellKeySet = useMemo(
    () => new Set(selectedCellKeys),
    [selectedCellKeys],
  );
  const selectedCell = playableCells[selectedCellIndex];
  const selectedCellKey = selectedCell && selectedCellKeySet.has(selectedCell.key)
    ? selectedCell.key
    : selectedCellKeys[0];
  const selectedFootprint = selectedCellKey
    ? cells[selectedCellKey] ?? FULL_CELL_MOVE_HIGHLIGHT_FOOTPRINT
    : FULL_CELL_MOVE_HIGHLIGHT_FOOTPRINT;
  const activeBoundaryBar = useMemo(
    () => activeTarget?.kind === 'edge' && activeTarget.anchorCellKey
      ? predrawnMoveHighlightBoundaryBar(
          selectedCellKeys,
          activeTarget.anchorCellKey,
          activeTarget.edge,
        )
      : [],
    [activeTarget, selectedCellKeys],
  );
  const modifiedCount = Object.keys(cells).length;
  const selectedCustomCount = selectedCellKeys.filter((key) => key in cells).length;
  const dirty = !predrawnMoveHighlightCellsMatch(cells, openingCellsRef.current);
  const activeTargetName = activeTarget === null
    ? null
    : activeTarget.kind === 'point'
      ? `${FOOTPRINT_HANDLE_NAMES[activeTarget.handle]} point`
      : `${activeBoundaryBar.length}-tile ${FOOTPRINT_EDGE_NAMES[activeTarget.edge]} border`;
  const nudgeDisabled = activeTarget === null
    || saving
    || (activeTarget.kind === 'point'
      ? !activeTarget.cellKey || !selectedCellKeySet.has(activeTarget.cellKey)
      : !activeBoundaryBar.length);

  const replaceCells = useCallback((next: PredrawnMoveHighlightCells): void => {
    const normalized = normalizePredrawnMoveHighlightCellsForEditor(next);
    cellsRef.current = normalized;
    setCells(normalized);
  }, []);

  const replaceHistory = useCallback((next: PredrawnMoveHighlightHistory): void => {
    historyRef.current = next;
    setHistory(next);
  }, []);

  const recordEdit = useCallback((
    before: PredrawnMoveHighlightCells,
    after = cellsRef.current,
  ): boolean => {
    const next = recordPredrawnMoveHighlightHistory(historyRef.current, before, after);
    if (next === historyRef.current) return false;
    replaceHistory(next);
    return true;
  }, [replaceHistory]);

  const commitCells = useCallback((next: PredrawnMoveHighlightCells): boolean => {
    const before = cellsRef.current;
    const normalized = normalizePredrawnMoveHighlightCellsForEditor(next);
    if (predrawnMoveHighlightCellsMatch(before, normalized)) return false;
    replaceCells(normalized);
    recordEdit(before, normalized);
    return true;
  }, [recordEdit, replaceCells]);

  const applyHistory = useCallback((direction: 'undo' | 'redo'): void => {
    const stepped = stepPredrawnMoveHighlightHistory(
      historyRef.current,
      cellsRef.current,
      direction,
    );
    if (!stepped) return;
    replaceHistory(stepped.history);
    replaceCells(stepped.target);
  }, [replaceCells, replaceHistory]);

  useEffect(() => {
    const next = normalizePredrawnMoveHighlightCellsForEditor(
      JSON.parse(initialCellsSignature) as PredrawnMoveHighlightCells,
    );
    openingCellsRef.current = clonePredrawnMoveHighlightCells(next);
    replaceCells(next);
    replaceHistory(emptyPredrawnMoveHighlightHistory());
    setSelectedCellIndex(openingSelectedCellIndex);
    setSelectedCellKeys(
      playableCells[openingSelectedCellIndex]
        ? [playableCells[openingSelectedCellIndex].key]
        : [],
    );
    setActiveTarget(null);
    setAxisConstraint('free');
    setPaintedLayers(0);
    setPaintError(undefined);
  }, [
    artifact.id,
    initialCellsSignature,
    openingSelectedCellIndex,
    playableCells,
    replaceCells,
    replaceHistory,
  ]);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const workspace = workspaceRef.current;
    const portalRoot = scrimRef.current;
    const backgroundElements = portalRoot
      ? Array.from(document.body.children)
        .filter((element): element is HTMLElement => (
          element instanceof HTMLElement && element !== portalRoot
        ))
        .map((element) => ({
          element,
          wasInert: element.hasAttribute('inert'),
        }))
      : [];
    for (const { element } of backgroundElements) {
      element.setAttribute('inert', '');
    }
    workspace?.focus();
    const onWindowKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') {
        if (savingRef.current) return;
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (
        event.key !== 'Tab'
        || !workspace
        || event.defaultPrevented
        || event.ctrlKey
        || event.metaKey
        || event.altKey
      ) return;
      const focusable = Array.from(
        workspace.querySelectorAll<HTMLElement>(MOVE_HIGHLIGHT_EDITOR_FOCUSABLE_SELECTOR),
      ).filter((element) => element.getClientRects().length > 0);
      if (!focusable.length) {
        event.preventDefault();
        workspace.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeElement = document.activeElement;
      const focusIsOutside = !activeElement || !workspace.contains(activeElement);
      if (event.shiftKey && (
        activeElement === first
        || activeElement === workspace
        || focusIsOutside
      )) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (
        activeElement === last
        || activeElement === workspace
        || focusIsOutside
      )) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onWindowKeyDown);
    return () => {
      window.removeEventListener('keydown', onWindowKeyDown);
      for (const { element, wasInert } of backgroundElements) {
        if (!wasInert) element.removeAttribute('inert');
      }
      previousFocus?.focus?.();
    };
  }, []);

  const updateHandle = useCallback((
    cellKey: string,
    handle: FootprintHandleIndex,
    x: number,
    y: number,
  ): boolean => {
    const current = cellsRef.current[cellKey] ?? FULL_CELL_MOVE_HIGHLIGHT_FOOTPRINT;
    const nextFootprint = predrawnMoveHighlightFootprintWithHandle(
      current,
      handle,
      x,
      y,
    );
    if (!nextFootprint) return false;
    const next = predrawnMoveHighlightCellsWithFootprint(
      cellsRef.current,
      cellKey,
      nextFootprint,
    );
    if (predrawnMoveHighlightCellsMatch(next, cellsRef.current)) return false;
    replaceCells(next);
    return true;
  }, [replaceCells]);

  const beginHandleDrag = (
    event: PointerEvent<HTMLButtonElement>,
    handle: FootprintHandleIndex,
  ): void => {
    if (event.button !== 0 || saving || !selectedCellKey) return;
    const current = cellsRef.current[selectedCellKey] ?? FULL_CELL_MOVE_HIGHLIGHT_FOOTPRINT;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setActiveTarget({ kind: 'point', handle, cellKey: selectedCellKey });
    dragRef.current = {
      pointerId: event.pointerId,
      cellKey: selectedCellKey,
      handle,
      before: clonePredrawnMoveHighlightCells(cellsRef.current),
      originX: current[handle * 2],
      originY: current[handle * 2 + 1],
      constraint: axisConstraint,
    };
  };

  const moveHandleDrag = (event: PointerEvent<HTMLButtonElement>): void => {
    const drag = dragRef.current;
    const shape = shapeRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !shape) return;
    event.preventDefault();
    event.stopPropagation();
    const bounds = shape.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;
    const [nextX, nextY] = constrainPredrawnMoveHighlightDragPoint(
      drag.originX,
      drag.originY,
      ((event.clientX - bounds.left) / bounds.width) * 10000,
      ((event.clientY - bounds.top) / bounds.height) * 10000,
      drag.constraint,
    );
    updateHandle(
      drag.cellKey,
      drag.handle,
      nextX,
      nextY,
    );
  };

  const endHandleDrag = (event: PointerEvent<HTMLButtonElement>): void => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    recordEdit(drag.before);
  };

  const cancelHandleDrag = (event: PointerEvent<HTMLButtonElement>): void => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    replaceCells(drag.before);
  };

  const nudgeActiveTarget = useCallback((dx: number, dy: number): void => {
    if (activeTarget === null || saving) return;
    const before = cellsRef.current;
    const next = activeTarget.kind === 'edge'
      ? predrawnMoveHighlightCellsAfterBoundaryNudge({
          cells: before,
          cellKeys: activeBoundaryBar,
          edge: activeTarget.edge,
          dx,
          dy,
          axisConstraint,
        })
      : activeTarget.cellKey && selectedCellKeySet.has(activeTarget.cellKey)
        ? predrawnMoveHighlightCellsAfterNudge({
            cells: before,
            cellKey: activeTarget.cellKey,
            target: activeTarget,
            dx,
            dy,
            axisConstraint,
          })
        : undefined;
    if (!next) return;
    replaceCells(next);
    recordEdit(before, next);
  }, [
    activeBoundaryBar,
    activeTarget,
    axisConstraint,
    recordEdit,
    replaceCells,
    saving,
    selectedCellKeySet,
  ]);

  const nudgeActiveTargetByPixels = useCallback((dx: number, dy: number): void => {
    const delta = activeTarget?.kind === 'edge'
      ? predrawnMoveHighlightNativePixelVector(artifact.surface, dx, dy)
      : predrawnMoveHighlightNativePixelDelta(artifact.surface, dx, dy);
    nudgeActiveTarget(delta.x, delta.y);
  }, [
    activeTarget?.kind,
    artifact.surface.frameHeight,
    artifact.surface.frameWidth,
    artifact.surface.worldBounds.height,
    artifact.surface.worldBounds.width,
    nudgeActiveTarget,
  ]);

  const handleEditorKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    const accelerator = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    if (accelerator && key === 'z') {
      event.preventDefault();
      applyHistory(event.shiftKey ? 'redo' : 'undo');
      return;
    }
    if (accelerator && key === 'y') {
      event.preventDefault();
      applyHistory('redo');
      return;
    }
    if (activeTarget === null || saving) return;
    const step = event.shiftKey ? HANDLE_LARGE_NUDGE_PIXELS : 1;
    const delta = event.key === 'ArrowLeft' ? [-step, 0]
      : event.key === 'ArrowRight' ? [step, 0]
        : event.key === 'ArrowUp' ? [0, -step]
          : event.key === 'ArrowDown' ? [0, step]
            : undefined;
    if (!delta) return;
    event.preventDefault();
    nudgeActiveTargetByPixels(delta[0], delta[1]);
  };

  const selectCell = (index: number, additive = false): void => {
    if (index < 0 || index >= playableCells.length) return;
    const cellKey = playableCells[index].key;
    const nextSelection = predrawnMoveHighlightSelectionAfterClick(
      selectedCellKeys,
      cellKey,
      additive,
    );
    setSelectedCellKeys([...nextSelection]);
    if (nextSelection.includes(cellKey)) {
      setSelectedCellIndex(index);
    } else {
      const nextPrimaryIndex = playableCells.findIndex(
        (cell) => cell.key === nextSelection[nextSelection.length - 1],
      );
      setSelectedCellIndex(Math.max(0, nextPrimaryIndex));
    }
    setActiveTarget(null);
  };

  const resetSelectedCells = (): void => {
    if (!selectedCustomCount || saving) return;
    const next = { ...cellsRef.current };
    for (const cellKey of selectedCellKeys) delete next[cellKey];
    commitCells(next);
  };

  const resetAllCells = (): void => {
    if (!Object.keys(cellsRef.current).length || saving) return;
    commitCells({});
  };

  const fitView = (): void => {
    setViewZoom(viewMinimumZoom);
    setViewPan({ x: 0, y: 0 });
  };

  const changeZoom = (delta: number): void => {
    setViewZoom((current) => clampEditorZoom(current + delta, viewMinimumZoom));
  };

  const acknowledgeTerrain = useCallback(() => setPaintedLayers((value) => value | 1), []);
  const acknowledgeScene = useCallback(() => setPaintedLayers((value) => value | 2), []);
  const failPaint = useCallback((cause: unknown) => {
    setPaintError(cause instanceof Error
      ? cause.message
      : 'The visual-footprint editor could not paint the live board.');
  }, []);

  return createPortal(
    <div
      ref={scrimRef}
      className="confirm-scrim predrawn-move-highlight-editor-scrim chrome-family-surface"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <section
        ref={workspaceRef}
        className="confirm-panel predrawn-move-highlight-editor-panel le-predrawn-workspace-inspector le-predrawn-move-highlight-editor"
        data-testid="predrawn-move-highlight-editor"
        data-artifact-id={artifact.id}
        data-painted-layers={paintedLayers}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="predrawn-move-highlight-editor-title"
        onKeyDown={handleEditorKeyDown}
      >
      <header className="le-predrawn-workspace-inspector-head">
        <div>
          <span className="skirmish-eyebrow">Board Art Pipeline · Tile highlight calibration</span>
          <h2 id="predrawn-move-highlight-editor-title">Fit tile highlights to painted cells</h2>
          <p>
            Cyan is the high-contrast preview. These four-corner shapes clip every square-local
            visual highlight. Gameplay cells, hit targets, and selection logic stay unchanged.
          </p>
        </div>
        <ChromeButton unit="inner-text-button"
          className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
          disabled={saving}
          onClick={onClose}
        >Close</ChromeButton>
      </header>

      <div className="le-predrawn-workspace-inspector-toolbar le-predrawn-move-highlight-toolbar">
        <div
          className="le-predrawn-move-highlight-cell-nav"
          role="group"
          aria-label="Selected gameplay tiles"
        >
          <ChromeButton unit="inner-text-button"
            data-testid="predrawn-move-highlight-previous-cell"
            className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
            disabled={selectedCellIndex <= 0}
            onClick={() => selectCell(selectedCellIndex - 1)}
            title="Replace the selection with the previous gameplay tile."
          >Previous tile</ChromeButton>
          <output aria-live="polite">
            {selectedCell && selectedCellKey
              ? selectedCellKeys.length > 1
                ? `${selectedCellKeys.length} tiles selected · primary ${selectedCell.x},${selectedCell.y}`
                : `Tile ${selectedCell.x},${selectedCell.y} · ${selectedCellIndex + 1} / ${playableCells.length}`
              : 'No gameplay tiles'}
          </output>
          <ChromeButton unit="inner-text-button"
            data-testid="predrawn-move-highlight-next-cell"
            className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
            disabled={selectedCellIndex >= playableCells.length - 1}
            onClick={() => selectCell(selectedCellIndex + 1)}
            title="Replace the selection with the next gameplay tile."
          >Next tile</ChromeButton>
        </div>

        <div
          className="le-predrawn-move-highlight-history"
          role="group"
          aria-label="Visual footprint edit history"
        >
          <ChromeButton unit="inner-text-button"
            data-testid="predrawn-move-highlight-undo"
            className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
            disabled={!history.undo.length || saving}
            onClick={() => applyHistory('undo')}
            title={history.undo.length ? 'Undo the last visual-footprint change.' : 'Nothing to undo.'}
          >Undo</ChromeButton>
          <ChromeButton unit="inner-text-button"
            data-testid="predrawn-move-highlight-redo"
            className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
            disabled={!history.redo.length || saving}
            onClick={() => applyHistory('redo')}
            title={history.redo.length ? 'Redo the last undone visual-footprint change.' : 'Nothing to redo.'}
          >Redo</ChromeButton>
        </div>

        <div
          className="le-predrawn-workspace-inspector-zoom"
          role="group"
          aria-label="Visual footprint editor zoom"
        >
          <ChromeButton unit="inner-text-button"
            data-testid="predrawn-move-highlight-fit"
            className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
            onClick={fitView}
          >Fit artwork</ChromeButton>
          <ChromeButton unit="inner-text-button"
            className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
            aria-label="Zoom out"
            disabled={viewZoom <= viewMinimumZoom}
            onClick={() => changeZoom(-EDITOR_ZOOM_STEP)}
          >−</ChromeButton>
          <output aria-label="Current visual footprint editor zoom">
            {Math.round(viewZoom * 100)}%
          </output>
          <ChromeButton unit="inner-text-button"
            className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
            aria-label="Zoom in"
            disabled={viewZoom >= MAXIMUM_EDITOR_ZOOM}
            onClick={() => changeZoom(EDITOR_ZOOM_STEP)}
          >+</ChromeButton>
        </div>
      </div>

      <div className="le-predrawn-move-highlight-precision-toolbar">
        <div
          className="le-predrawn-move-highlight-axis-controls"
          role="group"
          aria-label="Cyan point or whole-edge movement axis"
        >
          <span>Move axis</span>
          {([
            ['free', 'Free'],
            ['x', 'X only'],
            ['y', 'Y only'],
          ] as const).map(([constraint, label]) => (
            <ChromeButton unit="inner-text-button"
              key={constraint}
              data-testid={`predrawn-move-highlight-axis-${constraint}`}
              className={chromeUnitClassNames(
                'inner-text-button',
                'le-seg-btn',
                axisConstraint === constraint && 'active',
              )}
              aria-pressed={axisConstraint === constraint}
              disabled={saving}
              onClick={() => setAxisConstraint(constraint)}
              title={constraint === 'free'
                ? 'Move a point freely, or shift a selected outer border along either artwork-image axis.'
                : constraint === 'x'
                  ? 'Move a point horizontally with its Y fixed, or shift a selected outer border along artwork X.'
                  : 'Move a point vertically with its X fixed, or shift a selected outer border along artwork Y.'}
            >{label}</ChromeButton>
          ))}
        </div>

        <div
          className="le-predrawn-move-highlight-nudge-controls"
          role="group"
          aria-label="Nudge selected visual-footprint point or outer border by one artwork pixel"
        >
          <output aria-live="polite">
            {activeTargetName
              ? `Nudge ${activeTargetName} · 1 art px`
              : 'Select a point or outer border to nudge · 1 art px'}
          </output>
          <ChromeButton unit="inner-text-button"
            data-testid="predrawn-move-highlight-nudge-left"
            className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
            aria-label="Nudge selected visual-footprint point or outer border left by one artwork pixel"
            disabled={nudgeDisabled || axisConstraint === 'y'}
            onClick={() => nudgeActiveTargetByPixels(-1, 0)}
            title="Move the selected point or complete outer border left by one native artwork pixel."
          ><DirectionArrowIcon degrees={270} /></ChromeButton>
          <ChromeButton unit="inner-text-button"
            data-testid="predrawn-move-highlight-nudge-up"
            className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
            aria-label="Nudge selected visual-footprint point or outer border up by one artwork pixel"
            disabled={nudgeDisabled || axisConstraint === 'x'}
            onClick={() => nudgeActiveTargetByPixels(0, -1)}
            title="Move the selected point or complete outer border up by one native artwork pixel."
          ><DirectionArrowIcon degrees={0} /></ChromeButton>
          <ChromeButton unit="inner-text-button"
            data-testid="predrawn-move-highlight-nudge-down"
            className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
            aria-label="Nudge selected visual-footprint point or outer border down by one artwork pixel"
            disabled={nudgeDisabled || axisConstraint === 'x'}
            onClick={() => nudgeActiveTargetByPixels(0, 1)}
            title="Move the selected point or complete outer border down by one native artwork pixel."
          ><DirectionArrowIcon degrees={180} /></ChromeButton>
          <ChromeButton unit="inner-text-button"
            data-testid="predrawn-move-highlight-nudge-right"
            className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
            aria-label="Nudge selected visual-footprint point or outer border right by one artwork pixel"
            disabled={nudgeDisabled || axisConstraint === 'y'}
            onClick={() => nudgeActiveTargetByPixels(1, 0)}
            title="Move the selected point or complete outer border right by one native artwork pixel."
          ><DirectionArrowIcon degrees={90} /></ChromeButton>
        </div>
      </div>

      <div className="le-predrawn-workspace-inspector-viewport">
        <ViewPane
          kind="board"
          ariaLabel={`${artifact.title} tile-highlight footprint editor`}
          zoom={viewZoom}
          pan={viewPan}
          minZoom={MINIMUM_EDITOR_ZOOM}
          maxZoom={MAXIMUM_EDITOR_ZOOM}
          onZoomChange={setViewZoom}
          onPanChange={setViewPan}
          coverPolygon={coverPolygon}
          onMinimumZoomChange={setViewMinimumZoom}
        >
          <StudioReadOnlyBoard
            key={artifact.id}
            board={previewBoard}
            boardZoom={viewZoom}
            boardPan={viewPan}
            hidden={{ tile: false, unit: true, doodad: false }}
            ariaLabel={`Live visual-footprint calibration for ${artifact.title}`}
            showGrid
            reviewGridRegistration={reviewGridRegistration}
            renderCellOverlay={(cell) => {
              const key = cell.key;
              const index = playableCells.findIndex((candidate) => candidate.key === key);
              const selected = selectedCellKeySet.has(key);
              const primary = key === selectedCellKey;
              const storedFootprint = cells[key];
              const footprint = storedFootprint ?? FULL_CELL_MOVE_HIGHLIGHT_FOOTPRINT;
              const polygon = footprintPointsAttribute(footprint);
              const clipPath = predrawnMoveHighlightClipPath(footprint);
              return (
                <div
                  className={`predrawn-move-highlight-cell${selected ? ' is-selected' : ''}${primary ? ' is-primary' : ''}${selected && selectedCellKeys.length > 1 ? ' is-multi-selected' : ''}${storedFootprint ? ' is-custom' : ''}`}
                  data-highlight-cell={key}
                >
                  <button
                    type="button"
                    className={`skirmish-board-cell-hit${selected ? ' is-move' : ''}`}
                    style={{
                      [PREDRAWN_VISUAL_FOOTPRINT_CLIP_CSS_PROPERTY]: clipPath,
                    } as CSSProperties}
                    aria-label={`Select visual-footprint tile ${cell.x}, ${cell.y}. Shift click adds or removes this tile.`}
                    aria-pressed={selected}
                    title="Click to select only this tile. Shift+click adds or removes it from the selection. Its full diamond remains clickable."
                    onPointerDown={(event) => {
                      if (event.button === 0) event.stopPropagation();
                    }}
                    onClick={(event) => selectCell(index, event.shiftKey)}
                  >
                    <PredrawnMoveHighlightPaint />
                  </button>
                  {selected || storedFootprint ? (
                    <div
                      ref={primary ? shapeRef : undefined}
                      className="predrawn-move-highlight-shape"
                      aria-hidden="true"
                    >
                      <svg viewBox="0 0 10000 10000" preserveAspectRatio="none">
                        <polygon points={polygon} />
                      </svg>
                    </div>
                  ) : null}
                  {selected ? FOOTPRINT_EDGE_NAMES.map((name, edgeIndex) => {
                    const typedEdge = edgeIndex as FootprintEdgeIndex;
                    const boundaryBar = predrawnMoveHighlightBoundaryBar(
                      selectedCellKeys,
                      key,
                      typedEdge,
                    );
                    if (!boundaryBar.length) return null;
                    const active = activeTarget?.kind === 'edge'
                      && activeTarget.edge === typedEdge
                      && activeBoundaryBar.includes(key);
                    return (
                      <button
                        type="button"
                        key={name}
                        className={`predrawn-move-highlight-edge${active ? ' is-active' : ''}`}
                        data-testid={`predrawn-move-highlight-${name}-edge-${key}`}
                        data-boundary-edge={name}
                        data-boundary-cell={key}
                        style={footprintEdgeButtonStyle(footprint, typedEdge)}
                        aria-label={`Select the ${boundaryBar.length}-tile ${name} outer highlight border containing tile ${cell.x}, ${cell.y}`}
                        aria-pressed={active}
                        title={`Select this complete ${boundaryBar.length}-tile outer border. Pixel nudges move every segment together.`}
                        tabIndex={boundaryBar[0] === key ? 0 : -1}
                        disabled={saving}
                        onPointerDown={(event) => {
                          if (event.button === 0) event.stopPropagation();
                        }}
                        onFocus={() => setActiveTarget({
                          kind: 'edge',
                          edge: typedEdge,
                          anchorCellKey: key,
                        })}
                        onClick={() => setActiveTarget({
                          kind: 'edge',
                          edge: typedEdge,
                          anchorCellKey: key,
                        })}
                      />
                    );
                  }) : null}
                  {primary ? FOOTPRINT_HANDLE_NAMES.map((name, handleIndex) => {
                    const typedHandle = handleIndex as FootprintHandleIndex;
                    const x = selectedFootprint[typedHandle * 2];
                    const y = selectedFootprint[typedHandle * 2 + 1];
                    const active = activeTarget?.kind === 'point'
                      && activeTarget.handle === typedHandle
                      && activeTarget.cellKey === key;
                    return (
                      <button
                        type="button"
                        key={name}
                        className={`predrawn-move-highlight-handle${active ? ' is-active' : ''}`}
                        data-testid={`predrawn-move-highlight-${name}-handle`}
                        style={{ left: `${x / 100}%`, top: `${y / 100}%` }}
                        aria-label={`Adjust the ${name} screen corner of visual-footprint cell ${cell.x}, ${cell.y}`}
                        title={`Drag the ${name} screen corner using the selected image-axis mode. Arrow keys nudge one artwork pixel; Shift+Arrow nudges ten.`}
                        disabled={saving}
                        onFocus={() => setActiveTarget({
                          kind: 'point',
                          handle: typedHandle,
                          cellKey: key,
                        })}
                        onPointerDown={(event) => beginHandleDrag(event, typedHandle)}
                        onPointerMove={moveHandleDrag}
                        onPointerUp={endHandleDrag}
                        onPointerCancel={cancelHandleDrag}
                      />
                    );
                  }) : null}
                </div>
              );
            }}
            onTerrainFirstFrame={acknowledgeTerrain}
            onSceneFirstFrame={acknowledgeScene}
            onFrameError={failPaint}
          />
        </ViewPane>
        {paintError ? (
          <span className="le-predrawn-workspace-inspector-paint-status is-error" role="alert">
            Editor failed · {paintError}
          </span>
        ) : paintedLayers !== 3 ? (
          <span className="le-predrawn-workspace-inspector-paint-status" role="status">
            Painting tile-highlight editor…
          </span>
        ) : null}
      </div>

      <footer className="le-predrawn-workspace-inspector-footer">
        <div className="le-predrawn-workspace-inspector-guidance">
          <strong>
            {modifiedCount
              ? `${modifiedCount} custom cell${modifiedCount === 1 ? '' : 's'}`
              : 'Every cell currently uses its full diamond'}
          </strong>
          <span>
            Click a tile to select it; Shift+click adds or removes tiles. Select a point on the
            primary tile to adjust one corner, or select an exposed outer edge to move that whole
            contiguous border. Choose an image axis and use the arrows for one-pixel nudges.
            Right-drag pans; the mouse wheel zooms. Ctrl/Cmd+Z undoes and Ctrl/Cmd+Y redoes.
          </span>
          {error ? (
            <small className="le-predrawn-workspace-inspector-error" role="alert">{error}</small>
          ) : null}
        </div>
        <div className="le-predrawn-move-highlight-footer-actions">
          <ChromeButton unit="inner-text-button"
            data-testid="predrawn-move-highlight-reset-cell"
            className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
            disabled={!selectedCustomCount || saving}
            onClick={resetSelectedCells}
            title="Restore every selected tile to the complete canonical diamond as one undoable edit."
          >{selectedCellKeys.length > 1 ? 'Reset selected' : 'Reset tile'}</ChromeButton>
          <ChromeButton unit="inner-text-button"
            data-testid="predrawn-move-highlight-reset-all"
            className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
            disabled={!modifiedCount || saving}
            onClick={resetAllCells}
            title="Restore every visual footprint to the complete canonical diamond."
          >Reset all</ChromeButton>
          <ChromeButton unit="inner-text-button"
            data-testid="predrawn-move-highlight-save"
            className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', 'active')}
            disabled={saving || Boolean(paintError)}
            onClick={() => onSave(clonePredrawnMoveHighlightCells(cellsRef.current))}
            title="Save this sparse visual-footprint calibration for the exact warped board."
          >{saving ? 'Saving footprints…' : dirty ? 'Save highlight footprints' : 'Use these footprints'}</ChromeButton>
        </div>
      </footer>
      </section>
    </div>,
    document.body,
  );
}
