// Bake an EditorBoard to a single flat raster (a Blob), so a long list of level rows can show
// one cheap <img> per row instead of N live isometric boards. This is the consensus
// "pre-render once and reuse" fix (MDN; Godot bakes+caches its scene thumbnails): the LIST
// uses a baked thumbnail, the SELECTED viewer stays live (StudioEditableBoard).
//
// The bake MUST match the live editor pixel-for-pixel, so it does NOT reinvent any geometry:
// it composites the SAME image srcs at the SAME projected positions the editor draws —
//   - tile positions from boardLabCellPosition (render/boardProjection),
//   - tile srcs from the studio tileset (assetFrameSrc over studioFamilies, same as the editor),
//   - feature (road/river) masks from featureMaskAt + featureFrameSrc,
//   - unit sprites from the unit roster (UnitAsset.sprite, ultimately pieceSpritePath),
//   - doodad halves from the doodad catalog,
//   - multi-cell prop halves (trees/houses) via the shared BoardStructure seat geometry
//     (structureSeatPoint + propZBracket — the same math <PropSprite> renders with).
// The render happens at the board's NATIVE tile pixel size and is z-sorted exactly like the
// DOM (tiles by x+y; doodad-back / unit / doodad-front bracket at +20000); the display layer
// (LevelThumbnail) downscales the result with nearest-neighbour.

import { boardLabCellPosition } from './boardProjection';
import {
  TILE_FRAME_HEIGHT,
  TILE_STEP_X,
  TILE_STEP_Y,
} from '../art/projectionContract';
import { studioFamilies, assetFrameSrc, type StudioAsset } from '../ui/studioBoard';
import { featureFrameSrc, fenceFrameSrc } from '../art/tileset';
import {
  unitAssets,
  hasDirectionSprite,
  MISSING_DIRECTION_SPRITE,
  type UnitAsset,
  type Direction,
  type Faction,
} from '../ui/unitCatalog';
import { doodadAsset, type DoodadAsset } from '../ui/doodadCatalog';
import { resolveFeatureOverlays, resolveFenceOverlays } from '../core/featureAutotile';
import { propZBracket, structureSeatPoint, structureSourceHalfSrc, structureSourceSprite } from './BoardStructure';
import { fenceOverlayZIndex } from './fenceOverlayDepth';
import { propDef } from '../core/props';
import { groundCoverSet, resolveGroundCover, densityFieldAt, type GroundCover } from '../core/groundCover';
import { familyOfTile } from '../core/levelBoard';
import type { TileFamilyId } from '../core/tileSockets';
import type { EditorBoard } from '../ui/boardCode';

// --- Editor render geometry (mirrors style.css, kept in ONE place) -----------------------
// The tile <img> is the 96x180 frame, placed so the cell's contact diamond (equator) seats on
// the projected point: CSS `.tileset-generated-board-tile { transform: translate(-stepX, -equator) }`
// then the img fills the frame at (0,0). Feature overlays share that exact frame.
const TILE_FRAME_W = TILE_STEP_X * 2; // 96 — the full tile sprite width
const TILE_FRAME_H = TILE_FRAME_HEIGHT; // 180 — the full tile sprite frame
const TILE_EQUATOR = 69; // --iso-tile-equator: the frame's contact diamond, from the apex
// The doodad sprite is the same 96x180 frame seated by `translate(-50%, -38.333%)` ⇒ the
// contact pixel (48,69) lands on the cell point. So its frame origin is (-stepX, -equator) too.
const DOODAD_FRAME_W = TILE_FRAME_W;
const DOODAD_FRAME_H = TILE_FRAME_H;
// The unit seat (.board-unit-seat) is a 72x86 box seated by `translate(-50%, -78%)`, with the
// sprite object-fit:contain into max 78x92 centred in that box.
const UNIT_SEAT_W = 72;
const UNIT_SEAT_H = 86;
const UNIT_SEAT_OFFSET_X = -0.5; // translate(-50%)
const UNIT_SEAT_OFFSET_Y = -0.78; // translate(-78%)
const UNIT_IMG_MAX_W = 78;
const UNIT_IMG_MAX_H = 92;

