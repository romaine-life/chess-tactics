import { useEffect, useMemo, useRef, type CSSProperties, type ReactElement } from 'react';
import {
  type BakeBounds,
  type BoardDrawOp,
} from '@chess-tactics/board-render';

const GROUND_COVER_ANIM_MS = 1140;

type CanvasImage = HTMLImageElement;

const imageCache = new Map<string, Promise<CanvasImage>>();

export function loadCanvasImage(src: string): Promise<CanvasImage> {
  const cached = imageCache.get(src);
  if (cached) return cached;
  const promise = new Promise<CanvasImage>((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(img);
    img.src = src;
    img.decode?.().catch(() => {});
  });
  imageCache.set(src, promise);
  return promise;
}

function imageReady(image: CanvasImage | undefined): image is CanvasImage {
  return !!image?.complete && image.naturalWidth > 0;
}

export function isAnimatedGroundCoverOp(op: BoardDrawOp): boolean {
  return op.src.includes('/assets/groundcover/') && op.sw != null;
}

function liveSx(op: BoardDrawOp, image: CanvasImage, timeMs: number): number {
  if (!isAnimatedGroundCoverOp(op) || !op.sw) return op.sx ?? 0;
  const frameCount = Math.max(1, Math.floor((image.naturalWidth || op.sw) / op.sw));
  const phase = ((op.dx * 17 + op.dy * 29) % frameCount + frameCount) % frameCount;
  const frame = Math.floor((((timeMs / GROUND_COVER_ANIM_MS) + phase / frameCount) % 1) * frameCount);
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

function paintOp(
  ctx: CanvasRenderingContext2D,
  img: CanvasImage,
  op: BoardDrawOp,
  bounds: BakeBounds,
  timeMs: number,
): void {
  withOpacity(ctx, op.opacity, () => {
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
}

export function drawBoardOps(
  ctx: CanvasRenderingContext2D,
  ops: readonly BoardDrawOp[],
  bounds: BakeBounds,
  images: ReadonlyMap<string, CanvasImage>,
  timeMs: number,
): void {
  ctx.clearRect(0, 0, bounds.width, bounds.height);
  ctx.imageSmoothingEnabled = false;
  for (const op of ops) {
    const img = images.get(op.src);
    if (!imageReady(img)) continue;
    paintOp(ctx, img, op, bounds, timeMs);
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
  ].join(':');
}

export function BoardCanvasLayer({
  ops,
  bounds,
  className = 'tileset-scene-layer',
}: {
  ops: readonly BoardDrawOp[];
  bounds: BakeBounds;
  className?: string;
}): ReactElement | null {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const orderedOps = useMemo(() => [...ops].sort((a, b) => a.z - b.z), [ops]);
  const signature = useMemo(() => orderedOps.map(opSignature).join('|'), [orderedOps]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return undefined;

    let cancelled = false;
    let raf = 0;
    const sources = [...new Set(orderedOps.map((op) => op.src))];
    const animated = orderedOps.some(isAnimatedGroundCoverOp);

    const paint = (images: ReadonlyMap<string, CanvasImage>, timeMs = performance.now()): void => {
      if (!cancelled) drawBoardOps(ctx, orderedOps, bounds, images, timeMs);
    };

    void Promise.all(sources.map(async (src): Promise<[string, CanvasImage]> => [src, await loadCanvasImage(src)])).then((entries) => {
      const images = new Map(entries);
      paint(images);
      if (!animated) return;
      const tick = (timeMs: number): void => {
        paint(images, timeMs);
        raf = window.requestAnimationFrame(tick);
      };
      raf = window.requestAnimationFrame(tick);
    });

    return () => {
      cancelled = true;
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [bounds, orderedOps, signature]);

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
