import type { ReactNode } from 'react';
import {
  liveMediaForSlot,
  resolveTerrainSideExposure,
  resolveTerrainSideFaces,
  resolveTerrainSideMaterials,
} from '@chess-tactics/board-render';
import { boardLabCellPosition } from './boardProjection';
import { BoardGridLayer } from './BoardGridLayer';
import { BoardTerrainLayer, terrainCanvasMacroTiles, terrainSideSrc, terrainTopSrc, type TerrainCanvasCell } from './BoardTerrainLayer';
import { TileGrid } from './TileGrid';
import { BoardBarrierSceneLayer } from './BoardBarrierSceneLayer';
import type { SocketBoardCell, SocketBoardResult } from '../core/tileBoardGenerator';
import type { TileSocketAsset } from '../core/tileSockets';
import { featureFrameSrc } from '../art/tileset';
import type { ResolvedFenceOverlay, ResolvedFencePost, ResolvedWallOverlay } from '../core/featureAutotile';
import type { WallArtPlacementMap } from '../core/wallArt';
import { resolveMacroTilePlacements, type MacroTilePlacement } from '../core/macroTiles';

// Re-export the projection so existing importers (SkirmishBoard, TilePreview, the
// thumbnail bake) keep working; the math itself now lives in one place: boardProjection.
export { boardLabCellPosition, boardLabMetrics } from './boardProjection';

export interface BoardLabBoardOverlayContext<TAsset extends TileSocketAsset> {
  cell: SocketBoardCell<TAsset>;
  left: number;
  top: number;
}

export type BoardLabTerrainRole = 'top' | 'side';

export interface BoardLabTerrainSourceContext<TAsset extends TileSocketAsset> {
  role: BoardLabTerrainRole;
  cell: SocketBoardCell<TAsset>;
  asset: TAsset;
}

export type BoardLabTerrainSourceOverride<TAsset extends TileSocketAsset> = (
  stableSrc: string,
  context: BoardLabTerrainSourceContext<TAsset>,
) => string | undefined;

/** Pin one stable semantic face URL to the immutable object in one hydrated catalog snapshot. */
export function immutableBoardLabTerrainSrc(stableSrc: string): string {
  if (!stableSrc.startsWith('/assets/') || stableSrc.includes('?') || stableSrc.includes('#')) {
    throw new Error(`Board terrain source is not a stable semantic asset URL: ${stableSrc}`);
  }
  let slot: string;
  try {
    slot = stableSrc.slice('/assets/'.length).split('/').map(decodeURIComponent).join('/');
  } catch {
    throw new Error(`Board terrain source contains an invalid encoded slot: ${stableSrc}`);
  }
  const media = liveMediaForSlot(slot).media;
  if (media.url !== stableSrc) {
    throw new Error(`Hydrated media slot ${slot} does not match its board URL.`);
  }
  return media.immutableUrl;
}

/** Apply a review override only after the runtime frame has become its exact top/side slot. */
export function resolveBoardLabTerrainSrc<TAsset extends TileSocketAsset>(
  stableFrameSrc: string,
  role: BoardLabTerrainRole,
  context: Omit<BoardLabTerrainSourceContext<TAsset>, 'role'>,
  override?: BoardLabTerrainSourceOverride<TAsset>,
): string {
  const stableSrc = role === 'top'
    ? terrainTopSrc(stableFrameSrc, context.cell.asset?.topAnimFrames)
    : terrainSideSrc(stableFrameSrc);
  const candidateSrc = override?.(stableSrc, { ...context, role });
  return candidateSrc ?? immutableBoardLabTerrainSrc(stableSrc);
}

export interface BoardLabBoardProps<TAsset extends TileSocketAsset> {
  board: SocketBoardResult<TAsset>;
  assetFrameSrc: (asset: TAsset) => string;
  /**
   * Review-only resolver for an exact transformed semantic slot. It receives
   * `/assets/...-top[-anim].png` or `/assets/...-side.png`, never the combined
   * source frame, so candidate bytes cannot accidentally replace a sibling role.
   */
  terrainSrcOverride?: BoardLabTerrainSourceOverride<TAsset>;
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
  /** Automatic and explicitly authored posts, keyed once by canonical fence vertex "x,y". */
  fencePosts?: ReadonlyMap<string, ResolvedFencePost>;
  /**
   * Perimeter walls resolved to a per-cell wall overlay (N/W mask + material), keyed by "x,y".
   * Only northmost/westmost map edges resolve to this layer.
   */
  wallOverlays?: ReadonlyMap<string, ResolvedWallOverlay>;
  /** Raw wall-art ids by anchor edge key; used to draw mounted wall art over wall frames. */
  wallArt?: WallArtPlacementMap;
  wallBounds?: { cols: number; rows: number };
  /** Additional board-art canvas for generated boards (ground cover, props, units, etc.). */
  sceneLayer?: ReactNode;
  children?: ReactNode;
}

export function boardLabTerrainCanvasCells<TAsset extends TileSocketAsset>(
  sourceCells: readonly SocketBoardCell<TAsset>[],
  assetFrameSrc: (asset: TAsset) => string,
  terrainSrcOverride?: BoardLabTerrainSourceOverride<TAsset>,
): TerrainCanvasCell[] {
  const occupied = new Set(sourceCells.filter((cell) => cell.asset).map((cell) => `${cell.x}-${cell.y}`));
  return sourceCells.map((cell) => {
    const topAsset = cell.asset;
    const topFrameSrc = topAsset ? assetFrameSrc(topAsset) : undefined;
    const sideMaterials = resolveTerrainSideMaterials(
      cell.asset,
      cell.sideAssets,
      (asset) => resolveBoardLabTerrainSrc(
        assetFrameSrc(asset),
        'side',
        { cell, asset },
        terrainSrcOverride,
      ),
    );
    return {
      key: `${cell.x}-${cell.y}`,
      x: cell.x,
      y: cell.y,
      topSrc: topFrameSrc && topAsset
        ? resolveBoardLabTerrainSrc(topFrameSrc, 'top', { cell, asset: topAsset }, terrainSrcOverride)
        : undefined,
      sideFaces: topAsset ? resolveTerrainSideFaces(
        resolveTerrainSideExposure(cell, (x, y) => occupied.has(`${x}-${y}`)),
        sideMaterials,
      ) : undefined,
      featureSrc: cell.feature ? featureFrameSrc(cell.feature.kind, cell.feature.material, cell.feature.mask) : undefined,
      topAnimFrames: topAsset?.topAnimFrames,
    };
  });
}

// Adapter: a generated socket board -> the shared TileGrid render core.
export function BoardLabBoard<TAsset extends TileSocketAsset>({
  board,
  assetFrameSrc,
  terrainSrcOverride,
  boardZoom = 1,
  boardPan = { x: 0, y: 0 },
  className = '',
  ariaLabel = 'Generated board',
  showGrid = false,
  macroTiles,
  renderCellOverlay,
  fenceOverlays,
  fencePosts,
  wallOverlays,
  wallArt,
  wallBounds,
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
  const terrainCells = boardLabTerrainCanvasCells(sourceCells, assetFrameSrc, terrainSrcOverride);
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
        'data-east-side-id': cell.sideAssets?.east?.id,
        'data-south-side-id': cell.sideAssets?.south?.id,
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
          <BoardBarrierSceneLayer fenceOverlays={fenceOverlays} fencePosts={fencePosts} wallOverlays={wallOverlays} wallArt={wallArt} wallBounds={wallBounds} />
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