// One drawable: a source image and the destination rect it fills, plus its z for paint order.
interface DrawOp {
  src: string;
  dx: number;
  dy: number;
  dw: number;
  dh: number;
  z: number;
  /** When true, fit the natural image into (dw,dh) with object-fit:contain centring (units). */
  contain?: boolean;
  /** Source sub-rect (sx,sy,sw,sh) for a sprite-sheet frame — ground-cover tufts draw frame 0 of
   *  their horizontal sway sheet. Absent ⇒ the whole image is drawn. */
  sx?: number;
  sy?: number;
  sw?: number;
  sh?: number;
}

type Canvas2D = HTMLCanvasElement | OffscreenCanvas;

// Resolve a Studio tile id to its asset (the production families the editor paints from).
const studioTiles: StudioAsset[] = studioFamilies.flatMap((family) => family.assets);
const resolveTile = (id: string): StudioAsset | undefined => studioTiles.find((asset) => asset.id === id);
const resolveUnit = (id: string): UnitAsset | undefined => unitAssets.find((unit) => unit.id === id);
const resolveDoodad = (id: string): DoodadAsset | undefined => doodadAsset(id);

/**
 * The flat, z-sorted list of image draws for a board — the bake's "scene graph". Pure (no
 * canvas, no DOM), so it can be unit-tested and so the unique-src set is trivially derivable.
 * Mirrors StudioEditableBoard exactly: tiles + feature overlays in the cell band; doodad-back /
 * unit / doodad-front bracketing in the +20000 band.
 */
