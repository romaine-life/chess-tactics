import type { ReactElement, ReactNode } from 'react';
import { boardLabCellPosition } from './boardProjection';
import { DoodadSprite } from './BoardDoodad';
import { PropSprite } from './BoardStructure';
import { propDef, type PropDef } from '../core/props';
import { GroundCoverLayer } from './GroundCoverLayer';
import { FenceOverlayLayer, WallOverlayLayer } from './FenceOverlayLayer';
import { TileGrid, type TileGridCell } from './TileGrid';
import { BoardTerrainLayer, terrainCanvasPatches, terrainSideSrc, terrainTopSrc, type TerrainCanvasCell } from './BoardTerrainLayer';
import { assetFrameSrc, studioFamilies, type StudioAsset } from '../ui/studioBoard';
import { featureFrameSrc } from '../art/tileset';
import {
  MISSING_DIRECTION_SPRITE,
  hasDirectionSprite,
  unitAssets,
  type Direction,
  type Faction,
  type UnitAsset,
} from '../ui/unitCatalog';
import { doodadAsset, type DoodadAsset } from '../ui/doodadCatalog';
import { resolveFeatureOverlays, resolveFenceOverlays, resolveWallOverlays, type ResolvedFeatureOverlay } from '../core/featureAutotile';
import { groundCoverSet, rollGroundCover, type GroundCover, type GroundCoverDensity } from '../core/groundCover';
import type { TileFamilyId } from '../core/tileSockets';
import type { EditorBoard } from '../ui/boardCode';

// THE shared, non-interactive board renderer — one source of truth for how an EditorBoard
// draws (terrain through a composed canvas layer; units + doodads + props + ground cover bracketed
// in the +20000 band, exactly like the game's SkirmishBoard). Both surfaces consume it:
//   - the Level Editor's StudioEditableBoard layers its paint/erase/select interaction on top
//     of these same cells + sprites (so the editable board and this viewer can never drift), and
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
const resolveUnitAsset = (id: string): UnitAsset | undefined => unitAssets.find((unit) => unit.id === id);
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
    topSrc: frameSrc ? terrainTopSrc(frameSrc, tileAsset?.topAnimFrames) : undefined,
    sideSrc: frameSrc ? terrainSideSrc(frameSrc) : undefined,
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

/**
 * The unit + doodad + prop sprites for the whole board, seated via the shared `.board-unit-seat`,
 * `<DoodadSprite>` and `<PropSprite>` (identical to the game board). Pure (no interaction); the
 * editor adds its own doodad/prop hit targets alongside these — it draws its OWN props (so it can
 * bracket them with hit spans) and simply omits `props` here. `renderDoodadExtra` lets a caller
 * inject a per-cell overlay (the editor's transparent doodad hit) without forking the seating logic.
 */
export function studioBoardSprites({
  units,
  doodads,
  props = {},
  resolveUnit = resolveUnitAsset,
  resolveDoodad = doodadAsset,
  resolveProp = propDef,
  hidden,
  renderDoodadExtra,
}: {
  units: Record<string, { unitId: string; direction: string; faction: string }>;
  doodads: Record<string, { doodadId: string }>;
  /** Multi-cell props keyed by ANCHOR cell "x,y" (optional — the editor renders its own). */
  props?: Record<string, { propId: string }>;
  resolveUnit?: (id: string) => UnitAsset | undefined;
  resolveDoodad?: (id: string) => DoodadAsset | undefined;
  resolveProp?: (id: string) => PropDef | undefined;
  hidden?: BoardLayerVisibility;
  renderDoodadExtra?: (cell: { x: number; y: number; left: number; top: number; zIndex: number }) => ReactNode;
}): ReactNode[] {
  const sprites: ReactNode[] = [];
  // Multi-cell props (trees/houses): the shared tall <PropSprite> (back/front halves), exactly
  // as the game board seats it. Unknown ids skip silently (forward-compat, same as the bridge).
  for (const [key, placement] of Object.entries(props)) {
    const def = resolveProp(placement.propId);
    if (!def || hidden?.doodad) continue;
    const [ax, ay] = key.split(',').map(Number);
    sprites.push(<PropSprite key={`prop-${key}`} prop={{ x: ax, y: ay, propId: placement.propId }} def={def} />);
  }
  for (const key of new Set([...Object.keys(units), ...Object.keys(doodads)])) {
    const [cx, cy] = key.split(',').map(Number);
    const { left, top, zIndex } = boardLabCellPosition({ x: cx, y: cy });
    const doodadEntry = doodads[key] ? resolveDoodad(doodads[key].doodadId) : undefined;
    if (doodadEntry && !hidden?.doodad) {
      sprites.push(<DoodadSprite key={`dd-${key}`} doodad={{ x: cx, y: cy, type: doodadEntry.id }} />);
      const extra = renderDoodadExtra?.({ x: cx, y: cy, left, top, zIndex });
      if (extra) sprites.push(extra);
    }
    const placement = units[key];
    const unitAsset = placement ? resolveUnit(placement.unitId) : undefined;
    if (unitAsset && placement && !hidden?.unit) {
      const direction = placement.direction as Direction;
      const sprite = hasDirectionSprite(unitAsset, direction)
        ? unitAsset.sprite(placement.faction as Faction, direction)
        : MISSING_DIRECTION_SPRITE;
      sprites.push(
        <div key={`u-${key}`} className={`board-unit-seat is-${unitAsset.family}`} style={{ left, top, zIndex: zIndex + 20000 }}>
          <img src={sprite} alt="" draggable={false} />
        </div>,
      );
    }
  }
  return sprites;
}

/** Resolve painted ground-cover densities into the concrete tufts the GroundCoverLayer renders. */
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
  const fenceOverlays = resolveFenceOverlays(board.fences ?? {});
  const wallBounds = { cols: board.cols, rows: board.rows };
  const wallOverlays = resolveWallOverlays(board.walls ?? {}, wallBounds);

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

  const sprites = studioBoardSprites({ units: board.units, doodads: board.doodads, props: board.props });
  const coverCells = studioCoverCells(board.cells, board.cover, coverSeed, board.coverTypes ?? {});

  return (
    <TileGrid
      cells={gridCells}
      className={`tileset-placement-board is-readonly ${className}`.trim()}
      ariaLabel={ariaLabel}
      boardZoom={boardZoom}
      boardPan={boardPan}
      backgroundLayer={<BoardTerrainLayer cells={terrainCells} patches={terrainCanvasPatches(board.surfacePatches)} />}
    >
      <WallOverlayLayer overlays={wallOverlays} wallArt={board.wallArt} bounds={wallBounds} />
      <FenceOverlayLayer overlays={fenceOverlays} />
      <GroundCoverLayer cells={coverCells} />
      {sprites}
    </TileGrid>
  );
}
