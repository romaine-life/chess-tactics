import { useEffect, useMemo, useRef, type CSSProperties, type ReactElement } from 'react';
import { TILE_FRAME_EQUATOR_Y, TILE_FRAME_HEIGHT, TILE_STEP_X, TILE_STEP_Y } from '../art/projectionContract';
import { macroTileAsset, macroTileBreakIndices, macroTileFrame, type MacroTilePlacement } from '../core/macroTiles';
import { boardLabCellPosition } from './boardProjection';
import { loadingError, loadingMark, loadingMeasure } from '../diagnostics/loadingTimeline';
import {
  TERRAIN_SIDE_FACE_COLUMN,
  TERRAIN_SIDE_FACES,
  type TerrainSideFace,
  type TerrainSideFaces,
} from '@chess-tactics/board-render';
import { loadDecodedImageMap } from './imageResources';

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
  sideFaces?: TerrainSideFaces<string>;
  featureSrc?: string;
  topAnimFrames?: number;
  /** Keep a multi-frame source on frame zero without scheduling continuous canvas repaints. */
  animate?: boolean;
}

export interface TerrainCanvasMacroTile {
  key: string;
  x: number;
  y: number;
  src: string;
  columns: number;
  rows: number;
  breaks?: readonly number[];
}

export function terrainCanvasMacroTiles(placements: readonly MacroTilePlacement[] | undefined): TerrainCanvasMacroTile[] {
  return (placements ?? []).flatMap((placement, index) => {
    const asset = macroTileAsset(placement.assetId);
    return asset ? [{
      key: `${placement.assetId}:${placement.x},${placement.y}:${index}`,
      x: placement.x,
      y: placement.y,
      src: asset.src,
      columns: asset.columns,
      rows: asset.rows,
      breaks: macroTileBreakIndices(placement),
    }] : [];
  });
}

interface TerrainBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

const expandedTopCache = new Map<string, HTMLCanvasElement | null>();

function splitTopSrc(src: string): string {
  return src.replace(/\.png$/, '-top.png');
}


export function terrainTopSrc(src: string, animFrames = 0): string {
  if (src.startsWith('/api/media/')) return src;
  return animFrames > 1 ? src.replace(/\.png$/, '-top-anim.png') : splitTopSrc(src);
}


