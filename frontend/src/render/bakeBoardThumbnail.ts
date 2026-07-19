import {
  BAKE_GEOMETRY,
  UNIT_IMG_MAX_H,
  UNIT_IMG_MAX_W,
  boardBounds,
  boardContentHash,
  boardDrawOps,
  boardSocialFramingBounds,
  predrawnOcclusionMaskOps,
  predrawnOcclusionMasksInFront,
  rasterizePredrawnBoardPixels,
  uniqueDrawSrcs,
  type BakeBounds,
  type BoardDrawOp,
} from '@chess-tactics/board-render';
import type { EditorBoard } from '../ui/boardCode';
import { boardCanvasScratchRegion } from './BoardCanvasLayer';

export {
  BAKE_GEOMETRY,
  boardBounds,
  boardContentHash,
  boardDrawOps,
  boardSocialFramingBounds,
  uniqueDrawSrcs,
};

type Canvas2D = HTMLCanvasElement | OffscreenCanvas;
type ThumbnailContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface BoardThumbnailScratchSurface {
  canvas: Canvas2D;
  context: ThumbnailContext;
}

export type BoardThumbnailScratchFactory = (
  width: number,
  height: number,
) => BoardThumbnailScratchSurface | undefined;

const imageCache = new Map<string, Promise<HTMLImageElement>>();

function loadImage(src: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(src);
  if (cached) return cached;
  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      img.decode().then(() => resolve(img)).catch(() => resolve(img));
    };
    img.onerror = () => reject(new Error(`bakeBoardThumbnail: failed to load ${src}`));
    img.src = src;
  });
  imageCache.set(src, promise);
  return promise;
}

function createCanvas(width: number, height: number): Canvas2D {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export type PredrawnBoardThumbnailPainter = (
  ctx: ThumbnailContext,
  image: HTMLImageElement,
  op: BoardDrawOp,
  bounds: BakeBounds,
  scale: number,
) => void;

/** Paint one registered complete scene through the shared destination-to-source raster map. */
export const paintPredrawnBoardThumbnailOp: PredrawnBoardThumbnailPainter = (
  ctx,
  image,
  op,
  bounds,
  scale,
): void => {
  const transform = op.predrawnTransform;
  if (!transform) throw new Error('pre-drawn thumbnail op has no registered transform');
  const region = boardCanvasScratchRegion(op, bounds, scale);
  if (!region) return;

  const sourceCanvas = createCanvas(transform.frameWidth, transform.frameHeight);
  const sourceContext = sourceCanvas.getContext('2d') as ThumbnailContext | null;
  if (!sourceContext) throw new Error('pre-drawn thumbnail source context is unavailable');
  sourceContext.imageSmoothingEnabled = true;
  sourceContext.drawImage(image, 0, 0, transform.frameWidth, transform.frameHeight);
  const source = sourceContext.getImageData(0, 0, transform.frameWidth, transform.frameHeight);
  const pixels = rasterizePredrawnBoardPixels({
    width: transform.frameWidth,
    height: transform.frameHeight,
    data: source.data,
  }, transform, {
    minX: region.bounds.minX,
    minY: region.bounds.minY,
    width: region.bounds.width,
    height: region.bounds.height,
    pixelWidth: region.width,
    pixelHeight: region.height,
  });

  const targetCanvas = createCanvas(region.width, region.height);
  const targetContext = targetCanvas.getContext('2d') as ThumbnailContext | null;
  if (!targetContext) throw new Error('pre-drawn thumbnail target context is unavailable');
  const output = targetContext.createImageData(region.width, region.height);
  output.data.set(pixels);
  targetContext.putImageData(output, 0, 0);
  ctx.drawImage(
    targetCanvas,
    0,
    0,
    region.width,
    region.height,
    region.offsetX,
    region.offsetY,
    region.width,
    region.height,
  );
};

function createBoardThumbnailScratchSurface(
  width: number,
  height: number,
): BoardThumbnailScratchSurface | undefined {
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d') as ThumbnailContext | null;
  return context ? { canvas, context } : undefined;
}

function canvasToBlob(canvas: Canvas2D): Promise<Blob> {
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type: 'image/png' });
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('bakeBoardThumbnail: toBlob returned null'))), 'image/png');
  });
}

async function renderBoardCanvas(board: EditorBoard, scale: number): Promise<{ canvas: Canvas2D; bounds: BakeBounds } | null> {
  const bounds = boardBounds(board);
  const ops = boardDrawOps(board);
  const occlusionMasks = board.surface?.kind === 'predrawn' ? predrawnOcclusionMaskOps(board) : [];
  const canvas = createCanvas(Math.max(1, Math.round(bounds.width * scale)), Math.max(1, Math.round(bounds.height * scale)));
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = false;

  const srcs = [...new Set([...ops, ...occlusionMasks].map((op) => op.src))];
  const images = new Map<string, HTMLImageElement>();
  await Promise.all(
    srcs.map(async (src) => {
      try {
        images.set(src, await loadImage(src));
      } catch {
        // A missing sprite must not abort the whole render; skip it.
      }
    }),
  );

  drawBoardThumbnailOps(ctx, ops, bounds, scale, images, occlusionMasks);
  return { canvas, bounds };
}

