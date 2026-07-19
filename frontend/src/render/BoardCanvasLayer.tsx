import { useEffect, useMemo, useRef, type CSSProperties, type ReactElement } from 'react';
import {
  predrawnOcclusionMasksInFront,
  type BakeBounds,
  type BoardDrawOp,
} from '@chess-tactics/board-render';
import { loadDecodedImage, loadDecodedImageMap } from './imageResources';

type CanvasImage = HTMLImageElement;

export interface BoardCanvasScratchSurface {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
}

export type BoardCanvasScratchFactory = (
  width: number,
  height: number,
) => BoardCanvasScratchSurface | undefined;

export interface BoardCanvasScratchRegion {
  /** Board-space bounds whose origin maps to scratch pixel (0, 0). */
  bounds: BakeBounds;
  /** Destination-canvas pixel offset for the bounded scratch result. */
  offsetX: number;
  offsetY: number;
  /** Scratch/destination dimensions in physical canvas pixels. */
  width: number;
  height: number;
}

const EMPTY_OCCLUSION_MASKS: readonly BoardDrawOp[] = [];
export function loadCanvasImage(src: string): Promise<CanvasImage> {
  return loadDecodedImage(src);
}

function imageReady(image: CanvasImage | undefined): image is CanvasImage {
  return !!image?.complete && image.naturalWidth > 0;
}

function createBoardCanvasScratchSurface(
  width: number,
  height: number,
): BoardCanvasScratchSurface | undefined {
  if (typeof document === 'undefined') return undefined;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  return context ? { canvas, context } : undefined;
}

/**
 * Return the smallest whole-pixel destination region that can contain an op inside the render
 * bounds. The board-space origin is reconstructed from that rounded pixel edge so painting the op
 * and its masks into the scratch surface uses exactly the same coordinates as the main canvas.
 */
export function boardCanvasScratchRegion(
  op: BoardDrawOp,
  bounds: BakeBounds,
  scale = 1,
): BoardCanvasScratchRegion | undefined {
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const boundsRight = bounds.minX + bounds.width;
  const boundsBottom = bounds.minY + bounds.height;
  const opRight = op.dx + op.dw;
  const opBottom = op.dy + op.dh;
  const left = Math.max(bounds.minX, Math.min(op.dx, opRight));
  const top = Math.max(bounds.minY, Math.min(op.dy, opBottom));
  const right = Math.min(boundsRight, Math.max(op.dx, opRight));
  const bottom = Math.min(boundsBottom, Math.max(op.dy, opBottom));
  if (right <= left || bottom <= top) return undefined;

  const canvasWidth = Math.max(1, Math.round(bounds.width * safeScale));
  const canvasHeight = Math.max(1, Math.round(bounds.height * safeScale));
  const offsetX = Math.max(0, Math.floor((left - bounds.minX) * safeScale));
  const offsetY = Math.max(0, Math.floor((top - bounds.minY) * safeScale));
  const rightPx = Math.min(canvasWidth, Math.ceil((right - bounds.minX) * safeScale));
  const bottomPx = Math.min(canvasHeight, Math.ceil((bottom - bounds.minY) * safeScale));
  const width = rightPx - offsetX;
  const height = bottomPx - offsetY;
  if (width <= 0 || height <= 0) return undefined;

  return {
    bounds: {
      minX: bounds.minX + offsetX / safeScale,
      minY: bounds.minY + offsetY / safeScale,
      width: width / safeScale,
      height: height / safeScale,
    },
    offsetX,
    offsetY,
    width,
    height,
  };
}

export function isAnimatedGroundCoverOp(op: BoardDrawOp): boolean {
  return op.animation?.kind === 'ground-cover-sway' && op.animation.frameCount > 1 && op.sw != null;
}

function liveSx(op: BoardDrawOp, _image: CanvasImage, timeMs: number): number {
  if (!isAnimatedGroundCoverOp(op) || !op.sw) return op.sx ?? 0;
  const animation = op.animation!;
  const frameCount = Math.max(1, Math.floor(animation.frameCount));
  const durationMs = Math.max(1, animation.durationMs);
  const phase = ((animation.phase % frameCount) + frameCount) % frameCount;
  const frame = Math.floor((((timeMs / durationMs) + phase / frameCount) % 1) * frameCount);
  return frame * op.sw;
}

