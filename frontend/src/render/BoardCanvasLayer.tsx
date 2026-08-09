import { useEffect, useMemo, useRef, type CSSProperties, type ReactElement } from 'react';
import {
  filterPredrawnOcclusionDepthPixels,
  predrawnOcclusionMasksInFront,
  type BakeBounds,
  type BoardDrawOp,
  type PredrawnOcclusionDepthMap,
} from '@chess-tactics/board-render';
import { loadDecodedImage, loadDecodedImageMap } from './imageResources';
import { createRenderEffectGeneration, settleRenderEffectGeneration } from './renderEffectGeneration';

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

/** Resize the backing store only when a complete replacement frame is ready to paint.
 * Setting width/height during React render clears the visible bitmap immediately, exposing a
 * blank compositor while asynchronous resources for the next frame are still settling. */
/**
 * How much backing store a layer gets per board-space pixel.
 *
 * The board composites in board space and the whole element is then CSS-scaled by
 * the camera's zoom, so at any zoom other than 1 the browser is resampling the
 * finished picture. For terrain that is the authored behaviour. For the scene
 * layer it means a unit is drawn at 78px and then rescaled again on the way to
 * the screen, and no amount of care inside the canvas survives that second pass.
 *
 * Passing the zoom here sizes the backing store so one board-space pixel lands on
 * one device pixel: the canvas keeps its board-space CSS box, so nothing about
 * layout or alignment with the other layers changes, and the container transform
 * then maps it 1:1. Clamped because a runaway zoom should not allocate a runaway
 * canvas, and below the floor there is nothing left to resolve.
 */
export const MIN_BOARD_RENDER_SCALE = 0.25;
export const MAX_BOARD_RENDER_SCALE = 3;

export function boardRenderScale(zoom: number | undefined): number {
  if (!Number.isFinite(zoom) || !zoom || zoom <= 0) return 1;
  return Math.min(MAX_BOARD_RENDER_SCALE, Math.max(MIN_BOARD_RENDER_SCALE, zoom));
}

export function sizeCanvasForBounds(
  canvas: Pick<HTMLCanvasElement, 'width' | 'height'>,
  bounds: BakeBounds,
  renderScale = 1,
): void {
  const scale = boardRenderScale(renderScale);
  const width = Math.max(1, Math.ceil(bounds.width * scale));
  const height = Math.max(1, Math.ceil(bounds.height * scale));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
}

function imageReady(image: CanvasImage | undefined): image is CanvasImage {
  return !!image?.complete && image.naturalWidth > 0;
}

