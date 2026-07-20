import { drawableAssets, type BoardDrawOp } from '@chess-tactics/board-render';
import { TILE_FRAME_EQUATOR_Y, TILE_FRAME_HEIGHT, TILE_STEP_X, TILE_STEP_Y } from '../art/projectionContract';
import { resolveFenceOverlays, resolveFencePosts } from '../core/featureAutotile';
import { boardLabCellPosition } from '../render/BoardLabBoard';
import { fenceOverlayZIndex, fencePostZIndex } from '../render/sceneDepth';
import type { EditorDocumentSummary } from '../net/editorDocuments';
import type { EditorBoard } from './boardCode';
import type { FenceArtKit } from './fenceCandidateProfiles';

export const FENCE_ART_REVIEW_ID = 'fence-native-candidates-2026-07-10';
export const FENCE_ART_REVIEW_LEVEL_NAME = 'Fence candidate live-board review';

const FRAME_WIDTH = TILE_STEP_X * 2;

/** Locate the account-private, pre-seeded review document without creating content on click. */
export function findFenceArtReviewDocument(
  documents: readonly EditorDocumentSummary[],
): EditorDocumentSummary | undefined {
  return documents.find((document) => document.name === FENCE_ART_REVIEW_LEVEL_NAME);
}

/**
 * Build the canonical durable editor link. The opaque document id is the URL authority;
 * levelId is included only as the editor's consistency check and human-legible context.
 */
export function fenceArtReviewEditorHref(
  document: Pick<EditorDocumentSummary, 'document_id' | 'level_id'>,
  artworkId: string,
): string {
  const params = new URLSearchParams({
    document: document.document_id,
    levelId: document.level_id,
    from: 'studio',
    layer: 'fence',
    kind: 'fence',
    artReview: FENCE_ART_REVIEW_ID,
    fenceArt: artworkId,
  });
  return `/editor/level?${params.toString()}`;
}

/**
 * Restyle every authored fence rail and resolved post on the editor board with one selected art
 * kit. Geometry remains the ordinary wood/stone Level data; this route-gated transform changes
 * only draw sources inside the existing globally depth-sorted scene canvas.
 */
export function transformFenceArtReviewOps(
  ops: readonly BoardDrawOp[],
  board: EditorBoard,
  kit: FenceArtKit,
): BoardDrawOp[] {
  const installedFenceSources = new Set(drawableAssets('fence-material').flatMap((asset) => (
    Object.values(asset.media).map((binding) => binding.media.immutableUrl)
  )));
  const transformed = ops.filter((op) => !installedFenceSources.has(op.src));

  // Posts cap their incident rails at a positive half-depth bias. Inserting them first is only a
  // deterministic tie breaker; fencePostZIndex owns the visible ordering.
  if (kit.post) {
    for (const post of resolveFencePosts(board.fences ?? {}, board.fencePosts ?? {}).values()) {
      const { left, top: vertexCellTop } = boardLabCellPosition(post);
      transformed.push({
        layer: 'scene',
        src: kit.post,
        dx: left - TILE_STEP_X,
        dy: vertexCellTop - TILE_STEP_Y - TILE_FRAME_EQUATOR_Y,
        dw: FRAME_WIDTH,
        dh: TILE_FRAME_HEIGHT,
        z: fencePostZIndex(post),
      });
    }
  }

  for (const [key, fence] of resolveFenceOverlays(board.fences ?? {})) {
    const [x, y] = key.split(',').map(Number);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const cell = { x, y };
    const { left, top } = boardLabCellPosition(cell);
    const base: Omit<BoardDrawOp, 'src'> = {
      layer: 'scene',
      dx: left - TILE_STEP_X,
      dy: top - TILE_FRAME_EQUATOR_Y,
      dw: FRAME_WIDTH,
      dh: TILE_FRAME_HEIGHT,
      z: fenceOverlayZIndex(cell),
    };
    // Candidate kits have independent E/S frames. Splitting a mask-6 owner keeps artwork cycling
    // from changing geometry or seating.
    if (fence.mask & 2) transformed.push({ ...base, src: kit.railE });
    if (fence.mask & 4) transformed.push({ ...base, src: kit.railS });
  }

  return transformed;
}
