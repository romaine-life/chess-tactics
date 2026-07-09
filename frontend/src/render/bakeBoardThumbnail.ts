import {
  BAKE_GEOMETRY,
  UNIT_IMG_MAX_H,
  UNIT_IMG_MAX_W,
  boardBounds,
  boardContentHash,
  boardDrawOps,
  boardSocialFramingBounds,
  uniqueDrawSrcs,
  type BakeBounds,
  type BoardDrawOp,
} from '@chess-tactics/board-render';
import type { EditorBoard } from '../ui/boardCode';

export {
  BAKE_GEOMETRY,
  boardBounds,
  boardContentHash,
  boardDrawOps,
  boardSocialFramingBounds,
  uniqueDrawSrcs,
};

type Canvas2D = HTMLCanvasElement | OffscreenCanvas;

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

function canvasToBlob(canvas: Canvas2D): Promise<Blob> {
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type: 'image/png' });
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('bakeBoardThumbnail: toBlob returned null'))), 'image/png');
  });
}

async function renderBoardCanvas(board: EditorBoard, scale: number): Promise<{ canvas: Canvas2D; bounds: BakeBounds } | null> {
  const bounds = boardBounds(board);
  const ops = boardDrawOps(board);
  const canvas = createCanvas(Math.max(1, Math.round(bounds.width * scale)), Math.max(1, Math.round(bounds.height * scale)));
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = false;

  const srcs = [...new Set(ops.map((op) => op.src))];
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

  for (const op of ops) {
    const img = images.get(op.src);
    if (!img) continue;
    paintOp(ctx, img, op, bounds, scale);
  }
  return { canvas, bounds };
}

function paintOp(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  img: HTMLImageElement,
  op: BoardDrawOp,
  bounds: BakeBounds,
  scale: number,
): void {
  if (op.contain) {
    const boxW = Math.min(op.dw, UNIT_IMG_MAX_W);
    const boxH = Math.min(op.dh, UNIT_IMG_MAX_H);
    const natW = img.naturalWidth || boxW;
    const natH = img.naturalHeight || boxH;
    const fit = Math.min(boxW / natW, boxH / natH);
    const w = natW * fit;
    const h = natH * fit;
    const cx = op.dx + (op.dw - w) / 2;
    const cy = op.dy + (op.dh - h) / 2;
    ctx.drawImage(img, (cx - bounds.minX) * scale, (cy - bounds.minY) * scale, w * scale, h * scale);
    return;
  }
  if (op.sw != null) {
    ctx.drawImage(
      img,
      op.sx ?? 0,
      op.sy ?? 0,
      op.sw,
      op.sh ?? op.dh,
      (op.dx - bounds.minX) * scale,
      (op.dy - bounds.minY) * scale,
      op.dw * scale,
      op.dh * scale,
    );
    return;
  }
  ctx.drawImage(img, (op.dx - bounds.minX) * scale, (op.dy - bounds.minY) * scale, op.dw * scale, op.dh * scale);
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
