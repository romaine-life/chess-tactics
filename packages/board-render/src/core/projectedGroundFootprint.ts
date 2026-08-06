import { TILE_STEP_X, TILE_STEP_Y } from '../art/projectionContract';
import { unprojectBoardPoint } from '../render/boardProjection';

/** An object's ground-contact extent after projection into scene pixels. */
export interface ProjectedGroundFootprint {
  x: number;
  y: number;
  rx: number;
  ry: number;
}

/** Grid-edge coordinates, rather than integer cell-centre coordinates. */
export interface ProjectedGroundGridRect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Exact half-extent of a scene-space ellipse after inverse projection onto either grid axis.
 * Both grid axes have the same radius under the canonical isometric projection.
 */
export function projectedGroundFootprintGridRadius(footprint: ProjectedGroundFootprint): number {
  return Math.sqrt(
    (footprint.rx / TILE_STEP_X) ** 2 + (footprint.ry / TILE_STEP_Y) ** 2,
  ) / 2;
}

/** True when the complete ground-contact ellipse lies inside explicit grid-edge bounds. */
export function projectedGroundFootprintWithinGridRect(
  footprint: ProjectedGroundFootprint,
  rect: ProjectedGroundGridRect,
): boolean {
  const radius = projectedGroundFootprintGridRadius(footprint);
  const centre = unprojectBoardPoint({ left: footprint.x, top: footprint.y });
  return centre.x - radius >= rect.minX && centre.x + radius <= rect.maxX
    && centre.y - radius >= rect.minY && centre.y + radius <= rect.maxY;
}
