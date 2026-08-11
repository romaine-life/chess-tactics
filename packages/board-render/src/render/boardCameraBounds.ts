import {
  BOARD_PREVIEW_MARGIN_RATIO,
  centeredPlayableBoardFramingBounds,
  type BoardFramingBounds,
} from './boardFraming';
import { TILE_STEP_X, TILE_STEP_Y } from '../art/projectionContract';

export type BoardCameraBounds = BoardFramingBounds;
export type BoardCameraSnapMode = 'balanced' | 'proportional' | 'fixed';

/** Default scenic breathing room beyond the projected playable contact surface. */
export const DEFAULT_BOARD_CAMERA_PADDING_RATIO = 0.1;
/** Two projected tile steps per side keep small boards from receiving a token margin. */
export const DEFAULT_BOARD_CAMERA_PADDING_X = TILE_STEP_X * 2;
export const DEFAULT_BOARD_CAMERA_PADDING_Y = TILE_STEP_Y * 2;
/** Numerical/rendering guard only; level geometry normally resolves a substantially higher floor. */
export const BOARD_CAMERA_TECHNICAL_MINIMUM_ZOOM = 0.05;

const MAX_CAMERA_COORDINATE = 1_000_000;
const GEOMETRY_EPSILON = 1e-7;

type BoardDimensions = { cols: number; rows: number };
export type BoardWithCameraBounds = BoardDimensions & { cameraBounds?: BoardCameraBounds };
export interface BoardCameraPoint { x: number; y: number }

function finiteBounds(value: unknown): BoardCameraBounds | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const minX = Number(record.minX);
  const minY = Number(record.minY);
  const width = Number(record.width);
  const height = Number(record.height);
  if (
    !Number.isFinite(minX)
    || !Number.isFinite(minY)
    || !Number.isFinite(width)
    || !Number.isFinite(height)
    || Math.abs(minX) > MAX_CAMERA_COORDINATE
    || Math.abs(minY) > MAX_CAMERA_COORDINATE
    || width <= 0
    || height <= 0
    || width > MAX_CAMERA_COORDINATE
    || height > MAX_CAMERA_COORDINATE
  ) return undefined;
  return { minX, minY, width, height };
}

/** The smallest legal camera box: it always contains the canonical opening frame. */
export function minimumBoardCameraBounds(board: BoardDimensions): BoardCameraBounds {
  return centeredPlayableBoardFramingBounds(board, BOARD_PREVIEW_MARGIN_RATIO);
}

/** Widest zoom-in an author may state. Past this a board is a few pixels wide on any screen. */
export const MAXIMUM_AUTHORED_CAMERA_ZOOM_IN = 16;

/**
 * Coerce a persisted authored zoom-in limit. Anything unusable — absent, non-finite, zero or
 * negative — means "no authored limit", which leaves the automatic ceiling in charge.
 */
export function normalizeCameraZoomIn(value: unknown): number | undefined {
  const zoom = Number(value);
  if (!Number.isFinite(zoom) || zoom <= 0) return undefined;
  return Math.min(MAXIMUM_AUTHORED_CAMERA_ZOOM_IN, Math.round(zoom * 1000) / 1000);
}

/**
 * Coerce persisted/custom bounds to finite geometry that still contains the complete opening
 * frame. This keeps Reset and the coverage constraint compatible even after a board resize.
 */
export function normalizeBoardCameraBounds(
  value: unknown,
  board: BoardDimensions,
): BoardCameraBounds | undefined {
  const bounds = finiteBounds(value);
  if (!bounds) return undefined;
  const required = minimumBoardCameraBounds(board);
  const maxX = Math.max(bounds.minX + bounds.width, required.minX + required.width);
  const maxY = Math.max(bounds.minY + bounds.height, required.minY + required.height);
  const minX = Math.min(bounds.minX, required.minX);
  const minY = Math.min(bounds.minY, required.minY);
  return { minX, minY, width: maxX - minX, height: maxY - minY };
}

