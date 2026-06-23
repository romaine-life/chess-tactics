import type { CSSProperties, ReactNode } from 'react';
import { TILE_TEMPLATE } from '../art/tileTemplate';
import type { SocketBoardCell, SocketBoardResult } from '../core/tileBoardGenerator';
import type { TileSocketAsset } from '../core/tileSockets';

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

export function boardLabCellPosition(cell: { x: number; y: number }): { left: number; top: number; zIndex: number } {
  return {
    left: (cell.x - cell.y) * TILE_TEMPLATE.stepX,
    top: (cell.x + cell.y) * TILE_TEMPLATE.stepY,
    zIndex: cell.x + cell.y,
  };
}

function boardMetrics(cells: readonly { x: number; y: number }[]) {
  const projectedPoints = cells.map((cell) => boardLabCellPosition(cell));
  const minLeft = Math.min(...projectedPoints.map((point) => point.left - 48));
  const maxLeft = Math.max(...projectedPoints.map((point) => point.left + 48));
  const minTop = Math.min(...projectedPoints.map((point) => point.top - 27));
  const maxTop = Math.max(...projectedPoints.map((point) => point.top + 140));
  const boardWidth = maxLeft - minLeft;
  const boardHeight = maxTop - minTop;
  return {
    originLeft: -minLeft - boardWidth / 2,
    originTop: -minTop - boardHeight / 2,
  };
}

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
  const cells = board.cells;
  const metrics = boardMetrics(cells.length ? cells : [{ x: 0, y: 0 }]);

  return (
    <div
      className={`tileset-generated-board ${showFootprint ? 'has-footprint' : ''} ${className}`}
      style={
        {
          '--board-zoom': boardZoom,
          '--board-pan-x': `${boardPan.x}px`,
          '--board-pan-y': `${boardPan.y}px`,
          '--board-origin-left': `${metrics.originLeft}px`,
          '--board-origin-top': `${metrics.originTop}px`,
        } as CSSProperties
      }
      aria-label={ariaLabel}
    >
      {cells.map((cell) => {
        const { left, top, zIndex } = boardLabCellPosition(cell);
        return (
          <div
            key={`${cell.x}-${cell.y}`}
            className={`tileset-generated-board-tile ${cell.missing ? 'is-missing' : ''}`}
            data-asset-id={cell.asset?.id}
            data-missing={cell.missing?.label}
            data-board-x={cell.x}
            data-board-y={cell.y}
            style={{ left, top, zIndex }}
          >
            {cell.asset ? <img src={assetFrameSrc(cell.asset)} alt="" draggable={false} /> : <span>{cell.missing?.mask?.toString(2).padStart(4, '0') ?? 'Missing'}</span>}
          </div>
        );
      })}
      {renderCellOverlay ? cells.map((cell) => {
        const { left, top, zIndex } = boardLabCellPosition(cell);
        return (
          <div
            key={`overlay-${cell.x}-${cell.y}`}
            className="tileset-generated-board-overlay-cell"
            style={{ left, top, zIndex: zIndex + 10000 }}
          >
            {renderCellOverlay({ cell, left, top })}
          </div>
        );
      }) : null}
      {children}
    </div>
  );
}
