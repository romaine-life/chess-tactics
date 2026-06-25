import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent, type ReactElement, type ReactNode, type WheelEvent } from 'react';
import { TILE_EDGE_ANGLE_DEGREES, TILE_TEMPLATE } from '../art/tileTemplate';
import { tileFamilies } from '../art/tileset';
import { buildTileCoverageReport } from '../core/tileCoverage';
import { generateSocketBoard, solveSocketBoard, type SocketBoardCell, type SocketBoardResult } from '../core/tileBoardGenerator';
import { createRng } from '../core/rng';
import {
  socketEdges,
  terrainLabels,
  transitionMaskCode,
  transitionPairs,
  transitionPairById,
  transitionPairsForFamily,
  transitionSlotLabel,
  transitionSlotsForPair,
  tileSocketsForAsset,
  type EdgeName,
  type TileAssetKind,
  type TileFamilyId,
  type TileSocketAsset,
  type TerrainPairId,
  type TransitionPair,
  type TransitionSlot,
} from '../core/tileSockets';
import { PIECE_LABEL, PIECE_MARK, PLAYABLE_PIECE_TYPES, pieceSpritePath } from '../core/pieces';
import type { PieceType, Side } from '../core/types';
import { validateLevel, LEVEL_FORMAT_VERSION, type Level } from '../core/level';
import { BoardLabBoard } from '../render/BoardLabBoard';
import { TileGrid, type TileGridCell } from '../render/TileGrid';
import { CatalogGrid, CatalogControls, type CatalogType } from './studio/Catalog';
import { AssetLibraryStudio, AssetLab, type AssetFilter } from './design/AssetLibraryStudio';
import kitManifest from './design/kitManifest.json';
import { useCampaigns } from '../campaign/store';
import { loadWorkspace, saveWorkspace } from '../net/campaignWorkspace';
import { navigateApp } from './navigation';
import { ViewPane } from './shared/ViewPane';
import {
  MISSING_DIRECTION_SPRITE,
  activeUnitFamilies,
  familyLabels,
  hasDirectionSprite,
  renderSizeForTileScale,
  unitAssets,
  type Direction,
  type Faction,
  type PieceId,
  type UnitAsset,
} from './unitCatalog';



const TRUE_ISO_TILE_SOURCE = 'canonical-true-iso';


type StudioFamilyId = TileFamilyId;
type StudioAssetKind = TileAssetKind;
type StudioMode = 'catalog' | 'lab';
type TileFilter = 'base' | 'board';
type LabMode = 'board' | 'tile' | 'unit';
type CollectionFilter = Exclude<TileFilter, 'board'>;
type TransitionViewMode = 'tile' | 'proof' | 'sample';

interface StudioAsset extends TileSocketAsset {
  id: string;
  label: string;
  src: string;
  animation?: {
    label: string;
    frames: string[];
    frameMs: number;
    status: 'prototype' | 'raw candidate' | 'approved';
  };
  role: string;
  kind: StudioAssetKind;
  source: string;
  probability: number;
  notes: string;
}

interface StudioFamily {
  id: StudioFamilyId;
  label: string;
  purpose: string;
  status: string;
  review: string;
  assets: StudioAsset[];
}

interface TilesetStudioRouteState {
  familyId: StudioFamilyId;
  studioMode: StudioMode;
  category?: 'tiles' | 'units' | 'assets';
  selectedAssetName?: string;
  labMode: LabMode;
  tileFilter: TileFilter;
  selectedPairId: TerrainPairId;
  selectedAssetId?: string;
  selectedSlotMask?: number;
  boardMode: 'generated' | 'concept';
  boardScope: 'family' | 'mixed';
  boardSize: 'small' | 'wide';
  boardSeed: number;
  brushKind: 'tile' | 'unit';
  selectedUnitId?: string;
}

type ReviewItem =
  | { type: 'asset'; asset: StudioAsset }
  | { type: 'slot'; pair: TransitionPair; slot: TransitionSlot<StudioAsset> };

type BoardUnitPlacement = {
  unitId: string;
  direction: Direction;
  faction: Faction;
};

const studioDefaults: TilesetStudioRouteState = {
  familyId: 'grass',
  studioMode: 'catalog',
  labMode: 'board',
  tileFilter: 'base',
  selectedPairId: 'grass-stone',
  boardMode: 'generated',
  boardScope: 'family',
  boardSize: 'small',
  boardSeed: 4217,
  brushKind: 'tile',
};

const assetFrameSrc = (asset: StudioAsset, animationFrame: number): string =>
  asset.animation ? asset.animation.frames[animationFrame % asset.animation.frames.length] ?? asset.src : asset.src;

const transitionAssets: StudioAsset[] = [];

const STUDIO_FAMILY_META: Record<TileFamilyId, { purpose: string; status: string; review: string }> = {
  grass: { purpose: 'High-volume base terrain for most playable cells.', status: 'Production', review: 'Variation + same-footprint repetition.' },
  dirt: { purpose: 'Bare-earth ground.', status: 'Production', review: 'Variation across the patch.' },
  stone: { purpose: 'Stone / cobble footing.', status: 'Production', review: 'Variation + readability.' },
  pebble: { purpose: 'Loose pebble ground.', status: 'Production', review: 'Variation.' },
  sand: { purpose: 'Sandy ground.', status: 'Production', review: 'Variation.' },
  water: { purpose: 'Open water (impassable to land units).', status: 'Production', review: 'Variation + surface read.' },
};

// Derived from the shipped tileset registry (frontend/src/art/tileset.ts) so the tile
// studio ALWAYS mirrors the board — a tile can't exist on the board but not here.
const studioFamilies: StudioFamily[] = (Object.keys(tileFamilies) as TileFamilyId[]).map((id) => ({
  id,
  label: terrainLabels[id],
  ...STUDIO_FAMILY_META[id],
  assets: tileFamilies[id].map((asset): StudioAsset => ({ ...asset })),
}));

interface CandidateBatch {
  id: string;
  label: string;
  purpose: string;
  familyId: StudioFamilyId;
  assets: StudioAsset[];
}

type CandidateReviewDecision = 'pending' | 'approved' | 'rejected' | 'revise';
type CandidateReviewStage = 'tile' | 'board' | 'compare';

type ReviewQueueItem =
  | {
      type: 'candidate';
      id: string;
      asset: StudioAsset;
      assetIndex: number;
      batch: CandidateBatch;
      family: StudioFamily;
    }
  | {
      type: 'transition-work';
      id: string;
      pair: TransitionPair;
      slot: TransitionSlot<StudioAsset>;
      family: StudioFamily;
    };

const candidateBatches: CandidateBatch[] = [];

const kindLabels: Record<StudioAssetKind, string> = {
  tile: 'Tile',
  reference: 'Reference',
};

const studioFamilyAssets: Record<StudioFamilyId, readonly StudioAsset[]> = {
  grass: studioFamilies.find((family) => family.id === 'grass')?.assets ?? [],
  stone: studioFamilies.find((family) => family.id === 'stone')?.assets ?? [],
  water: studioFamilies.find((family) => family.id === 'water')?.assets ?? [],
  dirt: studioFamilies.find((family) => family.id === 'dirt')?.assets ?? [],
  pebble: studioFamilies.find((family) => family.id === 'pebble')?.assets ?? [],
  sand: studioFamilies.find((family) => family.id === 'sand')?.assets ?? [],
};

const familyCounts = (family: StudioFamily): string => {
  const variants = family.assets.filter((asset) => asset.kind === 'tile').length;
  return `${variants} ${variants === 1 ? 'tile' : 'tiles'}`;
};

const CANDIDATE_REVIEW_KEY = 'chess-tactics:tileset-review-decisions:v1';

const familySample = (family: StudioFamily): StudioAsset => family.assets.find((asset) => asset.kind === 'tile') ?? family.assets[0];

const studioFamilyById = (familyId: StudioFamilyId): StudioFamily =>
  studioFamilies.find((item) => item.id === familyId) ?? studioFamilies[0];

const familyBaseAsset = (familyId: StudioFamilyId): StudioAsset =>
  studioFamilyById(familyId).assets.find((asset) => asset.kind === 'tile' && asset.role === 'base') ?? familySample(studioFamilyById(familyId));

const isStudioFamilyId = (value: string | null): value is StudioFamilyId => value === 'grass' || value === 'stone' || value === 'water';

const isStudioMode = (value: string | null): value is StudioMode => value === 'catalog' || value === 'lab';
const isStudioCategory = (value: string | null): value is 'tiles' | 'units' | 'assets' => value === 'tiles' || value === 'units' || value === 'assets';
const isLabMode = (value: string | null): value is LabMode => value === 'board' || value === 'tile' || value === 'unit';

const isTileFilter = (value: string | null): value is TileFilter => value === 'base' || value === 'transitions' || value === 'references' || value === 'board';

const isTerrainPairId = (value: string | null): value is TerrainPairId => value === 'grass-stone' || value === 'grass-water' || value === 'stone-water';
const isUnitAssetId = (value: string | null): value is string => unitAssets.some((unit) => unit.id === value);

const readTilesetStudioRoute = (): TilesetStudioRouteState => {
  const params = new URLSearchParams(window.location.search);
  const family = params.get('family');
  const mode = params.get('mode');
  const cat = params.get('cat');
  const kit = params.get('kit');
  const lab = params.get('lab');
  const view = params.get('view');
  const collection = params.get('collection');
  const pair = params.get('pair');
  const asset = params.get('asset');
  const unit = params.get('unit');
  const slot = Number(params.get('slot'));
  const seed = Number(params.get('seed'));
  const studioMode = isStudioMode(mode) ? mode : mode === 'view' ? 'lab' : studioDefaults.studioMode;
  const routeTileFilter = view === 'board' ? 'board' : isTileFilter(collection) ? collection : studioDefaults.tileFilter;
  const explicitLabMode = isLabMode(lab) ? lab : undefined;
  const brushKind = params.get('brush') === 'unit' || explicitLabMode === 'unit' ? 'unit' : studioDefaults.brushKind;
  const routeLabMode = explicitLabMode ?? (routeTileFilter === 'board' ? 'board' : brushKind === 'unit' ? 'unit' : 'tile');
  const effectiveTileFilter =
    studioMode === 'catalog'
      ? routeTileFilter === 'board' ? studioDefaults.tileFilter : routeTileFilter
      : routeTileFilter;
  return {
    familyId: isStudioFamilyId(family) ? family : studioDefaults.familyId,
    studioMode,
    category: isStudioCategory(cat) ? cat : undefined,
    selectedAssetName: kit || undefined,
    labMode: routeLabMode,
    tileFilter: effectiveTileFilter,
    selectedPairId: isTerrainPairId(pair) ? pair : studioDefaults.selectedPairId,
    selectedAssetId: asset || undefined,
    selectedSlotMask: Number.isInteger(slot) && slot >= 1 && slot <= 14 ? slot : undefined,
    boardMode: params.get('board') === 'concept' ? 'concept' : studioDefaults.boardMode,
    boardScope: params.get('scope') === 'mixed' ? 'mixed' : studioDefaults.boardScope,
    boardSize: params.get('size') === 'wide' ? 'wide' : studioDefaults.boardSize,
    boardSeed: Number.isFinite(seed) && seed > 0 ? Math.floor(seed) : studioDefaults.boardSeed,
    brushKind,
    selectedUnitId: isUnitAssetId(unit) ? unit : undefined,
  };
};

const writeTilesetStudioRoute = (route: TilesetStudioRouteState): void => {
  if (window.location.pathname !== '/tileset-studio') return;
  if (route.studioMode === 'catalog') {
    // Tiles is the default, so it stays a clean bare URL; Units/Assets get a
    // ?cat= so the chosen catalog survives a reload and is directly linkable.
    const catalogParams = new URLSearchParams();
    if (route.category && route.category !== 'tiles') catalogParams.set('cat', route.category);
    if (route.category === 'assets' && route.selectedAssetName) catalogParams.set('kit', route.selectedAssetName);
    const catalogQuery = catalogParams.toString();
    const nextHref = catalogQuery ? `${window.location.pathname}?${catalogQuery}` : window.location.pathname;
    const currentHref = `${window.location.pathname}${window.location.search}`;
    if (nextHref !== currentHref) {
      window.history.replaceState({}, '', nextHref);
    }
    return;
  }
  const params = new URLSearchParams();
  params.set('family', route.familyId);
  params.set('mode', route.studioMode);
  if (route.category && route.category !== 'tiles') params.set('cat', route.category);
  if (route.category === 'assets' && route.selectedAssetName) params.set('kit', route.selectedAssetName);
  if (route.studioMode === 'lab') params.set('lab', route.labMode);
  params.set('collection', route.tileFilter);
  if (route.selectedAssetId) params.set('asset', route.selectedAssetId);
  if (route.selectedSlotMask) params.set('slot', String(route.selectedSlotMask));
  params.set('pair', route.selectedPairId);
  params.set('board', route.boardMode);
  params.set('scope', route.boardScope);
  params.set('size', route.boardSize);
  params.set('seed', String(route.boardSeed));
  if (route.brushKind === 'unit') params.set('brush', 'unit');
  if (route.selectedUnitId) params.set('unit', route.selectedUnitId);
  const nextHref = `${window.location.pathname}?${params.toString()}`;
  const currentHref = `${window.location.pathname}${window.location.search}`;
  if (nextHref !== currentHref) {
    window.history.replaceState({}, '', nextHref);
  }
};

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const defaultViewZoom = (kind: 'tile' | 'transition' | 'board'): number => {
  if (kind === 'tile') return 1.35;
  if (kind === 'transition') return 1.15;
  return 0.95;
};

