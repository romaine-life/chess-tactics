import { describe, expect, it } from 'vitest';

import {
  FENCE_OVERLAY_DEPTH_OFFSET,
  WALL_OVERLAY_DEPTH_OFFSET,
  fenceOverlayZIndex,
  mirrorGlassOverlayZIndex,
  mirrorReflectionOverlayZIndex,
  wallArtOverlayZIndex,
  wallOverlayZIndex,
} from './fenceOverlayDepth';
import { GROUND_COVER_FRONT_DEPTH_OFFSET, OBJECT_DEPTH_OFFSET, STRUCTURE_BACK_DEPTH_DELTA, objectBaseZIndex } from './sceneDepth';

describe('fenceOverlayZIndex', () => {
  it('places an edge fence above ground cover and below same-cell object art', () => {
    const ownerCell = { x: 2, y: 3 };
    const ownerCoverFrontZIndex = ownerCell.x + ownerCell.y + GROUND_COVER_FRONT_DEPTH_OFFSET;
    const neighborCoverFrontZIndex = ownerCell.x + 1 + ownerCell.y + GROUND_COVER_FRONT_DEPTH_OFFSET;
    const nearbyForegroundCoverFrontZIndex = ownerCell.x + 2 + ownerCell.y + GROUND_COVER_FRONT_DEPTH_OFFSET;
    const ownerObjectBackZIndex = ownerCell.x + ownerCell.y + OBJECT_DEPTH_OFFSET + STRUCTURE_BACK_DEPTH_DELTA;
    const fenceZIndex = fenceOverlayZIndex(ownerCell);

    expect(GROUND_COVER_FRONT_DEPTH_OFFSET).toBe(OBJECT_DEPTH_OFFSET - 11);
    expect(FENCE_OVERLAY_DEPTH_OFFSET).toBe(OBJECT_DEPTH_OFFSET - 2);
    expect(fenceZIndex).toBeGreaterThan(ownerCoverFrontZIndex);
    expect(fenceZIndex).toBeGreaterThan(neighborCoverFrontZIndex);
    expect(fenceZIndex).toBeGreaterThan(nearbyForegroundCoverFrontZIndex);
    expect(fenceZIndex).toBeLessThan(ownerObjectBackZIndex);
  });
});

describe('wallOverlayZIndex', () => {
  it('places a perimeter wall above ground cover and below same-cell structure art', () => {
    const ownerCell = { x: 2, y: 3 };
    const ownerCoverFrontZIndex = ownerCell.x + ownerCell.y + GROUND_COVER_FRONT_DEPTH_OFFSET;
    const ownerStructureBackZIndex = ownerCell.x + ownerCell.y + OBJECT_DEPTH_OFFSET + STRUCTURE_BACK_DEPTH_DELTA;
    const wallZIndex = wallOverlayZIndex(ownerCell);

    expect(WALL_OVERLAY_DEPTH_OFFSET).toBe(OBJECT_DEPTH_OFFSET - 2);
    expect(wallZIndex).toBeGreaterThan(ownerCoverFrontZIndex);
    expect(wallZIndex).toBeLessThan(ownerStructureBackZIndex);
    expect(wallZIndex).toBeLessThan(objectBaseZIndex(ownerCell));
  });
});

describe('wallArtOverlayZIndex', () => {
  it('orders wall, generated glass, live reflection, and foreground frame inside one display lane', () => {
    const ownerCell = { x: 2, y: 3 };

    expect(mirrorGlassOverlayZIndex(ownerCell)).toBeGreaterThan(wallOverlayZIndex(ownerCell));
    expect(mirrorReflectionOverlayZIndex(ownerCell)).toBeGreaterThan(mirrorGlassOverlayZIndex(ownerCell));
    expect(wallArtOverlayZIndex(ownerCell)).toBeGreaterThan(mirrorReflectionOverlayZIndex(ownerCell));
    expect(wallArtOverlayZIndex(ownerCell)).toBeLessThan(objectBaseZIndex(ownerCell));
  });
});