function withOpacity(ctx: CanvasRenderingContext2D, opacity: number | undefined, draw: () => void): void {
  if (opacity == null || opacity >= 1) {
    draw();
    return;
  }
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = Math.max(0, Math.min(1, opacity));
  draw();
  ctx.globalAlpha = prev;
}

function withFlipX(
  ctx: CanvasRenderingContext2D,
  op: BoardDrawOp,
  bounds: BakeBounds,
  draw: (dx: number, dy: number) => void,
): void {
  const dx = op.dx - bounds.minX;
  const dy = op.dy - bounds.minY;
  if (!op.flipX) {
    draw(dx, dy);
    return;
  }
  ctx.save();
  ctx.translate(dx + op.dw, dy);
  ctx.scale(-1, 1);
  draw(0, 0);
  ctx.restore();
}

function withClipPolygons(
  ctx: CanvasRenderingContext2D,
  op: BoardDrawOp,
  bounds: BakeBounds,
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
    ctx.moveTo(polygon[0] - bounds.minX, polygon[1] - bounds.minY);
    for (let index = 2; index + 1 < polygon.length; index += 2) {
      ctx.lineTo(polygon[index] - bounds.minX, polygon[index + 1] - bounds.minY);
    }
    ctx.closePath();
  }
  ctx.clip();
  draw();
  ctx.restore();
}

function paintOp(
  ctx: CanvasRenderingContext2D,
  img: CanvasImage,
  op: BoardDrawOp,
  bounds: BakeBounds,
  timeMs: number,
): void {
  withOpacity(ctx, op.opacity, () => {
    withClipPolygons(ctx, op, bounds, () => {
      withFlipX(ctx, op, bounds, (dx, dy) => {
        if (op.contain) {
          const boxW = op.dw;
          const boxH = op.dh;
          const natW = img.naturalWidth || boxW;
          const natH = img.naturalHeight || boxH;
          const fit = Math.min(boxW / natW, boxH / natH);
          const w = natW * fit;
          const h = natH * fit;
          const cx = dx + (op.dw - w) / 2;
          const cy = dy + (op.dh - h) / 2;
          ctx.drawImage(img, cx, cy, w, h);
          return;
        }
        if (op.sw != null) {
          ctx.drawImage(
            img,
            liveSx(op, img, timeMs),
            op.sy ?? 0,
            op.sw,
            op.sh ?? op.dh,
            dx,
            dy,
            op.dw,
            op.dh,
          );
          return;
        }
        ctx.drawImage(img, dx, dy, op.dw, op.dh);
      });
    });
  });
}

export function drawBoardOps(
  ctx: CanvasRenderingContext2D,
  ops: readonly BoardDrawOp[],
  bounds: BakeBounds,
  images: ReadonlyMap<string, CanvasImage>,
  timeMs: number,
  maskTint?: string,
  occlusionMasks: readonly BoardDrawOp[] = [],
  scratchFactory: BoardCanvasScratchFactory = createBoardCanvasScratchSurface,
): void {
  ctx.clearRect(0, 0, bounds.width, bounds.height);
  ctx.imageSmoothingEnabled = false;
  let scratch: BoardCanvasScratchSurface | undefined;
  for (const op of ops) {
    const img = images.get(op.src);
    if (!imageReady(img)) continue;
    const masksInFront = op.layer === 'scene'
      ? predrawnOcclusionMasksInFront(op, occlusionMasks)
      : [];
    if (masksInFront.length === 0) {
      paintOp(ctx, img, op, bounds, timeMs);
      continue;
    }
    const region = boardCanvasScratchRegion(op, bounds);
    if (!region) continue;
    scratch ??= scratchFactory(region.width, region.height);
    if (!scratch) continue;
    if (scratch.canvas.width < region.width) scratch.canvas.width = region.width;
    if (scratch.canvas.height < region.height) scratch.canvas.height = region.height;
    const scratchCtx = scratch.context;
    scratchCtx.clearRect(0, 0, region.width, region.height);
    scratchCtx.imageSmoothingEnabled = false;
    scratchCtx.globalCompositeOperation = 'source-over';
    scratchCtx.globalAlpha = 1;
    paintOp(scratchCtx, img, op, region.bounds, timeMs);
    scratchCtx.save();
    scratchCtx.globalCompositeOperation = 'destination-out';
    for (const mask of masksInFront) {
      const maskImage = images.get(mask.src);
      if (imageReady(maskImage)) paintOp(scratchCtx, maskImage, mask, region.bounds, timeMs);
    }
    scratchCtx.restore();
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
  if (maskTint) {
    ctx.save();
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = maskTint;
    ctx.fillRect(0, 0, bounds.width, bounds.height);
    ctx.restore();
  }
}

export function boundsForOps(ops: readonly BoardDrawOp[], fallback: BakeBounds): BakeBounds {
  if (ops.length === 0) return fallback;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const op of ops) {
    minX = Math.min(minX, op.dx);
    minY = Math.min(minY, op.dy);
    maxX = Math.max(maxX, op.dx + op.dw);
    maxY = Math.max(maxY, op.dy + op.dh);
  }
  return {
    minX: Math.floor(minX),
    minY: Math.floor(minY),
    width: Math.max(1, Math.ceil(maxX - minX)),
    height: Math.max(1, Math.ceil(maxY - minY)),
  };
}

