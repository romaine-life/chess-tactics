import { TILE_STEP_X, TILE_STEP_Y } from '../art/projectionContract';
import { boardLabMetrics, projectBoardPoint, unprojectBoardPoint } from '../render/boardProjection';
import { scenicTerrainValueAt } from '../render/decorativeTerrainApron';
import type { EditorBoard } from './boardCode';

export interface ScenicTerrainCoordinate {
  x: number;
  y: number;
}

export interface ScenicTerrainViewport {
  width: number;
  height: number;
}

export interface ScenicTerrainViewportPan {
  x: number;
  y: number;
}

export interface ScenicTerrainViewportTargetOptions {
  cols: number;
  rows: number;
  viewport: ScenicTerrainViewport;
  zoom: number;
  pan: ScenicTerrainViewportPan;
  /** Canonical `x,y` keys already present in the active scenic footprint. */
  activeScenicCellKeys?: Iterable<string>;
  maxTargets?: number;
}

export type ScenicTerrainViewportTargetStatus = 'complete' | 'invalid-input' | 'limit-reached';

export interface ScenicTerrainViewportTargetResult {
  targets: ScenicTerrainCoordinate[];
  status: ScenicTerrainViewportTargetStatus;
  /** True means `targets` is not the complete visible set and must not be reported as such. */
  truncated: boolean;
  limit: number;
}

export type ScenicTerrainViewportGenerationMode =
  | { kind: 'grass'; tileId: string }
  | { kind: 'match-reference' };

export const DEFAULT_SCENIC_TERRAIN_VIEWPORT_TARGET_LIMIT = 10_000;

const INTERSECTION_EPSILON = 1e-9;
const MIN_CANDIDATE_SCAN_LIMIT = 250_000;

const coordinateKey = ({ x, y }: ScenicTerrainCoordinate): string => `${x},${y}`;

const isPlayableCoordinate = (
  coordinate: ScenicTerrainCoordinate,
  cols: number,
  rows: number,
): boolean => coordinate.x >= 0 && coordinate.y >= 0 && coordinate.x < cols && coordinate.y < rows;

const coordinateOrder = (a: ScenicTerrainCoordinate, b: ScenicTerrainCoordinate): number =>
  a.y - b.y || a.x - b.x;

/**
 * The editor camera is anchored to the playable board, not to scenic cells that may be added or
 * removed. For a rectangle, its four corners own every projection extremum, so passing the corners
 * through the canonical board metrics is exactly equivalent to enumerating the whole rectangle.
 */
export function playableBoardOrigin(cols: number, rows: number): { left: number; top: number } | null {
  if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols <= 0 || rows <= 0) return null;
  const metrics = boardLabMetrics([
    { x: 0, y: 0 },
    { x: cols - 1, y: 0 },
    { x: 0, y: rows - 1 },
    { x: cols - 1, y: rows - 1 },
  ]);
  return { left: metrics.originLeft, top: metrics.originTop };
}

const invalidTargetResult = (limit: number): ScenicTerrainViewportTargetResult => ({
  targets: [],
  status: 'invalid-input',
  truncated: false,
  limit,
});

/**
 * Return the unpainted scenic cells whose top diamonds intersect the current centered viewport.
 * This uses the same projection and stable playable-board origin as the renderer. It deliberately
 * tests the diamond against the viewport rectangle instead of filling the inverse-projected
 * bounding box, which would create the off-screen diamond tips this action exists to avoid.
 */
