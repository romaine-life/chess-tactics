import type { ReactElement } from 'react';
import { fenceFrameSrc, wallFrameSrc } from '../art/tileset';
import type { ResolvedFenceOverlay, ResolvedWallOverlay } from '../core/featureAutotile';
import { resolveWallArtFaces, slotSource, wallArtSlotsForFace, type WallArtFaceMap, type WallArtPlacementMap } from '../core/wallArt';
import type { WallDecorFaceId } from '../core/wallDecor';
import { boardLabCellPosition } from './boardProjection';
import { fenceOverlayZIndex, wallOverlayZIndex } from './fenceOverlayDepth';

function parseCellKey(key: string): { x: number; y: number } | null {
  const [x, y] = key.split(',').map(Number);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function BarrierOverlayLayer<TOverlay extends { mask: number }>({
  overlays,
  className,
  keyPrefix,
  src,
  zIndex,
}: {
  overlays?: ReadonlyMap<string, TOverlay>;
  className: string;
  keyPrefix: string;
  src: (overlay: TOverlay) => string;
  zIndex: (cell: { x: number; y: number }) => number;
}): ReactElement | null {
  if (!overlays?.size) return null;
  const barriers: ReactElement[] = [];
  for (const [key, overlay] of overlays) {
    const cell = parseCellKey(key);
    if (!cell) continue;
    const { left, top } = boardLabCellPosition(cell);
    barriers.push(
      <img
        key={`${keyPrefix}-${key}`}
        className={className}
        src={src(overlay)}
        alt=""
        draggable={false}
        style={{ left, top, zIndex: zIndex(cell) }}
      />,
    );
  }
  return <>{barriers}</>;
}

export function FenceOverlayLayer({
  overlays,
}: {
  overlays?: ReadonlyMap<string, ResolvedFenceOverlay>;
}): ReactElement | null {
  return (
    <BarrierOverlayLayer
      overlays={overlays}
      className="tileset-board-fence-overlay"
      keyPrefix="fence"
      src={(fence) => fenceFrameSrc(fence.material, fence.mask)}
      zIndex={fenceOverlayZIndex}
    />
  );
}

const WALL_FRAME_LEFT = -64;
const WALL_FRAME_TOP = -96;

function wallArtStyle(cell: { x: number; y: number }, face: WallDecorFaceId, artId: string | undefined): ReactElement[] {
  const slots = wallArtSlotsForFace(artId, face);
  if (!slots.length) return [];
  const { left, top } = boardLabCellPosition(cell);
  const frameLeft = left + WALL_FRAME_LEFT;
  const frameTop = top + WALL_FRAME_TOP;
  const zIndex = wallOverlayZIndex(cell) + 1;
  return slots.map((slot) => {
    const source = slotSource(slot);
    const faceAsset = source.faces[face];
    return (
      <img
        key={`wall-art-${cell.x}-${cell.y}-${face}-${slot.id}`}
        className="tileset-board-wall-decor"
        src={faceAsset.src}
        alt=""
        draggable={false}
        style={{
          left: frameLeft + slot.x - faceAsset.mountX * slot.scale,
          top: frameTop + slot.y - faceAsset.mountY * slot.scale,
          width: faceAsset.width * slot.scale,
          height: faceAsset.height * slot.scale,
          zIndex,
        }}
      />
    );
  });
}

export function WallOverlayLayer({
  overlays,
  wallArt,
  bounds,
}: {
  overlays?: ReadonlyMap<string, ResolvedWallOverlay>;
  wallArt?: WallArtPlacementMap;
  bounds?: { cols: number; rows: number };
}): ReactElement | null {
  if (!overlays?.size) return null;
  const faceStyles = wallArt && bounds ? resolveWallArtFaces(wallArt, bounds) : new Map<string, WallArtFaceMap>();
  const walls: ReactElement[] = [];
  for (const [key, wall] of overlays) {
    const cell = parseCellKey(key);
    if (!cell) continue;
    const { left, top } = boardLabCellPosition(cell);
    walls.push(
      <img
        key={`wall-${key}`}
        className="tileset-board-wall-overlay"
        src={wallFrameSrc(wall.material, wall.mask)}
        alt=""
        draggable={false}
        style={{ left, top, zIndex: wallOverlayZIndex(cell) }}
      />,
    );
    const styles = faceStyles.get(key);
    if (wall.mask & 8) walls.push(...wallArtStyle(cell, 'west', styles?.west));
    if (wall.mask & 1) walls.push(...wallArtStyle(cell, 'north', styles?.north));
  }
  return <>{walls}</>;
}
