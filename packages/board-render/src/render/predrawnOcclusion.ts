import type { EditorBoard } from '../ui/boardCode';
import { boardDrawOps, withoutBoardDrawLayers, type BoardDrawOp } from './renderPlan';
import {
  CELL_DEPTH_STRIDE,
  FENCE_OVERLAY_DEPTH_OFFSET,
  FENCE_POST_DEPTH_BIAS,
  OBJECT_DEPTH_OFFSET,
} from './sceneDepth';

// Fence sprites normally live in the background barrier lane so the composed renderer can paint
// same-cell objects over them. A baked plate cannot participate in that painter order: its fence
// pixels must instead sit on the geometric edge between the owner cell and the adjacent cell one
// depth step forward. Move rail masks to that half-depth edge plane. The post delta cancels its
// canonical interleaving offset so the mask retains the exact geometric vertex depth.
const FENCE_RAIL_OCCLUSION_DEPTH_DELTA =
  OBJECT_DEPTH_OFFSET - FENCE_OVERLAY_DEPTH_OFFSET + CELL_DEPTH_STRIDE / 2;
const FENCE_POST_OCCLUSION_DEPTH_DELTA =
  OBJECT_DEPTH_OFFSET - FENCE_OVERLAY_DEPTH_OFFSET
  + CELL_DEPTH_STRIDE / 2
  - FENCE_POST_DEPTH_BIAS;

function compareCanonicalText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJsonValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => compareCanonicalText(left, right))
      .map(([key, child]) => [key, canonicalJsonValue(child)]),
  );
}

export const PREDRAWN_ENVIRONMENT_GEOMETRY_SCHEMA_V1 = 'predrawn-environment-geometry-v1';
export const PREDRAWN_ENVIRONMENT_GEOMETRY_SCHEMA_V2 = 'predrawn-environment-geometry-v2';

function predrawnEnvironmentGeometryFingerprintValue(
  board: EditorBoard,
  schema: typeof PREDRAWN_ENVIRONMENT_GEOMETRY_SCHEMA_V1
    | typeof PREDRAWN_ENVIRONMENT_GEOMETRY_SCHEMA_V2,
  includeLiveCover: boolean,
): unknown {
  const macroTiles = [...(board.macroTiles ?? [])]
    .map(canonicalJsonValue)
    .sort((left, right) => compareCanonicalText(JSON.stringify(left), JSON.stringify(right)));
  return canonicalJsonValue({
    schema,
    cols: board.cols,
    rows: board.rows,
    decorativeApron: board.decorativeApron ?? null,
    decorativeFootprint: [...(board.decorativeFootprint ?? [])].sort(),
    decorativeCells: board.decorativeCells ?? {},
    decorativeFeatures: board.decorativeFeatures ?? {},
    decorativeFences: board.decorativeFences ?? {},
    decorativeFencePosts: board.decorativeFencePosts ?? {},
    decorativeWalls: board.decorativeWalls ?? {},
    cells: board.cells,
    macroTiles,
    doodads: board.doodads,
    props: board.props,
    ...(includeLiveCover ? {
      cover: board.cover,
      coverTypes: board.coverTypes,
    } : {}),
    features: board.features,
    fences: board.fences ?? {},
    fencePosts: board.fencePosts ?? {},
    walls: board.walls ?? {},
    wallArt: board.wallArt ?? {},
    subterrain: board.subterrain ?? {},
    featureCuts: board.featureCuts,
    featureExits: board.featureExits,
  });
}

/**
 * The exact legacy fingerprint input used by v1 immutable lineages. V1 included live cover.
 * It remains exported only so a durable migration can prove that an existing immutable v1
 * artifact was generated from the board currently being saved before binding that lineage to v2.
 */
export function predrawnEnvironmentGeometryFingerprintInputV1(board: EditorBoard): string {
  return JSON.stringify(predrawnEnvironmentGeometryFingerprintValue(
    board,
    PREDRAWN_ENVIRONMENT_GEOMETRY_SCHEMA_V1,
    true,
  ));
}

/**
 * Stable v2 bytes for baked pre-drawn environment geometry. Live ground cover is deliberately
 * absent because it remains an independently editable and rendered layer over the immutable art.
 */
