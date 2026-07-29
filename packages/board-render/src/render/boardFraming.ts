import {
  TILE_FRAME_EQUATOR_Y,
  TILE_FRAME_HEIGHT,
  TILE_STEP_X,
  TILE_STEP_Y,
} from '../art/projectionContract';

/**
 * The opening composition is board-owned, not scene-owned. Five percent on every side keeps a
 * calm border around the stable playable presentation while generated overscan remains available
 * only as optional camera room.
 */
export const BOARD_PREVIEW_MARGIN_RATIO = 0.05;
export const BOARD_PREVIEW_FRAMING_REVISION = 3;

/**
 * Every ordinary board preview uses the literal Play viewing-pane shape.
 *
 * Play's 1920×1080 design canvas reserves 360px for the HUD and 88px for the
 * title bar, leaving 1560×992. Reduced to lowest terms, that is 195:124.
 */
export const BOARD_PREVIEW_ASPECT = Object.freeze({
  width: 195,
  height: 124,
});

/** Quarter-scale delivery raster with the exact canonical aspect. */
export const BOARD_THUMBNAIL_SIZE = Object.freeze({
  width: 390,
  height: 248,
});

export function boardPreviewHeight(width: number): number {
  if (!Number.isFinite(width) || width <= 0) return 0;
  return width * BOARD_PREVIEW_ASPECT.height / BOARD_PREVIEW_ASPECT.width;
}