const defaultTransitionViewModeForRoute = (route: TilesetStudioRouteState): TransitionViewMode => {
  return route.selectedAssetId && transitionAssets.some((asset) => asset.id === route.selectedAssetId) ? 'tile' : 'proof';
};

const socketsForAsset = (asset: StudioAsset): Record<EdgeName, StudioFamilyId> => {
  return tileSocketsForAsset(asset, studioFamilyAssets);
};

const familyForStudioAsset = (asset: StudioAsset): StudioFamilyId => {
  return studioFamilies.find((item) => item.assets.some((candidate) => candidate.id === asset.id))?.id ?? asset.terrains?.[0] ?? 'grass';
};

const boardFromCells = (cells: SocketBoardCell<StudioAsset>[]): SocketBoardResult<StudioAsset> => ({
  cells,
  fallbacks: [],
  stats: {
    placed: cells.filter((cell) => cell.asset).length,
    missingPlacements: cells.filter((cell) => cell.missing).length,
    illegalEdges: 0,
    candidateAssets: cells.filter((cell) => cell.asset).length,
  },
});

const boardCellForAsset = (asset: StudioAsset, x: number, y: number): SocketBoardCell<StudioAsset> => ({
  x,
  y,
  asset,
  sockets: socketsForAsset(asset),
  terrain: familyForStudioAsset(asset),
});

const boardForAsset = (asset: StudioAsset): SocketBoardResult<StudioAsset> => {
  return boardFromCells([boardCellForAsset(asset, 0, 0)]);
};

const boardForTransitionSlot = (
  pair: TransitionPair | undefined,
  slot: TransitionSlot<StudioAsset>,
  asset: StudioAsset | undefined,
): SocketBoardResult<StudioAsset> => {
  const north = familyBaseAsset(slot.sockets.north);
  const east = familyBaseAsset(slot.sockets.east);
  const south = familyBaseAsset(slot.sockets.south);
  const west = familyBaseAsset(slot.sockets.west);
  const center: SocketBoardCell<StudioAsset> = asset
    ? boardCellForAsset(asset, 1, 1)
    : {
        x: 1,
        y: 1,
        sockets: slot.sockets,
        terrain: slot.sockets.north,
        missing: {
          kind: 'missing-art',
          label: pair ? `${pair.label} ${slot.code}` : `Transition ${slot.code}`,
          pairId: pair?.id,
          mask: slot.mask,
          families: Array.from(new Set(socketEdges.map((edge) => slot.sockets[edge]))),
        },
      };

  return boardFromCells([
    boardCellForAsset(north, 1, 0),
    boardCellForAsset(west, 0, 1),
    center,
    boardCellForAsset(east, 2, 1),
    boardCellForAsset(south, 1, 2),
  ]);
};

const randomTileForFamily = (familyId: StudioFamilyId, seed: number): StudioAsset => {
  const rng = createRng(seed);
  const candidates = studioFamilyById(familyId).assets.filter((asset) => asset.kind === 'tile');
  return rng.pick(candidates.length > 0 ? candidates : [familyBaseAsset(familyId)]);
};

const boardForTransitionSample = (
  pair: TransitionPair | undefined,
  slot: TransitionSlot<StudioAsset>,
  asset: StudioAsset | undefined,
  seed: number,
): SocketBoardResult<StudioAsset> => {
  const families = socketEdges.map((edge) => slot.sockets[edge]);
  const [north, east, south, west] = families.map((familyId, index) => randomTileForFamily(familyId, seed + index * 101));
  const center: SocketBoardCell<StudioAsset> = asset
    ? boardCellForAsset(asset, 1, 1)
    : {
        x: 1,
        y: 1,
        sockets: slot.sockets,
        terrain: slot.sockets.north,
        missing: {
          kind: 'missing-art',
          label: pair ? `${pair.label} ${slot.code}` : `Transition ${slot.code}`,
          pairId: pair?.id,
          mask: slot.mask,
          families: Array.from(new Set(families)),
        },
      };

  return boardFromCells([
    boardCellForAsset(north, 1, 0),
    boardCellForAsset(west, 0, 1),
    center,
    boardCellForAsset(east, 2, 1),
    boardCellForAsset(south, 1, 2),
  ]);
};

const propertyHelp: Record<string, string> = {
  'Tile Type': 'How this asset participates in the tileset: base terrain, transition tile, reference, or invalid transition.',
  North: 'The terrain family this tile exposes on its north edge.',
  East: 'The terrain family this tile exposes on its east edge.',
  South: 'The terrain family this tile exposes on its south edge.',
  West: 'The terrain family this tile exposes on its west edge.',
  Pair: 'The two terrain families this transition tile is allowed to connect.',
  Mask: 'Four-bit edge socket code in north, east, south, west order.',
  Source: 'The asset folder or generation source this item is loaded from.',
  Projection: 'Whether this item is already in the true-isometric production footprint or still needs review.',
  'Fill Weight': 'Relative chance this tile appears when generating random boards. Zero means it is not used by random fill.',
};

function InspectorRow({ label, children }: { label: string; children: ReactElement | string }): ReactElement {
  const help = propertyHelp[label];

  return (
    <div title={help}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function EdgeLedger({ asset }: { asset: StudioAsset }): ReactElement {
  const sockets = socketsForAsset(asset);
  const typeLabel = tileTypeLabel(asset);

  return (
    <>
      <InspectorRow label="Tile Type">{typeLabel}</InspectorRow>
      <InspectorRow label="Source">{asset.source}</InspectorRow>
      <InspectorRow label="Projection">{asset.source === TRUE_ISO_TILE_SOURCE ? 'true-iso locked' : 'review required'}</InspectorRow>
      {socketEdges.map((edge) => (
        <InspectorRow key={edge} label={`${edge[0].toUpperCase()}${edge.slice(1)}`}>
          {terrainLabels[sockets[edge]]}
        </InspectorRow>
      ))}
      {asset.pairId ? (
        <>
          <InspectorRow label="Pair">{transitionPairById(asset.pairId).label}</InspectorRow>
          <InspectorRow label="Mask">{typeof asset.socketMask === 'number' ? transitionMaskCode(asset.socketMask) : 'unset'}</InspectorRow>
        </>
      ) : null}
    </>
  );
}

const tileTypeLabel = (asset: StudioAsset): string => {
  if (asset.kind === 'reference') return 'Reference';
  if (!asset.pairId) return 'Base tile';
  if (typeof asset.socketMask !== 'number' || asset.socketMask === 0 || asset.socketMask === 15) return 'Invalid transition';
  return 'Transition tile';
};

function useAnimationFrameIndex(): number {
  const [animationFrame, setAnimationFrame] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setAnimationFrame((frame) => (frame + 1) % 9), 150);
    return () => window.clearInterval(timer);
  }, []);

  return animationFrame;
}

function useAnimationClock(isPlaying = true, frameCount = 9, frameMs = 150): number {
  const [animationFrame, setAnimationFrame] = useState(0);

  useEffect(() => {
    if (!isPlaying || frameCount <= 1) return undefined;
    const timer = window.setInterval(() => setAnimationFrame((frame) => (frame + 1) % frameCount), frameMs);
    return () => window.clearInterval(timer);
  }, [frameCount, frameMs, isPlaying]);

  useEffect(() => {
    if (frameCount > 0) setAnimationFrame((frame) => frame % frameCount);
  }, [frameCount]);

  return animationFrame;
}

function StudioGeneratedBoard({
  board,
  showFootprint,
  boardZoom,
  boardPan,
  animationFrame,
}: {
  board: SocketBoardResult<StudioAsset>;
  showFootprint: boolean;
  boardZoom: number;
  boardPan: { x: number; y: number };
  animationFrame: number;
}): ReactElement {
  return (
    <BoardLabBoard
      board={board}
      showFootprint={showFootprint}
      boardZoom={boardZoom}
      boardPan={boardPan}
      assetFrameSrc={(asset) => assetFrameSrc(asset, animationFrame)}
      ariaLabel="Generated board from selected tileset"
    />
  );
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
  resolveAsset,
  resolveUnit,
  tool,
  selectedCell,
  showFootprint,
  boardZoom,
  boardPan,
  animationFrame,
  onPaint,
  onErase,
  onSelect,
  overlay,
}: {
  cols: number;
  rows: number;
  cells: Record<string, string>;
  units: Record<string, BoardUnitPlacement>;
  resolveAsset: (id: string) => StudioAsset | undefined;
  resolveUnit: (id: string) => UnitAsset | undefined;
  tool: 'select' | 'brush' | 'erase';
  selectedCell: { x: number; y: number } | null;
  showFootprint: boolean;
  boardZoom: number;
  boardPan: { x: number; y: number };
  animationFrame: number;
  onPaint: (x: number, y: number) => void;
  onErase: (x: number, y: number) => void;
  onSelect: (x: number, y: number) => void;
  overlay?: ReactNode;
}): ReactElement {
  const paintingRef = useRef(false);
  const stopPainting = () => { paintingRef.current = false; };
  const applyTool = (x: number, y: number) => {
    if (tool === 'brush') onPaint(x, y);
    else if (tool === 'erase') onErase(x, y);
    else onSelect(x, y);
  };

  // The editor is an adapter over the shared TileGrid core (the same one the
  // game's BoardLabBoard uses). It only supplies per-cell content: the tile art,
  // the placed unit, the selection ring, and the paint/erase/select hit target.
  const cells: TileGridCell[] = [];
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const key = `${x},${y}`;
      const assetId = placed[key];
      const asset = assetId ? resolveAsset(assetId) : undefined;
      const unitPlacement = placedUnits[key];
      const unitAsset = unitPlacement ? resolveUnit(unitPlacement.unitId) : undefined;
      const isSelected = selectedCell?.x === x && selectedCell?.y === y;
      const unitSprite =
        unitAsset && unitPlacement
          ? hasDirectionSprite(unitAsset, unitPlacement.direction)
            ? unitAsset.sprite(unitPlacement.faction, unitPlacement.direction)
            : MISSING_DIRECTION_SPRITE
          : undefined;
      cells.push({
        key,
        x,
        y,
        className: `tileset-placement-cell ${asset ? '' : 'is-empty'} ${isSelected ? 'is-selected' : ''}`.trim(),
        children: (
          <>
            {asset ? <img src={assetFrameSrc(asset, animationFrame)} alt="" draggable={false} /> : null}
            {unitAsset && unitSprite ? (
              <img
                className={`tileset-board-unit is-${unitAsset.family}`}
                src={unitSprite}
                alt=""
                draggable={false}
                style={
                  {
                    width: `${renderSizeForTileScale(unitAsset, unitAsset.defaultScale, 1)}px`,
                    height: `${renderSizeForTileScale(unitAsset, unitAsset.defaultScale, 1)}px`,
                    transform: `translate(-${unitAsset.unitAnchorX ?? '50%'}, -${unitAsset.unitAnchorY ?? '92%'})`,
                  } as CSSProperties
                }
              />
            ) : null}
            {isSelected ? <span className="tileset-cell-ring" aria-hidden="true" /> : null}
            <span
              className="tileset-cell-hit"
              onPointerDown={(event) => {
                if (event.button === 2) return; // right-click erases via onContextMenu
                event.stopPropagation(); // don't let the ViewPane start a pan while editing
                if (tool !== 'select') paintingRef.current = true;
                applyTool(x, y);
              }}
              onPointerEnter={() => { if (paintingRef.current) applyTool(x, y); }}
              onContextMenu={(event) => { event.preventDefault(); onErase(x, y); }}
            />
          </>
        ),
      });
    }
  }

  return (
    <TileGrid
      cells={cells}
      className={`tileset-placement-board is-tool-${tool}`}
      ariaLabel="Editable tile board"
      showFootprint={showFootprint}
      boardZoom={boardZoom}
      boardPan={boardPan}
      onPointerUp={stopPainting}
      onPointerLeave={stopPainting}
    >
      {overlay}
    </TileGrid>
  );
}

// Units browser folded into the shared studio catalog. Unit data comes from
// unitCatalog.ts so the catalog, lab brush, and standalone Unit Studio stay in sync.
type LevelBrush = TileFamilyId | 'erase';
const levelTerrainOrder: TileFamilyId[] = ['grass', 'dirt', 'stone', 'pebble', 'sand', 'water'];
const levelFamilySwatch: Record<TileFamilyId, string> = {
  grass: '#5b8c3a',
  stone: '#8c8c95',
  water: '#3a6ea5',
  dirt: '#6b513a',
  pebble: '#7d7a70',
  sand: '#b8a06a',
};
const levelSizes = {
  small: { cols: 10, rows: 8 },
  wide: { cols: 14, rows: 10 },
} as const;

type LevelUnitCell = { type: PieceType; side: Side };
type LevelSnapshot = { t: Record<string, TileFamilyId>; u: Record<string, LevelUnitCell> };

