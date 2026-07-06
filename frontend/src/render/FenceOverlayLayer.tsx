import type { ReactElement } from 'react';
import { fenceFrameSrc, wallFrameSrc } from '../art/tileset';
import type { ResolvedFenceOverlay, ResolvedWallOverlay } from '../core/featureAutotile';
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

export function WallOverlayLayer({
  overlays,
}: {
  overlays?: ReadonlyMap<string, ResolvedWallOverlay>;
}): ReactElement | null {
  return (
    <BarrierOverlayLayer
      overlays={overlays}
      className="tileset-board-wall-overlay"
      keyPrefix="wall"
      src={(wall) => wallFrameSrc(wall.material, wall.mask)}
      zIndex={wallOverlayZIndex}
    />
  );
}