/** Snap a camera box around playable geometry without consulting scenery (which would be cyclic). */
export function defaultBoardCameraBounds(
  board: BoardDimensions,
  mode: BoardCameraSnapMode = 'balanced',
): BoardCameraBounds {
  const playable = centeredPlayableBoardFramingBounds(board, 0);
  const proportionalX = playable.width * DEFAULT_BOARD_CAMERA_PADDING_RATIO;
  const proportionalY = playable.height * DEFAULT_BOARD_CAMERA_PADDING_RATIO;
  const paddingX = mode === 'fixed'
    ? DEFAULT_BOARD_CAMERA_PADDING_X
    : mode === 'proportional'
      ? proportionalX
      : Math.max(DEFAULT_BOARD_CAMERA_PADDING_X, proportionalX);
  const paddingY = mode === 'fixed'
    ? DEFAULT_BOARD_CAMERA_PADDING_Y
    : mode === 'proportional'
      ? proportionalY
      : Math.max(DEFAULT_BOARD_CAMERA_PADDING_Y, proportionalY);
  return {
    minX: playable.minX - paddingX,
    minY: playable.minY - paddingY,
    width: playable.width + paddingX * 2,
    height: playable.height + paddingY * 2,
  };
}

/** Resolve old levels without authored camera data through the same default used by Snap. */
export function resolvedBoardCameraBounds(board: BoardWithCameraBounds): BoardCameraBounds {
  return normalizeBoardCameraBounds(board.cameraBounds, board)
    ?? defaultBoardCameraBounds(board);
}

/**
 * The largest axis-aligned rectangle that fits inside a convex region — the camera box an
 * author wants when they say "as much as the artwork actually covers".
 *
 * A current plate's accepted region is already an axis-aligned rectangle, so that case returns
 * it unchanged rather than approaching it by search. A legacy plate registered through a
 * homography is a quad, and there the answer is a real fit: for a convex region the horizontal
 * span available across a slab is the narrower of its two edges, so scanning pairs of
 * horizontal cuts finds the maximum area without needing calculus.
 */
export function largestBoxInsideBoardCameraPolygon(
  polygon: readonly BoardCameraPoint[],
): BoardCameraBounds | undefined {
  if (polygon.length < 3) return undefined;
  const xs = polygon.map((point) => point.x);
  const ys = polygon.map((point) => point.y);
  if (xs.some((x) => !Number.isFinite(x)) || ys.some((y) => !Number.isFinite(y))) return undefined;
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  if (maxX - minX <= 0 || maxY - minY <= 0) return undefined;

  const axisAligned = polygon.every((point) => (
    (Math.abs(point.x - minX) <= GEOMETRY_EPSILON || Math.abs(point.x - maxX) <= GEOMETRY_EPSILON)
    && (Math.abs(point.y - minY) <= GEOMETRY_EPSILON || Math.abs(point.y - maxY) <= GEOMETRY_EPSILON)
  ));
  if (axisAligned) return { minX, minY, width: maxX - minX, height: maxY - minY };

  // Horizontal span of the region at one height. Walking a consistently wound convex ring
  // means an edge going down bounds the right side and an edge going up bounds the left.
  const orientation = signedArea(polygon) > 0 ? 1 : -1;
  const ring = orientation > 0 ? polygon : [...polygon].reverse();
  const spanOn = (y: number) => {
    let left = -Infinity;
    let right = Infinity;
    for (let index = 0; index < ring.length; index += 1) {
      const start = ring[index];
      const end = ring[(index + 1) % ring.length];
      if (Math.abs(end.y - start.y) <= GEOMETRY_EPSILON) continue;
      const low = Math.min(start.y, end.y);
      const high = Math.max(start.y, end.y);
      if (y < low - GEOMETRY_EPSILON || y > high + GEOMETRY_EPSILON) continue;
      const t = (y - start.y) / (end.y - start.y);
      const x = start.x + (end.x - start.x) * t;
      if (end.y > start.y) right = Math.min(right, x);
      else left = Math.max(left, x);
    }
    if (!Number.isFinite(left) || !Number.isFinite(right) || right <= left) return null;
    return { left, right };
  };

  const SAMPLES = 160;
  const cuts: { y: number; left: number; right: number }[] = [];
  for (let index = 0; index <= SAMPLES; index += 1) {
    const y = minY + ((maxY - minY) * index) / SAMPLES;
    const span = spanOn(y);
    if (span) cuts.push({ y, left: span.left, right: span.right });
  }
  let best: BoardCameraBounds | undefined;
  let bestArea = 0;
  for (let top = 0; top < cuts.length; top += 1) {
    let left = cuts[top].left;
    let right = cuts[top].right;
    for (let bottom = top + 1; bottom < cuts.length; bottom += 1) {
      left = Math.max(left, cuts[bottom].left);
      right = Math.min(right, cuts[bottom].right);
      const width = right - left;
      const height = cuts[bottom].y - cuts[top].y;
      if (width <= 0) break;
      const area = width * height;
      if (area > bestArea) {
        bestArea = area;
        best = { minX: left, minY: cuts[top].y, width, height };
      }
    }
  }
  return best;
}

