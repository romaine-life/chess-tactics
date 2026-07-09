// Edge-fence rails sit between the two cells they divide. A fence owned by cell (x,y)
// must draw over that back/owner cell's unit, but under the unit in the near neighbour
// (x+1,y) or (x,y+1). The near neighbour is exactly one x+y band later, and units render
// after fence overlays in the DOM, so tying that near-cell z lets the near unit win.
export const FENCE_OVERLAY_DEPTH_OFFSET = 20001;

export function fenceOverlayZIndex(cell: { x: number; y: number }): number {
  return cell.x + cell.y + FENCE_OVERLAY_DEPTH_OFFSET;
}

// Walls are owned by a northmost/westmost perimeter cell and drawn on that cell's N/W edge.
// Tie them to the owner unit's band; units render after barrier overlays in the DOM, so the
// owner unit stays visible while the wall remains seated to the map border.
export const WALL_OVERLAY_DEPTH_OFFSET = 20000;

export function wallOverlayZIndex(cell: { x: number; y: number }): number {
  return cell.x + cell.y + WALL_OVERLAY_DEPTH_OFFSET;
}

// Wall art is mounted onto the wall frame, so it belongs to the wall's display layer.
// It draws after the wall image inside that same layer, while same-cell units/props can
// still stand in front through normal DOM order when their z-index ties the wall.
export function wallArtOverlayZIndex(cell: { x: number; y: number }): number {
  return wallOverlayZIndex(cell);
}