function terrainBounds(cells: readonly TerrainCanvasCell[], macroTiles: readonly TerrainCanvasMacroTile[]): TerrainBounds {
  if (cells.length === 0 && macroTiles.length === 0) return { left: 0, top: 0, width: 1, height: 1 };
  const frames = cells.map((cell) => {
    const { left, top } = boardLabCellPosition(cell);
    return {
      left: left - TILE_STEP_X,
      top: top - TILE_EQUATOR,
      right: left - TILE_STEP_X + TILE_FRAME_W,
      bottom: top - TILE_EQUATOR + TILE_FRAME_H,
    };
  });
  for (const macroTile of macroTiles) {
    const { left, top } = boardLabCellPosition(macroTile);
    const frame = macroTileFrame(macroTile);
    frames.push({
      left: left + frame.left,
      top: top + frame.top,
      right: left + frame.left + frame.width,
      bottom: top + frame.top + frame.height,
    });
  }
  const left = Math.floor(Math.min(...frames.map((frame) => frame.left)));
  const top = Math.floor(Math.min(...frames.map((frame) => frame.top)));
  const right = Math.ceil(Math.max(...frames.map((frame) => frame.right)));
  const bottom = Math.ceil(Math.max(...frames.map((frame) => frame.bottom)));
  return { left, top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
}

function terrainSignature(cells: readonly TerrainCanvasCell[], macroTiles: readonly TerrainCanvasMacroTile[]): string {
  const cellSignature = cells
    .map((cell) => [
      cell.key,
      cell.x,
      cell.y,
      cell.topSrc ?? '',
      cell.featureSrc ?? '',
      cell.topAnimFrames ?? 0,
      cell.animate === false ? 0 : 1,
      ...TERRAIN_SIDE_FACES.flatMap((face) => [
        cell.sideFaces?.[face].exposed ? 1 : 0,
        cell.sideFaces?.[face].material ?? '',
      ]),
    ].join(':'))
    .join('|');
  const macroTileSignature = macroTiles
    .map((macroTile) => [macroTile.key, macroTile.x, macroTile.y, macroTile.src, macroTile.columns, macroTile.rows, (macroTile.breaks ?? []).join(',')].join(':'))
    .join('|');
  return `${cellSignature}||${macroTileSignature}`;
}

export function macroTileOwnedCellKeys(macroTiles: readonly TerrainCanvasMacroTile[]): Set<string> {
  const owned = new Set<string>();
  for (const macroTile of macroTiles) {
    const breaks = new Set(macroTile.breaks ?? []);
    for (let dy = 0; dy < macroTile.rows; dy += 1) {
      for (let dx = 0; dx < macroTile.columns; dx += 1) {
        if (breaks.has(dy * macroTile.columns + dx)) continue;
        owned.add(`${macroTile.x + dx},${macroTile.y + dy}`);
      }
    }
  }
  return owned;
}

export type TerrainTopFootprintDiamond = readonly [
  { x: number; y: number },
  { x: number; y: number },
  { x: number; y: number },
  { x: number; y: number },
];

/** Canonical logical top footprint used to clip the seam-repair pass. */
export function terrainTopFootprintDiamonds(cells: readonly TerrainCanvasCell[]): TerrainTopFootprintDiamond[] {
  return cells.flatMap((cell) => {
    if (!cell.topSrc) return [];
    const { left, top } = boardLabCellPosition(cell);
    return [[
      { x: left, y: top - TILE_STEP_Y },
      { x: left + TILE_STEP_X, y: top },
      { x: left, y: top + TILE_STEP_Y },
      { x: left - TILE_STEP_X, y: top },
    ] as TerrainTopFootprintDiamond];
  });
}

function uniqueSources(cells: readonly TerrainCanvasCell[], macroTiles: readonly TerrainCanvasMacroTile[]): string[] {
  const urls = new Set<string>();
  const macroOwned = macroTileOwnedCellKeys(macroTiles);
  for (const cell of cells) {
    if (cell.topSrc && !macroOwned.has(`${cell.x},${cell.y}`)) urls.add(cell.topSrc);
    for (const face of TERRAIN_SIDE_FACES) {
      const side = cell.sideFaces?.[face];
      if (side?.exposed && side.material) urls.add(side.material);
    }
    if (cell.featureSrc) urls.add(cell.featureSrc);
  }
  for (const macroTile of macroTiles) urls.add(macroTile.src);
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
  if (frames <= 1 || cell.animate === false) return 0;
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

export interface TerrainSideDrawSlice {
  face: TerrainSideFace;
  src: string;
  sourceX: number;
  destinationX: number;
  width: number;
}

export function terrainSideDrawSlices(cell: TerrainCanvasCell): TerrainSideDrawSlice[] {
  return TERRAIN_SIDE_FACES.flatMap((face) => {
    const side = cell.sideFaces?.[face];
    if (!side?.exposed || !side.material) return [];
    const x = TERRAIN_SIDE_FACE_COLUMN[face] * TILE_STEP_X;
    return [{ face, src: side.material, sourceX: x, destinationX: x, width: TILE_STEP_X }];
  });
}

function drawCellSides(
  ctx: CanvasRenderingContext2D,
  cell: TerrainCanvasCell,
  bounds: TerrainBounds,
  images: ReadonlyMap<string, HTMLImageElement>,
): void {
  const { left, top } = boardLabCellPosition(cell);
  const dx = left - TILE_STEP_X - bounds.left;
  const dy = top - TILE_EQUATOR - bounds.top;
  for (const slice of terrainSideDrawSlices(cell)) {
    const side = images.get(slice.src);
    if (!imageReady(side)) continue;
    ctx.drawImage(
      side,
      slice.sourceX,
      0,
      slice.width,
      TILE_FRAME_H,
      dx + slice.destinationX,
      dy,
      slice.width,
      TILE_FRAME_H,
    );
  }
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

function drawMacroTile(
  ctx: CanvasRenderingContext2D,
  macroTile: TerrainCanvasMacroTile,
  bounds: TerrainBounds,
  images: ReadonlyMap<string, HTMLImageElement>,
): void {
  const image = images.get(macroTile.src);
  if (!imageReady(image)) return;
  const { left, top } = boardLabCellPosition(macroTile);
  const frame = macroTileFrame(macroTile);
  const breaks = macroTile.breaks ?? [];
  if (breaks.length > 0) {
    const broken = new Set(breaks);
    ctx.save();
    ctx.beginPath();
    for (let dy = 0; dy < macroTile.rows; dy += 1) {
      for (let dx = 0; dx < macroTile.columns; dx += 1) {
        if (broken.has(dy * macroTile.columns + dx)) continue;
        const center = boardLabCellPosition({ x: macroTile.x + dx, y: macroTile.y + dy });
        const cx = center.left - bounds.left;
        const cy = center.top - bounds.top;
        ctx.moveTo(cx, cy - TILE_STEP_Y);
        ctx.lineTo(cx + TILE_STEP_X, cy);
        ctx.lineTo(cx, cy + TILE_STEP_Y);
        ctx.lineTo(cx - TILE_STEP_X, cy);
        ctx.closePath();
      }
    }
    ctx.clip();
  }
  ctx.drawImage(
    image,
    left + frame.left - bounds.left,
    top + frame.top - bounds.top,
    frame.width,
    frame.height,
  );
  if (breaks.length > 0) ctx.restore();
}

function drawFrame(
  ctx: CanvasRenderingContext2D,
  cells: readonly TerrainCanvasCell[],
  macroTiles: readonly TerrainCanvasMacroTile[],
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
  const macroOwned = macroTileOwnedCellKeys(macroTiles);

  for (const cell of ordered) {
    drawCellSides(ctx, cell, bounds, images);
  }

  // The dilated pass exists only to seal internal raster seams. Clip it to the union of
  // canonical occupied diamonds so it cannot paint a top-colour apron beyond the grid.
  ctx.save();
  ctx.beginPath();
  for (const [north, east, south, west] of terrainTopFootprintDiamonds(cells)) {
    ctx.moveTo(north.x - bounds.left, north.y - bounds.top);
    ctx.lineTo(east.x - bounds.left, east.y - bounds.top);
    ctx.lineTo(south.x - bounds.left, south.y - bounds.top);
    ctx.lineTo(west.x - bounds.left, west.y - bounds.top);
    ctx.closePath();
  }
  ctx.clip();
  for (const cell of ordered) {
    if (!macroOwned.has(`${cell.x},${cell.y}`)) drawCellTop(ctx, cell, bounds, images, timeMs, true);
  }
  ctx.restore();

  for (const cell of ordered) {
    if (!macroOwned.has(`${cell.x},${cell.y}`)) drawCellTop(ctx, cell, bounds, images, timeMs, false);
  }

  for (const macroTile of macroTiles) drawMacroTile(ctx, macroTile, bounds, images);
  for (const cell of ordered) drawCellFeature(ctx, cell, bounds, images);
}

export function BoardTerrainLayer({
  cells,
  macroTiles = [],
  onFirstFrame,
  onFrameError,
}: {
  cells: readonly TerrainCanvasCell[];
  macroTiles?: readonly TerrainCanvasMacroTile[];
  onFirstFrame?: () => void;
  onFrameError?: (error: unknown) => void;
}): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const signature = useMemo(() => terrainSignature(cells, macroTiles), [cells, macroTiles]);
  const bounds = useMemo(() => terrainBounds(cells, macroTiles), [signature]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return undefined;

    let cancelled = false;
    let raf = 0;
    const sources = uniqueSources(cells, macroTiles);
    const startedAt = performance.now();
    loadingMark('terrain-canvas', 'renderer-load-start', { assetCount: sources.length, cellCount: cells.length });
    const macroOwned = macroTileOwnedCellKeys(macroTiles);
    const animated = cells.some((cell) => !macroOwned.has(`${cell.x},${cell.y}`) && cell.animate !== false && (cell.topAnimFrames ?? 0) > 1);

    const paint = (images: ReadonlyMap<string, HTMLImageElement>, timeMs = performance.now()): void => {
      if (cancelled) return;
      drawFrame(ctx, cells, macroTiles, bounds, images, timeMs);
    };

    void loadDecodedImageMap(sources).then((images) => {
      paint(images);
      requestAnimationFrame(() => {
        loadingMeasure('terrain-canvas', 'first-painted-frame', startedAt, { assetCount: sources.length, cellCount: cells.length });
        onFirstFrame?.();
      });
      if (!animated) return;
      const tick = (timeMs: number): void => {
        paint(images, timeMs);
        raf = window.requestAnimationFrame(tick);
      };
      raf = window.requestAnimationFrame(tick);
    }).catch((error) => {
      loadingError('terrain-canvas', 'renderer-load-failed', error);
      onFrameError?.(error);
    });

    return () => {
      cancelled = true;
      if (raf) window.cancelAnimationFrame(raf);
    };
  // `cells` and `macroTiles` are commonly rebuilt as equivalent arrays during editor renders.
  // Depending on their identities cancels an in-flight image load and can starve a static feature
  // pass until several unrelated renders have occurred. `signature` is the complete deterministic
  // content dependency, and `bounds` is memoized from that signature.
  }, [bounds, signature, onFirstFrame, onFrameError]); // eslint-disable-line react-hooks/exhaustive-deps

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