export function boardCameraBoundsPolygon(bounds: BoardCameraBounds): BoardCameraPoint[] {
  return [
    { x: bounds.minX, y: bounds.minY },
    { x: bounds.minX + bounds.width, y: bounds.minY },
    { x: bounds.minX + bounds.width, y: bounds.minY + bounds.height },
    { x: bounds.minX, y: bounds.minY + bounds.height },
  ];
}

function signedArea(polygon: readonly BoardCameraPoint[]): number {
  return polygon.reduce((sum, point, index) => {
    const next = polygon[(index + 1) % polygon.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0) / 2;
}

function edgeCross(
  start: BoardCameraPoint,
  end: BoardCameraPoint,
  point: BoardCameraPoint,
): number {
  return (end.x - start.x) * (point.y - start.y)
    - (end.y - start.y) * (point.x - start.x);
}

function edgeIntersection(
  segmentStart: BoardCameraPoint,
  segmentEnd: BoardCameraPoint,
  clipStart: BoardCameraPoint,
  clipEnd: BoardCameraPoint,
): BoardCameraPoint {
  const segmentX = segmentEnd.x - segmentStart.x;
  const segmentY = segmentEnd.y - segmentStart.y;
  const clipX = clipEnd.x - clipStart.x;
  const clipY = clipEnd.y - clipStart.y;
  const denominator = segmentX * clipY - segmentY * clipX;
  if (Math.abs(denominator) <= GEOMETRY_EPSILON) return segmentEnd;
  const relativeX = clipStart.x - segmentStart.x;
  const relativeY = clipStart.y - segmentStart.y;
  const t = (relativeX * clipY - relativeY * clipX) / denominator;
  return {
    x: segmentStart.x + segmentX * t,
    y: segmentStart.y + segmentY * t,
  };
}

/** Convex intersection used to combine an authored camera box with accepted pre-drawn pixels. */
export function intersectConvexBoardCameraPolygons(
  subject: readonly BoardCameraPoint[],
  clip: readonly BoardCameraPoint[],
): BoardCameraPoint[] {
  if (subject.length < 3 || clip.length < 3) return [];
  const area = signedArea(clip);
  if (Math.abs(area) <= GEOMETRY_EPSILON) return [];
  const orientation = area > 0 ? 1 : -1;
  let output = [...subject];
  for (let clipIndex = 0; clipIndex < clip.length; clipIndex += 1) {
    const clipStart = clip[clipIndex];
    const clipEnd = clip[(clipIndex + 1) % clip.length];
    const input = output;
    output = [];
    if (!input.length) break;
    let previous = input[input.length - 1];
    let previousInside = orientation * edgeCross(clipStart, clipEnd, previous) >= -GEOMETRY_EPSILON;
    for (const current of input) {
      const currentInside = orientation * edgeCross(clipStart, clipEnd, current) >= -GEOMETRY_EPSILON;
      if (currentInside !== previousInside) {
        output.push(edgeIntersection(previous, current, clipStart, clipEnd));
      }
      if (currentInside) output.push(current);
      previous = current;
      previousInside = currentInside;
    }
  }
  return output;
}

/**
 * The region the camera may never leave: the level's box, and nothing else (ADR-0301).
 *
 * The box is the whole authority. It is not intersected with the artwork, not stood in for by
 * the artwork, and not conditional on whether an author has touched it — every level resolves
 * one, the camera stops at it, and dragging it is how the maximum view changes. Keeping a box
 * inside its artwork is worth doing and belongs to authoring, as an action that moves the box;
 * a runtime check that silently overrides it makes the drawn rectangle stop meaning what it
 * says, which is exactly the confusion this replaces.
 */
export function effectiveBoardCameraCoverPolygon(
  board: BoardWithCameraBounds,
): BoardCameraPoint[] {
  return boardCameraBoundsPolygon(resolvedBoardCameraBounds(board));
}

/**
 * The level's own extent, for the usefulness limit: zooming out ends with the whole of
 * this visible. An authored boundary states how much of the world the level means to be
 * seen, so it is that when present, and the derived default otherwise.
 */
export function boardCameraContainBox(board: BoardWithCameraBounds): {
  width: number;
  height: number;
} {
  const { width, height } = resolvedBoardCameraBounds(board);
  return { width, height };
}
