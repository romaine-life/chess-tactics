// Ground cover — a general per-tile feature: ambient vegetation (grass tufts now,
// pebbles/reeds later) scattered ON a tile, keyed by terrain. NOT a doodad (a
// doodad is a discrete prop you place); this is a density attribute of the tile,
// resolved to concrete tufts ONCE when the tile is placed/built — never per render.
//
// Authored art (the baked tuft sheets) + procedural PLACEMENT (this file): every
// game separates the two. Sheet bytes and their per-version geometry come from
// the applied backend live-media catalog; only deterministic placement policy is
// code-owned here.

import type { LiveMediaCatalog, LiveMediaSlot } from '../art/liveMediaCatalog';
import type { TileFamilyId } from './tileSockets';

export type GroundCoverDensity = 'sparse' | 'filled';

/** One scattered tuft, in cell-local board px relative to the tile contact point. */
export interface TuftInstance {
  dx: number;
  dy: number;
  variant: number;
  flip: boolean;
  phase: number; // 0..5, staggers the sway so a field never pulses in unison
}

/** Resolved at placement and cached on the cell; the toggle/value persisted is just `density`. */
export interface GroundCover {
  density: GroundCoverDensity;
  tufts: TuftInstance[];
}

export interface CoverVariantMeta {
  id: number;
  frameWidth: number;
  frameHeight: number;
  baseX: number;
  baseY: number;
  contentWidth: number;
  /** Immutable content-addressed URL from the applied catalog snapshot. */
  src: string;
}
export interface CoverSet {
  terrain: string;
  frameCount: number;
  variants: CoverVariantMeta[];
  /** Only place on a tile that borders a DIFFERENT terrain (e.g. reeds at the water's edge). */
  edgeOnly?: boolean;
  /** Instances per tile by density. Defaults to grass's {sparse:3, filled:7}; pebble/reed
   *  CLUSTERS each already hold several rocks/stalks, so they need far fewer than grass blades. */
  count?: Record<GroundCoverDensity, number>;
}

export type GroundCoverTerrain = Extract<TileFamilyId, 'grass' | 'water' | 'sand'>;

export interface GroundCoverRuntimeMetadata {
  terrain: GroundCoverTerrain;
  id: number;
  frameWidth: number;
  frameHeight: number;
  frameCount: number;
  baseX: number;
  baseY: number;
  contentWidth: number;
}

const GROUND_COVER_TERRAINS = ['grass', 'water', 'sand'] as const satisfies readonly GroundCoverTerrain[];
const GROUND_COVER_SLOT = /^groundcover\/(grass|water|sand)\/v(0|[1-9][0-9]*)\.png$/;

// Scatter/count/edge-only behavior is deterministic game logic. Pixel geometry
// is deliberately absent: every frame and anchor is hydrated from live metadata.
const PLACEMENT_POLICY: Record<GroundCoverTerrain, Pick<CoverSet, 'edgeOnly' | 'count'>> = {
  grass: {},
  water: { edgeOnly: true, count: { sparse: 2, filled: 3 } },
  sand: { count: { sparse: 2, filled: 4 } },
};

let SETS: Partial<Record<TileFamilyId, CoverSet>> = {};

