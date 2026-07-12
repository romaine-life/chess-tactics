import { WALL_FRAME_GEOMETRY } from '@chess-tactics/board-render/art/tileset';
import { TILE_TEMPLATE } from '../art/tileTemplate';
import type { WallDecorFaceId } from '../core/wallDecor';

export interface LevelEditorWallFaceGeometry {
  left: number;
  top: number;
  width: number;
  height: number;
  viewBox: string;
  points: string;
}

/** Exact clickable wall face derived from the canonical tile projection and generated-wall frame. */
export function levelEditorWallFaceGeometry(
  face: WallDecorFaceId,
  seat: { left: number; top: number },
): LevelEditorWallFaceGeometry {
  const width = TILE_TEMPLATE.stepX;
  const slope = TILE_TEMPLATE.stepY;
  const wallHeight = WALL_FRAME_GEOMETRY.wallHeight;
  const height = wallHeight + slope;
  const left = seat.left + (face === 'west' ? -width : 0);
  const top = seat.top + WALL_FRAME_GEOMETRY.backEdgeApexOffsetY - wallHeight;
  const points = face === 'west'
    ? `0,${slope} ${width},0 ${width},${wallHeight} 0,${height}`
    : `0,0 ${width},${slope} ${width},${height} 0,${wallHeight}`;
  return { left, top, width, height, viewBox: `0 0 ${width} ${height}`, points };
}