export function boardDrawOps(board: EditorBoard): DrawOp[] {
  const ops: DrawOp[] = [];

  // Tiles + feature overlays. Each cell's frame origin is the projected point shifted by the
  // CSS translate(-stepX, -equator); the img fills the 96x180 frame. One shared autotile pass
  // resolves road/river masks (see resolveFeatureOverlays); fences resolve to per-cell E/S rails.
  const isSevered = (edge: string): boolean => board.featureCuts[edge] === true;
  const isExit = (edge: string): boolean => board.featureExits[edge] === true;
  const overlays = resolveFeatureOverlays(board.features, isSevered, isExit);
  const fenceOverlays = resolveFenceOverlays(board.fences ?? {});

  for (let y = 0; y < board.rows; y += 1) {
    for (let x = 0; x < board.cols; x += 1) {
      const key = `${x},${y}`;
      const { left, top, zIndex } = boardLabCellPosition({ x, y });
      const frameX = left - TILE_STEP_X;
      const frameY = top - TILE_EQUATOR;

      const tile = board.cells[key] ? resolveTile(board.cells[key]) : undefined;
      if (tile) {
        ops.push({ src: assetFrameSrc(tile, 0), dx: frameX, dy: frameY, dw: TILE_FRAME_W, dh: TILE_FRAME_H, z: zIndex });
      }

      const feature = overlays[key];
      if (feature) {
        // road/river ribbons stay in their own cell band at +0.5, over the tile top.
        ops.push({
          src: featureFrameSrc(feature.kind, feature.material, feature.mask),
          dx: frameX,
          dy: frameY,
          dw: TILE_FRAME_W,
          dh: TILE_FRAME_H,
          z: zIndex + 0.5,
        });
      }

      const fence = fenceOverlays.get(key);
      if (fence) {
        // Edge rails are foreground objects; they match the live board-level fence layer.
        ops.push({
          src: fenceFrameSrc(fence.material, fence.mask),
          dx: frameX,
          dy: frameY,
          dw: TILE_FRAME_W,
          dh: TILE_FRAME_H,
          z: fenceOverlayZIndex({ x, y }),
        });
      }
    }
  }

  // Doodads + units share the +20000 depth band so cross-cell sorting holds (BoardDoodad.tsx).
  for (const key of new Set([...Object.keys(board.units), ...Object.keys(board.doodads)])) {
    const [x, y] = key.split(',').map(Number);
    const { left, top, zIndex } = boardLabCellPosition({ x, y });
    const base = zIndex + 20000;

    const doodadPlacement = board.doodads[key];
    const doodad = doodadPlacement ? resolveDoodad(doodadPlacement.doodadId) : undefined;
    if (doodad) {
      const sprite = doodad.sprite ?? { w: DOODAD_FRAME_W, h: DOODAD_FRAME_H, anchorX: TILE_STEP_X, anchorY: TILE_EQUATOR };
      const parts = doodad.parts?.length
        ? doodad.parts
        : [{ source: doodad.source ?? { kind: 'doodad' as const, id: doodad.id }, anchorX: sprite.anchorX, anchorY: sprite.anchorY, scale: sprite.scale ?? 1 }];
      for (const part of parts) {
        const sourceSprite = structureSourceSprite(part.source);
        const scale = part.scale ?? 1;
        ops.push({ src: structureSourceHalfSrc(part.source, 'back'), dx: left - part.anchorX * scale, dy: top - part.anchorY * scale, dw: sourceSprite.w * scale, dh: sourceSprite.h * scale, z: base - 1 });
        ops.push({ src: structureSourceHalfSrc(part.source, 'front'), dx: left - part.anchorX * scale, dy: top - part.anchorY * scale, dw: sourceSprite.w * scale, dh: sourceSprite.h * scale, z: base + 1 });
      }
    }

    const placement = board.units[key];
    const unit = placement ? resolveUnit(placement.unitId) : undefined;
    if (unit && placement) {
      const direction = placement.direction as Direction;
      const src = hasDirectionSprite(unit, direction)
        ? unit.sprite(placement.faction as Faction, direction)
        : MISSING_DIRECTION_SPRITE;
      // The seat box top-left, then the sprite is contained+centred inside it.
      const seatX = left + UNIT_SEAT_OFFSET_X * UNIT_SEAT_W;
      const seatY = top + UNIT_SEAT_OFFSET_Y * UNIT_SEAT_H;
      ops.push({ src, dx: seatX, dy: seatY, dw: UNIT_SEAT_W, dh: UNIT_SEAT_H, z: base, contain: true });
    }
  }

  // Multi-cell props (trees/houses): back/front halves bracketing the unit band exactly like
  // <PropSprite> — seated at the footprint's ground centre, z off the front-most footprint cell.
  // The DOM pulls the frame back by translate(-anchorX/w%, -anchorY/h%) of its own size, i.e.
  // the frame origin is the seat point minus the contact-anchor pixel.
  for (const [key, placement] of Object.entries(board.props ?? {})) {
    const def = propDef(placement.propId);
    if (!def) continue; // unknown prop id — skip, like the live renderer and collision bridge
    const [ax, ay] = key.split(',').map(Number);
    const { left, top } = structureSeatPoint({ x: ax, y: ay }, def.w, def.h);
    // Apply the prop's render scale. A "copy"/size-variant prop shares the base's PNG + footprint and
    // differs ONLY by scale (+ anchor) — the live <StructureSprite> sizes the frame at w/h*scale and
    // seats the contact pixel with a PERCENTAGE translate, so the anchor offset scales too. Without
    // this the variant renders at BASE size in the thumbnail.
    const { back, front } = propZBracket(ax, ay, def.w, def.h);
    const parts = def.spriteParts?.length
      ? def.spriteParts
      : [{ source: def.spriteSource ?? { kind: 'prop' as const, id: def.spriteId }, anchorX: def.sprite.anchorX, anchorY: def.sprite.anchorY, scale: def.sprite.scale ?? 1 }];
    for (const part of parts) {
      const sourceSprite = structureSourceSprite(part.source);
      const s = part.scale ?? 1;
      const dx = left - part.anchorX * s;
      const dy = top - part.anchorY * s;
      const dw = sourceSprite.w * s;
      const dh = sourceSprite.h * s;
      ops.push({ src: structureSourceHalfSrc(part.source, 'back'), dx, dy, dw, dh, z: back });
      ops.push({ src: structureSourceHalfSrc(part.source, 'front'), dx, dy, dw, dh, z: front });
    }
  }

  // Ground cover (grass/water/sand tufts) — the SAME vegetation the GAME scatters (SkirmishBoard),
  // which bakeBoardThumbnail previously omitted so grass boards read as bare. Reuse the exact game
  // logic: a board that painted NO cover densities gets the procedural densityFieldAt fill on
  // grassland; a painted board honors its densities. A fixed seed keeps the thumbnail deterministic
  // (and cacheable). Each tuft is frame 0 of its sway sheet, z-bracketed around units like
  // GroundCoverLayer (front-half over shins, back-half behind).
  const COVER_SEED = 1234;
  const coverCells: Array<{ x: number; y: number; terrain: TileFamilyId; groundCover?: GroundCover }> = [];
  for (let y = 0; y < board.rows; y += 1) {
    for (let x = 0; x < board.cols; x += 1) {
      const tileId = board.cells[`${x},${y}`];
      const terrain = tileId ? familyOfTile(tileId) : undefined;
      if (terrain && groundCoverSet(terrain)) coverCells.push({ x, y, terrain });
    }
  }
  const hasPaintedCover = Object.keys(board.cover ?? {}).length > 0;
  resolveGroundCover(coverCells, COVER_SEED, (cell) =>
    board.cover?.[`${cell.x},${cell.y}`] ?? (hasPaintedCover ? null : densityFieldAt(cell.x, cell.y, COVER_SEED)));
  for (const cell of coverCells) {
    if (!cell.groundCover) continue;
    const set = groundCoverSet(cell.terrain);
    if (!set) continue;
    const { left, top, zIndex } = boardLabCellPosition(cell);
    const base = zIndex + 20000;
    for (const tuft of cell.groundCover.tufts) {
      const meta = set.variants.find((v) => v.id === tuft.variant);
      if (!meta) continue;
      ops.push({
        src: `${set.basePath}/v${tuft.variant}.png`,
        sx: 0, sy: 0, sw: meta.frameW, sh: meta.frameH, // frame 0 of the horizontal sway sheet
        dx: left + tuft.dx - meta.baseX,
        dy: top + tuft.dy - meta.baseY,
        dw: meta.frameW,
        dh: meta.frameH,
        z: base + (tuft.dy > 0 ? 1 : -1),
      });
    }
  }

  ops.sort((a, b) => a.z - b.z);
  return ops;
}

