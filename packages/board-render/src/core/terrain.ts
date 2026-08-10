// Terrain movement effects (issue #44 Track 4): cliffs/rocks/voids block movement,
// elevation limits where a piece can step — the isometric multi-height axis from
// the concepts — and water halts travel through it. Pure + deterministic, built
// from a level's terrain layer and fed into movement generation as an optional
// environment so terrain-free callers are completely unaffected.

import type { TerrainCell, TerrainType, Vec } from './types';

export interface TerrainInfo {
  terrain: TerrainType;
  elevation: number;
}

/**
 * A terrain layer indexed for movement generation.
 *
 * Flat arrays over an "x,y"-keyed Map, deliberately: the search probes terrain on
 * EVERY ray step of every generated move, and a Map keyed by a template string
 * allocates a fresh string per probe. That made `terrainAt` the single most
 * expensive function in the engine (16% of search self-time before this change).
 * Here a probe is two subtractions, a bounds test, and a typed-array read.
 *
 * `flags` and `elevations` carry everything the movement rules need, precomputed
 * once at build time — so `canTraverse`/`haltsTravel` never touch a string, a Set,
 * or the TerrainInfo objects at all. `cells` retains those objects for
 * `terrainAt`'s callers, which want the authored cell itself.
 *
 * The grid covers the authored cells' bounding box (origin included, so negative
 * coordinates index correctly). Anything outside it is unauthored — open ground at
 * elevation 0 — which is exactly what a missing Map key meant before.
 */
export interface TerrainIndex {
  /** Bounding-box origin of the authored cells. */
  readonly originX: number;
  readonly originY: number;
  readonly width: number;
  readonly height: number;
  /** Authored cell by `(y - originY) * width + (x - originX)`; undefined where unauthored. */
  readonly cells: ReadonlyArray<TerrainInfo | undefined>;
  /** TERRAIN_* bits per cell; 0 where unauthored. */
  readonly flags: Uint8Array;
  /** Elevation per cell; 0 where unauthored. */
  readonly elevations: Int32Array;
}

/** An authored cell exists here. Distinguishes "authored, elevation 0" from "unauthored". */
const TERRAIN_PRESENT = 1;
/** Terrain a piece can never stand on (cliff / rock / void). */
const TERRAIN_IMPASSABLE = 2;
/** Terrain that stops a multi-square move entering it (water). */
const TERRAIN_HALTS = 4;

/** Index a terrain layer for O(1) allocation-free lookups during movement generation. */
export function buildTerrainIndex(cells: readonly TerrainCell[]): TerrainIndex {
  if (!cells.length) {
    return { originX: 0, originY: 0, width: 0, height: 0, cells: [], flags: new Uint8Array(0), elevations: new Int32Array(0) };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const c of cells) {
    if (c.x < minX) minX = c.x;
    if (c.x > maxX) maxX = c.x;
    if (c.y < minY) minY = c.y;
    if (c.y > maxY) maxY = c.y;
  }
  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  const size = width * height;
  const infos = new Array<TerrainInfo | undefined>(size).fill(undefined);
  const flags = new Uint8Array(size);
  const elevations = new Int32Array(size);
  // Last cell wins on a duplicate coordinate — the same semantics repeated `map.set`
  // calls had.
  for (const c of cells) {
    const i = (c.y - minY) * width + (c.x - minX);
    infos[i] = { terrain: c.terrain, elevation: c.elevation };
    flags[i] = TERRAIN_PRESENT
      | (isPassableTerrain(c.terrain) ? 0 : TERRAIN_IMPASSABLE)
      | (HALTS_TRAVEL.has(c.terrain) ? TERRAIN_HALTS : 0);
    elevations[i] = c.elevation;
  }
  return { originX: minX, originY: minY, width, height, cells: infos, flags, elevations };
}

/** Flat offset of (x, y), or -1 when the coordinate lies outside the authored box. */
function offset(index: TerrainIndex, x: number, y: number): number {
  const cx = x - index.originX;
  const cy = y - index.originY;
  if (cx < 0 || cy < 0 || cx >= index.width || cy >= index.height) return -1;
  return cy * index.width + cx;
}

export function terrainAt(index: TerrainIndex, x: number, y: number): TerrainInfo | null {
  const i = offset(index, x, y);
  return i < 0 ? null : index.cells[i] ?? null;
}

export function elevationAt(index: TerrainIndex, x: number, y: number): number {
  const i = offset(index, x, y);
  return i < 0 ? 0 : index.elevations[i];
}

// Tiles a piece can never stand on. `cliff`, `rock`, and `void` are the blocking
// terrain families.
const IMPASSABLE: ReadonlySet<TerrainType> = new Set<TerrainType>(['cliff', 'rock', 'void']);

export function isPassableTerrain(t: TerrainType): boolean {
  return !IMPASSABLE.has(t);
}

// Tiles that halt continued travel. A multi-square move may END on water but
// never continue past it: entering water stops the move there. Only cells being
// entered are checked, so a piece standing on water leaves it at full range,
// and knights (no path, just a landing square) hop straight over.
const HALTS_TRAVEL: ReadonlySet<TerrainType> = new Set<TerrainType>(['water']);

/** Whether this terrain family stops a multi-square move that enters it. The un-indexed
 * counterpart of `haltsTravel`, for callers reading an authored layer rather than probing
 * a board coordinate (see rules.boardIsAllSquares). */
export function haltsTravelTerrain(t: TerrainType): boolean {
  return HALTS_TRAVEL.has(t);
}

/** Whether the cell at (x, y) stops a multi-square move that enters it. */
export function haltsTravel(index: TerrainIndex, x: number, y: number): boolean {
  const i = offset(index, x, y);
  return i >= 0 && (index.flags[i] & TERRAIN_HALTS) !== 0;
}

/** Max elevation a piece may climb in a single step; greater rises are walls. */
export const MAX_CLIMB = 1;

/**
 * Whether a piece whose origin tile sits at `originElevation` may move INTO the
 * cell at (x, y). Unauthored cells are treated as open ground (elevation 0) so a
 * partial terrain layer never traps pieces. A cell blocks traversal when its
 * terrain is impassable or it rises more than `MAX_CLIMB` above the origin —
 * descents are always allowed (you can drop off a ledge, not scale a cliff).
 */
export function canTraverse(index: TerrainIndex, originElevation: number, x: number, y: number): boolean {
  const i = offset(index, x, y);
  if (i < 0) return true;
  const f = index.flags[i];
  if ((f & TERRAIN_PRESENT) === 0) return true;
  if ((f & TERRAIN_IMPASSABLE) !== 0) return false;
  return index.elevations[i] - originElevation <= MAX_CLIMB;
}

/** Convenience: traverse-check using a Vec origin (its authored elevation). */
export function canTraverseFrom(index: TerrainIndex, from: Vec, to: Vec): boolean {
  return canTraverse(index, elevationAt(index, from.x, from.y), to.x, to.y);
}