function levelTerrainToFamily(terrain: string): TileFamilyId {
  if (terrain === 'water') return 'water';
  if (terrain === 'stone' || terrain === 'road' || terrain === 'bridge' || terrain === 'rock' || terrain === 'cliff') return 'stone';
  return 'grass';
}

function levelToEditorTerrain(level: Level | null): Record<string, TileFamilyId> {
  if (!level) return {};
  return Object.fromEntries(level.layers.terrain.map((cell) => [`${cell.x},${cell.y}`, levelTerrainToFamily(cell.terrain)]));
}

function levelToEditorUnits(level: Level | null): Record<string, LevelUnitCell> {
  if (!level) return {};
  return Object.fromEntries(level.layers.units.map((unit) => [`${unit.x},${unit.y}`, { type: unit.type, side: unit.side }]));
}

function levelToSizeKey(level: Level | null): 'small' | 'wide' {
  if (!level) return 'small';
  return level.board.cols === levelSizes.wide.cols && level.board.rows === levelSizes.wide.rows ? 'wide' : 'small';
}
const LE_ICON_ROOT = '/assets/ui/level-editor';
const leIcon = (name: string, active = false): string => `${LE_ICON_ROOT}/icons/${name}${active ? '-active' : ''}.png`;
const levelPieceTypes: PieceType[] = [...PLAYABLE_PIECE_TYPES];
const levelSides: Side[] = ['player', 'enemy', 'neutral'];
const pieceGlyph = PIECE_MARK;
const pieceLabel = PIECE_LABEL;
const sideLabel: Record<Side, string> = { player: 'Player', enemy: 'Enemy', neutral: 'Neutral' };
const sideClass: Record<Side, string> = { player: 'is-player', enemy: 'is-enemy', neutral: 'is-neutral' };
const levelPieceArt: Partial<Record<PieceType, string>> = Object.fromEntries(
  PLAYABLE_PIECE_TYPES.map((piece) => [piece, pieceSpritePath(piece)]),
) as Partial<Record<PieceType, string>>;

// Fill every unpainted cell with its nearest painted family (multi-source BFS),
// so a painted region's outer border meets matching terrain (clean base tiles)
// and only adjacent *different* painted families produce socket transitions.
function buildLevelTerrainMap(terrainCells: Record<string, TileFamilyId>, cols: number, rows: number): TileFamilyId[] {
  const map = new Array<TileFamilyId>(cols * rows).fill('grass');
  const idx = (x: number, y: number) => y * cols + x;
  const visited = new Uint8Array(cols * rows);
  const queue: number[] = [];
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const family = terrainCells[`${x},${y}`];
      if (family) {
        const p = idx(x, y);
        map[p] = family;
        visited[p] = 1;
        queue.push(p);
      }
    }
  }
  if (queue.length === 0) return map; // nothing painted yet: all grass, rendered as empty
  let head = 0;
  while (head < queue.length) {
    const p = queue[head];
    head += 1;
    const x = p % cols;
    const y = (p / cols) | 0;
    const family = map[p];
    const neighbours: Array<[number, number]> = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
    for (const [nx, ny] of neighbours) {
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const np = idx(nx, ny);
      if (visited[np]) continue;
      visited[np] = 1;
      map[np] = family;
      queue.push(np);
    }
  }
  return map;
}