/** Every UNIQUE image src a board's bake will draw — so each is fetched/decoded ONCE. */
export function uniqueDrawSrcs(board: EditorBoard): string[] {
  return [...new Set(boardDrawOps(board).map((op) => op.src))];
}

/**
 * A stable CONTENT hash of everything that affects a board's bake — so two boards that render
 * identically share one cached bake, and any pixel-affecting change (a moved unit, a new road,
 * a different tile) yields a new key and re-bakes. Built from the canonicalised, SORTED layers
 * (object key order must NOT matter) via FNV-1a. Pure + deterministic; unit-tested.
 */
export function boardContentHash(board: EditorBoard): string {
  const sortedEntries = (record: Record<string, unknown>): string =>
    Object.keys(record)
      .sort()
      .map((key) => `${key}=${JSON.stringify(record[key])}`)
      .join(';');
  const parts = [
    `c${board.cols}`,
    `r${board.rows}`,
    `t:${sortedEntries(board.cells)}`,
    `u:${sortedEntries(board.units)}`,
    `d:${sortedEntries(board.doodads)}`,
    `p:${sortedEntries(board.props ?? {})}`,
    `v:${sortedEntries(board.cover)}`,
    `f:${sortedEntries(board.features)}`,
    `fe:${sortedEntries(board.fences ?? {})}`,
    `x:${Object.keys(board.featureCuts).sort().join(',')}`,
  ];
  return fnv1a(parts.join('|'));
}

/** FNV-1a (32-bit) → a short hex string. Fast, deterministic, no crypto dependency. */
function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

