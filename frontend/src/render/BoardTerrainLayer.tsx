import { useEffect, useMemo, useRef, type CSSProperties, type ReactElement } from 'react';
import { TILE_FRAME_EQUATOR_Y, TILE_FRAME_HEIGHT, TILE_STEP_X } from '../art/projectionContract';
import { boardLabCellPosition } from './boardProjection';

const TILE_FRAME_W = TILE_STEP_X * 2;
const TILE_FRAME_H = TILE_FRAME_HEIGHT;
const TILE_EQUATOR = TILE_FRAME_EQUATOR_Y;
const TILE_TOP_ANIM_MS = 1600;
const TOP_EDGE_PAD_PX = 2;

export interface TerrainCanvasCell {
  key: string;
  x: number;
  y: number;
  topSrc?: string;
  sideSrc?: string;
  featureSrc?: string;
  topAnimFrames?: number;
  drawSide?: boolean;
}

interface TerrainBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

const imageCache = new Map<string, Promise<HTMLImageElement>>();
const expandedTopCache = new Map<string, HTMLCanvasElement | null>();

function splitTopSrc(src: string): string {
  return src.replace(/\.png$/, '-top.png');
}

function splitSideSrc(src: string): string {
  return src.replace(/\.png$/, '-side.png');
}

export function terrainTopSrc(src: string, animFrames = 0): string {
  return animFrames > 1 ? src.replace(/\.png$/, '-top-anim.png') : splitTopSrc(src);
}

export function terrainSideSrc(src: string): string {
  return splitSideSrc(src);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(src);
  if (cached) return cached;
  const promise = new Promise<HTMLImageElement>((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(img);
    img.src = src;
    img.decode?.().then(() => resolve(img)).catch(() => {});
  });
  imageCache.set(src, promise);
  return promise;
}

function terrainBounds(cells: readonly TerrainCanvasCell[]): TerrainBounds {
  if (cells.length === 0) return { left: 0, top: 0, width: 1, height: 1 };
  const frames = cells.map((cell) => {
    const { left, top } = boardLabCellPosition(cell);
    return {
      left: left - TILE_STEP_X,
      top: top - TILE_EQUATOR,
      right: left - TILE_STEP_X + TILE_FRAME_W,
      bottom: top - TILE_EQUATOR + TILE_FRAME_H,
    };
  });
  const left = Math.floor(Math.min(...frames.map((frame) => frame.left)));
  const top = Math.floor(Math.min(...frames.map((frame) => frame.top)));
  const right = Math.ceil(Math.max(...frames.map((frame) => frame.right)));
  const bottom = Math.ceil(Math.max(...frames.map((frame) => frame.bottom)));
  return { left, top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
}

function terrainSignature(cells: readonly TerrainCanvasCell[]): string {
  return cells
    .map((cell) => [
      cell.key,
      cell.x,
      cell.y,
      cell.topSrc ?? '',
      cell.sideSrc ?? '',
      cell.featureSrc ?? '',
      cell.topAnimFrames ?? 0,
      cell.drawSide ? 1 : 0,
    ].join(':'))
    .join('|');
}

function uniqueSources(cells: readonly TerrainCanvasCell[]): string[] {
  const urls = new Set<string>();
  for (const cell of cells) {
    if (cell.topSrc) urls.add(cell.topSrc);
    if (cell.sideSrc && cell.drawSide !== false) urls.add(cell.sideSrc);
    if (cell.featureSrc) urls.add(cell.featureSrc);
  }
  return [...urls];
}

function dilateTransparentEdges(source: ImageData): ImageData {
  const { width, height } = source;
  const out = new Uint8ClampedArray(source.data);

  for (let pass = 0; pass < TOP_EDGE_PAD_PX; pass += 1) {
    const prev = new Uint8ClampedArray(out);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = (y * width + x) * 4;
        if (prev[index + 3] !== 0) continue;

        let r = 0;
        let g = 0;
        let b = 0;
        let a = 0;
        let count = 0;
        for (let dy = -1; dy <= 1; dy += 1) {
          const ny = y + dy;
          if (ny < 0 || ny >= height) continue;
          for (let dx = -1; dx <= 1; dx += 1) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            if (nx < 0 || nx >= width) continue;
            const nIndex = (ny * width + nx) * 4;
            const alpha = prev[nIndex + 3];
            if (alpha === 0) continue;
            r += prev[nIndex];
            g += prev[nIndex + 1];
            b += prev[nIndex + 2];
            a += alpha;
            count += 1;
          }
        }
        if (count === 0) continue;
        out[index] = Math.round(r / count);
        out[index + 1] = Math.round(g / count);
        out[index + 2] = Math.round(b / count);
        out[index + 3] = Math.round(a / count);
      }
    }
  }

  return new ImageData(out, width, height);
}