function LeChromePanel({ title, className = '', children }: { title: string; className?: string; children: ReactNode }): ReactElement {
  return (
    <section className={`le-panel ${className}`.trim()}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function LeIconButton({ label, icon, active = false, disabled = false, onClick }: { label: string; icon: string; active?: boolean; disabled?: boolean; onClick?: () => void }): ReactElement {
  return (
    <button type="button" className={`le-icon-button ${active ? 'is-active' : ''}`.trim()} title={label} aria-label={label} disabled={disabled} onClick={onClick}>
      <img src={leIcon(icon, active)} alt="" aria-hidden="true" />
    </button>
  );
}

function LeActionButton({ label, icon, primary = false, disabled = false, title, onClick }: { label: string; icon?: string; primary?: boolean; disabled?: boolean; title?: string; onClick?: () => void }): ReactElement {
  return (
    <button type="button" className={`le-action-button ${primary ? 'is-primary' : ''}`.trim()} disabled={disabled} title={title ?? label} onClick={onClick}>
      {icon ? <img src={leIcon(icon, primary)} alt="" aria-hidden="true" /> : null}
      <span>{label}</span>
    </button>
  );
}

// The level editor: the polished asset-backed `le-` chrome (top toolbar, side
// rails, asset tray, status bar) wrapping the socket-legal board. Paint terrain
// *families* and the solver lays down the legal tile per cell (base inside a
// region, transitions where families meet); place chess-piece units on top.
// This replaces the old Pixi EditorBoard surface while keeping its chrome/art.
export function LevelEditorPage(): ReactElement {
  const routeParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const routeCampaignId = routeParams.get('campaignId');
  const routeLevelId = routeParams.get('levelId');
  const returnTo = routeParams.get('returnTo') ?? '/campaigns-next';
  const routeLevel = routeLevelId ? useCampaigns.getState().levels[routeLevelId] ?? null : null;
  const [terrainCells, setTerrainCells] = useState<Record<string, TileFamilyId>>(() => levelToEditorTerrain(routeLevel));
  const [unitCells, setUnitCells] = useState<Record<string, LevelUnitCell>>(() => levelToEditorUnits(routeLevel));
  const [layer, setLayer] = useState<'terrain' | 'units'>('terrain');
  const [brush, setBrush] = useState<LevelBrush>('grass');
  const [unitType, setUnitType] = useState<PieceType>('pawn');
  const [unitSide, setUnitSide] = useState<Side>('player');
  const [unitErase, setUnitErase] = useState(false);
  const [sizeKey, setSizeKey] = useState<'small' | 'wide'>(() => levelToSizeKey(routeLevel));
  const [viewZoom, setViewZoom] = useState(0.95);
  const [viewPan, setViewPan] = useState({ x: 0, y: 0 });
  const [showGrid, setShowGrid] = useState(true);
  const [past, setPast] = useState<LevelSnapshot[]>([]);
  const [future, setFuture] = useState<LevelSnapshot[]>([]);
  const [status, setStatus] = useState(routeLevel ? `Editing ${routeLevel.name}` : 'Ready');
  const { cols, rows } = levelSizes[sizeKey];
  const animationFrame = useAnimationClock(true, 8, 150);

  useEffect(() => {
    const shell = document.querySelector('.shell');
    shell?.classList.add('level-editor-active');
    return () => shell?.classList.remove('level-editor-active');
  }, []);

  useEffect(() => {
    if (!routeLevelId || useCampaigns.getState().levels[routeLevelId]) return;
    let active = true;
    loadWorkspace()
      .then((workspace) => {
        if (!active) return;
        useCampaigns.getState().hydrate(workspace);
        const level = useCampaigns.getState().levels[routeLevelId];
        if (!level) {
          setStatus(`Level ${routeLevelId} was not found in the campaign workspace`);
          return;
        }
        setTerrainCells(levelToEditorTerrain(level));
        setUnitCells(levelToEditorUnits(level));
        setSizeKey(levelToSizeKey(level));
        if (routeCampaignId) useCampaigns.getState().selectCampaign(routeCampaignId);
        useCampaigns.getState().selectLevel(routeLevelId);
        setStatus(`Editing ${level.name}`);
      })
      .catch((error) => setStatus(`Load failed: ${(error as Error).message}`));
    return () => { active = false; };
  }, [routeCampaignId, routeLevelId]);

  const levelAssets = useMemo(
    () => [...studioFamilies.flatMap((family) => family.assets.filter((asset) => asset.kind === 'tile')), ...transitionAssets],
    [],
  );
  const assetById = useMemo(() => new Map(levelAssets.map((asset) => [asset.id, asset])), [levelAssets]);

  const solved = useMemo(
    () => solveSocketBoard({ assets: levelAssets, terrainMap: buildLevelTerrainMap(terrainCells, cols, rows), seed: 7, columns: cols, rows, familyAssets: studioFamilyAssets }),
    [terrainCells, cols, rows, levelAssets],
  );

  // Only painted cells render. Map each to its solved asset id (StudioEditableBoard
  // shows empty for unresolved/missing cells — those are surfaced in the status line).
  const renderedCells = useMemo(() => {
    const out: Record<string, string> = {};
    for (const cell of solved.cells) {
      const key = `${cell.x},${cell.y}`;
      if (terrainCells[key] && cell.asset) out[key] = cell.asset.id;
    }
    return out;
  }, [solved, terrainCells]);

  const paintedCount = Object.keys(terrainCells).length;
  const unitCount = Object.keys(unitCells).length;
  const missingCount = solved.cells.filter((cell) => terrainCells[`${cell.x},${cell.y}`] && cell.missing).length;

  // Undo/redo. Painting a stroke snapshots on pointer-down (capture phase, before
  // the cell handler stops propagation) and commits on pointer-up if it changed;
  // discrete actions snapshot up front via recordHistory().
  const terrainRef = useRef(terrainCells);
  terrainRef.current = terrainCells;
  const unitRef = useRef(unitCells);
  unitRef.current = unitCells;
  const strokeRef = useRef<LevelSnapshot | null>(null);
  const snapshot = (): LevelSnapshot => ({ t: terrainRef.current, u: unitRef.current });
  const recordHistory = () => {
    setPast((prev) => [...prev.slice(-49), snapshot()]);
    setFuture([]);
  };
  const beginStroke = () => { strokeRef.current = snapshot(); };
  const endStroke = () => {
    const start = strokeRef.current;
    strokeRef.current = null;
    if (start && (start.t !== terrainRef.current || start.u !== unitRef.current)) {
      setPast((prev) => [...prev.slice(-49), start]);
      setFuture([]);
    }
  };
  const undo = () => {
    if (!past.length) return;
    const prev = past[past.length - 1];
    setFuture((f) => [...f, snapshot()]);
    setPast((p) => p.slice(0, -1));
    setTerrainCells(prev.t);
    setUnitCells(prev.u);
  };
  const redo = () => {
    if (!future.length) return;
    const next = future[future.length - 1];
    setPast((p) => [...p, snapshot()]);
    setFuture((f) => f.slice(0, -1));
    setTerrainCells(next.t);
    setUnitCells(next.u);
  };

  const paintTerrain = (x: number, y: number) => {
    if (brush === 'erase') return;
    const family = brush;
    setTerrainCells((prev) => (prev[`${x},${y}`] === family ? prev : { ...prev, [`${x},${y}`]: family }));
  };
  const eraseTerrain = (x: number, y: number) => {
    const key = `${x},${y}`;
    setTerrainCells((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    // A unit can't stand on void — drop it when its tile is erased.
    setUnitCells((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };
  const placeUnit = (x: number, y: number) => {
    const key = `${x},${y}`;
    if (!terrainCells[key]) return; // units stand on painted terrain only
    setUnitCells((prev) => (prev[key]?.type === unitType && prev[key]?.side === unitSide ? prev : { ...prev, [key]: { type: unitType, side: unitSide } }));
  };
  const eraseUnit = (x: number, y: number) =>
    setUnitCells((prev) => {
      const key = `${x},${y}`;
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  const clearLevel = () => {
    recordHistory();
    setTerrainCells({});
    setUnitCells({});
    setStatus('Cleared');
  };
  const clearUnits = () => {
    recordHistory();
    setUnitCells({});
  };
  const fillLevel = () => {
    if (brush === 'erase') return;
    recordHistory();
    const family = brush;
    const next: Record<string, TileFamilyId> = {};
    for (let y = 0; y < rows; y += 1) for (let x = 0; x < cols; x += 1) next[`${x},${y}`] = family;
    setTerrainCells(next);
  };
  // Random fill restricted to tiles that actually exist: the generator only
  // emits socket-legal placements, so reading back each cell's terrain gives a
  // legal, paintable map.
  const randomizeTerrain = () => {
    recordHistory();
    const board = generateSocketBoard({ assets: levelAssets, seed: Math.floor(Math.random() * 999999) + 1, columns: cols, rows, familyAssets: studioFamilyAssets });
    const next: Record<string, TileFamilyId> = {};
    for (const cell of board.cells) next[`${cell.x},${cell.y}`] = cell.terrain;
    setTerrainCells(next);
    setUnitCells({});
  };
  const changeSize = (key: 'small' | 'wide') => {
    if (key === sizeKey) return;
    recordHistory();
    setSizeKey(key);
  };

  // Build the durable Level doc from the painted board so we can validate now and
  // save to the server once the editor is hosted. Family ids are valid TerrainTypes.
  const buildLevel = (): Level => {
    const sourceLevel = routeLevelId ? useCampaigns.getState().levels[routeLevelId] ?? null : null;
    const terrain = Object.entries(terrainCells).map(([key, family]) => {
      const [x, y] = key.split(',').map(Number);
      return { x, y, terrain: family, elevation: 0 };
    });
    const units = Object.entries(unitCells).map(([key, unit]) => {
      const [x, y] = key.split(',').map(Number);
      return { x, y, type: unit.type, side: unit.side };
    });
    return {
      formatVersion: LEVEL_FORMAT_VERSION,
      id: sourceLevel?.id ?? routeLevelId ?? 'draft',
      name: sourceLevel?.name ?? 'Untitled',
      notes: sourceLevel?.notes ?? '',
      board: { cols, rows, heightLevels: 1 },
      objective: sourceLevel?.objective ?? 'capture-all',
      difficulty: sourceLevel?.difficulty ?? 'normal',
      economy: sourceLevel?.economy ?? { startingFunds: 1200, incomePerTurn: 150 },
      theme: sourceLevel?.theme ?? 'grassland',
      layers: { terrain, decals: [], zones: [], units },
    };
  };
  const validate = () => {
    const result = validateLevel(buildLevel());
    setStatus(result.ok ? `Valid · ${unitCount} units · ${cols} × ${rows}` : `Invalid: ${result.errors[0]}`);
  };
  const saveCampaignLevel = () => {
    const level = buildLevel();
    const result = validateLevel(level);
    if (!result.ok) {
      setStatus(`Invalid: ${result.errors[0]}`);
      return;
    }
    useCampaigns.getState().replaceLevel(result.level);
    if (routeCampaignId) useCampaigns.getState().selectCampaign(routeCampaignId);
    useCampaigns.getState().selectLevel(result.level.id);
    setStatus(`Saved ${result.level.name} to campaign workspace`);
    if (routeCampaignId) {
      void saveWorkspace({ campaigns: useCampaigns.getState().campaigns, levels: useCampaigns.getState().levels })
        .then(() => setStatus(`Saved ${result.level.name} to campaign workspace`))
        .catch((error) => setStatus(`Saved locally; server save failed: ${(error as Error).message}`));
    }
  };

  const setTerrainBrush = (family: TileFamilyId) => { setBrush(family); setLayer('terrain'); };
  const setUnitBrush = (type: PieceType, side: Side) => { setUnitType(type); setUnitSide(side); setUnitErase(false); setLayer('units'); };
  const onBoardPaint = layer === 'terrain' ? paintTerrain : placeUnit;
  const onBoardErase = layer === 'terrain' ? eraseTerrain : eraseUnit;
  const boardTool: 'select' | 'brush' | 'erase' =
    layer === 'terrain' ? (brush === 'erase' ? 'erase' : 'brush') : unitErase ? 'erase' : 'brush';
  const eraseActive = (layer === 'terrain' && brush === 'erase') || (layer === 'units' && unitErase);

  const toolTabs: Array<{ id: string; label: string; icon: string; active: boolean; onClick: () => void }> = [
    { id: 'terrain', label: 'Terrain', icon: 'brush', active: layer === 'terrain' && brush !== 'erase', onClick: () => { setLayer('terrain'); if (brush === 'erase') setBrush('grass'); } },
    { id: 'units', label: 'Units', icon: 'zone', active: layer === 'units' && !unitErase, onClick: () => { setLayer('units'); setUnitErase(false); } },
    { id: 'erase', label: 'Erase', icon: 'eraser', active: eraseActive, onClick: () => { if (layer === 'terrain') setBrush('erase'); else setUnitErase(true); } },
    { id: 'grid', label: showGrid ? 'Grid On' : 'Grid Off', icon: 'grid', active: showGrid, onClick: () => setShowGrid((value) => !value) },
  ];

  const layerRows: Array<{ id: string; label: string; locked: boolean }> = [
    { id: 'terrain', label: 'Terrain', locked: false },
    { id: 'units', label: 'Units', locked: false },
    { id: 'zones', label: 'Zones', locked: true },
    { id: 'decals', label: 'Decals', locked: true },
  ];

  const unitOverlay = (
    <div className="level-unit-layer">
      {Object.entries(unitCells).map(([key, unit]) => {
        const [x, y] = key.split(',').map(Number);
        const left = (x - y) * TILE_TEMPLATE.stepX;
        const top = (x + y) * TILE_TEMPLATE.stepY;
        const art = levelPieceArt[unit.type];
        return (
          <div key={key} className={`level-unit ${sideClass[unit.side]}`} style={{ left, top, zIndex: 500 + x + y }} title={`${sideLabel[unit.side]} ${pieceLabel[unit.type]}`}>
            {art ? <img src={art} alt="" draggable={false} /> : <span className="level-unit-chip">{pieceGlyph[unit.type]}</span>}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="level-editor-shell" data-testid="level-editor">
      <header className="le-topbar" aria-label="Level editor toolbar">
        <a className="le-brand" href="/">
          <img className="le-brand-crest" src="/assets/ui/main-menu/icon-scroll.png" alt="" aria-hidden="true" />
          <span>
            <picture className="le-brand-title">
              <source srcSet="/assets/ui/main-menu-brand-title-only-v1.avif" type="image/avif" />
              <source srcSet="/assets/ui/main-menu-brand-title-only-v1.webp" type="image/webp" />
              <img src="/assets/ui/main-menu-brand-title-only-v1.png" alt="Chess Tactics" />
            </picture>
            <strong>Level Editor</strong>
          </span>
        </a>
        <nav className="le-tool-tabs" aria-label="Editor tools">
          {toolTabs.map((tab) => (
            <button key={tab.id} type="button" data-testid={`tool-${tab.id}`} className={`le-tool-tab ${tab.active ? 'is-active' : ''}`.trim()} onClick={tab.onClick}>
              <img src={leIcon(tab.icon, tab.active)} alt="" aria-hidden="true" />
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>
        <div className="le-history" aria-label="Edit history">
          <LeIconButton label="Undo" icon="undo" disabled={!past.length} onClick={undo} />
          <LeIconButton label="Redo" icon="redo" disabled={!future.length} onClick={redo} />
        </div>
        <div className="le-save-actions">
          <LeActionButton label="Test" icon="play" onClick={validate} />
          <LeActionButton label="Save" icon="save" primary onClick={saveCampaignLevel} />
          <a className="le-menu-link" href={returnTo} aria-label="Return">
            <img src={leIcon('menu')} alt="" aria-hidden="true" />
          </a>
        </div>
      </header>

      <main className="le-workspace">
        <aside className="le-left-rail" aria-label="Board controls">
          <LeChromePanel title="Board Settings">
            <label className="le-field">
              <span>Size</span>
              <select value={sizeKey} onChange={(event) => changeSize(event.target.value as 'small' | 'wide')}>
                <option value="small">{levelSizes.small.cols} x {levelSizes.small.rows}</option>
                <option value="wide">{levelSizes.wide.cols} x {levelSizes.wide.rows}</option>
              </select>
            </label>
            <label className="le-field"><span>Theme</span><select value="Grassland" onChange={() => undefined}><option>Grassland</option></select></label>
            <label className="le-check"><input type="checkbox" checked={showGrid} onChange={() => setShowGrid((value) => !value)} /> Isometric Grid</label>
            <button type="button" className="le-action-button" onClick={randomizeTerrain} title="Generate a random, socket-legal terrain layout.">
              <img src={leIcon('grid')} alt="" aria-hidden="true" />
              <span>Randomize</span>
            </button>
          </LeChromePanel>

          <LeChromePanel title="Layers" className="le-layers-panel">
            {layerRows.map((row) => {
              const active = !row.locked && layer === row.id;
              return (
                <button key={row.id} type="button" className={`le-layer-row ${active ? 'is-selected' : ''}`.trim()} disabled={row.locked} onClick={() => !row.locked && setLayer(row.id as 'terrain' | 'units')}>
                  <img src={leIcon('eye', active)} alt="" aria-hidden="true" />
                  <span>{row.label}</span>
                  <img src={leIcon(row.locked ? 'lock' : 'grid', active)} alt="" aria-hidden="true" />
                </button>
              );
            })}
          </LeChromePanel>

          <LeChromePanel title="Map Preview" className="le-minimap-panel">
            <div className="le-minimap" aria-hidden="true"><span /></div>
          </LeChromePanel>

          <LeChromePanel title="Legality" className="le-camera-panel">
            <div className="le-legality-readout">
              <strong>{paintedCount}</strong> tiles · <strong>{unitCount}</strong> units
            </div>
            <div className={`le-legality-status ${missingCount > 0 ? 'is-warning' : paintedCount > 0 ? 'is-ok' : ''}`.trim()}>
              {missingCount > 0
                ? `${missingCount} unsupported junction${missingCount === 1 ? '' : 's'}`
                : paintedCount > 0
                  ? 'All edges legal'
                  : 'Paint terrain to begin.'}
            </div>
          </LeChromePanel>
        </aside>

        <section className="le-board-stage" aria-label="Editable board" onPointerDownCapture={beginStroke} onPointerUpCapture={endStroke}>
          <div className="le-board-frame le-board-live">
            <ViewPane kind="board" ariaLabel="Level editor board" zoom={viewZoom} pan={viewPan} minZoom={0.4} maxZoom={4} onZoomChange={setViewZoom} onPanChange={setViewPan}>
              <div className="tileset-view-board-content is-board">
                <StudioEditableBoard
                  cols={cols}
                  rows={rows}
                  cells={renderedCells}
                  units={{}}
                  resolveAsset={(id) => assetById.get(id)}
                  resolveUnit={() => undefined}
                  tool={boardTool}
                  selectedCell={null}
                  showFootprint={showGrid}
                  boardZoom={viewZoom}
                  boardPan={viewPan}
                  animationFrame={animationFrame}
                  onPaint={onBoardPaint}
                  onErase={onBoardErase}
                  onSelect={() => {}}
                  overlay={unitOverlay}
                />
              </div>
            </ViewPane>
          </div>
        </section>

        <aside className="le-right-rail" aria-label="Palette controls">
          <LeChromePanel title="Tile Palette" className="le-palette-panel">
            <div className="le-palette-grid">
              {levelTerrainOrder.map((family) => (
                <button key={family} type="button" title={terrainLabels[family]} className={layer === 'terrain' && brush === family ? 'is-active' : ''} onClick={() => setTerrainBrush(family)}>
                  <i style={{ background: levelFamilySwatch[family] }} />
                  <span>{terrainLabels[family]}</span>
                </button>
              ))}
              <button type="button" title="Erase terrain" className={layer === 'terrain' && brush === 'erase' ? 'is-active' : ''} onClick={() => { setBrush('erase'); setLayer('terrain'); }}>
                <i style={{ background: 'repeating-linear-gradient(45deg, #36202a, #36202a 4px, #6a2030 4px, #6a2030 8px)' }} />
                <span>Erase</span>
              </button>
            </div>
          </LeChromePanel>

          <LeChromePanel title="Units">
            <div className="le-unit-groups">
              {levelSides.map((side) => (
                <div key={side} className={`le-unit-side is-${side}`}>
                  <span>{sideLabel[side]}</span>
                  <div>
                    {levelPieceTypes.map((piece) => (
                      <button key={piece} type="button" title={`${sideLabel[side]} ${pieceLabel[piece]}`} className={layer === 'units' && !unitErase && unitType === piece && unitSide === side ? 'is-active' : ''} onClick={() => setUnitBrush(piece, side)}>
                        {pieceGlyph[piece]}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <button type="button" className={`le-action-button ${layer === 'units' && unitErase ? 'is-primary' : ''}`.trim()} onClick={() => { setUnitErase(true); setLayer('units'); }} title="Erase units (right-click also erases).">
                <img src={leIcon('eraser', layer === 'units' && unitErase)} alt="" aria-hidden="true" />
                <span>Erase Units</span>
              </button>
            </div>
          </LeChromePanel>

          <LeChromePanel title="Brush">
            <div className="le-brush-tools">
              <LeIconButton label="Paint" icon="brush" active={!eraseActive} onClick={() => { if (layer === 'terrain' && brush === 'erase') setBrush('grass'); setUnitErase(false); }} />
              <LeIconButton label="Erase" icon="eraser" active={eraseActive} onClick={() => { if (layer === 'terrain') setBrush('erase'); else setUnitErase(true); }} />
              <LeIconButton label="Grid" icon="grid" active={showGrid} onClick={() => setShowGrid((value) => !value)} />
              <LeIconButton label="Clear" icon="eraser" onClick={clearLevel} />
            </div>
            <label className="le-field">
              <span>Zoom</span>
              <input type="range" min="0.4" max="4" step="0.05" value={viewZoom} onChange={(event) => setViewZoom(Number(event.target.value))} />
            </label>
          </LeChromePanel>
        </aside>
      </main>

      <footer className="le-bottom-tray" aria-label="Asset tray">
        <div className="le-tray-assets">
          {levelSides.flatMap((side) =>
            levelPieceTypes.map((piece) => (
              <button key={`${side}-${piece}`} type="button" className={layer === 'units' && !unitErase && unitType === piece && unitSide === side ? 'is-active' : ''} onClick={() => setUnitBrush(piece, side)} title={`${sideLabel[side]} ${pieceLabel[piece]}`}>
                <span className={`le-tray-glyph ${sideClass[side]}`}>{pieceGlyph[piece]}</span>
                <span>{pieceLabel[piece]}</span>
              </button>
            )),
          )}
          {levelTerrainOrder.map((family) => (
            <button key={`tray-${family}`} type="button" className={layer === 'terrain' && brush === family ? 'is-active' : ''} onClick={() => setTerrainBrush(family)} title={terrainLabels[family]}>
              <i style={{ background: levelFamilySwatch[family] }} />
              <span>{terrainLabels[family]}</span>
            </button>
          ))}
        </div>
        <div className="le-tray-controls">
          <span>Layer</span>
          <LeIconButton label="Terrain" icon="brush" active={layer === 'terrain'} onClick={() => setLayer('terrain')} />
          <LeIconButton label="Units" icon="zone" active={layer === 'units'} onClick={() => setLayer('units')} />
        </div>
      </footer>

      <div className="le-status" data-testid="editor-status">
        <span className="le-status-dot" />
        <span>{status}</span>
        <span>Board: {cols} x {rows}</span>
        <span>Tiles: {paintedCount}</span>
        <span>Units: {unitCount}</span>
        <span>{missingCount > 0 ? `${missingCount} junction warning${missingCount === 1 ? '' : 's'}` : 'Legal'}</span>
      </div>
    </div>
  );
}

export function TilesetStudio({ initialCategory = 'tiles' }: { initialCategory?: 'tiles' | 'units' | 'assets' } = {}): ReactElement {
  const initialRoute = useMemo(() => readTilesetStudioRoute(), []);
  const initialHasViewTarget = Boolean(initialRoute.selectedAssetId || initialRoute.selectedSlotMask || initialRoute.tileFilter === 'board');
  const [familyId, setFamilyId] = useState<StudioFamilyId>(initialRoute.familyId);
  const [studioMode, setStudioMode] = useState<StudioMode>(initialRoute.studioMode);
  const [category, setCategory] = useState<'tiles' | 'units' | 'assets'>(initialRoute.category ?? initialCategory);
  const [labMode, setLabMode] = useState<LabMode>(initialRoute.labMode);
  const [viewHasTarget, setViewHasTarget] = useState(initialHasViewTarget);
  const [tileFilter, setTileFilter] = useState<TileFilter>(initialRoute.tileFilter);
  const [selectedFamilyIds, setSelectedFamilyIds] = useState<StudioFamilyId[]>(studioFamilies.map((fam) => fam.id));
  const [selectedCollectionFilters, setSelectedCollectionFilters] = useState<CollectionFilter[]>(
    initialRoute.tileFilter === 'board' ? ['base'] : [initialRoute.tileFilter],
  );
  const [catalogQuery, setCatalogQuery] = useState('');
  const [assetFilter, setAssetFilter] = useState<AssetFilter>('all');
  const [assetSearch, setAssetSearch] = useState('');
  const [selectedAssetName, setSelectedAssetName] = useState(initialRoute.selectedAssetName ?? 'gear');
  const [selectedUnitFamilies, setSelectedUnitFamilies] = useState<PieceId[]>(activeUnitFamilies);
  const [selectedPairId, setSelectedPairId] = useState<TerrainPairId>(initialRoute.selectedPairId);
  const [showFootprint, setShowFootprint] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [viewZoom, setViewZoom] = useState(1);
  const [viewPan, setViewPan] = useState({ x: 0, y: 0 });
  const [transitionViewMode, setTransitionViewMode] = useState<TransitionViewMode>(() => defaultTransitionViewModeForRoute(initialRoute));
  const transitionSampleSeed = 3117;
  const [boardMode, setBoardMode] = useState<'generated' | 'concept'>(initialRoute.boardMode);
  const [boardScope, setBoardScope] = useState<'family' | 'mixed'>(initialRoute.boardScope);
  const [boardSize, setBoardSize] = useState<'small' | 'wide'>(initialRoute.boardSize);
  const [boardSeed, setBoardSeed] = useState(initialRoute.boardSeed);
  const [animationPlaying, setAnimationPlaying] = useState(true);
  const [manualAnimationFrame, setManualAnimationFrame] = useState(0);
  // Unified editable board (temporary, in-memory only — re-seeds when a new view loads).
  const [tool, setTool] = useState<'select' | 'brush' | 'erase'>(initialRoute.brushKind === 'unit' ? 'brush' : 'select');
  const [brushKind, setBrushKind] = useState<'tile' | 'unit'>(initialRoute.brushKind);
  const [brushId, setBrushId] = useState<string>(initialRoute.selectedAssetId ?? '');
  const [unitBrushId, setUnitBrushId] = useState<string>(initialRoute.selectedUnitId ?? unitAssets[0].id);
  const [unitBrushDirection, setUnitBrushDirection] = useState<Direction>('south');
  const [unitBrushFaction] = useState<Faction>('navy-blue');
  const [boardCells, setBoardCells] = useState<Record<string, string>>({});
  const [boardUnits, setBoardUnits] = useState<Record<string, BoardUnitPlacement>>({});
  const [selectedCell, setSelectedCell] = useState<{ x: number; y: number } | null>(null);
  const [boardSectionOpen, setBoardSectionOpen] = useState(true);
  const [viewSectionOpen, setViewSectionOpen] = useState(true);

  const family = studioFamilies.find((item) => item.id === familyId) ?? studioFamilies[0];
  // The Blender textured tileset is hard-edged: only base tiles, no transition or
  // reference collections. (The transition/reference code paths are now unreachable.)
  const collectionFilters: Array<[CollectionFilter, string]> = [
    ['base', 'Base'],
  ];
  const selectedFamilies = studioFamilies.filter((item) => selectedFamilyIds.includes(item.id));
  const activeFamilies = selectedFamilies;
  const selectedFamilyLabel =
    activeFamilies.length === 0
      ? 'No families'
      : activeFamilies.length === studioFamilies.length
        ? 'All Tiles'
        : activeFamilies.length === 1
          ? activeFamilies[0].label
          : `${activeFamilies.length} families`;
  const selectedCollectionLabel =
    selectedCollectionFilters.length === 0
      ? 'No collections'
      : selectedCollectionFilters.map((filter) => collectionFilters.find(([id]) => id === filter)?.[1]).filter(Boolean).join(' + ');
  const [selectedAssetId, setSelectedAssetId] = useState(initialRoute.selectedAssetId ?? family.assets[0].id);
  const [selectedSlotMask, setSelectedSlotMask] = useState<number | undefined>(initialRoute.selectedSlotMask);
  const familyTransitionPairs = transitionPairsForFamily(family.id);
  const selectedPair = familyTransitionPairs.find((pair) => pair.id === selectedPairId) ?? familyTransitionPairs[0] ?? transitionPairs[0];
  const allStudioAssets = useMemo(() => [...studioFamilies.flatMap((item) => item.assets), ...transitionAssets], []);
  const selectedAsset = allStudioAssets.find((asset) => asset.id === selectedAssetId) ?? family.assets[0];
  const resolveStudioAsset = (id: string): StudioAsset | undefined => allStudioAssets.find((asset) => asset.id === id);
  const resolveUnitAsset = (id: string): UnitAsset | undefined => unitAssets.find((unit) => unit.id === id);
  const brushAsset = resolveStudioAsset(brushId) ?? selectedAsset;
  const unitBrushAsset = resolveUnitAsset(unitBrushId) ?? unitAssets[0];
  const paintCell = (x: number, y: number): void => {
    if (brushKind === 'unit') {
      setBoardUnits((prev) => ({
        ...prev,
        [`${x},${y}`]: {
          unitId: unitBrushAsset.id,
          direction: unitBrushDirection,
          faction: unitBrushFaction,
        },
      }));
      setLabMode('unit');
      return;
    }
    setBoardCells((prev) => ({ ...prev, [`${x},${y}`]: brushAsset.id }));
    setLabMode('tile');
  };
  const eraseCell = (x: number, y: number): void =>
    brushKind === 'unit'
      ? setBoardUnits((prev) => {
          const key = `${x},${y}`;
          if (!(key in prev)) return prev;
          const next = { ...prev };
          delete next[key];
          return next;
        })
      :
    setBoardCells((prev) => {
      const key = `${x},${y}`;
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  const clearBoard = (): void => {
    setBoardCells({});
    setBoardUnits({});
    setSelectedCell(null);
    setLabMode('board');
  };
  const filteredTileAssets = tileFilter === 'base' ? family.assets.filter((asset) => asset.kind === 'tile') : [];
  const catalogBaseAssets = activeFamilies.flatMap((item) => item.assets.filter((asset) => asset.kind === 'tile'));
  const catalogReferenceAssets = activeFamilies.flatMap((item) => item.assets.filter((asset) => asset.kind === 'reference'));
  const catalogTransitionAssets = transitionAssets.filter((asset) => asset.terrains?.some((terrain) => selectedFamilyIds.includes(terrain)));
  const normalizedCatalogQuery = catalogQuery.trim().toLowerCase();
  const matchesCatalogQuery = (asset: StudioAsset): boolean => {
    if (!normalizedCatalogQuery) return true;
    return [asset.label, asset.role, asset.source, asset.notes, asset.pairId ?? '', ...(asset.terrains ?? [])]
      .join(' ')
      .toLowerCase()
      .includes(normalizedCatalogQuery);
  };
  const visibleCatalogBaseAssets = catalogBaseAssets.filter(matchesCatalogQuery);
  const visibleCatalogReferenceAssets = catalogReferenceAssets.filter(matchesCatalogQuery);
  const visibleCatalogTransitionAssets = catalogTransitionAssets.filter(matchesCatalogQuery);
  const visibleCatalogCount = selectedCollectionFilters.includes('base') ? visibleCatalogBaseAssets.length : 0;
  const generatedAssets =
    boardScope === 'family'
      ? activeFamilies
          .flatMap((item) => item.assets.filter((asset) => asset.kind === 'tile'))
          .concat(transitionAssets.filter((asset) => asset.terrains?.every((terrain) => selectedFamilyIds.includes(terrain))))
      : studioFamilies
          .flatMap((item) => item.assets)
          .filter((asset) => asset.kind === 'tile')
          .concat(transitionAssets);
  const generatedBoardSize = boardSize === 'small' ? { columns: 8, rows: 6 } : { columns: 10, rows: 7 };
  const generatedBoard = useMemo(
    () =>
      generateSocketBoard({
        assets: generatedAssets,
        seed: boardSeed,
        columns: generatedBoardSize.columns,
        rows: generatedBoardSize.rows,
        familyAssets: studioFamilyAssets,
      }),
    [boardSeed, generatedAssets, generatedBoardSize.columns, generatedBoardSize.rows],
  );
  const coverageReport = useMemo(() => buildTileCoverageReport(studioFamilyAssets, transitionAssets), []);
  const familyMissingTransitionSlots = coverageReport.missingTransitionSlots.filter((slot) => transitionPairById(slot.pairId).terrains.includes(family.id));
  const selectedTransitionSlot = selectedSlotMask
    ? transitionSlotsForPair(selectedPair, transitionAssets).find((slot) => slot.mask === selectedSlotMask)
    : undefined;
  const selectedAssetPair = selectedAsset.pairId ? transitionPairById(selectedAsset.pairId) : undefined;
  const selectedAssetTransitionSlot =
    selectedAssetPair && selectedAsset.socketMask
      ? transitionSlotsForPair(selectedAssetPair, transitionAssets).find((slot) => slot.mask === selectedAsset.socketMask)
      : undefined;
  const viewTransitionSlot = selectedTransitionSlot ?? selectedAssetTransitionSlot;
  const viewTransitionPair = selectedTransitionSlot ? selectedPair : selectedAssetPair;
  const viewTransitionAsset = selectedTransitionSlot ? selectedTransitionSlot.assets[0] : selectedAssetTransitionSlot ? selectedAsset : undefined;
  const viewKind = tileFilter === 'board' ? 'board' : viewTransitionSlot ? 'transition' : 'tile';
  const viewVisualKind = viewKind === 'transition' && transitionViewMode === 'tile' ? 'tile' : viewKind;
  const inspectedAnimatedAsset =
    viewKind === 'transition' && viewTransitionAsset?.animation
      ? viewTransitionAsset
      : viewKind === 'tile' && selectedAsset.animation
        ? selectedAsset
        : undefined;
  const inspectedAnimation = inspectedAnimatedAsset?.animation;
  const animationFrameCount = inspectedAnimation?.frames.length ?? 8;
  const autoAnimationFrame = useAnimationClock(animationPlaying, animationFrameCount, inspectedAnimation?.frameMs ?? 150);
  const animationFrame = inspectedAnimation ? (animationPlaying ? autoAnimationFrame : manualAnimationFrame) : autoAnimationFrame;
  const focusedTileBoard = useMemo(() => boardForAsset(selectedAsset), [selectedAsset]);
  const focusedTransitionBoard = useMemo(
    () =>
      viewTransitionSlot
        ? transitionViewMode === 'tile' && viewTransitionAsset
          ? boardForAsset(viewTransitionAsset)
          : transitionViewMode === 'sample'
            ? boardForTransitionSample(viewTransitionPair, viewTransitionSlot, viewTransitionAsset, transitionSampleSeed)
            : boardForTransitionSlot(viewTransitionPair, viewTransitionSlot, viewTransitionAsset)
        : undefined,
    [transitionSampleSeed, transitionViewMode, viewTransitionAsset, viewTransitionPair, viewTransitionSlot],
  );
  const focusedViewBoard = viewKind === 'board' ? generatedBoard : viewKind === 'transition' && focusedTransitionBoard ? focusedTransitionBoard : focusedTileBoard;
  // The editable board grid: generated boards keep their own size; single tiles
  // and transitions get a default grid so you can paint around them.
  const editableGrid = viewKind === 'board' ? { columns: generatedBoardSize.columns, rows: generatedBoardSize.rows } : { columns: 8, rows: 6 };
  // Re-seed the editable board whenever the *loaded view* changes (a new tile,
  // transition, or a freshly generated board). Painting then mutates the seed.
  const boardSeedKey = `${viewKind}|${selectedAsset.id}|${selectedSlotMask ?? ''}|${boardMode}|${boardSeed}|${boardSize}|${boardScope}|${transitionViewMode}`;
  const focusedViewBoardRef = useRef(focusedViewBoard);
  focusedViewBoardRef.current = focusedViewBoard;
  const editableGridRef = useRef(editableGrid);
  editableGridRef.current = editableGrid;
  useEffect(() => {
    const board = focusedViewBoardRef.current;
    const grid = editableGridRef.current;
    const placed = board.cells.filter((cell) => cell.asset);
    let offX = 0;
    let offY = 0;
    if (viewKind !== 'board' && placed.length) {
      const xs = placed.map((cell) => cell.x);
      const ys = placed.map((cell) => cell.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      offX = Math.floor((grid.columns - (maxX - minX + 1)) / 2) - minX;
      offY = Math.floor((grid.rows - (maxY - minY + 1)) / 2) - minY;
    }
    const seeded: Record<string, string> = {};
    for (const cell of placed) {
      if (cell.asset) seeded[`${cell.x + offX},${cell.y + offY}`] = cell.asset.id;
    }
    const seededUnits: Record<string, BoardUnitPlacement> = {};
    if (labMode === 'unit' && placed.length) {
      const xs = placed.map((cell) => cell.x + offX);
      const ys = placed.map((cell) => cell.y + offY);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      const x = Math.round((minX + maxX) / 2);
      const y = Math.round((minY + maxY) / 2);
      seededUnits[`${x},${y}`] = {
        unitId: unitBrushAsset.id,
        direction: unitBrushDirection,
        faction: unitBrushFaction,
      };
    }
    setBoardCells(seeded);
    if (viewKind !== 'board' || labMode === 'unit') setBoardUnits(seededUnits);
    setSelectedCell(null);
    if (selectedAsset.kind === 'tile') setBrushId(selectedAsset.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardSeedKey]);

  useEffect(() => {
    if (labMode !== 'unit' || Object.keys(boardUnits).length > 0) return;
    const placed = Object.keys(boardCells).map((key) => key.split(',').map(Number) as [number, number]);
    if (placed.length === 0) return;
    const xs = placed.map(([x]) => x);
    const ys = placed.map(([, y]) => y);
    const x = Math.round((Math.min(...xs) + Math.max(...xs)) / 2);
    const y = Math.round((Math.min(...ys) + Math.max(...ys)) / 2);
    setBoardUnits({
      [`${x},${y}`]: {
        unitId: unitBrushAsset.id,
        direction: unitBrushDirection,
        faction: unitBrushFaction,
      },
    });
  }, [boardCells, boardUnits, labMode, unitBrushAsset.id, unitBrushDirection, unitBrushFaction]);
  // Select a tile, then "Fill cardinals" places the legal base tile of each edge
  // socket's family at N/E/S/W — recreating the old transition-proof view.
  const fillCardinals = (): void => {
    if (!selectedCell) return;
    const id = boardCells[`${selectedCell.x},${selectedCell.y}`];
    const asset = id ? resolveStudioAsset(id) : undefined;
    if (!asset) return;
    const sockets = socketsForAsset(asset);
    const { x, y } = selectedCell;
    const targets: Array<[number, number, StudioFamilyId]> = [
      [x, y - 1, sockets.north],
      [x + 1, y, sockets.east],
      [x, y + 1, sockets.south],
      [x - 1, y, sockets.west],
    ];
    setBoardCells((prev) => {
      const next = { ...prev };
      for (const [nx, ny, family] of targets) {
        const base = familyBaseAsset(family);
        if (base) next[`${nx},${ny}`] = base.id;
      }
      return next;
    });
  };
  // Fill the grid with the current brush — either only blank cells, or all cells.
  const fillBoard = (mode: 'empty' | 'all'): void => {
    setBoardCells((prev) => {
      const next: Record<string, string> = mode === 'all' ? {} : { ...prev };
      for (let y = 0; y < editableGrid.rows; y += 1) {
        for (let x = 0; x < editableGrid.columns; x += 1) {
          const key = `${x},${y}`;
          if (mode === 'all' || !(key in next)) next[key] = brushAsset.id;
        }
      }
      return next;
    });
  };
  const selectBoardCell = (x: number, y: number): void => {
    const key = `${x},${y}`;
    setSelectedCell({ x, y });
    if (boardUnits[key]) {
      setLabMode('unit');
      return;
    }
    if (boardCells[key]) {
      setLabMode('tile');
      return;
    }
    setLabMode('board');
  };
  const reviewItems: ReviewItem[] =
    tileFilter === 'board'
      ? Array.from(new Map(generatedBoard.cells.flatMap((cell) => (cell.asset ? [[cell.asset.id, cell.asset] as const] : []))).values()).map((asset) => ({ type: 'asset', asset }))
      : filteredTileAssets.map((asset) => ({ type: 'asset', asset }));
  const selectedReviewIndex = Math.max(
    0,
    reviewItems.findIndex((item) =>
      item.type === 'slot'
        ? selectedSlotMask === item.slot.mask && selectedPair.id === item.pair.id
        : !selectedSlotMask && item.asset.id === selectedAsset.id,
    ),
  );
  const selectedReviewPosition = reviewItems.length > 0 ? `${selectedReviewIndex + 1} of ${reviewItems.length}` : '0 of 0';

  useEffect(() => {
    const shell = document.querySelector('.shell');
    shell?.classList.add('tileset-studio-active');
    return () => shell?.classList.remove('tileset-studio-active');
  }, []);

  useEffect(() => {
    const assetSources = allStudioAssets.flatMap((asset) => [asset.src, ...(asset.animation?.frames ?? [])]);
    const preloadedImages = Array.from(new Set(assetSources)).map((src) => {
      const image = new Image();
      image.decoding = 'sync';
      image.src = src;
      return image;
    });

    return () => {
      preloadedImages.forEach((image) => {
        image.src = '';
      });
    };
  }, [allStudioAssets]);

  useEffect(() => {
    const syncFromRoute = () => {
      const route = readTilesetStudioRoute();
      const routeFamily = studioFamilyById(route.familyId);
      setFamilyId(route.familyId);
      setSelectedFamilyIds([route.familyId]);
      setStudioMode(route.studioMode);
      if (route.category) setCategory(route.category);
      if (route.selectedAssetName) setSelectedAssetName(route.selectedAssetName);
      setViewHasTarget(Boolean(route.selectedAssetId || route.selectedSlotMask || route.tileFilter === 'board'));
      setTileFilter(route.tileFilter);
      setLabMode(route.labMode);
      if (route.tileFilter !== 'board') setSelectedCollectionFilters([route.tileFilter]);
      setSelectedPairId(route.selectedPairId);
      setSelectedAssetId(route.selectedAssetId ?? routeFamily.assets[0].id);
      setSelectedSlotMask(route.selectedSlotMask);
      setTransitionViewMode(defaultTransitionViewModeForRoute(route));
      setBoardMode(route.boardMode);
      setBoardScope(route.boardScope);
      setBoardSize(route.boardSize);
      setBoardSeed(route.boardSeed);
      setBrushKind(route.brushKind);
      if (route.brushKind === 'unit') setTool('brush');
      if (route.selectedUnitId) setUnitBrushId(route.selectedUnitId);
    };

    window.addEventListener('popstate', syncFromRoute);
    return () => window.removeEventListener('popstate', syncFromRoute);
  }, []);

  useEffect(() => {
    if (!allStudioAssets.some((asset) => asset.id === selectedAssetId)) {
      setSelectedAssetId(family.assets[0].id);
      setSelectedSlotMask(undefined);
    }
  }, [allStudioAssets, family.assets, selectedAssetId]);

  useEffect(() => {
    if (!familyTransitionPairs.some((pair) => pair.id === selectedPairId)) {
      setSelectedPairId(familyTransitionPairs[0]?.id ?? 'grass-stone');
    }
  }, [familyTransitionPairs, selectedPairId]);

  useEffect(() => {
    const visibleAssets = tileFilter === 'base' ? family.assets.filter((asset) => asset.kind === 'tile') : [];
    if (tileFilter !== 'board' && visibleAssets.length > 0) {
      setSelectedAssetId((currentAssetId) => (visibleAssets.some((asset) => asset.id === currentAssetId) ? currentAssetId : visibleAssets[0].id));
    }
  }, [family, selectedPair.id, tileFilter]);

  useEffect(() => {
    setSelectedSlotMask(undefined);
  }, [tileFilter]);

  useEffect(() => {
    setManualAnimationFrame((frame) => frame % animationFrameCount);
  }, [animationFrameCount, inspectedAnimatedAsset?.id]);

  useEffect(() => {
    setViewPan({ x: 0, y: 0 });
    setViewZoom(defaultViewZoom(viewVisualKind));
  }, [boardMode, boardScope, boardSeed, boardSize, selectedAsset.id, selectedSlotMask, viewVisualKind]);

  useEffect(() => {
    writeTilesetStudioRoute({
      familyId,
      studioMode,
      category,
      selectedAssetName,
      labMode,
      tileFilter,
      selectedPairId,
      selectedAssetId: viewHasTarget ? selectedAsset.id : undefined,
      selectedSlotMask: viewHasTarget ? selectedSlotMask : undefined,
      boardMode,
      boardScope,
      boardSize,
      boardSeed,
      brushKind,
      selectedUnitId: unitBrushId,
    });
  }, [boardMode, boardScope, boardSeed, boardSize, brushKind, category, familyId, labMode, selectedAsset.id, selectedAssetName, selectedPairId, selectedSlotMask, studioMode, tileFilter, unitBrushId, viewHasTarget]);

  const toggleFamilyFilter = (nextFamilyId: StudioFamilyId) => {
    setSelectedFamilyIds((current) => {
      const next = current.includes(nextFamilyId) ? current.filter((item) => item !== nextFamilyId) : [...current, nextFamilyId];
      if (next.length > 0) {
        setFamilyId(next[0]);
      }
      if (next.length > 0 && !next.includes(familyId)) {
        const nextFamily = studioFamilyById(next[0]);
        setSelectedAssetId(familySample(nextFamily).id);
        setSelectedSlotMask(undefined);
      }
      return next;
    });
  };

  const toggleCollectionFilter = (collection: CollectionFilter) => {
    setSelectedCollectionFilters((current) => {
      const next = current.includes(collection) ? current.filter((item) => item !== collection) : [...current, collection];
      if (next.length > 0) {
        setTileFilter(next[0]);
      }
      return next;
    });
  };

  const openBoardLab = () => {
    setLabMode('board');
    setViewHasTarget(true);
    setStudioMode('lab');
  };

  const inspectAsset = (asset: StudioAsset) => {
    setSelectedAssetId(asset.id);
    setSelectedSlotMask(undefined);
    setTileFilter('base');
    setLabMode('tile');
    setViewHasTarget(true);
    setStudioMode('lab');
  };

  // Catalog paintbrush: arm a tile as the brush and drop onto the CURRENT board
  // without changing the loaded view (so the board isn't wiped/re-seeded).
  const armBrush = (asset: StudioAsset) => {
    if (asset.kind !== 'tile') return;
    setBrushId(asset.id);
    setBrushKind('tile');
    setTool('brush');
    setLabMode('board');
    setStudioMode('lab');
  };

  // Inert: the hard-edged textured tileset has no transition slots, so this is
  // never reached (kept type-valid for the unused transition catalog scaffolding).
  const inspectSlot = (pair: TransitionPair, slot: TransitionSlot<StudioAsset>) => {
    setSelectedPairId(pair.id);
    setSelectedSlotMask(slot.mask);
    setTileFilter('base');
    setTransitionViewMode(slot.assets[0] ? 'tile' : 'proof');
    setLabMode('tile');
    setViewHasTarget(true);
    setStudioMode('lab');
  };

  const selectOrInspectAsset = (asset: StudioAsset) => {
    inspectAsset(asset);
  };

  const selectOrInspectSlot = (pair: TransitionPair, slot: TransitionSlot<StudioAsset>) => {
    inspectSlot(pair, slot);
  };

  const viewCurrentSelection = () => {
    if (selectedTransitionSlot) {
      inspectSlot(selectedPair, selectedTransitionSlot);
      return;
    }
    inspectAsset(selectedAsset);
  };

  const selectReviewItem = (item: ReviewItem) => {
    if (item.type === 'slot') {
      setSelectedPairId(item.pair.id);
      setSelectedSlotMask(item.slot.mask);
    } else {
      setSelectedAssetId(item.asset.id);
      setSelectedSlotMask(undefined);
    }
    setViewHasTarget(true);
    setStudioMode('lab');
  };

  const moveReviewSelection = (direction: -1 | 1) => {
    if (reviewItems.length === 0) return;
    const currentIndex = selectedReviewIndex >= 0 ? selectedReviewIndex : 0;
    const nextIndex = (currentIndex + direction + reviewItems.length) % reviewItems.length;
    selectReviewItem(reviewItems[nextIndex]);
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        moveReviewSelection(-1);
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        moveReviewSelection(1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [reviewItems, selectedReviewIndex]);

  const viewTitle =
    labMode === 'unit'
      ? unitBrushAsset.label
      : viewKind === 'board'
      ? 'Board View'
      : viewKind === 'transition'
        ? viewTransitionAsset?.label ?? `Missing ${viewTransitionPair?.label ?? 'Transition'} ${viewTransitionSlot?.label ?? ''}`
        : selectedAsset.label;
  const viewSubtitle =
    labMode === 'unit'
      ? `${unitBrushAsset.family} unit · ${selectedAsset.label} tile`
      : viewKind === 'board'
      ? `${boardScope === 'family' ? selectedFamilyLabel : 'Mixed terrain'} · seed ${boardSeed}`
      : viewKind === 'transition'
        ? `${viewTransitionPair?.label ?? 'Transition'} · mask ${viewTransitionSlot?.code ?? selectedAsset.socketMask ?? ''}`
        : `${family.label} · ${selectedAsset.role}`;
  const hasLabTiles = Object.keys(boardCells).length > 0;
  const hasLabUnits = Object.keys(boardUnits).length > 0;
  const normalizedUnitQuery = catalogQuery.trim().toLowerCase();
  const visibleUnits = normalizedUnitQuery
    ? unitAssets.filter((unit) => [unit.label, unit.badge, unit.family, unit.read, unit.status].join(' ').toLowerCase().includes(normalizedUnitQuery))
    : unitAssets;
  // Slim topbar: a breadcrumb + a quiet count instead of a big titleblock. Keeps
  // the header height constant (the Lab already shares this header — no second
  // row inside the board surface, which is what made the controls rail jump).
  const crumbTrail =
    studioMode === 'catalog'
      ? ['Catalog', category === 'units' ? 'Units' : category === 'assets' ? 'Assets' : 'Tiles']
      : category === 'assets'
        ? ['Lab', 'Asset', selectedAssetName || '—']
        : ['Lab', labMode === 'unit' ? 'Unit' : labMode === 'tile' ? 'Tile' : 'Board'];
  const crumbMeta =
    studioMode === 'catalog'
      ? category === 'units'
        ? `${visibleUnits.length} unit${visibleUnits.length === 1 ? '' : 's'}`
        : category === 'assets'
          ? `${kitManifest.summary.total} icons`
          : `${visibleCatalogCount} asset${visibleCatalogCount === 1 ? '' : 's'} · ${selectedCollectionLabel}`
      : category === 'assets'
        ? 'preview on backdrops'
        : viewSubtitle;
  const openCatalogMode = (): void => {
    if (tileFilter === 'board') setTileFilter('base');
    setStudioMode('catalog');
  };
  const openLabMode = (): void => {
    if (category === 'assets') { setStudioMode('lab'); return; }
    openBoardLab();
  };
  const selectUnitInCatalog = (unitId: string): void => {
    setUnitBrushId(unitId);
  };
  const placeUnitOnLoadedBoard = (unitId: string): void => {
    const occupiedTileKeys = Object.keys(boardCells);
    const [x, y] = selectedCell
      ? [selectedCell.x, selectedCell.y]
      : occupiedTileKeys.length > 0
        ? (() => {
            const positions = occupiedTileKeys.map((key) => key.split(',').map(Number) as [number, number]);
            const xs = positions.map(([cellX]) => cellX);
            const ys = positions.map(([, cellY]) => cellY);
            return [Math.round((Math.min(...xs) + Math.max(...xs)) / 2), Math.round((Math.min(...ys) + Math.max(...ys)) / 2)];
          })()
        : [Math.floor(editableGrid.columns / 2), Math.floor(editableGrid.rows / 2)];
    setUnitBrushId(unitId);
    setBrushKind('unit');
    setTool('select');
    setBoardUnits((prev) => ({
      ...prev,
      [`${x},${y}`]: {
        unitId,
        direction: unitBrushDirection,
        faction: unitBrushFaction,
      },
    }));
    setSelectedCell({ x, y });
    setLabMode('unit');
    setViewHasTarget(true);
    setStudioMode('lab');
  };
  const inspectUnitInLab = (unitId: string): void => {
    placeUnitOnLoadedBoard(unitId);
  };
  const openTileLab = (): void => {
    if (!hasLabTiles) return;
    setLabMode('tile');
    setStudioMode('lab');
  };
  const openUnitLab = (): void => {
    if (!hasLabUnits) return;
    setLabMode('unit');
    setBrushKind('unit');
    setStudioMode('lab');
  };

  // Catalog asset-type descriptors. The generic <CatalogGrid>/<CatalogControls>
  // render either of these; a new asset type is just another descriptor.
  const tileFamilyOf = new Map<string, StudioFamilyId>();
  for (const fam of studioFamilies) for (const a of fam.assets) tileFamilyOf.set(a.id, fam.id);
  const tilesCatalogType: CatalogType<StudioAsset> = {
    id: 'tiles',
    label: 'Tiles',
    assets: studioFamilies.flatMap((fam) => fam.assets),
    card: (a) => ({ img: assetFrameSrc(a, animationFrame), title: a.label, badge: a.role }),
    sections: (visible) => [{ id: 'base', label: 'Base Tiles', assets: visible.filter((a) => a.kind === 'tile') }],
    query: {
      value: catalogQuery,
      set: setCatalogQuery,
      placeholder: 'label, source, socket...',
      match: (a, q) => [a.label, a.role, a.source, a.notes, ...(a.terrains ?? [])].join(' ').toLowerCase().includes(q),
    },
    zoom: { value: zoom, set: setZoom, min: 0.75, max: 2, step: 0.05, cssVar: '--tile-zoom' },
    filters: [
      {
        id: 'family',
        label: 'Tile Family',
        options: studioFamilies.map((fam) => ({ id: fam.id, label: fam.label, sub: familyCounts(fam) })),
        memberOf: (a) => [tileFamilyOf.get(a.id) ?? 'grass'],
        selected: selectedFamilyIds,
        toggle: (id) => toggleFamilyFilter(id as StudioFamilyId),
        selectAll: () => setSelectedFamilyIds(studioFamilies.map((fam) => fam.id)),
        clear: () => setSelectedFamilyIds([]),
      },
    ],
    onSelect: (a) => { setSelectedAssetId(a.id); setSelectedSlotMask(undefined); },
    onView: inspectAsset,
    onArm: armBrush,
    selectedId: selectedAssetId,
  };
  const unitFamilyCount = (family: PieceId) => unitAssets.filter((u) => u.family === family).length;
  const unitsCatalogType: CatalogType<UnitAsset> = {
    id: 'units',
    label: 'Units',
    assets: unitAssets,
    card: (u) => ({ img: u.preview, title: u.label, badge: u.badge, isUnit: true }),
    sections: (visible) => [{ id: 'units', label: 'Production Units', assets: [...visible] }],
    query: {
      value: catalogQuery,
      set: setCatalogQuery,
      placeholder: 'piece, read, status...',
      match: (u, q) => [u.label, u.badge, u.family, u.read, u.status].join(' ').toLowerCase().includes(q),
    },
    zoom: { value: zoom, set: setZoom, min: 0.75, max: 2, step: 0.05, cssVar: '--tile-zoom' },
    filters: [
      {
        id: 'family',
        label: 'Unit Family',
        options: activeUnitFamilies.map((family) => {
          const n = unitFamilyCount(family);
          return { id: family, label: familyLabels[family], sub: `${n} ${n === 1 ? 'unit' : 'units'}` };
        }),
        memberOf: (u) => [u.family],
        selected: selectedUnitFamilies,
        toggle: (id) => setSelectedUnitFamilies((cur) => (cur.includes(id as PieceId) ? cur.filter((x) => x !== id) : [...cur, id as PieceId])),
        selectAll: () => setSelectedUnitFamilies(activeUnitFamilies),
        clear: () => setSelectedUnitFamilies([]),
      },
    ],
    onSelect: (u) => selectUnitInCatalog(u.id),
    onView: (u) => inspectUnitInLab(u.id),
    onArm: (u) => placeUnitOnLoadedBoard(u.id),
    selectedId: unitBrushId,
    note: 'Select a unit card to place it in the shared lab board.',
  };

  return (
    <main className="tileset-studio-page">
      <header className="tileset-studio-header">
        <div className="tileset-studio-brand">
          <strong className="tileset-studio-wordmark">Studio</strong>
          <nav className="tileset-crumb" aria-label="Location">
            {crumbTrail.map((part, index) => (
              <span key={index} className={index === crumbTrail.length - 1 ? 'is-current' : ''}>{part}</span>
            ))}
          </nav>
          {crumbMeta ? <span className="tileset-crumb-meta">{crumbMeta}</span> : null}
        </div>
        <nav className="tileset-studio-actions" aria-label="Tileset studio navigation">
          <span className="tileset-mode-tabs" aria-label="Workspace mode">
            <button type="button" className={studioMode === 'catalog' ? 'is-active' : ''} onClick={openCatalogMode} title="Browse asset catalogs.">
              Catalog
            </button>
            <button type="button" className={studioMode === 'lab' ? 'is-active' : ''} onClick={openLabMode} title="Open the shared board lab.">
              Lab
            </button>
          </span>
          <a href="/settings">Settings</a>
        </nav>
      </header>

      <section className={`tileset-studio-shell is-${studioMode} ${category === 'units' ? 'is-units' : ''}`} aria-label="Tileset browser">
        {studioMode === 'catalog' ? (
        <>
        {category === 'units' ? <CatalogGrid type={unitsCatalogType} /> : category === 'assets' ? <AssetLibraryStudio filter={assetFilter} search={assetSearch} zoom={zoom} selected={selectedAssetName} onSelect={setSelectedAssetName} /> : <CatalogGrid type={tilesCatalogType} />}
        <aside className="tileset-view-controls tileset-catalog-controls" aria-label="Catalog controls">
          <section className="tileset-inspector-section">
            <h2>Controls</h2>
            <div className="tileset-control-stack">
              <div className="tileset-tier-seg" aria-label="Catalog asset type">
                <button
                  type="button"
                  className={category === 'tiles' ? 'is-active' : ''}
                  onClick={() => setCategory('tiles')}
                  title="Browse terrain tiles."
                >
                  Tiles
                </button>
                <button
                  type="button"
                  className={category === 'units' ? 'is-active' : ''}
                  onClick={() => setCategory('units')}
                  title="Browse chess-piece units."
                >
                  Units
                </button>
                <button
                  type="button"
                  className={category === 'assets' ? 'is-active' : ''}
                  onClick={() => setCategory('assets')}
                  title="Browse the UI-kit asset library."
                >
                  Assets
                </button>
              </div>
              {category === 'units' ? <CatalogControls type={unitsCatalogType} /> : category === 'assets' ? (
                <>
                  <label className="tileset-catalog-search">
                    <span>Search</span>
                    <input type="search" value={assetSearch} onChange={(event) => setAssetSearch(event.target.value)} placeholder="asset name…" />
                  </label>
                  <label className="tileset-catalog-zoom">
                    <span>Zoom</span>
                    <input type="range" min="0.75" max="2" step="0.05" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} />
                  </label>
                  <div className="tileset-tier-seg" aria-label="Process filter">
                    {(['all', 'forged', 'unverified'] as const).map((option) => (
                      <button key={option} type="button" className={assetFilter === option ? 'is-active' : ''} onClick={() => setAssetFilter(option)}>
                        {option === 'all' ? 'All' : option === 'forged' ? 'Forged' : 'Unverified'}
                      </button>
                    ))}
                  </div>
                  <button type="button" className="tileset-view-action" onClick={() => setStudioMode('lab')}>View Selected</button>
                </>
              ) : <CatalogControls type={tilesCatalogType} />}
            </div>
          </section>
        </aside>
        </>
        ) : category === 'assets' ? (
          <AssetLab name={selectedAssetName} onPickBoard={() => { setCategory('tiles'); openBoardLab(); }} />
        ) : (
          <>
            <section className="tileset-lab-stage" aria-label="Lab board surface">
            <ViewPane
              kind={viewVisualKind}
              ariaLabel={`${viewTitle} visual inspection`}
              zoom={viewZoom}
              pan={viewPan}
              minZoom={0.55}
              maxZoom={2.2}
              onZoomChange={setViewZoom}
              onPanChange={setViewPan}
              onAssetClick={(assetId) => {
                const asset = allStudioAssets.find((item) => item.id === assetId);
                if (asset) inspectAsset(asset);
              }}
            >
              <div className={`tileset-view-board-content is-${viewVisualKind}`}>
                <StudioEditableBoard
                  cols={editableGrid.columns}
                  rows={editableGrid.rows}
                  cells={boardCells}
                  units={boardUnits}
                  resolveAsset={resolveStudioAsset}
                  resolveUnit={resolveUnitAsset}
                  tool={tool}
                  selectedCell={selectedCell}
                  showFootprint={showFootprint}
                  boardZoom={viewZoom}
                  boardPan={viewPan}
                  animationFrame={animationFrame}
                  onPaint={paintCell}
                  onErase={eraseCell}
                  onSelect={selectBoardCell}
                />
              </div>
            </ViewPane>
            </section>

            <aside className="tileset-view-controls tileset-catalog-controls" aria-label="Lab controls">
              <section className="tileset-inspector-section">
                <h2>Controls</h2>
                <div className="tileset-control-stack">
              <span className="tileset-mode-tabs tileset-lab-component-tabs" aria-label="Component view">
                <button
                  type="button"
                  className={labMode === 'board' ? 'is-active' : ''}
                  onClick={openBoardLab}
                  title="Inspect and edit the loaded board."
                >
                  Board
                </button>
                <button
                  type="button"
                  className={labMode === 'tile' ? 'is-active' : ''}
                  onClick={openTileLab}
                  disabled={!hasLabTiles}
                  title={hasLabTiles ? 'Inspect the selected tile on the loaded board.' : 'Place or select a tile first.'}
                >
                  Tile
                </button>
                <button
                  type="button"
                  className={labMode === 'unit' ? 'is-active' : ''}
                  onClick={openUnitLab}
                  disabled={!hasLabUnits}
                  title={hasLabUnits ? 'Inspect the selected unit on the loaded board.' : 'Place or select a unit first.'}
                >
                  Unit
                </button>
              </span>
                      <div className="tileset-segmented-control tileset-tools" aria-label="Board tool">
                        <button type="button" className={tool === 'select' ? 'is-active' : ''} onClick={() => setTool('select')} title="Select tool — click a tile to highlight it (then fill its neighbors). Doesn't paint or erase.">
                          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 2 L3 13 L6 10 L8 14.6 L9.8 13.8 L7.8 9.4 L12.5 9.4 Z" fill="currentColor" /></svg>
                          Select
                        </button>
                        <button type="button" className={tool === 'brush' ? 'is-active' : ''} onClick={() => setTool('brush')} title="Brush tool — click or drag to stamp the current brush tile.">
                          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M13.4 2.6 L7.4 8.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /><path d="M7.6 8.2 C5.8 7.8 4.3 8.6 3.9 10.1 C3.6 11.2 3 11.7 2.3 11.9 C3.4 13.4 6 13.9 7.6 12.3 C8.6 11.3 8.6 9.4 7.6 8.2 Z" fill="currentColor" /></svg>
                          Brush
                        </button>
                        <button type="button" className={tool === 'erase' ? 'is-active' : ''} onClick={() => setTool('erase')} title="Erase tool — click or drag to remove tiles. (Right-click removes with any tool.)">
                          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><rect x="2.6" y="7.6" width="9.4" height="5" rx="1.2" transform="rotate(-40 7.3 10.1)" fill="none" stroke="currentColor" strokeWidth="1.5" /><line x1="6" y1="13.6" x2="13.6" y2="13.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                          Erase
                        </button>
                      </div>

                      <p className="tileset-group-label">Brush</p>
                      <div className="tileset-segmented-control" aria-label="Placeable brush type">
                        <button type="button" className={brushKind === 'tile' ? 'is-active' : ''} onClick={() => setBrushKind('tile')} title="Paint terrain tiles.">
                          Tile
                        </button>
                        <button type="button" className={brushKind === 'unit' ? 'is-active' : ''} onClick={() => setBrushKind('unit')} title="Place chess units on top of tiles.">
                          Unit
                        </button>
                      </div>
                      <button
                        type="button"
                        className="tileset-brush-display"
                        onClick={() => {
                          setCategory(brushKind === 'unit' ? 'units' : 'tiles');
                          setStudioMode('catalog');
                        }}
                        title={brushKind === 'unit' ? 'Pick a different unit from the unit catalog' : 'Pick a different tile from the tile catalog'}
                        aria-label={`Active brush: ${brushKind === 'unit' ? unitBrushAsset.label : brushAsset.label}. Pick a different ${brushKind}.`}
                      >
                        <img src={brushKind === 'unit' ? unitBrushAsset.preview : brushAsset.src} alt="" draggable={false} />
                        <span className="tileset-brush-label">{brushKind === 'unit' ? unitBrushAsset.label : brushAsset.label}</span>
                        <span className="tileset-brush-change">Pick in catalog ›</span>
                      </button>
                      {brushKind === 'unit' ? (
                        <div className="tileset-segmented-control tileset-unit-facing" aria-label="Unit facing">
                          {(['south', 'east', 'north', 'west'] as Direction[]).map((dir) => (
                            <button
                              key={dir}
                              type="button"
                              className={unitBrushDirection === dir ? 'is-active' : ''}
                              onClick={() => setUnitBrushDirection(dir)}
                              title={`Face ${dir}`}
                            >
                              {dir[0].toUpperCase()}
                            </button>
                          ))}
                        </div>
                      ) : null}

                      {brushKind === 'tile' ? (
                        <>
                          <p className="tileset-group-label">Fill</p>
                          {tool === 'select' && selectedCell && boardCells[`${selectedCell.x},${selectedCell.y}`] ? (
                            <button type="button" className="tileset-wide-action" onClick={fillCardinals} title="Place the matching base tile of each edge's family around the selected tile (N/E/S/W).">
                              Fill cardinal neighbors
                            </button>
                          ) : null}
                          <div className="tileset-button-row">
                            <button type="button" onClick={() => fillBoard('empty')} title="Fill every blank cell with the current brush.">Empty</button>
                            <button type="button" onClick={() => fillBoard('all')} title="Fill the whole board with the current brush (overwrites everything).">Whole</button>
                            <button type="button" className="tileset-action-danger" onClick={clearBoard} disabled={Object.keys(boardCells).length === 0 && Object.keys(boardUnits).length === 0} title="Remove every tile and unit from the board.">
                              Clear
                            </button>
                          </div>
                        </>
                      ) : (
                        <div className="tileset-button-row">
                          <button type="button" className="tileset-action-danger" onClick={clearBoard} disabled={Object.keys(boardCells).length === 0 && Object.keys(boardUnits).length === 0} title="Remove every tile and unit from the board.">
                            Clear board
                          </button>
                        </div>
                      )}

                  {viewKind === 'board' ? (
                    <>
                      <button type="button" className="tileset-group-label is-collapsible" aria-expanded={boardSectionOpen} onClick={() => setBoardSectionOpen((value) => !value)} title={boardSectionOpen ? 'Collapse the Board section' : 'Expand the Board section'}>
                        <span>Board</span>
                        <span className="tileset-group-rule" aria-hidden="true" />
                        <svg className="tileset-group-chevron" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M4 6 L8 10 L12 6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      </button>
                      {boardSectionOpen ? (
                        <>
                          <div className="tileset-segmented-control" aria-label="Terrain scope">
                            <button type="button" className={boardScope === 'family' ? 'is-active' : ''} onClick={() => setBoardScope('family')} title="Generate using only the current family's tiles.">
                              Family
                            </button>
                            <button type="button" className={boardScope === 'mixed' ? 'is-active' : ''} onClick={() => setBoardScope('mixed')} title="Generate using all terrain families mixed together.">
                              Mixed
                            </button>
                          </div>
                          <div className="tileset-button-row">
                            <button type="button" onClick={() => setBoardSeed(Math.floor(Math.random() * 999999) + 1)} title="Generate a fresh random board (new seed).">
                              New random
                            </button>
                            <button type="button" onClick={() => setBoardSize((size) => (size === 'small' ? 'wide' : 'small'))} title="Toggle board size (8×6 ↔ 10×7).">
                              {boardSize === 'small' ? '8 × 6' : '10 × 7'}
                            </button>
                          </div>
                        </>
                      ) : null}
                    </>
                  ) : null}

                  <button type="button" className="tileset-group-label is-collapsible" aria-expanded={viewSectionOpen} onClick={() => setViewSectionOpen((value) => !value)} title={viewSectionOpen ? 'Collapse the View section' : 'Expand the View section'}>
                    <span>View</span>
                    <span className="tileset-group-rule" aria-hidden="true" />
                    <svg className="tileset-group-chevron" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M4 6 L8 10 L12 6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </button>
                  {viewSectionOpen ? (
                    <>
                  <div className="tileset-button-row">
                    <button
                      type="button"
                      className={`tileset-toggle ${showFootprint ? 'is-on' : ''}`}
                      aria-pressed={showFootprint}
                      onClick={() => setShowFootprint((value) => !value)}
                      title="Overlay the canonical tile-footprint diamond on each tile to check that the art lines up with the locked geometry."
                    >
                      <span>Footprint</span>
                      <span className="tileset-toggle-pill" aria-hidden="true" />
                    </button>
                    <button type="button" onClick={() => setViewPan({ x: 0, y: 0 })} title="Recenter the board in the viewport.">
                      Center
                    </button>
                  </div>
                  {inspectedAnimation ? (
                    <div className="tileset-animation-controls" aria-label={`${inspectedAnimation.label} frame controls`}>
                      <h3>Animation</h3>
                      <div className="tileset-animation-control-row">
                        <button
                          type="button"
                          title={animationPlaying ? 'Pause the animation preview.' : 'Play the animation preview.'}
                          onClick={() => {
                            if (animationPlaying) setManualAnimationFrame(animationFrame);
                            setAnimationPlaying((value) => !value);
                          }}
                        >
                          {animationPlaying ? 'Pause' : 'Play'}
                        </button>
                        <button
                          type="button"
                          title="Step to the previous animation frame."
                          onClick={() => {
                            setAnimationPlaying(false);
                            setManualAnimationFrame((animationFrame - 1 + animationFrameCount) % animationFrameCount);
                          }}
                        >
                          Prev
                        </button>
                        <button
                          type="button"
                          title="Step to the next animation frame."
                          onClick={() => {
                            setAnimationPlaying(false);
                            setManualAnimationFrame((animationFrame + 1) % animationFrameCount);
                          }}
                        >
                          Next
                        </button>
                      </div>
                      <label>
                        Frame {animationFrame + 1} / {animationFrameCount}
                        <input
                          type="range"
                          min="0"
                          max={animationFrameCount - 1}
                          step="1"
                          value={animationFrame}
                          onChange={(event) => {
                            setAnimationPlaying(false);
                            setManualAnimationFrame(Number(event.target.value));
                          }}
                        />
                      </label>
                    </div>
                  ) : null}
                  <label>
                    View Zoom
                    <input
                      type="range"
                      min="0.55"
                      max="2.2"
                      step="0.05"
                      value={viewZoom}
                      onChange={(event) => setViewZoom(Number(event.target.value))}
                    />
                  </label>
                    </>
                  ) : null}
                  <p className="tileset-control-footnote">Board edits are temporary — not saved.</p>
                </div>
              </section>

              <section className="tileset-inspector-section" aria-label="Selected item details">
                <h2>Details</h2>
                {labMode === 'unit' ? (
                  <dl>
                    <InspectorRow label="Unit">{unitBrushAsset.label}</InspectorRow>
                    <InspectorRow label="Piece">{unitBrushAsset.family}</InspectorRow>
                    <InspectorRow label="Status">{unitBrushAsset.status}</InspectorRow>
                    <InspectorRow label="Footprint">{unitBrushAsset.footprint.shape}</InspectorRow>
                    <InspectorRow label="Ground">{selectedAsset.label}</InspectorRow>
                  </dl>
                ) : viewTransitionSlot ? (
                  <dl>
                    <InspectorRow label="Tile Type">{viewTransitionAsset ? 'Transition tile' : 'Missing art'}</InspectorRow>
                    {viewTransitionAsset ? (
                      <>
                        <InspectorRow label="Source">{viewTransitionAsset.source}</InspectorRow>
                        <InspectorRow label="Projection">
                          {viewTransitionAsset.source === TRUE_ISO_TILE_SOURCE ? 'true-iso locked' : 'review required'}
                        </InspectorRow>
                      </>
                    ) : null}
                    {viewTransitionAsset?.animation ? (
                      <InspectorRow label="Animation">{`${viewTransitionAsset.animation.label} · ${viewTransitionAsset.animation.status}`}</InspectorRow>
                    ) : null}
                    <InspectorRow label="Pair">{viewTransitionPair?.label ?? 'Transition'}</InspectorRow>
                    <InspectorRow label="Mask">{viewTransitionSlot.code}</InspectorRow>
                    {socketEdges.map((edge) => (
                      <InspectorRow key={edge} label={`${edge[0].toUpperCase()}${edge.slice(1)}`}>
                        {terrainLabels[viewTransitionSlot.sockets[edge]]}
                      </InspectorRow>
                    ))}
                  </dl>
                ) : (
                  <dl>
                    <EdgeLedger asset={selectedAsset} />
                    {selectedAsset.animation ? (
                      <InspectorRow label="Animation">{`${selectedAsset.animation.label} · ${selectedAsset.animation.status}`}</InspectorRow>
                    ) : null}
                    <InspectorRow label="Fill Weight">
                      {selectedAsset.probability === 0 ? 'not random-filled' : selectedAsset.probability.toFixed(2)}
                    </InspectorRow>
                  </dl>
                )}
                <p>{labMode === 'unit' ? unitBrushAsset.read : viewTransitionSlot ? viewTransitionAsset?.notes ?? 'This transition slot is required but has no production tile assigned yet.' : selectedAsset.notes}</p>
              </section>
            </aside>
          </>
        )}
      </section>
    </main>
  );
}