export interface BoardFramingBounds {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

export interface BoardFramingViewport {
  width: number;
  height: number;
}

export interface BoardFramingCamera {
  zoom: number;
  /** Screen-pixel translation applied before the board-space scale. */
  pan: { x: number; y: number };
}

type BoardDimensions = { cols: number; rows: number };

function positiveBoardDimension(value: number): number {
  return Number.isSafeInteger(value) && value > 0 ? value : 1;
}

/**
 * Stable playable-board presentation bounds in raw projected board coordinates.
 *
 * This is the union of the playable cells' contact diamonds. It deliberately excludes tile-frame
 * relief/headroom, units, props, doodads, scenic terrain, and pre-drawn art. Those channels may
 * change without moving the camera. The bounds therefore describe what "show me this board" means
 * in every renderer without tall/narrow boards inheriting irrelevant sprite-frame height.
 */
export function playableBoardVisualBounds(board: BoardDimensions): BoardFramingBounds {
  const cols = positiveBoardDimension(board.cols);
  const rows = positiveBoardDimension(board.rows);
  return {
    minX: -rows * TILE_STEP_X,
    minY: -TILE_STEP_Y,
    width: (cols + rows) * TILE_STEP_X,
    height: (cols + rows) * TILE_STEP_Y,
  };
}

/** Expand the stable playable presentation by a board-proportional margin on every side. */
export function playableBoardFramingBounds(
  board: BoardDimensions,
  marginRatio = BOARD_PREVIEW_MARGIN_RATIO,
): BoardFramingBounds {
  const bounds = playableBoardVisualBounds(board);
  const ratio = Number.isFinite(marginRatio) ? Math.max(0, marginRatio) : BOARD_PREVIEW_MARGIN_RATIO;
  const marginX = bounds.width * ratio;
  const marginY = bounds.height * ratio;
  return {
    minX: bounds.minX - marginX,
    minY: bounds.minY - marginY,
    width: bounds.width + marginX * 2,
    height: bounds.height + marginY * 2,
  };
}

/**
 * The same framing bounds in TileGrid's board-centred coordinate system. TileGrid centres the
 * complete tile sprite frame, whose asymmetric relief puts the playable contact surface slightly
 * above zero; preserve that real offset so the opening camera centres the playable surface.
 */
export function centeredPlayableBoardFramingBounds(
  board: BoardDimensions,
  marginRatio = BOARD_PREVIEW_MARGIN_RATIO,
): BoardFramingBounds {
  const cols = positiveBoardDimension(board.cols);
  const rows = positiveBoardDimension(board.rows);
  const bounds = playableBoardFramingBounds(board, marginRatio);
  const fullFrameHeight = (cols + rows - 2) * TILE_STEP_Y + TILE_FRAME_HEIGHT;
  const originTop = TILE_FRAME_EQUATOR_Y - fullFrameHeight / 2;
  return {
    minX: -bounds.width / 2,
    minY: bounds.minY + originTop,
    width: bounds.width,
    height: bounds.height,
  };
}

/**
 * Contain one world-space rectangle inside a measured viewport.
 *
 * The returned pan uses the ViewPane/TileGrid convention: board-space is scaled around the
 * viewport centre, then translated in screen pixels.
 */
export function cameraToContainBounds({
  viewport,
  bounds,
  minZoom = 0.01,
  maxZoom = 16,
}: {
  viewport: BoardFramingViewport;
  bounds: BoardFramingBounds;
  minZoom?: number;
  maxZoom?: number;
}): BoardFramingCamera {
  const validViewport = Number.isFinite(viewport.width)
    && Number.isFinite(viewport.height)
    && viewport.width > 0
    && viewport.height > 0;
  const validBounds = Number.isFinite(bounds.minX)
    && Number.isFinite(bounds.minY)
    && Number.isFinite(bounds.width)
    && Number.isFinite(bounds.height)
    && bounds.width > 0
    && bounds.height > 0;
  const lower = Math.max(0.01, Number.isFinite(minZoom) ? minZoom : 0.01);
  const upper = Math.max(lower, Number.isFinite(maxZoom) ? maxZoom : 16);
  const naturalZoom = validViewport && validBounds
    ? Math.min(viewport.width / bounds.width, viewport.height / bounds.height)
    : lower;
  const zoom = Math.min(upper, Math.max(lower, naturalZoom));
  const centerX = validBounds ? bounds.minX + bounds.width / 2 : 0;
  const centerY = validBounds ? bounds.minY + bounds.height / 2 : 0;
  return {
    zoom,
    pan: {
      x: centerX === 0 ? 0 : -centerX * zoom,
      y: centerY === 0 ? 0 : -centerY * zoom,
    },
  };
}

/**
 * Minimum zoom that lets a rectangular art boundary cover a viewport while retaining a chosen
 * world-space centre. This is the static-renderer equivalent of ViewPane's polygon safety floor.
 */
export function minimumZoomToCoverBoundsAtCenter({
  viewport,
  coverBounds,
  center,
  minZoom = 0.01,
  maxZoom = Number.POSITIVE_INFINITY,
}: {
  viewport: BoardFramingViewport;
  coverBounds: BoardFramingBounds;
  center: { x: number; y: number };
  minZoom?: number;
  maxZoom?: number;
}): number {
  const lower = Math.max(0.01, Number.isFinite(minZoom) ? minZoom : 0.01);
  const upper = Math.max(lower, Number.isNaN(maxZoom) ? Number.POSITIVE_INFINITY : maxZoom);
  const left = center.x - coverBounds.minX;
  const right = coverBounds.minX + coverBounds.width - center.x;
  const top = center.y - coverBounds.minY;
  const bottom = coverBounds.minY + coverBounds.height - center.y;
  if (
    viewport.width <= 0
    || viewport.height <= 0
    || !Number.isFinite(viewport.width)
    || !Number.isFinite(viewport.height)
    || !Number.isFinite(left)
    || !Number.isFinite(right)
    || !Number.isFinite(top)
    || !Number.isFinite(bottom)
    || left <= 0
    || right <= 0
    || top <= 0
    || bottom <= 0
  ) return upper;
  return Math.min(upper, Math.max(
    lower,
    viewport.width / (2 * Math.min(left, right)),
    viewport.height / (2 * Math.min(top, bottom)),
  ));
}

/**
 * World rectangle represented by a fixed output raster when it uses the canonical contain camera.
 * Passing this as the paint bounds lets browser thumbnails use the same composition as live views.
 */
export function worldViewportForFraming({
  viewport,
  bounds,
  minZoom,
}: {
  viewport: BoardFramingViewport;
  bounds: BoardFramingBounds;
  minZoom?: number;
}): { bounds: BoardFramingBounds; zoom: number } {
  const camera = cameraToContainBounds({ viewport, bounds, minZoom });
  const centerX = bounds.minX + bounds.width / 2;
  const centerY = bounds.minY + bounds.height / 2;
  const width = viewport.width / camera.zoom;
  const height = viewport.height / camera.zoom;
  return {
    bounds: {
      minX: centerX - width / 2,
      minY: centerY - height / 2,
      width,
      height,
    },
    zoom: camera.zoom,
  };
}
