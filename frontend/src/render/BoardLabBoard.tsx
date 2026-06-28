import type { ReactNode } from 'react';
import { boardLabCellPosition } from './boardProjection';
import { TileGrid } from './TileGrid';
import type { SocketBoardCell, SocketBoardResult } from '../core/tileBoardGenerator';
import type { TileSocketAsset } from '../core/tileSockets';
import { featureFrameSrc } from '../art/tileset';

// Re-export the projection so existing importers (SkirmishBoard, LevelPreviewBoard,
// TilePreview) keep working; the math itself now lives in one place: boardProjection.
export { boardLabCellPosition, boardLabMetrics } from './boardProjection';

export interface BoardLabBoardOverlayContext<TAsset extends TileSocketAsset> {
  cell: SocketBoardCell<TAsset>;
  left: number;
  top: number;
}

export interface BoardLabBoardProps<TAsset extends TileSocketAsset> {
  board: SocketBoardResult<TAsset>;
  assetFrameSrc: (asset: TAsset) => string;
  showFootprint?: boolean;
  boardZoom?: number;
  boardPan?: { x: number; y: number };
  className?: string;
  ariaLabel?: string;
  renderCellOverlay?: (context: BoardLabBoardOverlayContext<TAsset>) => ReactNode;
  children?: ReactNode;
}

// Adapter: a generated socket board -> the shared TileGrid render core.
export function BoardLabBoard<TAsset extends TileSocketAsset>({
  board,
  assetFrameSrc,
  showFootprint = false,
  boardZoom = 1,
  boardPan = { x: 0, y: 0 },
  className = '',
  ariaLabel = 'Generated board',
  renderCellOverlay,
  children,
}: BoardLabBoardProps<TAsset>) {
  const sourceCells = board.cells;
  const byKey = new Map<string, SocketBoardCell<TAsset>>(
    sourceCells.map((cell): [string, SocketBoardCell<TAsset>] => [`${cell.x}-${cell.y}`, cell]),
  );
  const cells = sourceCells.map((cell) => ({
    key: `${cell.x}-${cell.y}`,
    x: cell.x,
    y: cell.y,
    className: cell.missing ? 'is-missing' : '',
    data: {
      'data-asset-id': cell.asset?.id,
      'data-missing': cell.missing?.label,
      'data-board-x': cell.x,
      'data-board-y': cell.y,
    },
    children: (
      <>
        {cell.asset ? (
          <img src={assetFrameSrc(cell.asset)} alt="" draggable={false} />
        ) : (
          <span>{cell.missing?.mask?.toString(2).padStart(4, '0') ?? 'Missing'}</span>
        )}
        {cell.feature ? (
          <img
            className="tileset-feature-overlay"
            src={featureFrameSrc(cell.feature.kind, cell.feature.material, cell.feature.mask)}
            alt=""
            draggable={false}
          />
        ) : null}
      </>
    ),
  }));

  return (
    <TileGrid
      cells={cells}
      className={className}
      ariaLabel={ariaLabel}
      showFootprint={showFootprint}
      boardZoom={boardZoom}
      boardPan={boardPan}
      renderCellOverlay={
        renderCellOverlay
          ? (cell, position) => {
              const original = byKey.get(cell.key);
              return original ? renderCellOverlay({ cell: original, left: position.left, top: position.top }) : null;
            }
          : undefined
      }
    >
      {children}
    </TileGrid>
  );
}