function opSignature(op: BoardDrawOp): string {
  return [
    op.src,
    op.dx,
    op.dy,
    op.dw,
    op.dh,
    op.z,
    op.sx ?? '',
    op.sy ?? '',
    op.sw ?? '',
    op.sh ?? '',
    op.contain ? 1 : 0,
    op.flipX ? 1 : 0,
    op.opacity ?? '',
    op.animation ? `${op.animation.kind},${op.animation.frameCount},${op.animation.durationMs},${op.animation.phase}` : '',
    op.clipPolygons?.map((polygon) => polygon.join(',')).join(';') ?? '',
  ].join(':');
}

export function BoardCanvasLayer({
  ops,
  bounds,
  className = 'tileset-scene-layer',
  maskTint,
  occlusionMasks = EMPTY_OCCLUSION_MASKS,
  onFirstFrame,
  onFrameError,
}: {
  ops: readonly BoardDrawOp[];
  bounds: BakeBounds;
  className?: string;
  /** Review mask: replace every drawn sprite pixel with one solid color while preserving alpha. */
  maskTint?: string;
  /** Canonical raised silhouettes that erase lower-depth additive art to reveal a pre-drawn plate. */
  occlusionMasks?: readonly BoardDrawOp[];
  onFirstFrame?: () => void;
  onFrameError?: (error: unknown) => void;
}): ReactElement | null {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const orderedOps = useMemo(() => [...ops].sort((a, b) => a.z - b.z), [ops]);
  const signature = useMemo(() => orderedOps.map(opSignature).join('|'), [orderedOps]);
  const orderedOcclusionMasks = useMemo(
    () => [...occlusionMasks].sort((a, b) => a.z - b.z),
    [occlusionMasks],
  );
  const occlusionSignature = useMemo(
    () => orderedOcclusionMasks.map(opSignature).join('|'),
    [orderedOcclusionMasks],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return undefined;

    let cancelled = false;
    let raf = 0;
    const sources = [...new Set([...orderedOps, ...orderedOcclusionMasks].map((op) => op.src))];
    const animated = orderedOps.some(isAnimatedGroundCoverOp);

    const paint = (images: ReadonlyMap<string, CanvasImage>, timeMs = performance.now()): void => {
      if (!cancelled) drawBoardOps(
        ctx,
        orderedOps,
        bounds,
        images,
        timeMs,
        maskTint,
        orderedOcclusionMasks,
      );
    };

    if (sources.length === 0) {
      // An empty compositor has no pixels to await; acknowledge during its effect so a
      // sibling's state update cannot repeatedly cancel a scheduled empty-frame callback.
      onFirstFrame?.();
      return undefined;
    }

    void loadDecodedImageMap(sources).then((images) => {
      paint(images);
      requestAnimationFrame(() => onFirstFrame?.());
      if (!animated) return;
      const tick = (timeMs: number): void => {
        paint(images, timeMs);
        raf = window.requestAnimationFrame(tick);
      };
      raf = window.requestAnimationFrame(tick);
    }).catch((error) => onFrameError?.(error));

    return () => {
      cancelled = true;
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [bounds, maskTint, occlusionSignature, onFirstFrame, onFrameError, orderedOcclusionMasks, orderedOps, signature]);

  if (orderedOps.length === 0) return null;

  const style = {
    left: `${bounds.minX}px`,
    top: `${bounds.minY}px`,
    width: `${bounds.width}px`,
    height: `${bounds.height}px`,
  } as CSSProperties;

  return (
    <canvas
      ref={canvasRef}
      className={className}
      width={bounds.width}
      height={bounds.height}
      style={style}
      aria-hidden="true"
    />
  );
}
