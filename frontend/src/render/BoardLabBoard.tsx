import type { ReactNode } from 'react';
import { boardLabCellPosition } from './boardProjection';
import { BoardGridLayer } from './BoardGridLayer';
import { BoardTerrainLayer, terrainCanvasMacroTiles, terrainSideSrc, terrainTopSrc, type TerrainCanvasCell } from './BoardTerrainLayer';
import { TileGrid } from './TileGrid';
import { BoardBarrierSceneLayer } from './BoardBarrierSceneLayer';
import type { SocketBoardCell, SocketBoardResult } from '../core/tileBoardGenerator';
import type { TileSocketAsset } from '../core/tileSockets';
import { featureFrameSrc } from '../art/tileset';
import type { ResolvedFenceOverlay, ResolvedWallOverlay } from '../core/featureAutotile';
import { resolveMacroTilePlacements, type MacroTilePlacement } from '../core/macroTiles';

// Re-export the projection so existing importers (SkirmishBoard, TilePreview, the
// thumbnail bake) keep working; the math itself now lives in one place: boardProjection.
export { boardLabCellPosition, boardLabMetrics } from './boardProjection';

export interface BoardLabBoardOverlayContext<TAsset extends TileSocketAsset> {
  cell: SocketBoardCell<TAsset>;
  left: number;
  top: number;
}

export interface BoardLabBoardProps<TAsset extends TileSocketAsset> {
  board: SocketBoardResult<TAsset>;
  assetFrameSrc: (asset: TAsset) => string;
  boardZoom?: number;
  boardPan?: { x: number; y: number };
  className?: string;
  ariaLabel?: string;
  showGrid?: boolean;
  macroTiles?: readonly MacroTilePlacement[];
  renderCellOverlay?: (context: BoardLabBoardOverlayContext<TAsset>) => ReactNode;
  /**
   * Edge fences resolved to a per-cell rail overlay (E/S mask + material), keyed by "x,y".
   * They render in a board-level foreground layer so the near rails can occlude same-cell art.
   */
  fenceOverlays?: ReadonlyMap<string, ResolvedFenceOverlay>;
  /**
   * Perimeter walls resolved to a per-cell wall overlay (N/W mask + material), keyed by "x,y".
   * Only northmost/westmost map edges resolve to this layer.
   */
  wallOverlays?: ReadonlyMap<string, ResolvedWallOverlay>;
  /** Additional board-art canvas for generated boards (ground cover, props, units, etc.). */
  sceneLayer?: ReactNode;
  children?: ReactNode;
}

// Adapter: a generated socket board -> the shared TileGrid render core.
export function BoardLabBoard<TAsset extends TileSocketAsset>({
  board,
  assetFrameSrc,
  boardZoom = 1,
  boardPan = { x: 0, y: 0 },
  className = '',
  ariaLabel = 'Generated board',
  showGrid = false,
  macroTiles,
  renderCellOverlay,
  fenceOverlays,
  wallOverlays,
  sceneLayer,
  children,
}: BoardLabBoardProps<TAsset>) {
  const sourceCells = board.cells;
  const byKey = new Map<string, SocketBoardCell<TAsset>>(
    sourceCells.map((cell): [string, SocketBoardCell<TAsset>] => [`${cell.x}-${cell.y}`, cell]),
  );
  const byCoordinate = new Map<string, SocketBoardCell<TAsset>>(
    sourceCells.map((cell): [string, SocketBoardCell<TAsset>] => [`${cell.x},${cell.y}`, cell]),
  );
  const occupied = new Set(sourceCells.filter((cell) => cell.asset).map((cell) => `${cell.x}-${cell.y}`));
  const isSideExposed = (cell: SocketBoardCell<TAsset>): boolean => {
    if (!cell.asset) return false;
    if (cell.sideAsset) return true;
    return !occupied.has(`${cell.x + 1}-${cell.y}`) || !occupied.has(`${cell.x}-${cell.y + 1}`);
  };
  const terrainCells: TerrainCanvasCell[] = sourceCells.map((cell) => {
    const topSrc = cell.asset ? assetFrameSrc(cell.asset) : undefined;
    const sideSrc = cell.asset ? assetFrameSrc(cell.sideAsset ?? cell.asset) : undefined;
    return {
      key: `${cell.x}-${cell.y}`,
      x: cell.x,
      y: cell.y,
      topSrc: topSrc ? terrainTopSrc(topSrc, cell.asset?.topAnimFrames) : undefined,
      sideSrc: sideSrc ? terrainSideSrc(sideSrc) : undefined,
      featureSrc: cell.feature ? featureFrameSrc(cell.feature.kind, cell.feature.material, cell.feature.mask) : undefined,
      topAnimFrames: cell.asset?.topAnimFrames,
      drawSide: isSideExposed(cell),
    };
  });
  const cells = sourceCells.map((cell) => {
    // Terrain art is composed once in BoardTerrainLayer; the per-cell DOM stays as semantic
    // editor/game chrome (data hooks, missing labels, selections, hit targets), not tile pixels.
    return {
      key: `${cell.x}-${cell.y}`,
      x: cell.x,
      y: cell.y,
      className: cell.missing ? 'is-missing' : !cell.asset ? 'is-empty' : '',
      data: {
        'data-asset-id': cell.asset?.id,
        'data-side-id': cell.sideAsset?.id,
        'data-missing': cell.missing?.label,
        'data-board-x': cell.x,
        'data-board-y': cell.y,
      },
      children: cell.missing ? <span>{cell.missing?.mask?.toString(2).padStart(4, '0') ?? 'Missing'}</span> : null,
    };
  });
  const columns = sourceCells.reduce((max, cell) => Math.max(max, cell.x + 1), 0);
  const rows = sourceCells.reduce((max, cell) => Math.max(max, cell.y + 1), 0);
  const resolvedMacroTiles = resolveMacroTilePlacements({
    placements: macroTiles,
    columns,
    rows,
    familyAt: (x, y) => {
      const cell = byCoordinate.get(`${x},${y}`);
      return cell?.asset ? cell.terrain : undefined;
    },
  });

  return (
    <TileGrid
      cells={cells}
      className={className}
      ariaLabel={ariaLabel}
      boardZoom={boardZoom}
      boardPan={boardPan}
      backgroundLayer={(
        <>
          <BoardTerrainLayer cells={terrainCells} macroTiles={terrainCanvasMacroTiles(resolvedMacroTiles)} />
          <BoardBarrierSceneLayer fenceOverlays={fenceOverlays} wallOverlays={wallOverlays} />
          {sceneLayer}
        </>
      )}
      renderCellOverlay={
        renderCellOverlay
          ? (cell, position) => {
              const original = byKey.get(cell.key);
              return original ? renderCellOverlay({ cell: original, left: position.left, top: position.top }) : null;
            }
          : undefined
      }
    >
      {showGrid ? <BoardGridLayer cells={sourceCells} /> : null}
      {children}
    </TileGrid>
  );
}
