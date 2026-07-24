import type { ReactElement } from 'react';
import { BoardSceneLayer } from './BoardSceneLayer';
import { TileGrid, type TileGridCell } from './TileGrid';
import { BoardTerrainLayer, terrainCanvasMacroTiles, terrainTopSrc, type TerrainCanvasCell } from './BoardTerrainLayer';
import { immutableBoardLabTerrainSrc } from './BoardLabBoard';
import { assetFrameSrc, studioFamilies, type StudioAsset } from '../ui/studioBoard';
import { featureFrameSrc } from '../art/tileset';
import { resolveFeatureOverlays, type ResolvedFeatureOverlay } from '../core/featureAutotile';
import { groundCoverSet, rollGroundCover, type GroundCover, type GroundCoverDensity } from '../core/groundCover';
import type { TileFamilyId } from '../core/tileSockets';
import type { EditorBoard } from '../ui/boardCode';
import { resolveMacroTilePlacements } from '../core/macroTiles';
import {
  boardVisualFeatures,
  boardVisualTerrainCells,
  resolveTerrainSideExposure,
  resolveTerrainSideFaces,
  subterrainFaceKey,
  subterrainMaterialSrc,
  type TerrainSideMaterials,
  type TerrainSideExposure,
} from '@chess-tactics/board-render';
import { PredrawnBoardLayer, runtimePredrawnBoardPlate } from './PredrawnBoardLayer';

// THE shared, non-interactive board renderer — one source of truth for how an EditorBoard
// draws (terrain through one composed canvas layer; units, doodads, props, floating artwork,
// fences, walls, wall art, and ground cover through the shared scene-depth canvas). Both surfaces consume it:
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

/**
 * Derive the one canonical image-generation reference from saved board data.
 *
 * The reference keeps authored terrain, roads, doodads, props, floating artwork, fences, and
 * walls, but removes every visual channel that would either hide that geometry or feed a previous
 * accepted scene back into a fresh generation run. Explicitly authored Subterrain remains part of
 * the reference; absence never synthesizes a default skirt.
 */
export function boardForTopSurfaceArtExport(board: EditorBoard): EditorBoard {
  return {
    ...board,
    surface: undefined,
    units: {},
    cover: {},
    coverTypes: {},
  };
}

