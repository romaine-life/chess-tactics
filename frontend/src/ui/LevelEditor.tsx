// The standalone Level Editor (/editor/level; legacy aliases /level-editor, /edit). Split out of TilePreview.tsx so
// it ships its own small lazy chunk instead of dragging the entire design Studio:
// the heavy library studios + manifests live in TilePreview.tsx and are never
// imported here. Shared board core (tile families, the animation clock, the facing
// compass, the per-frame src) comes from ./studioBoard.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent, type Dispatch, type ReactElement, type ReactNode, type SetStateAction } from 'react';
import { boardLabCellPosition } from '../render/BoardLabBoard';
import { TILE_TEMPLATE } from '../art/tileTemplate';
import { PropSprite, propHalfSrc } from '../render/BoardStructure';
import { PROP_DEFS, propCells, propDef, type PropDef, type PropKind } from '../core/props';
import { BoardSceneLayer } from '../render/BoardSceneLayer';
import { TileGrid, type TileGridCell } from '../render/TileGrid';
import { BoardGridLayer } from '../render/BoardGridLayer';
import { BoardTerrainLayer, terrainCanvasMacroTiles, type TerrainCanvasCell } from '../render/BoardTerrainLayer';
import { studioTerrainCanvasCell } from '../render/StudioReadOnlyBoard';
import { KitScroll } from './KitScroll';
import { ViewPane } from './shared/ViewPane';
import { NavButton } from './shared/NavButton';
import { useConfirm } from './shared/ConfirmDialog';
import { TitleBarSlot } from './shell/TitleBarSlot';
import { TitleBarActions, TitleBarButton } from './shell/TitleBarControls';
import { Stepper } from './shared/Stepper';
import { Toggle } from './shared/Toggle';
import { PaletteSelect } from './shared/PaletteSelect';
import { BoardSizePanel } from './shared/BoardSizePanel';
import {
  levelEditorHrefWithRouteState,
  isLevelEditorRoutePath,
  levelEditorRouteBrushKind,
  readLevelEditorRouteState,
  type LevelEditorBrushKind,
  type LevelEditorLayerKey,
} from './levelEditorRoute';
import { APP_NAVIGATION_EVENT, navigateApp, registerAppNavigationBlocker } from './navigation';
import { levelEditorWallFaceGeometry } from './levelEditorWallFace';
import { levelEditorExitAction } from './levelEditorExit';
import { currentDoodadAssets, doodadAsset, DOODAD_ASSETS, type DoodadAsset } from './doodadCatalog';
import { GROUND_COVER_ASSETS, GroundCoverPreview, groundCoverAsset, type GroundCoverId } from './groundCoverCatalog';
import { WallArtPreview } from './WallArtLab';
import { readBoardParam, encodeBoard, zoneCellMapFromEntries, zoneEntriesFromCellMap, type BoardFactionDirections, type BoardGeneratedRegion, type BoardGeneratedRegionSection, type EditorBoard, type EditorZoneEntry, type FeatureCell } from './boardCode';
import { removeZoneEntriesReferencedOnlyByRemovedEvents } from './eventZoneCleanup';
import {
  currentBoardTestHref,
  readLevelEventsParam,
  readTimeControlParams,
  readVictoryRulesParam,
} from './playtestRoute';
import { clearLevelEditorDraft, levelEditorDraftKey, readLevelEditorDraft, writeLevelEditorDraft, type LevelEditorDraft } from './levelEditorDraft';
import { levelEditorLevelSignature, normalizedLevelEditorSignature } from './levelEditorSignature';
import {
  editorDocumentWorkspaceForLevelId,
  levelEditorHrefForDocument,
  shouldRestoreLocalEditorRecovery,
} from './levelEditorPersistence';
import { ArtRouteChrome } from './shell/ArtRouteChrome';
import { HomepageBackdrop } from './HomepageBackdrop';
import {
  directionCompassCells,
  hasDirectionSprite,
  productionUnitAssets,
  rookDirectionLabel,
  rookDirections,
  unitAssets,
  unitAssetById,
  type Direction,
  type Faction,
  type UnitAsset,
} from './unitCatalog';
import {
  studioFamilies,
  useAnimationClock,
  FacingCompass,
  type StudioAsset,
  type StudioFamily,
} from './studioBoard';
import { featureThumbSrc, fenceThumbSrc, tileTopSrc, wallThumbSrc } from '../art/tileset';
import { resolveFeatureOverlays, roadEdgeKey, isNorthWestBoundaryWallEdge, FEATURE_DIRS, ROAD_MATERIALS, RIVER_MATERIALS, FENCE_MATERIALS, WALL_MATERIALS, DEFAULT_FENCE_MATERIAL, DEFAULT_WALL_MATERIAL, defaultFeatureMaterial, FEATURE_MATERIAL_LABELS, FENCE_MATERIAL_LABELS, WALL_MATERIAL_LABELS, type FeatureKind, type FeatureMaterial, type FeatureEdge, type FenceMaterial, type WallMaterial } from '../core/featureAutotile';
import { wallArt, wallArtAtEdge, wallArtBadge, wallArtIdOrDefault, wallArtItems, wallArtLabel, wallArtPlacementSpanAtEdge, wallArtSpanEdges, wallArtSpanForId, type WallArtId } from '../core/wallArt';
import { type TileFamilyId } from '../core/tileSockets';
import { generateSocketBoard, solveSocketBoard } from '../core/tileBoardGenerator';
import { scatterTerrainDetailed } from '../core/terrainScatter';
import { createRng } from '../core/rng';
import {
  DEFAULT_MACRO_TILE_BREAKUP,
  DEFAULT_MACRO_TILE_DENSITY,
  breakMacroTilesAtCell,
  generateMacroTiles,
  macroTileAsset,
  macroTileAssets,
  macroTileCellIndices,
  macroTileFrame,
  resolveMacroTilePlacements,
  type MacroTileAsset,
  type MacroTilePlacement,
} from '../core/macroTiles';
import { SliderRow } from './dressing/SliderRow';
import { objectBaseZIndex, structureFrontZIndex } from '../render/sceneDepth';
import { groundCoverSet, type GroundCoverDensity } from '../core/groundCover';
import { UNIT_PALETTE_LABELS, UNIT_PALETTES, isUnitPalette, type UnitPalette } from '../core/pieces';
import { useCampaigns } from '../campaign/store';
import { ensureCampaignsHydrated } from '../campaign/hydrate';
import { editorBoardToLevel, levelToEditorBoard } from '../core/levelBoard';
import { createFromLevel } from '../game/setup';
import { attackedSquares, blockedCandidateSquares, enemyThreats, gameEnv, legalMoves, type MoveEnv } from '../core/rules';
import type { GameState, Move, Piece, Vec } from '../core/types';
import { OBJECTIVE_LABEL } from '../core/objectives';
import { VictoryConditionsEditor, appendRules, rulesEqual, type FactionOption } from './VictoryConditionsEditor';
import { tierOf, mapSaveError } from '../campaign/save';
import { fetchMeStatus, goSignIn, signInHref, type AuthUser } from '../net/auth';
import {
  autosaveEditorDocument,
  autosaveEditorDocumentOnPageHide,
  createEditorDocument,
  discardEditorDocumentChanges,
  isEditorDocumentBaselineConflict,
  isEditorDocumentConflict,
  loadEditorDocument,
  resolveEditorDocument,
  saveEditorDocument,
  type EditorDocument,
} from '../net/editorDocuments';
import { consumeNewBuildReloadIntent } from '../net/appUpdate';
import { OBJECTIVE_TYPES, ZONE_COLORS, type CastleEventAction, type ChessDrawsEventAction, type Level, type LevelEvent, type LevelEventAction, type LevelEvents, type ObjectiveType, type SpawnEventAction, type VictoryRules, type ZoneColor, type ZoneType } from '../core/level';
import { computeCastleTemplatePairs, type CastleTemplateUnit } from './castlingTemplate';
import { MODE_NAME, DEFAULT_SURVIVE_TURNS, victoryRulesForObjective, kingSideOf } from '../core/objectives';
import { CLOCK_INCREMENT_SECONDS, CLOCK_INITIAL_SECONDS, DEFAULT_TIME_CONTROL, formatClockSeconds, parseClockSeconds, stepLadder } from '../core/clock';
import { validatePlayability } from '../core/playability';
import { PLAYABLE_PIECE_TYPES, PIECE_LABEL, type PlayablePieceType } from '../core/pieces';
import { effectiveLevelEvents, normalizeLevelEvents } from '../core/levelEvents';
import { guardRulesSeed, levelRulesSeed, seededBaselineLevel, type AuthoredRulesField, type LevelRulesSeed } from './levelEditorRulesSeed';

type BoardUnitPlacement = {
  unitId: string;
  direction: Direction;
  faction: Faction;
};

type MoveSubject =
  | { kind: 'unit'; x: number; y: number }
  | { kind: 'prop'; x: number; y: number; propId: string };

type BoardViewOverlayFlags = {
  showMoves: boolean;
  showEnemyAttacks: boolean;
  showBlocked: boolean;
  showPromotionZones: boolean;
};

type BoardTacticalPreview = {
  moveSet: Set<string>;
  threatSet: Set<string>;
  blockedSet: Set<string>;
  promotionZoneSet: Set<string>;
  focusKey: string | null;
};

const emptyTacticalPreview = (): BoardTacticalPreview => ({
  moveSet: new Set(),
  threatSet: new Set(),
  blockedSet: new Set(),
  promotionZoneSet: new Set(),
  focusKey: null,
});

const vecKey = (vec: Vec): string => `${vec.x},${vec.y}`;
const vecSet = (tiles: readonly Vec[]): Set<string> => new Set(tiles.map(vecKey));

function tacticalPreviewForGame(
  game: GameState | null,
  env: MoveEnv | null,
  focusPiece: Piece | null,
  flags: BoardViewOverlayFlags,
): BoardTacticalPreview {
  if (!game || !env) return emptyTacticalPreview();
  const focusMoves: Move[] = focusPiece ? legalMoves(focusPiece, game.pieces, game.size, env) : [];
  const moveSet = flags.showMoves ? vecSet(focusMoves) : new Set<string>();
  const threatSet = flags.showEnemyAttacks
    ? vecSet(focusPiece?.side === 'enemy' ? attackedSquares(focusPiece, game.pieces, game.size, env) : enemyThreats(game.pieces, game.size, env))
    : new Set<string>();
  const legal = new Set(focusMoves.map(vecKey));
  const blockedSet = flags.showBlocked && focusPiece
    ? vecSet(blockedCandidateSquares(focusPiece, game.pieces, game.size, env).filter((tile) => !legal.has(vecKey(tile))))
    : new Set<string>();
  return {
    moveSet,
    threatSet,
    blockedSet,
    promotionZoneSet: flags.showPromotionZones ? vecSet(game.promotionZones ?? []) : new Set<string>(),
    focusKey: focusPiece ? `${focusPiece.x},${focusPiece.y}` : null,
  };
}

// Unified editable board: every Studio view renders through this. It's a full
// clickable grid seeded from whatever was loaded (a tile, a transition, a
// generated board). The `tool` decides what a click does — select (highlight),
// brush (stamp), or erase. Purely in-memory, so it resets when a new view loads.
function StudioEditableBoard({
  cols,
  rows,
  cells: placed,
  units: placedUnits,
  doodads: placedDoodads,
  props: placedProps = {},
  macroTiles: placedMacroTiles = [],
  features: placedFeatures = {},
  fences: placedFences = {},
  walls: placedWalls = {},
  wallArt: placedWallArt = {},
  wallArtBrushId,
  cover: placedCover = {},
  coverTypes: placedCoverTypes = {},
  coverSeed = 1234,
  fenceTool = false,
  wallTool = false,
  wallArtTool = false,
  onPaintEdge,
  onEraseEdge,
  onPaintWallEdge,
  onEraseWallEdge,
  onPaintWallArtEdge,
  onEraseWallArtEdge,
  zones: placedZones = {},
  resolveAsset,
  resolveUnit,
  resolveDoodad,
  resolveProp,
  tool,
  selectedCell,
  boardZoom,
  boardPan,
  showGrid = false,
  tacticalPreview,
  animationFrame,
  onPaint,
  onErase,
  onSelect,
  onMove,
  canMoveTo,
  propBrush,
  macroTileBrush,
  hidden,
  regionCells,
  onRegionStart,
}: {
  cols: number;
  rows: number;
  cells: Record<string, string>;
  units: Record<string, BoardUnitPlacement>;
  doodads: Record<string, { doodadId: string }>;
  /** Multi-cell props keyed by ANCHOR cell "x,y" -> {propId}. */
  props?: Record<string, { propId: string }>;
  /** Opaque multi-cell terrain tops that replace the covered 1x1 top sprites. */
  macroTiles?: readonly MacroTilePlacement[];
  /** Linear-feature overlays (roads + rivers) keyed by "x,y" -> {kind, material, mask}. */
  features?: Record<string, { kind: FeatureKind; material: FeatureMaterial; mask: number }>;
  /** Edge fences keyed by shared-edge key (roadEdgeKey) -> fence material — drawn as edge rails. */
  fences?: Record<string, FenceMaterial>;
  /** Edge walls keyed by shared-edge key (roadEdgeKey) -> material; valid only on the north/west map perimeter. */
  walls?: Record<string, WallMaterial>;
  /** Wall art keyed by anchor edge; spans across N north/west perimeter wall edges. */
  wallArt?: Record<string, WallArtId>;
  /** Active wall-art stamp, used to show whether each visible supporting wall can accept it. */
  wallArtBrushId?: WallArtId;
  /** Painted ground-cover densities keyed by cell. */
  cover?: Record<string, GroundCoverDensity>;
  /** Optional per-cell ground-cover family overrides. */
  coverTypes?: Record<string, TileFamilyId>;
  /** Scatter seed for live ground-cover placement. */
  coverSeed?: number;
  /** When true, the brush paints EDGES (fences) not cells: hover picks the nearest diamond edge. */
  fenceTool?: boolean;
  /** When true, the brush paints EDGES (walls) not cells: hover picks the nearest diamond edge. */
  wallTool?: boolean;
  /** When true, the brush paints EDGES (wall art) not cells: hover picks the nearest diamond edge. */
  wallArtTool?: boolean;
  /** Add a fence on an edge; boundary edges use one off-board endpoint. */
  onPaintEdge?: (edgeKey: string) => void;
  /** Remove a fence from an edge. */
  onEraseEdge?: (edgeKey: string) => void;
  /** Add a wall on an edge; only the northmost and westmost map edges render. */
  onPaintWallEdge?: (edgeKey: string) => void;
  /** Remove a wall from an edge. */
  onEraseWallEdge?: (edgeKey: string) => void;
  /** Add wall art on an anchor edge. */
  onPaintWallArtEdge?: (edgeKey: string) => void;
  /** Remove wall art whose span covers an edge. */
  onEraseWallArtEdge?: (edgeKey: string) => void;
  /** Cosmetic zone colors keyed by cell "x,y" — drawn as a tinted diamond. */
  zones?: Record<string, ZoneColor>;
  resolveAsset: (id: string) => StudioAsset | undefined;
  resolveUnit: (id: string) => UnitAsset | undefined;
  resolveDoodad: (id: string) => DoodadAsset | undefined;
  resolveProp: (id: string) => PropDef | undefined;
  tool: 'select' | 'brush' | 'erase' | 'move' | 'region';
  selectedCell: { x: number; y: number } | null;
  boardZoom: number;
  boardPan: { x: number; y: number };
  showGrid?: boolean;
  tacticalPreview?: BoardTacticalPreview;
  animationFrame: number;
  onPaint: (x: number, y: number) => void;
  onErase: (x: number, y: number) => void;
  onSelect: (x: number, y: number) => void;
  /** Move tool: drag a placed unit or prop to another cell (drop cancelled if omitted). */
  onMove?: (subject: MoveSubject, to: { x: number; y: number }) => void;
  /** Move tool: whether a held object may drop on (x,y) — drives the destination ring's colour. */
  canMoveTo?: (subject: MoveSubject, to: { x: number; y: number }) => boolean;
  /** When the prop brush is armed: its def + a placeability test, used for the footprint hover. */
  propBrush?: { def: PropDef; canPlaceAt: (ax: number, ay: number) => boolean } | null;
  /** When a composite terrain brush is armed, preview its full footprint at the hovered anchor. */
  macroTileBrush?: MacroTileAsset | null;
  /** Per-layer visibility — a true value hides that layer's elements on the board. */
  hidden?: { tile: boolean; unit: boolean; doodad: boolean };
  /** Cells currently selected ("x,y" keys) — drawn as a tinted diamond overlay. */
  regionCells?: Set<string>;
  /** Region tool: click a tile to select its whole connected same-terrain patch. */
  onRegionStart?: (x: number, y: number) => void;
}): ReactElement {
  const paintingRef = useRef(false);
  const [hoverCell, setHoverCell] = useState<{ x: number; y: number } | null>(null);
  // The unit/prop picked up under the Move tool, held while the pointer drags to a destination.
  // It's state (not a ref) so source/target highlights re-render as you drag.
  const [movingFrom, setMovingFrom] = useState<MoveSubject | null>(null);
  // Edge-fence painting: which diamond side is under the cursor (the rail will drop there).
  const [hoverEdge, setHoverEdge] = useState<{ x: number; y: number; edge: FeatureEdge } | null>(null);
  const edgeTool = fenceTool || wallTool || wallArtTool;
  const wallBounds = { cols, rows };
  const applyTool = (x: number, y: number) => {
    if (tool === 'brush') onPaint(x, y);
    else if (tool === 'erase') onErase(x, y);
    else if (tool === 'region') onRegionStart?.(x, y);
    else if (tool === 'move') { /* handled via drag in the pointer handlers below */ }
    else onSelect(x, y);
  };
  // The neighbour + canonical edge key for one of a cell's 4 diamond sides. Boundary fences use the
  // off-board neighbour as a harmless visual endpoint; gameplay only blocks in-board crossings.
  const edgeTarget = (x: number, y: number, edge: FeatureEdge) => {
    const dir = FEATURE_DIRS.find((d) => d.edge === edge)!;
    const nx = x + dir.dx;
    const ny = y + dir.dy;
    return { nx, ny, key: roadEdgeKey(x, y, nx, ny), neighborOnBoard: nx >= 0 && nx < cols && ny >= 0 && ny < rows };
  };
  // Nearest diamond edge to the pointer: `.tileset-cell-hit` IS the diamond (centred), so the sign
  // of the offset from its centre picks the quadrant → the adjoining edge (N=NE, E=SE, S=SW, W=NW).
  const edgeAtPointer = (e: { currentTarget: Element; clientX: number; clientY: number }): FeatureEdge => {
    const rect = e.currentTarget.getBoundingClientRect();
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    return dy < 0 ? (dx >= 0 ? 'N' : 'W') : (dx >= 0 ? 'E' : 'S');
  };
  // Toggle an edge barrier on the diamond edge under the cursor (brush adds, erase/right-click removes).
  const applyBarrierAt = (x: number, y: number, edge: FeatureEdge, erasing: boolean): void => {
    const { key } = edgeTarget(x, y, edge);
    if (wallTool) {
      if (erasing) onEraseWallEdge?.(key);
      else onPaintWallEdge?.(key);
      return;
    }
    if (wallArtTool) {
      if (erasing) onEraseWallArtEdge?.(key);
      else onPaintWallArtEdge?.(key);
      return;
    }
    if (erasing) onEraseEdge?.(key);
    else onPaintEdge?.(key);
  };
  // The two diamond-side endpoints (in a 0..100 viewBox over the hit diamond) for the edge hint.
  const EDGE_LINE: Record<FeatureEdge, [number, number, number, number]> = {
    N: [50, 0, 100, 50],
    E: [100, 50, 50, 100],
    S: [50, 100, 0, 50],
    W: [0, 50, 50, 0],
  };
  const propAtCell = (x: number, y: number): MoveSubject | null => {
    const entries = Object.entries(placedProps);
    for (let i = entries.length - 1; i >= 0; i -= 1) {
      const [anchorKey, placement] = entries[i];
      const def = resolveProp(placement.propId);
      if (!def) continue;
      const [ax, ay] = anchorKey.split(',').map(Number);
      if (propCells(ax, ay, def).some((cell) => cell.x === x && cell.y === y)) {
        return { kind: 'prop', x: ax, y: ay, propId: placement.propId };
      }
    }
    return null;
  };
  const movingFootprintCells = (subject: MoveSubject | null): Set<string> => {
    if (!subject) return new Set();
    if (subject.kind === 'unit') return new Set([`${subject.x},${subject.y}`]);
    const def = resolveProp(subject.propId);
    if (!def) return new Set([`${subject.x},${subject.y}`]);
    return new Set(propCells(subject.x, subject.y, def).map((cell) => `${cell.x},${cell.y}`));
  };

  const hoverBarrierEdge = (x: number, y: number, edge: FeatureEdge): void => {
    const { key } = edgeTarget(x, y, edge);
    if ((wallTool || wallArtTool) && !isNorthWestBoundaryWallEdge(key, { cols, rows })) {
      setHoverEdge(null);
      return;
    }
    setHoverEdge({ x, y, edge });
  };

  const finishMoveAt = (to: { x: number; y: number } | null): void => {
    if (movingFrom) {
      if (to && !(to.x === movingFrom.x && to.y === movingFrom.y)) onMove?.(movingFrom, to);
      setMovingFrom(null);
    }
    paintingRef.current = false;
  };
  // End a pointer interaction: drop a held object at the cell under the cursor (a no-op if it's the
  // same anchor/cell or off-board), then clear the paint/move latches. Fired on pointer-up over the board.
  const endInteraction = () => finishMoveAt(hoverCell);

  // The editor is an adapter over the shared StudioReadOnlyBoard render path: it supplies
  // terrain to the composed canvas layer, then layers its own interaction chrome — the selection
  // ring and the paint/erase/select hit target — on top per cell.
  const cells: TileGridCell[] = [];
  const terrainCells: TerrainCanvasCell[] = [];
  const occupiedTiles = new Set(
    Object.entries(placed)
      .filter(([, id]) => !!resolveAsset(id))
      .map(([key]) => key),
  );
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const key = `${x},${y}`;
      const assetId = placed[key];
      const asset = assetId ? resolveAsset(assetId) : undefined;
      const drawSide = !!asset && (!occupiedTiles.has(`${x + 1},${y}`) || !occupiedTiles.has(`${x},${y + 1}`));
      terrainCells.push(studioTerrainCanvasCell({
        key,
        x,
        y,
        tileAsset: asset,
        feature: placedFeatures[key],
        animationFrame,
        hidden,
        drawSide,
      }));
      const isSelected = selectedCell?.x === x && selectedCell?.y === y;
      // Move-tool feedback reuses the built-in diamond tile-ring (not an axis-aligned box): the
      // picked-up object's footprint, plus the cell under the cursor tinted by whether a drop is legal.
      const movingCells = movingFootprintCells(movingFrom);
      const isMoveFrom = tool === 'move' && movingCells.has(key);
      const isMoveTo = tool === 'move' && !!movingFrom && !isMoveFrom && hoverCell?.x === x && hoverCell?.y === y;
      const moveDroppable = isMoveTo && movingFrom ? (canMoveTo ? canMoveTo(movingFrom, { x, y }) : true) : false;
      const fenceHere = edgeTool && hoverEdge?.x === x && hoverEdge?.y === y ? hoverEdge.edge : null;
      const tacticalState = tacticalPreview ? [
        tacticalPreview.promotionZoneSet.has(key) ? 'is-promotion-zone' : '',
        tacticalPreview.moveSet.has(key) ? 'is-move' : '',
        tacticalPreview.threatSet.has(key) ? 'is-threat' : '',
        tacticalPreview.blockedSet.has(key) ? 'is-blocked-candidate' : '',
        tacticalPreview.focusKey === key ? 'is-focused-piece' : '',
      ].filter(Boolean).join(' ') : '';
      cells.push({
        key,
        x,
        y,
        className: `tileset-placement-cell ${asset ? '' : 'is-empty'} ${isSelected ? 'is-selected' : ''}`.trim(),
        children: (
          <>
            {/* Zone tint: a translucent diamond seated on the tile EQUATOR — it reuses the exact
                seating of the selection ring (top: --iso-tile-surface-top + the diamond clip-path),
                which is the fix for the recurring "overlay sits at iso-tile-height/2, not y69" bug. */}
            {placedZones[key] ? <span className={`le-zone-cell le-zone-${placedZones[key]}`} aria-hidden="true" /> : null}
            {/* Selected-patch highlight — a tinted diamond seated exactly like the zone tint, so
                the author sees which cells a Generate will fill. */}
            {regionCells?.has(key) ? <span className="le-region-cell" aria-hidden="true" /> : null}
            {/* Fence edge hint: highlight the diamond side under the cursor so you see where the rail
                lands before clicking. The SVG is seated exactly like the hit diamond (surface-top). */}
            {fenceHere ? (
              <svg className="le-fence-edge-hint" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                <line x1={EDGE_LINE[fenceHere][0]} y1={EDGE_LINE[fenceHere][1]} x2={EDGE_LINE[fenceHere][2]} y2={EDGE_LINE[fenceHere][3]} />
              </svg>
            ) : null}
            {tacticalState ? <span className={`le-tactical-cell ${tacticalState}`} aria-hidden="true" /> : null}
            {isSelected ? <span className="tileset-cell-ring" aria-hidden="true" /> : null}
            {isMoveFrom ? <span className="tileset-cell-ring is-move-from" aria-hidden="true" /> : null}
            {isMoveTo ? <span className={`tileset-cell-ring ${moveDroppable ? 'is-move-ok' : 'is-move-blocked'}`} aria-hidden="true" /> : null}
            <span
              className="tileset-cell-hit"
              onPointerDown={(event) => {
                if (event.button === 2) return; // right-click erases via onContextMenu
                event.stopPropagation(); // don't let the ViewPane start a pan while editing
                if (edgeTool && (tool === 'brush' || tool === 'erase')) {
                  // Barrier tools paint EDGES: toggle the diamond side under the cursor.
                  applyBarrierAt(x, y, edgeAtPointer(event), tool === 'erase');
                  return;
                }
                if (tool === 'move') {
                  // Pick up a unit or prop to drag — empty cells aren't grabbable.
                  if (placedUnits[`${x},${y}`]) setMovingFrom({ kind: 'unit', x, y });
                  else {
                    const prop = propAtCell(x, y);
                    if (prop) setMovingFrom(prop);
                  }
                  setHoverCell({ x, y });
                  return;
                }
                if (tool === 'region') {
                  // Select region: a click grabs the whole connected same-terrain patch (no drag).
                  onRegionStart?.(x, y);
                  return;
                }
                if (tool !== 'select') paintingRef.current = true;
                applyTool(x, y);
              }}
              onPointerEnter={() => { setHoverCell({ x, y }); if (!edgeTool && paintingRef.current) applyTool(x, y); }}
              onPointerMove={edgeTool ? (event) => hoverBarrierEdge(x, y, edgeAtPointer(event)) : undefined}
              onPointerUp={(event) => {
                if (tool === 'move' && movingFrom) {
                  event.stopPropagation();
                  finishMoveAt({ x, y });
                }
              }}
              onContextMenu={(event) => { event.preventDefault(); if (edgeTool) applyBarrierAt(x, y, edgeAtPointer(event), true); else onErase(x, y); }}
            />
          </>
        ),
      });
    }
  }

  // Board art now renders through BoardSceneLayer. These remaining DOM nodes are editor-only
  // hit targets for tall bodies whose visible pixels extend beyond their owning tile.
  const overlaySprites: ReactNode[] = [];

  // Walls rise well above the tile-surface diamonds that normally own editor input. Give each
  // visible perimeter face its own exact isometric target so clicking the thing on screen paints
  // or erases that wall edge. The polygons follow the canonical full-height generated wall
  // relative to the owning cell seat (160px rise, 48x27 tangent).
  if ((wallTool || wallArtTool) && (tool === 'brush' || tool === 'erase')) {
    const addWallFaceTarget = (x: number, y: number, face: 'west' | 'north'): void => {
      const edge = face === 'west'
        ? roadEdgeKey(0, y, -1, y)
        : roadEdgeKey(x, 0, x, -1);
      if (!placedWalls[edge]) return;
      const placement = wallArtAtEdge(edge, placedWallArt, wallBounds);
      const candidate = wallArtTool
        ? wallArtPlacementSpanAtEdge(edge, wallArtBrushId, wallBounds, (spanEdge) => Boolean(placedWalls[spanEdge]))
        : null;
      const ready = wallTool || (tool === 'erase' ? Boolean(placement) : Boolean(candidate));
      const artLabel = wallArtLabel(wallArtBrushId);
      const label = wallTool
        ? `${tool === 'erase' ? 'Remove' : 'Paint'} wall on ${face} boundary edge`
        : tool === 'erase'
        ? placement
          ? `Remove ${wallArtLabel(placement.artId)} from ${face} wall`
          : `No wall art to remove from ${face} wall`
        : ready
        ? `Place ${artLabel} from this ${face} wall`
        : `${artLabel} needs ${wallArtSpanForId(wallArtBrushId)} consecutive supporting walls here`;
      const seat = boardLabCellPosition({ x, y });
      const geometry = levelEditorWallFaceGeometry(face, seat);
      const apply = (erasing: boolean): void => {
        if (wallTool) {
          if (erasing) onEraseWallEdge?.(edge);
          else onPaintWallEdge?.(edge);
        } else if (erasing) {
          onEraseWallArtEdge?.(edge);
        } else {
          // Invoke the placement handler even while blocked: it owns the human-readable reason
          // instead of leaving another silent no-op in the editor.
          onPaintWallArtEdge?.(edge);
        }
      };
      overlaySprites.push(
        <svg
          key={`wall-face-hit-${face}-${x},${y}`}
          className={`le-wall-face-hit is-${ready ? 'ready' : 'blocked'}`}
          viewBox={geometry.viewBox}
          aria-label={label}
          role="button"
          tabIndex={0}
          style={{ left: geometry.left, top: geometry.top, width: geometry.width, height: geometry.height, zIndex: 30000 + x + y }}
          onPointerDown={(event) => {
            if (event.button === 2) return;
            event.preventDefault();
            event.stopPropagation();
            apply(tool === 'erase');
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            apply(tool === 'erase');
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
            apply(true);
          }}
        >
          <title>{label}</title>
          <polygon points={geometry.points} />
        </svg>,
      );
    };

    for (let y = 0; y < rows; y += 1) addWallFaceTarget(0, y, 'west');
    for (let x = 0; x < cols; x += 1) addWallFaceTarget(x, 0, 'north');
  }

  if (!hidden?.doodad) {
    for (const key of Object.keys(placedDoodads)) {
      const [cx, cy] = key.split(',').map(Number);
      const { left, top } = boardLabCellPosition({ x: cx, y: cy });
      overlaySprites.push(
        <span
          key={`dd-hit-${cx},${cy}`}
          className="tileset-doodad-hit"
          style={{ position: 'absolute', left, top, zIndex: objectBaseZIndex({ x: cx, y: cy }) + 2, width: 54, height: 88, transform: 'translate(-50%, -75%)', pointerEvents: tool === 'brush' || tool === 'move' || movingFrom ? 'none' : 'auto' }}
          onPointerDown={(event) => {
            if (event.button === 2) return;
            event.stopPropagation();
            if (tool !== 'select') paintingRef.current = true;
            applyTool(cx, cy);
          }}
          onContextMenu={(event) => { event.preventDefault(); onErase(cx, cy); }}
        />,
      );
    }
  }

  // Multi-cell props use a Studio-only hit target spanning the footprint's screen bbox so a click
  // on the prop body routes select/erase to the OWNING ANCHOR.
  for (const [key, placement] of Object.entries(placedProps)) {
    if (hidden?.doodad) continue;
    const def = resolveProp(placement.propId);
    if (!def) continue; // unknown prop id — skip (matches the renderer/collision skip)
    const [ax, ay] = key.split(',').map(Number);
    // Footprint screen bbox: project all footprint cell centres, take their extent, pad to the
    // diamond half-width/height. zIndex above the front-most cell's sprite so clicks land on it.
    const cells = propCells(ax, ay, def);
    const pts = cells.map((c) => boardLabCellPosition(c));
    const minLeft = Math.min(...pts.map((p) => p.left));
    const maxLeft = Math.max(...pts.map((p) => p.left));
    const minTop = Math.min(...pts.map((p) => p.top));
    const maxTop = Math.max(...pts.map((p) => p.top));
    const frontZ = structureFrontZIndex({ x: ax + def.w - 1, y: ay + def.h - 1 });
    overlaySprites.push(
      <span
        key={`prop-hit-${key}`}
        className="tileset-doodad-hit"
        style={{
          position: 'absolute',
          left: minLeft,
          top: minTop,
          zIndex: frontZ + 2,
          width: (maxLeft - minLeft) + 96,
          height: (maxTop - minTop) + 96,
          transform: 'translate(-50%, -75%)',
          pointerEvents: tool === 'brush' || movingFrom ? 'none' : 'auto',
        }}
        onPointerDown={(event) => {
          if (event.button === 2) return;
          event.stopPropagation();
          if (tool === 'move') {
            setMovingFrom({ kind: 'prop', x: ax, y: ay, propId: placement.propId });
            setHoverCell({ x: ax, y: ay });
            return;
          }
          if (tool !== 'select') paintingRef.current = true;
          applyTool(ax, ay);
        }}
        onContextMenu={(event) => { event.preventDefault(); onErase(ax, ay); }}
      />,
    );
  }

  // Footprint hover preview for the prop brush: outline every cell the prop would occupy under the
  // cursor (placeable vs blocked), and ghost the PropSprite at the anchor so the author sees both
  // where it lands and what it looks like before committing.
  if (propBrush && tool === 'brush' && hoverCell) {
    const { def } = propBrush;
    const placeable = propBrush.canPlaceAt(hoverCell.x, hoverCell.y);
    for (const c of propCells(hoverCell.x, hoverCell.y, def)) {
      if (c.x < 0 || c.x >= cols || c.y < 0 || c.y >= rows) continue;
      const { left, top, zIndex } = boardLabCellPosition(c);
      overlaySprites.push(
        <span
          key={`prop-ghostcell-${c.x},${c.y}`}
          className={`le-prop-ghost-cell ${placeable ? 'is-ok' : 'is-blocked'}`}
          aria-hidden="true"
          style={{
            position: 'absolute',
            left,
            top,
            zIndex: zIndex + 19000,
            // Match the tile's top-face diamond (stepX/stepY*2), centred on the projected
            // equator point — same shape/seating as the prop-lab guide and the zone/selection
            // overlays. A rectangle here (the old 96×55 box + outline) reads as "off the grid".
            width: TILE_TEMPLATE.stepX * 2,
            height: TILE_TEMPLATE.stepY * 2,
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
            clipPath: 'polygon(50% 0, 100% 50%, 50% 100%, 0 50%)',
            // Border via inset box-shadow, not `outline`: clip-path doesn't clip an outline,
            // so an outline would still paint the old axis-aligned square around the diamond.
            boxShadow: `inset 0 0 0 2px ${placeable ? 'rgba(80,220,140,.95)' : 'rgba(240,90,90,.95)'}`,
            background: placeable ? 'rgba(80,220,140,.18)' : 'rgba(240,90,90,.18)',
          }}
        />,
      );
    }
    overlaySprites.push(
      <span key="prop-ghost-sprite" aria-hidden="true" style={{ opacity: placeable ? 0.65 : 0.3, position: 'absolute', left: 0, top: 0 }}>
        <PropSprite prop={{ x: hoverCell.x, y: hoverCell.y, propId: def.id }} def={def} />
      </span>,
    );
  }

  if (macroTileBrush && tool === 'brush' && hoverCell) {
    const placeable = hoverCell.x + macroTileBrush.columns <= cols && hoverCell.y + macroTileBrush.rows <= rows;
    for (let dy = 0; dy < macroTileBrush.rows; dy += 1) {
      for (let dx = 0; dx < macroTileBrush.columns; dx += 1) {
        const x = hoverCell.x + dx;
        const y = hoverCell.y + dy;
        if (x >= cols || y >= rows) continue;
        const { left, top, zIndex } = boardLabCellPosition({ x, y });
        overlaySprites.push(
          <span
            key={`macro-ghostcell-${x},${y}`}
            className={`le-prop-ghost-cell ${placeable ? 'is-ok' : 'is-blocked'}`}
            aria-hidden="true"
            style={{
              position: 'absolute',
              left,
              top,
              zIndex: zIndex + 19000,
              width: TILE_TEMPLATE.stepX * 2,
              height: TILE_TEMPLATE.stepY * 2,
              transform: 'translate(-50%, -50%)',
              pointerEvents: 'none',
              clipPath: 'polygon(50% 0, 100% 50%, 50% 100%, 0 50%)',
              boxShadow: `inset 0 0 0 2px ${placeable ? 'rgba(80,220,140,.95)' : 'rgba(240,90,90,.95)'}`,
              background: placeable ? 'rgba(80,220,140,.12)' : 'rgba(240,90,90,.18)',
            }}
          />,
        );
      }
    }
    const anchor = boardLabCellPosition(hoverCell);
    const frame = macroTileFrame(macroTileBrush);
    overlaySprites.push(
      <img
        key="macro-ghost-sprite"
        src={macroTileBrush.src}
        alt=""
        aria-hidden="true"
        draggable={false}
        style={{
          position: 'absolute',
          left: anchor.left + frame.left,
          top: anchor.top + frame.top,
          width: frame.width,
          height: frame.height,
          opacity: placeable ? 0.62 : 0.22,
          imageRendering: 'pixelated',
          pointerEvents: 'none',
          zIndex: 19001,
        }}
      />,
    );
  }

  const sceneBoard: EditorBoard = {
    cols,
    rows,
    cells: placed,
    macroTiles: [...placedMacroTiles],
    units: placedUnits,
    doodads: placedDoodads,
    props: placedProps,
    cover: placedCover,
    coverTypes: placedCoverTypes,
    features: placedFeatures as EditorBoard['features'],
    fences: placedFences,
    walls: placedWalls,
    wallArt: placedWallArt,
    featureCuts: {},
    featureExits: {},
    zones: {},
  };

  return (
    <TileGrid
      cells={cells}
      className={`tileset-placement-board is-tool-${tool}`}
      ariaLabel="Editable tile board"
      boardZoom={boardZoom}
      boardPan={boardPan}
      backgroundLayer={(
        <>
          <BoardTerrainLayer
            cells={terrainCells}
            macroTiles={hidden?.tile ? [] : terrainCanvasMacroTiles(placedMacroTiles)}
          />
          <BoardSceneLayer board={sceneBoard} hidden={hidden} coverSeed={coverSeed} ambientCover={false} omitTerrain />
        </>
      )}
      onPointerUp={endInteraction}
      onPointerLeave={() => { setMovingFrom(null); paintingRef.current = false; setHoverCell(null); setHoverEdge(null); }}
    >
      {showGrid ? <BoardGridLayer cells={cells} /> : null}
      {overlaySprites}
    </TileGrid>
  );
}

