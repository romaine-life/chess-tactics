import {
  floatingArtworkDrawOps,
  type BoardDrawOp,
  type FloatingArtworkPlacement,
} from '@chess-tactics/board-render';
import {
  drawOpPaintsPoint,
  drawOpPaintsWithinRect,
  type RasterAlphaMask,
  type RasterPoint,
  type RasterRect,
} from '../render/rasterAlpha';

export interface FloatingArtworkHitCandidate {
  placement: FloatingArtworkPlacement;
  placementIndex: number;
  paintedZ: number;
}

export interface FloatingArtworkOpsCandidate {
  placement: FloatingArtworkPlacement;
  placementIndex: number;
  ops: readonly BoardDrawOp[];
}

export interface FloatingArtworkCycleState {
  candidateIds: readonly string[];
  index: number;
  localX: number;
  localY: number;
}

export function continuesFloatingArtworkCycle(
  cycle: FloatingArtworkCycleState | null,
  candidateIds: readonly string[],
  localX: number,
  localY: number,
  radius = 6,
): cycle is FloatingArtworkCycleState {
  return !!cycle
    && cycle.candidateIds.length === candidateIds.length
    && cycle.candidateIds.every((id, index) => id === candidateIds[index])
    && Math.hypot(localX - cycle.localX, localY - cycle.localY) <= radius;
}

export function nextFloatingArtworkCycleIndex(
  cycle: FloatingArtworkCycleState | null,
  candidateIds: readonly string[],
  localX: number,
  localY: number,
): number {
  if (!candidateIds.length) return -1;
  return continuesFloatingArtworkCycle(cycle, candidateIds, localX, localY)
    ? (cycle.index + 1) % candidateIds.length
    : 0;
}

/** The exact media sources the shared renderer uses for these Scene Art placements. */
export function floatingArtworkSelectionSources(
  placements: readonly FloatingArtworkPlacement[],
): string[] {
  return [...new Set(placements.flatMap((placement) => floatingArtworkDrawOps(placement).map((op) => op.src)))];
}

/**
 * Pick every Scene Art instance that paints the given scene pixel, frontmost first. A source whose
 * alpha has not settled is deliberately inert: the old image rectangle must never steal a click.
 */
export function floatingArtworkHitCandidatesFromOps(
  candidates: readonly FloatingArtworkOpsCandidate[],
  point: RasterPoint,
  alphaBySource: ReadonlyMap<string, RasterAlphaMask>,
): FloatingArtworkHitCandidate[] {
  return candidates.flatMap((candidate): FloatingArtworkHitCandidate[] => {
    let paintedZ = Number.NEGATIVE_INFINITY;
    for (const op of candidate.ops) {
      const source = alphaBySource.get(op.src);
      const paints = source ? drawOpPaintsPoint(op, source, point) : false;
      if (paints) paintedZ = Math.max(paintedZ, op.z);
    }
    return Number.isFinite(paintedZ)
      ? [{ placement: candidate.placement, placementIndex: candidate.placementIndex, paintedZ }]
      : [];
  }).sort((a, b) => b.paintedZ - a.paintedZ || b.placementIndex - a.placementIndex);
}

export function floatingArtworkHitCandidatesAtPoint(
  placements: readonly FloatingArtworkPlacement[],
  point: RasterPoint,
  alphaBySource: ReadonlyMap<string, RasterAlphaMask>,
): FloatingArtworkHitCandidate[] {
  return floatingArtworkHitCandidatesFromOps(
    placements.map((placement, placementIndex) => ({
      placement,
      placementIndex,
      ops: floatingArtworkDrawOps(placement),
    })),
    point,
    alphaBySource,
  );
}

/**
 * Every Scene Art instance the dragged rectangle actually touches, back-to-front.
 *
 * Same honesty rule as the single pick: the rectangle takes an instance because it covers pixels
 * that instance PAINTS, never because it clipped the transparent margin of its source image. A
 * source whose alpha has not settled stays inert rather than being swept up sight-unseen.
 */
export function floatingArtworkIdsWithinRectFromOps(
  candidates: readonly FloatingArtworkOpsCandidate[],
  rect: RasterRect,
  alphaBySource: ReadonlyMap<string, RasterAlphaMask>,
): string[] {
  return candidates.flatMap((candidate) => candidate.ops.some((op) => {
    const source = alphaBySource.get(op.src);
    return source ? drawOpPaintsWithinRect(op, source, rect) : false;
  }) ? [candidate.placement.id] : []);
}

export function floatingArtworkIdsWithinRect(
  placements: readonly FloatingArtworkPlacement[],
  rect: RasterRect,
  alphaBySource: ReadonlyMap<string, RasterAlphaMask>,
): string[] {
  return floatingArtworkIdsWithinRectFromOps(
    placements.map((placement, placementIndex) => ({
      placement,
      placementIndex,
      ops: floatingArtworkDrawOps(placement),
    })),
    rect,
    alphaBySource,
  );
}