export function drawBoardThumbnailOps(
  ctx: ThumbnailContext,
  ops: readonly BoardDrawOp[],
  bounds: BakeBounds,
  scale: number,
  images: ReadonlyMap<string, HTMLImageElement>,
  occlusionMasks: readonly BoardDrawOp[] = [],
  scratchFactory: BoardThumbnailScratchFactory = createBoardThumbnailScratchSurface,
): void {
  let scratch: BoardThumbnailScratchSurface | undefined;
  for (const op of ops) {
    const img = images.get(op.src);
    if (!img) continue;
    const masksInFront = op.layer === 'scene'
      ? predrawnOcclusionMasksInFront(op, occlusionMasks)
      : [];
    if (masksInFront.length === 0) {
      paintBoardThumbnailOp(ctx, img, op, bounds, scale);
      continue;
    }
    const region = boardCanvasScratchRegion(op, bounds, scale);
    if (!region) continue;
    scratch ??= scratchFactory(region.width, region.height);
    if (!scratch) continue;
    if (scratch.canvas.width < region.width) scratch.canvas.width = region.width;
    if (scratch.canvas.height < region.height) scratch.canvas.height = region.height;
    const scratchContext = scratch.context;
    scratchContext.clearRect(0, 0, region.width, region.height);
    scratchContext.imageSmoothingEnabled = false;
    scratchContext.globalCompositeOperation = 'source-over';
    scratchContext.globalAlpha = 1;
    paintBoardThumbnailOp(scratchContext, img, op, region.bounds, scale);
    scratchContext.save();
    scratchContext.globalCompositeOperation = 'destination-out';
    for (const mask of masksInFront) {
      const maskImage = images.get(mask.src);
      if (maskImage) paintBoardThumbnailOp(scratchContext, maskImage, mask, region.bounds, scale);
    }
    scratchContext.restore();
    ctx.drawImage(
      scratch.canvas,
      0,
      0,
      region.width,
      region.height,
      region.offsetX,
      region.offsetY,
      region.width,
      region.height,
    );
  }
}

function withOpacity(ctx: ThumbnailContext, opacity: number | undefined, draw: () => void): void {
  const factor = opacity == null ? 1 : Math.max(0, Math.min(1, opacity));
  if (factor >= 1) {
    draw();
    return;
  }
  const previous = ctx.globalAlpha;
  ctx.globalAlpha = previous * factor;
  try {
    draw();
  } finally {
    ctx.globalAlpha = previous;
  }
}

function withClipPolygons(
  ctx: ThumbnailContext,
  op: BoardDrawOp,
  bounds: BakeBounds,
  scale: number,
  draw: () => void,
): void {
  if (!op.clipPolygons?.length) {
    draw();
    return;
  }
  ctx.save();
  ctx.beginPath();
  for (const polygon of op.clipPolygons) {
    if (polygon.length < 6) continue;
    ctx.moveTo((polygon[0] - bounds.minX) * scale, (polygon[1] - bounds.minY) * scale);
    for (let index = 2; index + 1 < polygon.length; index += 2) {
      ctx.lineTo((polygon[index] - bounds.minX) * scale, (polygon[index + 1] - bounds.minY) * scale);
    }
    ctx.closePath();
  }
  ctx.clip();
  try {
    draw();
  } finally {
    ctx.restore();
  }
}

function withFlipX(
  ctx: ThumbnailContext,
  op: BoardDrawOp,
  bounds: BakeBounds,
  scale: number,
  draw: (dx: number, dy: number) => void,
): void {
  const dx = (op.dx - bounds.minX) * scale;
  const dy = (op.dy - bounds.minY) * scale;
  if (!op.flipX) {
    draw(dx, dy);
    return;
  }
  ctx.save();
  ctx.translate(dx + op.dw * scale, dy);
  ctx.scale(-1, 1);
  try {
    draw(0, 0);
  } finally {
    ctx.restore();
  }
}

