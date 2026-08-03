import { parseEdgeKey } from '../core/featureAutotile';
import { TILE_STEP_X, TILE_STEP_Y } from '../art/projectionContract';
import {
  MAX_PREDRAWN_GENERATION_FRAME_DIMENSION,
  normalizePredrawnGenerationFrame,
  type PredrawnGenerationFrame,
} from '../core/predrawnGenerationFrame';
import type { EditorBoard, PredrawnBoardWorldBounds } from '../ui/boardCode';
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
    backgroundMode: 'legacy',
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
    // Direct source artwork is visual-only composition input. It remains visible in Image 1 but
    // may cross or sit outside the owner's deliberate crop, so it never expands required bounds.
    floatingArtwork: [],
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
 * Smallest valid native-1x 16:9 frame that shows an entire named board rectangle.
 *
 * The result always also contains protected gameplay geometry with its required inset, because a
 * frame that cannot pass validation is not a usable starting point. It is centred on the requested
 * rectangle as closely as integer frame coordinates permit, so a preset reads as "this view, in
 * 16:9" rather than as an unrelated crop.
 */
export function predrawnGenerationFrameContaining(
  board: EditorBoard,
  target: BakeBounds,
): PredrawnGenerationFrame {
  const contained = unionBounds(predrawnGenerationRequiredBounds(board), target);
  const containedMaxX = contained.minX + contained.width;
  const containedMaxY = contained.minY + contained.height;
  const targetCenterX = target.minX + target.width / 2;
  const targetCenterY = target.minY + target.height / 2;
  let scale = Math.max(1, Math.ceil(Math.max(
    (contained.width + REQUIRED_CLEARANCE * 2) / FRAME_WIDTH_UNITS,
    (contained.height + REQUIRED_CLEARANCE * 2) / FRAME_HEIGHT_UNITS,
  )));

  for (; scale <= MAX_FRAME_SCALE; scale += 1) {
    const width = FRAME_WIDTH_UNITS * scale;
    const height = FRAME_HEIGHT_UNITS * scale;
    const x = nearestAllowedFrameOrigin(
      targetCenterX - width / 2,
      width,
      contained.minX,
      containedMaxX,
    );
    const y = nearestAllowedFrameOrigin(
      targetCenterY - height / 2,
      height,
      contained.minY,
      containedMaxY,
    );
    if (x === undefined || y === undefined) continue;
    const frame: PredrawnGenerationFrame = { version: 1, x, y, width, height };
    if (validatePredrawnGenerationFrame(board, frame).ok) return frame;
  }
  throw new Error(
    `generation-required geometry does not fit inside a ${MAX_PREDRAWN_GENERATION_FRAME_DIMENSION}px-wide 16:9 frame at native 1x`,
  );
}

/**
 * Produce the tightest safe explicit first owner frame. It is the smallest native-1x 16:9
 * rectangle that contains protected gameplay geometry with the required inset, centered as
 * closely as integer frame coordinates permit. The owner may subsequently zoom back out to admit
 * more scenic art or pan while validation keeps the required geometry inside.
 */
export function initialPredrawnGenerationFrame(board: EditorBoard): PredrawnGenerationFrame {
  return predrawnGenerationFrameContaining(board, predrawnGenerationRequiredBounds(board));
}

/**
 * TileGrid's board-centred origin for this board.
 *
 * Generation frames are expressed in raw projected board coordinates; the camera boundary and every
 * derived opening/thumbnail framing are expressed in TileGrid's board-centred world. The two spaces
 * differ by exactly this origin, so one translation converts between them.
 */
function boardProjectionOrigin(
  board: Pick<EditorBoard, 'cols' | 'rows'>,
): { originLeft: number; originTop: number } {
  const cells = Array.from({ length: board.rows }, (_, y) => (
    Array.from({ length: board.cols }, (__, x) => ({ x, y }))
  )).flat();
  return boardLabMetrics(cells);
}

/** Convert a board-centred rectangle (camera boundary, opening framing) into generation space. */
export function predrawnGenerationBoundsFromCentered(
  board: Pick<EditorBoard, 'cols' | 'rows'>,
  bounds: BakeBounds,
): BakeBounds {
  const { originLeft, originTop } = boardProjectionOrigin(board);
  return {
    minX: bounds.minX - originLeft,
    minY: bounds.minY - originTop,
    width: bounds.width,
    height: bounds.height,
  };
}

/** Map any finite positive board-world rectangle into TileGrid's viewport-centred boardPan. */
export function predrawnWorldBoundsBoardPan(
  board: Pick<EditorBoard, 'cols' | 'rows'>,
  bounds: PredrawnBoardWorldBounds,
): { x: number; y: number } {
  if (
    !Number.isFinite(bounds.minX)
    || !Number.isFinite(bounds.minY)
    || !Number.isFinite(bounds.width)
    || !Number.isFinite(bounds.height)
    || bounds.width <= 0
    || bounds.height <= 0
  ) throw new Error('cannot map invalid predrawn world bounds');
  const metrics = boardProjectionOrigin(board);
  return {
    x: -bounds.minX - metrics.originLeft - bounds.width / 2,
    y: -bounds.minY - metrics.originTop - bounds.height / 2,
  };
}

/** Map a canonical native-1x generation frame into TileGrid's viewport-centred boardPan. */
export function predrawnGenerationFrameBoardPan(
  board: Pick<EditorBoard, 'cols' | 'rows'>,
  value: unknown,
): { x: number; y: number } {
  const frame = normalizePredrawnGenerationFrame(value);
  if (!frame) throw new Error('cannot map an invalid predrawnGenerationFrame');
  return predrawnWorldBoundsBoardPan(board, {
    minX: frame.x,
    minY: frame.y,
    width: frame.width,
    height: frame.height,
  });
}
