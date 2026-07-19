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
// depth step forward. Move rail masks to that half-depth edge plane. Posts already carry their
// canonical +0.5 cap bias, so moving them to the object lane needs no second half-step.
const FENCE_RAIL_OCCLUSION_DEPTH_DELTA =
  OBJECT_DEPTH_OFFSET - FENCE_OVERLAY_DEPTH_OFFSET + CELL_DEPTH_STRIDE / 2;
const FENCE_POST_OCCLUSION_DEPTH_DELTA =
  OBJECT_DEPTH_OFFSET - FENCE_OVERLAY_DEPTH_OFFSET
  + CELL_DEPTH_STRIDE / 2
  - FENCE_POST_DEPTH_BIAS;

/**
 * Keep only authored raised geometry whose canonical sprite alpha can seed a pre-drawn plate
 * occlusion mask. The plate itself and every additive/live family are removed before asking the
 * shared render planner for draw ops, so the resulting alpha comes from props and barriers only.
 */
export function predrawnOcclusionSeedBoard(board: EditorBoard): EditorBoard {
  return {
    ...board,
    surface: undefined,
    macroTiles: [],
    units: {},
    doodads: {},
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
  });
  const fenceMasks = maskOps({
    ...seed,
    props: {},
    walls: {},
    wallArt: {},
  }).map((op) => ({
    ...op,
    // Rails occupy integer bands; canonical post ops occupy half bands via
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