// --- Bounds ------------------------------------------------------------------------------
// The bake canvas must cover every drawn rect at native size, with the board origin folded in
// so the first pixel is at (0,0). Derived from the actual draw rects (not the live centring
// metrics), so nothing drawn is ever clipped.
export interface BakeBounds {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

export function boardBounds(board: EditorBoard): BakeBounds {
  const ops = boardDrawOps(board);
  if (ops.length === 0) {
    // An empty board still occupies one tile frame, so the placeholder size is sane.
    return { minX: -TILE_STEP_X, minY: -TILE_EQUATOR, width: TILE_FRAME_W, height: TILE_FRAME_H };
  }
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
  return { minX, minY, width: Math.ceil(maxX - minX), height: Math.ceil(maxY - minY) };
}

// --- Image loading -----------------------------------------------------------------------
// Load each unique src ONCE, awaiting decode() so drawImage never paints a half-loaded image.
// A module-level cache survives across bakes in a session (the same tile/unit srcs recur on
// every board), so a list of 200 levels decodes each sprite a single time.
const imageCache = new Map<string, Promise<HTMLImageElement>>();

function loadImage(src: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(src);
  if (cached) return cached;
  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      // decode() is best-effort; some browsers reject for data: URLs already decoded by onload.
      img.decode().then(() => resolve(img)).catch(() => resolve(img));
    };
    img.onerror = () => reject(new Error(`bakeBoardThumbnail: failed to load ${src}`));
    img.src = src;
  });
  imageCache.set(src, promise);
  return promise;
}

// --- Canvas ------------------------------------------------------------------------------
// Prefer OffscreenCanvas (no DOM node, off the main document) but fall back to a detached
// <canvas> where it's unavailable. Both expose convertToBlob/toBlob below.
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
    // toBlob (NOT toDataURL): toDataURL holds a base64 copy per item, ballooning memory across
    // a long list; a Blob + object URL is the cheap, revocable form (MDN).
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('bakeBoardThumbnail: toBlob returned null'))), 'image/png');
  });
}

/**
 * Bake a board to a PNG Blob at its native tile pixel size (× `scale`). The caller (the
 * <img> in LevelThumbnail) downscales with nearest-neighbour, so pixel art is never
 * fractionally resampled here. `scale` should be an INTEGER (1 for the displayed size, 2 for
 * the HiDPI variant) — non-integer scales are clamped to ≥1 but pass through for flexibility.
 */
// Render the board's draw ops onto a fresh canvas at native px × `scale`, awaiting every sprite
// decode so nothing paints half-loaded. Shared by the Blob bake and the painted-bounds scan.
async function renderBoardCanvas(board: EditorBoard, scale: number): Promise<{ canvas: Canvas2D; bounds: BakeBounds } | null> {
  const bounds = boardBounds(board);
  const ops = boardDrawOps(board);
  const canvas = createCanvas(Math.max(1, Math.round(bounds.width * scale)), Math.max(1, Math.round(bounds.height * scale)));
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) return null;
  // Pixel art: nearest-neighbour at every step (the native bake is itself unscaled, but ops can
  // be drawn at integer `scale`, and unit sprites are `contain`-fit).
  ctx.imageSmoothingEnabled = false;

  // Decode every unique src once, then composite in z-order.
  const srcs = [...new Set(ops.map((op) => op.src))];
  const images = new Map<string, HTMLImageElement>();
  await Promise.all(
    srcs.map(async (src) => {
      try {
        images.set(src, await loadImage(src));
      } catch {
        // A missing sprite must not abort the whole render — skip it.
      }
    }),
  );

  for (const op of ops) {
    const img = images.get(op.src);
    if (!img) continue;
    if (op.contain) {
      // object-fit: contain into (op.dw × op.dh) capped at the seat's max box, then centred.
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
    } else if (op.sw != null) {
      // Sprite-sheet frame (ground-cover tuft): draw the source sub-rect (frame 0) into the dest.
      ctx.drawImage(img, op.sx ?? 0, op.sy ?? 0, op.sw, op.sh ?? op.dh,
        (op.dx - bounds.minX) * scale, (op.dy - bounds.minY) * scale, op.dw * scale, op.dh * scale);
    } else {
      ctx.drawImage(img, (op.dx - bounds.minX) * scale, (op.dy - bounds.minY) * scale, op.dw * scale, op.dh * scale);
    }
  }
  return { canvas, bounds };
}