// ---------------------------------------------------------------------------
// Level Editor (front-of-house). The functional Studio Lab board, re-dressed as
// a literal sibling of the Skirmish page: it reuses the real .skirmish-screen /
// .skirmish-war-room / .skirmish-field / .skirmish-board-frame / .skirmish-hud /
// .skirmish-card chrome (so it IS the same game), with the proven
// StudioEditableBoard inside, and the editor controls in .skirmish-card rail
// sections. M1 = the shell + tile painting; units/doodads/persistence land in
// later milestones. The Studio Lab (TilesetStudio) is untouched — this duplicates
// its board logic for now; a shared hook will dedupe them once it has settled.
// ---------------------------------------------------------------------------
const LE_COLS = 10;
const LE_ROWS = 10;
const leGrassFamily = studioFamilies.find((family) => family.id === 'grass') ?? studioFamilies[0];
const leDefaultTile = leGrassFamily.assets.find((asset) => asset.kind === 'tile') ?? leGrassFamily.assets[0];
const leTileGroups = studioFamilies.map((family) => ({ family, tiles: family.assets.filter((asset) => asset.kind === 'tile') }));
const leTileAssets = leTileGroups.flatMap(({ tiles }) => tiles);
const leFamilyAssets = studioFamilies.reduce((acc, family) => {
  acc[family.id] = family.assets.filter((asset) => asset.kind === 'tile');
  return acc;
}, {} as Record<TileFamilyId, readonly StudioAsset[]>);
const leAllTiles = studioFamilies.flatMap((family) => family.assets);
const leFamilyOfTile = (id: string): StudioFamily | undefined => studioFamilies.find((family) => family.assets.some((asset) => asset.id === id));
const leMacroTileFootprints = [...new Set(macroTileAssets.map((asset) => `${asset.columns}x${asset.rows}`))];
const leMacroTilesFor = (family: TileFamilyId, footprint: string): readonly MacroTileAsset[] =>
  macroTileAssets.filter((asset) => asset.family === family && `${asset.columns}x${asset.rows}` === footprint);
const validMacroTilesForBoard = (board: EditorBoard): MacroTilePlacement[] => {
  const known = resolveMacroTilePlacements({
    placements: board.macroTiles,
    columns: board.cols,
    rows: board.rows,
    familyAt: (x, y) => leFamilyOfTile(board.cells[`${x},${y}`] ?? '')?.id,
  });
  const unknown = (board.macroTiles ?? []).filter((placement) =>
    !macroTileAsset(placement.assetId)
    && Number.isInteger(placement.x)
    && Number.isInteger(placement.y)
    && placement.x >= 0
    && placement.y >= 0
    && placement.x < board.cols
    && placement.y < board.rows,
  );
  return [...known, ...unknown]
    .sort((a, b) => a.y - b.y || a.x - b.x || a.assetId.localeCompare(b.assetId));
};
// The terrain families the Generate (scatter) panel offers as toggles, in display order.
const LE_SCATTER_FAMILIES: ReadonlyArray<{ id: TileFamilyId; label: string }> = [
  { id: 'grass', label: 'Grass' },
  { id: 'stone', label: 'Stone' },
  { id: 'water', label: 'Water' },
  { id: 'dirt', label: 'Dirt' },
  { id: 'pebble', label: 'Pebble' },
  { id: 'sand', label: 'Sand' },
];
// One row of the Generate panel's terrain-region list. Duplicate terrains are allowed; `locked`
// pins a row so the linked sliders don't rebalance it. `cover` holds this region's ground-cover
// fill-in knobs (Coverage + Density, each a default plus a randomness amount, all 0..1); `expanded`
// is UI state for whether the cover knobs are showing.
type CoverKnobs = { amount: number; amountRandom: number; density: number; densityRandom: number };
const DEFAULT_COVER: CoverKnobs = { amount: 0.6, amountRandom: 0.3, density: 0.4, densityRandom: 0.3 };
// A region carries a LIST of cover entries (add/remove, like the region list itself), each a cover
// SET (decoupled from terrain) plus its own scatter knobs. `expanded` is UI state. Per cell the
// first listed entry whose Coverage roll hits wins, so several entries read as a MIX across the region.
type CoverEntry = { id: number; type: GroundCoverId; expanded: boolean; knobs: CoverKnobs };
type ScatterRow = {
  id: number;
  terrain: TileFamilyId;
  share: number;
  locked: boolean;
  covers: CoverEntry[];
  macroTileDensity: number;
  macroTileBreakup: number;
};
// The three ground-cover sets that have art, offered on every region regardless of its terrain.
const LE_COVER_TYPES = GROUND_COVER_ASSETS;
const isGroundCoverId = (id: string): id is GroundCoverId => GROUND_COVER_ASSETS.some((asset) => asset.id === id);
const defaultScatterRows = (): ScatterRow[] => [
  { id: 0, terrain: 'grass', share: 60, locked: false, covers: [{ id: 1, type: 'grass', expanded: false, knobs: { ...DEFAULT_COVER } }], macroTileDensity: DEFAULT_MACRO_TILE_DENSITY, macroTileBreakup: DEFAULT_MACRO_TILE_BREAKUP },
  { id: 1, terrain: 'stone', share: 40, locked: false, covers: [], macroTileDensity: DEFAULT_MACRO_TILE_DENSITY, macroTileBreakup: DEFAULT_MACRO_TILE_BREAKUP },
];
const regionCellSort = (a: string, b: string): number => {
  const [ax, ay] = a.split(',').map(Number);
  const [bx, by] = b.split(',').map(Number);
  return ay === by ? ax - bx : ay - by;
};
const sortRegionCells = (cells: Iterable<string>): string[] => [...new Set(cells)].sort(regionCellSort);
const regionCellsEqual = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((key, index) => key === b[index]);
const scatterRowsToGeneratedSections = (rows: ScatterRow[]): BoardGeneratedRegionSection[] =>
  rows.map((row) => ({
    terrain: row.terrain,
    share: row.share,
    locked: row.locked || undefined,
    covers: row.covers.map((cover) => ({ type: cover.type, knobs: { ...cover.knobs } })),
    macroTileDensity: row.macroTileDensity,
    macroTileBreakup: row.macroTileBreakup,
  }));
const nextGeneratedRegionName = (regions: readonly BoardGeneratedRegion[]): string => {
  const used = new Set(regions.map((region) => region.name));
  let n = regions.length + 1;
  while (used.has(`Region ${n}`)) n += 1;
  return `Region ${n}`;
};
// A terrain's own cover set (grass tufts / water reeds / sand), or null — the default cover a region
// picks up when it uses that terrain (the author can then change it to anything).
const defaultCoverType = (terrain: TileFamilyId): GroundCoverId | null =>
  isGroundCoverId(terrain) ? terrain : null;
// Spatially-coherent value noise in [0,1] (bilinear over a hashed lattice) — drives cover patchiness
// so the "randomness" knobs vary coverage/density across areas instead of per-cell static.
function coverNoise(x: number, y: number, seed: number): number {
  const hash = (ix: number, iy: number): number => {
    let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041)) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const f = 0.28; // ~3.5-cell features
  const fx = x * f;
  const fy = y * f;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const smooth = (t: number): number => t * t * (3 - 2 * t);
  const a = hash(x0, y0);
  const b = hash(x0 + 1, y0);
  const c = hash(x0, y0 + 1);
  const d = hash(x0 + 1, y0 + 1);
  const top = a + (b - a) * smooth(tx);
  const bot = c + (d - c) * smooth(tx);
  return top + (bot - top) * smooth(ty);
}
// Proportional (normalized) redistribution: scale the UNLOCKED rows so all rows sum to `total`
// (locked rows fixed). Integer shares; rounding drift is absorbed by the largest unlocked row so
// the sum is always exact.
function normalizeToTotal(rows: ScatterRow[], total: number): ScatterRow[] {
  const lockedSum = rows.filter((r) => r.locked).reduce((a, r) => a + r.share, 0);
  const unlocked = rows.map((r, i) => ({ r, i })).filter(({ r }) => !r.locked);
  const next = rows.map((r) => ({ ...r }));
  if (unlocked.length === 0) return next;
  const pool = Math.max(0, total - lockedSum);
  const curSum = unlocked.reduce((a, { r }) => a + r.share, 0);
  unlocked.forEach(({ r, i }) => {
    next[i].share = curSum > 0 ? Math.max(0, Math.round((r.share / curSum) * pool)) : Math.round(pool / unlocked.length);
  });
  const drift = total - next.reduce((a, r) => a + r.share, 0);
  if (drift !== 0) {
    const tgt = unlocked.map(({ i }) => i).sort((a, b) => next[b].share - next[a].share)[0];
    if (tgt !== undefined) next[tgt].share = Math.max(0, next[tgt].share + drift);
  }
  return next;
}
// Drag row `id` to `value`, keeping the sum at `total` (100 − buffer) by proportionally
// rebalancing the other UNLOCKED rows — the classic linked-slider behaviour.
function rebalanceShares(rows: ScatterRow[], id: number, value: number, buffer: number): ScatterRow[] {
  const total = 100 - buffer;
  const idx = rows.findIndex((r) => r.id === id);
  if (idx < 0) return rows;
  const lockedSum = rows.filter((r, i) => i !== idx && r.locked).reduce((a, r) => a + r.share, 0);
  const newShare = Math.max(0, Math.min(Math.round(value), Math.max(0, total - lockedSum)));
  const next = rows.map((r) => ({ ...r }));
  next[idx].share = newShare;
  const unlocked = next.map((r, i) => ({ r, i })).filter(({ r, i }) => i !== idx && !r.locked);
  if (unlocked.length === 0) return next;
  const pool = Math.max(0, total - newShare - lockedSum);
  const curSum = unlocked.reduce((a, { r }) => a + r.share, 0);
  unlocked.forEach(({ r, i }) => {
    next[i].share = curSum > 0 ? Math.max(0, Math.round((r.share / curSum) * pool)) : Math.round(pool / unlocked.length);
  });
  const drift = total - next.reduce((a, r) => a + r.share, 0);
  if (drift !== 0) {
    const tgt = unlocked.map(({ i }) => i).sort((a, b) => next[b].share - next[a].share)[0];
    if (tgt !== undefined) next[tgt].share = Math.max(0, next[tgt].share + drift);
  }
  return next;
}
const leSeedBoard = (): Record<string, string> => {
  const cells: Record<string, string> = {};
  for (let y = 0; y < LE_ROWS; y += 1) for (let x = 0; x < LE_COLS; x += 1) cells[`${x},${y}`] = leDefaultTile.id;
  return cells;
};
const LE_FACTION_LABELS = UNIT_PALETTE_LABELS;
type FactionDirections = Partial<Record<UnitPalette, Direction>>;
const DEFAULT_FACTION_DIRECTIONS: Record<UnitPalette, Direction> = {
  'navy-blue': 'north',
  crimson: 'south',
  golden: 'north',
  emerald: 'south',
  black: 'south',
  white: 'north',
};
const normalizeFactionDirections = (directions?: BoardFactionDirections): FactionDirections =>
  Object.fromEntries(
    Object.entries(directions ?? {}).filter(([faction, direction]) =>
      (UNIT_PALETTES as readonly string[]).includes(faction) && (rookDirections as readonly string[]).includes(direction),
    ),
  ) as FactionDirections;
const factionDefaultDirection = (faction: UnitPalette, directions: FactionDirections): Direction =>
  directions[faction] ?? DEFAULT_FACTION_DIRECTIONS[faction];
const sideDefaultFaction = (
  side: 'player' | 'enemy',
  playerFaction: UnitPalette | null,
  units: Record<string, BoardUnitPlacement>,
): UnitPalette => {
  const player = playerFaction ?? 'navy-blue';
  if (side === 'player') return player;
  const authoredEnemy = Object.values(units).find((unit) => unit.faction !== player)?.faction;
  if (isUnitPalette(authoredEnemy)) return authoredEnemy;
  if (playerFaction && playerFaction !== 'crimson') return 'crimson';
  return UNIT_PALETTES.find((faction) => faction !== player) ?? 'crimson';
};
const promotionEdgeTiles = (cols: number, rows: number, direction: Direction): string[] => {
  const tiles = new Set<string>();
  const add = (x: number, y: number): void => { if (x >= 0 && y >= 0 && x < cols && y < rows) tiles.add(`${x},${y}`); };
  if (direction.includes('north')) for (let x = 0; x < cols; x += 1) add(x, 0);
  if (direction.includes('south')) for (let x = 0; x < cols; x += 1) add(x, rows - 1);
  if (direction.includes('east')) for (let y = 0; y < rows; y += 1) add(cols - 1, y);
  if (direction.includes('west')) for (let y = 0; y < rows; y += 1) add(0, y);
  return sortRegionCells(tiles);
};
const leUnitAssets = productionUnitAssets.length ? productionUnitAssets : unitAssets;
const CHESS_MATERIAL_POINT_VALUE: Record<PlayablePieceType, number> = {
  pawn: 1,
  knight: 3,
  bishop: 3,
  rook: 5,
  queen: 9,
  king: 0,
};
const MATERIAL_VALUE_NOTE = 'P=1 / N,B=3 / R=5 / Q=9';
const materialPointsForUnitId = (unitId: string): number => {
  const type = unitAssetById(unitId)?.family;
  return type ? CHESS_MATERIAL_POINT_VALUE[type] : 0;
};

// Authored zones are named tile regions. Legacy semantic types stay in the schema for import and
// back-compat, but new editor-authored behavior belongs in events/rules.
const DEFAULT_ZONE_TYPE: ZoneType = 'region';
const DEFAULT_ZONE_COLOR: ZoneColor = 'teal';
const LEGACY_ZONE_COLOR: Record<ZoneType, ZoneColor> = {
  region: 'teal',
  'player-spawn': 'blue',
  'enemy-spawn': 'red',
  'enemy-threat': 'violet',
  objective: 'gold',
  'falling-rock': 'slate',
  'pawn-promotion': 'amber',
};
const LE_ZONE_COLOR_OPTIONS = [
  { color: 'teal', label: 'Teal' },
  { color: 'blue', label: 'Blue' },
  { color: 'red', label: 'Red' },
  { color: 'gold', label: 'Gold' },
  { color: 'violet', label: 'Violet' },
  { color: 'slate', label: 'Slate' },
  { color: 'amber', label: 'Amber' },
] as const satisfies ReadonlyArray<{ color: ZoneColor; label: string }>;
const isZoneColor = (value: unknown): value is ZoneColor => (ZONE_COLORS as readonly unknown[]).includes(value);

// A one-line, owner-facing gloss of each mode's win rule (the ADR-0050 table, in plain terms),
// shown under the mode picker so the author knows what they picked.
const MODE_DESCRIPTION: Record<ObjectiveType, string> = {
  'capture-all': 'Win by defeating every enemy piece.',
  'capture-king': 'One side holds the King; that side loses the moment its King is captured.',
  'rival-kings': 'Both sides hold a King; the first King captured decides the battle.',
  survive: 'The player wins by outlasting the set number of turns.',
  reach: 'A player piece reaching a Goal zone tile wins (defaults to the far edge if none is painted).',
};

const OTHER_EVENT_TEMPLATES = [
  { id: 'pawn-promotion', label: 'Pawn promotion' },
  { id: 'castling', label: 'Castling' },
  { id: 'chess-draws', label: 'Chess draws' },
] as const;
type OtherEventTemplateId = typeof OTHER_EVENT_TEMPLATES[number]['id'];

const levelFromDraft = (draft: LevelEditorDraft, base: Level): Level => editorBoardToLevel(draft.board, {
  id: base.id,
  name: draft.levelName,
  objective: draft.objective,
  surviveTurns: draft.objective === 'survive' ? draft.surviveTurns : undefined,
  timeControl: draft.timeControl,
  victory: draft.victory,
  events: draft.events,
  notes: base.notes,
  difficulty: base.difficulty,
  economy: base.economy,
  theme: base.theme,
  previousTerrain: base.layers.terrain,
});

// The undo/redo history signature of an editor board (boardCode is deterministic + lossless, so two
// boards encode identically iff equal); plus a deep clone + the history-stack depth cap.
const boardSignature = (board: EditorBoard): string => encodeBoard(board);
const cloneEditorBoard = (board: EditorBoard): EditorBoard => structuredClone(board) as EditorBoard;
const HISTORY_LIMIT = 100;

const zoneEntriesForBoard = (board: EditorBoard): EditorZoneEntry[] =>
  board.zoneEntries ? board.zoneEntries : zoneEntriesFromCellMap(board.zones, board.cols, board.rows);

const withZoneEntries = (board: EditorBoard, zoneEntries: EditorZoneEntry[]): EditorBoard => ({
  ...board,
  zoneEntries,
  zones: zoneCellMapFromEntries(zoneEntries),
});

function nextZoneEntryId(entries: readonly EditorZoneEntry[]): string {
  const used = new Set(entries.map((entry) => entry.id));
  for (let i = entries.length + 1; ; i += 1) {
    const id = `zone-${i}`;
    if (!used.has(id)) return id;
  }
}

function fallbackZoneName(entry: EditorZoneEntry, index: number): string {
  const id = entry.id.trim();
  const zoneNumber = /^zone-(\d+)$/i.exec(id)?.[1];
  if (zoneNumber) return `Zone ${zoneNumber}`;
  return id || `Zone ${index + 1}`;
}

function zoneDisplayName(entry: EditorZoneEntry, index: number): string {
  return entry.name?.trim() || fallbackZoneName(entry, index);
}

function zoneDisplayColor(entry: EditorZoneEntry): ZoneColor {
  return isZoneColor(entry.color) ? entry.color : LEGACY_ZONE_COLOR[entry.type] ?? DEFAULT_ZONE_COLOR;
}

function zoneCellColorMapFromEntries(entries: readonly EditorZoneEntry[] | undefined): Record<string, ZoneColor> {
  const zones: Record<string, ZoneColor> = {};
  for (const entry of entries ?? []) {
    const color = zoneDisplayColor(entry);
    for (const key of entry.tiles) zones[key] = color;
  }
  return zones;
}

function nextZoneEntryName(entries: readonly EditorZoneEntry[]): string {
  const used = new Set(entries.map((entry, index) => zoneDisplayName(entry, index).toLocaleLowerCase()));
  for (let i = entries.length + 1; ; i += 1) {
    const candidate = `Zone ${i}`;
    if (!used.has(candidate.toLocaleLowerCase())) return candidate;
  }
}

function uniqueZoneEntryName(base: string, entries: readonly EditorZoneEntry[]): string {
  const used = new Set(entries.map((entry, index) => zoneDisplayName(entry, index).toLocaleLowerCase()));
  if (!used.has(base.toLocaleLowerCase())) return base;
  for (let i = 2; ; i += 1) {
    const candidate = `${base} ${i}`;
    if (!used.has(candidate.toLocaleLowerCase())) return candidate;
  }
}

type EventZoneOption = { id: string; label: string };

const primaryEventAction = (event: LevelEvent): LevelEventAction | undefined => event.do[0];

const EVENT_KIND_FALLBACK_LABEL: Record<string, string> = {
  spawn: 'Setup spawn',
  promote: 'Pawn promotion',
  castle: 'Castling',
  'chess-draws': 'Chess draws',
};

const eventName = (event: LevelEvent, index: number): string =>
  event.name?.trim() || `${EVENT_KIND_FALLBACK_LABEL[primaryEventAction(event)?.kind ?? ''] ?? 'Event'} ${index + 1}`;

function replaceEventAction(event: LevelEvent, nextAction: LevelEventAction): LevelEvent {
  const nextDo = event.do.some((action) => action.kind === nextAction.kind)
    ? event.do.map((action) => (action.kind === nextAction.kind ? nextAction : action))
    : [...event.do, nextAction];
  return { ...event, do: nextDo };
}

const eventIdSlug = (value: string): string =>
  value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);

function uniqueEventId(base: string, events: readonly LevelEvent[]): string {
  const used = new Set(events.map((event) => event.id?.trim()).filter((id): id is string => Boolean(id)));
  const clean = eventIdSlug(base) || 'event';
  if (!used.has(clean)) return clean;
  for (let i = 2; ; i += 1) {
    const candidate = `${clean}-${i}`;
    if (!used.has(candidate)) return candidate;
  }
}

function uniqueEventName(base: string, events: readonly LevelEvent[]): string {
  const used = new Set(events.map((event, index) => eventName(event, index)));
  if (!used.has(base)) return base;
  for (let i = 2; ; i += 1) {
    const candidate = `${base} ${i}`;
    if (!used.has(candidate)) return candidate;
  }
}

function SelectFrame({ children, className = '' }: { children: ReactNode; className?: string }): ReactElement {
  return <div className={`le-select-wrap ${className}`.trim()}>{children}</div>;
}

function LevelEventsEditor({ value, zones, onChange, templates }: {
  value: LevelEvents;
  zones: EventZoneOption[];
  onChange: (next: LevelEvents, removedEvents?: readonly LevelEvent[]) => void;
  templates?: ReactNode;
}): ReactElement {
  const [sel, setSel] = useState(0);
  const selected = value.length ? Math.min(sel, value.length - 1) : -1;
  const event = selected >= 0 ? value[selected] : null;
  const spawnAction = event?.do.find((action): action is SpawnEventAction => action.kind === 'spawn') ?? null;
  const castleAction = event?.do.find((action): action is CastleEventAction => action.kind === 'castle') ?? null;
  const chessDrawsAction = event?.do.find((action): action is ChessDrawsEventAction => action.kind === 'chess-draws') ?? null;
  const promotionTrigger = event?.trigger.kind === 'unit-enters-zone' ? event.trigger : null;
  const promotesTriggeringUnit = Boolean(event?.do.some((action) => action.kind === 'promote' && action.target.kind === 'triggering-unit'));
  const firstZone = zones[0]?.id ?? '';
  const defaultZoneIds = (): string[] => firstZone ? [firstZone] : [];
  const setEvent = (index: number, next: LevelEvent): void => onChange(value.map((item, i) => (i === index ? next : item)));
  const addSpawn = (): void => {
    const fresh: LevelEvent = {
      id: uniqueEventId('setup-spawn', value),
      name: uniqueEventName('Setup spawn', value),
      trigger: { kind: 'setup' },
      do: [{ kind: 'spawn', side: 'player', roster: { pawn: 1 }, zoneIds: defaultZoneIds() }],
    };
    setSel(value.length);
    onChange([...value, fresh]);
  };
  const addPromotion = (): void => {
    const fresh: LevelEvent = {
      id: uniqueEventId('pawn-promotion', value),
      name: uniqueEventName('Pawn promotion', value),
      trigger: { kind: 'unit-enters-zone', unit: { type: 'pawn', side: 'player' }, zoneId: firstZone },
      do: [{ kind: 'promote', target: { kind: 'triggering-unit' } }],
    };
    setSel(value.length);
    onChange([...value, fresh]);
  };
  const removeEvent = (index: number): void => {
    const removed = value[index];
    setSel(Math.max(0, index - 1));
    onChange(value.filter((_, i) => i !== index), removed ? [removed] : undefined);
  };
  const patchSpawnRoster = (spawn: SpawnEventAction, type: PlayablePieceType, delta: number): SpawnEventAction => {
    const count = Math.max(0, (spawn.roster[type] ?? 0) + delta);
    const roster = { ...spawn.roster };
    if (count === 0) delete roster[type];
    else roster[type] = count;
    return { ...spawn, roster };
  };

  return (
    <div className="le-md le-events-other">
      <div className="le-md-list">
        {templates}
        <h3 className="le-victory-head">Events</h3>
        {value.length === 0 ? <p className="le-board-warning">No events yet.</p> : null}
        <div className="le-md-rules">
          {value.map((item, index) => (
            <button type="button" key={index} className={`le-md-item ${index === selected ? 'active' : ''}`.trim()} onClick={() => setSel(index)}>
              <span className="le-md-item-name">{eventName(item, index)}</span>
              <span className="le-md-item-out">{primaryEventAction(item)?.kind ?? 'event'}</span>
            </button>
          ))}
        </div>
        <div className="le-cond-add le-rule-add">
          <button type="button" className="le-seg-btn le-add-event" onClick={addSpawn}>+ Spawn</button>
          <button type="button" className="le-seg-btn le-add-event" onClick={addPromotion}>+ Promotion</button>
        </div>
      </div>
      <div className="le-md-detail">
        {event && spawnAction ? (
          <div className="le-rule">
            <div className="le-ctrlrow">
              <span className="le-ctrllabel">Event name</span>
              <input className="le-text-input" value={event.name ?? ''} placeholder={`Event ${selected + 1}`} aria-label="Event name"
                onChange={(e) => setEvent(selected, { ...event, name: e.target.value })} />
            </div>
            <div className="le-ctrlrow">
              <span className="le-ctrllabel">Trigger</span>
              <output className="le-event-readout" aria-label="Event trigger">Setup</output>
            </div>
            <div className="le-ctrlrow">
              <span className="le-ctrllabel">Faction</span>
              <SelectFrame>
                <select className="le-layer-select le-faction-select" value={spawnAction.side} aria-label="Spawn faction"
                  onChange={(e) => {
                    const side = e.target.value as 'player' | 'enemy';
                    const nextAction = { ...spawnAction, side, zoneIds: spawnAction.zoneIds.length ? spawnAction.zoneIds : defaultZoneIds() };
                    setEvent(selected, replaceEventAction(event, nextAction));
                  }}>
                  <option value="player">Player</option>
                  <option value="enemy">Enemy</option>
                </select>
              </SelectFrame>
            </div>
            <div className="le-ctrlrow">
              <span className="le-ctrllabel">Zone</span>
              <SelectFrame>
                <select className="le-layer-select" value={spawnAction.zoneIds[0] ?? ''} aria-label="Spawn zone"
                  onChange={(e) => setEvent(selected, replaceEventAction(event, { ...spawnAction, zoneIds: e.target.value ? [e.target.value] : [] }))}>
                  {zones.length === 0 ? <option value="">No zones painted</option> : null}
                  {zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.label}</option>)}
                </select>
              </SelectFrame>
            </div>
            <h3 className="le-victory-head">Roster</h3>
            {PLAYABLE_PIECE_TYPES.map((type) => (
              <div className="le-ctrlrow le-roster-row" key={type}>
                <span className="le-ctrllabel">{PIECE_LABEL[type]}</span>
                <div className="le-roster-stepper">
                  <Stepper value={spawnAction.roster[type] ?? 0} suffix="" decreaseLabel={`One fewer ${PIECE_LABEL[type]}`} increaseLabel={`One more ${PIECE_LABEL[type]}`}
                    onDecrease={() => setEvent(selected, replaceEventAction(event, patchSpawnRoster(spawnAction, type, -1)))}
                    onIncrease={() => setEvent(selected, replaceEventAction(event, patchSpawnRoster(spawnAction, type, 1)))} />
                </div>
              </div>
            ))}
            <div className="le-rule-then">
              <button type="button" className="le-seg-btn danger le-rule-remove" onClick={() => removeEvent(selected)}>Remove event</button>
            </div>
          </div>
        ) : event && promotionTrigger && promotesTriggeringUnit ? (
          <div className="le-rule">
            <div className="le-ctrlrow">
              <span className="le-ctrllabel">Event name</span>
              <input className="le-text-input" value={event.name ?? ''} placeholder={`Event ${selected + 1}`} aria-label="Event name"
                onChange={(e) => setEvent(selected, { ...event, name: e.target.value })} />
            </div>
            <div className="le-ctrlrow">
              <span className="le-ctrllabel">Trigger</span>
              <output className="le-event-readout" aria-label="Event trigger">Unit enters zone</output>
            </div>
            <div className="le-ctrlrow">
              <span className="le-ctrllabel">Unit</span>
              <SelectFrame>
                <select className="le-layer-select le-faction-select" value={promotionTrigger.unit.side ?? 'any'} aria-label="Promotion faction"
                  onChange={(e) => {
                    const side = e.target.value === 'any' ? undefined : e.target.value as 'player' | 'enemy';
                    setEvent(selected, { ...event, trigger: { kind: 'unit-enters-zone', unit: { type: 'pawn', side }, zoneId: promotionTrigger.zoneId } });
                  }}>
                  <option value="player">Player pawn</option>
                  <option value="enemy">Enemy pawn</option>
                  <option value="any">Any pawn</option>
                </select>
              </SelectFrame>
            </div>
            <div className="le-ctrlrow">
              <span className="le-ctrllabel">Zone</span>
              <SelectFrame>
                <select className="le-layer-select" value={promotionTrigger.zoneId} aria-label="Promotion zone"
                  onChange={(e) => setEvent(selected, { ...event, trigger: { kind: 'unit-enters-zone', unit: promotionTrigger.unit, zoneId: e.target.value } })}>
                  {zones.length === 0 ? <option value="">No zones painted</option> : null}
                  {zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.label}</option>)}
                </select>
              </SelectFrame>
            </div>
            <div className="le-ctrlrow">
              <span className="le-ctrllabel">Target</span>
              <output className="le-event-readout" aria-label="Event target">Unit that entered zone</output>
            </div>
            <div className="le-ctrlrow">
              <span className="le-ctrllabel">Action</span>
              <output className="le-event-readout" aria-label="Event action">Promote</output>
            </div>
            <div className="le-rule-then">
              <button type="button" className="le-seg-btn danger le-rule-remove" onClick={() => removeEvent(selected)}>Remove event</button>
            </div>
          </div>
        ) : event && castleAction ? (
          <div className="le-rule">
            <div className="le-ctrlrow">
              <span className="le-ctrllabel">Event name</span>
              <input className="le-text-input" value={event.name ?? ''} placeholder={`Event ${selected + 1}`} aria-label="Event name"
                onChange={(e) => setEvent(selected, { ...event, name: e.target.value })} />
            </div>
            <div className="le-ctrlrow">
              <span className="le-ctrllabel">Faction</span>
              <output className="le-event-readout" aria-label="Castle faction">{castleAction.side === 'player' ? 'Player' : 'Enemy'}</output>
            </div>
            <div className="le-ctrlrow">
              <span className="le-ctrllabel">King</span>
              <output className="le-event-readout" aria-label="Castle king squares">({castleAction.king.x}, {castleAction.king.y}) → ({castleAction.kingTo.x}, {castleAction.kingTo.y})</output>
            </div>
            <div className="le-ctrlrow">
              <span className="le-ctrllabel">Rook</span>
              <output className="le-event-readout" aria-label="Castle rook squares">({castleAction.rook.x}, {castleAction.rook.y}) → ({castleAction.rookTo.x}, {castleAction.rookTo.y})</output>
            </div>
            <p className="le-board-note">
              In play the castle is offered while the king and rook sit unmoved on their squares, the path is clear,
              and the king isn't in or moving through check. Moved the pieces or changed the Player faction? Remove
              this event and re-add the Castling template.
            </p>
            <div className="le-rule-then">
              <button type="button" className="le-seg-btn danger le-rule-remove" onClick={() => removeEvent(selected)}>Remove event</button>
            </div>
          </div>
        ) : event && chessDrawsAction ? (
          <div className="le-rule">
            <div className="le-ctrlrow">
              <span className="le-ctrllabel">Event name</span>
              <input className="le-text-input" value={event.name ?? ''} placeholder={`Event ${selected + 1}`} aria-label="Event name"
                onChange={(e) => setEvent(selected, { ...event, name: e.target.value })} />
            </div>
            <div className="le-ctrlrow">
              <span className="le-ctrllabel">50-move rule</span>
              <Toggle checked={chessDrawsAction.fiftyMove === true} label="Toggle the 50-move rule"
                onChange={(enabled) => setEvent(selected, replaceEventAction(event, { ...chessDrawsAction, fiftyMove: enabled }))} />
            </div>
            <div className="le-ctrlrow">
              <span className="le-ctrllabel">Threefold repetition</span>
              <Toggle checked={chessDrawsAction.threefold === true} label="Toggle threefold repetition"
                onChange={(enabled) => setEvent(selected, replaceEventAction(event, { ...chessDrawsAction, threefold: enabled }))} />
            </div>
            <p className="le-board-note">
              50-move rule: 50 full moves with no capture or pawn move end the game as a draw. Threefold repetition:
              the same position occurring three times ends it as a draw. Both match chess exactly, in live play and
              for the training AI.
            </p>
            <div className="le-rule-then">
              <button type="button" className="le-seg-btn danger le-rule-remove" onClick={() => removeEvent(selected)}>Remove event</button>
            </div>
          </div>
        ) : <p className="le-board-note">Select an event or add one on the left.</p>}
      </div>
    </div>
  );
}

