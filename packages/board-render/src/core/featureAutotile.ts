// Linear-feature autotiling (roads and rivers) + edge fences. A "linear feature" is a
// ribbon a level author DRAWS across cells — the engine derives each cell's art from which
// of its 4 cardinal neighbours also carry the same feature. This is the canonical
// 4-bit connection / "edge Wang" autotile (Godot "Match Sides", Tiled edge set,
// RPG Maker wall autotile): 16 masks → straight / corner / T / cross / dead-end /
// isolated. Pure + deterministic; the editor, the solver, and the renderer all
// resolve a cell's piece through this one table.
//
// A FENCE is a different animal (see the fence section at the bottom): it lives on the
// EDGE between two orthogonally-adjacent cells and BLOCKS crossing it. It is stored
// edge-keyed (roadEdgeKey), exactly like the manual cut/exit overrides, not as a
// per-cell FeatureKind.
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
// roads, a river to rivers (never to each other). Both AUTOTILE (their piece is derived
// from same-kind neighbours) and are baked by build-feature-tiles.py. (Fences are NOT a
// FeatureKind — they are edge-based; see the fence section below.)
export type FeatureKind = 'road' | 'river';

// A feature's surface look. Within a kind, all cells connect regardless of material
// (the shape flows, the surface can change per cell); the author picks which to paint.
// Each is a baked 16-mask set (<kind>-<material>-<mask>.png).
export type RoadMaterial = 'dirt' | 'cobble' | 'stone' | 'pebble';
export type RiverMaterial = 'water';
export type FeatureMaterial = RoadMaterial | RiverMaterial;

// Authored codex-heal materials that ship (build-feature-tiles.py). stone/pebble stay
// valid types but aren't in the palette until they get the same treatment.
export const ROAD_MATERIALS: readonly RoadMaterial[] = ['dirt', 'cobble'];
export const RIVER_MATERIALS: readonly RiverMaterial[] = ['water'];
export const FEATURE_MATERIAL_LABELS: Record<FeatureMaterial, string> = {
  dirt: 'Dirt',
  cobble: 'Cobblestone',
  stone: 'Stone',
  pebble: 'Gravel',
  water: 'Water',
};
// Back-compat alias (roads referenced this name before rivers existed).
export const ROAD_MATERIAL_LABELS = FEATURE_MATERIAL_LABELS;
export const DEFAULT_ROAD_MATERIAL: RoadMaterial = 'dirt';
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
 * record a manually SEVERED connection (a cut), a forced outward stub (an exit), OR a
 * fence. All three are properties of the shared edge, so toggling from either tile
 * applies to both — `roadEdgeKey(a,b) === roadEdgeKey(b,a)`. An exit's "neighbour" may be
 * off-board (a negative or out-of-range coord); the string key handles that fine.
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
 *
 * `isExit` is the mirror image: it FORCES a bit on an edge that has NO same-kind
 * neighbour (a board boundary, or an adjacent non-feature tile), so the ribbon runs to
 * the diamond's edge — "off the board" — instead of capping. Severing always wins over
 * an exit: an edge with a present-but-cut neighbour stays cut (exit is never consulted
 * there). Like a cut, an exit is keyed by `roadEdgeKey` on the shared (off-board) edge.
 */
export function featureMaskAt(
  present: ReadonlySet<string>,
  x: number,
  y: number,
  isSevered?: (edgeKey: string) => boolean,
  isExit?: (edgeKey: string) => boolean,
): number {
  let mask = 0;
  for (const dir of FEATURE_DIRS) {
    const nx = x + dir.dx;
    const ny = y + dir.dy;
    const edgeKey = roadEdgeKey(x, y, nx, ny);
    if (present.has(featureKey(nx, ny))) {
      if (isSevered?.(edgeKey)) continue; // a real neighbour, but the author cut the join
      mask |= dir.bit;
    } else if (isExit?.(edgeKey)) {
      mask |= dir.bit; // no neighbour, but the author forced an outward stub off this edge
    }
  }
  return mask;
}

/**
 * A feature cell resolved to its sprite selector. road/river carry a 4-bit connection
 * `mask`. This is what every board renderer draws from.
 */
export interface ResolvedFeatureOverlay {
  kind: FeatureKind;
  material: FeatureMaterial;
  mask: number;
}

/** A source feature cell (pre-resolution): its kind + material. */
export interface FeatureSource {
  kind: FeatureKind;
  material: FeatureMaterial;
}

/**
 * Resolve EVERY painted feature cell to its sprite selector in one pass — the single autotile
 * table the editor, the socket solver, and all board renderers share (so ribbons knit
 * identically everywhere). road/river autotile against a same-KIND neighbour set.
 */
