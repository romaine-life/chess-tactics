// Linear-feature autotiling (roads and rivers). A "feature" is a ribbon a
// level author DRAWS across cells — the engine derives each cell's art from which
// of its 4 cardinal neighbours also carry the same feature. This is the canonical
// 4-bit connection / "edge Wang" autotile (Godot "Match Sides", Tiled edge set,
// RPG Maker wall autotile): 16 masks → straight / corner / T / cross / dead-end /
// isolated. Pure + deterministic; the editor, the solver, and the renderer all
// resolve a cell's piece through this one table.
//
// Bit + direction convention is pinned to the board projection (boardProjection.ts:
// left=(x-y)·stepX, top=(x+y)·stepY) AND to the baked sprite geometry
// (scripts/build-feature-tiles.py). Changing one without the others breaks ribbon
// continuity across the diamond seam.
//
//   bit  dir  grid neighbour   screen edge of the diamond
//   1    N    (x,  y-1)        upper-right (NE)
//   2    E    (x+1, y)         lower-right (SE)
//   4    S    (x,  y+1)        lower-left  (SW)
//   8    W    (x-1, y)         upper-left  (NW)

// Linear-feature kinds. Each kind is its OWN connectivity class — a road connects to
// roads, a river to rivers (never to each other). All baked by build-feature-tiles.py.
export type FeatureKind = 'road' | 'river';

// A feature's surface look. Within a kind, all cells connect regardless of material
// (the shape flows, the surface can change per cell); the author picks which to paint.
// Each is a baked 16-mask set (<kind>-<material>-<mask>.png).
export type RoadMaterial = 'dirt' | 'stone' | 'pebble';
export type RiverMaterial = 'water';
export type FeatureMaterial = RoadMaterial | RiverMaterial;

export const ROAD_MATERIALS: readonly RoadMaterial[] = ['dirt', 'stone', 'pebble'];
export const RIVER_MATERIALS: readonly RiverMaterial[] = ['water'];
export const FEATURE_MATERIAL_LABELS: Record<FeatureMaterial, string> = {
  dirt: 'Dirt',
  stone: 'Cobblestone',
  pebble: 'Gravel',
  water: 'Water',
};
// Back-compat alias (roads referenced this name before rivers existed).
export const ROAD_MATERIAL_LABELS = FEATURE_MATERIAL_LABELS;
export const DEFAULT_ROAD_MATERIAL: RoadMaterial = 'stone';
export const DEFAULT_RIVER_MATERIAL: RiverMaterial = 'water';

/** Selectable materials for a feature kind (editor palette). */
export const featureMaterials = (kind: FeatureKind): readonly FeatureMaterial[] =>
  kind === 'river' ? RIVER_MATERIALS : ROAD_MATERIALS;

/** The default brush material for a feature kind. */
export const defaultFeatureMaterial = (kind: FeatureKind): FeatureMaterial =>
  kind === 'river' ? DEFAULT_RIVER_MATERIAL : DEFAULT_ROAD_MATERIAL;

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

/**
 * Canonical key for the EDGE between two adjacent cells (order-independent), used to
 * record a manually SEVERED connection. A cut is a property of the shared edge, so
 * severing from either tile cuts it for both — `roadEdgeKey(a,b) === roadEdgeKey(b,a)`.
 */
export const roadEdgeKey = (ax: number, ay: number, bx: number, by: number): string => {
  const a = featureKey(ax, ay);
  const b = featureKey(bx, by);
  return a < b ? `${a}|${b}` : `${b}|${a}`;
};

/**
 * The connection mask (0–15) for the cell at (x, y) given the set of featured cells.
 * A neighbour contributes its bit only if it carries the feature AND the shared edge
 * isn't severed — so `isSevered` lets an author cut a connection that would otherwise
 * auto-join. Omit `isSevered` for pure auto-connect.
 */
export function featureMaskAt(
  present: ReadonlySet<string>,
  x: number,
  y: number,
  isSevered?: (edgeKey: string) => boolean,
): number {
  let mask = 0;
  for (const dir of FEATURE_DIRS) {
    const nx = x + dir.dx;
    const ny = y + dir.dy;
    if (!present.has(featureKey(nx, ny))) continue;
    if (isSevered?.(roadEdgeKey(x, y, nx, ny))) continue;
    mask |= dir.bit;
  }
  return mask;
}

/** Compute the mask for every featured cell. Keys are "x,y"; values are 0–15. */
export function featureMaskMap(
  present: ReadonlySet<string>,
  isSevered?: (edgeKey: string) => boolean,
): Map<string, number> {
  const masks = new Map<string, number>();
  for (const key of present) {
    const [x, y] = key.split(',').map(Number);
    masks.set(key, featureMaskAt(present, x, y, isSevered));
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
