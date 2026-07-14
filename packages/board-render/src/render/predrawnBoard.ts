import type { PredrawnBoardSurface } from '../ui/boardCode';
import { boardLabMetrics } from './boardProjection';

export interface PredrawnBoardPlacement {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Register a complete review-frame image against the same centred viewport that produced its
 * source board. This is one whole-image scale and translation only: no crop, mask, per-cell warp,
 * or attempt to "correct" imagegen's internal proportions.
 */
export function predrawnBoardPlacement(
  surface: PredrawnBoardSurface,
  cells: readonly { x: number; y: number }[],
): PredrawnBoardPlacement {
  const metrics = boardLabMetrics(cells);
  return {
    left: -(surface.frameWidth / 2) - metrics.originLeft,
    top: -(surface.frameHeight / 2) - metrics.originTop,
    width: surface.frameWidth,
    height: surface.frameHeight,
  };
}

