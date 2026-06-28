// Linear-feature autotiling (roads now; rivers later). A "feature" is a ribbon a
// level author DRAWS across cells — the engine derives each cell's art from which
// of its 4 cardinal neighbours also carry the same feature. This is the canonical
// 4-bit connection / "edge Wang" autotile (Godot "Match Sides", Tiled edge set,
// RPG Maker wall autotile): 16 masks → straight / corner / T / cross / dead-end /
// isolated. Pure + deterministic; the editor, the solver, and the renderer all
// resolve a cell's piece through this one table.
//
// Bit + direction convention is pinned to the board projection (boardProjection.ts:
// left=(x-y)·stepX, top=(x+y)·stepY) AND to the baked sprite geometry
// (scripts/build-road-tiles.py). Changing one without the others breaks ribbon
// continuity across the diamond seam.
//
//   bit  dir  grid neighbour   screen edge of the diamond
//   1    N    (x,  y-1)        upper-right (NE)
//   2    E    (x+1, y)         lower-right (SE)
//   4    S    (x,  y+1)        lower-left  (SW)
//   8    W    (x-1, y)         upper-left  (NW)

export type FeatureKind = 'road';

// A road's surface look. Roads are one connectivity class (all roads connect
// regardless of material — the shape flows, the surface can change per cell), but
// the author picks which material to paint. Each is a baked 16-mask set
// (road-<material>-<mask>.png); keep this list in sync with scripts/build-road-tiles.py.
export type RoadMaterial = 'dirt' | 'stone' | 'pebble';
export const ROAD_MATERIALS: readonly RoadMaterial[] = ['dirt', 'stone', 'pebble'];
export const ROAD_MATERIAL_LABELS: Record<RoadMaterial, string> = {
  dirt: 'Dirt',
  stone: 'Cobblestone',
  pebble: 'Gravel',
};
export const DEFAULT_ROAD_MATERIAL: RoadMaterial = 'stone';

export type FeatureEdge = 'N' | 'E' | 'S' | 'W';

export interface FeatureDir {
  edge: FeatureEdge;
  dx: number;
  dy: number;
  bit: number;
}

/** Edge order is N, E, S, W — bits 1, 2, 4, 8. Frozen; see the header note. */
export const FEATURE_DIRS: readonly FeatureDir[] = [
  { edge: 'N', dx: 0, dy: -1, bit: 1 },
  { edge: 'E', dx: 1, dy: 0, bit: 2 },
  { edge: 'S', dx: 0, dy: 1, bit: 4 },
  { edge: 'W', dx: -1, dy: 0, bit: 8 },
];

export const featureKey = (x: number, y: number): string => `${x},${y}`;

/** The connection mask (0–15) for the cell at (x, y) given the set of featured cells. */
export function featureMaskAt(present: ReadonlySet<string>, x: number, y: number): number {
  let mask = 0;
  for (const dir of FEATURE_DIRS) {
    if (present.has(featureKey(x + dir.dx, y + dir.dy))) mask |= dir.bit;
  }
  return mask;
}

/** Compute the mask for every featured cell. Keys are "x,y"; values are 0–15. */
export function featureMaskMap(present: ReadonlySet<string>): Map<string, number> {
  const masks = new Map<string, number>();
  for (const key of present) {
    const [x, y] = key.split(',').map(Number);
    masks.set(key, featureMaskAt(present, x, y));
  }
  return masks;
}

/**
 * Cells whose mask must be recomputed after `changed` cells were painted or
 * erased: the changed cells themselves plus their 4 neighbours (a new segment
 * turns a neighbour's dead-end into a straight, a straight into a T, etc.). Used
 * for incremental re-solves; callers can also just rebuild the whole map.
 */
export function featureDirtySet(changed: Iterable<string>): Set<string> {
  const dirty = new Set<string>();
  for (const key of changed) {
    const [x, y] = key.split(',').map(Number);
    dirty.add(key);
    for (const dir of FEATURE_DIRS) dirty.add(featureKey(x + dir.dx, y + dir.dy));
  }
  return dirty;
}

export type FeaturePiece = 'isolated' | 'dead-end' | 'straight' | 'corner' | 'T-junction' | 'cross';

/** Human-readable piece class for a mask (for tooling/labels/tests, not rendering). */
export function featurePiece(mask: number): FeaturePiece {
  const connections = FEATURE_DIRS.reduce((count, dir) => count + ((mask & dir.bit) !== 0 ? 1 : 0), 0);
  switch (connections) {
    case 0:
      return 'isolated';
    case 1:
      return 'dead-end';
    case 2:
      // 0101 (N+S) and 1010 (E+W) are straights; the other four 2-bit masks are corners.
      return mask === 0b0101 || mask === 0b1010 ? 'straight' : 'corner';
    case 3:
      return 'T-junction';
    default:
      return 'cross';
  }
}
