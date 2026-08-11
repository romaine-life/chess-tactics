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
 * The runtime coverage authority — the region the camera may never leave (ADR-0301).
 *
 * An AUTHORED box is a statement of intent and binds: the camera is held inside it, intersected
 * with accepted pixels so a box larger than the painting cannot expose black.
 *
 * With no authored box the answer is the painted extent itself, not the derived default. The
 * default is a snap preset for an author staring at an empty Camera page — it is deliberately
 * tight around the playable surface, and it is usually far SMALLER than what the level already
 * paints. Treating it as the runtime limit throws away real coverage and buys nothing: it does
 * not add a pixel of art, it only forces the camera in until a board that was fully painted no
 * longer fits on screen. What a level has actually painted is the honest promise until an author
 * states a different one.
 */
export function effectiveBoardCameraCoverPolygon(
  board: BoardWithCameraBounds,
  acceptedArtPolygon?: readonly BoardCameraPoint[],
): BoardCameraPoint[] | undefined {
  const authored = normalizeBoardCameraBounds(board.cameraBounds, board);
  if (!acceptedArtPolygon) {
    // No authored box and no finite painting: this board's backdrop is locked to the
    // viewport and paints wherever the camera goes, so there is no unpainted world to be
    // kept out of and nothing for a boundary to protect. Usefulness alone limits it.
    return authored ? boardCameraBoundsPolygon(authored) : undefined;
  }
  if (!authored) return [...acceptedArtPolygon];
  const intersection = intersectConvexBoardCameraPolygons(
    boardCameraBoundsPolygon(authored),
    acceptedArtPolygon,
  );
  // Accepted pixels remain the fail-safe if corrupt legacy data produces disjoint boundaries.
  return intersection.length >= 3 ? intersection : [...acceptedArtPolygon];
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
