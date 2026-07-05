import type { ReactElement } from 'react';
import { fenceFrameSrc } from '../art/tileset';
import type { ResolvedFenceOverlay } from '../core/featureAutotile';
import { boardLabCellPosition } from './boardProjection';
import { fenceOverlayZIndex } from './fenceOverlayDepth';

function parseCellKey(key: string): { x: number; y: number } | null {
  const [x, y] = key.split(',').map(Number);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

export function FenceOverlayLayer({
  overlays,
}: {
  overlays?: ReadonlyMap<string, ResolvedFenceOverlay>;
}): ReactElement | null {
  if (!overlays?.size) return null;
  const rails: ReactElement[] = [];
  for (const [key, fence] of overlays) {
    const cell = parseCellKey(key);
    if (!cell) continue;
    const { left, top } = boardLabCellPosition(cell);
    rails.push(
      <img
        key={`fence-${key}`}
        className="tileset-board-fence-overlay"
        src={fenceFrameSrc(fence.material, fence.mask)}
        alt=""
        draggable={false}
        style={{ left, top, zIndex: fenceOverlayZIndex(cell) }}
      />,
    );
  }
  return <>{rails}</>;
}