export function resolveFeatureOverlays(
  features: Record<string, FeatureSource>,
  isSevered?: (edgeKey: string) => boolean,
  isExit?: (edgeKey: string) => boolean,
): Record<string, ResolvedFeatureOverlay> {
  const presentByKind: Record<FeatureKind, Set<string>> = { road: new Set(), river: new Set() };
  for (const [key, f] of Object.entries(features)) presentByKind[f.kind].add(key);
  const out: Record<string, ResolvedFeatureOverlay> = {};
  for (const [key, f] of Object.entries(features)) {
    const [x, y] = key.split(',').map(Number);
    out[key] = { kind: f.kind, material: f.material, mask: featureMaskAt(presentByKind[f.kind], x, y, isSevered, isExit) };
  }
  return out;
}

/** Compute the mask for every featured cell. Keys are "x,y"; values are 0–15. */
export function featureMaskMap(
  present: ReadonlySet<string>,
  isSevered?: (edgeKey: string) => boolean,
  isExit?: (edgeKey: string) => boolean,
): Map<string, number> {
  const masks = new Map<string, number>();
  for (const key of present) {
    const [x, y] = key.split(',').map(Number);
    masks.set(key, featureMaskAt(present, x, y, isSevered, isExit));
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

// ────────────────────────────────────────────────────────────────────────────────────
// EDGE FENCES
//
// A fence sits on an orthogonal EDGE. Between two board cells it blocks a piece from stepping
// across that edge (both cells stay walkable — a fence is a wall, not an obstacle). Along the
// board boundary it is a visual rail keyed against a one-step off-board phantom neighbour.
// It is NOT a FeatureKind: it is stored edge-keyed (roadEdgeKey), like a cut/exit, as
// `Record<edgeKey, FenceMaterial>` in the editor and a parallel channel through the level.
//
//   • COLLISION reads the raw edge set: a crossing (ax,ay)→(bx,by) is blocked iff its
//     roadEdgeKey is fenced. Only orthogonal steps ever cross an edge, so knights (whose
//     jumps are never orthogonally-adjacent) and diagonal slides pass a lone fence freely.
//   • RENDERING draws each edge exactly once: a cell paints rails on its OWN E (SE) and S
//     (SW) diamond sides, so the upper-left cell of every fenced pair owns the draw (boundary
//     N/W rails are owned by the off-board phantom cell). Bits: E = 2, S = 4 (same as
//     FEATURE_DIRS), so a per-cell fence frame is `fence-<material>-<mask>.png` with mask ∈
//     {2, 4, 6}.
// ────────────────────────────────────────────────────────────────────────────────────

/** Fence surface look — one baked rail set per material (fence-<material>-<mask>.png). */
export type FenceMaterial = 'wood' | 'stone';
export const FENCE_MATERIALS: readonly FenceMaterial[] = ['wood', 'stone'];
export const DEFAULT_FENCE_MATERIAL: FenceMaterial = 'wood';
export const FENCE_MATERIAL_LABELS: Record<FenceMaterial, string> = { wood: 'Wood', stone: 'Stone' };

/** The E(2) and S(4) render bits — a per-cell fence frame only ever shows its two FRONT sides. */
export const FENCE_RENDER_MASKS = [2, 4, 6] as const;

/**
 * Wall surface look — one baked set per material (wall-<material>-<mask>.png).
 * Walls share the edge-keyed movement contract with fences, but are valid only on
 * the map's northmost/westmost perimeter. They render on N(1)/W(8) tile sides.
 */
export type WallMaterial = 'stone' | 'brick' | 'mossy' | 'basalt' | 'palisade';
export const WALL_MATERIALS: readonly WallMaterial[] = ['stone', 'brick', 'mossy', 'basalt', 'palisade'];
export const DEFAULT_WALL_MATERIAL: WallMaterial = 'stone';
export const WALL_MATERIAL_LABELS: Record<WallMaterial, string> = {
  stone: 'Stone',
  brick: 'Brick',
  mossy: 'Mossy Stone',
  basalt: 'Basalt',
  palisade: 'Palisade',
};

/** The N(1) and W(8) render bits — wall frames show only the BACK sides of their owner cell. */
export const WALL_RENDER_MASKS = [1, 8, 9] as const;

/** Parse an edge key "ax,ay|bx,by" into its two cells, or null if malformed. */
export function parseEdgeKey(edge: string): { ax: number; ay: number; bx: number; by: number } | null {
  const parts = edge.split('|');
  if (parts.length !== 2) return null;
  const [a, b] = parts;
  const [ax, ay] = a.split(',').map(Number);
  const [bx, by] = b.split(',').map(Number);
  if (![ax, ay, bx, by].every((n) => Number.isFinite(n))) return null;
  return { ax, ay, bx, by };
}

/** The canonical fence edge key between two cells (alias of roadEdgeKey for intent clarity). */
export const fenceEdgeKey = roadEdgeKey;

/** True iff the two cells are orthogonally adjacent (share a diamond edge). */
export function isOrthogonalPair(ax: number, ay: number, bx: number, by: number): boolean {
  return Math.abs(ax - bx) + Math.abs(ay - by) === 1;
}

/**
 * True iff a fence blocks the crossing (ax,ay)→(bx,by). Only orthogonal crossings can be
 * fenced, so a diagonal/knight step (whose cells aren't orthogonally adjacent) is never
 * blocked by a lone fence — it hops. Safe on any input: a non-adjacent pair returns false.
 */
export function fenceBlocksCrossing(
  fences: ReadonlySet<string> | undefined,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): boolean {
  if (!fences || fences.size === 0) return false;
  if (!isOrthogonalPair(ax, ay, bx, by)) return false;
  return fences.has(roadEdgeKey(ax, ay, bx, by));
}

/** A fenced cell resolved to its rail selector. */
export interface ResolvedFenceOverlay {
  mask: number;
  material: FenceMaterial;
}

/** One canonical fence-graph vertex, in the square-grid lattice around the tile diamonds. */
export interface FenceVertex {
  x: number;
  y: number;
}

/** A post resolved exactly once at a canonical fence vertex. */
export interface ResolvedFencePost extends FenceVertex {
  material: FenceMaterial;
  /** Automatic posts cap degree-one endpoints; explicit posts are authored by the editor. */
  source: 'automatic' | 'explicit';
}

/** A walled cell resolved to its render selector: an N(1)/W(8) mask + which wall material. */
export interface ResolvedWallOverlay {
  mask: number;
  material: WallMaterial;
}

interface FenceSegment {
  ownerX: number;
  ownerY: number;
  maskBit: number;
  material: FenceMaterial;
  endpoints: readonly [FenceVertex, FenceVertex];
}

/** Canonical key for a fence vertex. Shared tile corners always produce the same key. */
export function fenceVertexKey(x: number, y: number): string {
  return featureKey(x, y);
}

/** Parse a canonical/authored fence-vertex key, rejecting fractional or malformed coordinates. */
export function parseFenceVertexKey(key: string): FenceVertex | null {
  const parts = key.split(',');
  if (parts.length !== 2) return null;
  const x = Number(parts[0]);
  const y = Number(parts[1]);
  if (!Number.isInteger(x) || !Number.isInteger(y)) return null;
  return fenceVertexKey(x, y) === key ? { x, y } : null;
}

function resolveFenceSegments(fences: Readonly<Record<string, FenceMaterial>>): FenceSegment[] {
  const segments: FenceSegment[] = [];
  const seenEdges = new Set<string>();

  for (const [edge, material] of Object.entries(fences)) {
    const cells = parseEdgeKey(edge);
    if (!cells) continue;
    const { ax, ay, bx, by } = cells;
    if (!isOrthogonalPair(ax, ay, bx, by)) continue;

    // Authored maps normally use roadEdgeKey already, but treating reversed/non-canonical aliases
    // as one physical segment keeps vertex degree honest on imported or hand-edited board codes.
    const canonicalEdge = roadEdgeKey(ax, ay, bx, by);
    if (seenEdges.has(canonicalEdge)) continue;
    seenEdges.add(canonicalEdge);

    let segment: FenceSegment;
    if (ay === by) {
      // Horizontal-screen pair (E/W neighbours): owner is smaller-x, and its E rail runs RIGHT→FRONT.
      const ownerX = Math.min(ax, bx);
      const ownerY = ay;
      segment = {
        ownerX,
        ownerY,
        maskBit: 2,
        material,
        endpoints: [
          { x: ownerX + 1, y: ownerY },
          { x: ownerX + 1, y: ownerY + 1 },
        ],
      };
    } else {
      // Vertical-screen pair (N/S neighbours): owner is smaller-y, and its S rail runs FRONT→LEFT.
      const ownerX = ax;
      const ownerY = Math.min(ay, by);
      segment = {
        ownerX,
        ownerY,
        maskBit: 4,
        material,
        endpoints: [
          { x: ownerX + 1, y: ownerY + 1 },
          { x: ownerX, y: ownerY + 1 },
        ],
      };
    }

    segments.push(segment);
  }

  return segments;
}

/**
 * Resolve an edge-keyed fence map to the per-cell render overlay (E=2 / S=4 mask + material) —
 * each edge is assigned to its UPPER-LEFT cell (smaller x for a horizontal-screen pair, smaller
 * y for a vertical-screen pair) so every rail is drawn exactly once. Boundary N/W rails resolve
 * to an off-board phantom owner's E/S frame, using the same baked art. Returns a
 * `cellKey → { mask, material }` map; cells with no owned fenced edge are absent. If one cell owns
 * two edges of different materials, the first-seen material wins (a cosmetic v1 limit — the
 * collision path reads the raw edge set, unaffected).
 */
export function resolveFenceOverlays(fences: Readonly<Record<string, FenceMaterial>>): Map<string, ResolvedFenceOverlay> {
  const out = new Map<string, ResolvedFenceOverlay>();
  for (const segment of resolveFenceSegments(fences)) {
    const { ownerX, ownerY, maskBit, material } = segment;
    const key = featureKey(ownerX, ownerY);
    const prev = out.get(key);
    out.set(key, {
      mask: (prev?.mask ?? 0) | maskBit,
      material: prev?.material ?? material,
    });
  }
  return out;
}

/**
 * Resolve automatic degree-one endings plus positive explicit authoring into one post per
 * geometric vertex. Explicit posts win at an automatic endpoint (including their material), and
 * may also stand alone or appear at corners/joins. Reversed aliases of one fence edge are counted
 * once before degree is computed, so imported board codes cannot manufacture false junctions.
 */
export function resolveFencePosts(
  fences: Readonly<Record<string, FenceMaterial>>,
  explicitPosts: Readonly<Record<string, FenceMaterial>> = {},
): Map<string, ResolvedFencePost> {
  const incidents = new Map<string, { vertex: FenceVertex; degree: number; material: FenceMaterial }>();
  for (const segment of resolveFenceSegments(fences)) {
    for (const vertex of segment.endpoints) {
      const key = fenceVertexKey(vertex.x, vertex.y);
      const previous = incidents.get(key);
      incidents.set(key, {
        vertex,
        degree: (previous?.degree ?? 0) + 1,
        material: previous?.material ?? segment.material,
      });
    }
  }

  const out = new Map<string, ResolvedFencePost>();
  for (const [key, incident] of incidents) {
    if (incident.degree !== 1) continue;
    out.set(key, { ...incident.vertex, material: incident.material, source: 'automatic' });
  }

  for (const [rawKey, material] of Object.entries(explicitPosts)) {
    const vertex = parseFenceVertexKey(rawKey);
    if (!vertex) continue;
    const key = fenceVertexKey(vertex.x, vertex.y);
    out.set(key, { ...vertex, material, source: 'explicit' });
  }

  return out;
}

function inBarrierBounds(cell: { x: number; y: number }, bounds: { cols: number; rows: number } | undefined): boolean {
  return !bounds || (cell.x >= 0 && cell.y >= 0 && cell.x < bounds.cols && cell.y < bounds.rows);
}

function northWestBoundaryWallTarget(
  edge: string,
  bounds: { cols: number; rows: number },
): { x: number; y: number; bit: 1 | 8 } | null {
  const cells = parseEdgeKey(edge);
  if (!cells) return null;
  const { ax, ay, bx, by } = cells;
  if (!isOrthogonalPair(ax, ay, bx, by)) return null;
  if (ay === by) {
    if (ay < 0 || ay >= bounds.rows) return null;
    return [ax, bx].includes(-1) && [ax, bx].includes(0) ? { x: 0, y: ay, bit: 8 } : null;
  }
  if (ax !== bx || ax < 0 || ax >= bounds.cols) return null;
  return [ay, by].includes(-1) && [ay, by].includes(0) ? { x: ax, y: 0, bit: 1 } : null;
}

/** True iff an edge is placeable as a wall: the board's north or west perimeter only. */
export function isNorthWestBoundaryWallEdge(edge: string, bounds: { cols: number; rows: number }): boolean {
  return northWestBoundaryWallTarget(edge, bounds) !== null;
}

/**
 * Resolve an edge-keyed wall map to per-cell render overlays on N(1)/W(8). Walls are
 * perimeter scenery/blockers only: the board's northmost and westmost edges. Interior
 * edges and east/south boundaries are ignored even if stale data contains them.
 */
export function resolveWallOverlays(
  walls: Record<string, WallMaterial>,
  bounds?: { cols: number; rows: number },
): Map<string, ResolvedWallOverlay> {
  const out = new Map<string, ResolvedWallOverlay>();
  if (!bounds) return out;
  for (const [edge, material] of Object.entries(walls)) {
    const target = northWestBoundaryWallTarget(edge, bounds);
    if (!target) continue;
    if (!inBarrierBounds(target, bounds)) continue;
    const key = featureKey(target.x, target.y);
    const prev = out.get(key);
    out.set(key, { mask: (prev?.mask ?? 0) | target.bit, material: prev?.material ?? material });
  }
  return out;
}