export async function bakeBoardThumbnail(board: EditorBoard, opts?: { scale?: number }): Promise<Blob> {
  const scale = Math.max(1, opts?.scale ?? 1);
  const rendered = await renderBoardCanvas(board, scale);
  if (!rendered) throw new Error('bakeBoardThumbnail: 2D context unavailable');
  return canvasToBlob(rendered.canvas);
}

/**
 * The largest axis-aligned rectangle of (near-)SOLID pixels, grown outward from the opaque
 * centroid — the board's dense tile mass, excluding the transparent "headroom" above the back row
 * (where only sparse grass tufts / unit-heads poke up) and the empty diamond corners. Cropping a
 * board to THIS and cover-fitting it fills a box with solid board and can never show a transparent
 * corner as sky — which is the whole point (a diamond can't reach a rectangle's corners, so any
 * bounding-box fit leaves sky there; a solid-rectangle fit cannot).
 *
 * Pure + deterministic (an opacity predicate + a size), so it's unit-tested. Uses a summed-area
 * table for O(1) coverage queries; each edge grows while its next strip is ≥ `cov` opaque. `cov`
 * defaults to 1 — a strip must be FULLY opaque to be absorbed, so the rect is strictly solid and
 * no corner can be transparent (cov < 1 left transparent corners that read as an empty buffer).
 * Falls back to the full painted bbox if the solid core comes out degenerate (e.g. a board with a
 * central hole). Returns null only when nothing is painted.
 */
export function largestSolidRect(
  isOpaque: (x: number, y: number) => boolean,
  W: number,
  H: number,
  cov = 1,
): { x: number; y: number; w: number; h: number } | null {
  if (W <= 0 || H <= 0) return null;
  const stride = W + 1;
  const sat = new Uint32Array(stride * (H + 1)); // summed-area table of opacity
  let minX = W;
  let minY = H;
  let maxX = -1;
  let maxY = -1;
  let sumX = 0;
  let sumY = 0;
  let count = 0;
  for (let y = 0; y < H; y += 1) {
    let run = 0; // opaque pixels in this row so far
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
  // A degenerate solid core (thin sliver) → show the whole painted board rather than a strip.
  if (w * h < 0.1 * bboxW * bboxH) return { x: minX, y: minY, w: bboxW, h: bboxH };
  return { x: x0, y: y0, w, h };
}

/**
 * Bake the board's dense SOLID region to a PNG object URL (+ its pixel size). Drop it into a box
 * with `object-fit: cover` (a plain raster the browser scales — NO projection / pan / zoom fit to
 * get wrong) and it fills the box edge-to-edge, clipping the overflow, exactly how the game board
 * (skirmish) fills its view. Cropping to `largestSolidRect` (not the alpha bbox) is what makes the
 * fill total: the bbox is a diamond whose transparent corners + sparse top would show as sky at
 * the box corners; the solid rectangle has no transparent pixel to show.
 *
 * The caller MUST `URL.revokeObjectURL(url)` when it replaces the image or unmounts. `scale`
 * (integer ≥ 1, default 2) sets the raster resolution so an upscaled crop stays crisp. Returns
 * null if there's no 2D context or nothing is painted (empty board).
 */
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
  const rect = largestSolidRect((x, y) => data[(y * W + x) * 4 + 3] > 8, W, H); // alpha > 8 = painted
  if (!rect) return null;
  const crop = createCanvas(rect.w, rect.h);
  const cctx = crop.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!cctx) return null;
  cctx.imageSmoothingEnabled = false;
  cctx.drawImage(canvas, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
  const blob = await canvasToBlob(crop);
  return { url: URL.createObjectURL(blob), width: rect.w, height: rect.h };
}

// Re-export the geometry constants for the display layer (so the placeholder + <img> box use
// the SAME native aspect ratio the bake produces, keeping layout stable before the bake lands).
export const BAKE_GEOMETRY = { TILE_FRAME_W, TILE_FRAME_H, TILE_STEP_X, TILE_STEP_Y, TILE_EQUATOR } as const;
