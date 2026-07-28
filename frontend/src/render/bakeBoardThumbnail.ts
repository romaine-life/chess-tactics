import {
  BAKE_GEOMETRY,
  UNIT_IMG_MAX_H,
  UNIT_IMG_MAX_W,
  boardBounds,
  boardContentHash,
  boardDrawOps,
  boardSocialFramingBounds,
  filterPredrawnOcclusionDepthPixels,
  isPredrawnBackgroundActive,
  isVersionedPredrawnBoardSurface,
  largestSolidRect,
  predrawnOcclusionDepthMapForSurface,
  predrawnOcclusionMaskOps,
  predrawnOcclusionMasksInFront,
  rasterizePredrawnBoardPixels,
  uniqueDrawSrcs,
  type BakeBounds,
  type BoardDrawOp,
  type PredrawnOcclusionDepthMap,
} from '@chess-tactics/board-render';
import type { EditorBoard } from '../ui/boardCode';
import {
  boardCanvasScratchRegion,
  predrawnOcclusionDepthImageDimensionIssue,
} from './BoardCanvasLayer';
import { loadDecodedImage } from './imageResources';
import { versionedPredrawnImageDimensionIssue } from './PredrawnBoardLayer';

export {
  BAKE_GEOMETRY,
  boardBounds,
  boardContentHash,
  boardDrawOps,
  boardSocialFramingBounds,
  largestSolidRect,
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

export type BoardThumbnailImageLoader = (src: string) => Promise<HTMLImageElement>;

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

/**
 * Resolve thumbnail rasters while preserving optional-sprite omission and making the exact
 * immutable pre-drawn selection availability-critical. Validation happens before any canvas
 * paint so a bad plate or depth map cannot produce a unit-only or partially unoccluded bake.
 */
export async function loadBoardThumbnailImages(
  board: EditorBoard,
  sources: readonly string[],
  imageLoader: BoardThumbnailImageLoader = loadDecodedImage,
): Promise<Map<string, HTMLImageElement>> {
  const predrawnBackgroundActive = isPredrawnBackgroundActive(board);
  const versionedSurface = predrawnBackgroundActive
    && board.surface?.kind === 'predrawn'
    && isVersionedPredrawnBoardSurface(board.surface)
    ? board.surface
    : undefined;
  const backgroundSrc = versionedSurface
    ? `/api/background-versions/${encodeURIComponent(versionedSurface.backgroundVersionId)}/content`
    : undefined;
  const occlusionDepthMap = predrawnBackgroundActive
    ? predrawnOcclusionDepthMapForSurface(board.surface)
    : undefined;
  const required = new Map<string, 'background' | 'occlusion-depth'>([
    ...(backgroundSrc ? [[backgroundSrc, 'background'] as const] : []),
    ...(occlusionDepthMap ? [[occlusionDepthMap.src, 'occlusion-depth'] as const] : []),
  ]);
  const allSources = [...new Set([...sources, ...required.keys()])];
  const images = new Map<string, HTMLImageElement>();

  await Promise.all(allSources.map(async (src) => {
    let image: HTMLImageElement;
    try {
      image = await imageLoader(src);
    } catch (cause) {
      const kind = required.get(src);
      if (!kind) return;
      const label = kind === 'background' ? 'background raster' : 'occlusion depth mask';
      throw new Error(`bakeBoardThumbnail: selected immutable ${label} is unavailable: ${src}`, { cause });
    }

    if (src === backgroundSrc && versionedSurface) {
      const issue = versionedPredrawnImageDimensionIssue(
        versionedSurface,
        image.naturalWidth,
        image.naturalHeight,
      );
      if (issue) throw new Error(`bakeBoardThumbnail: ${issue}`);
    }
    if (src === occlusionDepthMap?.src) {
      const issue = predrawnOcclusionDepthImageDimensionIssue(occlusionDepthMap, image);
      if (issue) throw new Error(`bakeBoardThumbnail: ${issue}`);
    }
    images.set(src, image);
  }));

  return images;
}

async function renderBoardCanvas(board: EditorBoard, scale: number): Promise<{ canvas: Canvas2D; bounds: BakeBounds } | null> {
  const bounds = boardBounds(board);
  const ops = boardDrawOps(board);
  const predrawnBackgroundActive = isPredrawnBackgroundActive(board);
  const occlusionDepthMap = predrawnBackgroundActive
    ? predrawnOcclusionDepthMapForSurface(board.surface)
    : undefined;
  const occlusionMasks = predrawnBackgroundActive
    && board.surface?.kind === 'predrawn'
    && !isVersionedPredrawnBoardSurface(board.surface)
    ? predrawnOcclusionMaskOps(board)
    : [];
  const canvas = createCanvas(Math.max(1, Math.round(bounds.width * scale)), Math.max(1, Math.round(bounds.height * scale)));
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = false;

  const srcs = [...new Set([
    ...[...ops, ...occlusionMasks].map((op) => op.src),
    ...(occlusionDepthMap ? [occlusionDepthMap.src] : []),
  ])];
  const images = await loadBoardThumbnailImages(board, srcs);

  drawBoardThumbnailOps(ctx, ops, bounds, scale, images, occlusionMasks, undefined, occlusionDepthMap);
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
  occlusionDepthMap?: PredrawnOcclusionDepthMap,
): void {
  let scratch: BoardThumbnailScratchSurface | undefined;
  let depthScratch: BoardThumbnailScratchSurface | undefined;
  for (const op of ops) {
    const img = images.get(op.src);
    if (!img) continue;
    const masksInFront = op.layer === 'scene'
      ? predrawnOcclusionMasksInFront(op, occlusionMasks)
      : [];
    const depthImage = op.layer === 'scene' && occlusionDepthMap
      ? images.get(occlusionDepthMap.src)
      : undefined;
    if (masksInFront.length === 0 && !depthImage) {
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
    if (depthImage && occlusionDepthMap) {
      depthScratch ??= scratchFactory(region.width, region.height);
      if (depthScratch) {
        if (depthScratch.canvas.width < region.width) depthScratch.canvas.width = region.width;
        if (depthScratch.canvas.height < region.height) depthScratch.canvas.height = region.height;
        const depthContext = depthScratch.context;
        depthContext.clearRect(0, 0, region.width, region.height);
        depthContext.imageSmoothingEnabled = false;
        depthContext.globalCompositeOperation = 'source-over';
        depthContext.globalAlpha = 1;
        const mapBounds = occlusionDepthMap.worldBounds;
        depthContext.drawImage(
          depthImage,
          0,
          0,
          occlusionDepthMap.frameWidth,
          occlusionDepthMap.frameHeight,
          (mapBounds.minX - region.bounds.minX) * scale,
          (mapBounds.minY - region.bounds.minY) * scale,
          mapBounds.width * scale,
          mapBounds.height * scale,
        );
        const depthPixels = depthContext.getImageData(0, 0, region.width, region.height);
        depthPixels.data.set(filterPredrawnOcclusionDepthPixels(depthPixels.data, op.z));
        depthContext.putImageData(depthPixels, 0, 0);
      }
    }
    scratchContext.save();
    scratchContext.globalCompositeOperation = 'destination-out';
    for (const mask of masksInFront) {
      const maskImage = images.get(mask.src);
      if (maskImage) paintBoardThumbnailOp(scratchContext, maskImage, mask, region.bounds, scale);
    }
    if (depthImage && depthScratch) {
      scratchContext.drawImage(
        depthScratch.canvas,
        0,
        0,
        region.width,
        region.height,
        0,
        0,
        region.width,
        region.height,
      );
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

function largestOpaqueCanvasRect(canvas: Canvas2D): { x: number; y: number; w: number; h: number } | null {
  const context = canvas.getContext('2d') as ThumbnailContext | null;
  if (!context || canvas.width <= 0 || canvas.height <= 0) return null;
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  return largestSolidRect(
    (x, y) => pixels[(y * canvas.width + x) * 4 + 3] === 255,
    canvas.width,
    canvas.height,
  );
}

function cropCanvas(canvas: Canvas2D, rect: { x: number; y: number; w: number; h: number }): Canvas2D | null {
  const crop = createCanvas(rect.w, rect.h);
  const context = crop.getContext('2d') as ThumbnailContext | null;
  if (!context) return null;
  context.imageSmoothingEnabled = false;
  context.drawImage(canvas, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
  return crop;
}

export async function bakeBoardThumbnail(board: EditorBoard, opts?: { scale?: number }): Promise<Blob> {
  const scale = Math.max(1, opts?.scale ?? 1);
  const rendered = await renderBoardCanvas(board, scale);
  if (!rendered) throw new Error('bakeBoardThumbnail: 2D context unavailable');
  if (isPredrawnBackgroundActive(board)) {
    const rect = largestOpaqueCanvasRect(rendered.canvas);
    if (!rect) throw new Error('bakeBoardThumbnail: selected AI background has no fully opaque crop');
    const crop = cropCanvas(rendered.canvas, rect);
    if (!crop) throw new Error('bakeBoardThumbnail: crop context unavailable');
    return canvasToBlob(crop);
  }
  return canvasToBlob(rendered.canvas);
}

export async function bakeBoardPaintedImage(
  board: EditorBoard,
  opts?: { scale?: number },
): Promise<{ url: string; width: number; height: number } | null> {
  const scale = Math.max(1, Math.round(opts?.scale ?? 2));
  const rendered = await renderBoardCanvas(board, scale);
  if (!rendered) return null;
  const { canvas } = rendered;
  const W = canvas.width;
  const H = canvas.height;
  if (!W || !H) return null;
  const rect = largestOpaqueCanvasRect(canvas);
  if (!rect) return null;
  const crop = cropCanvas(canvas, rect);
  if (!crop) return null;
  const blob = await canvasToBlob(crop);
  return { url: URL.createObjectURL(blob), width: rect.w, height: rect.h };
}
