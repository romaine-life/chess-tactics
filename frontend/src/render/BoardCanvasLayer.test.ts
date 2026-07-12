import { describe, expect, it } from 'vitest';
import type { BoardDrawOp } from '@chess-tactics/board-render';
import { isAnimatedGroundCoverOp } from './BoardCanvasLayer';

function drawOp(overrides: Partial<BoardDrawOp> = {}): BoardDrawOp {
  return {
    layer: 'scene',
    src: `/api/media/${'a'.repeat(64)}`,
    dx: 0,
    dy: 0,
    dw: 40,
    dh: 37,
    z: 1,
    sx: 0,
    sy: 0,
    sw: 40,
    sh: 37,
    ...overrides,
  };
}

describe('BoardCanvasLayer live ground-cover animation', () => {
  it('uses typed draw metadata instead of inferring ownership from an asset URL', () => {
    expect(isAnimatedGroundCoverOp(drawOp({
      animation: { kind: 'ground-cover-sway', frameCount: 6, durationMs: 1140, phase: 2 },
    }))).toBe(true);
    expect(isAnimatedGroundCoverOp(drawOp())).toBe(false);
  });

  it('does not animate a single-frame live sheet', () => {
    expect(isAnimatedGroundCoverOp(drawOp({
      animation: { kind: 'ground-cover-sway', frameCount: 1, durationMs: 1140, phase: 0 },
    }))).toBe(false);
  });
});
