import type { BoardDrawOp } from '@chess-tactics/board-render';
import { loadDecodedImage } from './imageResources';

export interface RasterAlphaMask {
  rgba: ArrayLike<number>;
  width: number;
  height: number;
}

export interface RasterPoint {
  x: number;
  y: number;
}

/** An axis-aligned rectangle in the same board/scene space a draw op paints into. */
export interface RasterRect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Where a draw op lands and which source crop it reads — the one map both point and rect tests use. */
export interface RasterDrawOpProjection {
  destinationLeft: number;
  destinationTop: number;
  destinationWidth: number;
  destinationHeight: number;
  sourceLeft: number;
  sourceTop: number;
  sourceWidth: number;
  sourceHeight: number;
  flipX: boolean;
}

const rasterAlphaMaskCache = new Map<string, Promise<RasterAlphaMask | null>>();

/** One decoded source-alpha cache shared by every browser-side pixel proof and picker. */
export function loadRasterAlphaMask(src: string): Promise<RasterAlphaMask | null> {
  const cached = rasterAlphaMaskCache.get(src);
  if (cached) return cached;
  const promise = loadDecodedImage(src).then((image) => {
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    if (!width || !height) return null;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(image, 0, 0);
    return { rgba: context.getImageData(0, 0, width, height).data, width, height };
  }).catch(() => {
    rasterAlphaMaskCache.delete(src);
    return null;
  });
  rasterAlphaMaskCache.set(src, promise);
  return promise;
}

/** Resolve where a draw op lands and which source crop it reads. Null when it paints nothing. */
export function drawOpProjection(
  op: BoardDrawOp,
  source: Pick<RasterAlphaMask, 'width' | 'height'>,
): RasterDrawOpProjection | null {
  let destinationWidth = op.dw;
  let destinationHeight = op.dh;
  let destinationLeft = op.dx;
  let destinationTop = op.dy;
  if (op.contain) {
    const fit = Math.min(op.dw / source.width, op.dh / source.height);
    destinationWidth = source.width * fit;
    destinationHeight = source.height * fit;
    destinationLeft += (op.dw - destinationWidth) / 2;
    destinationTop += (op.dh - destinationHeight) / 2;
  }
  if (destinationWidth <= 0 || destinationHeight <= 0) return null;
  return {
    destinationLeft,
    destinationTop,
    destinationWidth,
    destinationHeight,
    sourceLeft: op.sx ?? 0,
    sourceTop: op.sy ?? 0,
    sourceWidth: op.sw ?? source.width,
    sourceHeight: op.sh ?? source.height,
    flipX: op.flipX === true,
  };
}

/** Map one rendered board-space point back into the exact source crop used by a draw op. */
export function sourcePointForDrawOp(
  op: BoardDrawOp,
  source: Pick<RasterAlphaMask, 'width' | 'height'>,
  point: RasterPoint,
): RasterPoint | null {
  const projection = drawOpProjection(op, source);
  if (!projection) return null;
  let unitX = (point.x - projection.destinationLeft) / projection.destinationWidth;
  const unitY = (point.y - projection.destinationTop) / projection.destinationHeight;
  if (projection.flipX) unitX = 1 - unitX;
  if (unitX < 0 || unitY < 0 || unitX >= 1 || unitY >= 1) return null;
  return {
    x: projection.sourceLeft + unitX * projection.sourceWidth,
    y: projection.sourceTop + unitY * projection.sourceHeight,
  };
}

/** True only when the live draw op paints a nontransparent source pixel at this point. */
export function drawOpPaintsPoint(
  op: BoardDrawOp,
  source: RasterAlphaMask,
  point: RasterPoint,
): boolean {
  if (source.width <= 0 || source.height <= 0 || source.rgba.length < source.width * source.height * 4) {
    return false;
  }
  const sourcePoint = sourcePointForDrawOp(op, source, point);
  if (!sourcePoint) return false;
  const sourceX = Math.min(source.width - 1, Math.max(0, Math.floor(sourcePoint.x)));
  const sourceY = Math.min(source.height - 1, Math.max(0, Math.floor(sourcePoint.y)));
  return (source.rgba[(sourceY * source.width + sourceX) * 4 + 3] ?? 0) > 0;
}

/** A coarse "does anything opaque live here" grid over one decoded source image. */
export interface RasterAlphaOccupancy {
  cols: number;
  rows: number;
  /** One byte per cell: 1 when the cell contains at least one nontransparent source pixel. */
  cells: Uint8Array;
  /** Cell size in SOURCE pixels. */
  cellWidth: number;
  cellHeight: number;
}