function groundCoverCatalogFailure(message: string): Error {
  return new Error(`invalid ground-cover live catalog: ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function boundedInteger(value: unknown, min: number, max: number): number | null {
  return Number.isInteger(value) && Number(value) >= min && Number(value) <= max ? Number(value) : null;
}

function runtimeGroundCover(slot: LiveMediaSlot, terrain: GroundCoverTerrain, slotId: number): GroundCoverRuntimeMetadata {
  const runtime = isRecord(slot.versionMetadata.runtime) ? slot.versionMetadata.runtime : null;
  const raw = runtime && isRecord(runtime.groundCover) ? runtime.groundCover : null;
  if (!raw) throw groundCoverCatalogFailure(`${slot.slot} is missing versionMetadata.runtime.groundCover`);
  const allowed = new Set([
    'terrain', 'id', 'frameWidth', 'frameHeight', 'frameCount', 'baseX', 'baseY', 'contentWidth',
  ]);
  const unknown = Object.keys(raw).filter((key) => !allowed.has(key));
  if (unknown.length) {
    throw groundCoverCatalogFailure(`${slot.slot} groundCover metadata contains unsupported keys: ${unknown.sort().join(', ')}`);
  }
  if (raw.terrain !== terrain) throw groundCoverCatalogFailure(`${slot.slot} metadata terrain must match its slot`);
  const id = boundedInteger(raw.id, 0, 32768);
  const frameWidth = boundedInteger(raw.frameWidth, 1, 32768);
  const frameHeight = boundedInteger(raw.frameHeight, 1, 32768);
  const frameCount = boundedInteger(raw.frameCount, 1, 32768);
  const baseX = boundedInteger(raw.baseX, 0, 32767);
  const baseY = boundedInteger(raw.baseY, 0, 32767);
  const contentWidth = boundedInteger(raw.contentWidth, 1, 32768);
  if (id === null || id !== slotId) throw groundCoverCatalogFailure(`${slot.slot} metadata id must match its slot`);
  if (frameWidth === null || frameHeight === null || frameCount === null) {
    throw groundCoverCatalogFailure(`${slot.slot} frame geometry must use positive bounded integers`);
  }
  if (baseX === null || baseX >= frameWidth || baseY === null || baseY >= frameHeight) {
    throw groundCoverCatalogFailure(`${slot.slot} base anchor must lie inside one frame`);
  }
  if (contentWidth === null || contentWidth > frameWidth) {
    throw groundCoverCatalogFailure(`${slot.slot} contentWidth must fit inside one frame`);
  }
  if (slot.domain !== 'terrain' || slot.role !== 'media' || slot.media.mediaType !== 'image/png') {
    throw groundCoverCatalogFailure(`${slot.slot} must be a terrain/media image/png slot`);
  }
  if (slot.media.width !== frameWidth * frameCount || slot.media.height !== frameHeight) {
    throw groundCoverCatalogFailure(`${slot.slot} metadata does not match uploaded sheet dimensions`);
  }
  return { terrain, id, frameWidth, frameHeight, frameCount, baseX, baseY, contentWidth };
}

/** Hydrate all ground-cover sets atomically from one validated backend snapshot. */
export function applyGroundCoverCatalog(catalog: LiveMediaCatalog): void {
  const variants = new Map<GroundCoverTerrain, CoverVariantMeta[]>();
  const frameCounts = new Map<GroundCoverTerrain, number>();
  for (const slot of catalog.slots) {
    const match = GROUND_COVER_SLOT.exec(slot.slot);
    if (!match) continue;
    const terrain = match[1] as GroundCoverTerrain;
    const id = Number(match[2]);
    const metadata = runtimeGroundCover(slot, terrain, id);
    const priorFrameCount = frameCounts.get(terrain);
    if (priorFrameCount !== undefined && priorFrameCount !== metadata.frameCount) {
      throw groundCoverCatalogFailure(`${terrain} variants disagree on frameCount`);
    }
    frameCounts.set(terrain, metadata.frameCount);
    const entries = variants.get(terrain) ?? [];
    if (entries.some((entry) => entry.id === metadata.id)) {
      throw groundCoverCatalogFailure(`${terrain} repeats variant id ${metadata.id}`);
    }
    entries.push({
      id: metadata.id,
      frameWidth: metadata.frameWidth,
      frameHeight: metadata.frameHeight,
      baseX: metadata.baseX,
      baseY: metadata.baseY,
      contentWidth: metadata.contentWidth,
      src: slot.media.immutableUrl,
    });
    variants.set(terrain, entries);
  }

  const next: Partial<Record<TileFamilyId, CoverSet>> = {};
  for (const terrain of GROUND_COVER_TERRAINS) {
    const terrainVariants = variants.get(terrain);
    const frameCount = frameCounts.get(terrain);
    if (!terrainVariants?.length || frameCount === undefined) continue;
    terrainVariants.sort((left, right) => left.id - right.id);
    next[terrain] = {
      terrain,
      frameCount,
      variants: terrainVariants,
      ...PLACEMENT_POLICY[terrain],
    };
  }
  const missing = GROUND_COVER_TERRAINS.filter((terrain) => !next[terrain]?.variants.length);
  if (missing.length) {
    throw groundCoverCatalogFailure(`required terrain sets are absent: ${missing.join(', ')}`);
  }
  SETS = next;
}

export function resetGroundCoverCatalog(): void {
  SETS = {};
}

export function assertGroundCoverCatalogAvailable(): void {
  const missing = GROUND_COVER_TERRAINS.filter((terrain) => !SETS[terrain]?.variants.length);
  if (missing.length) throw groundCoverCatalogFailure(`required terrain sets are absent: ${missing.join(', ')}`);
}

export function groundCoverSet(terrain: TileFamilyId): CoverSet | undefined {
  return SETS[terrain];
}

// --- deterministic scatter (per tile) ------------------------------------------
// The tile top-diamond, in board px relative to the authored contact row (frame y=68):
// half width 46, half height 26. We scatter a few tufts inside it with a min-distance
// rule (even-but-random — blue-noise in miniature), deterministic from cell+seed.

const DIAMOND_HW = 44;
const DIAMOND_HH = 24;
const inDiamond = (dx: number, dy: number) => Math.abs(dx) / 46 + Math.abs(dy) / 26 <= 1;

function mulberry(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const COUNT: Record<GroundCoverDensity, number> = { sparse: 3, filled: 7 };
const MIN_DIST: Record<GroundCoverDensity, number> = { sparse: 17, filled: 11 };

/** Roll the tufts for one cell. Deterministic from (terrain, x, y, seed, density). */
export function rollGroundCover(
  terrain: TileFamilyId,
  x: number,
  y: number,
  seed: number,
  density: GroundCoverDensity,
): TuftInstance[] {
  const set = SETS[terrain];
  if (!set || set.variants.length === 0) return [];
  const rnd = mulberry((Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(seed, 83492791)) >>> 0);
  const target = (set.count ?? COUNT)[density];
  const minD = MIN_DIST[density];
  const tufts: TuftInstance[] = [];
  for (let tries = 0; tufts.length < target && tries < target * 14; tries += 1) {
    const dx = Math.round((rnd() * 2 - 1) * DIAMOND_HW);
    const dy = Math.round((rnd() * 2 - 1) * DIAMOND_HH);
    if (!inDiamond(dx, dy)) continue;
    // weight dy in the spacing test for the iso foreshortening so clumps read even
    if (tufts.some((t) => { const a = t.dx - dx, b = (t.dy - dy) * 1.7; return a * a + b * b < minD * minD; })) continue;
    tufts.push({
      dx,
      dy,
      variant: set.variants[Math.floor(rnd() * set.variants.length)].id,
      flip: rnd() > 0.5,
      phase: Math.floor(rnd() * 6),
    });
  }
  // back-to-front within the cell so overlapping tufts stack correctly
  tufts.sort((a, b) => a.dy - b.dy);
  return tufts;
}

// --- density field (for generated boards, where nobody painted a density) ------
// A low-frequency value-noise field decides each grass tile's default cover:
// patches of filled, stretches of sparse, and honest bare ground (null).

const hash2 = (ix: number, iy: number, s: number) => {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(s, 2654435761)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const smooth = (t: number) => t * t * (3 - 2 * t);

/** Cell-resolution density field (lattice ~5 tiles). Returns a density or null (bare). */
export function densityFieldAt(x: number, y: number, seed: number): GroundCoverDensity | null {
  const L = 5;
  const ix = Math.floor(x / L), iy = Math.floor(y / L), tx = x / L - ix, ty = y / L - iy;
  const sx = smooth(tx), sy = smooth(ty);
  const v = hash2(ix, iy, seed) * (1 - sx) * (1 - sy)
    + hash2(ix + 1, iy, seed) * sx * (1 - sy)
    + hash2(ix, iy + 1, seed) * (1 - sx) * sy
    + hash2(ix + 1, iy + 1, seed) * sx * sy;
  if (v < 0.42) return null;       // bare ground
  if (v > 0.72) return 'filled';   // dense patch
  return 'sparse';
}

/** A board cell carrying terrain + position, the minimum `resolveGroundCover` needs. */
interface CoverCell {
  x: number;
  y: number;
  terrain: TileFamilyId;
  groundCover?: GroundCover;
}

/**
 * Resolve cover onto each cell ONCE (at board build, not render). `densityFor`
 * supplies the per-cell density (painted level value, or the density field for a
 * generated board); return null to leave a cell bare.
 */
export function resolveGroundCover<T extends CoverCell>(
  cells: T[],
  seed: number,
  densityFor: (cell: T) => GroundCoverDensity | null,
): void {
  const terrainAt = new Map(cells.map((c) => [`${c.x},${c.y}`, c.terrain]));
  const bordersOther = (c: T): boolean =>
    [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
      const n = terrainAt.get(`${c.x + dx},${c.y + dy}`);
      return n !== undefined && n !== c.terrain;
    });
  for (const cell of cells) {
    const set = SETS[cell.terrain];
    if (!set) continue;
    // Edge-only cover (reeds) sits at the shoreline, not in open water.
    if (set.edgeOnly && !bordersOther(cell)) { cell.groundCover = undefined; continue; }
    const density = densityFor(cell);
    if (!density) { cell.groundCover = undefined; continue; }
    cell.groundCover = { density, tufts: rollGroundCover(cell.terrain, cell.x, cell.y, seed, density) };
  }
}
