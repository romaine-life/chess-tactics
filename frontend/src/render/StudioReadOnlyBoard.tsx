import type { ReactElement } from 'react';
import { BoardSceneLayer } from './BoardSceneLayer';
import { TileGrid, type TileGridCell } from './TileGrid';
import { BoardTerrainLayer, terrainCanvasMacroTiles, terrainSideSrc, terrainTopSrc, type TerrainCanvasCell } from './BoardTerrainLayer';
import { immutableBoardLabTerrainSrc } from './BoardLabBoard';
import { assetFrameSrc, studioFamilies, type StudioAsset } from '../ui/studioBoard';
import { featureFrameSrc } from '../art/tileset';
import { resolveFeatureOverlays, type ResolvedFeatureOverlay } from '../core/featureAutotile';
import { groundCoverSet, rollGroundCover, type GroundCover, type GroundCoverDensity } from '../core/groundCover';
import type { TileFamilyId } from '../core/tileSockets';
import type { EditorBoard } from '../ui/boardCode';
import { resolveMacroTilePlacements } from '../core/macroTiles';

// THE shared, non-interactive board renderer — one source of truth for how an EditorBoard
// draws (terrain through one composed canvas layer; units, doodads, props, fences, walls, wall art,
// and ground cover through the shared scene-depth canvas). Both surfaces consume it:
//   - the Level Editor layers paint/erase/select interaction on top of these same cells, and
//   - the Campaign Editor's selected-level viewer renders it read-only inside a ViewPane.
// It owns NO state and NO animation clock: pass `animationFrame` (default 0 = a static frame).

/** Per-layer visibility — a true value hides that layer's elements. Mirrors the editor. */
export interface BoardLayerVisibility {
  tile: boolean;
  unit: boolean;
  doodad: boolean;
}

// Linear-feature overlays already resolved to their sprite selector (road/river → mask), keyed by
// "x,y". The editor derives these live; the read-only viewer derives them from the painted set.
// Reuses the canonical ResolvedFeatureOverlay shape.
export type FeatureOverlayMap = Record<string, ResolvedFeatureOverlay>;

const allTiles: StudioAsset[] = studioFamilies.flatMap((family) => family.assets);
const resolveTileAsset = (id: string): StudioAsset | undefined => allTiles.find((asset) => asset.id === id);
const familyOfTile = (id: string): TileFamilyId | undefined =>
  studioFamilies.find((family) => family.assets.some((asset) => asset.id === id))?.id;

export function studioTerrainCanvasCell({
  key,
  x,
  y,
  tileAsset,
  feature,
  animationFrame,
  hidden,
  drawSide,
}: {
  key: string;
  x: number;
  y: number;
  tileAsset: StudioAsset | undefined;
  feature: ResolvedFeatureOverlay | undefined;
  animationFrame: number;
  hidden?: BoardLayerVisibility;
  drawSide: boolean;
}): TerrainCanvasCell {
  const frameSrc = tileAsset && !hidden?.tile ? assetFrameSrc(tileAsset, animationFrame) : undefined;
  return {
    key,
    x,
    y,
    topSrc: frameSrc ? immutableBoardLabTerrainSrc(terrainTopSrc(frameSrc, tileAsset?.topAnimFrames)) : undefined,
    sideSrc: frameSrc ? immutableBoardLabTerrainSrc(terrainSideSrc(frameSrc)) : undefined,
    featureSrc: feature ? featureFrameSrc(feature.kind, feature.material, feature.mask) : undefined,
    topAnimFrames: tileAsset?.topAnimFrames,
    drawSide,
  };
}

/**
 * Derive each painted feature cell's connection mask from its SAME-KIND neighbours — the same
 * pass the editor runs live (LevelEditor.featureOverlays), pulled here so the read-only viewer
 * knits ribbons identically without owning editor state.
 */