export function predrawnOcclusionDepthImageDimensionIssue(
  map: PredrawnOcclusionDepthMap | undefined,
  image: Pick<HTMLImageElement, 'naturalWidth' | 'naturalHeight'> | undefined,
): string | null {
  if (!map) return null;
  if (image?.naturalWidth === map.frameWidth && image.naturalHeight === map.frameHeight) return null;
  return `Immutable occlusion depth dimensions do not match: expected ${map.frameWidth}×${map.frameHeight}, decoded ${image?.naturalWidth ?? 0}×${image?.naturalHeight ?? 0}.`;
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

export function isImpactOp(op: BoardDrawOp): boolean {
  return op.animation?.kind === 'structure-impact' && op.animation.frameCount > 1 && op.sw != null;
}

/** True while a one-shot impact still has frames to advance through. Once false the op is static
 *  again — it keeps drawing its final frame, so nothing needs to keep repainting for it. */
export function impactOpIsPlaying(op: BoardDrawOp, timeMs: number): boolean {
  if (!isImpactOp(op) || op.animation?.kind !== 'structure-impact') return false;
  return timeMs < op.animation.startMs + Math.max(1, op.animation.durationMs);
}

function liveSx(op: BoardDrawOp, _image: CanvasImage, timeMs: number): number {
  if (!op.sw) return op.sx ?? 0;
  if (isImpactOp(op) && op.animation?.kind === 'structure-impact') {
    const { frameCount, durationMs, startMs } = op.animation;
    const frames = Math.max(1, Math.floor(frameCount));
    const frameMs = Math.max(1, durationMs) / frames;
    // Advance, then HOLD. Clamping rather than wrapping is the whole difference from a loop:
    // the last frame is what the object looks like from now on.
    const frame = Math.min(frames - 1, Math.max(0, Math.floor((timeMs - startMs) / frameMs)));
    return (op.sx ?? 0) + frame * op.sw;
  }
  if (!isAnimatedGroundCoverOp(op) || op.animation?.kind !== 'ground-cover-sway') return op.sx ?? 0;
  const animation = op.animation;
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

/**
 * Halved copies of a source that the board is MINIFYING, built once and reused.
 *
 * Canvas2D has no mipmapping: `drawImage` takes a single bilinear tap regardless
 * of how far the source is being shrunk, so a sprite squeezed past 2:1 samples a
 * 2x2 neighbourhood out of a much larger footprint and throws the rest away.
 * With smoothing off it is worse still — one source pixel in N survives, which is
 * what turned the 512px unit renders into speckle on a zoomed-out board.
 *
 * Halving repeatedly averages every source pixel into the result, so the level we
 * finally draw from is at most 2:1 away from the destination and a single tap is
 * an honest sample of it. This is Williams' 1983 pyramid, built by hand because
 * the 2D context will not build it for us.
 */
const mipChains = new WeakMap<CanvasImage, HTMLCanvasElement[]>();

/** Below this the destination is near enough to 1:1 that a direct draw is correct. */
const MIP_MIN_MINIFICATION = 2;

function mipChainFor(img: CanvasImage): HTMLCanvasElement[] {
  const cached = mipChains.get(img);
  if (cached) return cached;
  const chain: HTMLCanvasElement[] = [];
  if (typeof document !== 'undefined') {
    let width = img.naturalWidth;
    let height = img.naturalHeight;
    let source: CanvasImageSource = img;
    while (width >= 2 && height >= 2) {
      width = Math.max(1, Math.floor(width / 2));
      height = Math.max(1, Math.floor(height / 2));
      const level = document.createElement('canvas');
      level.width = width;
      level.height = height;
      const levelCtx = level.getContext('2d');
      if (!levelCtx) break;
      levelCtx.imageSmoothingEnabled = true;
      levelCtx.imageSmoothingQuality = 'high';
      levelCtx.drawImage(source, 0, 0, width, height);
      chain.push(level);
      source = level;
    }
  }
  mipChains.set(img, chain);
  return chain;
}

/**
 * The level to sample when drawing `img` at `dw`x`dh`: the smallest one still at
 * or above the destination size. Returns the original when the op is not being
 * minified enough to matter, which is every correctly-sized sprite on the board —
 * so authored pixel art that draws at its own size keeps its exact pixels.
 */
function mipSourceFor(img: CanvasImage, dw: number, dh: number): CanvasImageSource {
  const natW = img.naturalWidth;
  const natH = img.naturalHeight;
  if (!natW || !natH || dw <= 0 || dh <= 0) return img;
  if (natW < dw * MIP_MIN_MINIFICATION && natH < dh * MIP_MIN_MINIFICATION) return img;
  let chosen: CanvasImageSource = img;
  for (const level of mipChainFor(img)) {
    if (level.width < dw || level.height < dh) break;
    chosen = level;
  }
  return chosen;
}

/**
 * Draw a minified op through its mip chain. Smoothing is enabled only for this
 * final tap, and only when we actually took a level: the board keeps its global
 * nearest-neighbour draw for everything sized for the grid.
 */
function drawMinified(
  ctx: CanvasRenderingContext2D,
  img: CanvasImage,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
): void {
  const source = mipSourceFor(img, dw, dh);
  if (source === img) {
    ctx.drawImage(img, dx, dy, dw, dh);
    return;
  }
  const smoothing = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, dx, dy, dw, dh);
  ctx.imageSmoothingEnabled = smoothing;
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
          drawMinified(ctx, img, cx, cy, w, h);
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
        drawMinified(ctx, img, dx, dy, op.dw, op.dh);
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
  occlusionDepthMap?: PredrawnOcclusionDepthMap,
  renderScale = 1,
): void {
  // Every op, mask and depth sample below is authored in board space. Scaling the
  // context rather than the coordinates keeps it that way: the only things that
  // have to know about the scale are the backing stores and the getImageData
  // window, both of which are measured in real device pixels.
  const scale = boardRenderScale(renderScale);
  // Only touch the transform when there is a scale to apply. At 1:1 this is an
  // identity write, and the server-side thumbnail renderer draws through a canvas
  // shim that implements what the unscaled path needs and no more.
  if (scale !== 1) ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, bounds.width, bounds.height);
  // At a fractional scale every op lands on fractional device pixels. Nearest
  // sampling there drops or doubles whole columns PER SPRITE, which turns a blade
  // of groundcover grass into a bright vertical streak — worse than the uniform
  // resample the container transform used to apply to the finished picture. Once
  // the layer is being scaled at all, it has to be filtered.
  ctx.imageSmoothingEnabled = scale !== 1;
  ctx.imageSmoothingQuality = 'high';
  let scratch: BoardCanvasScratchSurface | undefined;
  let depthScratch: BoardCanvasScratchSurface | undefined;
  for (const op of ops) {
    const img = images.get(op.src);
    if (!imageReady(img)) continue;
    const masksInFront = op.layer === 'scene'
      ? predrawnOcclusionMasksInFront(op, occlusionMasks)
      : [];
    const depthImage = op.layer === 'scene' && occlusionDepthMap
      ? images.get(occlusionDepthMap.src)
      : undefined;
    const hasDepthOcclusion = imageReady(depthImage);
    if (masksInFront.length === 0 && !hasDepthOcclusion) {
      paintOp(ctx, img, op, bounds, timeMs);
      continue;
    }
    // Pass the scale: the region rounds to whole PHYSICAL pixels and reports its
    // board-space origin back. Rounding to whole board pixels instead — which is
    // what omitting the scale does — lands the composite on fractional device
    // coordinates and turns every region edge into a half-pixel seam. That is what
    // drew the streaks; the atlas was innocent.
    const region = boardCanvasScratchRegion(op, bounds, scale);
    if (!region) continue;
    const regionW = region.width;
    const regionH = region.height;
    scratch ??= scratchFactory(regionW, regionH);
    if (!scratch) continue;
    if (scratch.canvas.width < regionW) scratch.canvas.width = regionW;
    if (scratch.canvas.height < regionH) scratch.canvas.height = regionH;
    const scratchCtx = scratch.context;
    if (scale !== 1) scratchCtx.setTransform(scale, 0, 0, scale, 0, 0);
    scratchCtx.clearRect(0, 0, region.bounds.width, region.bounds.height);
    scratchCtx.imageSmoothingEnabled = scale !== 1;
    scratchCtx.globalCompositeOperation = 'source-over';
    scratchCtx.globalAlpha = 1;
    paintOp(scratchCtx, img, op, region.bounds, timeMs);
    if (hasDepthOcclusion && occlusionDepthMap) {
      depthScratch ??= scratchFactory(regionW, regionH);
      if (depthScratch) {
        if (depthScratch.canvas.width < regionW) depthScratch.canvas.width = regionW;
        if (depthScratch.canvas.height < regionH) depthScratch.canvas.height = regionH;
        const depthContext = depthScratch.context;
        if (scale !== 1) depthContext.setTransform(scale, 0, 0, scale, 0, 0);
        depthContext.clearRect(0, 0, region.bounds.width, region.bounds.height);
        // The depth raster is READ back per pixel to build an erase mask, so it must
        // stay hard-sampled whatever the layer scale is: a filtered depth value is a
        // depth that never existed and it erases the wrong pixels.
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
          mapBounds.minX - region.bounds.minX,
          mapBounds.minY - region.bounds.minY,
          mapBounds.width,
          mapBounds.height,
        );
        // getImageData/putImageData address the backing store directly and ignore
        // the context transform, so this window is in device pixels, not board space.
        const depthPixels = depthContext.getImageData(0, 0, regionW, regionH);
        depthPixels.data.set(filterPredrawnOcclusionDepthPixels(depthPixels.data, op.z));
        depthContext.putImageData(depthPixels, 0, 0);
      }
    }
    scratchCtx.save();
    scratchCtx.globalCompositeOperation = 'destination-out';
    for (const mask of masksInFront) {
      const maskImage = images.get(mask.src);
      if (imageReady(maskImage)) paintOp(scratchCtx, maskImage, mask, region.bounds, timeMs);
    }
    if (hasDepthOcclusion && depthScratch) {
      // Source rect reads the scratch backing store (device pixels); the
      // destination is board space because this context carries the scale.
      scratchCtx.drawImage(
        depthScratch.canvas,
        0,
        0,
        regionW,
        regionH,
        0,
        0,
        region.bounds.width,
        region.bounds.height,
      );
    }
    scratchCtx.restore();
    ctx.drawImage(
      scratch.canvas,
      0,
      0,
      regionW,
      regionH,
      region.bounds.minX - bounds.minX,
      region.bounds.minY - bounds.minY,
      region.bounds.width,
      region.bounds.height,
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
    op.animation
      ? `${op.animation.kind},${op.animation.frameCount},${op.animation.durationMs},${
        op.animation.kind === 'structure-impact' ? op.animation.startMs : op.animation.phase}`
      : '',
    op.clipPolygons?.map((polygon) => polygon.join(',')).join(';') ?? '',
  ].join(':');
}

