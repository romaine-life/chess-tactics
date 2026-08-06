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

/** Map one rendered board-space point back into the exact source crop used by a draw op. */
export function sourcePointForDrawOp(
  op: BoardDrawOp,
  source: Pick<RasterAlphaMask, 'width' | 'height'>,
  point: RasterPoint,
): RasterPoint | null {
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
  let unitX = (point.x - destinationLeft) / destinationWidth;
  const unitY = (point.y - destinationTop) / destinationHeight;
  if (op.flipX) unitX = 1 - unitX;
  if (unitX < 0 || unitY < 0 || unitX >= 1 || unitY >= 1) return null;
  const sourceLeft = op.sx ?? 0;
  const sourceTop = op.sy ?? 0;
  const sourceWidth = op.sw ?? source.width;
  const sourceHeight = op.sh ?? source.height;
  return {
    x: sourceLeft + unitX * sourceWidth,
    y: sourceTop + unitY * sourceHeight,
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