export function paintBoardThumbnailOp(
  ctx: ThumbnailContext,
  img: HTMLImageElement,
  op: BoardDrawOp,
  bounds: BakeBounds,
  scale: number,
  predrawnPainter: PredrawnBoardThumbnailPainter = paintPredrawnBoardThumbnailOp,
): void {
  if (op.predrawnTransform) {
    withOpacity(ctx, op.opacity, () => predrawnPainter(ctx, img, op, bounds, scale));
    return;
  }
  withOpacity(ctx, op.opacity, () => {
    withClipPolygons(ctx, op, bounds, scale, () => {
      withFlipX(ctx, op, bounds, scale, (dx, dy) => {
        if (op.contain) {
          const boxW = Math.min(op.dw, UNIT_IMG_MAX_W);
          const boxH = Math.min(op.dh, UNIT_IMG_MAX_H);
          const natW = img.naturalWidth || boxW;
          const natH = img.naturalHeight || boxH;
          const fit = Math.min(boxW / natW, boxH / natH);
          const w = natW * fit;
          const h = natH * fit;
          const cx = dx + (op.dw - w) * scale / 2;
          const cy = dy + (op.dh - h) * scale / 2;
          ctx.drawImage(img, cx, cy, w * scale, h * scale);
          return;
        }
        if (op.sw != null) {
          ctx.drawImage(
            img,
            op.sx ?? 0,
            op.sy ?? 0,
            op.sw,
            op.sh ?? op.dh,
            dx,
            dy,
            op.dw * scale,
            op.dh * scale,
          );
          return;
        }
        ctx.drawImage(img, dx, dy, op.dw * scale, op.dh * scale);
      });
    });
  });
}

export async function bakeBoardThumbnail(board: EditorBoard, opts?: { scale?: number }): Promise<Blob> {
  const scale = Math.max(1, opts?.scale ?? 1);
  const rendered = await renderBoardCanvas(board, scale);
  if (!rendered) throw new Error('bakeBoardThumbnail: 2D context unavailable');
  return canvasToBlob(rendered.canvas);
}

export function largestSolidRect(
  isOpaque: (x: number, y: number) => boolean,
  W: number,
  H: number,
  cov = 1,
): { x: number; y: number; w: number; h: number } | null {
  if (W <= 0 || H <= 0) return null;
  const stride = W + 1;
  const sat = new Uint32Array(stride * (H + 1));
  let minX = W;
  let minY = H;
  let maxX = -1;
  let maxY = -1;
  let sumX = 0;
  let sumY = 0;
  let count = 0;
  for (let y = 0; y < H; y += 1) {
    let run = 0;
    const row = (y + 1) * stride;
    const prev = y * stride;
    for (let x = 0; x < W; x += 1) {
      if (isOpaque(x, y)) {
        run += 1;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        sumX += x;
        sumY += y;
        count += 1;
      }
      sat[row + x + 1] = sat[prev + x + 1] + run;
    }
  }
  if (count === 0) return null;
  const rectSum = (x0: number, y0: number, x1: number, y1: number): number =>
    sat[(y1 + 1) * stride + (x1 + 1)] - sat[y0 * stride + (x1 + 1)] - sat[(y1 + 1) * stride + x0] + sat[y0 * stride + x0];
  let x0 = Math.max(minX, Math.min(maxX, Math.round(sumX / count)));
  let x1 = x0;
  let y0 = Math.max(minY, Math.min(maxY, Math.round(sumY / count)));
  let y1 = y0;
  let grew = true;
  while (grew) {
    grew = false;
    if (y0 > minY && rectSum(x0, y0 - 1, x1, y0 - 1) >= cov * (x1 - x0 + 1)) { y0 -= 1; grew = true; }
    if (y1 < maxY && rectSum(x0, y1 + 1, x1, y1 + 1) >= cov * (x1 - x0 + 1)) { y1 += 1; grew = true; }
    if (x0 > minX && rectSum(x0 - 1, y0, x0 - 1, y1) >= cov * (y1 - y0 + 1)) { x0 -= 1; grew = true; }
    if (x1 < maxX && rectSum(x1 + 1, y0, x1 + 1, y1) >= cov * (y1 - y0 + 1)) { x1 += 1; grew = true; }
  }
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const bboxW = maxX - minX + 1;
  const bboxH = maxY - minY + 1;
  if (w * h < 0.1 * bboxW * bboxH) return { x: minX, y: minY, w: bboxW, h: bboxH };
  return { x: x0, y: y0, w, h };
}

export async function bakeBoardPaintedImage(
  board: EditorBoard,
  opts?: { scale?: number },
): Promise<{ url: string; width: number; height: number } | null> {
  const scale = Math.max(1, Math.round(opts?.scale ?? 2));
  const rendered = await renderBoardCanvas(board, scale);
  if (!rendered) return null;
  const { canvas } = rendered;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) return null;
  const W = canvas.width;
  const H = canvas.height;
  if (!W || !H) return null;
  const data = ctx.getImageData(0, 0, W, H).data;
  const rect = largestSolidRect((x, y) => data[(y * W + x) * 4 + 3] > 8, W, H);
  if (!rect) return null;
  const crop = createCanvas(rect.w, rect.h);
  const cctx = crop.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!cctx) return null;
  cctx.imageSmoothingEnabled = false;
  cctx.drawImage(canvas, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
  const blob = await canvasToBlob(crop);
  return { url: URL.createObjectURL(blob), width: rect.w, height: rect.h };
}