function expandedTopImage(src: string, image: HTMLImageElement, frameCount: number): HTMLCanvasElement | null {
  const cacheKey = `${src}|${Math.max(1, frameCount)}|${TOP_EDGE_PAD_PX}`;
  if (expandedTopCache.has(cacheKey)) return expandedTopCache.get(cacheKey) ?? null;

  const width = image.naturalWidth;
  const height = image.naturalHeight;
  if (width <= 0 || height <= 0) {
    expandedTopCache.set(cacheKey, null);
    return null;
  }

  try {
    const source = document.createElement('canvas');
    source.width = width;
    source.height = height;
    const sourceCtx = source.getContext('2d');
    const out = document.createElement('canvas');
    out.width = width;
    out.height = height;
    const outCtx = out.getContext('2d');
    if (!sourceCtx || !outCtx) {
      expandedTopCache.set(cacheKey, null);
      return null;
    }

    sourceCtx.imageSmoothingEnabled = false;
    sourceCtx.drawImage(image, 0, 0);
    const slices = Math.max(1, frameCount > 1 ? frameCount : Math.ceil(width / TILE_FRAME_W));
    for (let frame = 0; frame < slices; frame += 1) {
      const sx = frame * TILE_FRAME_W;
      if (sx >= width) break;
      const sw = Math.min(TILE_FRAME_W, width - sx);
      outCtx.putImageData(dilateTransparentEdges(sourceCtx.getImageData(sx, 0, sw, height)), sx, 0);
    }

    expandedTopCache.set(cacheKey, out);
    return out;
  } catch {
    expandedTopCache.set(cacheKey, null);
    return null;
  }
}

function imageReady(image: HTMLImageElement | undefined): image is HTMLImageElement {
  return !!image?.complete && image.naturalWidth > 0;
}

function topAnimationFrame(cell: TerrainCanvasCell, timeMs: number): number {
  const frames = cell.topAnimFrames ?? 0;
  if (frames <= 1) return 0;
  const phase = ((cell.x * 7 + cell.y * 13) % frames) / frames;
  return Math.floor((((timeMs / TILE_TOP_ANIM_MS) + phase) % 1) * frames);
}

function drawTopFrame(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  frame: number,
  frameCount: number,
  dx: number,
  dy: number,
): void {
  if (frameCount > 1) {
    ctx.drawImage(image, frame * TILE_FRAME_W, 0, TILE_FRAME_W, TILE_FRAME_H, dx, dy, TILE_FRAME_W, TILE_FRAME_H);
    return;
  }
  ctx.drawImage(image, dx, dy, TILE_FRAME_W, TILE_FRAME_H);
}

function drawCellSide(
  ctx: CanvasRenderingContext2D,
  cell: TerrainCanvasCell,
  bounds: TerrainBounds,
  images: ReadonlyMap<string, HTMLImageElement>,
): void {
  if (!cell.sideSrc || cell.drawSide === false) return;
  const side = images.get(cell.sideSrc);
  if (!imageReady(side)) return;
  const { left, top } = boardLabCellPosition(cell);
  const dx = left - TILE_STEP_X - bounds.left;
  const dy = top - TILE_EQUATOR - bounds.top;
  ctx.drawImage(side, dx, dy, TILE_FRAME_W, TILE_FRAME_H);
}