export function deriveFeatureOverlays(
  features: EditorBoard['features'],
  featureCuts: EditorBoard['featureCuts'],
  featureExits: EditorBoard['featureExits'] = {},
): FeatureOverlayMap {
  const isSevered = (edge: string): boolean => featureCuts[edge] === true;
  const isExit = (edge: string): boolean => featureExits[edge] === true;
  return resolveFeatureOverlays(features, isSevered, isExit);
}

/** Resolve painted ground-cover densities for tests and legacy callers. */
export function studioCoverCells(
  cells: Record<string, string>,
  cover: Record<string, GroundCoverDensity>,
  seed: number,
  coverTypes: Record<string, TileFamilyId> = {},
): Array<{ x: number; y: number; terrain: TileFamilyId; groundCover: GroundCover }> {
  const list: Array<{ x: number; y: number; terrain: TileFamilyId; groundCover: GroundCover }> = [];
  for (const [key, density] of Object.entries(cover)) {
    const [x, y] = key.split(',').map(Number);
    const tileId = cells[key];
    const tileTerrain = tileId ? familyOfTile(tileId) : undefined;
    const terrain = coverTypes[key] ?? tileTerrain;
    if (!terrain || !groundCoverSet(terrain)) continue;
    list.push({ x, y, terrain, groundCover: { density, tufts: rollGroundCover(terrain, x, y, seed, density) } });
  }
  return list;
}

/**
 * A static, read-only board rendered straight from an EditorBoard — tiles, feature ribbons,
 * units, doodads, multi-cell props and ground cover, all through the SAME render core the
 * editor uses. No
 * painting, no selection, no animation clock (the frame is fixed). Wrap it in a ViewPane for
 * pan/zoom (the Campaign Editor's selected-level viewer does exactly that).
 */
export function StudioReadOnlyBoard({
  board,
  animationFrame = 0,
  coverSeed = 1234,
  boardZoom = 1,
  boardPan = { x: 0, y: 0 },
  className = '',
  ariaLabel = 'Level board',
}: {
  board: EditorBoard;
  animationFrame?: number;
  coverSeed?: number;
  boardZoom?: number;
  boardPan?: { x: number; y: number };
  className?: string;
  ariaLabel?: string;
}): ReactElement {
  const featureOverlays = deriveFeatureOverlays(board.features, board.featureCuts, board.featureExits);
  const gridCells: TileGridCell[] = [];
  const terrainCells: TerrainCanvasCell[] = [];
  const occupied = new Set(
    Object.entries(board.cells)
      .filter(([, id]) => !!resolveTileAsset(id))
      .map(([key]) => key),
  );
  for (let y = 0; y < board.rows; y += 1) {
    for (let x = 0; x < board.cols; x += 1) {
      const key = `${x},${y}`;
      const tileAsset = board.cells[key] ? resolveTileAsset(board.cells[key]) : undefined;
      const drawSide = !!tileAsset && (!occupied.has(`${x + 1},${y}`) || !occupied.has(`${x},${y + 1}`));
      terrainCells.push(studioTerrainCanvasCell({ key, x, y, tileAsset, feature: featureOverlays[key], animationFrame, drawSide }));
      gridCells.push({
        key,
        x,
        y,
        className: `tileset-placement-cell ${tileAsset ? '' : 'is-empty'}`.trim(),
      });
    }
  }
  const macroTiles = resolveMacroTilePlacements({
    placements: board.macroTiles,
    columns: board.cols,
    rows: board.rows,
    familyAt: (x, y) => familyOfTile(board.cells[`${x},${y}`] ?? ''),
  });

  return (
    <TileGrid
      cells={gridCells}
      className={`tileset-placement-board is-readonly ${className}`.trim()}
      ariaLabel={ariaLabel}
      boardZoom={boardZoom}
      boardPan={boardPan}
      backgroundLayer={(
        <>
          <BoardTerrainLayer cells={terrainCells} macroTiles={terrainCanvasMacroTiles(macroTiles)} />
          <BoardSceneLayer board={board} coverSeed={coverSeed} ambientCover={false} omitTerrain />
        </>
      )}
    />
  );
}
