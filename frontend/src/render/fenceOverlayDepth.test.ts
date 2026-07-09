import { describe, expect, it } from 'vitest';

import { FENCE_OVERLAY_DEPTH_OFFSET, WALL_OVERLAY_DEPTH_OFFSET, fenceOverlayZIndex, wallArtOverlayZIndex, wallOverlayZIndex } from './fenceOverlayDepth';

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

describe('wallOverlayZIndex', () => {
  it('places a perimeter wall in the owner unit band', () => {
    const ownerCell = { x: 2, y: 3 };
    const farUnitZIndex = ownerCell.x - 1 + ownerCell.y + 20_000;
    const nearUnitZIndex = ownerCell.x + ownerCell.y + 20_000;
    const wallZIndex = wallOverlayZIndex(ownerCell);

    expect(WALL_OVERLAY_DEPTH_OFFSET).toBe(20_000);
    expect(wallZIndex).toBeGreaterThan(farUnitZIndex);
    expect(wallZIndex).toBe(nearUnitZIndex);
  });
});

describe('wallArtOverlayZIndex', () => {
  it('keeps mounted art in the wall display layer', () => {
    const ownerCell = { x: 2, y: 3 };

    expect(wallArtOverlayZIndex(ownerCell)).toBe(wallOverlayZIndex(ownerCell));
  });
});
