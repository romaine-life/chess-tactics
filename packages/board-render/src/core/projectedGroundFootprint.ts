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

/** Grid-space slack below which two rectangle edges are the same edge. */
const GRID_COVERAGE_EPSILON = 1e-9;

/**
 * True when the footprint's grid-space extent is covered by the UNION of several grid-edge rects.
 *
 * Testing "inside SOME rectangle" is not the same question and gets the seam wrong: two patches
 * that meet edge to edge are one continuous piece of ground, but an object straddling the join is
 * inside neither of them on its own. So the box is swept in vertical slabs cut at every rectangle
 * edge, and each slab's y-range must be covered by the rectangles spanning it.
 *
 * `margin` grows the footprint on both axes before the test — how the callers that measure against
 * cell CENTRES ask the same question of rectangles stated in cell EDGES.
 */
export function projectedGroundFootprintWithinGridRects(
  footprint: ProjectedGroundFootprint,
  rects: readonly ProjectedGroundGridRect[],
  margin = 0,
): boolean {
  if (!rects.length) return false;
  const radius = projectedGroundFootprintGridRadius(footprint) + margin;
  const centre = unprojectBoardPoint({ left: footprint.x, top: footprint.y });
  const box = {
    minX: centre.x - radius,
    maxX: centre.x + radius,
    minY: centre.y - radius,
    maxY: centre.y + radius,
  };
  if (rects.length === 1) {
    return box.minX >= rects[0].minX && box.maxX <= rects[0].maxX
      && box.minY >= rects[0].minY && box.maxY <= rects[0].maxY;
  }

  const touching = rects.filter((rect) => (
    rect.minX < box.maxX + GRID_COVERAGE_EPSILON && rect.maxX > box.minX - GRID_COVERAGE_EPSILON
    && rect.minY < box.maxY + GRID_COVERAGE_EPSILON && rect.maxY > box.minY - GRID_COVERAGE_EPSILON
  ));
  if (!touching.length) return false;

  const cuts = new Set<number>([box.minX, box.maxX]);
  for (const rect of touching) {
    if (rect.minX > box.minX && rect.minX < box.maxX) cuts.add(rect.minX);
    if (rect.maxX > box.minX && rect.maxX < box.maxX) cuts.add(rect.maxX);
  }
  const edges = [...cuts].sort((a, b) => a - b);
  const samples: number[] = [];
  for (let index = 0; index < edges.length - 1; index += 1) {
    if (edges[index + 1] - edges[index] > GRID_COVERAGE_EPSILON) {
      samples.push((edges[index] + edges[index + 1]) / 2);
    }
  }
  // A footprint with no width still has a position to test.
  if (!samples.length) samples.push((box.minX + box.maxX) / 2);

  for (const sample of samples) {
    const spans = touching
      .filter((rect) => rect.minX <= sample && rect.maxX >= sample)
      .map((rect) => ({
        low: Math.max(rect.minY, box.minY),
        high: Math.min(rect.maxY, box.maxY),
      }))
      .filter((span) => span.high > span.low - GRID_COVERAGE_EPSILON)
      .sort((a, b) => a.low - b.low);
    let reach = box.minY;
    for (const span of spans) {
      if (span.low > reach + GRID_COVERAGE_EPSILON) break;
      reach = Math.max(reach, span.high);
      if (reach >= box.maxY - GRID_COVERAGE_EPSILON) break;
    }
    if (reach < box.maxY - GRID_COVERAGE_EPSILON) return false;
  }
  return true;
}
