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
import {
  GROUND_COVER_BACK_DEPTH_OFFSET,
  GROUND_COVER_FRONT_DEPTH_OFFSET,
  OBJECT_DEPTH_OFFSET,
  groundCoverZIndex,
  objectBaseZIndex,
  structureBackZIndex,
} from './sceneDepth';

describe('fenceOverlayZIndex', () => {
  it('keeps the barrier lane below object art without flattening the grass bracket', () => {
    const ownerCell = { x: 2, y: 3 };
    const ownerCoverBackZIndex = groundCoverZIndex(ownerCell, -1);
    const ownerCoverFrontZIndex = groundCoverZIndex(ownerCell, 1);
    const ownerObjectBackZIndex = structureBackZIndex(ownerCell);
    const ownerObjectZIndex = objectBaseZIndex(ownerCell);
    const fenceZIndex = fenceOverlayZIndex(ownerCell);

    expect(GROUND_COVER_BACK_DEPTH_OFFSET).toBe(OBJECT_DEPTH_OFFSET - 1);
    expect(GROUND_COVER_FRONT_DEPTH_OFFSET).toBe(OBJECT_DEPTH_OFFSET + 1);
    expect(FENCE_OVERLAY_DEPTH_OFFSET).toBe(OBJECT_DEPTH_OFFSET - 2);
    expect(fenceZIndex).toBeLessThan(ownerCoverBackZIndex);
    expect(fenceZIndex).toBeLessThan(ownerObjectBackZIndex);
    expect(ownerCoverBackZIndex).toBeLessThan(ownerObjectZIndex);
    expect(ownerCoverFrontZIndex).toBeGreaterThan(ownerObjectZIndex);
  });
});

describe('wallOverlayZIndex', () => {
  it('keeps a perimeter wall in the background barrier lane while grass brackets the unit', () => {
    const ownerCell = { x: 2, y: 3 };
    const ownerCoverBackZIndex = groundCoverZIndex(ownerCell, -1);
    const ownerCoverFrontZIndex = groundCoverZIndex(ownerCell, 1);
    const ownerStructureBackZIndex = structureBackZIndex(ownerCell);
    const wallZIndex = wallOverlayZIndex(ownerCell);

    expect(WALL_OVERLAY_DEPTH_OFFSET).toBe(OBJECT_DEPTH_OFFSET - 2);
    expect(wallZIndex).toBeLessThan(ownerCoverBackZIndex);
    expect(wallZIndex).toBeLessThan(ownerStructureBackZIndex);
    expect(wallZIndex).toBeLessThan(objectBaseZIndex(ownerCell));
    expect(ownerCoverFrontZIndex).toBeGreaterThan(objectBaseZIndex(ownerCell));
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