function DirectionPopover({ value, label, onChange }: {
  value: Direction;
  label: string;
  onChange: (direction: Direction) => void;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const choose = (direction: Direction): void => {
    onChange(direction);
    setOpen(false);
  };
  return (
    <div
      className="le-direction-popover"
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (!(next instanceof Node) || !event.currentTarget.contains(next)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        setOpen(false);
        event.currentTarget.querySelector<HTMLButtonElement>('.le-direction-trigger')?.focus();
      }}
    >
      <button
        type="button"
        className="le-faction-select le-direction-trigger"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {rookDirectionLabel[value]}
      </button>
      {open ? (
        <div className="le-direction-menu" role="radiogroup" aria-label={label}>
          {directionCompassCells.map((cell) =>
            cell === 'center' ? (
              <span key="center" className="unit-facing-cell le-direction-cell is-empty" aria-hidden="true" />
            ) : (
              <button
                key={cell}
                type="button"
                className={`unit-facing-cell le-direction-cell${value === cell ? ' is-active' : ''}`}
                role="radio"
                aria-checked={value === cell}
                title={`Face ${cell}`}
                onClick={() => choose(cell)}
              >
                {rookDirectionLabel[cell]}
              </button>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}

// The 4-edge connection control for a selected feature tile. Mirrors the iso diamond:
// each edge is one cardinal neighbour (grid N/E/S/W = the screen NE/SE/SW/NW edges).
// Every edge is clickable and toggles the SHARED edge, so both tiles re-cap together:
//   • a SAME-KIND neighbour → joined (solid cyan) ↔ cut (dashed amber): sever / rejoin.
//   • NO same-kind neighbour (board boundary or a non-feature tile) → none (dim) ↔ exit
//     (solid green): force the ribbon to run OFF that edge instead of capping.
// Roads only connect to roads, rivers to rivers.
function FeatureConnections({
  cell,
  kind,
  features,
  cuts,
  exits,
  onToggle,
  onToggleExit,
}: {
  cell: { x: number; y: number };
  kind: FeatureKind;
  features: Record<string, FeatureCell>;
  cuts: Record<string, true>;
  exits: Record<string, true>;
  onToggle: (edge: string) => void;
  onToggleExit: (edge: string) => void;
}): ReactElement {
  const kindLabel = kind === 'river' ? 'river' : 'road';
  // Diamond geometry (viewBox 128x96): apex, right, bottom, left vertices.
  const V = { apex: [64, 14], right: [114, 48], bottom: [64, 82], left: [14, 48] } as const;
  const EDGE_GEO: Record<string, readonly [readonly [number, number], readonly [number, number]]> = {
    N: [V.apex, V.right],
    E: [V.right, V.bottom],
    S: [V.bottom, V.left],
    W: [V.left, V.apex],
  };
  return (
    <svg className="le-roadconn" viewBox="0 0 128 96" role="group" aria-label={`${kindLabel} connections for the selected tile`}>
      <polygon points={`${V.apex} ${V.right} ${V.bottom} ${V.left}`} fill="rgba(8,20,28,.55)" stroke="rgba(82,142,170,.35)" strokeWidth="1" />
      {FEATURE_DIRS.map((dir) => {
        const nx = cell.x + dir.dx;
        const ny = cell.y + dir.dy;
        const hasNeighbor = features[`${nx},${ny}`]?.kind === kind; // only same-kind neighbours connect
        const edge = roadEdgeKey(cell.x, cell.y, nx, ny);
        const severed = cuts[edge] === true;
        const exited = exits[edge] === true;
        const [[x1, y1], [x2, y2]] = EDGE_GEO[dir.edge];
        // With a neighbour: joined ↔ cut. Without one: none ↔ exit (forced outward stub).
        const state = hasNeighbor ? (severed ? 'cut' : 'joined') : exited ? 'exit' : 'none';
        const stroke =
          state === 'joined' ? 'var(--skirmish-cyan, #38d7ff)'
          : state === 'cut' ? '#f0a23a'
          : state === 'exit' ? '#67d98a'
          : 'rgba(120,150,165,.35)';
        const toggle = (): void => (hasNeighbor ? onToggle(edge) : onToggleExit(edge));
        const label =
          state === 'joined' ? `Sever ${dir.edge} ${kindLabel} connection`
          : state === 'cut' ? `Rejoin ${dir.edge} ${kindLabel} connection`
          : state === 'exit' ? `Close ${dir.edge} edge — stop running the ${kindLabel} off it`
          : `Run the ${kindLabel} off the ${dir.edge} edge`;
        return (
          <g
            key={dir.edge}
            className={`le-roadconn-edge is-${state}`}
            role="button"
            aria-label={label}
            aria-pressed={state === 'cut' || state === 'exit'}
            tabIndex={0}
            onClick={toggle}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } }}
          >
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth="20" strokeLinecap="round" />
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke} strokeWidth="6" strokeLinecap="round" strokeDasharray={state === 'cut' ? '5 5' : undefined} />
          </g>
        );
      })}
    </svg>
  );
}

function FenceConnections({
  cell,
  cols,
  rows,
  fences,
  onPaint,
  onErase,
}: {
  cell: { x: number; y: number };
  cols: number;
  rows: number;
  fences: Record<string, FenceMaterial>;
  onPaint: (edge: string) => void;
  onErase: (edge: string) => void;
}): ReactElement {
  const V = { apex: [64, 14], right: [114, 48], bottom: [64, 82], left: [14, 48] } as const;
  const EDGE_GEO: Record<string, readonly [readonly [number, number], readonly [number, number]]> = {
    N: [V.apex, V.right],
    E: [V.right, V.bottom],
    S: [V.bottom, V.left],
    W: [V.left, V.apex],
  };
  return (
    <svg className="le-roadconn" viewBox="0 0 128 96" role="group" aria-label="Fence edges for the selected tile">
      <polygon points={`${V.apex} ${V.right} ${V.bottom} ${V.left}`} fill="rgba(8,20,28,.55)" stroke="rgba(82,142,170,.35)" strokeWidth="1" />
      {FEATURE_DIRS.map((dir) => {
        const nx = cell.x + dir.dx;
        const ny = cell.y + dir.dy;
        const neighborOnBoard = nx >= 0 && nx < cols && ny >= 0 && ny < rows;
        const edge = roadEdgeKey(cell.x, cell.y, nx, ny);
        const material = fences[edge];
        const state = material ? 'fence' : neighborOnBoard ? 'none' : 'boundary';
        const [[x1, y1], [x2, y2]] = EDGE_GEO[dir.edge];
        const stroke =
          material === 'stone' ? '#c7d3d8'
          : material === 'wood' ? '#d6b169'
          : neighborOnBoard ? 'rgba(120,150,165,.35)'
          : 'rgba(103,217,138,.48)';
        const toggle = (): void => (material ? onErase(edge) : onPaint(edge));
        const label = material
          ? `Remove ${FENCE_MATERIAL_LABELS[material]} fence from ${dir.edge} edge`
          : `Add fence to ${neighborOnBoard ? '' : 'boundary '}${dir.edge} edge`;
        return (
          <g
            key={dir.edge}
            className={`le-roadconn-edge is-${state}`}
            role="button"
            aria-label={label}
            aria-pressed={Boolean(material)}
            tabIndex={0}
            onClick={toggle}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } }}
          >
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth="20" strokeLinecap="round" />
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke} strokeWidth={material ? '7' : '5'} strokeLinecap="round" strokeDasharray={material ? undefined : neighborOnBoard ? '4 7' : '2 6'} />
          </g>
        );
      })}
    </svg>
  );
}

function WallConnections({
  cell,
  cols,
  rows,
  walls,
  onPaint,
  onErase,
}: {
  cell: { x: number; y: number };
  cols: number;
  rows: number;
  walls: Record<string, WallMaterial>;
  onPaint: (edge: string) => void;
  onErase: (edge: string) => void;
}): ReactElement {
  const V = { apex: [64, 14], right: [114, 48], bottom: [64, 82], left: [14, 48] } as const;
  const EDGE_GEO: Record<string, readonly [readonly [number, number], readonly [number, number]]> = {
    N: [V.apex, V.right],
    E: [V.right, V.bottom],
    S: [V.bottom, V.left],
    W: [V.left, V.apex],
  };
  return (
    <svg className="le-roadconn" viewBox="0 0 128 96" role="group" aria-label="Wall edges for the selected tile">
      <polygon points={`${V.apex} ${V.right} ${V.bottom} ${V.left}`} fill="rgba(8,20,28,.55)" stroke="rgba(82,142,170,.35)" strokeWidth="1" />
      {FEATURE_DIRS.map((dir) => {
        const nx = cell.x + dir.dx;
        const ny = cell.y + dir.dy;
        const edge = roadEdgeKey(cell.x, cell.y, nx, ny);
        const material = walls[edge];
        const renderable = isNorthWestBoundaryWallEdge(edge, { cols, rows });
        const [[x1, y1], [x2, y2]] = EDGE_GEO[dir.edge];
        const stroke = material ? '#c9d0c2' : renderable ? 'rgba(160,176,164,.48)' : 'rgba(100,112,122,.22)';
        const toggle = (): void => {
          if (material) onErase(edge);
          else if (renderable) onPaint(edge);
        };
        const label = material
          ? `Remove ${WALL_MATERIAL_LABELS[material]} wall from ${dir.edge} edge`
          : renderable
          ? `Add wall to ${dir.edge} edge`
          : `${dir.edge} edge is not a north/west map edge`;
        return (
          <g
            key={dir.edge}
            className={`le-roadconn-edge is-${material ? `wall is-${material}` : renderable ? 'none' : 'boundary'}`}
            role="button"
            aria-label={label}
            aria-pressed={Boolean(material)}
            aria-disabled={!material && !renderable}
            tabIndex={renderable || material ? 0 : -1}
            onClick={toggle}
            onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && (renderable || material)) { e.preventDefault(); toggle(); } }}
          >
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth="20" strokeLinecap="round" />
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke} strokeWidth={material ? '9' : '5'} strokeLinecap="round" strokeDasharray={material ? undefined : renderable ? '4 7' : '2 8'} />
          </g>
        );
      })}
    </svg>
  );
}

function WallArtConnections({
  cell,
  cols,
  rows,
  walls,
  placements,
  onPaint,
  onErase,
}: {
  cell: { x: number; y: number };
  cols: number;
  rows: number;
  walls: Record<string, WallMaterial>;
  placements: Record<string, WallArtId>;
  onPaint: (edge: string) => void;
  onErase: (edge: string) => void;
}): ReactElement {
  const V = { apex: [64, 14], right: [114, 48], bottom: [64, 82], left: [14, 48] } as const;
  const EDGE_GEO: Record<string, readonly [readonly [number, number], readonly [number, number]]> = {
    N: [V.apex, V.right],
    E: [V.right, V.bottom],
    S: [V.bottom, V.left],
    W: [V.left, V.apex],
  };
  const bounds = { cols, rows };
  return (
    <svg className="le-roadconn" viewBox="0 0 128 96" role="group" aria-label="Wall art edges for the selected tile">
      <polygon points={`${V.apex} ${V.right} ${V.bottom} ${V.left}`} fill="rgba(8,20,28,.55)" stroke="rgba(82,142,170,.35)" strokeWidth="1" />
      {FEATURE_DIRS.map((dir) => {
        const nx = cell.x + dir.dx;
        const ny = cell.y + dir.dy;
        const edge = roadEdgeKey(cell.x, cell.y, nx, ny);
        const placement = wallArtAtEdge(edge, placements, bounds);
        const renderable = isNorthWestBoundaryWallEdge(edge, bounds);
        const hasWall = Boolean(walls[edge]);
        const paintable = renderable && hasWall;
        const [[x1, y1], [x2, y2]] = EDGE_GEO[dir.edge];
        const stroke = placement ? '#e8c66d' : paintable ? 'rgba(230,190,105,.52)' : 'rgba(100,112,122,.22)';
        const toggle = (): void => {
          if (placement) onErase(edge);
          else if (paintable) onPaint(edge);
        };
        const label = placement
          ? `Remove ${wallArtLabel(placement.artId)} from ${dir.edge} edge`
          : paintable
          ? `Add wall art to ${dir.edge} edge`
          : renderable
          ? `${dir.edge} edge needs a wall before wall art`
          : `${dir.edge} edge is not a north/west map edge`;
        return (
          <g
            key={dir.edge}
            className={`le-roadconn-edge is-${placement ? 'wallart' : paintable ? 'none' : 'boundary'}`}
            role="button"
            aria-label={label}
            aria-pressed={Boolean(placement)}
            aria-disabled={!placement && !paintable}
            tabIndex={placement || paintable ? 0 : -1}
            onClick={toggle}
            onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && (placement || paintable)) { e.preventDefault(); toggle(); } }}
          >
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth="20" strokeLinecap="round" />
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke} strokeWidth={placement ? '8' : '5'} strokeLinecap="round" strokeDasharray={placement ? undefined : paintable ? '4 7' : '2 8'} />
          </g>
        );
      })}
    </svg>
  );
}

// The editor's palette layers. Roads and rivers share one "Paths" layer (both are linear
// connection features); the brush kind under it decides road vs river. Fence is its own EDGE
// layer (you paint the boundary between two tiles). The layer picker is a dropdown.
type LayerKey = LevelEditorLayerKey;
type BrushKind = LevelEditorBrushKind;
const LEVEL_EDITOR_LAYER_OPTIONS: ReadonlyArray<{ id: LayerKey; label: string }> = [
  { id: 'board', label: 'Board' },
  { id: 'tile', label: 'Tile' },
  { id: 'generate', label: 'Generate' },
  { id: 'paths', label: 'Paths' },
  { id: 'fence', label: 'Fence' },
  { id: 'wall', label: 'Wall' },
  { id: 'wallart', label: 'Wall Art' },
  { id: 'unit', label: 'Unit' },
  { id: 'doodad', label: 'Doodad' },
  { id: 'prop', label: 'Prop' },
  { id: 'cover', label: 'Cover' },
  { id: 'zone', label: 'Zone' },
  { id: 'rules', label: 'Rules' },
  { id: 'status', label: 'Status' },
];
const isLayerOptionDisabled = (_layer: LayerKey): boolean => false;
const defaultLevelEditorLayer = (): LayerKey => LEVEL_EDITOR_LAYER_OPTIONS.find((option) => !isLayerOptionDisabled(option.id))?.id ?? LEVEL_EDITOR_LAYER_OPTIONS[0].id;
function isWallMaterialId(value: string | undefined): value is WallMaterial {
  return !!value && (WALL_MATERIALS as readonly string[]).includes(value);
}

function perimeterWalls(walls: Record<string, WallMaterial> | undefined, cols: number, rows: number): Record<string, WallMaterial> {
  const next: Record<string, WallMaterial> = {};
  for (const [edge, material] of Object.entries(walls ?? {})) {
    if (isNorthWestBoundaryWallEdge(edge, { cols, rows }) && isWallMaterialId(material)) next[edge] = material;
  }
  return next;
}
function perimeterWallArt(placements: Record<string, WallArtId> | undefined, cols: number, rows: number): Record<string, WallArtId> {
  const next: Record<string, WallArtId> = {};
  const bounds = { cols, rows };
  for (const [edge, artId] of Object.entries(placements ?? {})) {
    if (!isNorthWestBoundaryWallEdge(edge, bounds) || !wallArt(artId)) continue;
    if (wallArtSpanEdges(edge, artId, bounds).length === wallArtSpanForId(artId)) next[edge] = artId;
  }
  return next;
}
// `rules` (events/settings) and `board`/`status` are non-painting layers → select tool.
const toolForLayer = (layer: LayerKey): 'select' | 'brush' => (layer === 'board' || layer === 'status' || layer === 'rules' || layer === 'generate') ? 'select' : 'brush';
const brushKindForInitialLayer = (layer: LayerKey): BrushKind => {
  if (layer === 'paths') return 'road';
  if (layer === 'board' || layer === 'status' || layer === 'rules' || layer === 'generate') return 'tile';
  return layer;
};
const brushKindForRouteState = (layer: LayerKey, kind: BrushKind | undefined): BrushKind => {
  const routedKind = levelEditorRouteBrushKind(layer, kind);
  return routedKind ?? brushKindForInitialLayer(layer);
};
type FactionControl = 'cpu' | 'player';
const factionControlOptions = (campaign: boolean): Array<{ value: FactionControl; label: string }> => [
  { value: 'cpu', label: 'CPU' },
  { value: 'player', label: campaign ? 'Player' : 'Player 1' },
];
const formatDifficulty = (difficulty: string | undefined): string => {
  const value = difficulty?.trim() || 'normal';
  return value.charAt(0).toUpperCase() + value.slice(1);
};
type StatusTone = 'info' | 'success' | 'warning' | 'error';
type StatusLogEntry = { id: number; tone: StatusTone; message: string; detail?: string; at: string };
const STATUS_LOG_LIMIT = 24;
const EDITOR_SIGN_IN_RECOVERY_INTENT_KEY = 'ct:level-editor-sign-in-recovery:v1';
const EDITOR_HYDRATION_WAIT_MS = 5_000;

type EditorSignInRecoveryIntent = { draftKey: string; savedAt: number };

const readEditorSignInRecoveryIntent = (): EditorSignInRecoveryIntent | null => {
  try {
    const value = JSON.parse(window.sessionStorage.getItem(EDITOR_SIGN_IN_RECOVERY_INTENT_KEY) ?? 'null') as Partial<EditorSignInRecoveryIntent> | null;
    return value
      && typeof value.draftKey === 'string'
      && typeof value.savedAt === 'number'
      && Number.isFinite(value.savedAt)
      ? { draftKey: value.draftKey, savedAt: value.savedAt }
      : null;
  } catch {
    return null;
  }
};

const clearEditorSignInRecoveryIntent = (): void => {
  try { window.sessionStorage.removeItem(EDITOR_SIGN_IN_RECOVERY_INTENT_KEY); } catch { /* blocked storage */ }
};

