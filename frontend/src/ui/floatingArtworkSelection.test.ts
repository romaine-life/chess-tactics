import { describe, expect, it } from 'vitest';
import type { BoardDrawOp, FloatingArtworkPlacement } from '@chess-tactics/board-render';
import type { RasterAlphaMask } from '../render/rasterAlpha';
import {
  floatingArtworkHitCandidatesFromOps,
  floatingArtworkIdsWithinRectFromOps,
  nextFloatingArtworkCycleIndex,
  type FloatingArtworkCycleState,
  type FloatingArtworkOpsCandidate,
} from './floatingArtworkSelection';

function placement(id: string): FloatingArtworkPlacement {
  return { id, sourceArtId: 'oak', pixelX: 0, pixelY: 0, direction: 'south', scale: 1 };
}

function op(src: string, z: number, dx = 0, dy = 0): BoardDrawOp {
  return { src, dx, dy, dw: 2, dh: 2, z };
}

function alpha(opaque: boolean): RasterAlphaMask {
  const rgba = new Uint8Array(2 * 2 * 4);
  if (opaque) rgba[3] = 255;
  return { rgba, width: 2, height: 2 };
}

describe('Scene Art spatial selection', () => {
  it('ignores transparent image corners and orders painted overlaps by live draw depth', () => {
    const candidates: FloatingArtworkOpsCandidate[] = [
      { placement: placement('rear'), placementIndex: 0, ops: [op('rear.png', 10)] },
      { placement: placement('front'), placementIndex: 1, ops: [op('front.png', 20)] },
      { placement: placement('transparent'), placementIndex: 2, ops: [op('transparent.png', 30)] },
    ];
    const masks = new Map([
      ['rear.png', alpha(true)],
      ['front.png', alpha(true)],
      ['transparent.png', alpha(false)],
    ]);
    expect(floatingArtworkHitCandidatesFromOps(candidates, { x: .25, y: .25 }, masks)
      .map(({ placement: hit }) => hit.id)).toEqual(['front', 'rear']);
  });

  it('uses persisted placement order only as the equal-depth tie-breaker', () => {
    const candidates: FloatingArtworkOpsCandidate[] = [
      { placement: placement('first'), placementIndex: 0, ops: [op('same.png', 12)] },
      { placement: placement('second'), placementIndex: 1, ops: [op('same.png', 12)] },
    ];
    expect(floatingArtworkHitCandidatesFromOps(candidates, { x: .25, y: .25 }, new Map([['same.png', alpha(true)]]))
      .map(({ placement: hit }) => hit.id)).toEqual(['second', 'first']);
  });

  it('keeps an unmeasured source inert instead of reviving rectangular hit targets', () => {
    const candidates: FloatingArtworkOpsCandidate[] = [
      { placement: placement('unmeasured'), placementIndex: 0, ops: [op('missing.png', 10)] },
    ];
    expect(floatingArtworkHitCandidatesFromOps(candidates, { x: .25, y: .25 }, new Map())).toEqual([]);
  });

  it('sweeps up every instance a dragged rectangle touches, back to front', () => {
    // Each is a 2×2 destination whose only opaque source pixel is its top-left quarter.
    const candidates: FloatingArtworkOpsCandidate[] = [
      { placement: placement('near'), placementIndex: 0, ops: [op('painted.png', 10, 0, 0)] },
      { placement: placement('far'), placementIndex: 1, ops: [op('painted.png', 10, 40, 0)] },
      { placement: placement('ghost'), placementIndex: 2, ops: [op('transparent.png', 10, 0, 0)] },
    ];
    const masks = new Map([['painted.png', alpha(true)], ['transparent.png', alpha(false)]]);
    const sweep = (minX: number, maxX: number): string[] => floatingArtworkIdsWithinRectFromOps(
      candidates, { minX, minY: 0, maxX, maxY: 2 }, masks,
    );
    expect(sweep(-5, 50)).toEqual(['near', 'far']);
    expect(sweep(-5, 0.5)).toEqual(['near']);
    // Inside the far instance's image rectangle, but only over its transparent right half.
    expect(sweep(41.5, 42)).toEqual([]);
    // An unmeasured source stays inert rather than being swept up sight-unseen.
    expect(floatingArtworkIdsWithinRectFromOps(candidates, { minX: -5, minY: 0, maxX: 50, maxY: 2 }, new Map()))
      .toEqual([]);
  });

  it('cycles only while the pointer and complete overlap stack remain stable', () => {
    const cycle: FloatingArtworkCycleState = {
      candidateIds: ['front', 'rear'],
      index: 0,
      localX: 100,
      localY: 80,
    };
    expect(nextFloatingArtworkCycleIndex(cycle, ['front', 'rear'], 103, 84)).toBe(1);
    expect(nextFloatingArtworkCycleIndex({ ...cycle, index: 1 }, ['front', 'rear'], 103, 84)).toBe(0);
    expect(nextFloatingArtworkCycleIndex(cycle, ['rear'], 103, 84)).toBe(0);
    expect(nextFloatingArtworkCycleIndex(cycle, ['front', 'rear'], 120, 80)).toBe(0);
  });
});
