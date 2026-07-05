import { describe, expect, it } from 'vitest';

import { FENCE_OVERLAY_DEPTH_OFFSET, fenceOverlayZIndex } from './fenceOverlayDepth';

describe('fenceOverlayZIndex', () => {
  it('places an edge fence above its owner cell and under the near cell unit band', () => {
    const ownerCell = { x: 2, y: 3 };
    const ownerUnitZIndex = ownerCell.x + ownerCell.y + 20_000;
    const nearUnitZIndex = ownerCell.x + 1 + ownerCell.y + 20_000;
    const fenceZIndex = fenceOverlayZIndex(ownerCell);

    expect(FENCE_OVERLAY_DEPTH_OFFSET).toBe(20_001);
    expect(fenceZIndex).toBe(ownerUnitZIndex + 1);
    expect(fenceZIndex).toBe(nearUnitZIndex);
  });
});