export function boardCanvasSources(
  ops: readonly BoardDrawOp[],
  occlusionMasks: readonly BoardDrawOp[] = EMPTY_OCCLUSION_MASKS,
  occlusionDepthMap?: PredrawnOcclusionDepthMap,
): string[] {
  return [...new Set([
    ...ops.map((op) => op.src),
    ...occlusionMasks.map((op) => op.src),
    ...(occlusionDepthMap ? [occlusionDepthMap.src] : []),
  ])];
}

export function boardCanvasFramePlan(
  ops: readonly BoardDrawOp[],
  occlusionMasks: readonly BoardDrawOp[] = EMPTY_OCCLUSION_MASKS,
  occlusionDepthMap?: PredrawnOcclusionDepthMap,
): { sources: string[]; paint: boolean } {
  return {
    sources: boardCanvasSources(ops, occlusionMasks, occlusionDepthMap),
    paint: ops.length > 0,
  };
}

export function BoardCanvasLayer({
  ops,
  bounds,
  className = 'tileset-scene-layer',
  maskTint,
  occlusionMasks = EMPTY_OCCLUSION_MASKS,
  occlusionDepthMap,
  frameTransform,
  renderScale = 1,
  onFirstFrame,
  onFrameError,
}: {
  ops: readonly BoardDrawOp[];
  bounds: BakeBounds;
  className?: string;
  /**
   * Backing store per board-space pixel. Pass the camera zoom on a layer whose art
   * is resampled to reach the board — the scene layer — so its sprites land on real
   * device pixels instead of being drawn at board size and rescaled again by the
   * container transform. Layers whose art is authored for the board leave this at 1.
   */
  renderScale?: number;
  /** Review mask: replace every drawn sprite pixel with one solid color while preserving alpha. */
  maskTint?: string;
  /** Canonical raised silhouettes that erase lower-depth additive art to reveal a pre-drawn plate. */
  occlusionMasks?: readonly BoardDrawOp[];
  /** Persisted source-aligned scene depth; selected with an immutable background version. */
  occlusionDepthMap?: PredrawnOcclusionDepthMap;
  /**
   * Per-frame op substitution for motion the op list cannot describe on its own — an entrance
   * offset, which is a moving `dy`/`opacity` rather than a sprite-sheet frame.
   *
   * Supplying one starts the repaint clock and keeps it running, so the caller clears it when the
   * motion is over. Applied at paint time, so the composed op list is still computed once: a
   * falling rock costs a repaint per frame, not a whole board rebuild per frame. Keep the function
   * identity stable across renders — it is an effect dependency.
   */
  frameTransform?: (op: BoardDrawOp, timeMs: number) => BoardDrawOp;
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
  const depthSignature = occlusionDepthMap
    ? `${occlusionDepthMap.src}:${occlusionDepthMap.frameWidth}:${occlusionDepthMap.frameHeight}:${JSON.stringify(occlusionDepthMap.worldBounds)}`
    : '';

  useEffect(() => {
    const framePlan = boardCanvasFramePlan(
      orderedOps,
      orderedOcclusionMasks,
      occlusionDepthMap,
    );

    if (framePlan.sources.length === 0) {
      // An empty compositor has no pixels to await; acknowledge during its effect so a
      // missing canvas cannot prevent the parent board from becoming ready.
      onFirstFrame?.();
      return undefined;
    }

    const generation = createRenderEffectGeneration();
    if (!framePlan.paint) {
      // A depth-bearing board can intentionally have no visible scene sprites in
      // this preview. Decode and validate its immutable mask before acknowledging
      // readiness, but do not wait for a canvas that an empty compositor does not mount.
      settleRenderEffectGeneration(generation, loadDecodedImageMap(framePlan.sources), (images) => {
        const dimensionIssue = predrawnOcclusionDepthImageDimensionIssue(
          occlusionDepthMap,
          occlusionDepthMap ? images.get(occlusionDepthMap.src) : undefined,
        );
        if (dimensionIssue) throw new Error(dimensionIssue);
        generation.requestFrame(() => onFirstFrame?.());
      }, (error) => onFrameError?.(error));
      return generation.cancel;
    }

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return undefined;

    const animated = orderedOps.some(isAnimatedGroundCoverOp) || !!frameTransform;
    const paint = (images: ReadonlyMap<string, CanvasImage>, timeMs = performance.now()): void => {
      generation.runIfCurrent(() => {
        sizeCanvasForBounds(canvas, bounds, renderScale);
        // Re-sorted after the transform: an entrance moves ops in `dy`, not in depth, but a
        // transform is free to change `z`, and the composed canvas is only correct in depth order.
        const frameOps = frameTransform
          ? orderedOps.map((op) => frameTransform(op, timeMs)).sort((a, b) => a.z - b.z)
          : orderedOps;
        drawBoardOps(
          ctx,
          frameOps,
          bounds,
          images,
          timeMs,
          maskTint,
          orderedOcclusionMasks,
          undefined,
          occlusionDepthMap,
          renderScale,
        );
      });
    };

    settleRenderEffectGeneration(generation, loadDecodedImageMap(framePlan.sources), (images) => {
      const dimensionIssue = predrawnOcclusionDepthImageDimensionIssue(
        occlusionDepthMap,
        occlusionDepthMap ? images.get(occlusionDepthMap.src) : undefined,
      );
      if (dimensionIssue) throw new Error(dimensionIssue);
      paint(images);
      generation.requestFrame(() => onFirstFrame?.());
      if (!animated) return;
      const tick = (timeMs: number): void => {
        paint(images, timeMs);
        generation.requestFrame(tick);
      };
      generation.requestFrame(tick);
    }, (error) => onFrameError?.(error));

    return generation.cancel;
  }, [bounds, depthSignature, frameTransform, maskTint, occlusionDepthMap, occlusionSignature, onFirstFrame, onFrameError, orderedOcclusionMasks, orderedOps, renderScale, signature]);

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
      style={style}
      aria-hidden="true"
    />
  );
}