function drawCellTop(
  ctx: CanvasRenderingContext2D,
  cell: TerrainCanvasCell,
  bounds: TerrainBounds,
  images: ReadonlyMap<string, HTMLImageElement>,
  timeMs: number,
  expanded: boolean,
): void {
  if (!cell.topSrc) return;
  const topImg = images.get(cell.topSrc);
  if (!imageReady(topImg)) return;
  const { left, top } = boardLabCellPosition(cell);
  const dx = left - TILE_STEP_X - bounds.left;
  const dy = top - TILE_EQUATOR - bounds.top;
  const frames = cell.topAnimFrames ?? 0;
  const frame = topAnimationFrame(cell, timeMs);
  const source = expanded ? expandedTopImage(cell.topSrc, topImg, frames) : topImg;
  if (!source) return;
  drawTopFrame(ctx, source, frame, frames, dx, dy);
}

function drawCellFeature(
  ctx: CanvasRenderingContext2D,
  cell: TerrainCanvasCell,
  bounds: TerrainBounds,
  images: ReadonlyMap<string, HTMLImageElement>,
): void {
  if (!cell.featureSrc) return;
  const feature = images.get(cell.featureSrc);
  if (!imageReady(feature)) return;
  const { left, top } = boardLabCellPosition(cell);
  const dx = left - TILE_STEP_X - bounds.left;
  const dy = top - TILE_EQUATOR - bounds.top;
  ctx.drawImage(feature, dx, dy, TILE_FRAME_W, TILE_FRAME_H);
}

function drawFrame(
  ctx: CanvasRenderingContext2D,
  cells: readonly TerrainCanvasCell[],
  bounds: TerrainBounds,
  images: ReadonlyMap<string, HTMLImageElement>,
  timeMs: number,
): void {
  ctx.clearRect(0, 0, bounds.width, bounds.height);
  ctx.imageSmoothingEnabled = false;

  const ordered = [...cells].sort((a, b) => {
    const za = a.x + a.y;
    const zb = b.x + b.y;
    return za === zb ? a.x - b.x : za - zb;
  });

  for (const cell of ordered) {
    drawCellSide(ctx, cell, bounds, images);
  }

  for (const cell of ordered) {
    drawCellTop(ctx, cell, bounds, images, timeMs, true);
  }

  for (const cell of ordered) {
    drawCellTop(ctx, cell, bounds, images, timeMs, false);
    drawCellFeature(ctx, cell, bounds, images);
  }
}

export function BoardTerrainLayer({ cells }: { cells: readonly TerrainCanvasCell[] }): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const signature = useMemo(() => terrainSignature(cells), [cells]);
  const bounds = useMemo(() => terrainBounds(cells), [signature]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return undefined;

    let cancelled = false;
    let raf = 0;
    const sources = uniqueSources(cells);
    const animated = cells.some((cell) => (cell.topAnimFrames ?? 0) > 1);

    const paint = (images: ReadonlyMap<string, HTMLImageElement>, timeMs = performance.now()): void => {
      if (cancelled) return;
      drawFrame(ctx, cells, bounds, images, timeMs);
    };

    void Promise.all(sources.map(async (src): Promise<[string, HTMLImageElement]> => [src, await loadImage(src)])).then((entries) => {
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
  }, [bounds, cells, signature]);

  const style = {
    left: `${bounds.left}px`,
    top: `${bounds.top}px`,
    width: `${bounds.width}px`,
    height: `${bounds.height}px`,
  } as CSSProperties;

  return (
    <canvas
      ref={canvasRef}
      className="tileset-terrain-layer"
      width={bounds.width}
      height={bounds.height}
      style={style}
      aria-hidden="true"
    />
  );
}
