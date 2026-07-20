import { parseEdgeKey } from '../core/featureAutotile';
import { TILE_STEP_X, TILE_STEP_Y } from '../art/projectionContract';
import {
  MAX_PREDRAWN_GENERATION_FRAME_DIMENSION,
  normalizePredrawnGenerationFrame,
  type PredrawnGenerationFrame,
} from '../core/predrawnGenerationFrame';
import type { EditorBoard } from '../ui/boardCode';
import { boardLabMetrics } from './boardProjection';
import { boardBounds, type BakeBounds } from './renderPlan';

const REQUIRED_CLEARANCE = 1;
const FRAME_WIDTH_UNITS = 16;
const FRAME_HEIGHT_UNITS = 9;
const MAX_FRAME_SCALE = Math.floor(MAX_PREDRAWN_GENERATION_FRAME_DIMENSION / FRAME_WIDTH_UNITS);
const EMPTY_APRON = Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 });

export interface PredrawnGenerationFrameClearance {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export type PredrawnGenerationFrameValidation =
  | {
    ok: true;
    frame: PredrawnGenerationFrame;
    requiredBounds: BakeBounds;
    clearance: PredrawnGenerationFrameClearance;
  }
  | {
    ok: false;
    errors: string[];
    frame?: PredrawnGenerationFrame;
    requiredBounds?: BakeBounds;
    clearance?: PredrawnGenerationFrameClearance;
  };

function playableCellKey(key: string, board: Pick<EditorBoard, 'cols' | 'rows'>): boolean {
  const parts = key.split(',');
  if (parts.length !== 2) return false;
  const x = Number(parts[0]);
  const y = Number(parts[1]);
  return Number.isSafeInteger(x)
    && Number.isSafeInteger(y)
    && `${x},${y}` === key
    && x >= 0
    && x < board.cols
    && y >= 0
    && y < board.rows;
}

function filterPlayableCells<T>(
  values: Readonly<Record<string, T>> | undefined,
  board: Pick<EditorBoard, 'cols' | 'rows'>,
): Record<string, T> {
  return Object.fromEntries(
    Object.entries(values ?? {}).filter(([key]) => playableCellKey(key, board)),
  );
}

function edgeTouchesPlayableBoard(
  key: string,
  board: Pick<EditorBoard, 'cols' | 'rows'>,
): boolean {
  const edge = parseEdgeKey(key);
  if (!edge) return false;
  const a = edge.ax >= 0 && edge.ax < board.cols && edge.ay >= 0 && edge.ay < board.rows;
  const b = edge.bx >= 0 && edge.bx < board.cols && edge.by >= 0 && edge.by < board.rows;
  return (a || b) && Math.abs(edge.ax - edge.bx) + Math.abs(edge.ay - edge.by) === 1;
}

function filterPlayableEdges<T>(
  values: Readonly<Record<string, T>> | undefined,
  board: Pick<EditorBoard, 'cols' | 'rows'>,
): Record<string, T> {
  return Object.fromEntries(
    Object.entries(values ?? {}).filter(([key]) => edgeTouchesPlayableBoard(key, board)),
  );
}

function filterPlayableVertices<T>(
  values: Readonly<Record<string, T>> | undefined,
  board: Pick<EditorBoard, 'cols' | 'rows'>,
): Record<string, T> {
  return Object.fromEntries(Object.entries(values ?? {}).filter(([key]) => {
    const parts = key.split(',');
    if (parts.length !== 2) return false;
    const x = Number(parts[0]);
    const y = Number(parts[1]);
    return Number.isSafeInteger(x)
      && Number.isSafeInteger(y)
      && `${x},${y}` === key
      && x >= 0
      && x <= board.cols
      && y >= 0
      && y <= board.rows;
  }));
}

function filterPlayableSubterrain(
  values: EditorBoard['subterrain'],
  board: Pick<EditorBoard, 'cols' | 'rows'>,
): NonNullable<EditorBoard['subterrain']> {
  return Object.fromEntries(Object.entries(values ?? {}).filter(([key]) => {
    const separator = key.lastIndexOf(':');
    return separator > 0 && playableCellKey(key.slice(0, separator), board);
  }));
}

/**
 * Strip every scenic-only or runtime-only channel before measuring geometry that a generation
 * crop is forbidden to cut. Boundary barriers remain because one endpoint may intentionally sit
 * just outside the playable rectangle; visual objects whose anchor is off-board do not.
 */
function generationRequiredBoard(board: EditorBoard): EditorBoard {
  return {
    ...board,
    surface: undefined,
    decorativeApron: EMPTY_APRON,
    decorativeFootprint: [],
    decorativeCells: {},
    decorativeFeatures: {},
    decorativeFences: {},
    decorativeFencePosts: {},
    decorativeWalls: {},
    cells: filterPlayableCells(board.cells, board),
    macroTiles: (board.macroTiles ?? []).filter((placement) => (
      placement.x >= 0
      && placement.x < board.cols
      && placement.y >= 0
      && placement.y < board.rows
    )),
    units: {},
    doodads: filterPlayableCells(board.doodads, board),
    props: filterPlayableCells(board.props, board),
    cover: {},
    coverTypes: {},
    features: filterPlayableCells(board.features, board),
    fences: filterPlayableEdges(board.fences, board),
    fencePosts: filterPlayableVertices(board.fencePosts, board),
    walls: filterPlayableEdges(board.walls, board),
    wallArt: filterPlayableEdges(board.wallArt, board),
    subterrain: filterPlayableSubterrain(board.subterrain, board),
    featureCuts: filterPlayableEdges(board.featureCuts, board) as Record<string, true>,
    featureExits: filterPlayableEdges(board.featureExits, board) as Record<string, true>,
  };
}

function playableEnvelopeBounds(board: Pick<EditorBoard, 'cols' | 'rows'>): BakeBounds {
  return {
    minX: -board.rows * TILE_STEP_X,
    minY: -TILE_STEP_Y,
    width: (board.cols + board.rows) * TILE_STEP_X,
    height: (board.cols + board.rows) * TILE_STEP_Y,
  };
}

function unionBounds(left: BakeBounds, right: BakeBounds): BakeBounds {
  const minX = Math.min(left.minX, right.minX);
  const minY = Math.min(left.minY, right.minY);
  const maxX = Math.max(left.minX + left.width, right.minX + right.width);
  const maxY = Math.max(left.minY + left.height, right.minY + right.height);
  return { minX, minY, width: maxX - minX, height: maxY - minY };
}

/** Exact required draw bounds plus the complete rectangular playable outer envelope. */
export function predrawnGenerationRequiredBounds(board: EditorBoard): BakeBounds {
  return unionBounds(
    boardBounds(generationRequiredBoard(board), {
      ambientCover: false,
      topSurfacesOnly: true,
    }),
    playableEnvelopeBounds(board),
  );
}

function frameClearance(
  frame: PredrawnGenerationFrame,
  bounds: BakeBounds,
): PredrawnGenerationFrameClearance {
  return {
    left: bounds.minX - frame.x,
    top: bounds.minY - frame.y,
    right: frame.x + frame.width - (bounds.minX + bounds.width),
    bottom: frame.y + frame.height - (bounds.minY + bounds.height),
  };
}

/** Validate both persisted shape and the one-pixel protected-geometry inset. */
export function validatePredrawnGenerationFrame(
  board: EditorBoard,
  value: unknown,
): PredrawnGenerationFrameValidation {
  const frame = normalizePredrawnGenerationFrame(value);
  if (!frame) {
    return {
      ok: false,
      errors: [
        'predrawnGenerationFrame must be version 1 with safe-integer x/y, positive dimensions at most 8192px, and an exact 16:9 aspect ratio',
      ],
    };
  }
  const requiredBounds = predrawnGenerationRequiredBounds(board);
  const clearance = frameClearance(frame, requiredBounds);
  const errors = (Object.entries(clearance) as Array<[keyof PredrawnGenerationFrameClearance, number]>)
    .filter(([, pixels]) => pixels < REQUIRED_CLEARANCE)
    .map(([side, pixels]) => (
      `predrawnGenerationFrame ${side} clearance must be at least ${REQUIRED_CLEARANCE}px (received ${pixels}px)`
    ));
  return errors.length
    ? { ok: false, errors, frame, requiredBounds, clearance }
    : { ok: true, frame, requiredBounds, clearance };
}

function nearestAllowedFrameOrigin(
  desired: number,
  frameSpan: number,
  requiredMin: number,
  requiredMax: number,
): number | undefined {
  const minimum = Math.ceil(requiredMax + REQUIRED_CLEARANCE - frameSpan);
  const maximum = Math.floor(requiredMin - REQUIRED_CLEARANCE);
  if (minimum > maximum) return undefined;
  return Math.min(maximum, Math.max(minimum, Math.round(desired)));
}

/**
 * Produce the tightest safe explicit first owner frame. It is the smallest native-1x 16:9
 * rectangle that contains protected gameplay geometry with the required inset, centered as
 * closely as integer frame coordinates permit. The owner may subsequently zoom back out to admit
 * more scenic art or pan while validation keeps the required geometry inside.
 */
export function initialPredrawnGenerationFrame(board: EditorBoard): PredrawnGenerationFrame {
  const requiredBounds = predrawnGenerationRequiredBounds(board);
  const minimumRequiredScale = Math.max(1, Math.ceil(Math.max(
    (requiredBounds.width + REQUIRED_CLEARANCE * 2) / FRAME_WIDTH_UNITS,
    (requiredBounds.height + REQUIRED_CLEARANCE * 2) / FRAME_HEIGHT_UNITS,
  )));
  let scale = minimumRequiredScale;
  const requiredCenterX = requiredBounds.minX + requiredBounds.width / 2;
  const requiredCenterY = requiredBounds.minY + requiredBounds.height / 2;
  const requiredMaxX = requiredBounds.minX + requiredBounds.width;
  const requiredMaxY = requiredBounds.minY + requiredBounds.height;

  for (; scale <= MAX_FRAME_SCALE; scale += 1) {
    const width = FRAME_WIDTH_UNITS * scale;
    const height = FRAME_HEIGHT_UNITS * scale;
    const x = nearestAllowedFrameOrigin(
      requiredCenterX - width / 2,
      width,
      requiredBounds.minX,
      requiredMaxX,
    );
    const y = nearestAllowedFrameOrigin(
      requiredCenterY - height / 2,
      height,
      requiredBounds.minY,
      requiredMaxY,
    );
    if (x === undefined || y === undefined) continue;
    const frame: PredrawnGenerationFrame = { version: 1, x, y, width, height };
    if (validatePredrawnGenerationFrame(board, frame).ok) return frame;
  }
  throw new Error(
    `generation-required geometry does not fit inside a ${MAX_PREDRAWN_GENERATION_FRAME_DIMENSION}px-wide 16:9 frame at native 1x`,
  );
}

/** Map a canonical native-1x frame into TileGrid's viewport-centred boardPan coordinates. */
export function predrawnGenerationFrameBoardPan(
  board: Pick<EditorBoard, 'cols' | 'rows'>,
  value: unknown,
): { x: number; y: number } {
  const frame = normalizePredrawnGenerationFrame(value);
  if (!frame) throw new Error('cannot map an invalid predrawnGenerationFrame');
  const cells = Array.from({ length: board.rows }, (_, y) => (
    Array.from({ length: board.cols }, (__, x) => ({ x, y }))
  )).flat();
  const metrics = boardLabMetrics(cells);
  return {
    x: -frame.x - metrics.originLeft - frame.width / 2,
    y: -frame.y - metrics.originTop - frame.height / 2,
  };
}