export function predrawnEnvironmentGeometryFingerprintInputV2(board: EditorBoard): string {
  return JSON.stringify(predrawnEnvironmentGeometryFingerprintValue(
    board,
    PREDRAWN_ENVIRONMENT_GEOMETRY_SCHEMA_V2,
    false,
  ));
}

/**
 * Stable bytes for the environment geometry represented by a complete-scene raster and its
 * occlusion child. Live units, live ground cover, tactical zones, the selected raster itself, and
 * editor-only generation controls are deliberately absent. Callers SHA-256 this string and
 * persist the hash with derived versions so Save can reject a stale raster/mask after terrain or
 * scenery changes without rejecting a cover-only edit.
 */
export function predrawnEnvironmentGeometryFingerprintInput(board: EditorBoard): string {
  return predrawnEnvironmentGeometryFingerprintInputV2(board);
}

/**
 * Keep only authored raised geometry whose canonical sprite alpha can seed a pre-drawn plate
 * occlusion mask. The plate itself and every additive/live family are removed before asking the
 * shared render planner for draw ops, so the resulting alpha comes from every raised authored
 * structure: split doodads, props, Subterrain, walls, and barriers.
 */
export function predrawnOcclusionSeedBoard(board: EditorBoard): EditorBoard {
  return {
    ...board,
    backgroundMode: 'legacy',
    surface: undefined,
    macroTiles: [],
    units: {},
    cover: {},
    coverTypes: {},
    features: {},
    featureCuts: {},
    featureExits: {},
  };
}

/**
 * Canonical alpha-mask draw ops for the raised geometry baked into a pre-drawn plate.
 *
 * Callers decide when pre-drawn mode is active. This deliberately also works for an unpersisted
 * candidate review, where the temporary plate exists only in memory and `board.surface` is absent.
 */
export function predrawnOcclusionMaskOps(board: EditorBoard): BoardDrawOp[] {
  const seed = predrawnOcclusionSeedBoard(board);
  const maskOps = (source: EditorBoard): BoardDrawOp[] => withoutBoardDrawLayers(
    boardDrawOps(source, { ambientCover: false }),
    'terrain',
    'linear-feature',
  );

  // Render the two semantic families independently. This keeps classification grounded in the
  // canonical board fields instead of guessing from asset URLs or inspecting plate pixels.
  const nonFenceMasks = maskOps({
    ...seed,
    fences: {},
    fencePosts: {},
    decorativeFences: {},
    decorativeFencePosts: {},
  });
  const fenceMasks = maskOps({
    ...seed,
    doodads: {},
    props: {},
    walls: {},
    wallArt: {},
    subterrain: {},
    decorativeWalls: {},
  }).map((op) => ({
    ...op,
    // Rails occupy integer bands; canonical post ops occupy interleaved half bands via
    // FENCE_POST_DEPTH_BIAS. The distinction is therefore geometry-owned, not source-owned.
    z: op.z + (Number.isInteger(op.z)
      ? FENCE_RAIL_OCCLUSION_DEPTH_DELTA
      : FENCE_POST_OCCLUSION_DEPTH_DELTA),
  }));

  return [...nonFenceMasks, ...fenceMasks].sort((a, b) => a.z - b.z);
}

function drawRect(op: BoardDrawOp): { left: number; top: number; right: number; bottom: number } {
  const x2 = op.dx + op.dw;
  const y2 = op.dy + op.dh;
  return {
    left: Math.min(op.dx, x2),
    top: Math.min(op.dy, y2),
    right: Math.max(op.dx, x2),
    bottom: Math.max(op.dy, y2),
  };
}

function drawRectsOverlap(a: BoardDrawOp, b: BoardDrawOp): boolean {
  const ar = drawRect(a);
  const br = drawRect(b);
  return ar.left < br.right && ar.right > br.left && ar.top < br.bottom && ar.bottom > br.top;
}

/**
 * Broad-phase mask selection for one additive draw op. Only a strictly nearer mask may erase the
 * op; equal-depth art keeps the shared renderer's existing stable painter-order tie behavior.
 * Touching or disjoint draw rectangles cannot affect one another and are omitted up front.
 */
export function predrawnOcclusionMasksInFront(
  op: BoardDrawOp,
  masks: readonly BoardDrawOp[],
): BoardDrawOp[] {
  return masks.filter((mask) => mask.z > op.z && drawRectsOverlap(op, mask));
}
