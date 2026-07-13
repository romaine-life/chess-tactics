// Shared board depth policy. Keep the offsets named so terrain dressing, barriers,
// objects, and exported thumbnails cannot drift into slightly different stacks.

export const OBJECT_DEPTH_OFFSET = 20_000;
export const STRUCTURE_BACK_DEPTH_DELTA = -1;
export const STRUCTURE_FRONT_DEPTH_DELTA = 1;

export const GROUND_COVER_BACK_DEPTH_OFFSET = OBJECT_DEPTH_OFFSET - 12;
export const GROUND_COVER_FRONT_DEPTH_OFFSET = OBJECT_DEPTH_OFFSET - 11;

// Edge fences are floor barriers: above ambient cover, below units/doodads/props
// seated in the cell. Ground cover leaves a wider gutter below fences because
// tufts from the nearby foreground rows can still visually overlap the rail.
export const FENCE_OVERLAY_DEPTH_OFFSET = OBJECT_DEPTH_OFFSET - 2;
// A post caps every rail that terminates at its vertex. Keep it half a band in front of the
// nearest incident rail so the rail sprite's own terminal upright cannot paint through the post.
export const FENCE_POST_DEPTH_BIAS = 0.5;

// Perimeter walls sit on the back edges of their owner cells. Keep the entire wall below
// same-cell structure art; otherwise a split prop/doodad is painted back-half, wall, front-half
// and the wall appears to cut through it. This is the same background-barrier lane as fences.
export const WALL_OVERLAY_DEPTH_OFFSET = OBJECT_DEPTH_OFFSET - 2;
export const MIRROR_GLASS_DEPTH_DELTA = 0.1;
export const MIRROR_REFLECTION_DEPTH_DELTA = 0.25;
export const WALL_ART_DEPTH_DELTA = 0.5;

export function cellDepth(cell: { x: number; y: number }): number {
  return cell.x + cell.y;
}

export function objectBaseZIndex(cell: { x: number; y: number }): number {
  return cellDepth(cell) + OBJECT_DEPTH_OFFSET;
}

export function structureBackZIndex(cell: { x: number; y: number }): number {
  return objectBaseZIndex(cell) + STRUCTURE_BACK_DEPTH_DELTA;
}

export function structureFrontZIndex(cell: { x: number; y: number }): number {
  return objectBaseZIndex(cell) + STRUCTURE_FRONT_DEPTH_DELTA;
}

export function groundCoverZIndex(cell: { x: number; y: number }, tuftDy: number): number {
  return cellDepth(cell) + (tuftDy > 0 ? GROUND_COVER_FRONT_DEPTH_OFFSET : GROUND_COVER_BACK_DEPTH_OFFSET);
}

export function fenceOverlayZIndex(cell: { x: number; y: number }): number {
  return cellDepth(cell) + FENCE_OVERLAY_DEPTH_OFFSET;
}

/**
 * A fence vertex's projected base is one depth step above `cellDepth(vertex)`. The positive
 * half-band bias puts the post in front of both possible incident rail-owner bands, so a post
 * consistently caps its rail endpoints without entering the object band.
 */
export function fencePostZIndex(vertex: { x: number; y: number }): number {
  return cellDepth(vertex) - 1 + FENCE_OVERLAY_DEPTH_OFFSET + FENCE_POST_DEPTH_BIAS;
}

export function wallOverlayZIndex(cell: { x: number; y: number }): number {
  return cellDepth(cell) + WALL_OVERLAY_DEPTH_OFFSET;
}

export function wallArtOverlayZIndex(cell: { x: number; y: number }): number {
  return wallOverlayZIndex(cell) + WALL_ART_DEPTH_DELTA;
}

/** Glass lives after the wall pixels but before the generated frame. Fractional lanes keep both
 * below the next integer object/structure band without relying on insertion order. */
export function mirrorReflectionOverlayZIndex(cell: { x: number; y: number }): number {
  return wallOverlayZIndex(cell) + MIRROR_REFLECTION_DEPTH_DELTA;
}

export function mirrorGlassOverlayZIndex(cell: { x: number; y: number }): number {
  return wallOverlayZIndex(cell) + MIRROR_GLASS_DEPTH_DELTA;
}