export function scenicTerrainTargetsForViewport(
  options: ScenicTerrainViewportTargetOptions,
): ScenicTerrainViewportTargetResult {
  const {
    cols,
    rows,
    viewport,
    zoom,
    pan,
    activeScenicCellKeys = [],
    maxTargets = DEFAULT_SCENIC_TERRAIN_VIEWPORT_TARGET_LIMIT,
  } = options;
  const origin = playableBoardOrigin(cols, rows);
  const validInput = origin !== null
    && Number.isFinite(viewport.width)
    && viewport.width > 0
    && Number.isFinite(viewport.height)
    && viewport.height > 0
    && Number.isFinite(zoom)
    && zoom > 0
    && Number.isFinite(pan.x)
    && Number.isFinite(pan.y)
    && Number.isInteger(maxTargets)
    && maxTargets > 0;
  if (!validInput || !origin) return invalidTargetResult(maxTargets);

  const halfWidth = viewport.width / 2;
  const halfHeight = viewport.height / 2;
  const seatBounds = {
    minLeft: (-halfWidth - pan.x) / zoom - origin.left - TILE_STEP_X,
    maxLeft: (halfWidth - pan.x) / zoom - origin.left + TILE_STEP_X,
    minTop: (-halfHeight - pan.y) / zoom - origin.top - TILE_STEP_Y,
    maxTop: (halfHeight - pan.y) / zoom - origin.top + TILE_STEP_Y,
  };
  if (Object.values(seatBounds).some((value) => !Number.isFinite(value))) {
    return invalidTargetResult(maxTargets);
  }

  const gridCorners = [
    unprojectBoardPoint({ left: seatBounds.minLeft, top: seatBounds.minTop }),
    unprojectBoardPoint({ left: seatBounds.maxLeft, top: seatBounds.minTop }),
    unprojectBoardPoint({ left: seatBounds.minLeft, top: seatBounds.maxTop }),
    unprojectBoardPoint({ left: seatBounds.maxLeft, top: seatBounds.maxTop }),
  ];
  const minX = Math.ceil(Math.min(...gridCorners.map((point) => point.x)) - INTERSECTION_EPSILON);
  const maxX = Math.floor(Math.max(...gridCorners.map((point) => point.x)) + INTERSECTION_EPSILON);
  const minY = Math.ceil(Math.min(...gridCorners.map((point) => point.y)) - INTERSECTION_EPSILON);
  const maxY = Math.floor(Math.max(...gridCorners.map((point) => point.y)) + INTERSECTION_EPSILON);
  const boundsAreSafe = [minX, maxX, minY, maxY].every(Number.isSafeInteger);
  if (!boundsAreSafe) {
    return { targets: [], status: 'limit-reached', truncated: true, limit: maxTargets };
  }

  const candidateWidth = Math.max(0, maxX - minX + 1);
  const candidateHeight = Math.max(0, maxY - minY + 1);
  const candidateCount = candidateWidth * candidateHeight;
  const candidateScanLimit = Math.max(MIN_CANDIDATE_SCAN_LIMIT, maxTargets * 8);
  if (!Number.isSafeInteger(candidateCount) || candidateCount > candidateScanLimit) {
    return { targets: [], status: 'limit-reached', truncated: true, limit: maxTargets };
  }

  const active = new Set(activeScenicCellKeys);
  const radiusX = TILE_STEP_X * zoom;
  const radiusY = TILE_STEP_Y * zoom;
  const targets: ScenicTerrainCoordinate[] = [];
  let truncated = false;

  candidateRows:
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const coordinate = { x, y };
      if (isPlayableCoordinate(coordinate, cols, rows) || active.has(coordinateKey(coordinate))) continue;

      const projected = projectBoardPoint(coordinate);
      const centerX = pan.x + zoom * (origin.left + projected.left);
      const centerY = pan.y + zoom * (origin.top + projected.top);
      const gapX = Math.max(Math.abs(centerX) - halfWidth, 0);
      const gapY = Math.max(Math.abs(centerY) - halfHeight, 0);
      if (gapX / radiusX + gapY / radiusY > 1 + INTERSECTION_EPSILON) continue;

      if (targets.length === maxTargets) {
        truncated = true;
        break candidateRows;
      }
      targets.push(coordinate);
    }
  }

  targets.sort(coordinateOrder);
  return {
    targets,
    status: truncated ? 'limit-reached' : 'complete',
    truncated,
    limit: maxTargets,
  };
}

const validScenicTarget = (
  coordinate: ScenicTerrainCoordinate,
  cols: number,
  rows: number,
): boolean => Number.isInteger(coordinate.x)
  && Number.isInteger(coordinate.y)
  && Number.isSafeInteger(coordinate.x)
  && Number.isSafeInteger(coordinate.y)
  && !isPlayableCoordinate(coordinate, cols, rows);

/**
 * Materialize viewport targets as explicit decorative terrain without changing any other board
 * content. Existing scenic cells always win. Match-reference uses only the canonical exact
 * clamped boundary projection; a void boundary stays void.
 */
export function fillScenicTerrainViewportTargets(
  board: EditorBoard,
  targets: Iterable<ScenicTerrainCoordinate>,
  mode: ScenicTerrainViewportGenerationMode,
): EditorBoard {
  const next = structuredClone(board) as EditorBoard;
  const orderedTargets = [...targets]
    .filter((coordinate) => validScenicTarget(coordinate, board.cols, board.rows))
    .sort(coordinateOrder);
  const seen = new Set<string>();
  const activeFootprint = new Set(board.decorativeFootprint ?? []);

  for (const coordinate of orderedTargets) {
    const key = coordinateKey(coordinate);
    if (seen.has(key)) continue;
    seen.add(key);
    activeFootprint.add(key);
    if (Object.prototype.hasOwnProperty.call(board.decorativeCells ?? {}, key)) {
      continue;
    }

    const tileId = mode.kind === 'grass'
      ? mode.tileId
      : scenicTerrainValueAt(
          coordinate.x,
          coordinate.y,
          board.cols,
          board.rows,
          (x, y) => board.cells[`${x},${y}`],
          (x, y) => board.decorativeCells?.[`${x},${y}`],
        );
    if (tileId === undefined) continue;
    next.decorativeCells ??= {};
    next.decorativeCells[key] = tileId;
  }

  next.decorativeFootprint = [...activeFootprint].sort((a, b) => {
    const [ax, ay] = a.split(',').map(Number);
    const [bx, by] = b.split(',').map(Number);
    return ay - by || ax - bx;
  });

  return next;
}