const resolveTileAsset = (id: string): StudioAsset | undefined =>
  studioFamilies.flatMap((family) => family.assets).find((asset) => asset.id === id);
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
  sideExposure,
  sideMaterials = {},
}: {
  key: string;
  x: number;
  y: number;
  tileAsset: StudioAsset | undefined;
  feature: ResolvedFeatureOverlay | undefined;
  animationFrame: number;
  hidden?: BoardLayerVisibility;
  sideExposure: TerrainSideExposure;
  sideMaterials?: TerrainSideMaterials<string>;
}): TerrainCanvasCell {
  const frameSrc = tileAsset && !hidden?.tile ? assetFrameSrc(tileAsset, animationFrame) : undefined;
  return {
    key,
    x,
    y,
    topSrc: frameSrc ? immutableBoardLabTerrainSrc(terrainTopSrc(frameSrc, tileAsset?.topAnimFrames)) : undefined,
    sideFaces: resolveTerrainSideFaces(
      sideExposure,
      hidden?.tile ? {} : sideMaterials,
    ),
    featureSrc: feature ? featureFrameSrc(feature.kind, feature.material, feature.mask) : undefined,
    topAnimFrames: tileAsset?.topAnimFrames,
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

export interface StudioVisualTerrainPlan {
  gridCells: TileGridCell[];
  playableGridCells: TileGridCell[];
  terrainCells: TerrainCanvasCell[];
}

/**
 * Resolve the same complete visual terrain field used by the shared canvas renderer. Scenic
 * coordinates remain visual-only, while `playableGridCells` preserves the tactical-grid origin
 * for centering and pre-drawn registration.
 */
export function studioVisualTerrainPlan({
  board,
  animationFrame = 0,
  hidden,
  topSurfacesOnly = false,
}: {
  board: EditorBoard;
  animationFrame?: number;
  hidden?: BoardLayerVisibility;
  topSurfacesOnly?: boolean;
}): StudioVisualTerrainPlan {
  const visualCells = boardVisualTerrainCells(board);
  const featureOverlays = deriveFeatureOverlays(
    boardVisualFeatures(board, visualCells),
    board.featureCuts,
    board.featureExits,
  );
  const occupied = new Set(visualCells.filter((cell) => cell.tileId).map((cell) => cell.key));
  const gridCells: TileGridCell[] = [];
  const playableGridCells: TileGridCell[] = [];
  const terrainCells: TerrainCanvasCell[] = [];

  for (const visualCell of visualCells) {
    const { key, x, y, decorative } = visualCell;
    const tileAsset = visualCell.tileId ? resolveTileAsset(visualCell.tileId) : undefined;
    const sideExposure = resolveTerrainSideExposure(
      { x, y },
      (nextX, nextY) => occupied.has(`${nextX},${nextY}`),
    );
    const sideMaterials = Object.fromEntries(['south', 'east'].flatMap((face) => {
      const material = board.subterrain?.[subterrainFaceKey(x, y, face as 'south' | 'east')];
      return material ? [[face, subterrainMaterialSrc(material)]] : [];
    }));
    terrainCells.push(studioTerrainCanvasCell({
      key: decorative ? `decorative:${key}` : key,
      x,
      y,
      tileAsset,
      feature: featureOverlays[key],
      animationFrame,
      hidden,
      sideExposure,
      sideMaterials,
    }));
    const gridCell: TileGridCell = {
      key: decorative ? `decorative:${key}` : key,
      x,
      y,
      className: `tileset-placement-cell${decorative ? ' is-decorative' : ''} ${tileAsset ? '' : 'is-empty'}`.trim(),
    };
    gridCells.push(gridCell);
    if (!decorative) playableGridCells.push(gridCell);
  }

  return {
    gridCells,
    playableGridCells,
    terrainCells: visualCells.some((cell) => cell.decorative)
      ? terrainCells.map((cell) => ({ ...cell, animate: false }))
      : terrainCells,
  };
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
  hidden,
  topSurfacesOnly = false,
  onTerrainFirstFrame,
  onSceneFirstFrame,
  onFrameError,
}: {
  board: EditorBoard;
  animationFrame?: number;
  coverSeed?: number;
  boardZoom?: number;
  boardPan?: { x: number; y: number };
  className?: string;
  ariaLabel?: string;
  hidden?: BoardLayerVisibility;
  /** Generation-reference view: preserve authored art, including explicit Subterrain, without defaults. */
  topSurfacesOnly?: boolean;
  onTerrainFirstFrame?: () => void;
  onSceneFirstFrame?: () => void;
  onFrameError?: (error: unknown) => void;
}): ReactElement {
  const { gridCells, playableGridCells, terrainCells } = studioVisualTerrainPlan({
    board,
    animationFrame,
    hidden,
    topSurfacesOnly,
  });
  const macroTiles = resolveMacroTilePlacements({
    placements: board.macroTiles,
    columns: board.cols,
    rows: board.rows,
    familyAt: (x, y) => familyOfTile(board.cells[`${x},${y}`] ?? ''),
  });
  const predrawnPlate = board.surface ? runtimePredrawnBoardPlate(board.surface) : undefined;
  const sceneBoard = topSurfacesOnly ? boardForTopSurfaceArtExport(board) : board;

  return (
    <TileGrid
      cells={gridCells}
      originCells={playableGridCells}
      className={`tileset-placement-board is-readonly${topSurfacesOnly ? ' is-top-surface-art-export' : ''} ${className}`.trim()}
      ariaLabel={ariaLabel}
      boardZoom={boardZoom}
      boardPan={boardPan}
      backgroundLayer={(
        <>
          {predrawnPlate
            ? <PredrawnBoardLayer plate={predrawnPlate} cells={playableGridCells} />
            : <BoardTerrainLayer
                cells={terrainCells}
                macroTiles={terrainCanvasMacroTiles(macroTiles)}
                onFirstFrame={onTerrainFirstFrame}
                onFrameError={onFrameError}
              />}
          <BoardSceneLayer
            board={sceneBoard}
            hidden={hidden}
            coverSeed={coverSeed}
            ambientCover={false}
            omitTerrain
            onFirstFrame={onSceneFirstFrame}
            onFrameError={onFrameError}
          />
        </>
      )}
    />
  );
}
