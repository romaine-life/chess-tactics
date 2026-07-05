// Edge-fence rails sit between the two cells they divide. A fence owned by cell (x,y)
// must draw over that back/owner cell's unit, but under the unit in the near neighbour
// (x+1,y) or (x,y+1). The near neighbour is exactly one x+y band later, and units render
// after fence overlays in the DOM, so tying that near-cell z lets the near unit win.
export const FENCE_OVERLAY_DEPTH_OFFSET = 20001;

export function fenceOverlayZIndex(cell: { x: number; y: number }): number {
  return cell.x + cell.y + FENCE_OVERLAY_DEPTH_OFFSET;
}