const occupancyCache = new WeakMap<object, RasterAlphaOccupancy>();

/**
 * Reduce a decoded alpha mask to a small opaque/empty grid.
 *
 * A rectangle test (drag out a box, take everything the box touches) cannot afford the per-pixel
 * walk a single-point pick uses: the box grows with the zoom and the scene, while a point never
 * costs more than one sample. Collapsing the source to a bounded grid makes the rectangle test cost
 * a constant handful of byte reads no matter how large the drag, and it still answers from the
 * artwork's real pixels rather than its padded image rectangle — the sprite's transparent margin
 * never lands in the selection.
 */
export function rasterAlphaOccupancy(mask: RasterAlphaMask, maxAxisCells = 48): RasterAlphaOccupancy {
  const cached = occupancyCache.get(mask);
  if (cached && cached.cols <= maxAxisCells && cached.rows <= maxAxisCells) return cached;
  const cols = Math.max(1, Math.min(maxAxisCells, mask.width));
  const rows = Math.max(1, Math.min(maxAxisCells, mask.height));
  const cellWidth = mask.width / cols;
  const cellHeight = mask.height / rows;
  const cells = new Uint8Array(cols * rows);
  const usable = mask.width > 0 && mask.height > 0
    && mask.rgba.length >= mask.width * mask.height * 4;
  if (usable) {
    for (let y = 0; y < mask.height; y += 1) {
      const row = Math.min(rows - 1, Math.floor(y / cellHeight));
      for (let x = 0; x < mask.width; x += 1) {
        if ((mask.rgba[(y * mask.width + x) * 4 + 3] ?? 0) === 0) continue;
        cells[row * cols + Math.min(cols - 1, Math.floor(x / cellWidth))] = 1;
      }
    }
  }
  const occupancy: RasterAlphaOccupancy = { cols, rows, cells, cellWidth, cellHeight };
  occupancyCache.set(mask, occupancy);
  return occupancy;
}

/** True only when the rectangle covers some nontransparent pixel this draw op paints. */
export function drawOpPaintsWithinRect(
  op: BoardDrawOp,
  source: RasterAlphaMask,
  rect: RasterRect,
): boolean {
  const projection = drawOpProjection(op, source);
  if (!projection) return false;
  const {
    destinationLeft, destinationTop, destinationWidth, destinationHeight,
    sourceLeft, sourceTop, sourceWidth, sourceHeight, flipX,
  } = projection;
  const destinationRight = destinationLeft + destinationWidth;
  const destinationBottom = destinationTop + destinationHeight;
  const left = Math.max(destinationLeft, Math.min(rect.minX, rect.maxX));
  const right = Math.min(destinationRight, Math.max(rect.minX, rect.maxX));
  const top = Math.max(destinationTop, Math.min(rect.minY, rect.maxY));
  const bottom = Math.min(destinationBottom, Math.max(rect.minY, rect.maxY));
  if (left > right || top > bottom) return false;

  const unit = (value: number, origin: number, span: number): number =>
    Math.min(1, Math.max(0, (value - origin) / span));
  let unitMinX = unit(left, destinationLeft, destinationWidth);
  let unitMaxX = unit(right, destinationLeft, destinationWidth);
  if (flipX) [unitMinX, unitMaxX] = [1 - unitMaxX, 1 - unitMinX];
  const unitMinY = unit(top, destinationTop, destinationHeight);
  const unitMaxY = unit(bottom, destinationTop, destinationHeight);

  const occupancy = rasterAlphaOccupancy(source);
  const cellRange = (
    unitMin: number, unitMax: number, origin: number, span: number, size: number, count: number,
  ): readonly [number, number] => [
    Math.min(count - 1, Math.max(0, Math.floor((origin + unitMin * span) / size))),
    Math.min(count - 1, Math.max(0, Math.floor((origin + unitMax * span) / size))),
  ];
  const [firstColumn, lastColumn] = cellRange(
    unitMinX, unitMaxX, sourceLeft, sourceWidth, occupancy.cellWidth, occupancy.cols,
  );
  const [firstRow, lastRow] = cellRange(
    unitMinY, unitMaxY, sourceTop, sourceHeight, occupancy.cellHeight, occupancy.rows,
  );
  for (let row = firstRow; row <= lastRow; row += 1) {
    for (let column = firstColumn; column <= lastColumn; column += 1) {
      if (occupancy.cells[row * occupancy.cols + column]) return true;
    }
  }
  return false;
}