export function LevelEditor(): ReactElement {
  const animationFrame = useAnimationClock(true, 8, 150);
  // The Studio routes here with ?from=studio (show a "back to catalog" link), ?kind=<brush-kind>,
  // and optionally ?brush=<id> to pre-arm the brush you clicked in the catalog. A general
  // ?layer=<id> deep-link opens straight on any panel (rules, status, zone, ...) — validated
  // against the real layer list, ignoring unknown/disabled ids. Read once at mount; reached from
  // the main menu these are all absent and we open on the first layer.
  const studioArm = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const rawRouteState = readLevelEditorRouteState(window.location.search);
    const routeState = rawRouteState.brushKind === 'wall' && wallArt(rawRouteState.brush)
      ? { ...rawRouteState, layer: 'wallart' as const, brushKind: 'wallart' as const }
      : rawRouteState;
    const layer = routeState.layer && !isLayerOptionDisabled(routeState.layer) ? routeState.layer : undefined;
    return {
      fromStudio: params.get('from') === 'studio',
      kind: routeState.brushKind,
      layer,
      brush: routeState.brush,
    };
  }, []);
  const cameFromStudio = studioArm.fromStudio;
  // An explicit ?layer= wins over ?kind= (which is really brush-arming), then the default.
  const initialLayer: LayerKey = studioArm.layer ?? defaultLevelEditorLayer();
  const initialBrushKind = brushKindForRouteState(initialLayer, studioArm.kind);
  // The campaign path deep-links here with ?campaignId&levelId (&returnTo): which level to
  // edit, and where "Back" returns after a save. Read once at mount; absent ⇒ a standalone
  // (board-link / blank) board with no campaign target.
  const routeParams = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const rawDocumentRevision = Number(params.get('docRev'));
    const legacyMapId = params.get('map') ?? undefined;
    return {
      campaignId: params.get('campaignId') ?? undefined,
      levelId: params.get('levelId') ?? undefined,
      documentId: params.get('document') ?? (legacyMapId ? `legacy-${legacyMapId}` : undefined),
      documentRevision: Number.isSafeInteger(rawDocumentRevision) && rawDocumentRevision >= 1 ? rawDocumentRevision : undefined,
      returnTo: params.get('returnTo') ?? undefined,
      boardCode: params.get('board') ?? undefined,
    };
  }, []);
  // Optional `?board=<code>` deep-link: decode a whole board to start from (see boardCode.ts).
  // It takes precedence over a campaign level (it's the explicit "inspect this exact board").
  const loadedBoard = useMemo(() => readBoardParam(), []);
  const urlParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const urlTimeControl = useMemo(() => readTimeControlParams(urlParams), [urlParams]);
  const urlEvents = useMemo(() => readLevelEventsParam(urlParams), [urlParams]);
  const urlVictory = useMemo(() => readVictoryRulesParam(urlParams), [urlParams]);
  const urlLevelName = useMemo(() => urlParams.get('name')?.trim() || undefined, [urlParams]);
  const urlSurviveTurns = useMemo(() => {
    const value = Number(urlParams.get('survive'));
    return Number.isSafeInteger(value) && value >= 1 ? value : undefined;
  }, [urlParams]);
  const urlObjective = useMemo(() => {
    const raw = urlParams.get('obj');
    return (OBJECTIVE_TYPES as readonly string[]).includes(raw ?? '') ? raw as ObjectiveType : undefined;
  }, [urlParams]);
  const initialDraftKey = useMemo(
    () => levelEditorDraftKey({ levelId: routeParams.levelId, boardCode: routeParams.boardCode }),
    [routeParams.levelId, routeParams.boardCode],
  );
  const [draftKey, setDraftKey] = useState(initialDraftKey);
  // Unscoped legacy/browser-only recovery is not applied until auth resolves. Signed-in cloud
  // documents use an account+document key below, so switching accounts cannot cross-load drafts.
  const unscopedLocalDraft = useMemo(() => readLevelEditorDraft(initialDraftKey), [initialDraftKey]);
  // levelId names the canonical Save/campaign-play target; the opaque `document` URL parameter
  // names the private working copy globally. Thumbnails and gameplay never read that working copy.
  const initialTargetLevel = useMemo(
    () => routeParams.levelId ? useCampaigns.getState().levels[routeParams.levelId] : undefined,
    [routeParams.levelId],
  );
  const initialTargetSig = useMemo(
    () => initialTargetLevel ? normalizedLevelEditorSignature(initialTargetLevel) : null,
    [initialTargetLevel],
  );
  const draftHasCampaignAssignment = unscopedLocalDraft?.campaignId !== undefined;
  const initialCampaignAssignmentId = draftHasCampaignAssignment
    ? unscopedLocalDraft?.campaignId ?? ''
    : routeParams.campaignId ?? '';
  // Campaign membership is staged alongside the working document and committed only by Save.
  const [campaignAssignmentId, setCampaignAssignmentId] = useState(initialCampaignAssignmentId);
  const [savedCampaignAssignmentId, setSavedCampaignAssignmentId] = useState('');
  const [campaignAssignmentHydrated, setCampaignAssignmentHydrated] = useState(!routeParams.levelId);
  const recoveredCampaignAssignmentRef = useRef(draftHasCampaignAssignment);
  // Recovery content is never silently discarded because its saved baseline changed. We restore
  // it as the document source, then compare it with the current canonical target below.
  const [localDraft] = useState<LevelEditorDraft | null>(() => null);
  const initialCampaignLevel = useMemo(
    () => (!loadedBoard ? initialTargetLevel : undefined),
    [initialTargetLevel, loadedBoard],
  );
  const initialCampaignBoard = useMemo(() => initialCampaignLevel ? levelToEditorBoard(initialCampaignLevel) : undefined, [initialCampaignLevel]);
  const initialBoard = localDraft?.board ?? loadedBoard ?? initialCampaignBoard;
  const initialFactionDirections = normalizeFactionDirections(initialBoard?.factionDirections);
  const initialGeneratedRegions = initialBoard?.generatedRegions ?? [];
  // Do not expose an editable board until the durable document has had a chance to resolve. On a
  // signed-out/offline visit we deliberately fall back to the browser recovery copy instead.
  const [editorReady, setEditorReady] = useState(false);
  const [targetBaselineResolved, setTargetBaselineResolved] = useState(!routeParams.levelId || Boolean(initialTargetLevel));
  const [editorDocument, setEditorDocument] = useState<EditorDocument | null>(null);
  const [editorLoadError, setEditorLoadError] = useState<{ title: string; detail: string; signIn?: boolean; retry?: boolean } | null>(null);
  const [cloudSaveState, setCloudSaveState] = useState<'loading' | 'local' | 'pending' | 'saving' | 'saved' | 'error' | 'conflict'>('loading');
  const [cloudSaveDetail, setCloudSaveDetail] = useState<string | null>(null);
  const [localBackupAvailable, setLocalBackupAvailable] = useState<boolean | null>(null);
  const [authReachable, setAuthReachable] = useState<boolean | null>(null);
  const [documentLoadAttempt, setDocumentLoadAttempt] = useState(0);
  const [userWorkspaceHydration, setUserWorkspaceHydration] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [officialWorkspaceHydration, setOfficialWorkspaceHydration] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const signInForEditor = (): void => {
    const recovery = readLevelEditorDraft(draftKey);
    let intentStored = false;
    if (recovery) {
      try {
        window.sessionStorage.setItem(EDITOR_SIGN_IN_RECOVERY_INTENT_KEY, JSON.stringify({
          draftKey,
          savedAt: recovery.savedAt,
        } satisfies EditorSignInRecoveryIntent));
        intentStored = true;
      } catch { /* Fall through to a separate sign-in tab; never abandon the only copy. */ }
    }
    if (!dirty || (recovery && intentStored)) {
      goSignIn();
      return;
    }

    // With no durable same-tab handoff, keep the live editor mounted and authenticate in a
    // separate tab. Returning focus retries auth and uploads the in-memory candidate safely.
    signInHandoffPendingRef.current = true;
    const signInWindow = window.open(signInHref('/editor'), '_blank', 'noopener,noreferrer');
    if (!signInWindow) {
      signInHandoffPendingRef.current = false;
      reportStatus('Sign-in tab was blocked.', 'warning', 'Keep this editor open and allow pop-ups before trying again.');
      return;
    }
    reportStatus('Sign-in opened in another tab.', 'info', 'Keep this editor open. Return here after signing in; cloud sync will retry without discarding this work.');
  };
  const [boardCells, setBoardCells] = useState<Record<string, string>>(() => initialBoard?.cells ?? leSeedBoard());
  const [boardMacroTiles, setBoardMacroTiles] = useState<MacroTilePlacement[]>(() => initialBoard ? validMacroTilesForBoard(initialBoard) : []);
  const [boardCols, setBoardCols] = useState(initialBoard?.cols ?? LE_COLS);
  const [boardRows, setBoardRows] = useState(initialBoard?.rows ?? LE_ROWS);
  const [playerFaction, setPlayerFaction] = useState<UnitPalette | null>(() =>
    (initialBoard?.playerFaction && (UNIT_PALETTES as readonly string[]).includes(initialBoard.playerFaction)) ? initialBoard.playerFaction as UnitPalette : null,
  );
  const [boardFactionDirections, setBoardFactionDirections] = useState<FactionDirections>(() => initialFactionDirections);
  const [tool, setTool] = useState<'select' | 'brush' | 'erase' | 'move' | 'region'>(toolForLayer(initialLayer));
  const [brushId, setBrushId] = useState<string>(studioArm.kind === 'tile' && studioArm.brush ? studioArm.brush : leDefaultTile.id);
  const [macroTileBrushId, setMacroTileBrushId] = useState<string | null>(null);
  const [macroTileFootprint, setMacroTileFootprint] = useState(leMacroTileFootprints[0] ?? '2x2');
  const [selectedCell, setSelectedCell] = useState<{ x: number; y: number } | null>(null);
  // Marquee region selection — the scope a Generate fills. "x,y" cell keys; empty ⇒ whole board.
  const [regionSelection, setRegionSelection] = useState<Set<string>>(() => new Set());
  // Saved generated-region units: rerunnable selections plus the Generate panel settings they used.
  const [generatedRegions, setGeneratedRegions] = useState<BoardGeneratedRegion[]>(() => initialGeneratedRegions);
  const [activeGeneratedRegionId, setActiveGeneratedRegionId] = useState<string | null>(null);
  // Terrain-scatter (Generate) controls: which families may appear, patch size, clumpiness, seed.
  const [scatterSections, setScatterSections] = useState<ScatterRow[]>(() => defaultScatterRows());
  const scatterIdRef = useRef(2);
  const coverIdRef = useRef(100);
  const generatedRegionIdRef = useRef(initialGeneratedRegions.length);
  const [scatterBuffer, setScatterBuffer] = useState(0);
  const [scatterWiggle, setScatterWiggle] = useState(0.5);
  const [viewZoom, setViewZoom] = useState(1);
  const [viewPan, setViewPan] = useState({ x: 0, y: 0 });
  const [showGrid, setShowGrid] = useState(false);
  const [showMoves, setShowMoves] = useState(true);
  const [showEnemyAttacks, setShowEnemyAttacks] = useState(true);
  const [showBlocked, setShowBlocked] = useState(false);
  const [showPromotionZones, setShowPromotionZones] = useState(false);
  const [brushKind, setBrushKind] = useState<BrushKind>(initialBrushKind);
  const [layer, setLayer] = useState<LayerKey>(initialLayer);
  const [boardUnits, setBoardUnits] = useState<Record<string, BoardUnitPlacement>>((initialBoard?.units as Record<string, BoardUnitPlacement>) ?? {});
  const [boardDoodads, setBoardDoodads] = useState<Record<string, { doodadId: string }>>(initialBoard?.doodads ?? {});
  // Multi-cell props (trees/houses), keyed by ANCHOR cell. Seeded from a loaded board, else empty.
  const [boardProps, setBoardProps] = useState<Record<string, { propId: string }>>(initialBoard?.props ?? {});
  const [propBrushId, setPropBrushId] = useState<string>(PROP_DEFS[0].id);
  // Ground cover is a per-tile FEATURE (density), not a doodad: which tiles grow vegetation
  // and how thick. Tufts are rolled deterministically from this density (see core/groundCover).
  const [boardCover, setBoardCover] = useState<Record<string, GroundCoverDensity>>(initialBoard?.cover ?? {});
  // Per-cell cover-set overrides (decoupling cover from terrain — e.g. grass tufts on stone). A cell
  // absent here uses its own tile terrain's cover.
  const [boardCoverTypes, setBoardCoverTypes] = useState<Record<string, TileFamilyId>>(initialBoard?.coverTypes ?? {});
  const [coverBrushDensity, setCoverBrushDensity] = useState<GroundCoverDensity>('sparse');
  const [coverBrushType, setCoverBrushType] = useState<GroundCoverId>(() =>
    groundCoverAsset(studioArm.kind === 'cover' ? studioArm.brush : undefined).id);
  const [coverSeed, setCoverSeed] = useState(1234);
  // Roads and rivers are LINEAR features (ribbons you draw), not per-cell terrain materials:
  // store each painted cell's {kind, material}, then derive its connection mask from its
  // SAME-KIND neighbours so the renderer picks straight/corner/T/cross. One unified layer —
  // roads connect to roads, rivers to rivers, never to each other. See core/featureAutotile.ts.
  const [boardFeatures, setBoardFeatures] = useState<Record<string, FeatureCell>>(initialBoard?.features ?? {});
  // Edge fences (ADR): a wall on the boundary between two tiles, keyed by the shared-edge key
  // (roadEdgeKey) -> material. Painted per-edge, not per-cell; blocks crossing that edge in play.
  const [boardFences, setBoardFences] = useState<Record<string, FenceMaterial>>(initialBoard?.fences ?? {});
  const [fenceBrushMaterial, setFenceBrushMaterial] = useState<FenceMaterial>(DEFAULT_FENCE_MATERIAL);
  // Edge walls use fence-style edge keys, but the editor accepts only the map's northmost
  // and westmost perimeter edges.
  const [boardWalls, setBoardWalls] = useState<Record<string, WallMaterial>>(() =>
    perimeterWalls(initialBoard?.walls, initialBoard?.cols ?? LE_COLS, initialBoard?.rows ?? LE_ROWS));
  const [wallBrushMaterial, setWallBrushMaterial] = useState<WallMaterial>(() => {
    const brush = studioArm.kind === 'wall' ? studioArm.brush : undefined;
    return isWallMaterialId(brush) ? brush : DEFAULT_WALL_MATERIAL;
  });
  const [boardWallArt, setBoardWallArt] = useState<Record<string, WallArtId>>(() =>
    perimeterWallArt(initialBoard?.wallArt, initialBoard?.cols ?? LE_COLS, initialBoard?.rows ?? LE_ROWS));
  const [wallArtBrushId, setWallArtBrushId] = useState<WallArtId>(() =>
    wallArtIdOrDefault(studioArm.kind === 'wallart' ? studioArm.brush : undefined));
  const [wallArtPlacementFeedback, setWallArtPlacementFeedback] = useState<{ tone: 'ready' | 'blocked'; message: string } | null>(null);
  const wallArtBrush = wallArt(wallArtBrushId) ?? wallArtItems()[0];
  // The remembered brush material PER kind, so switching Road↔River keeps each picker's choice.
  const [featureBrushMaterial, setFeatureBrushMaterial] = useState<Record<FeatureKind, FeatureMaterial>>({
    road: defaultFeatureMaterial('road'),
    river: defaultFeatureMaterial('river'),
  });
  // Manually SEVERED feature connections, keyed by the shared edge between two cells
  // (roadEdgeKey, order-independent). A cut overrides auto-connect for BOTH tiles.
  const [featureCuts, setFeatureCuts] = useState<Record<string, true>>(initialBoard?.featureCuts ?? {});
  // Forced outward stubs, the mirror of a cut: each keyed edge has NO same-kind neighbour but is
  // pushed to connect anyway, so the ribbon runs off the board edge (or into a non-feature tile)
  // instead of capping. Same edge keying as cuts (roadEdgeKey); the neighbour may be off-board.
  const [featureExits, setFeatureExits] = useState<Record<string, true>>(initialBoard?.featureExits ?? {});
  // The active feature kind = the current layer when it's a (road/river) feature layer, else null.
  const featureKind: FeatureKind | null = brushKind === 'road' || brushKind === 'river' ? brushKind : null;
  // The fence tool paints EDGES (a separate, edge-based feature), not per-cell ribbons.
  const fenceTool = brushKind === 'fence';
  const wallTool = brushKind === 'wall';
  const wallArtTool = brushKind === 'wallart';
  const [unitBrushId, setUnitBrushId] = useState<string>(studioArm.kind === 'unit' && studioArm.brush ? studioArm.brush : leUnitAssets[0].id);
  const [doodadBrushId, setDoodadBrushId] = useState<string>(studioArm.kind === 'doodad' && studioArm.brush ? studioArm.brush : DOODAD_ASSETS[0].id);
  const [unitBrushDirection, setUnitBrushDirection] = useState<Direction>(() => factionDefaultDirection('navy-blue', initialFactionDirections));
  const [unitFaction, setUnitFactionState] = useState<UnitPalette>('navy-blue');
  const [undoStack, setUndoStack] = useState<EditorBoard[]>([]);
  const [redoStack, setRedoStack] = useState<EditorBoard[]>([]);
  // Gameplay zones: an authored list of named region entries. `boardZones` below is the legacy
  // per-cell overlay map derived from this list for board rendering and old board-code compatibility.
  const [boardZoneEntries, setBoardZoneEntries] = useState<EditorZoneEntry[]>(() => zoneEntriesForBoard(initialBoard ?? { cols: boardCols, rows: boardRows, cells: {}, units: {}, doodads: {}, props: {}, cover: {}, features: {}, featureCuts: {}, featureExits: {}, zones: {} }));
  const [selectedZoneIndex, setSelectedZoneIndex] = useState(0);
  const boardZones = useMemo(() => zoneCellMapFromEntries(boardZoneEntries), [boardZoneEntries]);
  const activeZone = boardZoneEntries[selectedZoneIndex] ?? null;
  const activeZoneName = activeZone ? zoneDisplayName(activeZone, selectedZoneIndex) : '';
  const activeZoneNameValue = activeZone ? activeZone.name ?? activeZoneName : '';
  const activeZoneColor = activeZone ? zoneDisplayColor(activeZone) : DEFAULT_ZONE_COLOR;
  const activeZoneOverlay = useMemo(() => activeZone ? zoneCellColorMapFromEntries([activeZone]) : {}, [activeZone]);
  const visibleZones = brushKind === 'zone' ? activeZoneOverlay : {};
  useEffect(() => {
    if (selectedZoneIndex < boardZoneEntries.length || selectedZoneIndex === 0) return;
    setSelectedZoneIndex(Math.max(0, boardZoneEntries.length - 1));
  }, [boardZoneEntries.length, selectedZoneIndex]);

  // The Rules panel state: authored win rules, non-victory events, and ancillary battle settings.
  // Seeded from the campaign level on hydrate (below); a fresh/standalone board starts at the
  // schema defaults so it reads exactly like a blank createBlankLevel.
  const [objective, setObjective] = useState<ObjectiveType>(localDraft?.objective ?? initialCampaignLevel?.objective ?? urlObjective ?? 'capture-all');
  const [surviveTurns, setSurviveTurns] = useState<number>(localDraft?.surviveTurns ?? initialCampaignLevel?.surviveTurns ?? urlSurviveTurns ?? DEFAULT_SURVIVE_TURNS);
  // The battle clock (ADR-0053) — off by default; when on, the level carries a TimeControl and the
  // skirmish runs the player's chess clock (the enemy is untimed). Seeded like the other RULES
  // fields: a restored draft (present ⇒ on, with its authored seconds) beats the campaign level.
  const initialTimeControl = localDraft?.timeControl ?? initialCampaignLevel?.timeControl ?? urlTimeControl;
  const [clockEnabled, setClockEnabledState] = useState<boolean>(
    localDraft ? localDraft.timeControl !== undefined : initialCampaignLevel ? initialCampaignLevel.timeControl !== undefined : urlTimeControl !== undefined,
  );
  const [clockInitialSeconds, setClockInitialSecondsState] = useState<number>(initialTimeControl?.initialSeconds ?? DEFAULT_TIME_CONTROL.initialSeconds);
  const [clockIncrementSeconds, setClockIncrementSecondsState] = useState<number>(initialTimeControl?.incrementSeconds ?? DEFAULT_TIME_CONTROL.incrementSeconds);
  // Victory conditions (ADR-0064): `victory` is the working win/lose lists — always the truth for
  // this level's outcome, edited in the RULES panel. Seeded from the objective preset for a level
  // that never customized them; a level stores `victory` only when the lists diverge from that
  // preset (see victoryForSave), which keeps preset levels' bodies clean and out of the dirty check.
  const [victory, setVictoryState] = useState<VictoryRules>(
    localDraft?.victory ?? initialCampaignLevel?.victory ?? urlVictory ?? victoryRulesForObjective(objective, { surviveTurns }),
  );
  const [events, setEventsState] = useState<LevelEvents>(() =>
    normalizeLevelEvents(localDraft?.events ?? (initialCampaignLevel ? effectiveLevelEvents(initialCampaignLevel) : urlEvents ?? [])),
  );
  // The victory-events editor opens as a full-size overlay over the board — the narrow control
  // panel can't give rule authoring room to breathe. The panel stays put; a button opens this.
  const [eventsOpen, setEventsOpen] = useState(() => Boolean(window.history.state?.levelEditorRules));
  // The template dropdown choices append event rows; Clear is the explicit page-local reset.
  const [templateChoice, setTemplateChoiceState] = useState<ObjectiveType>(objective);
  const [otherTemplateChoice, setOtherTemplateChoice] = useState<OtherEventTemplateId>('pawn-promotion');
  // The events overlay's tab: victory rules (win/lose events) vs other events (spawn/promotion).
  const [eventsTab, setEventsTab] = useState<'victory' | 'other'>('victory');

  // The level being edited (campaign path). `levelId` is the store key the Save writes back
  // through; `editingId` may differ once a cold board is saved (Phase 3). The name is edited in
  // Status, beside the save workflow; `savedSig` is the level signature at last save, the dirty basis.
  const [editingId, setEditingId] = useState<string | undefined>(routeParams.levelId ?? localDraft?.editingId);
  const [levelName, setLevelNameState] = useState<string>(localDraft?.levelName ?? initialCampaignLevel?.name ?? urlLevelName ?? 'Untitled level');
  const levelNameForSave = useMemo(() => levelName.trim() || 'Untitled level', [levelName]);
  const [savedSig, setSavedSig] = useState<string | null>(initialTargetSig ?? localDraft?.savedSig ?? null);
  // Set true once a campaign level has been hydrated into the board state; the baseline effect
  // below then captures the clean signature from the SETTLED state (so the just-loaded level reads
  // clean even for a legacy level whose derived boardCode differs from its saved one).
  const needsBaselineRef = useRef(false);
  // Which rules-panel fields the user has explicitly authored. The mount-time document
  // loads resolve asynchronously, and the ADR-0046 entrance failsafe makes the editor
  // interactive while they are still in flight — so every user-facing rules setter routes
  // through an authoring wrapper below, and a late seed skips whatever the user already
  // authored instead of silently clobbering it (see levelEditorRulesSeed.ts). The raw
  // set*State setters stay reserved for document loads/seeds.
  const authoredRulesRef = useRef<Set<AuthoredRulesField>>(new Set());
  // Set when a seed withheld authored fields: the clean baseline below must then anchor on
  // the seeded DOCUMENT's rules (via seededBaselineLevel), not the merged on-screen state,
  // so the user's authored delta reads dirty and flows into drafts/saves.
  const seedSkewRef = useRef<LevelRulesSeed | null>(null);
  const authorRulesField = <T,>(field: AuthoredRulesField, set: Dispatch<SetStateAction<T>>) =>
    (next: SetStateAction<T>): void => { authoredRulesRef.current.add(field); set(next); };
  const setVictory = authorRulesField('victory', setVictoryState);
  const setEvents = authorRulesField('events', setEventsState);
  const setLevelName = authorRulesField('name', setLevelNameState);
  const setClockEnabled = authorRulesField('clock', setClockEnabledState);
  const setClockInitialSeconds = authorRulesField('clock', setClockInitialSecondsState);
  const setClockIncrementSeconds = authorRulesField('clock', setClockIncrementSecondsState);
  const setTemplateChoice = authorRulesField('templateChoice', setTemplateChoiceState);
  const [quietDraftRestore] = useState(() => consumeNewBuildReloadIntent());
  const [statusLog, setStatusLog] = useState<StatusLogEntry[]>([]);
  const statusLogSeq = useRef(0);
  const [saving, setSaving] = useState(false);
  const [me, setMe] = useState<AuthUser | null>(null);
  const isAdmin = Boolean(me?.is_admin);
  const { ask, dialog: confirmDialog } = useConfirm();
  const didMountRouteSync = useRef(false);
  const documentRevisionRef = useRef<number | null>(null);
  const lastCloudSyncedSigRef = useRef<string | null>(null);
  const autosaveInFlightRef = useRef(false);
  const autosavePromiseRef = useRef<Promise<void> | null>(null);
  const autosaveTimerRef = useRef<number | null>(null);
  const documentConflictRef = useRef(false);
  const documentConflictKindRef = useRef<'revision' | 'baseline' | 'recovery' | null>(null);
  const preserveUnscopedRecoveryIntentRef = useRef(false);
  const offlineRecoveryLevelRef = useRef<Level | null>(null);
  const offlineRecoverySavedSigRef = useRef<string | null>(null);
  const rulesHistorySentinelRef = useRef(Boolean(window.history.state?.levelEditorRules));
  const eventsOpenRef = useRef(eventsOpen);
  eventsOpenRef.current = eventsOpen;
  const departureFlushSigRef = useRef<string | null>(null);
  const signInHandoffPendingRef = useRef(false);

  useEffect(() => {
    if (!didMountRouteSync.current) {
      didMountRouteSync.current = true;
      return;
    }
    if (!isLevelEditorRoutePath(window.location.pathname)) return;
    const nextHref = levelEditorHrefWithRouteState(window.location.href, {
      layer,
      brushKind: levelEditorRouteBrushKind(layer, brushKind),
      // A copied/reloaded Wall Art editor URL must keep the exact armed stamp. Losing this made a
      // Grand Gallery handoff silently reopen with the first catalog item (Tattered Banner).
      brush: brushKind === 'wallart' ? wallArtBrushId : null,
    });
    navigateApp(nextHref, { replace: true, scroll: false });
  }, [brushKind, layer, wallArtBrushId]);

  useEffect(() => {
    const syncFromRoute = (): void => {
      if (!isLevelEditorRoutePath(window.location.pathname)) return;
      const rawRouteState = readLevelEditorRouteState(window.location.search);
      const routeState = rawRouteState.brushKind === 'wall' && wallArt(rawRouteState.brush)
        ? { ...rawRouteState, layer: 'wallart' as const, brushKind: 'wallart' as const }
        : rawRouteState;
      const nextLayer = routeState.layer ?? defaultLevelEditorLayer();
      if (isLayerOptionDisabled(nextLayer)) return;
      setLayer(nextLayer);
      setTool(toolForLayer(nextLayer));
      setBrushKind(brushKindForRouteState(nextLayer, routeState.brushKind));
      if (routeState.brushKind === 'wallart') {
        setWallArtBrushId(wallArtIdOrDefault(routeState.brush));
      }
    };
    window.addEventListener('popstate', syncFromRoute);
    window.addEventListener(APP_NAVIGATION_EVENT, syncFromRoute);
    return () => {
      window.removeEventListener('popstate', syncFromRoute);
      window.removeEventListener(APP_NAVIGATION_EVENT, syncFromRoute);
    };
  }, []);

  // DEV-only preview of the in-game confirm dialog, so its look can be judged live without the
  // admin + official-target gating that guards the real Publish flow. Stripped from prod builds
  // (import.meta.env.DEV is false there). /level-editor?confirmPreview=1 → publish (primary),
  // ?confirmPreview=delete → a destructive prompt (danger).
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const flavor = new URLSearchParams(window.location.search).get('confirmPreview');
    if (!flavor) return;
    void (flavor === 'delete'
      ? ask({ title: 'Delete level?', message: <>Delete <b>Bridge Crossing</b>? This removes it from the workspace when you save.</>, confirmLabel: 'Delete', cancelLabel: 'Keep', tone: 'danger' })
      : ask({ title: 'Publish to all players?', message: 'This updates the official campaigns. Every player will receive these changes the next time they play.', confirmLabel: 'Publish', cancelLabel: 'Cancel' }));
  }, [ask]);

  const reportStatus = (message: string, tone: StatusTone = 'info', detail?: string): void => {
    statusLogSeq.current += 1;
    const at = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const entry: StatusLogEntry = { id: statusLogSeq.current, tone, message, detail, at };
    setStatusLog((prev) => [entry, ...prev].slice(0, STATUS_LOG_LIMIT));
  };
  // Apply a level document's rules-panel state. A LOAD is the user explicitly opening a
  // document: it replaces everything and resets authorship. A SEED is a mount-time load
  // resolving late (campaign hydrate / working-copy fetch): fields the user authored while it was
  // in flight are kept — both orderings then converge on "loaded document + the user's
  // edit" — and seedSkewRef records the seeded rules so the clean-baseline capture can
  // still anchor on the document.
  const applyLevelRules = (level: Level, mode: 'seed' | 'load'): void => {
    if (mode === 'load') authoredRulesRef.current.clear();
    const guarded = guardRulesSeed(levelRulesSeed(level), authoredRulesRef.current);
    const seed = guarded.seed;
    setObjective(seed.objective);
    setSurviveTurns(seed.surviveTurns);
    if (guarded.apply.templateChoice) setTemplateChoiceState(seed.objective);
    if (guarded.apply.clock) {
      setClockEnabledState(seed.clock.enabled);
      setClockInitialSecondsState(seed.clock.initialSeconds);
      setClockIncrementSecondsState(seed.clock.incrementSeconds);
    }
    if (guarded.apply.victory) setVictoryState(seed.victory);
    if (guarded.apply.events) setEventsState(seed.events);
    if (guarded.apply.name) setLevelNameState(seed.name);
    seedSkewRef.current = mode === 'seed' && guarded.skippedAuthored ? seed : null;
  };

  const applyLevelDocument = (level: Level, options: { editingId?: string; clean?: boolean; seed?: boolean } = {}): void => {
    const board = levelToEditorBoard(level);
    setBoardCols(board.cols);
    setBoardRows(board.rows);
    setBoardCells(board.cells);
    setBoardMacroTiles(validMacroTilesForBoard(board));
    setBoardUnits(board.units as Record<string, BoardUnitPlacement>);
    setBoardDoodads(board.doodads);
    setBoardProps(board.props);
    setBoardCover(board.cover);
    setBoardCoverTypes(board.coverTypes ?? {});
    setBoardFeatures(board.features);
    setBoardFences(board.fences ?? {});
    setBoardWalls(perimeterWalls(board.walls, board.cols, board.rows));
    setBoardWallArt(perimeterWallArt(board.wallArt, board.cols, board.rows));
    setFeatureCuts(board.featureCuts);
    setFeatureExits(board.featureExits);
    setBoardZoneEntries(zoneEntriesForBoard(board));
    setGeneratedRegions(board.generatedRegions ?? []);
    setActiveGeneratedRegionId(null);
    setRegionSelection(new Set());
    setPlayerFaction((board.playerFaction && (UNIT_PALETTES as readonly string[]).includes(board.playerFaction)) ? board.playerFaction as UnitPalette : null);
    setBoardFactionDirections(normalizeFactionDirections(board.factionDirections));
    setUndoStack([]);
    setRedoStack([]);
    applyLevelRules(level, options.seed ? 'seed' : 'load');
    setEditingId(options.editingId);
    if (options.clean !== false) {
      setSavedSig(normalizedLevelEditorSignature(level));
      needsBaselineRef.current = true;
    }
  };

  useEffect(() => {
    if (quietDraftRestore) return;
    if (!localDraft || (routeParams.levelId && !loadedBoard)) return;
    reportStatus('Restored editor draft.', 'success', 'This browser kept the latest working copy.');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Go full-bleed like Skirmish (is-immersive): #root owns the whole viewport so the
  // editor sits under only the persistent app-shell title bar, with no inset/gap.
  useEffect(() => {
    const shell = document.querySelector('.shell');
    shell?.classList.add('is-immersive');
    return () => shell?.classList.remove('is-immersive');
  }, []);

  const resolveAsset = (id: string): StudioAsset | undefined => leAllTiles.find((asset) => asset.id === id);
  // The current painted board as a single EditorBoard — the one shape both the transient
  // play-test URL and the level save serialize from, so they can never describe different boards.
  const currentEditorBoard = useMemo<EditorBoard>(
    () => ({ cols: boardCols, rows: boardRows, playerFaction, factionDirections: boardFactionDirections, cells: boardCells, macroTiles: boardMacroTiles, units: boardUnits, doodads: boardDoodads, props: boardProps, cover: boardCover, coverTypes: boardCoverTypes, features: boardFeatures, fences: boardFences, walls: boardWalls, wallArt: boardWallArt, featureCuts, featureExits, zoneEntries: boardZoneEntries, zones: boardZones, generatedRegions }),
    [boardCols, boardRows, playerFaction, boardFactionDirections, boardCells, boardMacroTiles, boardUnits, boardDoodads, boardProps, boardCover, boardCoverTypes, boardFeatures, boardFences, boardWalls, boardWallArt, featureCuts, featureExits, boardZoneEntries, boardZones, generatedRegions],
  );
  const currentEditorBoardRef = useRef(currentEditorBoard);
  useEffect(() => { currentEditorBoardRef.current = currentEditorBoard; }, [currentEditorBoard]);
  const applyEditorBoard = (board: EditorBoard): void => {
    setBoardCols(board.cols);
    setBoardRows(board.rows);
    setBoardCells(board.cells);
    setBoardMacroTiles(validMacroTilesForBoard(board));
    setBoardUnits(board.units as Record<string, BoardUnitPlacement>);
    setBoardDoodads(board.doodads);
    setBoardProps(board.props);
    setBoardCover(board.cover);
    setBoardCoverTypes(board.coverTypes ?? {});
    setBoardFeatures(board.features);
    setBoardFences(board.fences ?? {});
    setBoardWalls(perimeterWalls(board.walls, board.cols, board.rows));
    setBoardWallArt(perimeterWallArt(board.wallArt, board.cols, board.rows));
    setFeatureCuts(board.featureCuts);
    setFeatureExits(board.featureExits);
    setBoardZoneEntries(zoneEntriesForBoard(board));
    const nextGeneratedRegions = board.generatedRegions ?? [];
    setGeneratedRegions(nextGeneratedRegions);
    if (activeGeneratedRegionId && !nextGeneratedRegions.some((region) => region.id === activeGeneratedRegionId)) {
      setActiveGeneratedRegionId(null);
      setRegionSelection(new Set());
    }
    setPlayerFaction((board.playerFaction && (UNIT_PALETTES as readonly string[]).includes(board.playerFaction)) ? board.playerFaction as UnitPalette : null);
    setBoardFactionDirections(normalizeFactionDirections(board.factionDirections));
  };
  const commitEditorBoard = (next: EditorBoard, selection?: { x: number; y: number } | null): boolean => {
    const current = currentEditorBoardRef.current;
    const normalized = { ...next, macroTiles: validMacroTilesForBoard(next) };
    if (boardSignature(normalized) === boardSignature(current)) return false;
    setUndoStack((prev) => [...prev, cloneEditorBoard(current)].slice(-HISTORY_LIMIT));
    setRedoStack([]);
    currentEditorBoardRef.current = normalized;
    applyEditorBoard(normalized);
    if (selection !== undefined) setSelectedCell(selection);
    return true;
  };
  // In both directions the DEPARTING board must be snapshotted BEFORE queueing the stack
  // update: React runs the updater after this handler has already repointed
  // currentEditorBoardRef at the restored board, so reading the ref inside the updater
  // captures the wrong side of the swap (redo would "restore" the board already shown).
  const undoBoard = (): void => {
    const prev = undoStack[undoStack.length - 1];
    if (!prev) return;
    const departing = cloneEditorBoard(currentEditorBoardRef.current);
    setRedoStack((next) => [departing, ...next].slice(0, HISTORY_LIMIT));
    setUndoStack((next) => next.slice(0, -1));
    const restored = cloneEditorBoard(prev);
    currentEditorBoardRef.current = restored;
    applyEditorBoard(restored);
    setSelectedCell(null);
  };
  const redoBoard = (): void => {
    const next = redoStack[0];
    if (!next) return;
    const departing = cloneEditorBoard(currentEditorBoardRef.current);
    setUndoStack((prev) => [...prev, departing].slice(-HISTORY_LIMIT));
    setRedoStack((prev) => prev.slice(1));
    const restored = cloneEditorBoard(next);
    currentEditorBoardRef.current = restored;
    applyEditorBoard(restored);
    setSelectedCell(null);
  };
  const setPlayerFactionWithHistory = (faction: UnitPalette | null): void => {
    if (playerFaction === faction) return;
    const next = cloneEditorBoard(currentEditorBoardRef.current);
    next.playerFaction = faction;
    commitEditorBoard(next);
  };
  const brushAsset = resolveAsset(brushId) ?? leDefaultTile;
  const macroTileBrushAsset = macroTileBrushId ? macroTileAsset(macroTileBrushId) : undefined;
  const resolveUnitAsset = (id: string): UnitAsset | undefined => unitAssetById(id);
  const unitBrushAsset = resolveUnitAsset(unitBrushId) ?? leUnitAssets[0];
  const directionForFaction = (faction: UnitPalette): Direction => factionDefaultDirection(faction, boardFactionDirections);
  const setUnitFaction = (faction: UnitPalette): void => {
    setUnitFactionState(faction);
    const dir = directionForFaction(faction);
    setUnitBrushDirection(hasDirectionSprite(unitBrushAsset, dir) ? dir : 'south');
  };
  const setFactionDefaultDirection = (faction: UnitPalette, direction: Direction): void => {
    const next = cloneEditorBoard(currentEditorBoardRef.current);
    const factionDirections = normalizeFactionDirections(next.factionDirections);
    if (direction === DEFAULT_FACTION_DIRECTIONS[faction]) delete factionDirections[faction];
    else factionDirections[faction] = direction;
    next.factionDirections = factionDirections;
    commitEditorBoard(next);
    if (unitFaction === faction) setUnitBrushDirection(hasDirectionSprite(unitBrushAsset, direction) ? direction : 'south');
  };
  // Facing sets the brush direction AND rotates the unit selected on the board (in place).
  const setUnitFacing = (dir: Direction): void => {
    setUnitBrushDirection(dir);
    const key = selectedCell ? `${selectedCell.x},${selectedCell.y}` : null;
    if (!key || !boardUnits[key] || boardUnits[key].direction === dir) return;
    const next = cloneEditorBoard(currentEditorBoardRef.current);
    next.units[key] = { ...next.units[key], direction: dir };
    commitEditorBoard(next);
  };
  // Center hub: spin one step clockwise (rookDirections is N→NE→E…→NW), skipping directions this unit lacks.
  const rotateFacingCw = (): void => {
    const n = rookDirections.length;
    const start = rookDirections.indexOf(unitBrushDirection);
    for (let step = 1; step <= n; step += 1) {
      const next = rookDirections[(start + step) % n];
      if (hasDirectionSprite(unitBrushAsset, next)) { setUnitFacing(next); return; }
    }
  };
  const doodadAssets = currentDoodadAssets();
  const resolveDoodadAsset = (id: string): DoodadAsset | undefined => doodadAssets.find((doodad) => doodad.id === id) ?? doodadAsset(id);
  const doodadBrushAsset = resolveDoodadAsset(doodadBrushId) ?? doodadAssets[0] ?? DOODAD_ASSETS[0];
  const coverBrushAsset = groundCoverAsset(coverBrushType);
  // HARD terrain gate (mirrors the Studio): a doodad only lands on a tile of its home terrain.
  const doodadFitsTile = (doodad: DoodadAsset, tileId: string | undefined): boolean => {
    const terrain = tileId ? leFamilyOfTile(tileId)?.id : undefined;
    return terrain !== undefined && doodad.terrains.includes(terrain);
  };
  const resolvePropDef = (id: string): PropDef | undefined => propDef(id);
  const propBrushDef = resolvePropDef(propBrushId) ?? PROP_DEFS[0];
  // Generalised doodadFitsTile for a W×H footprint: EVERY footprint cell must be in-bounds AND
  // its tile's family must be a terrain the prop allows. (Overlap with units/other props is a
  // separate check at paint time — fit is purely about the terrain bed.)
  const propFitsBoard = (def: PropDef, ax: number, ay: number): boolean => {
    if (ax < 0 || ay < 0 || ax + def.w > boardCols || ay + def.h > boardRows) return false;
    return propCells(ax, ay, def).every((c) => {
      const fam = boardCells[`${c.x},${c.y}`] ? leFamilyOfTile(boardCells[`${c.x},${c.y}`])?.id : undefined;
      return fam !== undefined && def.terrains.includes(fam);
    });
  };
  // The footprint cells of every already-placed prop (skipping unknown ids), so a new prop can't
  // overlap an existing one. Recomputed per call — cheap for a hand-authored board.
  const occupiedPropCells = (exceptAnchorKey?: string): Set<string> => {
    const set = new Set<string>();
    for (const [key, placement] of Object.entries(boardProps)) {
      if (key === exceptAnchorKey) continue;
      const def = resolvePropDef(placement.propId);
      if (!def) continue;
      const [ax, ay] = key.split(',').map(Number);
      for (const c of propCells(ax, ay, def)) set.add(`${c.x},${c.y}`);
    }
    return set;
  };
  // A prop places at (ax,ay) iff it FITS (bounds + terrain) AND no footprint cell collides with a
  // placed unit or another prop's footprint. Used for the paint gate AND the hover preview styling.
  const canPlaceProp = (def: PropDef, ax: number, ay: number, exceptAnchorKey?: string): boolean => {
    if (!propFitsBoard(def, ax, ay)) return false;
    const occupied = occupiedPropCells(exceptAnchorKey);
    return propCells(ax, ay, def).every((c) => {
      const key = `${c.x},${c.y}`;
      return !boardUnits[key] && !occupied.has(key);
    });
  };

  // Derive each cell's connection mask from the painted set, live. Connectivity is PER KIND:
  // a road's mask is resolved against road neighbours only, a river's against rivers only, so
  // a road and a river crossing adjacent cells never knit together. Cheap (one pass) and the
  // painted set is the source of truth, so the ribbon re-knits whenever a cell changes.
  const featureOverlays = useMemo(() => {
    const isSevered = (edge: string): boolean => featureCuts[edge] === true;
    const isExit = (edge: string): boolean => featureExits[edge] === true;
    return resolveFeatureOverlays(boardFeatures, isSevered, isExit);
  }, [boardFeatures, featureCuts, featureExits]);

  const paintCell = (x: number, y: number): void => {
    const key = `${x},${y}`;
    const next = cloneEditorBoard(currentEditorBoardRef.current);
    if (featureKind) {
      const material = featureBrushMaterial[featureKind];
      next.features[key] = { kind: featureKind, material };
      commitEditorBoard(next);
      return;
    }
    // A unit/doodad/cover must not land on a placed prop's footprint: for a BLOCKING prop the
    // collision bridge gives an authored unit priority and DROPS that cell's collider
    // (game/setup.ts), silently un-blocking the prop; and any sprite there would overlap the prop.
    // Refuse so the editor matches in-game collision. (Props ↔ features don't gate each other.)
    if ((brushKind === 'unit' || brushKind === 'doodad' || brushKind === 'cover') && occupiedPropCells().has(key)) return;
    if (brushKind === 'unit') {
      next.units[key] = { unitId: unitBrushAsset.id, direction: unitBrushDirection, faction: unitFaction };
      commitEditorBoard(next);
      return;
    }
    if (brushKind === 'doodad') {
      // A doodad only lands on a tile of its home terrain; painting elsewhere is a no-op.
      if (!doodadFitsTile(doodadBrushAsset, boardCells[key])) return;
      next.doodads[key] = { doodadId: doodadBrushAsset.id };
      commitEditorBoard(next);
      return;
    }
    if (brushKind === 'prop') {
      // A multi-cell prop anchors at the clicked cell and must FIT (bounds + terrain) with no
      // footprint cell overlapping a unit or another prop. Anything else is a no-op.
      if (!canPlaceProp(propBrushDef, x, y)) return;
      next.props[key] = { propId: propBrushDef.id };
      commitEditorBoard(next);
      return;
    }
    if (brushKind === 'cover') {
      // Ground cover paints the selected cover set onto any existing tile. If it differs from
      // the tile terrain, store the decoupled override in the existing coverTypes channel.
      const tileId = boardCells[key];
      if (!tileId || !groundCoverSet(coverBrushType)) return;
      const terrain = leFamilyOfTile(tileId)?.id;
      next.cover[key] = coverBrushDensity;
      if (coverBrushType === terrain) delete next.coverTypes?.[key];
      else next.coverTypes = { ...(next.coverTypes ?? {}), [key]: coverBrushType };
      commitEditorBoard(next);
      return;
    }
    if (brushKind === 'zone') {
      const entries = zoneEntriesForBoard(next);
      const target = entries[selectedZoneIndex];
      if (!target || target.tiles.includes(key)) return;
      const updated = entries.map((entry, index) => index === selectedZoneIndex ? { ...entry, tiles: [...entry.tiles, key] } : entry);
      commitEditorBoard(withZoneEntries(next, updated));
      return;
    }
    if (macroTileBrushAsset) {
      const placement = { assetId: macroTileBrushAsset.id, x, y };
      const footprint = macroTileCellIndices(placement, boardCols, boardRows);
      if (footprint.length !== macroTileBrushAsset.columns * macroTileBrushAsset.rows) return;
      const footprintSet = new Set(footprint);
      next.macroTiles = (next.macroTiles ?? []).filter((existing) =>
        !macroTileCellIndices(existing, boardCols, boardRows).some((index) => footprintSet.has(index)),
      );
      const familyTiles = leFamilyAssets[macroTileBrushAsset.family];
      if (!familyTiles?.length) return;
      for (const index of footprint) {
        const cellKey = `${index % boardCols},${Math.floor(index / boardCols)}`;
        const existingFamily = leFamilyOfTile(next.cells[cellKey] ?? '')?.id;
        if (existingFamily !== macroTileBrushAsset.family) {
          next.cells[cellKey] = familyTiles[(index + x * 17 + y * 29) % familyTiles.length].id;
        }
      }
      next.macroTiles.push(placement);
      commitEditorBoard(next, { x, y });
      return;
    }
    next.macroTiles = breakMacroTilesAtCell(next.macroTiles, x, y);
    next.cells[key] = brushAsset.id;
    commitEditorBoard(next);
  };
  const eraseCell = (x: number, y: number): void => {
    const key = `${x},${y}`;
    const next = cloneEditorBoard(currentEditorBoardRef.current);
    if (featureKind) {
      delete next.features[key];
      for (const edge of Object.keys(next.featureCuts)) if (edge.split('|').includes(key)) delete next.featureCuts[edge];
      for (const edge of Object.keys(next.featureExits)) if (edge.split('|').includes(key)) delete next.featureExits[edge];
      commitEditorBoard(next);
      return;
    }
    if (brushKind === 'unit') { delete next.units[key]; commitEditorBoard(next); return; }
    if (brushKind === 'doodad') { delete next.doodads[key]; commitEditorBoard(next); return; }
    if (brushKind === 'prop') {
      // Erase the prop whose FOOTPRINT contains the clicked cell — not only an exact anchor hit,
      // so clicking anywhere on a 2×2 removes it. Reverse-scan so the last-placed (top) prop wins
      // when footprints somehow overlap (they can't via the paint gate, but be defensive).
      const entries = Object.entries(next.props);
      for (let i = entries.length - 1; i >= 0; i -= 1) {
        const [anchorKey, placement] = entries[i];
        const def = resolvePropDef(placement.propId);
        if (!def) continue;
        const [ax, ay] = anchorKey.split(',').map(Number);
        if (propCells(ax, ay, def).some((c) => c.x === x && c.y === y)) {
          delete next.props[anchorKey];
          commitEditorBoard(next);
          return;
        }
      }
      return;
    }
    if (brushKind === 'cover') { delete next.cover[key]; if (next.coverTypes) delete next.coverTypes[key]; commitEditorBoard(next); return; }
    if (brushKind === 'zone') {
      const entries = zoneEntriesForBoard(next);
      const target = entries[selectedZoneIndex];
      if (!target?.tiles.includes(key)) return;
      const updated = entries.map((entry, index) => index === selectedZoneIndex ? { ...entry, tiles: entry.tiles.filter((tile) => tile !== key) } : entry);
      commitEditorBoard(withZoneEntries(next, updated));
      return;
    }
    next.macroTiles = breakMacroTilesAtCell(next.macroTiles, x, y);
    delete next.cells[key];
    commitEditorBoard(next);
  };
  // Edge-fence paint/erase — the fence tool targets the shared edge under the cursor (roadEdgeKey),
  // not a cell. Add stamps the current brush material; erase drops the edge. Both ride undo/redo.
  const paintFenceEdge = (edgeKey: string): void => {
    const next = cloneEditorBoard(currentEditorBoardRef.current);
    next.fences = { ...(next.fences ?? {}), [edgeKey]: fenceBrushMaterial };
    commitEditorBoard(next);
  };
  const eraseFenceEdge = (edgeKey: string): void => {
    const current = currentEditorBoardRef.current.fences ?? {};
    if (!(edgeKey in current)) return;
    const next = cloneEditorBoard(currentEditorBoardRef.current);
    const fences = { ...(next.fences ?? {}) };
    delete fences[edgeKey];
    next.fences = fences;
    commitEditorBoard(next);
  };
  const wallEdgeCanRender = (edgeKey: string): boolean =>
    isNorthWestBoundaryWallEdge(edgeKey, { cols: boardCols, rows: boardRows });
  const paintWallEdge = (edgeKey: string): void => {
    if (!wallEdgeCanRender(edgeKey)) return;
    const next = cloneEditorBoard(currentEditorBoardRef.current);
    const walls = { ...(next.walls ?? {}) };
    walls[edgeKey] = wallBrushMaterial;
    next.walls = walls;
    commitEditorBoard(next);
  };
  const eraseWallEdge = (edgeKey: string): void => {
    const current = currentEditorBoardRef.current.walls ?? {};
    if (!(edgeKey in current)) return;
    const next = cloneEditorBoard(currentEditorBoardRef.current);
    const walls = { ...(next.walls ?? {}) };
    delete walls[edgeKey];
    next.walls = walls;
    const currentArt = next.wallArt ?? {};
    const hit = wallArtAtEdge(edgeKey, currentArt, { cols: boardCols, rows: boardRows });
    if (hit) {
      const wallArtPlacements = { ...currentArt };
      delete wallArtPlacements[hit.anchorEdge];
      next.wallArt = wallArtPlacements;
    }
    commitEditorBoard(next);
  };
  const paintWallArtEdge = (edgeKey: string): void => {
    const art = wallArt(wallArtBrushId);
    if (!wallEdgeCanRender(edgeKey) || !art) {
      setWallArtPlacementFeedback({ tone: 'blocked', message: 'Wall art can only be placed on the north or west perimeter wall.' });
      return;
    }
    const bounds = { cols: boardCols, rows: boardRows };
    const current = currentEditorBoardRef.current;
    const placementSpan = wallArtPlacementSpanAtEdge(
      edgeKey,
      art.id,
      bounds,
      (spanEdge) => Boolean(current.walls?.[spanEdge]),
    );
    if (!placementSpan) {
      setWallArtPlacementFeedback({
        tone: 'blocked',
        message: `${art.label} needs ${art.span} consecutive supporting wall${art.span === 1 ? '' : 's'}. Add the missing wall${art.span === 1 ? '' : 's'}, then click any wall face in the run.`,
      });
      return;
    }
    const next = cloneEditorBoard(current);
    const wallArtPlacements = { ...(next.wallArt ?? {}) };
    for (const edge of placementSpan.edges) {
      const existing = wallArtAtEdge(edge, wallArtPlacements, bounds);
      if (existing) delete wallArtPlacements[existing.anchorEdge];
    }
    wallArtPlacements[placementSpan.anchorEdge] = art.id;
    next.wallArt = wallArtPlacements;
    commitEditorBoard(next);
    setWallArtPlacementFeedback({
      tone: 'ready',
      message: `Placed ${art.label} across ${art.span} wall${art.span === 1 ? '' : 's'}.`,
    });
  };
  const eraseWallArtEdge = (edgeKey: string): void => {
    const bounds = { cols: boardCols, rows: boardRows };
    const current = currentEditorBoardRef.current.wallArt ?? {};
    const hit = wallArtAtEdge(edgeKey, current, bounds);
    if (!hit) {
      setWallArtPlacementFeedback({ tone: 'blocked', message: 'There is no wall art on that wall segment.' });
      return;
    }
    const next = cloneEditorBoard(currentEditorBoardRef.current);
    const wallArtPlacements = { ...(next.wallArt ?? {}) };
    delete wallArtPlacements[hit.anchorEdge];
    next.wallArt = wallArtPlacements;
    commitEditorBoard(next);
    setWallArtPlacementFeedback({ tone: 'ready', message: `Removed ${wallArtLabel(hit.artId)}.` });
  };
  const clearBoard = (): void => {
    commitEditorBoard({ ...cloneEditorBoard(currentEditorBoardRef.current), cells: {}, macroTiles: [], units: {}, doodads: {}, props: {}, cover: {}, coverTypes: {}, features: {}, fences: {}, walls: {}, wallArt: {}, featureCuts: {}, featureExits: {}, zoneEntries: [], zones: {}, generatedRegions: [] }, null);
    setActiveGeneratedRegionId(null);
    setRegionSelection(new Set());
  };
  const clearActiveLayer = (): void => {
    const next = cloneEditorBoard(currentEditorBoardRef.current);
    if (brushKind === 'tile') { next.cells = {}; next.macroTiles = []; }
    else if (brushKind === 'unit') next.units = {};
    else if (brushKind === 'doodad') next.doodads = {};
    else if (brushKind === 'prop') next.props = {};
    else if (brushKind === 'cover') { next.cover = {}; next.coverTypes = {}; }
    else if (brushKind === 'zone') {
      const entries = zoneEntriesForBoard(next);
      if (entries[selectedZoneIndex]) {
        const updated = entries.map((entry, index) => index === selectedZoneIndex ? { ...entry, tiles: [] } : entry);
        Object.assign(next, withZoneEntries(next, updated));
      }
    }
    else if (brushKind === 'fence') next.fences = {};
    else if (brushKind === 'wall') { next.walls = {}; next.wallArt = {}; }
    else if (brushKind === 'wallart') next.wallArt = {};
    else if (featureKind) {
      const cleared = new Set<string>();
      for (const [key, feature] of Object.entries(next.features)) {
        if (feature.kind !== featureKind) continue;
        cleared.add(key);
        delete next.features[key];
      }
      for (const edge of Object.keys(next.featureCuts)) if (edge.split('|').some((key) => cleared.has(key))) delete next.featureCuts[edge];
      for (const edge of Object.keys(next.featureExits)) if (edge.split('|').some((key) => cleared.has(key))) delete next.featureExits[edge];
    }
    commitEditorBoard(next, null);
  };
  const fillBoard = (mode: 'empty' | 'all'): void => {
    const next = cloneEditorBoard(currentEditorBoardRef.current);
    if (mode === 'all') { next.cells = {}; next.macroTiles = []; }
      for (let y = 0; y < boardRows; y += 1) for (let x = 0; x < boardCols; x += 1) {
        const key = `${x},${y}`;
        if (mode === 'all' || !(key in next.cells)) {
          if (mode === 'empty') next.macroTiles = breakMacroTilesAtCell(next.macroTiles, x, y);
          next.cells[key] = brushAsset.id;
        }
      }
    commitEditorBoard(next);
  };
  const randomizeBoardTiles = (): void => {
    const seed = (Date.now() ^ (boardCols * 73856093) ^ (boardRows * 19349663)) >>> 0;
    const generated = generateSocketBoard({
      assets: leTileAssets,
      seed,
      columns: boardCols,
      rows: boardRows,
      familyAssets: leFamilyAssets,
    });
    const next = cloneEditorBoard(currentEditorBoardRef.current);
    next.cells = Object.fromEntries(generated.cells.map((cell) => [`${cell.x},${cell.y}`, cell.asset?.id ?? leDefaultTile.id]));
    next.macroTiles = [];
    commitEditorBoard(next, null);
  };
  const activeGeneratedRegion = useMemo(
    () => generatedRegions.find((region) => region.id === activeGeneratedRegionId) ?? null,
    [activeGeneratedRegionId, generatedRegions],
  );
  const cellWithinBoard = (key: string, cols = boardCols, rows = boardRows): boolean => {
    const [x, y] = key.split(',').map(Number);
    return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < cols && y < rows;
  };
  const hydrateGeneratedRegionSections = (sections: BoardGeneratedRegionSection[], legacyDensity?: number): ScatterRow[] => {
    const existingSections = sections.length > 0;
    const source = sections.length ? sections : scatterRowsToGeneratedSections(defaultScatterRows());
    return source.map((section) => ({
      id: (scatterIdRef.current += 1),
      terrain: section.terrain,
      share: section.share,
      locked: Boolean(section.locked),
      covers: (section.covers ?? []).flatMap((cover) => (
        isGroundCoverId(cover.type)
          ? [{ id: (coverIdRef.current += 1), type: cover.type, expanded: false, knobs: { ...cover.knobs } }]
          : []
      )),
      macroTileDensity: section.macroTileDensity ?? legacyDensity ?? DEFAULT_MACRO_TILE_DENSITY,
      macroTileBreakup: section.macroTileBreakup ?? (existingSections ? 0 : DEFAULT_MACRO_TILE_BREAKUP),
    }));
  };
  const makeGeneratedRegionUnit = (
    cells: string[],
    regions: readonly BoardGeneratedRegion[],
    existing?: BoardGeneratedRegion,
  ): BoardGeneratedRegion => ({
    id: existing?.id ?? `region-${Date.now().toString(36)}-${(generatedRegionIdRef.current += 1)}`,
    name: existing?.name ?? nextGeneratedRegionName(regions),
    cells,
    sections: scatterRowsToGeneratedSections(scatterSections),
    buffer: scatterBuffer,
    wiggle: scatterWiggle,
  });
  const selectGeneratedRegionUnit = (id: string): void => {
    if (!id) {
      setActiveGeneratedRegionId(null);
      setRegionSelection(new Set());
      return;
    }
    const region = generatedRegions.find((r) => r.id === id);
    if (!region) return;
    const cells = sortRegionCells(region.cells.filter((key) => cellWithinBoard(key)));
    setActiveGeneratedRegionId(region.id);
    setRegionSelection(new Set(cells));
    setScatterBuffer(region.buffer);
    setScatterWiggle(region.wiggle);
    setScatterSections(normalizeToTotal(hydrateGeneratedRegionSections(region.sections, region.macroTileDensity), 100 - region.buffer));
  };
  const removeGeneratedRegionUnit = (id: string): void => {
    const next = cloneEditorBoard(currentEditorBoardRef.current);
    const remaining = (next.generatedRegions ?? []).filter((region) => region.id !== id);
    if (remaining.length === (next.generatedRegions ?? []).length) return;
    next.generatedRegions = remaining;
    commitEditorBoard(next);
    if (activeGeneratedRegionId === id) {
      setActiveGeneratedRegionId(null);
      setRegionSelection(new Set());
    }
  };
  // "Select region" = click an already-drawn clump. From the clicked cell, flood-fill every
  // orthogonally-connected cell of the SAME terrain family (empty matches empty), so one click
  // grabs exactly that patch and "knows how big it is". There is no rectangle marquee — to scope a
  // rectangle, paint the tiles first, then click the patch. Bounded to the board; cheap for a
  // hand-authored board.
  const regionSelectPatch = (x: number, y: number): void => {
    const familyAt = (cx: number, cy: number): string => {
      const id = boardCells[`${cx},${cy}`];
      return id ? (leFamilyOfTile(id)?.id ?? '?') : '';
    };
    const target = familyAt(x, y);
    const found = new Set<string>();
    const stack: Array<[number, number]> = [[x, y]];
    while (stack.length > 0) {
      const [cx, cy] = stack.pop()!;
      if (cx < 0 || cy < 0 || cx >= boardCols || cy >= boardRows) continue;
      const key = `${cx},${cy}`;
      if (found.has(key) || familyAt(cx, cy) !== target) continue;
      found.add(key);
      stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
    }
    const cells = sortRegionCells(found);
    const existing = generatedRegions.find((region) => regionCellsEqual(sortRegionCells(region.cells), cells));
    if (existing) {
      selectGeneratedRegionUnit(existing.id);
      setTool('select');
      return;
    }
    const next = cloneEditorBoard(currentEditorBoardRef.current);
    const regions = next.generatedRegions ?? [];
    const region = makeGeneratedRegionUnit(cells, regions);
    next.generatedRegions = [...regions, region];
    commitEditorBoard(next);
    setActiveGeneratedRegionId(region.id);
    setRegionSelection(new Set(cells));
    setTool('select');
  };
  const clearRegion = (): void => {
    setActiveGeneratedRegionId(null);
    setRegionSelection(new Set());
  };
  // How many cells a share applies to right now: the marquee selection if any, else the whole board.
  const scopeCells = regionSelection.size > 0 ? regionSelection.size : boardCols * boardRows;
  const setSectionShare = (id: number, value: number): void => setScatterSections((prev) => rebalanceShares(prev, id, value, scatterBuffer));
  const setSectionTerrain = (id: number, terrain: TileFamilyId): void => setScatterSections((prev) => prev.map((s) => (s.id === id ? { ...s, terrain } : s)));
  const toggleSectionLock = (id: number): void => setScatterSections((prev) => prev.map((s) => (s.id === id ? { ...s, locked: !s.locked } : s)));
  const addSection = (): void => setScatterSections((prev) => {
    const total = 100 - scatterBuffer;
    const share = prev.length > 0 ? Math.max(1, Math.round(total / (prev.length + 1))) : total;
    const used = new Set(prev.map((s) => s.terrain));
    const terrain = LE_SCATTER_FAMILIES.find((f) => !used.has(f.id))?.id ?? 'grass';
    const id = (scatterIdRef.current += 1);
    const dct = defaultCoverType(terrain);
    const covers = dct ? [{ id: (coverIdRef.current += 1), type: dct, expanded: false, knobs: { ...DEFAULT_COVER } }] : [];
    return [...normalizeToTotal(prev, Math.max(0, total - share)), {
      id,
      terrain,
      share,
      locked: false,
      covers,
      macroTileDensity: DEFAULT_MACRO_TILE_DENSITY,
      macroTileBreakup: DEFAULT_MACRO_TILE_BREAKUP,
    }];
  });
  const removeSection = (id: number): void =>
    setScatterSections((prev) => (prev.length <= 1 ? prev : normalizeToTotal(prev.filter((s) => s.id !== id), 100 - scatterBuffer)));
  const setScatterBufferBalanced = (value: number): void => {
    const buffer = Math.max(0, Math.min(60, Math.round(value)));
    setScatterBuffer(buffer);
    setScatterSections((prev) => normalizeToTotal(prev, 100 - buffer));
  };
  const addCover = (sectionId: number): void =>
    setScatterSections((prev) => prev.map((s) => {
      if (s.id !== sectionId) return s;
      const used = new Set(s.covers.map((c) => c.type));
      const type = LE_COVER_TYPES.find((c) => !used.has(c.id))?.id ?? LE_COVER_TYPES[0].id;
      return { ...s, covers: [...s.covers, { id: (coverIdRef.current += 1), type, expanded: true, knobs: { ...DEFAULT_COVER } }] };
    }));
  const toggleCoverEntryExpand = (sectionId: number, coverId: number): void =>
    setScatterSections((prev) => prev.map((s) => (s.id === sectionId ? { ...s, covers: s.covers.map((c) => (c.id === coverId ? { ...c, expanded: !c.expanded } : c)) } : s)));
  const removeCover = (sectionId: number, coverId: number): void =>
    setScatterSections((prev) => prev.map((s) => (s.id === sectionId ? { ...s, covers: s.covers.filter((c) => c.id !== coverId) } : s)));
  const setCoverType = (sectionId: number, coverId: number, type: GroundCoverId): void =>
    setScatterSections((prev) => prev.map((s) => (s.id === sectionId ? { ...s, covers: s.covers.map((c) => (c.id === coverId ? { ...c, type } : c)) } : s)));
  const setCoverKnob = (sectionId: number, coverId: number, knob: keyof CoverKnobs, value: number): void =>
    setScatterSections((prev) => prev.map((s) => (s.id === sectionId ? { ...s, covers: s.covers.map((c) => (c.id === coverId ? { ...c, knobs: { ...c.knobs, [knob]: Math.max(0, Math.min(1, value)) } } : c)) } : s)));
  const setSectionMacroTileDensity = (sectionId: number, value: number): void =>
    setScatterSections((prev) => prev.map((section) => section.id === sectionId
      ? { ...section, macroTileDensity: Math.max(0, Math.min(1, value)) }
      : section));
  const setSectionMacroTileBreakup = (sectionId: number, value: number): void =>
    setScatterSections((prev) => prev.map((section) => section.id === sectionId
      ? { ...section, macroTileBreakup: Math.max(0, Math.min(1, value)) }
      : section));
  // Fill the selected region (or the whole board when nothing is selected) by dividing the area
  // among the terrain regions by share, then autotile through the socket solver — the same solve
  // path Randomize uses. A region-scoped generate leaves every out-of-region cell untouched.
  const generateScatter = (): void => {
    const sections = scatterSections.map((s) => ({ terrain: s.terrain, share: s.share }));
    if (sections.length === 0) return;
    const selectedRegionCells = sortRegionCells([...regionSelection].filter((key) => cellWithinBoard(key)));
    const seed = Date.now() >>> 0; // a fresh layout each press; the committed board is the artifact
    const cols = boardCols;
    const rows = boardRows;
    const baseMap: (TileFamilyId | undefined)[] = Array.from({ length: cols * rows }, (_, i) => {
      const id = boardCells[`${i % cols},${(i / cols) | 0}`];
      return id ? (leFamilyOfTile(id)?.id as TileFamilyId | undefined) : undefined;
    });
    const region = selectedRegionCells.length > 0
      ? new Set(
          selectedRegionCells
            .map((key) => { const [x, y] = key.split(',').map(Number); return y * cols + x; })
            .filter((i) => i >= 0 && i < cols * rows),
        )
      : undefined;
    const { terrain: terrainMap, sectionOf } = scatterTerrainDetailed({
      columns: cols,
      rows,
      sections,
      randomnessBuffer: scatterBuffer,
      wiggle: scatterWiggle,
      seed,
      region,
      baseMap,
    });
    const solved = solveSocketBoard({ assets: leTileAssets, terrainMap, seed, columns: cols, rows, familyAssets: leFamilyAssets });
    const next = cloneEditorBoard(currentEditorBoardRef.current);
    const generatedMacroTiles = generateMacroTiles({
      terrainMap,
      columns: cols,
      rows,
      seed,
      sectionOf,
      densityBySection: scatterSections.map((section) => section.macroTileDensity),
      breakupBySection: scatterSections.map((section) => section.macroTileBreakup),
      region,
    });
    const rewrittenCells = region ?? new Set(Array.from({ length: cols * rows }, (_, index) => index));
    const preservedMacroTiles = (next.macroTiles ?? []).filter((placement) => {
      const cells = macroTileCellIndices(placement, cols, rows);
      if (cells.length > 0) return !cells.some((index) => rewrittenCells.has(index));
      return !rewrittenCells.has(placement.y * cols + placement.x);
    });
    next.macroTiles = [...preservedMacroTiles, ...generatedMacroTiles];
    let savedRegion: BoardGeneratedRegion | null = null;
    if (selectedRegionCells.length > 0) {
      const regions = next.generatedRegions ?? [];
      const existing = activeGeneratedRegionId
        ? regions.find((r) => r.id === activeGeneratedRegionId)
        : regions.find((r) => regionCellsEqual(sortRegionCells(r.cells), selectedRegionCells));
      savedRegion = makeGeneratedRegionUnit(selectedRegionCells, regions, existing);
      next.generatedRegions = existing
        ? regions.map((r) => (r.id === existing.id ? savedRegion! : r))
        : [...regions, savedRegion];
    }
    // Each generated cell also gets its region's ground cover rolled in. A region holds a LIST of
    // cover entries (each a set decoupled from terrain, with its own Coverage/Density knobs that
    // blend a default with a value-noise field scaled by their randomness knob). Per cell the first
    // listed entry whose Coverage roll hits wins, so several entries read as a MIX across the region.
    // The chosen set is stored per cell so it renders regardless of terrain.
    if (!next.coverTypes) next.coverTypes = {};
    const coverRng = createRng((seed ^ 0x9e3779b9) >>> 0);
    const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
    for (const cell of solved.cells) {
      const idx = cell.y * cols + cell.x;
      if (region && !region.has(idx)) continue; // scoped: only rewrite region cells
      const key = `${cell.x},${cell.y}`;
      next.cells[key] = cell.asset?.id ?? leDefaultTile.id;
      const s = sectionOf[idx];
      const covers = s >= 0 ? scatterSections[s].covers : [];
      let placed = false;
      for (const c of covers) {
        const coverage = clamp01(c.knobs.amount + (coverNoise(cell.x, cell.y, (seed ^ c.id) >>> 0) - 0.5) * 2 * c.knobs.amountRandom);
        if (coverRng.next() >= coverage) continue;
        const filledChance = clamp01(c.knobs.density + (coverNoise(cell.x, cell.y, (seed ^ 0x2545f491 ^ c.id) >>> 0) - 0.5) * 2 * c.knobs.densityRandom);
        next.cover[key] = coverRng.next() < filledChance ? 'filled' : 'sparse';
        next.coverTypes[key] = c.type;
        placed = true;
        break;
      }
      if (!placed) { delete next.cover[key]; delete next.coverTypes[key]; }
    }
    commitEditorBoard(next, null);
    if (savedRegion) {
      setActiveGeneratedRegionId(savedRegion.id);
      setRegionSelection(new Set(savedRegion.cells));
    }
  };
  // The rules metadata the editor authors, packaged for editorBoardToLevel. Objective is always
  // written; optional fields are sent only when their editor surfaces define them. Setup spawning is
  // authored through events, with legacy placement/roster read only as an import/playback fallback.
  // The factions offered in each condition's "IF <faction>" dropdown — one per side, labelled by the
  // board's assigned palette (ADR-0064). Maps to the engine's player/enemy side; true multi-faction
  // (two distinct enemies) is future work.
  const victoryFactions = useMemo((): FactionOption[] => {
    const label = (p: string): string => (isUnitPalette(p) ? LE_FACTION_LABELS[p] : p);
    const enemyPalette = Object.values(boardUnits).map((u) => u.faction).find((f) => f && f !== playerFaction);
    return [
      { side: 'player', label: playerFaction ? label(playerFaction) : 'You (Player)' },
      { side: 'enemy', label: enemyPalette ? label(enemyPalette) : 'Enemy' },
    ];
  }, [playerFaction, boardUnits]);
  // A level stores `victory` only when the lists DIVERGE from the objective preset — else the
  // preset drives it (keeps preset bodies clean + out of the dirty check, and preserves
  // capture-king's runtime kingSide direction-awareness for an untouched King Assault). ADR-0064.
  const victoryForSave = useMemo(
    () => (rulesEqual(victory, victoryRulesForObjective(objective, { surviveTurns })) ? undefined : victory),
    [victory, objective, surviveTurns],
  );
  const eventsForSave = useMemo(() => (events.length ? events : undefined), [events]);
  const modeMeta = useMemo(() => ({
    objective,
    surviveTurns: objective === 'survive' ? surviveTurns : undefined,
    timeControl: clockEnabled ? { initialSeconds: clockInitialSeconds, incrementSeconds: clockIncrementSeconds } : undefined,
    victory: victoryForSave,
    events: eventsForSave,
  }), [objective, surviveTurns, clockEnabled, clockInitialSeconds, clockIncrementSeconds, victoryForSave, eventsForSave]);
  // The live candidate Level — the exact document a Save would persist — recomputed from the board
  // + mode meta. Both the playability gate and the Save serialize from THIS, so what the violation
  // list judges is precisely what would be written.
  const candidateMetadataSource = editorDocument?.level ?? initialTargetLevel;
  const candidateLevel = useMemo(
    () => editorBoardToLevel(currentEditorBoard, {
      id: editingId ?? 'draft',
      name: levelNameForSave,
      ...modeMeta,
      notes: candidateMetadataSource?.notes,
      difficulty: candidateMetadataSource?.difficulty,
      economy: candidateMetadataSource?.economy,
      theme: candidateMetadataSource?.theme,
      previousTerrain: candidateMetadataSource?.layers.terrain,
    }),
    [candidateMetadataSource, currentEditorBoard, editingId, levelNameForSave, modeMeta],
  );
  // Live playability (ADR-0050): the plain-language violation list the panel shows, and the gate on
  // Save. Recomputed from the candidate Level so it always matches what would persist. Pure.
  const playability = useMemo(() => validatePlayability(candidateLevel), [candidateLevel]);
  const previewPlayerFaction = useMemo<UnitPalette | null>(() => {
    if (playerFaction) return playerFaction;
    for (let y = 0; y < boardRows; y += 1) {
      for (let x = 0; x < boardCols; x += 1) {
        const faction = boardUnits[`${x},${y}`]?.faction;
        if (isUnitPalette(faction)) return faction;
      }
    }
    return null;
  }, [boardCols, boardRows, boardUnits, playerFaction]);
  const tacticalPreviewLevel = useMemo<Level | null>(() => {
    if (!previewPlayerFaction) return null;
    return editorBoardToLevel(
      { ...currentEditorBoard, playerFaction: previewPlayerFaction },
      { id: editingId ?? 'draft-preview', name: levelNameForSave, ...modeMeta },
    );
  }, [currentEditorBoard, editingId, levelNameForSave, modeMeta, previewPlayerFaction]);
  const tacticalPreviewGame = useMemo<GameState | null>(() => {
    if (!tacticalPreviewLevel) return null;
    const game = createFromLevel(tacticalPreviewLevel, 1);
    const authoredPieceIds = new Set(tacticalPreviewLevel.layers.units.map((unit, index) => `${unit.side}-${unit.type}-${index}`));
    return {
      ...game,
      pieces: game.pieces.filter((piece) => authoredPieceIds.has(piece.id) || piece.id.startsWith('prop-')),
    };
  }, [tacticalPreviewLevel]);
  const tacticalPreviewEnv = useMemo<MoveEnv | null>(
    () => tacticalPreviewGame ? { ...gameEnv(tacticalPreviewGame), lastMove: tacticalPreviewGame.lastMove } : null,
    [tacticalPreviewGame],
  );
  const tacticalFocusPiece = useMemo<Piece | null>(() => {
    if (!tacticalPreviewGame) return null;
    const selected = selectedCell
      ? tacticalPreviewGame.pieces.find((piece) =>
          piece.alive &&
          (piece.side === 'player' || piece.side === 'enemy') &&
          piece.x === selectedCell.x &&
          piece.y === selectedCell.y,
        )
      : null;
    return selected ?? tacticalPreviewGame.pieces.find((piece) => piece.alive && piece.side === 'player') ?? null;
  }, [selectedCell, tacticalPreviewGame]);
  const tacticalPreview = useMemo(
    () => tacticalPreviewForGame(tacticalPreviewGame, tacticalPreviewEnv, tacticalFocusPiece, {
      showMoves,
      showEnemyAttacks,
      showBlocked,
      showPromotionZones,
    }),
    [showBlocked, showEnemyAttacks, showMoves, showPromotionZones, tacticalFocusPiece, tacticalPreviewEnv, tacticalPreviewGame],
  );
  const targetLevelId = editingId ?? routeParams.levelId;
  const campaigns = useCampaigns((s) => s.campaigns);
  const targetLevel = useCampaigns((s) => (targetLevelId ? s.levels[targetLevelId] : undefined));
  useEffect(() => {
    if (campaignAssignmentHydrated || !targetLevelId || !targetLevel) return;
    const resolvedCampaignId = campaigns.find((campaign) => campaign.levels.some((ref) => ref.levelId === targetLevelId))?.id ?? '';
    if (!recoveredCampaignAssignmentRef.current) setCampaignAssignmentId(resolvedCampaignId);
    setSavedCampaignAssignmentId(resolvedCampaignId);
    setCampaignAssignmentHydrated(true);
  }, [campaignAssignmentHydrated, campaigns, targetLevel, targetLevelId]);
  const assignedCampaign = campaignAssignmentId
    ? campaigns.find((campaign) => campaign.id === campaignAssignmentId) ?? null
    : null;
  const eligibleCampaigns = useMemo(
    () => campaigns.filter((campaign) => !targetLevelId || tierOf(campaign.id) === tierOf(targetLevelId)),
    [campaigns, targetLevelId],
  );
  const officialCampaignOptions = eligibleCampaigns.filter((campaign) => campaign.origin === 'official');
  const privateCampaignOptions = eligibleCampaigns.filter((campaign) => campaign.origin !== 'official');
  // Real dirty flag: the working draft differs when its signature or staged campaign assignment
  // no longer matches the last canonical Save.
  // captured at the last save. The signature folds in rules/settings/events through the candidate
  // level, so event edits mark the level dirty, not just board paint.
  const currentSig = useMemo(() => levelEditorLevelSignature(candidateLevel), [candidateLevel]);
  // Standalone / board-link editors do not have a saved Level document to compare against. Capture
  // the very first rendered signature and keep that as the clean baseline; otherwise a first
  // event-template edit can become the baseline if the seeding effect runs after that edit.
  const standaloneBaselineSigRef = useRef<string | null>(routeParams.levelId ? null : currentSig);
  const levelDirty = editorDocument?.never_saved
    ? true
    : savedSig !== null
    ? currentSig !== savedSig
    : editorDocument
    ? editorDocument.dirty || currentSig !== levelEditorLevelSignature(editorDocument.level)
    : currentSig !== (standaloneBaselineSigRef.current ?? currentSig);
  const campaignAssignmentDirty = campaignAssignmentHydrated && campaignAssignmentId !== savedCampaignAssignmentId;
  const dirty = levelDirty || campaignAssignmentDirty;
  const currentSigRef = useRef(currentSig);
  currentSigRef.current = currentSig;
  const initialCandidateRef = useRef(candidateLevel);
  const currentCandidateRef = useRef(candidateLevel);
  currentCandidateRef.current = candidateLevel;
  const savedSigRef = useRef(savedSig);
  savedSigRef.current = savedSig;
  const editorDocumentRef = useRef(editorDocument);
  editorDocumentRef.current = editorDocument;
  const signedInRef = useRef(Boolean(me?.signed_in));
  signedInRef.current = Boolean(me?.signed_in);
  // Establish the clean baseline signature. Two ways in: a standalone board (no campaign level)
  // seeds from its first-render signature; a campaign level seeds it AFTER hydrate has settled the
  // board state (needsBaselineRef, captured from the live currentSig so it always matches). Depends
  // on currentSig so the post-hydrate capture fires once the seeded state has flowed through.
  useEffect(() => {
    if (needsBaselineRef.current) {
      needsBaselineRef.current = false;
      // A seed that withheld user-authored fields must not adopt the merged on-screen state
      // as clean: anchor the baseline on the seeded DOCUMENT's rules instead, so exactly the
      // user's authored delta reads dirty (and keeps flowing into drafts / the Save).
      const skew = seedSkewRef.current;
      seedSkewRef.current = null;
      setSavedSig(skew ? levelEditorLevelSignature(seededBaselineLevel(candidateLevel, skew)) : currentSig);
      return;
    }
    if (savedSig === null && !routeParams.levelId) setSavedSig(standaloneBaselineSigRef.current ?? currentSig);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSig]);

  useLayoutEffect(() => {
    // localStorage is a crash/offline fallback only. The status UI never calls this a cloud save;
    // durable progress is acknowledged solely by the revisioned editor-document endpoint below.
    if (!editorReady || editorLoadError) return;
    const existingRecovery = editorDocument ? null : readLevelEditorDraft(draftKey);
    const ownerEmail = editorDocument
      ? me?.email?.trim().toLowerCase()
      : existingRecovery?.ownerEmail;
    if (editorDocument) {
      if (!ownerEmail) return;
      const expectedKey = levelEditorDraftKey({ documentId: editorDocument.document_id, ownerEmail });
      if (draftKey !== expectedKey) return;
    }
    const savedAt = Date.now();
    const draft: LevelEditorDraft = {
      savedAt,
      savedSig: savedSig ?? standaloneBaselineSigRef.current ?? '',
      documentId: editorDocument?.document_id ?? existingRecovery?.documentId,
      ownerEmail,
      documentRevision: editorDocument
        ? documentRevisionRef.current ?? undefined
        : existingRecovery?.documentRevision,
      cloudSignature: editorDocument
        ? lastCloudSyncedSigRef.current ?? undefined
        : existingRecovery?.cloudSignature,
      recoveryConflict: documentConflictRef.current || existingRecovery?.recoveryConflict || undefined,
      editingId: targetLevelId,
      board: currentEditorBoard,
      levelName: levelNameForSave,
      campaignId: campaignAssignmentId || null,
      objective,
      surviveTurns,
      timeControl: clockEnabled ? { initialSeconds: clockInitialSeconds, incrementSeconds: clockIncrementSeconds } : undefined,
      victory: victoryForSave,
      events: eventsForSave,
    };
    const wrote = writeLevelEditorDraft(draftKey, draft);
    setLocalBackupAvailable(wrote);
    // A recovery being claimed after sign-in stays protected until it has a scoped browser copy
    // and a durable cloud document. If the cloud call is temporarily down, keep the intent's
    // timestamp in lockstep with subsequent edits instead of invalidating it on the next reload.
    if (wrote && preserveUnscopedRecoveryIntentRef.current && draftKey === initialDraftKey) {
      try {
        window.sessionStorage.setItem(EDITOR_SIGN_IN_RECOVERY_INTENT_KEY, JSON.stringify({
          draftKey,
          savedAt,
        } satisfies EditorSignInRecoveryIntent));
      } catch { /* The browser copy still exists even if sessionStorage is unavailable. */ }
    }
  }, [campaignAssignmentId, clockEnabled, clockIncrementSeconds, clockInitialSeconds, currentEditorBoard, draftKey, editorDocument, editorLoadError, editorReady, eventsForSave, levelNameForSave, me?.email, objective, savedSig, surviveTurns, targetLevelId, victoryForSave]);

  const closeEventsEditor = (): void => {
    eventsOpenRef.current = false;
    setEventsOpen(false);
    if (rulesHistorySentinelRef.current) {
      rulesHistorySentinelRef.current = false;
      window.history.back();
    }
  };

  // Give the nested Rules editor one same-document history entry. That makes native/hardware
  // Back collapse Rules even after a cold editor load; the following Back can then leave.
  useLayoutEffect(() => {
    if (!eventsOpen || rulesHistorySentinelRef.current) return;
    eventsOpenRef.current = true;
    const state = window.history.state;
    window.history.pushState({
      ...(state && typeof state === 'object' ? state as Record<string, unknown> : {}),
      levelEditorRules: true,
    }, '', window.location.href);
    rulesHistorySentinelRef.current = true;
  }, [eventsOpen]);

  useEffect(() => {
    const collapseRulesFromHistory = (): void => {
      if (!rulesHistorySentinelRef.current) return;
      rulesHistorySentinelRef.current = false;
      eventsOpenRef.current = false;
      setEventsOpen(false);
    };
    window.addEventListener('popstate', collapseRulesFromHistory);
    return () => window.removeEventListener('popstate', collapseRulesFromHistory);
  }, []);

  useLayoutEffect(() => {
    if (!eventsOpen) return undefined;

    return registerAppNavigationBlocker((attempt) => {
      const action = levelEditorExitAction({
        destinationHref: attempt.href,
        replace: attempt.replace,
        rulesEditorOpen: eventsOpenRef.current,
        source: attempt.source,
      });
      if (action === 'allow') return false;
      if (action === 'close-rules-editor') {
        closeEventsEditor();
        return true;
      }
      return false;
    });
  }, [eventsOpen]);

  // Resolve one durable, account-owned working copy and put its globally unique document id in
  // the editor URL. This prevents per-account level ids such as `l1` from colliding when a URL is
  // pasted into another account. Copying the address bar is absent from this flow and mutates
  // nothing; access remains owner/admin gated independently of possession of the URL.
  useEffect(() => {
    let active = true;
    void (async () => {
      const hydration = ensureCampaignsHydrated()
        .then((result) => {
          if (active) {
            setUserWorkspaceHydration(result.userWorkspace === 'unavailable' ? 'unavailable' : 'ready');
            setOfficialWorkspaceHydration(result.officialAvailable ? 'ready' : 'unavailable');
          }
          return result;
        })
        .catch(() => {
          if (active) {
            setUserWorkspaceHydration('unavailable');
            setOfficialWorkspaceHydration('unavailable');
          }
          return undefined;
        });
      const authRequest = fetchMeStatus();
      let hydrationTimer: number | undefined;
      await Promise.race([
        hydration,
        new Promise<void>((resolve) => {
          hydrationTimer = window.setTimeout(resolve, EDITOR_HYDRATION_WAIT_MS);
        }),
      ]);
      if (hydrationTimer !== undefined) window.clearTimeout(hydrationTimer);
      const auth = await authRequest;
      const user = auth.user;
      if (!active) return;
      setMe(user);
      setAuthReachable(auth.reachable);
      if (user.signed_in) signInHandoffPendingRef.current = false;

      const requestedLevelId = routeParams.levelId;
      const canonical = requestedLevelId ? useCampaigns.getState().levels[requestedLevelId] : undefined;
      if (canonical) {
        setSavedSig(normalizedLevelEditorSignature(canonical));
        setTargetBaselineResolved(true);
      }
      const currentUnscopedDraft = readLevelEditorDraft(initialDraftKey) ?? unscopedLocalDraft;
      const recoveryIntent = user.signed_in && !routeParams.documentId
        ? readEditorSignInRecoveryIntent()
        : null;
      const claimedUnscopedDraft = recoveryIntent
        && recoveryIntent.draftKey === initialDraftKey
        && currentUnscopedDraft
        && recoveryIntent.savedAt === currentUnscopedDraft.savedAt
        ? currentUnscopedDraft
        : null;

      if (!auth.reachable) {
        if (routeParams.documentId) {
          setEditorLoadError({
            title: 'Cloud working copy unavailable',
            detail: 'The private document could not be reached. Reconnect and retry; no other level was substituted.',
            retry: true,
          });
          setCloudSaveState('error');
          setCloudSaveDetail('Waiting to reconnect to your account.');
          setTargetBaselineResolved(false);
          setEditorReady(true);
          return;
        }
        if (currentUnscopedDraft) {
          const recovered = levelFromDraft(currentUnscopedDraft, canonical ?? initialCandidateRef.current);
          applyLevelDocument(recovered, {
            editingId: canonical?.id ?? currentUnscopedDraft.editingId,
            clean: false,
            seed: true,
          });
          setSavedSig(canonical ? normalizedLevelEditorSignature(canonical) : currentUnscopedDraft.savedSig);
        } else if (canonical && !loadedBoard) {
          applyLevelDocument(canonical, { editingId: canonical.id, clean: true, seed: true });
        }
        offlineRecoveryLevelRef.current = currentUnscopedDraft
          ? levelFromDraft(currentUnscopedDraft, canonical ?? initialCandidateRef.current)
          : canonical ?? initialCandidateRef.current;
        offlineRecoverySavedSigRef.current = canonical
          ? normalizedLevelEditorSignature(canonical)
          : currentUnscopedDraft?.savedSig ?? savedSigRef.current;
        setCloudSaveState('local');
        setCloudSaveDetail(null);
        setTargetBaselineResolved(!requestedLevelId || Boolean(canonical));
        setEditorReady(true);
        return;
      }
      if (user.signed_in && routeParams.documentId) clearEditorSignInRecoveryIntent();
      if (user.signed_in && recoveryIntent && !claimedUnscopedDraft) clearEditorSignInRecoveryIntent();

      if (!user.signed_in) {
        if (routeParams.documentId) {
          setEditorLoadError({
            title: 'Sign in to open this editor document',
            detail: 'The URL identifies a private cloud working copy. Sign in with the account that owns it.',
            signIn: true,
          });
          setCloudSaveState('local');
          setCloudSaveDetail(null);
          setEditorReady(true);
          return;
        }
        if (currentUnscopedDraft) {
          const recovered = levelFromDraft(currentUnscopedDraft, canonical ?? initialCandidateRef.current);
          applyLevelDocument(recovered, {
            editingId: canonical?.id ?? currentUnscopedDraft.editingId,
            clean: false,
            seed: true,
          });
          setSavedSig(canonical ? normalizedLevelEditorSignature(canonical) : currentUnscopedDraft.savedSig);
          if (!quietDraftRestore) reportStatus('Restored browser recovery copy.', 'success', 'Sign in to sync it across devices.');
        } else if (canonical && !loadedBoard) {
          applyLevelDocument(canonical, { editingId: canonical.id, clean: true, seed: true });
        }
        setCloudSaveState('local');
        setCloudSaveDetail('Sign in to sync this working copy across devices.');
        setTargetBaselineResolved(!requestedLevelId || Boolean(canonical));
        setEditorReady(true);
        return;
      }

      if (claimedUnscopedDraft) preserveUnscopedRecoveryIntentRef.current = true;
      try {
        const sessionRecoveryLevel = offlineRecoveryLevelRef.current;
        const createSeed = claimedUnscopedDraft
          ? levelFromDraft(claimedUnscopedDraft, initialCandidateRef.current)
          : sessionRecoveryLevel ?? initialCandidateRef.current;
        const doc = routeParams.documentId
          ? await loadEditorDocument(routeParams.documentId)
          : requestedLevelId
          ? await resolveEditorDocument(requestedLevelId, editorDocumentWorkspaceForLevelId(requestedLevelId))
          : await createEditorDocument(createSeed);
        if (!active) return;

        const ownerEmail = user.email?.trim().toLowerCase() ?? '';
        const scopedDraftKey = ownerEmail
          ? levelEditorDraftKey({ documentId: doc.document_id, ownerEmail })
          : null;
        const rawScopedDraft = scopedDraftKey ? readLevelEditorDraft(scopedDraftKey) : null;
        const scopedDraft = rawScopedDraft
          && rawScopedDraft.documentId === doc.document_id
          && rawScopedDraft.ownerEmail === ownerEmail
          && rawScopedDraft.editingId === doc.level_id
          ? rawScopedDraft
          : null;
        const recoveryDraft = scopedDraft ?? claimedUnscopedDraft;
        if (recoveryDraft?.campaignId !== undefined) {
          recoveredCampaignAssignmentRef.current = true;
          setCampaignAssignmentId(recoveryDraft.campaignId ?? '');
        }
        const documentSig = levelEditorLevelSignature(doc.level);
        const localLevel = recoveryDraft
          ? levelFromDraft(recoveryDraft, doc.level)
          : sessionRecoveryLevel
          ? { ...sessionRecoveryLevel, id: doc.level_id }
          : null;
        const localSig = localLevel ? levelEditorLevelSignature(localLevel) : undefined;
        const initialLevel = { ...initialCandidateRef.current, id: doc.level_id };
        const initialSig = levelEditorLevelSignature(initialLevel);
        const restoreClaimedDraft = Boolean(
          claimedUnscopedDraft
          && localLevel
          && localSig !== documentSig
          && !doc.dirty
          && claimedUnscopedDraft.savedSig === normalizedLevelEditorSignature(doc.level),
        );
        const restoreOfflineSession = Boolean(
          sessionRecoveryLevel
          && localLevel
          && localSig !== documentSig
          && !doc.dirty
          && offlineRecoverySavedSigRef.current === normalizedLevelEditorSignature(doc.level),
        );
        const restoreLocal = restoreClaimedDraft || restoreOfflineSession || Boolean(scopedDraft && localLevel && shouldRestoreLocalEditorRecovery({
          localSignature: localSig,
          documentSignature: documentSig,
          localSavedAt: scopedDraft.savedAt,
          documentUpdatedAt: doc.updated_at,
          localDocumentRevision: scopedDraft.documentRevision,
          documentRevision: doc.revision,
          localCloudSignature: scopedDraft.cloudSignature,
          localRecoveryConflict: scopedDraft.recoveryConflict,
        }));
        const localDiverged = Boolean(localLevel && localSig !== documentSig);
        const localRecoveryConflict = localDiverged && !restoreLocal;
        const routeSnapshotDiverged = Boolean(loadedBoard && initialSig !== documentSig);
        const routeSnapshotSafe = !routeParams.documentId || routeParams.documentRevision === doc.revision;
        const restoreRouteSnapshot = routeSnapshotDiverged && routeSnapshotSafe;
        const routeRecoveryConflict = routeSnapshotDiverged && !routeSnapshotSafe;
        const recoveryConflict = localRecoveryConflict || routeRecoveryConflict || doc.baseline_conflict;
        const recoveredLevel = routeSnapshotDiverged
          ? initialLevel
          : localDiverged && localLevel
          ? localLevel
          : doc.level;
        const shouldRecover = restoreLocal || restoreRouteSnapshot || recoveryConflict;

        documentRevisionRef.current = doc.revision;
        lastCloudSyncedSigRef.current = documentSig;
        documentConflictRef.current = recoveryConflict;
        documentConflictKindRef.current = doc.baseline_conflict
          ? 'baseline'
          : recoveryConflict
          ? 'recovery'
          : null;
        setEditorLoadError(null);
        setEditorDocument(doc);
        setEditingId(doc.level_id);
        setTargetBaselineResolved(true);

        const resolvedCanonical = useCampaigns.getState().levels[doc.level_id];
        if (resolvedCanonical) {
          setSavedSig(normalizedLevelEditorSignature(resolvedCanonical));
        } else if (!doc.dirty && doc.has_saved_baseline) {
          setSavedSig(normalizedLevelEditorSignature(doc.level));
        } else if (doc.never_saved) {
          setSavedSig(standaloneBaselineSigRef.current ?? documentSig);
        } else if (scopedDraft?.savedSig) {
          setSavedSig(scopedDraft.savedSig);
        }

        applyLevelDocument(shouldRecover ? recoveredLevel : doc.level, {
          editingId: doc.level_id,
          clean: false,
          seed: true,
        });

        if (scopedDraftKey && scopedDraftKey !== draftKey) setDraftKey(scopedDraftKey);
        if (claimedUnscopedDraft && scopedDraftKey && ownerEmail) {
          const migrated = writeLevelEditorDraft(scopedDraftKey, {
            ...claimedUnscopedDraft,
            documentId: doc.document_id,
            ownerEmail,
            documentRevision: doc.revision,
            cloudSignature: documentSig,
            recoveryConflict: recoveryConflict || undefined,
            editingId: doc.level_id,
          });
          if (migrated) {
            preserveUnscopedRecoveryIntentRef.current = false;
            clearEditorSignInRecoveryIntent();
            clearLevelEditorDraft(initialDraftKey);
          }
        }
        offlineRecoveryLevelRef.current = null;
        offlineRecoverySavedSigRef.current = null;
        navigateApp(levelEditorHrefForDocument(window.location.href, {
          levelId: doc.level_id,
          documentId: doc.document_id,
        }, { keepRecoverySnapshot: shouldRecover }), { replace: true, scroll: false });

        setCloudSaveState(recoveryConflict ? 'conflict' : shouldRecover ? 'pending' : 'saved');
        setCloudSaveDetail(recoveryConflict
          ? doc.baseline_conflict
            ? 'The saved level changed after this working copy branched. Your progress is preserved; autosave is paused until you discard or resolve it.'
            : 'This browser recovery was based on an older cloud revision. It is preserved here, and autosave is paused.'
          : null);
        setEditorReady(true);
        reportStatus(
          doc.baseline_conflict ? 'Saved-position conflict preserved.' : recoveryConflict ? 'Recovery conflict preserved.' : shouldRecover ? 'Recovered newer browser edits.' : 'Working copy loaded.',
          recoveryConflict ? 'warning' : 'success',
          recoveryConflict
            ? 'No cloud or canonical data was overwritten. Discard changes restores the last saved position.'
            : shouldRecover
            ? 'They will be written to the durable working copy automatically.'
            : doc.dirty
            ? 'Your autosaved progress is separate from the saved level until you choose Save.'
            : 'Progress is saved to your account.',
        );
      } catch (error) {
        if (!active) return;
        if (routeParams.documentId) {
          const status = (error as { status?: number }).status;
          const ownerEmail = user.email?.trim().toLowerCase() ?? '';
          const failedDocumentDraftKey = ownerEmail
            ? levelEditorDraftKey({ documentId: routeParams.documentId, ownerEmail })
            : null;
          const failedDocumentDraft = failedDocumentDraftKey
            ? readLevelEditorDraft(failedDocumentDraftKey)
            : null;
          const scopedRecovery = failedDocumentDraft
            && failedDocumentDraft.documentId === routeParams.documentId
            && failedDocumentDraft.ownerEmail === ownerEmail
            ? failedDocumentDraft
            : null;
          if (scopedRecovery && status !== 403 && status !== 404) {
            const recovered = levelFromDraft(scopedRecovery, canonical ?? initialCandidateRef.current);
            applyLevelDocument(recovered, {
              editingId: scopedRecovery.editingId ?? canonical?.id,
              clean: false,
              seed: true,
            });
            if (scopedRecovery.editingId) setEditingId(scopedRecovery.editingId);
            if (failedDocumentDraftKey) setDraftKey(failedDocumentDraftKey);
            offlineRecoveryLevelRef.current = recovered;
            offlineRecoverySavedSigRef.current = scopedRecovery.savedSig;
            setEditorLoadError(null);
            setCloudSaveState('error');
            setCloudSaveDetail('Cloud autosave is unavailable. The current editor remains open and will retry after reconnection.');
            setTargetBaselineResolved(Boolean(canonical) || !routeParams.levelId);
            setEditorReady(true);
            return;
          }
          setEditorLoadError({
            title: status === 403 || status === 404 ? 'No access to this editor document' : 'Editor document unavailable',
            detail: status === 403 || status === 404
              ? 'Sign in with the account that owns this working copy.'
              : 'The working copy could not be reached. No other level was substituted for it.',
            retry: status !== 403 && status !== 404,
          });
          setCloudSaveState('error');
          setCloudSaveDetail(null);
          setTargetBaselineResolved(false);
          setEditorReady(true);
          return;
        }
        if (claimedUnscopedDraft) {
          const recovered = levelFromDraft(claimedUnscopedDraft, canonical ?? initialCandidateRef.current);
          applyLevelDocument(recovered, {
            editingId: canonical?.id ?? claimedUnscopedDraft.editingId,
            clean: false,
            seed: true,
          });
          setSavedSig(canonical ? normalizedLevelEditorSignature(canonical) : claimedUnscopedDraft.savedSig);
          offlineRecoveryLevelRef.current = recovered;
          offlineRecoverySavedSigRef.current = claimedUnscopedDraft.savedSig;
        } else if (offlineRecoveryLevelRef.current) {
          applyLevelDocument(offlineRecoveryLevelRef.current, {
            editingId: offlineRecoveryLevelRef.current.id,
            clean: false,
            seed: true,
          });
        } else if (canonical && !loadedBoard) {
          applyLevelDocument(canonical, { editingId: canonical.id, clean: true, seed: true });
        }
        setCloudSaveState('error');
        setCloudSaveDetail('Cloud autosave is unavailable. The current editor remains open; reconnect to retry.');
        setTargetBaselineResolved(!requestedLevelId || Boolean(canonical));
        setEditorReady(true);
        reportStatus('Cloud autosave is unavailable.', 'warning', (error as Error).message);
      }
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentLoadAttempt]);

  const retryCloudDocument = (): void => {
    if (editorDocument) {
      setCloudSaveState((state) => state === 'error' ? 'pending' : state);
      setCloudSaveDetail(null);
      return;
    }
    if (editorReady && !editorLoadError) {
      offlineRecoveryLevelRef.current = currentCandidateRef.current;
      offlineRecoverySavedSigRef.current = savedSigRef.current;
    }
    setEditorLoadError(null);
    setEditorReady(false);
    setCloudSaveState('loading');
    setCloudSaveDetail(null);
    setDocumentLoadAttempt((attempt) => attempt + 1);
  };

  // Debounced, serialized compare-and-swap autosave. A conflict never overwrites either side:
  // the current board stays in memory/local recovery and the server's newer revision is surfaced.
  useEffect(() => {
    if (!editorReady || !editorDocument || !me?.signed_in || saving) return undefined;
    if (cloudSaveState === 'conflict' || cloudSaveState === 'error') return undefined;
    if (autosaveInFlightRef.current) return undefined;
    if (lastCloudSyncedSigRef.current === currentSig) {
      setCloudSaveState('saved');
      setCloudSaveDetail(null);
      return undefined;
    }
    setCloudSaveState('pending');
    const timer = window.setTimeout(() => {
      autosaveTimerRef.current = null;
      if (autosaveInFlightRef.current) return;
      const revision = documentRevisionRef.current;
      if (revision === null) return;
      const signatureAtSave = currentSig;
      const levelAtSave = candidateLevel;
      autosaveInFlightRef.current = true;
      setCloudSaveState('saving');
      const request = autosaveEditorDocument(
        editorDocument.document_id,
        levelAtSave,
        revision,
      )
        .then((doc) => {
          documentRevisionRef.current = doc.revision;
          lastCloudSyncedSigRef.current = signatureAtSave;
          if (doc.baseline_conflict) {
            documentConflictRef.current = true;
            documentConflictKindRef.current = 'baseline';
            setEditorDocument(doc);
            setCloudSaveState('conflict');
            setCloudSaveDetail('The saved level changed outside this working copy. Your current progress was preserved and autosave is paused.');
            reportStatus(
              'Autosave paused because the saved position changed.',
              'warning',
              'Discard changes restores the latest saved position; no canonical data was overwritten.',
            );
            return;
          }
          documentConflictRef.current = false;
          documentConflictKindRef.current = null;
          setEditorDocument(doc);
          setCloudSaveDetail(null);
          setCloudSaveState(currentSigRef.current === signatureAtSave ? 'saved' : 'pending');
        })
        .catch((error: unknown) => {
          if (isEditorDocumentConflict(error)) {
            documentRevisionRef.current = error.document.revision;
            documentConflictRef.current = true;
            documentConflictKindRef.current = isEditorDocumentBaselineConflict(error) ? 'baseline' : 'revision';
            setEditorDocument(error.document);
            setCloudSaveState('conflict');
            setCloudSaveDetail(isEditorDocumentBaselineConflict(error)
              ? 'The saved level changed outside this working copy. Your current progress was not overwritten.'
              : 'Another tab or device saved a newer revision. The current editor was not overwritten.');
            reportStatus(
              isEditorDocumentBaselineConflict(error) ? 'Autosave paused because the saved position changed.' : 'Autosave paused for a revision conflict.',
              'warning',
              'Your current editor remains open; Discard changes restores the latest saved position.',
            );
            return;
          }
          setCloudSaveState('error');
          setCloudSaveDetail('Cloud autosave was interrupted. Keep this tab open if browser recovery is unavailable.');
          reportStatus('Cloud autosave failed.', 'warning', (error as Error).message);
        })
        .finally(() => {
          autosaveInFlightRef.current = false;
          autosavePromiseRef.current = null;
        });
      autosavePromiseRef.current = request;
    }, 700);
    autosaveTimerRef.current = timer;
    return () => {
      window.clearTimeout(timer);
      if (autosaveTimerRef.current === timer) autosaveTimerRef.current = null;
    };
  }, [candidateLevel, cloudSaveState, currentSig, editorDocument, editorReady, me?.signed_in, saving]);

  useEffect(() => {
    const retry = (): void => {
      if (editorDocumentRef.current) {
        setCloudSaveState((state) => state === 'error' ? 'pending' : state);
        return;
      }
      retryCloudDocument();
    };
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [editorDocument, editorLoadError, editorReady]);

  useEffect(() => {
    const retryAfterSignIn = (): void => {
      if (!signInHandoffPendingRef.current) return;
      retryCloudDocument();
    };
    window.addEventListener('focus', retryAfterSignIn);
    return () => window.removeEventListener('focus', retryAfterSignIn);
  }, [editorDocument, editorLoadError, editorReady]);

  // A route change must not manufacture a 700 ms loss window. Normal autosaves themselves use
  // keepalive, and this departure flush sends the latest unsent snapshot. If an older write is
  // already in flight during an in-app unmount, the latest write is chained after its CAS ack.
  useEffect(() => {
    const flushLatest = (pageHiding: boolean): void => {
      const doc = editorDocumentRef.current;
      const revision = documentRevisionRef.current;
      const signature = currentSigRef.current;
      if (
        !doc
        || !signedInRef.current
        || revision === null
        || documentConflictRef.current
        || signature === lastCloudSyncedSigRef.current
        || signature === departureFlushSigRef.current
      ) return;
      departureFlushSigRef.current = signature;
      if (pageHiding) {
        autosaveEditorDocumentOnPageHide(doc.document_id, currentCandidateRef.current, revision);
      } else {
        void autosaveEditorDocument(doc.document_id, currentCandidateRef.current, revision).catch(() => undefined);
      }
    };
    const flushAfterCurrentWrite = (pageHiding: boolean): void => {
      if (autosaveTimerRef.current !== null) {
        window.clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
      const inFlight = autosavePromiseRef.current;
      if (inFlight && pageHiding) {
        // Page freeze may prevent promise continuations from running. Send the latest snapshot
        // now as a best-effort peer to the older in-flight CAS; browser recovery is already sync.
        flushLatest(true);
      } else if (inFlight) void inFlight.then(
        () => flushLatest(pageHiding),
        () => flushLatest(pageHiding),
      );
      else flushLatest(pageHiding);
    };
    const onPageHide = (): void => flushAfterCurrentWrite(true);
    const onPageShow = (event: PageTransitionEvent): void => {
      if (!event.persisted) return;
      const doc = editorDocumentRef.current;
      const observedRevision = documentRevisionRef.current;
      if (!doc || observedRevision === null || !signedInRef.current) return;
      departureFlushSigRef.current = null;
      void loadEditorDocument(doc.document_id)
        .then((serverDocument) => {
          const serverSignature = levelEditorLevelSignature(serverDocument.level);
          const liveSignature = currentSigRef.current;
          documentRevisionRef.current = serverDocument.revision;
          lastCloudSyncedSigRef.current = serverSignature;
          setEditorDocument(serverDocument);
          if (serverDocument.baseline_conflict) {
            documentConflictRef.current = true;
            documentConflictKindRef.current = 'baseline';
            setCloudSaveState('conflict');
            setCloudSaveDetail('The saved position changed while this page was in the background. Your editor was preserved.');
          } else if (serverSignature === liveSignature) {
            documentConflictRef.current = false;
            documentConflictKindRef.current = null;
            setCloudSaveState('saved');
            setCloudSaveDetail(null);
          } else if (serverDocument.revision === observedRevision) {
            setCloudSaveState('pending');
            setCloudSaveDetail(null);
          } else {
            documentConflictRef.current = true;
            documentConflictKindRef.current = 'revision';
            setCloudSaveState('conflict');
            setCloudSaveDetail('The working copy advanced while this page was in the background. Your current editor was preserved.');
          }
        })
        .catch(() => {
          setCloudSaveState('error');
          setCloudSaveDetail('Cloud sync could not be checked after returning to this page. Retry when connected.');
        });
    };
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('pageshow', onPageShow);
      flushAfterCurrentWrite(false);
    };
  }, []);

  // A Test-return board is a one-shot recovery envelope. Keep it in the URL until that exact
  // snapshot is acknowledged, then consume it so refresh/history can never replay stale pixels
  // over a newer cloud revision.
  useEffect(() => {
    if (!editorDocument || cloudSaveState !== 'saved' || lastCloudSyncedSigRef.current !== currentSig) return;
    if (!isLevelEditorRoutePath(window.location.pathname)) return;
    const params = new URLSearchParams(window.location.search);
    if (!params.has('board')) return;
    navigateApp(levelEditorHrefForDocument(window.location.href, {
      levelId: editorDocument.level_id,
      documentId: editorDocument.document_id,
    }), { replace: true, scroll: false });
  }, [cloudSaveState, currentSig, editorDocument]);

  // The staged selector is the source of truth here: choosing a campaign immediately turns on
  // campaign-only requirements (notably Player faction) before the association is published.
  const isCampaignLevel = Boolean(campaignAssignmentId);
  const boardFactionCounts = useMemo<Record<UnitPalette, number>>(() => {
    const counts = Object.fromEntries(UNIT_PALETTES.map((faction) => [faction, 0])) as Record<UnitPalette, number>;
    for (const unit of Object.values(boardUnits)) counts[unit.faction] += 1;
    return counts;
  }, [boardUnits]);
  const boardFactionMaterialValues = useMemo<Record<UnitPalette, number>>(() => {
    const totals = Object.fromEntries(UNIT_PALETTES.map((faction) => [faction, 0])) as Record<UnitPalette, number>;
    for (const unit of Object.values(boardUnits)) totals[unit.faction] += materialPointsForUnitId(unit.unitId);
    return totals;
  }, [boardUnits]);
  const presentFactions = useMemo(
    () => UNIT_PALETTES.filter((faction) => boardFactionCounts[faction] > 0),
    [boardFactionCounts],
  );
  const playerFactionPresent = Boolean(playerFaction && presentFactions.includes(playerFaction));
  const needsPlayerFaction = isCampaignLevel && !playerFactionPresent;
  const levelObjectiveLabel = OBJECTIVE_LABEL[targetLevel?.objective ?? 'capture-all'];
  const levelDifficultyLabel = formatDifficulty(targetLevel?.difficulty);
  const controlOptions = useMemo(() => factionControlOptions(isCampaignLevel), [isCampaignLevel]);
  const setFactionControl = (faction: UnitPalette, control: FactionControl): void => {
    if (control === 'player') {
      setPlayerFactionWithHistory(faction);
      return;
    }
    if (playerFaction === faction) setPlayerFactionWithHistory(null);
  };
  const onFactionControlChange = (faction: UnitPalette) => (event: ChangeEvent<HTMLSelectElement>): void => {
    setFactionControl(faction, event.currentTarget.value as FactionControl);
  };
  const browserRecoverySafetyDetail = localBackupAvailable === true
    ? 'A browser recovery copy is available.'
    : localBackupAvailable === false
    ? 'Browser recovery is unavailable; keep this tab open.'
    : 'The current editor remains open while recovery storage is checked.';
  const syncSavedLevelRoute = (levelId: string): void => {
    if (!isLevelEditorRoutePath(window.location.pathname)) return;
    const url = new URL(window.location.href);
    url.searchParams.set('levelId', levelId);
    if (campaignAssignmentId) url.searchParams.set('campaignId', campaignAssignmentId);
    else url.searchParams.delete('campaignId');
    navigateApp(`${url.pathname}${url.search}${url.hash}`, { replace: true, scroll: false });
  };

  // Save promotes the exact current working copy into the canonical workspace transactionally.
  // Only the acknowledged response enters the shared store, which keeps thumbnails and gameplay
  // pinned to the last successful Save/Publish rather than the autosaved working document.
  const saveLevel = async (): Promise<void> => {
    if (saving) return;
    if (!me?.signed_in) {
      if (authReachable === false) {
        reportStatus('Cloud is unavailable.', 'warning', browserRecoverySafetyDetail);
        retryCloudDocument();
        return;
      }
      signInForEditor();
      return;
    }
    if (!editorDocument || !targetLevelId || documentRevisionRef.current === null) {
      reportStatus('Cloud working copy is unavailable.', 'warning', browserRecoverySafetyDetail);
      if (me?.signed_in || authReachable === false) retryCloudDocument();
      return;
    }
    if (documentConflictRef.current) {
      reportStatus(
        documentConflictKindRef.current === 'baseline' ? 'The saved position changed outside this working copy.' : 'Resolve the revision conflict before saving.',
        'warning',
        `Discard changes restores the latest saved position. ${browserRecoverySafetyDetail}`,
      );
      return;
    }
    const savingOfficialTier = editorDocument.workspace_kind === 'official';
    const persistenceHydration = savingOfficialTier ? officialWorkspaceHydration : userWorkspaceHydration;
    if (persistenceHydration !== 'ready' || !campaignAssignmentHydrated) {
      const workspaceLabel = savingOfficialTier ? 'Official campaigns' : 'Your workspace';
      reportStatus(
        persistenceHydration === 'unavailable' ? `${workspaceLabel} unavailable.` : `${workspaceLabel} still loading.`,
        persistenceHydration === 'unavailable' ? 'warning' : 'info',
        'Editing and working-copy autosave remain safe, but canonical Save is paused until campaign data is available.',
      );
      return;
    }
    const state = useCampaigns.getState();
    const targetCampaign = campaignAssignmentId
      ? state.campaigns.find((campaign) => campaign.id === campaignAssignmentId)
      : undefined;
    if (campaignAssignmentId && !targetCampaign) {
      reportStatus('Campaign is unavailable.', 'error', 'Choose another campaign, or leave the level unassigned.');
      return;
    }
    if (targetCampaign && tierOf(targetCampaign.id) !== tierOf(targetLevelId)) {
      reportStatus('Campaign tier does not match this level.', 'error', 'Move private levels only among private campaigns, and official levels only among official campaigns.');
      return;
    }
    // Playability is the save gate (ADR-0050): never persist a rule-violating level. The button is
    // disabled while violations exist, but re-check here so a programmatic call can't slip past.
    if (!playability.ok) return;
    if (needsPlayerFaction) {
      reportStatus('Save needs a player faction.', 'warning', 'Open Board > Level Settings and assign Player to one board faction.');
      setLayer('board');
      return;
    }
    // Carry the existing level's authored metadata (objective/difficulty/economy/notes/theme)
    // so a board save doesn't reset them. The working document is the fallback for a brand-new
    // unassigned level that has not entered the canonical store yet.
    const existing = useCampaigns.getState().levels[targetLevelId] ?? editorDocument.level;
    const level = editorBoardToLevel(currentEditorBoard, {
      id: targetLevelId,
      name: levelNameForSave,
      notes: existing?.notes,
      // The Rules panel is the source of truth for objective, battle settings, and authored events;
      // setup spawning is explicit events, not the legacy placement/roster fields.
      ...modeMeta,
      difficulty: existing?.difficulty,
      economy: existing?.economy,
      theme: existing?.theme,
      // Preserve non-editor-expressible terrain (road/bridge/cliff/rock) from the saved level so
      // republishing a legacy official (no boardCode) doesn't flatten those surfaces to grass.
      previousTerrain: existing?.layers.terrain,
    });
    const official = tierOf(level.id) === 'official';
    if (official && !(await ask({
      title: 'Publish to all players?',
      message: 'This updates the official campaigns. Every player will receive these changes the next time they play.',
      confirmLabel: 'Publish',
      cancelLabel: 'Cancel',
    }))) return;
    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    setSaving(true);
    try {
      if (autosavePromiseRef.current) await autosavePromiseRef.current;
      if (documentConflictRef.current) {
        reportStatus('Save stopped by a revision conflict.', 'warning', 'No canonical data was changed.');
        return;
      }
      const revision = documentRevisionRef.current;
      if (revision === null) throw new Error('working copy revision unavailable');
      const saved = await saveEditorDocument(
        editorDocument.document_id,
        revision,
        level,
        campaignAssignmentId || null,
      );
      const doc = saved.document;
      if (saved.workspace_revision !== null) {
        if (doc.workspace_kind === 'official') {
          useCampaigns.getState().setOfficialWorkspaceRevision(saved.workspace_revision);
        } else {
          useCampaigns.getState().setUserWorkspaceRevision(saved.workspace_revision);
        }
      }
      documentRevisionRef.current = doc.revision;
      documentConflictRef.current = false;
      documentConflictKindRef.current = null;
      lastCloudSyncedSigRef.current = levelEditorLevelSignature(doc.level);
      setEditorDocument(doc);
      const acknowledgedSig = levelEditorLevelSignature(doc.level);
      const stillMatchesAcknowledgement = currentSigRef.current === acknowledgedSig;
      setCloudSaveState(stillMatchesAcknowledgement ? 'saved' : 'pending');
      setCloudSaveDetail(null);
      // This is the canonical boundary: no optimistic mutation before the server succeeds.
      useCampaigns.getState().replaceLevel(doc.level);
      useCampaigns.getState().assignLevelToCampaign(doc.level_id, campaignAssignmentId || null);
      setSavedSig(normalizedLevelEditorSignature(doc.level));
      setSavedCampaignAssignmentId(campaignAssignmentId);
      setTargetBaselineResolved(true);
      if (stillMatchesAcknowledgement) clearLevelEditorDraft(draftKey);
      syncSavedLevelRoute(doc.level_id);
      reportStatus(official ? 'Published.' : 'Saved.', 'success', 'The thumbnail and campaign play now use this position.');
    } catch (e) {
      if (isEditorDocumentConflict(e)) {
        documentRevisionRef.current = e.document.revision;
        documentConflictRef.current = true;
        documentConflictKindRef.current = isEditorDocumentBaselineConflict(e) ? 'baseline' : 'revision';
        setEditorDocument(e.document);
        setCloudSaveState('conflict');
        setCloudSaveDetail(isEditorDocumentBaselineConflict(e)
          ? 'The canonical saved position changed. Your working progress was preserved and nothing was overwritten.'
          : 'Another tab or device saved a newer revision. No canonical data was overwritten.');
        reportStatus(
          isEditorDocumentBaselineConflict(e) ? 'Save stopped because the saved position changed.' : 'Save stopped by a revision conflict.',
          'warning',
          `Your current editor remains open. ${browserRecoverySafetyDetail}`,
        );
        return;
      }
      const mapped = mapSaveError(e);
      if ('action' in mapped) { signInForEditor(); return; }
      reportStatus(mapped.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const discardChanges = async (): Promise<void> => {
    if (!editorDocument || !targetLevelId || !editorDocument.has_saved_baseline) return;
    if (!me?.signed_in || documentRevisionRef.current === null) {
      reportStatus('Cloud working copy is unavailable.', 'warning', 'Reconnect before discarding changes.');
      return;
    }
    if (!(await ask({
      title: 'Discard changes?',
      message: 'Restore the working copy to the last saved position? This deliberately removes all unsaved editor progress for this level.',
      confirmLabel: 'Discard changes',
      cancelLabel: 'Keep editing',
    }))) return;
    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    setSaving(true);
    try {
      if (autosavePromiseRef.current) await autosavePromiseRef.current;
      const revision = documentRevisionRef.current;
      if (revision === null) throw new Error('working copy revision unavailable');
      const doc = await discardEditorDocumentChanges(
        editorDocument.document_id,
        revision,
      );
      documentRevisionRef.current = doc.revision;
      documentConflictRef.current = false;
      documentConflictKindRef.current = null;
      lastCloudSyncedSigRef.current = levelEditorLevelSignature(doc.level);
      setEditorDocument(doc);
      setCloudSaveState('saved');
      setCloudSaveDetail(null);
      useCampaigns.getState().replaceLevel(doc.level);
      applyLevelDocument(doc.level, { editingId: doc.level_id, clean: true });
      setSavedSig(normalizedLevelEditorSignature(doc.level));
      setTargetBaselineResolved(true);
      setCampaignAssignmentId(savedCampaignAssignmentId);
      clearLevelEditorDraft(draftKey);
      reportStatus('Changes discarded.', 'success', 'The editor again matches the saved thumbnail and campaign position.');
    } catch (error) {
      if (isEditorDocumentConflict(error)) {
        documentRevisionRef.current = error.document.revision;
        documentConflictRef.current = true;
        setEditorDocument(error.document);
        setCloudSaveState('conflict');
        setCloudSaveDetail('The working copy changed in another tab. Review and choose Discard changes again.');
        reportStatus('Discard stopped by a revision conflict.', 'warning', 'Nothing was discarded.');
      } else {
        reportStatus('Discard failed.', 'error', (error as Error).message);
      }
    } finally {
      setSaving(false);
    }
  };

  const selectLayer = (nextLayer: LayerKey): void => {
    if (isLayerOptionDisabled(nextLayer)) return;
    setLayer(nextLayer);
    setTool(toolForLayer(nextLayer));
    if (nextLayer === 'paths') {
      // Keep whichever path kind is already armed (road/river); default to road.
      setBrushKind((kind) => (kind === 'road' || kind === 'river' ? kind : 'road'));
      return;
    }
    if (nextLayer !== 'board' && nextLayer !== 'status' && nextLayer !== 'rules' && nextLayer !== 'generate') setBrushKind(nextLayer);
  };
  const selectCell = (x: number, y: number): void => setSelectedCell({ x, y });
  const eventZoneOptions = useMemo<EventZoneOption[]>(
    () => boardZoneEntries.map((entry, index) => ({ id: entry.id, label: zoneDisplayName(entry, index) })),
    [boardZoneEntries],
  );
  const removeZonesForRemovedEvents = (removedEvents: readonly LevelEvent[], remainingEvents: readonly LevelEvent[]): void => {
    const board = cloneEditorBoard(currentEditorBoardRef.current);
    const entries = zoneEntriesForBoard(board);
    const updated = removeZoneEntriesReferencedOnlyByRemovedEvents(entries, removedEvents, remainingEvents);
    if (!updated) return;
    commitEditorBoard(withZoneEntries(board, updated), null);
  };
  const setEventsWithZoneCleanup = (nextEvents: LevelEvents, removedEvents: readonly LevelEvent[] = []): void => {
    const normalizedNextEvents = normalizeLevelEvents(nextEvents);
    setEvents(normalizedNextEvents);
    if (removedEvents.length) removeZonesForRemovedEvents(removedEvents, normalizedNextEvents);
  };
  const clearOtherEvents = (): void => setEventsWithZoneCleanup([], events);
  const addPawnPromotionTemplate = (): void => {
    const board = cloneEditorBoard(currentEditorBoardRef.current);
    const entries = zoneEntriesForBoard(board).map((entry) => ({ ...entry, tiles: [...entry.tiles] }));
    const directions = normalizeFactionDirections(board.factionDirections);
    const makeZone = (side: 'player' | 'enemy'): string => {
      const boardPlayerFaction = isUnitPalette(board.playerFaction) ? board.playerFaction : playerFaction;
      const faction = sideDefaultFaction(side, boardPlayerFaction, board.units as Record<string, BoardUnitPlacement>);
      const direction = factionDefaultDirection(faction, directions);
      const name = uniqueZoneEntryName(side === 'player' ? 'Player promotion zone' : 'Enemy promotion zone', entries);
      const id = nextZoneEntryId(entries);
      entries.push({
        id,
        name,
        color: 'amber',
        type: DEFAULT_ZONE_TYPE,
        tiles: promotionEdgeTiles(board.cols, board.rows, direction),
      });
      return id;
    };
    const playerZoneId = makeZone('player');
    const enemyZoneId = makeZone('enemy');
    let nextEvents = events.slice();
    const appendPromotion = (side: 'player' | 'enemy', zoneId: string): void => {
      const baseName = side === 'player' ? 'Player pawn promotion' : 'Enemy pawn promotion';
      const name = uniqueEventName(baseName, nextEvents);
      const event: LevelEvent = {
        id: uniqueEventId(baseName, nextEvents),
        name,
        trigger: { kind: 'unit-enters-zone', unit: { type: 'pawn', side }, zoneId },
        do: [{ kind: 'promote', target: { kind: 'triggering-unit' } }],
      };
      nextEvents = [...nextEvents, event];
    };
    appendPromotion('player', playerZoneId);
    appendPromotion('enemy', enemyZoneId);
    commitEditorBoard(withZoneEntries(board, entries), null);
    setEvents(nextEvents);
  };
  // Scan the painted board for castleable king-rook pairs (see castlingTemplate.ts) and
  // append one castle event per pair, squares baked in — mirrors the promotion template's
  // read-the-live-board pattern, but needs no zones so only the events list changes.
  const addCastlingTemplate = (): void => {
    const board = currentEditorBoardRef.current;
    const boardPlayerFaction = isUnitPalette(board.playerFaction) ? board.playerFaction : playerFaction;
    // Castle events bake a player/enemy side, but the SAVE maps units to sides by the
    // assigned Player faction (levelBoard.sideForFaction) — guessing here while it's unset
    // would silently invert every pair once the author assigns it. Refuse instead.
    if (!boardPlayerFaction) {
      reportStatus('Assign a Player faction before adding castling.', 'error', 'Castle events are tagged player/enemy by faction. Set the Player faction first so each king-rook pair lands on the right side.');
      return;
    }
    const player = boardPlayerFaction;
    const units: CastleTemplateUnit[] = [];
    for (const [key, placement] of Object.entries(board.units as Record<string, BoardUnitPlacement>)) {
      const [x, y] = key.split(',').map(Number);
      const type = unitAssetById(placement.unitId)?.family;
      if (type !== 'king' && type !== 'rook') continue;
      units.push({ x, y, type, side: placement.faction === player ? 'player' : 'enemy' });
    }
    const pairs = computeCastleTemplatePairs(units);
    if (!pairs.length) {
      reportStatus('No castleable king-rook pairs on the board.', 'error', 'Castling needs a king and a rook of one side on the same rank or file, at least 3 squares apart.');
      return;
    }
    let nextEvents = events.slice();
    for (const pair of pairs) {
      nextEvents = [...nextEvents, {
        id: uniqueEventId(pair.name, nextEvents),
        name: uniqueEventName(pair.name, nextEvents),
        trigger: { kind: 'setup' },
        do: [pair.action],
      }];
    }
    setEvents(nextEvents);
    reportStatus(`Added ${pairs.length} castling event${pairs.length === 1 ? '' : 's'}.`, 'success');
  };
  // One event that arms both chess draw rules; the detail pane's toggles narrow it.
  const addChessDrawsTemplate = (): void => {
    const name = uniqueEventName('Chess draws', events);
    setEvents([...events, {
      id: uniqueEventId('chess-draws', events),
      name,
      trigger: { kind: 'setup' },
      do: [{ kind: 'chess-draws', fiftyMove: true, threefold: true }],
    }]);
    reportStatus('Added chess draw rules (50-move rule + threefold repetition).', 'success');
  };
  const addOtherEventTemplate = (): void => {
    if (otherTemplateChoice === 'pawn-promotion') addPawnPromotionTemplate();
    else if (otherTemplateChoice === 'castling') addCastlingTemplate();
    else if (otherTemplateChoice === 'chess-draws') addChessDrawsTemplate();
  };
  // One-click "Clear pieces": drop every painted unit, offered next to setup-spawn validation
  // when events are dealing the starting forces.
  const clearUnits = (): void => setBoardUnits((prev) => (Object.keys(prev).length ? {} : prev));
  // A held unit/prop may drop only where a freshly painted object of the same kind could land.
  // Props validate their whole footprint and ignore their own old footprint while moving.
  const canMoveObjectTo = (subject: MoveSubject, to: { x: number; y: number }): boolean => {
    if (subject.kind === 'unit') {
      const key = `${to.x},${to.y}`;
      return to.x >= 0 && to.y >= 0 && to.x < boardCols && to.y < boardRows && !boardUnits[key] && !occupiedPropCells().has(key);
    }
    const fromKey = `${subject.x},${subject.y}`;
    const def = resolvePropDef(subject.propId);
    return !!def && canPlaceProp(def, to.x, to.y, fromKey);
  };
  // Relocate a placed unit or prop (drag-and-drop under the Move tool): re-key its placement from
  // the source cell/anchor to the destination, preserving the object identity and selection.
  const moveObject = (subject: MoveSubject, to: { x: number; y: number }): void => {
    const fromKey = `${subject.x},${subject.y}`;
    const toKey = `${to.x},${to.y}`;
    if (!canMoveObjectTo(subject, to)) return;
    const next = cloneEditorBoard(currentEditorBoardRef.current);
    if (subject.kind === 'unit') {
      const placement = next.units[fromKey];
      if (!placement) return;
      delete next.units[fromKey];
      next.units[toKey] = placement;
    } else {
      const placement = next.props[fromKey];
      if (!placement || placement.propId !== subject.propId) return;
      delete next.props[fromKey];
      next.props[toKey] = placement;
    }
    commitEditorBoard(next, to);
  };
  const adjustZoom = (delta: number): void => setViewZoom((z) => Math.min(4, Math.max(0.4, Number((z + delta).toFixed(2)))));
  const resetBoardView = (): void => {
    setViewZoom(1);
    setViewPan({ x: 0, y: 0 });
  };
  // Resize the board. Growing exposes new empty (paintable) cells; shrinking prunes any
  // tiles/units — and a now-offboard selection — whose coordinates fall outside the new
  // bounds, so nothing keeps rendering or counting off the edge of the board.
  const resizeBoard = (nextCols: number, nextRows: number): void => {
    const within = (key: string): boolean => {
      const [cx, cy] = key.split(',').map(Number);
      return cx >= 0 && cy >= 0 && cx < nextCols && cy < nextRows;
    };
    const prune = <T,>(map: Record<string, T>): Record<string, T> => {
      const next: Record<string, T> = {};
      let dropped = false;
      for (const key of Object.keys(map)) { if (within(key)) next[key] = map[key]; else dropped = true; }
      return dropped ? next : map;
    };
    const nextBoard = cloneEditorBoard(currentEditorBoardRef.current);
    nextBoard.cells = prune(nextBoard.cells);
    nextBoard.units = prune(nextBoard.units);
    nextBoard.doodads = prune(nextBoard.doodads);
    // Props are FOOTPRINT-aware: drop a prop if its anchor OR any footprint cell falls outside
    // the new bounds (a 2×2 anchored at the last column would otherwise hang off the edge).
    {
      const next: Record<string, { propId: string }> = {};
      let dropped = false;
      for (const [key, placement] of Object.entries(nextBoard.props)) {
        const def = resolvePropDef(placement.propId);
        const [ax, ay] = key.split(',').map(Number);
        const fits = def
          ? ax >= 0 && ay >= 0 && ax + def.w <= nextCols && ay + def.h <= nextRows
          : within(key); // unknown id: fall back to the anchor-only check
        if (fits) next[key] = placement;
        else dropped = true;
      }
      if (dropped) nextBoard.props = next;
    }
    nextBoard.cover = prune(nextBoard.cover);
    nextBoard.features = prune(nextBoard.features);
    // Zone entries keep their identity on resize; only their off-board tiles are pruned.
    {
      const entries = zoneEntriesForBoard(nextBoard).map((entry) => ({ ...entry, tiles: entry.tiles.filter(within) }));
      Object.assign(nextBoard, withZoneEntries(nextBoard, entries));
    }
    const prunedGeneratedRegions = (nextBoard.generatedRegions ?? [])
      .map((region) => ({ ...region, cells: sortRegionCells(region.cells.filter((key) => within(key))) }))
      .filter((region) => region.cells.length > 0);
    nextBoard.generatedRegions = prunedGeneratedRegions;
    // Cuts are keyed by edge ("a|b"); keep only edges whose BOTH endpoints survive.
    {
      const next: Record<string, true> = {};
      let dropped = false;
      for (const edge of Object.keys(nextBoard.featureCuts)) {
        const [p1, p2] = edge.split('|');
        if (within(p1) && within(p2)) next[edge] = true;
        else dropped = true;
      }
      if (dropped) nextBoard.featureCuts = next;
    }
    // Exits point at an OFF-board neighbour (always out of bounds by design), so keep an exit
    // whenever its owning cell — whichever endpoint is still on the board — survives.
    {
      const next: Record<string, true> = {};
      let dropped = false;
      for (const edge of Object.keys(nextBoard.featureExits)) {
        const [p1, p2] = edge.split('|');
        if (within(p1) || within(p2)) next[edge] = true;
        else dropped = true;
      }
      if (dropped) nextBoard.featureExits = next;
    }
    // Boundary fences also use one off-board endpoint; keep any rail touching a surviving cell.
    {
      const next: Record<string, FenceMaterial> = {};
      let dropped = false;
      for (const [edge, material] of Object.entries(nextBoard.fences ?? {})) {
        const [p1, p2] = edge.split('|');
        if ((p1 && within(p1)) || (p2 && within(p2))) next[edge] = material;
        else dropped = true;
      }
      if (dropped) nextBoard.fences = next;
    }
    // Walls are perimeter-only; after a resize, keep just the northmost/westmost edges
    // that are still valid on the new board bounds.
    {
      const next: Record<string, WallMaterial> = {};
      let dropped = false;
      for (const [edge, material] of Object.entries(nextBoard.walls ?? {})) {
        const [p1, p2] = edge.split('|');
        if (((p1 && within(p1)) || (p2 && within(p2))) && isNorthWestBoundaryWallEdge(edge, { cols: nextCols, rows: nextRows })) next[edge] = material;
        else dropped = true;
      }
      if (dropped) nextBoard.walls = next;
    }
    {
      const next: Record<string, WallArtId> = {};
      let dropped = false;
      const bounds = { cols: nextCols, rows: nextRows };
      const walls = nextBoard.walls ?? {};
      for (const [edge, artId] of Object.entries(nextBoard.wallArt ?? {})) {
        const spanEdges = wallArtSpanEdges(edge, artId, bounds);
        if (
          isNorthWestBoundaryWallEdge(edge, bounds)
          && spanEdges.length === wallArtSpanForId(artId)
          && spanEdges.every((spanEdge) => Boolean(walls[spanEdge]))
        ) next[edge] = artId;
        else dropped = true;
      }
      if (dropped) nextBoard.wallArt = next;
    }
    nextBoard.cols = nextCols;
    nextBoard.rows = nextRows;
    commitEditorBoard(nextBoard, selectedCell && (selectedCell.x >= nextCols || selectedCell.y >= nextRows) ? null : selectedCell);
    if (activeGeneratedRegionId) {
      const activeAfterResize = prunedGeneratedRegions.find((region) => region.id === activeGeneratedRegionId);
      if (activeAfterResize) setRegionSelection(new Set(activeAfterResize.cells));
      else {
        setActiveGeneratedRegionId(null);
        setRegionSelection(new Set());
      }
    } else {
      setRegionSelection((prev) => new Set([...prev].filter((key) => within(key))));
    }
  };

  const paintedCount = Object.keys(boardCells).length;
  const unitCount = Object.keys(boardUnits).length;
  const doodadCount = Object.keys(boardDoodads).length;
  const propCount = Object.keys(boardProps).length;
  const zoneCount = boardZoneEntries.length;
  const zonedTileCount = boardZoneEntries.reduce((sum, zone) => sum + zone.tiles.length, 0);
  const selectedTileId = selectedCell ? boardCells[`${selectedCell.x},${selectedCell.y}`] : undefined;
  const selectedAsset = selectedTileId ? resolveAsset(selectedTileId) : undefined;
  const selectedUnit = selectedCell ? boardUnits[`${selectedCell.x},${selectedCell.y}`] : undefined;
  const selectedUnitAsset = selectedUnit ? resolveUnitAsset(selectedUnit.unitId) : undefined;
  const selectedDoodad = selectedCell ? boardDoodads[`${selectedCell.x},${selectedCell.y}`] : undefined;
  const selectedDoodadAsset = selectedDoodad ? resolveDoodadAsset(selectedDoodad.doodadId) : undefined;
  // The prop whose footprint contains the selected cell (a click anywhere on a 2×2 selects it),
  // plus its def — for the Details panel.
  const selectedProp = useMemo(() => {
    if (!selectedCell) return undefined;
    for (const [key, placement] of Object.entries(boardProps)) {
      const def = resolvePropDef(placement.propId);
      if (!def) continue;
      const [ax, ay] = key.split(',').map(Number);
      if (propCells(ax, ay, def).some((c) => c.x === selectedCell.x && c.y === selectedCell.y)) {
        return { anchor: { x: ax, y: ay }, def };
      }
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCell, boardProps]);
  const coverCount = Object.keys(boardCover).length;
  const selectedFeature = selectedCell ? boardFeatures[`${selectedCell.x},${selectedCell.y}`] : undefined;
  const selectedZones = selectedCell
    ? boardZoneEntries
      .map((zone, index) => ({ zone, index }))
      .filter(({ zone }) => zone.tiles.includes(`${selectedCell.x},${selectedCell.y}`))
    : [];
  const addZoneEntry = (): void => {
    const next = cloneEditorBoard(currentEditorBoardRef.current);
    const entries = zoneEntriesForBoard(next).map((entry) => ({ ...entry, tiles: [...entry.tiles] }));
    entries.push({ id: nextZoneEntryId(entries), name: nextZoneEntryName(entries), color: DEFAULT_ZONE_COLOR, type: DEFAULT_ZONE_TYPE, tiles: [] });
    const nextIndex = entries.length - 1;
    setSelectedZoneIndex(nextIndex);
    commitEditorBoard(withZoneEntries(next, entries), null);
  };
  const removeActiveZoneEntry = (): void => {
    if (!activeZone) return;
    const next = cloneEditorBoard(currentEditorBoardRef.current);
    const entries = zoneEntriesForBoard(next).map((entry) => ({ ...entry, tiles: [...entry.tiles] }));
    if (!entries.length) return;
    const updated = entries.filter((_, index) => index !== selectedZoneIndex);
    const nextIndex = updated.length ? Math.min(selectedZoneIndex, updated.length - 1) : 0;
    setSelectedZoneIndex(nextIndex);
    commitEditorBoard(withZoneEntries(next, updated), null);
  };
  const selectZoneEntry = (id: string): void => {
    const index = boardZoneEntries.findIndex((zone) => zone.id === id);
    if (index >= 0) setSelectedZoneIndex(index);
  };
  const stepZoneEntry = (delta: -1 | 1): void => {
    const count = boardZoneEntries.length;
    if (!count) return;
    setSelectedZoneIndex((current) => {
      const normalized = Math.min(Math.max(current, 0), count - 1);
      return (normalized + delta + count) % count;
    });
  };
  const setActiveZoneName = (name: string): void => {
    if (!activeZone) return;
    const next = cloneEditorBoard(currentEditorBoardRef.current);
    const entries = zoneEntriesForBoard(next).map((entry, index) => index === selectedZoneIndex ? { ...entry, name } : entry);
    commitEditorBoard(withZoneEntries(next, entries));
  };
  const setActiveZoneColor = (color: ZoneColor): void => {
    if (!activeZone || !isZoneColor(color)) return;
    const next = cloneEditorBoard(currentEditorBoardRef.current);
    const entries = zoneEntriesForBoard(next).map((entry, index) => index === selectedZoneIndex ? { ...entry, color } : entry);
    commitEditorBoard(withZoneEntries(next, entries));
  };
  const toggleFeatureCut = (edge: string): void => {
    const next = cloneEditorBoard(currentEditorBoardRef.current);
    if (next.featureCuts[edge]) delete next.featureCuts[edge];
    else next.featureCuts[edge] = true;
    commitEditorBoard(next);
  };
  const toggleFeatureExit = (edge: string): void => {
    const next = cloneEditorBoard(currentEditorBoardRef.current);
    if (next.featureExits[edge]) delete next.featureExits[edge];
    else next.featureExits[edge] = true;
    commitEditorBoard(next);
  };
  // Tier of the level under edit drives the Save verb (INV6): an official (`off-`) level
  // PUBLISHES to all players; a private/unassigned level just SAVES. A level only resolves a
  // tier once a target id is known (campaign path); a fresh standalone board saves as private.
  const isOfficialTarget = targetLevelId
    ? tierOf(targetLevelId) === 'official'
    : Boolean(assignedCampaign && tierOf(assignedCampaign.id) === 'official');
  const saveLabel = isOfficialTarget ? 'Publish to all players' : 'Save';
  const cloudDocumentAvailable = Boolean(me?.signed_in && editorDocument && targetLevelId && targetBaselineResolved);
  const targetSaveUnavailable = !cloudDocumentAvailable;
  // Save (user save AND official publish) is gated on ZERO playability violations (ADR-0050) — the
  // editor gives full freedom to mess the board up, but blocks persisting a rule-breaking level —
  // AND on main's conditions: hydrated workspace/association context, something to save (dirty),
  // no in-flight save, and (campaign levels) a resolved Player faction.
  const persistenceHydration = isOfficialTarget ? officialWorkspaceHydration : userWorkspaceHydration;
  const saveContextReady = persistenceHydration === 'ready' && campaignAssignmentHydrated;
  const canSave = saveContextReady && !saving && !targetSaveUnavailable && !documentConflictRef.current && dirty && !needsPlayerFaction && playability.ok;
  const saveBlockedMessage = saving
    ? 'Save is already in progress.'
    : !me?.signed_in && authReachable === false
    ? 'Reconnect to save this level.'
    : !me?.signed_in
    ? 'Sign in to save this level.'
    : documentConflictRef.current
    ? 'Save is paused because another tab or device has a newer revision.'
    : targetSaveUnavailable
    ? 'Save is blocked because the cloud working copy is unavailable.'
    : persistenceHydration === 'unavailable'
    ? isOfficialTarget ? 'Official campaigns are unavailable.' : 'Your workspace is unavailable.'
    : !saveContextReady
    ? 'Workspace is still loading.'
    : !playability.ok
    ? 'Save is blocked by playability issues.'
    : needsPlayerFaction
    ? 'Save is blocked because this campaign level needs a Player faction.'
    : !dirty && targetLevelId
    ? 'Save is disabled because this draft already matches the saved level.'
    : !dirty
    ? 'Save is disabled because this standalone draft has no new changes.'
    : '';
  const saveBlockedDetail = saving
    ? 'Wait for the current save to finish.'
    : !me?.signed_in && authReachable === false
    ? browserRecoverySafetyDetail
    : !me?.signed_in
    ? `${browserRecoverySafetyDetail} Sign in to sync and save it.`
    : documentConflictRef.current
    ? `Your current editor remains open. Discard changes restores the latest saved position. ${browserRecoverySafetyDetail}`
    : targetSaveUnavailable
    ? `Reconnect to restore cloud autosave. ${browserRecoverySafetyDetail}`
    : persistenceHydration === 'unavailable'
    ? `Working-copy autosave remains safe, but Save is locked to protect the canonical workspace. ${browserRecoverySafetyDetail}`
    : !saveContextReady
    ? 'Editing is ready; Save will unlock as soon as your campaigns finish loading.'
    : !playability.ok
    ? 'Resolve the issues in the Fix-before-saving list above, then Save.'
    : needsPlayerFaction
    ? 'Open Board > Level Settings, then assign Player to one board faction.'
    : !dirty && targetLevelId
    ? 'Make an edit to create a new saved position.'
    : !dirty
    ? 'Make an edit; then Save will create the canonical level.'
    : '';
  const explainBlockedSave = (): void => {
    if (!saveBlockedMessage) return;
    // Playability blocks stay on 'status': the Fix-before-saving list renders there, beside Save.
    setLayer(needsPlayerFaction && playability.ok ? 'board' : 'status');
    setTool('select');
    reportStatus(saveBlockedMessage, saving || persistenceHydration === 'loading' ? 'info' : 'warning', saveBlockedDetail);
  };
  const progressStateLabel = cloudSaveState === 'loading'
    ? 'Opening working copy…'
    : cloudSaveState === 'local'
    ? localBackupAvailable === true
      ? 'Saved in this browser'
      : localBackupAvailable === false
      ? 'Browser recovery unavailable'
      : 'Saving in this browser…'
    : cloudSaveState === 'pending' || cloudSaveState === 'saving'
    ? 'Saving progress…'
    : cloudSaveState === 'saved'
    ? 'Progress saved'
    : cloudSaveState === 'conflict'
    ? 'Autosave paused'
    : 'Cloud autosave interrupted';
  const hasDiscardableChanges = Boolean(
    editorDocument?.has_saved_baseline
    && (dirty || documentConflictRef.current),
  );
  // Button text should name the available action or the current blocker. In particular, a clean
  // official level should not look like it is waiting to publish.
  const saveButtonLabel = canSave
    ? saveLabel
    : saving
    ? 'Saving…'
    : !me?.signed_in
    ? 'Sign in to save'
    : documentConflictRef.current
    ? 'Revision conflict'
    : targetSaveUnavailable
    ? 'Working copy unavailable'
    : persistenceHydration === 'unavailable'
    ? 'Unavailable'
    : !saveContextReady
    ? 'Loading…'
    : !playability.ok
    ? 'Fix issues'
    : needsPlayerFaction
    ? 'Set Player'
    : !dirty
    ? 'No changes'
    : saveLabel;
  // Test always means the board the author is looking at. The exact current snapshot rides the URL,
  // so saving/publishing is persistence—not permission to iterate. The return link keeps the
  // durable level target while carrying this exact in-progress snapshot back to the editor.
  const testHref = useMemo(() => {
    if (!playability.ok) return undefined;
    return currentBoardTestHref({
      boardCode: encodeBoard(currentEditorBoard),
      levelName: levelNameForSave,
      objective,
      surviveTurns,
      timeControl: clockEnabled ? { initialSeconds: clockInitialSeconds, incrementSeconds: clockIncrementSeconds } : undefined,
      events: eventsForSave,
      victory: victoryForSave,
      editorSearch: window.location.search,
      campaignId: routeParams.campaignId,
      levelId: targetLevelId,
      documentRevision: editorDocument?.revision,
      editorReturnTo: routeParams.returnTo,
      layer,
    });
  }, [clockEnabled, clockIncrementSeconds, clockInitialSeconds, currentEditorBoard, editorDocument?.revision, eventsForSave, layer, levelNameForSave, objective, playability.ok, routeParams.campaignId, routeParams.returnTo, surviveTurns, targetLevelId, victoryForSave]);

  return (
    // The level editor is a homepage-family surface: it shows the ONE shared HomepageBackdrop
    // (menu scene + synced rain), not the battlefield world. The backdrop is a SIBLING of the
    // faded editor chrome (not a child) so it stays continuous across navigation and never
    // re-fades on entrance (ADR-0046 §G) — the same shape CampaignEditor uses. The editor's own
    // ::before battlefield is dropped (.level-editor-screen::before) so the shared scene shows
    // through the transparent chrome; /play keeps that battlefield (its game world).
    <div className="level-editor-root">
      <HomepageBackdrop />
      <ArtRouteChrome className="skirmish-screen level-editor-screen" data-testid="level-editor" ready={editorReady}>
        {confirmDialog}
        {/* The title bar carries NO editor status (no level name, no save-state chip) — the
            owner removed the center cluster: that's ambient chrome noise while editing, and
            everything it said lives in the Status layer for whoever goes looking. Only the
            return nav rides the bar (below). */}
        {editorReady ? <TitleBarSlot region="actions">
          {/* Only the RETURN nav rides the global title bar now (‹ Catalog / ‹ Back). The
              workspace ACTIONS live in the editor's OWN chrome — tools + Undo/Redo in the pinned
              dock (.le-actions-dock), Test in that always-visible dock, and Save/Publish in
              the Status layer card — because
              document verbs belong in the editor's toolbar, not global chrome (the
              Unity/Unreal/Godot/Blender convention). The bar stays brand + return-nav +
              account cluster, matching Settings. */}
          <TitleBarActions aria-label="Editor navigation">
            {cameFromStudio ? <TitleBarButton to="/studio" title="Return to the Studio catalog">‹ Catalog</TitleBarButton> : null}
            {routeParams.returnTo ? <TitleBarButton variant="return" to={routeParams.returnTo} title="Return to the campaign editor">‹ Back</TitleBarButton> : null}
          </TitleBarActions>
        </TitleBarSlot> : null}

        <div className="skirmish-field" inert={!editorReady || saving ? true : undefined} aria-busy={!editorReady || saving || undefined}>
          <div className="skirmish-board-frame">
            <ViewPane kind="board" ariaLabel="Level editor board" zoom={viewZoom} pan={viewPan} minZoom={0.4} maxZoom={4} onZoomChange={setViewZoom} onPanChange={setViewPan}>
              <div className="tileset-view-board-content is-board">
                {editorLoadError ? (
                  <div className="tileset-view-empty" role="status" aria-live="polite">
                    <h2>{editorLoadError.title}</h2>
                    <p>{editorLoadError.detail}</p>
                    {editorLoadError.signIn ? (
                      <button type="button" className="le-seg-btn" onClick={signInForEditor}>Sign in</button>
                    ) : null}
                    {editorLoadError.retry ? (
                      <button type="button" className="le-seg-btn" onClick={retryCloudDocument}>Retry</button>
                    ) : null}
                  </div>
                ) : (
                  <StudioEditableBoard
                    cols={boardCols}
                    rows={boardRows}
                    cells={boardCells}
                    macroTiles={boardMacroTiles}
                    units={boardUnits}
                    doodads={boardDoodads}
                    props={boardProps}
                    features={featureOverlays}
                    zones={visibleZones}
                    resolveAsset={resolveAsset}
                    resolveUnit={resolveUnitAsset}
                    resolveDoodad={resolveDoodadAsset}
                    resolveProp={resolvePropDef}
                    tool={tool}
                    selectedCell={selectedCell}
                    boardZoom={viewZoom}
                    boardPan={viewPan}
                    showGrid={showGrid}
                    tacticalPreview={tacticalPreview}
                    animationFrame={animationFrame}
                    onPaint={paintCell}
                    onErase={eraseCell}
                    onSelect={selectCell}
                    onMove={moveObject}
                    canMoveTo={canMoveObjectTo}
                    fences={boardFences}
                    cover={boardCover}
                    coverTypes={boardCoverTypes}
                    coverSeed={coverSeed}
                    fenceTool={fenceTool}
                    onPaintEdge={paintFenceEdge}
                    onEraseEdge={eraseFenceEdge}
                    walls={boardWalls}
                    wallTool={wallTool}
                    onPaintWallEdge={paintWallEdge}
                    onEraseWallEdge={eraseWallEdge}
                    wallArt={boardWallArt}
                    wallArtBrushId={wallArtBrushId}
                    wallArtTool={wallArtTool}
                    onPaintWallArtEdge={paintWallArtEdge}
                    onEraseWallArtEdge={eraseWallArtEdge}
                    propBrush={brushKind === 'prop' ? { def: propBrushDef, canPlaceAt: (ax, ay) => canPlaceProp(propBrushDef, ax, ay) } : null}
                    macroTileBrush={brushKind === 'tile' ? macroTileBrushAsset : null}
                    regionCells={regionSelection}
                    onRegionStart={regionSelectPatch}
                  />
                )}
              </div>
            </ViewPane>
          </div>
          {eventsOpen ? (
            <div className="le-events-overlay" role="dialog" aria-label="Level events editor">
              <div className="le-events-head">
                <h2>Events</h2>
                <div className="le-events-head-actions">
                  <div className="le-seg le-events-tabs" role="tablist" aria-label="Event editor sections">
                    <button type="button" role="tab" aria-selected={eventsTab === 'victory'} className={`le-seg-btn ${eventsTab === 'victory' ? 'active' : ''}`.trim()} onClick={() => setEventsTab('victory')}>Victory rules</button>
                    <button type="button" role="tab" aria-selected={eventsTab === 'other'} className={`le-seg-btn ${eventsTab === 'other' ? 'active' : ''}`.trim()} onClick={() => setEventsTab('other')}>Other events</button>
                  </div>
                  <button type="button" className="le-seg-btn le-events-done" onClick={closeEventsEditor}>Done</button>
                </div>
              </div>
              {eventsTab === 'victory' ? (
                <VictoryConditionsEditor
                  value={victory}
                  factions={victoryFactions}
                  onChange={setVictory}
                  templates={(
                    <div className="le-events-templates">
                      <h3 className="le-victory-head">Template</h3>
                      <p className="le-board-note">Add a victory template. Existing events stay in place; use Clear first when you want a clean replacement.</p>
                      <div className="le-template-apply">
                        <SelectFrame className="le-template-select-wrap">
                          <select className="le-layer-select" aria-label="Victory template" title={MODE_DESCRIPTION[templateChoice]}
                            value={templateChoice} onChange={(e) => setTemplateChoice(e.target.value as ObjectiveType)}>
                            {OBJECTIVE_TYPES.map((mode) => <option key={mode} value={mode}>{MODE_NAME[mode]}</option>)}
                          </select>
                        </SelectFrame>
                        <button type="button" className="le-seg-btn" onClick={() => {
                          const seedUnits = candidateLevel.layers.units.map((u) => ({ ...u, id: '', alive: true, startY: u.y }));
                          const templateRules = victoryRulesForObjective(templateChoice, { surviveTurns, kingSide: kingSideOf(seedUnits) });
                          setVictory((prev) => appendRules(prev, templateRules));
                        }}>Add template</button>
                        <button type="button" className="le-seg-btn danger" disabled={victory.length === 0} onClick={() => setVictory([])}>Clear rules</button>
                      </div>
                      <p className="le-board-note">Events run top-to-bottom, first match decides. To save, every faction on the board needs a way to win and a way to lose.</p>
                    </div>
                  )}
                />
              ) : (
                <LevelEventsEditor
                  value={events}
                  zones={eventZoneOptions}
                  onChange={setEventsWithZoneCleanup}
                  templates={(
                    <div className="le-events-templates">
                      <h3 className="le-victory-head">Template</h3>
                      <p className="le-board-note">Add a non-victory event template. Existing events stay in place; use Clear first when you want a clean replacement.</p>
                      <div className="le-template-apply">
                        <SelectFrame className="le-template-select-wrap">
                          <select className="le-layer-select" aria-label="Other event template"
                            value={otherTemplateChoice} onChange={(e) => setOtherTemplateChoice(e.target.value as OtherEventTemplateId)}>
                            {OTHER_EVENT_TEMPLATES.map((template) => <option key={template.id} value={template.id}>{template.label}</option>)}
                          </select>
                        </SelectFrame>
                        <button type="button" className="le-seg-btn" onClick={addOtherEventTemplate}>Add template</button>
                        <button type="button" className="le-seg-btn danger" disabled={events.length === 0} onClick={clearOtherEvents}>Clear events</button>
                      </div>
                      <p className="le-board-note">Clear affects only this events list and any zones used only by those events.</p>
                    </div>
                  )}
                />
              )}
            </div>
          ) : null}
        </div>

      {editorLoadError ? (
      <aside className="skirmish-hud" aria-label="Editor document access" inert={!editorReady || saving ? true : undefined}>
        <section className="skirmish-card le-status-card">
          <h2>Document</h2>
          <div className="le-status-current is-blocked">
            <strong>{editorLoadError.title}</strong>
            <span>{editorLoadError.detail}</span>
          </div>
          {editorLoadError.signIn ? (
            <button type="button" className="le-seg-btn" style={{ width: '100%' }} onClick={signInForEditor}>Sign in</button>
          ) : null}
          {editorLoadError.retry ? (
            <button type="button" className="le-seg-btn" style={{ width: '100%' }} onClick={retryCloudDocument}>Retry</button>
          ) : null}
        </section>
      </aside>
      ) : (
      <aside className="skirmish-hud" aria-label="Editor controls" inert={!editorReady || saving ? true : undefined} aria-busy={!editorReady || saving || undefined}>
        <section className="skirmish-card">
          <h2>Layer</h2>
          <SelectFrame>
            <select
              className="le-layer-select"
              aria-label="Editor layer"
              value={layer}
              onChange={(e) => selectLayer(e.target.value as LayerKey)}
            >
              {LEVEL_EDITOR_LAYER_OPTIONS.map((option) => (
                <option key={option.id} value={option.id} disabled={isLayerOptionDisabled(option.id)}>
                  {option.label}
                </option>
              ))}
            </select>
          </SelectFrame>
        </section>

        {/* Pinned editor ACTIONS dock: tools, Undo/Redo, and current-board Test stay above the sole
            scroll region, visible on every layer without overlaying the board. */}
        <section className="skirmish-card le-actions-dock" aria-label="Editor actions">
          <h2>Actions</h2>
          <div className="le-seg le-seg-icons le-action-toolbar" role="toolbar" aria-label="Editor tools and history">
            <button type="button" className={`le-seg-btn ${tool === 'select' ? 'active' : ''}`.trim()} onClick={() => setTool('select')} title="Select" aria-label="Select"><span className="le-ico ic-eyedropper" aria-hidden="true" /></button>
            <button type="button" className={`le-seg-btn ${tool === 'brush' ? 'active' : ''}`.trim()} onClick={() => setTool('brush')} title="Brush" aria-label="Brush"><span className="le-ico ic-brush" aria-hidden="true" /></button>
            <button type="button" className={`le-seg-btn ${tool === 'erase' ? 'active' : ''}`.trim()} onClick={() => setTool('erase')} title="Erase" aria-label="Erase"><span className="le-ico ic-eraser" aria-hidden="true" /></button>
            <button type="button" className={`le-seg-btn ${tool === 'move' ? 'active' : ''}`.trim()} onClick={() => setTool('move')} title="Move — drag a placed unit or prop to a new cell." aria-label="Move"><span className="le-ico ic-move" aria-hidden="true" /></button>
            <span className="le-action-toolbar-divider" aria-hidden="true" />
            <button
              type="button"
              className="le-seg-btn le-icon-btn"
              onClick={undoBoard}
              disabled={!undoStack.length}
              aria-label="Undo"
              title={undoStack.length ? 'Undo the last board edit.' : 'Nothing to undo.'}
            ><span className="le-ico ic-undo" aria-hidden="true" /></button>
            <button
              type="button"
              className="le-seg-btn le-icon-btn"
              onClick={redoBoard}
              disabled={!redoStack.length}
              aria-label="Redo"
              title={redoStack.length ? 'Redo the last undone edit.' : 'Nothing to redo.'}
            ><span className="le-ico ic-redo" aria-hidden="true" /></button>
          </div>
          {/* Test the exact board on screen, saved or not. It lives in the always-visible Actions
              dock and returns to the same editor target, making edit → test → back one loop. */}
          {testHref ? (
            <NavButton className="le-seg-btn le-play-board" data-testid="le-test" to={testHref} title="Test this exact board against the AI now. No save is required; ‹ Back returns you here.">Test</NavButton>
          ) : (
            <button type="button" className="le-seg-btn le-play-board" data-testid="le-test" disabled title="Add a player and an enemy piece (clear the playability issues in the Status layer) to test this board.">Test</button>
          )}
        </section>

        <KitScroll className="le-hud-scroll">
        {layer === 'status' ? (
          <>
          {/* Playability list (ADR-0050): while any violation exists Save is disabled and the
              level cannot persist. The list lives HERE, in the Status layer with the Save it
              gates — it began as an always-visible rail fixture, but the owner demoted it (it
              crowded every layer while editing; a blank board starts violating, so it was
              permanent). There is deliberately NO ambient signal elsewhere — the state is
              discovered when the author comes to save. Every line is plain language from
              core/validatePlayability — described by what the author sees (sides, painted
              units, spawn zones), never by schema jargon. A "Clear pieces" shortcut rides the
              "remove the placed units" violation for setup-spawn boards. */}
          {!playability.ok ? (
            <section className="skirmish-card le-violations" aria-label="Playability issues" data-testid="le-violations">
              <h2>Fix before saving</h2>
              <ul className="le-violation-list">
                {playability.violations.map((v, index) => (
                  <li key={`${v.code}-${index}`} className="le-violation">
                    <span className="le-violation-msg">{v.message}</span>
                    {v.code === 'P3_UNITS_NOT_EMPTY' ? (
                      <button type="button" className="le-seg-btn le-violation-action" onClick={clearUnits}>Clear pieces</button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <section className="skirmish-card le-status-card" aria-live="polite">
            <h2>Status</h2>
            {/* The level's identity lives with the save workflow, not duplicated in Board settings. */}
            <div className="le-status-level">
              <label className="le-status-name-field">
                <span className="le-settings-label">Name</span>
                <input
                  className="le-text-input le-level-name-input"
                  value={levelName}
                  aria-label="Level name"
                  placeholder="Untitled level"
                  maxLength={80}
                  onChange={(event) => setLevelName(event.target.value)}
                  onBlur={() => setLevelNameState(levelNameForSave)}
                />
              </label>
              {isOfficialTarget && isAdmin ? <span className="le-official-tag">OFFICIAL</span> : null}
            </div>
            {isAdmin ? (
              <div className="le-status-name-field le-status-campaign-field">
                <span className="le-settings-label">Campaign</span>
                <SelectFrame>
                  <select
                    className="le-layer-select"
                    data-testid="le-campaign-select"
                    value={campaignAssignmentId}
                    aria-label="Campaign"
                    disabled={!campaignAssignmentHydrated || saving}
                    onChange={(event) => setCampaignAssignmentId(event.currentTarget.value)}
                  >
                    <option value="">Unassigned</option>
                    {officialCampaignOptions.length ? (
                      <optgroup label="Official campaigns">
                        {officialCampaignOptions.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
                      </optgroup>
                    ) : null}
                    {privateCampaignOptions.length ? (
                      <optgroup label="Your campaigns">
                        {privateCampaignOptions.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
                      </optgroup>
                    ) : null}
                  </select>
                </SelectFrame>
                <span className="le-board-note">Admin only · Save or publish to apply this assignment.</span>
              </div>
            ) : null}
            <div className={`le-status-current ${cloudSaveState === 'error' || cloudSaveState === 'conflict' ? 'is-blocked' : 'is-ready'}`}>
              <strong>{progressStateLabel}</strong>
              <span>{cloudSaveDetail ?? (
                cloudSaveState === 'saved'
                  ? 'Your working copy is safely stored in your account.'
                  : cloudSaveState === 'local'
                  ? localBackupAvailable === true
                    ? 'This browser has a recovery copy, but it is not synced across devices.'
                    : localBackupAvailable === false
                    ? 'Browser storage is blocked or full. Keep this tab open, or sign in and retry cloud sync.'
                    : 'Writing a browser recovery copy…'
                  : 'Edits are saved automatically without changing the saved thumbnail or campaign position.'
              )}</span>
            </div>
            {/* Persistence controls live here with the state that explains them. Test is the
                always-visible current-board action above; Save/Publish remains independently gated. */}
            <div className="le-board-actions le-status-actions">
              {cloudSaveState === 'error' ? (
                <button
                  type="button"
                  className="le-seg-btn"
                  data-testid="le-retry-cloud-sync"
                  disabled={saving}
                  onClick={retryCloudDocument}
                >Retry cloud sync</button>
              ) : null}
              {editorDocument?.has_saved_baseline ? (
                <button
                  type="button"
                  className="le-seg-btn"
                  data-testid="le-discard-changes"
                  disabled={!hasDiscardableChanges || saving}
                  title={hasDiscardableChanges ? 'Revert the working copy to the last saved position.' : 'The working copy already matches the saved position.'}
                  onClick={() => void discardChanges()}
                >Discard changes</button>
              ) : null}
              <button
                type="button"
                className={`le-seg-btn ${canSave ? 'active' : 'is-blocked'}`.trim()}
                data-testid="le-save"
                aria-label={canSave ? saveLabel : `${saveButtonLabel}: ${saveBlockedMessage}`}
                title={canSave ? (isOfficialTarget ? 'Publish this level to every player (admin-gated).' : 'Save this level to your workspace.') : `${saveBlockedMessage} ${saveBlockedDetail}`.trim()}
                onClick={() => { if (canSave || !me?.signed_in) void saveLevel(); else explainBlockedSave(); }}
              >{saveButtonLabel}</button>
            </div>
            <div className="le-material-values" aria-label="Team material point values">
              <div className="le-material-values-head">
                <strong>Material</strong>
                <span>{MATERIAL_VALUE_NOTE}</span>
              </div>
              <dl>
                {UNIT_PALETTES.map((faction) => (
                  <div key={faction}>
                    <dt>
                      <i className={`le-faction-dot is-${faction}`} aria-hidden="true" />
                      <span>{LE_FACTION_LABELS[faction]}</span>
                    </dt>
                    <dd>{boardFactionMaterialValues[faction]}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div className="le-status-log" role="log" aria-label="Save status log">
              {statusLog.length ? statusLog.map((entry) => (
                <article className={`le-status-entry is-${entry.tone}`} key={entry.id}>
                  <time>{entry.at}</time>
                  <div>
                    <strong>{entry.message}</strong>
                    {entry.detail ? <span>{entry.detail}</span> : null}
                  </div>
                </article>
              )) : (
                <p className="le-board-note">No status messages yet.</p>
              )}
            </div>
          </section>
          </>
        ) : layer === 'board' ? (
          <>
          <section className="skirmish-card">
            <h2>Board</h2>
            <BoardSizePanel cols={boardCols} rows={boardRows} onResize={resizeBoard} />
            <p className="le-board-note">Width × Height in tiles. Shrinking drops tiles &amp; units outside the new bounds.</p>
            <div className="le-board-actions">
              <button type="button" className="le-seg-btn" onClick={randomizeBoardTiles} title="Replace every tile with a generated mix of production terrain.">Randomize</button>
              <button type="button" className="le-seg-btn danger" onClick={clearBoard} title="Remove every tile, unit, doodad, prop, cover patch, road, and river from the board.">Clear</button>
            </div>
          </section>
          <section className="skirmish-card le-level-settings">
            <h2>Level Settings</h2>
            <dl className="le-settings-list">
              <div><dt>Rule</dt><dd>{levelObjectiveLabel}</dd></div>
              <div><dt>Difficulty</dt><dd>{levelDifficultyLabel}</dd></div>
            </dl>
            <div className="le-faction-control">
              <span className="le-settings-label">Player Faction</span>
              {presentFactions.length ? (
                <div className="le-faction-assignments">
                  {presentFactions.map((faction) => (
                    <div className="le-faction-assignment" key={faction}>
                      <span className="le-faction-name">
                        <i className={`le-faction-dot is-${faction}`} aria-hidden="true" />
                        <span>{LE_FACTION_LABELS[faction]}</span>
                        <b>{boardFactionCounts[faction]}</b>
                      </span>
                      <span className="le-faction-fields">
                        <select
                          className="le-faction-select"
                          value={playerFaction === faction ? 'player' : 'cpu'}
                          aria-label={`${LE_FACTION_LABELS[faction]} control`}
                          onChange={onFactionControlChange(faction)}
                        >
                          {controlOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                        <DirectionPopover
                          value={directionForFaction(faction)}
                          label={`${LE_FACTION_LABELS[faction]} default facing`}
                          onChange={(direction) => setFactionDefaultDirection(faction, direction)}
                        />
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="le-board-note">Place a unit before assigning control.</p>
              )}
              {needsPlayerFaction ? <p className="le-board-warning">Assign Player to one board faction before saving.</p> : null}
            </div>
          </section>
          </>
        ) : layer === 'generate' ? (<>
          <section className="skirmish-card le-generate">
            <h2>Generate terrain</h2>
            <p className="le-board-note">Carve a saved region — or the whole board — into terrain regions. Add regions and dial each one's share (they rebalance to 100 − buffer); each becomes one contiguous area. Then Generate.</p>
            <div className="le-gen-unit-row">
              <label className="le-gen-unit-select">
                <span>Region</span>
                <select
                  className="le-gen-region-terrain"
                  value={activeGeneratedRegionId ?? ''}
                  onChange={(event) => selectGeneratedRegionUnit(event.target.value)}
                  aria-label="Saved generated region"
                >
                  <option value="">New selection</option>
                  {generatedRegions.map((region) => (
                    <option key={region.id} value={region.id}>{region.name} · {region.cells.length}</option>
                  ))}
                </select>
              </label>
              {activeGeneratedRegion ? (
                <button
                  type="button"
                  className="le-gen-icon"
                  onClick={() => removeGeneratedRegionUnit(activeGeneratedRegion.id)}
                  title={`Remove ${activeGeneratedRegion.name}`}
                  aria-label={`Remove ${activeGeneratedRegion.name}`}
                >×</button>
              ) : null}
            </div>
            <div className="le-gen-scope">
              <button
                type="button"
                className={`le-seg-btn ${tool === 'region' ? 'active' : ''}`.trim()}
                onClick={() => setTool(tool === 'region' ? 'select' : 'region')}
                title="Click an already-drawn clump to select its whole same-terrain patch. Click this button again to stop."
              >{tool === 'region' ? 'Selecting…' : 'Select region'}</button>
              <span className="le-gen-scope-label">{regionSelection.size > 0 ? `${activeGeneratedRegion?.name ?? 'Selection'} · ${regionSelection.size} cells` : 'Whole board'}</span>
              {regionSelection.size > 0 ? <button type="button" className="le-seg-btn" onClick={clearRegion} title="Clear the selection — Generate will cover the whole board.">Clear</button> : null}
            </div>
            {tool === 'region' ? <p className="le-board-note">Click a drawn clump to select its whole same-terrain patch. Generate fills the selection; everything outside it stays put.</p> : null}
            <div className="le-gen-regions" role="group" aria-label="Terrain regions">
              {scatterSections.map((sec) => (
                <div className="le-gen-region-group" key={sec.id}>
                  <div className="le-gen-region">
                    <select
                      className="le-gen-region-terrain"
                      value={sec.terrain}
                      onChange={(event) => setSectionTerrain(sec.id, event.target.value as TileFamilyId)}
                      aria-label="Region terrain"
                    >
                      {LE_SCATTER_FAMILIES.map((family) => <option key={family.id} value={family.id}>{family.label}</option>)}
                    </select>
                    <input
                      type="range"
                      className="le-gen-region-slider"
                      min={0}
                      max={100 - scatterBuffer}
                      step={1}
                      value={sec.share}
                      disabled={sec.locked}
                      onChange={(event) => setSectionShare(sec.id, Number(event.target.value))}
                      aria-label={`${sec.terrain} share`}
                    />
                    <span className="le-gen-region-val">{sec.share}% · {Math.round((sec.share / 100) * scopeCells)}</span>
                    <button type="button" className={`le-gen-icon ${sec.locked ? 'active' : ''}`.trim()} onClick={() => toggleSectionLock(sec.id)} aria-pressed={sec.locked} title={sec.locked ? 'Unlock — let this region rebalance' : 'Lock — keep this region fixed while others move'}>{sec.locked ? '🔒' : '🔓'}</button>
                    <button type="button" className="le-gen-icon" onClick={() => removeSection(sec.id)} disabled={scatterSections.length <= 1} title="Remove this region">×</button>
                  </div>
                  {macroTileAssets.some((asset) => asset.family === sec.terrain) ? (
                    <div className="le-gen-macro">
                      <SliderRow label={`Composite coverage · ${Math.round(sec.macroTileDensity * 100)}%`} value={sec.macroTileDensity} set={(value) => setSectionMacroTileDensity(sec.id, value)} min={0} max={1} step={0.05} nudge={0.05} dflt={DEFAULT_MACRO_TILE_DENSITY} />
                      <SliderRow label={`Breakup randomness · ${Math.round(sec.macroTileBreakup * 100)}%`} value={sec.macroTileBreakup} set={(value) => setSectionMacroTileBreakup(sec.id, value)} min={0} max={1} step={0.05} nudge={0.05} dflt={DEFAULT_MACRO_TILE_BREAKUP} />
                    </div>
                  ) : null}
                  <div className="le-gen-cover">
                    {sec.covers.map((c) => (
                      <div className="le-gen-cover-entry" key={c.id}>
                        <div className="le-gen-cover-head">
                          <button type="button" className="le-gen-cover-caret-btn" onClick={() => toggleCoverEntryExpand(sec.id, c.id)} aria-expanded={c.expanded} aria-label={c.expanded ? 'Collapse cover settings' : 'Expand cover settings'}>
                            <span className="le-gen-cover-caret" aria-hidden="true">{c.expanded ? '▾' : '▸'}</span>
                          </button>
                          <select className="le-gen-region-terrain" value={c.type} onChange={(event) => setCoverType(sec.id, c.id, event.target.value as GroundCoverId)} aria-label="Cover set">
                            {LE_COVER_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                          </select>
                          <button type="button" className="le-gen-icon" onClick={() => removeCover(sec.id, c.id)} title="Remove this cover">×</button>
                        </div>
                        {c.expanded ? (
                          <div className="le-gen-cover-knobs">
                            <SliderRow label={`Coverage · ${Math.round(c.knobs.amount * 100)}%`} value={c.knobs.amount} set={(v) => setCoverKnob(sec.id, c.id, 'amount', v)} min={0} max={1} step={0.05} nudge={0.05} dflt={0.6} />
                            <SliderRow label={`Coverage random · ${Math.round(c.knobs.amountRandom * 100)}%`} value={c.knobs.amountRandom} set={(v) => setCoverKnob(sec.id, c.id, 'amountRandom', v)} min={0} max={1} step={0.05} nudge={0.05} dflt={0.3} />
                            <SliderRow label={`Density · ${Math.round(c.knobs.density * 100)}% filled`} value={c.knobs.density} set={(v) => setCoverKnob(sec.id, c.id, 'density', v)} min={0} max={1} step={0.05} nudge={0.05} dflt={0.4} />
                            <SliderRow label={`Density random · ${Math.round(c.knobs.densityRandom * 100)}%`} value={c.knobs.densityRandom} set={(v) => setCoverKnob(sec.id, c.id, 'densityRandom', v)} min={0} max={1} step={0.05} nudge={0.05} dflt={0.3} />
                          </div>
                        ) : null}
                      </div>
                    ))}
                    <button type="button" className="le-gen-cover-add" onClick={() => addCover(sec.id)} title="Add a cover set to this region.">+ Add cover</button>
                  </div>
                </div>
              ))}
            </div>
            <button type="button" className="le-seg-btn le-gen-add" onClick={addSection} title="Add another terrain region and rebalance the shares.">+ Add terrain region</button>
            <SliderRow label={`Randomness buffer · ${scatterBuffer}%`} value={scatterBuffer} set={setScatterBufferBalanced} min={0} max={60} step={1} nudge={1} dflt={0} />
            <SliderRow label="Edge roughness" value={scatterWiggle} set={setScatterWiggle} min={0} max={1} step={0.05} nudge={0.05} dflt={0.5} />
            <button type="button" className="le-seg-btn le-gen-run" style={{ width: '100%', marginTop: 8 }} onClick={generateScatter} title="Roll a fresh layout into the selection (or the whole board) and autotile it.">Generate</button>
          </section>
        </>) : layer === 'rules' ? (<>
          <section className="skirmish-card">
            <h2>Victory events</h2>
            {/* ADR-0064: the rule authoring lives in a full-size overlay over the board (this panel is
                too narrow) — see the .le-events-overlay below. This card is just the entry point. */}
            <p className="le-board-note">How this level is won, lost, deployed, and promoted. {victory.length} victory event{victory.length === 1 ? '' : 's'} and {events.length} other event{events.length === 1 ? '' : 's'} set.</p>
            <button type="button" className="le-seg-btn le-events-open" onClick={() => { setEventsTab('victory'); setEventsOpen(true); }}>Open events editor</button>
          </section>

          <section className="skirmish-card">
            <h2>Battle clock</h2>
            <div className="le-ctrlrow">
              <span className="le-ctrllabel">Timed battle</span>
              <Toggle
                checked={clockEnabled}
                label="Toggle the battle clock"
                onChange={setClockEnabled}
              />
            </div>
            {clockEnabled ? (<>
              <div className="le-ctrlrow">
                <span className="le-ctrllabel">Starting time</span>
                <Stepper
                  suffix=""
                  decreaseLabel="Less starting time"
                  increaseLabel="More starting time"
                  onDecrease={() => setClockInitialSeconds((v) => stepLadder(CLOCK_INITIAL_SECONDS, v, -1))}
                  onIncrease={() => setClockInitialSeconds((v) => stepLadder(CLOCK_INITIAL_SECONDS, v, 1))}
                  edit={{
                    value: clockInitialSeconds,
                    min: 1,
                    format: formatClockSeconds,
                    parse: parseClockSeconds,
                    onCommit: (s) => setClockInitialSeconds(s),
                    ariaLabel: 'Starting time (m:ss or seconds)',
                  }}
                />
              </div>
              <div className="le-ctrlrow">
                <span className="le-ctrllabel">Increment</span>
                <Stepper
                  suffix="s"
                  decreaseLabel="Smaller increment per move"
                  increaseLabel="Larger increment per move"
                  onDecrease={() => setClockIncrementSeconds((v) => stepLadder(CLOCK_INCREMENT_SECONDS, v, -1))}
                  onIncrease={() => setClockIncrementSeconds((v) => stepLadder(CLOCK_INCREMENT_SECONDS, v, 1))}
                  edit={{
                    value: clockIncrementSeconds,
                    min: 0,
                    format: (s) => String(s),
                    parse: parseClockSeconds,
                    onCommit: (s) => setClockIncrementSeconds(s),
                    ariaLabel: 'Increment in seconds',
                  }}
                />
              </div>
            </>) : null}
            <p className="le-board-note">
              {clockEnabled
                ? 'The player’s clock counts down only on their own turn and each completed move banks the increment. Reaching zero loses the battle. The enemy is not timed. Use +/– for standard controls, or click a value to type it exactly.'
                : 'Untimed — the player can think as long as they like.'}
            </p>
          </section>
        </>) : (<>

        <section className="skirmish-card">
          <h2>Brush</h2>
          {tool === 'move' ? <p className="le-board-note">Drag a placed unit or prop to a new cell. Units keep their piece, side and facing; props keep their footprint and terrain rules.</p> : null}
          <div className="le-brush-pick">
            <span className="le-brush-thumb">
              {brushKind === 'unit'
                ? <img src={unitBrushAsset.sprite(unitFaction, unitBrushDirection)} alt="" draggable={false} />
                : brushKind === 'doodad'
                ? <img src={doodadBrushAsset.front} alt="" draggable={false} />
                : brushKind === 'prop'
                ? <img src={propHalfSrc(propBrushDef.spriteId, 'front')} alt="" draggable={false} />
                : brushKind === 'cover'
                ? <GroundCoverPreview asset={coverBrushAsset} />
                : brushKind === 'zone'
                ? <span className={`le-brush-thumb-zone le-zone-${activeZoneColor}`} aria-hidden="true" />
                : wallTool
                ? <img src={wallThumbSrc(wallBrushMaterial)} alt="" draggable={false} />
                : wallArtTool
                ? wallArtBrush ? <WallArtPreview art={wallArtBrush} zoom={0.46} /> : null
                : fenceTool
                ? <img src={fenceThumbSrc(fenceBrushMaterial)} alt="" draggable={false} />
                : featureKind
                ? <img src={featureThumbSrc(featureKind, featureBrushMaterial[featureKind])} alt="" draggable={false} />
                : macroTileBrushAsset
                ? <img className="le-thumb-macro" src={macroTileBrushAsset.src} alt="" draggable={false} />
                : <img className="le-thumb-tile" src={tileTopSrc(brushAsset)} alt="" draggable={false} onError={(e) => { const img = e.currentTarget; if (img.src.endsWith('-top.png')) img.src = brushAsset.src; }} />}
            </span>
            <span className="le-brush-meta">
              <strong>{brushKind === 'unit' ? unitBrushAsset.label : brushKind === 'doodad' ? doodadBrushAsset.label : brushKind === 'prop' ? propBrushDef.label : brushKind === 'cover' ? `${coverBrushDensity} ${coverBrushAsset.label}` : brushKind === 'zone' ? (activeZone ? activeZoneName : 'No zones') : wallTool ? `${WALL_MATERIAL_LABELS[wallBrushMaterial]} Wall` : wallArtTool ? wallArtLabel(wallArtBrushId) : fenceTool ? `${FENCE_MATERIAL_LABELS[fenceBrushMaterial]} fence` : featureKind ? `${FEATURE_MATERIAL_LABELS[featureBrushMaterial[featureKind]]} ${featureKind}` : macroTileBrushAsset?.label ?? brushAsset.label}</strong>
              <span>Active brush · {brushKind === 'unit' ? `unit · ${LE_FACTION_LABELS[unitFaction]}` : brushKind === 'doodad' ? 'doodad' : brushKind === 'prop' ? `prop · ${propBrushDef.w}×${propBrushDef.h}` : brushKind === 'cover' ? 'ground cover' : brushKind === 'zone' ? 'zone' : wallTool ? 'wall · edge · material' : wallArtTool ? `wall art · edge · ${wallArtBadge(wallArtBrushId)}` : fenceTool ? 'fence · edge' : featureKind ? `feature · ${featureKind}` : macroTileBrushAsset ? `composite tile · ${macroTileBrushAsset.columns}×${macroTileBrushAsset.rows}` : 'tile'}</span>
            </span>
          </div>
        </section>

        {brushKind === 'cover' ? (
          <section className="skirmish-card">
            <h2>Ground cover</h2>
            <div className="le-swatches le-cover-swatches">
              {LE_COVER_TYPES.map((cover) => (
                <button
                  type="button"
                  key={cover.id}
                  className={`le-swatch le-cover-swatch ${coverBrushType === cover.id && tool !== 'erase' ? 'active' : ''}`.trim()}
                  title={`${cover.label} · ${cover.terrainLabel}`}
                  onClick={() => { setCoverBrushType(cover.id); setBrushKind('cover'); setTool('brush'); }}
                >
                  <GroundCoverPreview asset={cover} zoom={0.72} />
                  <small>{cover.label}</small>
                </button>
              ))}
            </div>
            <div className="le-seg">
              <button type="button" className={`le-seg-btn ${coverBrushDensity === 'sparse' ? 'active' : ''}`.trim()} onClick={() => setCoverBrushDensity('sparse')}>Sparse</button>
              <button type="button" className={`le-seg-btn ${coverBrushDensity === 'filled' ? 'active' : ''}`.trim()} onClick={() => setCoverBrushDensity('filled')}>Filled</button>
            </div>
            <p className="le-board-note">Brush paints {coverBrushDensity} {coverBrushAsset.label} on any tile; Erase clears a tile. The cover scatters from the density.</p>
            <button type="button" className="le-seg-btn" style={{ width: '100%', marginTop: 8 }} onClick={() => setCoverSeed((s) => s + 1)}>Re-roll scatter</button>
            <p className="le-board-note">{coverCount} tile{coverCount === 1 ? '' : 's'} with cover.</p>
          </section>
        ) : null}

        {brushKind === 'zone' ? (
          <section className="skirmish-card le-brush-panel le-zone-panel">
            <h2>Zone</h2>
            <div className="le-ctrlrow">
              <span className="le-ctrllabel">Zone</span>
              <div className="le-zone-select-controls">
                <button type="button" className="settings-chrome-button settings-chrome-button-neutral le-zone-stepper-button" aria-label="Previous zone" title="Previous zone" disabled={boardZoneEntries.length <= 1} onClick={() => stepZoneEntry(-1)}>
                  <span><span className="stepper-glyph stepper-chevron stepper-chevron-left" aria-hidden="true" /></span>
                </button>
                <SelectFrame>
                  <select
                    className="le-layer-select"
                    value={activeZone?.id ?? ''}
                    disabled={!activeZone}
                    onChange={(event) => selectZoneEntry(event.target.value)}
                    aria-label="Selected zone"
                  >
                    {activeZone ? null : <option value="">None</option>}
                    {boardZoneEntries.map((zone, index) => (
                      <option key={zone.id} value={zone.id}>{zoneDisplayName(zone, index)}</option>
                    ))}
                  </select>
                </SelectFrame>
                <button type="button" className="settings-chrome-button settings-chrome-button-neutral le-zone-stepper-button" aria-label="Next zone" title="Next zone" disabled={boardZoneEntries.length <= 1} onClick={() => stepZoneEntry(1)}>
                  <span><span className="stepper-glyph stepper-chevron stepper-chevron-right" aria-hidden="true" /></span>
                </button>
                <button type="button" className="settings-chrome-button settings-chrome-button-neutral le-zone-stepper-button" aria-label="Remove selected zone" title="Remove selected zone" disabled={!activeZone} onClick={removeActiveZoneEntry}>
                  <span><span className="stepper-glyph stepper-minus" aria-hidden="true" /></span>
                </button>
                <button type="button" className="settings-chrome-button settings-chrome-button-neutral le-zone-stepper-button" aria-label="Add zone" title="Add zone" onClick={addZoneEntry}>
                  <span><span className="stepper-glyph stepper-plus" aria-hidden="true" /></span>
                </button>
              </div>
            </div>
            <div className="le-ctrlrow">
              <span className="le-ctrllabel">Name</span>
              <input
                className="le-text-input le-zone-name-input"
                value={activeZoneNameValue}
                disabled={!activeZone}
                aria-label="Zone name"
                placeholder="Zone name"
                onChange={(event) => setActiveZoneName(event.target.value)}
              />
            </div>
            <div className="le-ctrlrow">
              <span className="le-ctrllabel">Color</span>
              <div className="le-zone-color-swatches" role="group" aria-label="Zone color">
                {LE_ZONE_COLOR_OPTIONS.map((option) => (
                  <button
                    type="button"
                    key={option.color}
                    className={`le-zone-color-button ${activeZoneColor === option.color ? 'active' : ''}`.trim()}
                    disabled={!activeZone}
                    title={option.label}
                    aria-label={`Zone color ${option.label}`}
                    onClick={() => setActiveZoneColor(option.color)}
                  >
                    <span className={`le-zone-dot le-zone-${option.color}`} aria-hidden="true" />
                  </button>
                ))}
              </div>
            </div>
            <p className="le-board-note">
              Brush paints cells into the selected zone. Events decide what that zone does.
            </p>
          </section>
        ) : null}

        {brushKind === 'unit' ? (
          <section className="skirmish-card le-brush-panel">
            <h2>Paint Faction</h2>
            <div className="le-ctrlrow">
              <span className="le-ctrllabel">Faction</span>
              <PaletteSelect
                className="le-faction-palette-select"
                value={unitFaction}
                aria-label="Paint faction"
                onChange={setUnitFaction}
              />
            </div>
            <div className="le-ctrlrow">
              <span className="le-ctrllabel">Default facing</span>
              <DirectionPopover
                value={directionForFaction(unitFaction)}
                label={`${LE_FACTION_LABELS[unitFaction]} default facing`}
                onChange={(direction) => setFactionDefaultDirection(unitFaction, direction)}
              />
            </div>
            <h2 className="le-card-subhead">Facing</h2>
            <FacingCompass
              direction={unitBrushDirection}
              onSelect={setUnitFacing}
              onRotate={rotateFacingCw}
              available={(d) => hasDirectionSprite(unitBrushAsset, d)}
            />
            <h2 className="le-card-subhead">Units</h2>
            <div className="le-swatches">
              {leUnitAssets.map((unit) => (
                <button
                  type="button"
                  key={unit.id}
                  className={`le-swatch ${unitBrushId === unit.id && tool !== 'erase' ? 'active' : ''}`.trim()}
                  title={unit.label}
                  onClick={() => { setUnitBrushId(unit.id); setBrushKind('unit'); setTool('brush'); }}
                >
                  <img
                    src={unit.sprite(unitFaction, hasDirectionSprite(unit, unitBrushDirection) ? unitBrushDirection : 'south')}
                    alt=""
                    draggable={false}
                  />
                  <small>{unit.label}</small>
                </button>
              ))}
            </div>
          </section>
        ) : brushKind === 'doodad' ? (
          <section className="skirmish-card le-brush-panel">
            <h2>Doodads</h2>
              <div className="le-swatches">
                {doodadAssets.map((doodad) => (
                  <button
                    type="button"
                    key={doodad.id}
                    className={`le-swatch ${doodadBrushId === doodad.id && tool !== 'erase' ? 'active' : ''}`.trim()}
                    title={`${doodad.label} · ${doodad.terrains.join(', ')}`}
                    onClick={() => { setDoodadBrushId(doodad.id); setBrushKind('doodad'); setTool('brush'); }}
                  >
                    <img src={doodad.front} alt="" draggable={false} />
                    <small>{doodad.label}</small>
                  </button>
                ))}
              </div>
            <p className="le-board-note">Doodads only land on a tile of their home terrain.</p>
          </section>
        ) : brushKind === 'prop' ? (
          <section className="skirmish-card le-brush-panel">
            {(['tree', 'house', 'rock'] as PropKind[]).map((kind) => {
              const group = PROP_DEFS.filter((def) => def.kind === kind);
              if (!group.length) return null;
              return (
                <div className="le-pal-group" key={kind}>
                  <span className="le-pal-grouplabel">{kind === 'tree' ? 'Trees' : kind === 'house' ? 'Houses' : 'Rocks'}</span>
                  <div className="le-swatches">
                    {group.map((def) => (
                      <button
                        type="button"
                        key={def.id}
                        className={`le-swatch ${propBrushId === def.id && tool !== 'erase' ? 'active' : ''}`.trim()}
                        title={`${def.label} · ${def.w}×${def.h} · ${def.terrains.join(', ')}${def.blocking ? ' · blocks' : ''}`}
                        onClick={() => { setPropBrushId(def.id); setBrushKind('prop'); setLayer('prop'); setTool('brush'); }}
                      >
                        <img src={propHalfSrc(def.spriteId, 'front')} alt="" draggable={false} />
                        <small>{def.label}</small>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            <p className="le-board-note">This prop spans {propBrushDef.w}×{propBrushDef.h} tile{propBrushDef.w * propBrushDef.h > 1 ? 's' : ''}, anchored at the clicked cell. Props only land where every footprint tile is one of their terrains and no unit or other prop is in the way. Blocking props (trees, houses, rocks) become impassable in play.</p>
          </section>
        ) : wallTool ? (
          <section className="skirmish-card le-brush-panel">
            <h2>Wall</h2>
            <div className="le-pal-group">
              <span className="le-pal-grouplabel">Back edge</span>
              <div className="le-swatches">
                {WALL_MATERIALS.map((mat) => (
                  <button
                    type="button"
                    key={`wall-${mat}`}
                    className={`le-swatch ${wallBrushMaterial === mat && tool !== 'erase' ? 'active' : ''}`.trim()}
                    title={WALL_MATERIAL_LABELS[mat]}
                    onClick={() => { setWallBrushMaterial(mat); setBrushKind('wall'); setLayer('wall'); setTool('brush'); }}
                  >
                    <img src={wallThumbSrc(mat)} alt="" draggable={false} />
                    <small>{WALL_MATERIAL_LABELS[mat]}</small>
                  </button>
                ))}
              </div>
            </div>
            <p className="le-board-note">
              Walls are placeable only on the map&rsquo;s northmost and westmost perimeter edges. They block crossing like fences and render as tall border pieces without hiding the board front.
            </p>
          </section>
        ) : wallArtTool ? (
          <section className="skirmish-card le-brush-panel">
            <h2>Wall Art</h2>
            <div className="le-pal-group">
              <span className="le-pal-grouplabel">Artwork</span>
              <div className="le-swatches le-wall-asset-swatches">
                {wallArtItems().map((art) => (
                  <button
                    type="button"
                    key={art.id}
                    className={`le-swatch le-wall-asset-swatch ${wallArtBrushId === art.id && tool !== 'erase' ? 'active' : ''}`.trim()}
                    title={`${art.label} - spans ${art.span} wall${art.span === 1 ? '' : 's'}`}
                    onClick={() => { setWallArtBrushId(art.id); setWallArtPlacementFeedback(null); setBrushKind('wallart'); setLayer('wallart'); setTool('brush'); }}
                  >
                    <WallArtPreview art={art} zoom={0.46} />
                    <small>{art.label}</small>
                  </button>
                ))}
              </div>
            </div>
            <p className="le-board-note">
              {tool === 'erase'
                ? 'Click a wall face carrying art to remove that complete placement. A dashed outline means there is no wall art on that segment.'
                : 'Click the visible face of an existing north or west perimeter wall. A spanned piece may start from any wall in a complete supporting run; a solid outline means ready and a dashed outline means more walls are needed.'}
            </p>
            {wallArtPlacementFeedback ? (
              <p className={`le-wall-placement-feedback is-${wallArtPlacementFeedback.tone}`} role="status">
                {wallArtPlacementFeedback.message}
              </p>
            ) : null}
          </section>
        ) : fenceTool ? (
          <section className="skirmish-card le-brush-panel">
            <h2>Fence</h2>
            <div className="le-pal-group">
              <span className="le-pal-grouplabel">Rail</span>
              <div className="le-swatches">
                {FENCE_MATERIALS.map((mat) => (
                  <button
                    type="button"
                    key={`fence-${mat}`}
                    className={`le-swatch ${fenceBrushMaterial === mat && tool !== 'erase' ? 'active' : ''}`.trim()}
                    title={FENCE_MATERIAL_LABELS[mat]}
                    onClick={() => { setFenceBrushMaterial(mat); setBrushKind('fence'); setLayer('fence'); setTool('brush'); }}
                  >
                    <img src={fenceThumbSrc(mat)} alt="" draggable={false} />
                    <small>{FENCE_MATERIAL_LABELS[mat]}</small>
                  </button>
                ))}
              </div>
            </div>
            <p className="le-board-note">
              Hover a tile and the nearest <strong>edge</strong> highlights; click to drop a rail on that edge
              (right-click or the Erase tool removes it). Boundary rails are visual; a fenced edge between
              two board tiles can&rsquo;t be crossed — both tiles stay walkable, and knights hop it (like water).
            </p>
          </section>
        ) : featureKind ? (
          <section className="skirmish-card le-brush-panel">
            <h2>Path surface</h2>
            <div className="le-pal-group">
              <span className="le-pal-grouplabel">Roads</span>
              <div className="le-swatches">
                {ROAD_MATERIALS.map((mat) => (
                  <button
                    type="button"
                    key={`road-${mat}`}
                    className={`le-swatch ${brushKind === 'road' && featureBrushMaterial.road === mat && tool !== 'erase' ? 'active' : ''}`.trim()}
                    title={FEATURE_MATERIAL_LABELS[mat]}
                    onClick={() => { setFeatureBrushMaterial((prev) => ({ ...prev, road: mat })); setBrushKind('road'); setLayer('paths'); setTool('brush'); }}
                  >
                    <img src={featureThumbSrc('road', mat)} alt="" draggable={false} />
                    <small>{FEATURE_MATERIAL_LABELS[mat]}</small>
                  </button>
                ))}
              </div>
            </div>
            <div className="le-pal-group">
              <span className="le-pal-grouplabel">River</span>
              <div className="le-swatches">
                {RIVER_MATERIALS.map((mat) => (
                  <button
                    type="button"
                    key={`river-${mat}`}
                    className={`le-swatch ${brushKind === 'river' && featureBrushMaterial.river === mat && tool !== 'erase' ? 'active' : ''}`.trim()}
                    title={FEATURE_MATERIAL_LABELS[mat]}
                    onClick={() => { setFeatureBrushMaterial((prev) => ({ ...prev, river: mat })); setBrushKind('river'); setLayer('paths'); setTool('brush'); }}
                  >
                    <img src={featureThumbSrc('river', mat)} alt="" draggable={false} />
                    <small>{FEATURE_MATERIAL_LABELS[mat]}</small>
                  </button>
                ))}
              </div>
            </div>
            <p className="le-board-note">
              Drag to draw a path; each tile picks its own piece (straight, corner, junction) from its like neighbours. Roads connect to roads and rivers to rivers — never to each other. Erase to cut; the ends re-cap.
            </p>
          </section>
        ) : brushKind === 'tile' ? (
          <section className="skirmish-card le-brush-panel">
            <h2>Composite terrain</h2>
            <SelectFrame>
              <select
                className="le-layer-select"
                aria-label="Composite terrain footprint"
                value={macroTileFootprint}
                onChange={(event) => {
                  setMacroTileFootprint(event.target.value);
                  setMacroTileBrushId(null);
                }}
              >
                {leMacroTileFootprints.map((footprint) => <option key={footprint} value={footprint}>{footprint}</option>)}
              </select>
            </SelectFrame>
            {studioFamilies.map((family) => {
              const assets = leMacroTilesFor(family.id, macroTileFootprint);
              if (!assets.length) return null;
              return (
                <div className="le-pal-group" key={`macro-${family.id}`}>
                  <span className="le-pal-grouplabel">{family.label}</span>
                  <div className="le-swatches">
                    {assets.map((asset) => (
                      <button
                        type="button"
                        key={asset.id}
                        className={`le-swatch le-macro-swatch ${macroTileBrushId === asset.id && tool !== 'erase' ? 'active' : ''}`.trim()}
                        title={`${asset.label} · ${asset.columns}×${asset.rows}`}
                        onClick={() => { setMacroTileBrushId(asset.id); setTool('brush'); }}
                      >
                        <img src={asset.src} alt="" draggable={false} />
                        <small>{asset.label.replace(` ${asset.columns}x${asset.rows}`, '')}</small>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            <h2 className="le-card-subhead">Single tiles</h2>
              {leTileGroups.map(({ family, tiles }) => (
                <div className="le-pal-group" key={family.id}>
                  <span className="le-pal-grouplabel">{family.label}</span>
                  <div className="le-swatches">
                    {tiles.map((tile) => (
                      <button
                        type="button"
                        key={tile.id}
                        className={`le-swatch ${macroTileBrushId === null && brushId === tile.id && tool !== 'erase' ? 'active' : ''}`.trim()}
                        title={tile.label}
                        onClick={() => { setMacroTileBrushId(null); setBrushId(tile.id); setTool('brush'); }}
                      >
                        <img src={tile.src} alt="" draggable={false} />
                        <small>{tile.label}</small>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
          </section>
        ) : null}

        {wallTool && selectedCell ? (
          <section className="skirmish-card">
            <h2>Wall edges</h2>
            <WallConnections cell={selectedCell} cols={boardCols} rows={boardRows} walls={boardWalls} onPaint={paintWallEdge} onErase={eraseWallEdge} />
            <p className="le-board-note">Click a north or west map-edge segment to select or clear a wall. Interior edges and the south/east perimeter are not wall targets.</p>
          </section>
        ) : null}

        {wallArtTool && selectedCell ? (
          <section className="skirmish-card">
            <h2>Wall Art edges</h2>
            <WallArtConnections cell={selectedCell} cols={boardCols} rows={boardRows} walls={boardWalls} placements={boardWallArt} onPaint={paintWallArtEdge} onErase={eraseWallArtEdge} />
            <p className="le-board-note">Click an existing north or west wall segment to place wall art. Erase removes the whole spanned item.</p>
          </section>
        ) : null}

        {fenceTool && selectedCell ? (
          <section className="skirmish-card">
            <h2>Fence edges</h2>
            <FenceConnections cell={selectedCell} cols={boardCols} rows={boardRows} fences={boardFences} onPaint={paintFenceEdge} onErase={eraseFenceEdge} />
            <p className="le-board-note">Click an edge to select or clear the fence on that side of the selected tile. Outer board edges place boundary rails.</p>
          </section>
        ) : null}

        {featureKind && selectedCell && selectedFeature ? (
          <section className="skirmish-card">
            <h2>{selectedFeature.kind === 'river' ? 'River connections' : 'Road connections'}</h2>
            <FeatureConnections cell={selectedCell} kind={selectedFeature.kind} features={boardFeatures} cuts={featureCuts} exits={featureExits} onToggle={toggleFeatureCut} onToggleExit={toggleFeatureExit} />
            <p className="le-board-note">Click an edge that has a neighbour to sever or rejoin it. Click an edge with no neighbour — a board boundary or a non-{selectedFeature.kind} tile — to run the {selectedFeature.kind} <em>off</em> that edge instead of capping it.</p>
          </section>
        ) : null}

        {brushKind === 'tile' && !macroTileBrushAsset ? (
          <section className="skirmish-card">
            <h2>Tile Fill</h2>
            <div className="le-seg">
              <button type="button" className="le-seg-btn" onClick={() => fillBoard('empty')} title="Fill blank terrain cells with the current tile brush.">Empty</button>
              <button type="button" className="le-seg-btn" onClick={() => fillBoard('all')} title="Fill the whole terrain layer with the current tile brush.">Whole</button>
            </div>
          </section>
        ) : null}

        {brushKind !== 'tile' ? (
          <section className="skirmish-card">
            <h2>Layer Actions</h2>
            <button type="button" className="le-seg-btn danger" style={{ width: '100%' }} onClick={clearActiveLayer} title={brushKind === 'zone' ? 'Clear the selected zone entry.' : `Clear every ${brushKind === 'wallart' ? 'wall art' : brushKind} placement from this board.`}>Clear {brushKind === 'zone' ? 'active zone' : brushKind === 'wallart' ? 'wall art' : brushKind}</button>
          </section>
        ) : null}

        </>)}

        {/* Board-page-only zoom readout — a whole-workspace setting, not per-brush. Zoom is also
            reachable anywhere via the mouse wheel over the board. */}
        {layer === 'board' ? (
        <section className="skirmish-card skirmish-view-card" aria-label="Board view">
          <h2>Board View</h2>
          <div className="skirmish-view-group">
            <span className="skirmish-eyebrow">Zoom</span>
            <div className="skirmish-view-row">
              <button type="button" className="app-header-button" onClick={() => adjustZoom(-0.1)} aria-label="Zoom out">−</button>
              <span className="skirmish-zoom-readout">{Math.round(viewZoom * 100)}%</span>
              <button type="button" className="app-header-button" onClick={() => adjustZoom(0.1)} aria-label="Zoom in">+</button>
              <button type="button" className="app-header-button" onClick={resetBoardView}>Reset</button>
            </div>
          </div>
          <div className="skirmish-view-group">
            <span className="skirmish-eyebrow">Overlays</span>
            <div className="skirmish-view-row">
              <button type="button" className={`app-header-button ${showMoves ? 'app-header-button-active' : ''}`.trim()} onClick={() => setShowMoves((value) => !value)} aria-pressed={showMoves}>Moves</button>
              <button type="button" className={`app-header-button ${showEnemyAttacks ? 'app-header-button-active' : ''}`.trim()} onClick={() => setShowEnemyAttacks((value) => !value)} aria-pressed={showEnemyAttacks}>Attacks</button>
              <button type="button" className={`app-header-button ${showBlocked ? 'app-header-button-active' : ''}`.trim()} onClick={() => setShowBlocked((value) => !value)} aria-pressed={showBlocked}>Blocks</button>
              <button type="button" className={`app-header-button ${showPromotionZones ? 'app-header-button-active' : ''}`.trim()} onClick={() => setShowPromotionZones((value) => !value)} aria-pressed={showPromotionZones}>Promotion</button>
              <button type="button" className={`app-header-button ${showGrid ? 'app-header-button-active' : ''}`.trim()} onClick={() => setShowGrid((value) => !value)} aria-pressed={showGrid}>Grid</button>
            </div>
          </div>
        </section>
        ) : null}

        {layer !== 'status' && (selectedUnitAsset || selectedDoodadAsset || selectedProp || selectedAsset || selectedCell) ? (
        <section className="skirmish-card le-details">
          <h2>Details · {selectedUnitAsset ? 'Unit' : selectedDoodadAsset ? 'Doodad' : selectedProp ? 'Prop' : selectedAsset ? 'Tile' : 'Cell'}</h2>
          {selectedUnitAsset && selectedUnit ? (
            <dl>
              <div><dt>Piece</dt><dd>{selectedUnitAsset.label}</dd></div>
              <div><dt>Faction</dt><dd>{LE_FACTION_LABELS[selectedUnit.faction as UnitPalette] ?? selectedUnit.faction}</dd></div>
              <div><dt>Control</dt><dd>{playerFaction && selectedUnit.faction === playerFaction ? 'Player' : 'CPU'}</dd></div>
              <div><dt>Facing</dt><dd>{selectedUnit.direction}</dd></div>
            </dl>
          ) : selectedDoodadAsset && selectedDoodad ? (
            <dl>
              <div><dt>Doodad</dt><dd>{selectedDoodadAsset.label}</dd></div>
              <div><dt>Terrain</dt><dd>{selectedDoodadAsset.terrains.join(', ')}</dd></div>
              <div><dt>Cell</dt><dd>{selectedCell?.x}, {selectedCell?.y}</dd></div>
            </dl>
          ) : selectedProp ? (
            <dl>
              <div><dt>Prop</dt><dd>{selectedProp.def.label}</dd></div>
              <div><dt>Footprint</dt><dd>{selectedProp.def.w}×{selectedProp.def.h}{selectedProp.def.blocking ? ' · blocks' : ''}</dd></div>
              <div><dt>Anchor</dt><dd>{selectedProp.anchor.x}, {selectedProp.anchor.y}</dd></div>
            </dl>
          ) : selectedAsset ? (
            <dl>
              <div><dt>Type</dt><dd>{leFamilyOfTile(selectedAsset.id)?.label ?? '—'}</dd></div>
              <div><dt>Source</dt><dd>{selectedAsset.id}</dd></div>
              <div><dt>Cell</dt><dd>{selectedCell?.x}, {selectedCell?.y}</dd></div>
              {selectedZones.length ? <div><dt>Zone</dt><dd>{selectedZones.map(({ zone, index }) => zoneDisplayName(zone, index)).join(', ')}</dd></div> : null}
            </dl>
          ) : (
            <dl>
              <div><dt>Tiles</dt><dd>{paintedCount}</dd></div>
              <div><dt>Units</dt><dd>{unitCount}</dd></div>
              <div><dt>Doodads</dt><dd>{doodadCount}</dd></div>
              <div><dt>Props</dt><dd>{propCount}</dd></div>
              <div><dt>Zones</dt><dd>{zoneCount}</dd></div>
            </dl>
          )}
        </section>
        ) : null}

        {/* Board-composition tally lives on the Board page only (it's a whole-board readout, not a
            per-layer control). The Details card above still surfaces the same counts contextually. */}
        {layer === 'board' ? (
        <div className="le-statusline">
          {selectedCell ? <>Cell <b>{selectedCell.x},{selectedCell.y}</b> · </> : null}<b>{paintedCount}</b> tiles · <b>{unitCount}</b> units · <b>{doodadCount}</b> doodads · <b>{propCount}</b> props · <b>{zoneCount}</b> zones · <b>{zonedTileCount}</b> zoned tiles · {boardCols}×{boardRows}
        </div>
        ) : null}
        </KitScroll>
      </aside>
      )}
      </ArtRouteChrome>
    </div>
  );
}
