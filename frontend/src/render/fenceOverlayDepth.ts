// Edge-fence rails are foreground objects: their E/S sprites sit on the two near diamond edges,
// so they must escape the tile's z-stack and draw over same-cell units/structures.
export const FENCE_OVERLAY_DEPTH_OFFSET = 20002;

export function fenceOverlayZIndex(cell: { x: number; y: number }): number {
  return cell.x + cell.y + FENCE_OVERLAY_DEPTH_OFFSET;
}
