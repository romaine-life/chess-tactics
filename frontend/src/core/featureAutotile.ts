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
// roads, a river to rivers (never to each other). Roads/rivers AUTOTILE (their piece is
// derived from same-kind neighbours); a BRIDGE does NOT — it's a straight-only span whose
// orientation the author sets explicitly (see BridgeOrientation). All baked by
// build-feature-tiles.py.
export type FeatureKind = 'road' | 'river' | 'bridge';

// A feature's surface look. Within a kind, all cells connect regardless of material
// (the shape flows, the surface can change per cell); the author picks which to paint.
// Each is a baked 16-mask set (<kind>-<material>-<mask>.png) — except bridges, which bake
// only the two straight spans (masks 5 & 10).
export type RoadMaterial = 'dirt' | 'cobble' | 'stone' | 'pebble';
export type RiverMaterial = 'water';
export type BridgeMaterial = 'wood';
export type FeatureMaterial = RoadMaterial | RiverMaterial | BridgeMaterial;

// Authored codex-heal materials that ship (build-feature-tiles.py). stone/pebble stay
// valid types but aren't in the palette until they get the same treatment.
export const ROAD_MATERIALS: readonly RoadMaterial[] = ['dirt', 'cobble'];
export const RIVER_MATERIALS: readonly RiverMaterial[] = ['water'];
export const BRIDGE_MATERIALS: readonly BridgeMaterial[] = ['wood'];
export const FEATURE_MATERIAL_LABELS: Record<FeatureMaterial, string> = {
  dirt: 'Dirt',
  cobble: 'Cobblestone',
  stone: 'Stone',
  pebble: 'Gravel',
  water: 'Water',
  wood: 'Wood',
};
// Back-compat alias (roads referenced this name before rivers existed).
export const ROAD_MATERIAL_LABELS = FEATURE_MATERIAL_LABELS;
export const DEFAULT_ROAD_MATERIAL: RoadMaterial = 'dirt';
export const DEFAULT_RIVER_MATERIAL: RiverMaterial = 'water';
export const DEFAULT_BRIDGE_MATERIAL: BridgeMaterial = 'wood';

/** Selectable materials for a feature kind (editor palette). */
export const featureMaterials = (kind: FeatureKind): readonly FeatureMaterial[] =>
  kind === 'river' ? RIVER_MATERIALS : kind === 'bridge' ? BRIDGE_MATERIALS : ROAD_MATERIALS;

/** The default brush material for a feature kind. */
export const defaultFeatureMaterial = (kind: FeatureKind): FeatureMaterial =>
  kind === 'river' ? DEFAULT_RIVER_MATERIAL : kind === 'bridge' ? DEFAULT_BRIDGE_MATERIAL : DEFAULT_ROAD_MATERIAL;

// A bridge is straight-only: it spans either vertically (N–S) or horizontally (E–W). The
// orientation is explicit (the brush sets it) — NOT auto-derived from neighbours like a road —
// so a bridge never bends, T's, or crosses. It maps to the baked straight masks: V = N+S = 5,
// H = E+W = 10. The default brush axis is horizontal.
export type BridgeOrientation = 'h' | 'v';
export const DEFAULT_BRIDGE_ORIENTATION: BridgeOrientation = 'h';
export const bridgeOrientationMask = (o: BridgeOrientation): number => (o === 'v' ? 5 : 10);

// NEIGHBOUR-AWARE straight bridge. Unlike a road it never bends, but its two ENDS still react to
// same-orientation bridge neighbours: an end is OPEN (deck + rails continue) when another bridge
// of the SAME axis abuts it, else CAPPED with an end post. Only the two same-axis ends matter —
// a 'v' bridge looks N/S, an 'h' bridge looks E/W — so a bridge only ever connects to a bridge
// pointing the same way (never corners/T/cross). This is a 2-bit end mask, not the 4-bit road mask.

/** One end of a bridge, by which of the two same-axis ends is open. */
export interface BridgeEndMask {
  /** For 'v': the N end is a same-axis bridge. For 'h': the E end is a same-axis bridge. */
  aheadOpen: boolean;
  /** For 'v': the S end is a same-axis bridge. For 'h': the W end is a same-axis bridge. */
  behindOpen: boolean;
}

/**
 * Which of a bridge cell's two SAME-AXIS ends abut another bridge (of the same orientation).
 * For 'v' the ends are N (0,-1) and S (0,+1); for 'h' they are E (+1,0) and W (-1,0). `present`
 * is the set of same-orientation bridge cell keys ("x,y"). Cross-axis neighbours are ignored — a
 * bridge only ever joins a bridge pointing the same way, so it stays a straight span.
 */
export function bridgeEndMask(
  present: ReadonlySet<string>,
  x: number,
  y: number,
  orientation: BridgeOrientation,
): BridgeEndMask {
  if (orientation === 'v') {
    return {
      aheadOpen: present.has(featureKey(x, y - 1)), // N
      behindOpen: present.has(featureKey(x, y + 1)), // S
    };
  }
  return {
    aheadOpen: present.has(featureKey(x + 1, y)), // E
    behindOpen: present.has(featureKey(x - 1, y)), // W
  };
}

/**
 * The 8 baked straight-bridge sprite keys. Each end is OPEN (deck + rails run off the tile) or
 * CAPPED with an end post; a cap is named for the CAPPED end:
 *   v-thru   both ends open (N & S)          h-thru   both ends open (E & W)
 *   v-capN   open S, capped N                h-capE   open W, capped E
 *   v-capS   open N, capped S                h-capW   open E, capped W
 *   v-single both ends capped               h-single both ends capped
 * Files: bridge-<material>-<key>.png (feature dir).
 */
export type BridgeSpriteKey =
  | 'v-thru' | 'v-capN' | 'v-capS' | 'v-single'
  | 'h-thru' | 'h-capE' | 'h-capW' | 'h-single';

/**
 * Resolve a bridge cell's baked sprite key from its axis + which ends are open. `aheadOpen` is the
 * N end for 'v' / the E end for 'h'; `behindOpen` is the S end for 'v' / the W end for 'h'. Both
 * open ⇒ `-thru`; both capped ⇒ `-single`; one capped ⇒ a `-cap<END>` naming the CAPPED end
 * (v: N/S, h: E/W).
 */
export function bridgeSpriteKey(orientation: BridgeOrientation, endMask: BridgeEndMask): BridgeSpriteKey {
  const { aheadOpen, behindOpen } = endMask;
  if (orientation === 'v') {
    if (aheadOpen && behindOpen) return 'v-thru';
    if (!aheadOpen && !behindOpen) return 'v-single';
    return aheadOpen ? 'v-capS' /* open N, cap S */ : 'v-capN' /* open S, cap N */;
  }
  if (aheadOpen && behindOpen) return 'h-thru';
  if (!aheadOpen && !behindOpen) return 'h-single';
  return aheadOpen ? 'h-capW' /* open E, cap W */ : 'h-capE' /* open W, cap E */;
}

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
