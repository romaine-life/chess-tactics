// This file implements the Studio. It MUST follow the control architecture spec in
// docs/studio-control-architecture.md — read it before adding a mode, category, or surface.
// Invariants: ONE persistent surface (the board); Board/Tile/Unit/Doodad are *focuses*
// (control sets that share that board), NOT separate views; the frame never moves; a new
// board-placeable thing is a catalogCategories entry + a focus, never a bespoke view or a
// `category === '…'` branch.
import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent, type ReactElement, type ReactNode, type WheelEvent } from 'react';
import { TILE_EDGE_ANGLE_DEGREES, TILE_TEMPLATE } from '../art/tileTemplate';
import { tileFamilies } from '../art/tileset';
import { buildTileCoverageReport } from '../core/tileCoverage';
import { generateSocketBoard, type SocketBoardCell, type SocketBoardResult } from '../core/tileBoardGenerator';
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
import { BoardLabBoard, boardLabCellPosition } from '../render/BoardLabBoard';
import { DoodadSprite } from '../render/BoardDoodad';
import { TileGrid, type TileGridCell } from '../render/TileGrid';
import { CatalogGrid, CatalogControls, type CatalogType } from './studio/Catalog';
import { AssetLibraryStudio, AssetLab, ASSET_TYPE_FACETS, type AssetFilters } from './design/AssetLibraryStudio';
import { ArtworkLibraryStudio, ArtworkLab } from './design/ArtworkLibraryStudio';
import { GlossaryLibraryStudio, GlossaryLab } from './design/GlossaryLibraryStudio';
import { SurfaceLibraryStudio, SurfaceViewer } from './SurfaceLibraryStudio';
import { ScrollbarLibraryStudio, ScrollbarViewer } from './ScrollbarLibraryStudio';
import { KitScroll } from './KitScroll';
import { PagesLibraryStudio, PagesViewer } from './PagesLibraryStudio';
import { PAGE_ENTRIES } from './pagesCatalog';
import { SliderLibraryStudio, SliderViewer } from './SliderLibraryStudio';
import { PortraitLab } from './PortraitEditor';
import { doodadAsset, DOODAD_ASSETS, type DoodadAsset } from './doodadCatalog';
import kitManifest from './design/kitManifest.json';
import artworkManifest from './design/artworkManifest.json';
import { navigateApp } from './navigation';
import { ViewPane } from './shared/ViewPane';
import { BrandLockup } from './shared/BrandLockup';
import { DEFAULT_BACKGROUND_SET } from '../art/backgroundSets';
import {
  MISSING_DIRECTION_SPRITE,
  activeUnitFamilies,
  familyLabels,
  hasDirectionSprite,
  unitAssets,
  type Direction,
  type Faction,
  type PieceId,
  type UnitAsset,
} from './unitCatalog';



const TRUE_ISO_TILE_SOURCE = 'canonical-true-iso';


type StudioFamilyId = TileFamilyId;
type StudioAssetKind = TileAssetKind;
// The studio has three persistent destinations (tier-1), all always reachable and
// decoupled from the catalog category: 'catalog' browses a grid; 'lab' is the
// board workbench (direct manipulation — tiles/units get placed there); 'viewer'
// is the read-only stage for one finished, non-manipulable thing (an asset or an
// artwork). Each remembers its own last state, so switching between them is free.
// See docs/studio-control-architecture.md.
type StudioMode = 'catalog' | 'lab' | 'viewer';

// The catalog's kinds-of-thing. Category governs only what the Catalog shows; it
// does not decide which destination tab you can reach.
type StudioCategory = 'tiles' | 'units' | 'doodads' | 'assets' | 'artwork' | 'glossary' | 'surfaces' | 'scrollbars' | 'sliders' | 'pages';

// What the Viewer is currently holding. Assets and artwork feed read-only stages;
// 'portrait' is the embedded portrait crop editor; 'glossary' reads one term in
// full (definition + any long-form process doc). This records the active kind.
type ViewerKind = 'asset' | 'artwork' | 'portrait' | 'glossary' | 'surface' | 'scrollbar' | 'slider' | 'page';

// Default selection for the Artwork viewer, so the Viewer shows a real piece
// instead of an empty stage before anything is opened.
const FIRST_ARTWORK_ID: string = artworkManifest.groups[0]?.items[0]?.id ?? '';
type TileFilter = 'base' | 'board';
type LabMode = 'board' | 'tile' | 'unit' | 'doodad';
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
  category?: StudioCategory;
  selectedAssetName?: string;
  selectedArtworkName?: string;
  selectedGlossaryName?: string;
  selectedPageName?: string;
  viewerKind?: ViewerKind;
  labMode: LabMode;
  tileFilter: TileFilter;
  selectedPairId: TerrainPairId;
  selectedAssetId?: string;
  selectedSlotMask?: number;
  boardMode: 'generated' | 'concept';
  boardScope: 'family' | 'mixed';
  boardSize: 'small' | 'wide';
  boardSeed: number;
  brushKind: 'tile' | 'unit' | 'doodad';
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

const isStudioMode = (value: string | null): value is StudioMode => value === 'catalog' || value === 'lab' || value === 'viewer';
const isStudioCategory = (value: string | null): value is StudioCategory => value === 'tiles' || value === 'units' || value === 'doodads' || value === 'assets' || value === 'artwork' || value === 'glossary' || value === 'surfaces' || value === 'scrollbars' || value === 'sliders' || value === 'pages';
const isLabMode = (value: string | null): value is LabMode => value === 'board' || value === 'tile' || value === 'unit' || value === 'doodad';

const isTileFilter = (value: string | null): value is TileFilter => value === 'base' || value === 'transitions' || value === 'references' || value === 'board';

const isTerrainPairId = (value: string | null): value is TerrainPairId => value === 'grass-stone' || value === 'grass-water' || value === 'stone-water';
const isUnitAssetId = (value: string | null): value is string => unitAssets.some((unit) => unit.id === value);

const readTilesetStudioRoute = (): TilesetStudioRouteState => {
  const params = new URLSearchParams(window.location.search);
  const family = params.get('family');
  const mode = params.get('mode');
  const cat = params.get('cat');
  const kit = params.get('kit');
  const art = params.get('art');
  const gloss = params.get('gloss');
  const page = params.get('page');
  const vk = params.get('vk');
  const lab = params.get('lab');
  const view = params.get('view');
  const collection = params.get('collection');
  const pair = params.get('pair');
  const asset = params.get('asset');
  const unit = params.get('unit');
  const slot = Number(params.get('slot'));
  const seed = Number(params.get('seed'));
  // Destination is decoupled from category — any mode is valid with any category,
  // so the URL is taken at face value (no normalization). 'view' is a legacy alias.
  const studioMode = isStudioMode(mode) ? mode : mode === 'view' ? 'lab' : studioDefaults.studioMode;
  const routeCategory = isStudioCategory(cat) ? cat : undefined;
  const routeTileFilter = view === 'board' ? 'board' : isTileFilter(collection) ? collection : studioDefaults.tileFilter;
  const explicitLabMode = isLabMode(lab) ? lab : undefined;
  const brushParam = params.get('brush');
  const brushKind =
    brushParam === 'unit' || explicitLabMode === 'unit' ? 'unit'
    : brushParam === 'doodad' || explicitLabMode === 'doodad' ? 'doodad'
    : studioDefaults.brushKind;
  const routeLabMode = explicitLabMode ?? (routeTileFilter === 'board' ? 'board' : brushKind === 'unit' ? 'unit' : brushKind === 'doodad' ? 'doodad' : 'tile');
  const effectiveTileFilter =
    studioMode === 'catalog'
      ? routeTileFilter === 'board' ? studioDefaults.tileFilter : routeTileFilter
      : routeTileFilter;
  return {
    familyId: isStudioFamilyId(family) ? family : studioDefaults.familyId,
    studioMode,
    category: routeCategory,
    selectedAssetName: kit || undefined,
    selectedArtworkName: art || undefined,
    selectedGlossaryName: gloss || undefined,
    selectedPageName: page || undefined,
    viewerKind: vk === 'asset' || vk === 'artwork' || vk === 'portrait' || vk === 'glossary' || vk === 'surface' || vk === 'scrollbar' || vk === 'slider' || vk === 'page' ? vk : undefined,
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
    // Keep the catalog URL clean: persist only the active category's own selection.
    if (route.category === 'assets' && route.selectedAssetName) catalogParams.set('kit', route.selectedAssetName);
    if (route.category === 'artwork' && route.selectedArtworkName) catalogParams.set('art', route.selectedArtworkName);
    if (route.category === 'glossary' && route.selectedGlossaryName) catalogParams.set('gloss', route.selectedGlossaryName);
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
  if (route.studioMode === 'viewer') {
    // The Viewer persists which kind it last held (asset/artwork/portrait) and,
    // for the read-only kinds, the item name. Portrait state lives in localStorage.
    params.set('vk', route.viewerKind ?? 'artwork');
    if (route.viewerKind === 'asset' && route.selectedAssetName) params.set('kit', route.selectedAssetName);
    else if (route.viewerKind === 'artwork' && route.selectedArtworkName) params.set('art', route.selectedArtworkName);
    else if (route.viewerKind === 'glossary' && route.selectedGlossaryName) params.set('gloss', route.selectedGlossaryName);
    else if (route.viewerKind === 'page' && route.selectedPageName) params.set('page', route.selectedPageName);
  }
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
  else if (route.brushKind === 'doodad') params.set('brush', 'doodad');
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
  doodads: placedDoodads,
  resolveAsset,
  resolveUnit,
  resolveDoodad,
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
  hidden,
}: {
  cols: number;
  rows: number;
  cells: Record<string, string>;
  units: Record<string, BoardUnitPlacement>;
  doodads: Record<string, { doodadId: string }>;
  resolveAsset: (id: string) => StudioAsset | undefined;
  resolveUnit: (id: string) => UnitAsset | undefined;
  resolveDoodad: (id: string) => DoodadAsset | undefined;
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
  /** Per-layer visibility — a true value hides that layer's elements on the board. */
  hidden?: { tile: boolean; unit: boolean; doodad: boolean };
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
      const isSelected = selectedCell?.x === x && selectedCell?.y === y;
      cells.push({
        key,
        x,
        y,
        className: `tileset-placement-cell ${asset ? '' : 'is-empty'} ${isSelected ? 'is-selected' : ''}`.trim(),
        children: (
          <>
            {asset && !hidden?.tile ? <img src={assetFrameSrc(asset, animationFrame)} alt="" draggable={false} /> : null}
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

  // Units + doodads render at GRID level via the SHARED seat (.board-unit-seat) and the
  // shared <DoodadSprite> — exactly like the game board (SkirmishBoard) — instead of inside
  // cells. One seating, both boards; it can't drift. Doodad back/front bracket the unit by z.
  const overlaySprites: ReactNode[] = [];
  for (const key of new Set([...Object.keys(placedUnits), ...Object.keys(placedDoodads)])) {
    const [cx, cy] = key.split(',').map(Number);
    const { left, top, zIndex } = boardLabCellPosition({ x: cx, y: cy });
    const doodadEntry = placedDoodads[key] ? resolveDoodad(placedDoodads[key].doodadId) : undefined;
    if (doodadEntry && !hidden?.doodad) {
      overlaySprites.push(<DoodadSprite key={`dd-${key}`} doodad={{ x: cx, y: cy, type: doodadEntry.id }} />);
      // The doodad stands UP above its foot cell, but the shared sprite is pointer-events:none,
      // so clicking the visible prop body falls through to the cell behind it — erase/select
      // would miss the doodad. This Studio-only hit target sits over the prop and routes the
      // tool to the doodad's OWN cell. It's transparent in brush mode so painting still flows
      // to the tiles underneath; it only catches clicks while erasing or selecting.
      overlaySprites.push(
        <span
          key={`dd-hit-${key}`}
          className="tileset-doodad-hit"
          style={{ position: 'absolute', left, top, zIndex: zIndex + 20002, width: 54, height: 88, transform: 'translate(-50%, -75%)', pointerEvents: tool === 'brush' ? 'none' : 'auto' }}
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
    const unitPlacement = placedUnits[key];
    const unitAsset = unitPlacement ? resolveUnit(unitPlacement.unitId) : undefined;
    if (unitAsset && unitPlacement && !hidden?.unit) {
      const sprite = hasDirectionSprite(unitAsset, unitPlacement.direction)
        ? unitAsset.sprite(unitPlacement.faction, unitPlacement.direction)
        : MISSING_DIRECTION_SPRITE;
      overlaySprites.push(
        <div key={`u-${key}`} className={`board-unit-seat is-${unitAsset.family}`} style={{ left, top, zIndex: zIndex + 20000 }}>
          <img src={sprite} alt="" draggable={false} />
        </div>,
      );
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
      {overlaySprites}
    </TileGrid>
  );
}

export function TilesetStudio({ initialCategory = 'tiles' }: { initialCategory?: StudioCategory } = {}): ReactElement {
  const initialRoute = useMemo(() => readTilesetStudioRoute(), []);
  const initialHasViewTarget = Boolean(initialRoute.selectedAssetId || initialRoute.selectedSlotMask || initialRoute.tileFilter === 'board');
  const [familyId, setFamilyId] = useState<StudioFamilyId>(initialRoute.familyId);
  const [studioMode, setStudioMode] = useState<StudioMode>(initialRoute.studioMode);
  const [category, setCategory] = useState<StudioCategory>(initialRoute.category ?? initialCategory);
  const [labMode, setLabMode] = useState<LabMode>(initialRoute.labMode);
  const [doodadBrushId, setDoodadBrushId] = useState<string>('grass-tuft');
  const [viewHasTarget, setViewHasTarget] = useState(initialHasViewTarget);
  const [tileFilter, setTileFilter] = useState<TileFilter>(initialRoute.tileFilter);
  const [selectedFamilyIds, setSelectedFamilyIds] = useState<StudioFamilyId[]>(studioFamilies.map((fam) => fam.id));
  const [selectedCollectionFilters, setSelectedCollectionFilters] = useState<CollectionFilter[]>(
    initialRoute.tileFilter === 'board' ? ['base'] : [initialRoute.tileFilter],
  );
  const [catalogQuery, setCatalogQuery] = useState('');
  const [assetFilters, setAssetFilters] = useState<AssetFilters>({ type: 'all', prov: 'all', gate: 'all' });
  const [assetSearch, setAssetSearch] = useState('');
  const [artworkSearch, setArtworkSearch] = useState('');
  const [surfaceSearch, setSurfaceSearch] = useState('');
  const [scrollbarSearch, setScrollbarSearch] = useState('');
  const [selectedScrollbarName, setSelectedScrollbarName] = useState<string | undefined>(undefined);
  const [selectedSurfaceName, setSelectedSurfaceName] = useState<string | undefined>(undefined);
  const [sliderSearch, setSliderSearch] = useState('');
  const [selectedSliderName, setSelectedSliderName] = useState<string | undefined>(undefined);
  const [pageSearch, setPageSearch] = useState('');
  const [selectedPageName, setSelectedPageName] = useState<string | undefined>(initialRoute.selectedPageName);
  const [glossarySearch, setGlossarySearch] = useState('');
  // Assets and artwork each own their own selection — never one shared field
  // (that's how an Assets id like 'gear' used to leak into the Artwork stage).
  const [selectedAssetName, setSelectedAssetName] = useState(initialRoute.selectedAssetName ?? 'gear');
  const [selectedArtworkName, setSelectedArtworkName] = useState(initialRoute.selectedArtworkName ?? FIRST_ARTWORK_ID);
  const [selectedGlossaryName, setSelectedGlossaryName] = useState(initialRoute.selectedGlossaryName ?? '9-slice');
  // Which item the Viewer is showing (independent of the catalog category).
  const [viewerKind, setViewerKind] = useState<ViewerKind>(initialRoute.viewerKind ?? 'artwork');
  const [selectedUnitFamilies, setSelectedUnitFamilies] = useState<PieceId[]>(activeUnitFamilies);
  const [selectedDoodadTerrains, setSelectedDoodadTerrains] = useState<StudioFamilyId[]>(studioFamilies.map((fam) => fam.id));
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
  const [brushKind, setBrushKind] = useState<'tile' | 'unit' | 'doodad'>(initialRoute.brushKind);
  const [brushId, setBrushId] = useState<string>(initialRoute.selectedAssetId ?? '');
  const [unitBrushId, setUnitBrushId] = useState<string>(initialRoute.selectedUnitId ?? unitAssets[0].id);
  const [unitBrushDirection, setUnitBrushDirection] = useState<Direction>('south');
  const [unitBrushFaction] = useState<Faction>('navy-blue');
  const [boardCells, setBoardCells] = useState<Record<string, string>>({});
  const [boardUnits, setBoardUnits] = useState<Record<string, BoardUnitPlacement>>({});
  const [boardDoodads, setBoardDoodads] = useState<Record<string, { doodadId: string }>>({});
  // Per-layer visibility — each focus's eye toggle flips its own layer; the board hides it.
  const [hiddenLayers, setHiddenLayers] = useState<{ tile: boolean; unit: boolean; doodad: boolean }>({ tile: false, unit: false, doodad: false });
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
  const resolveDoodadAsset = (id: string): DoodadAsset | undefined => doodadAsset(id);
  const brushAsset = resolveStudioAsset(brushId) ?? selectedAsset;
  const unitBrushAsset = resolveUnitAsset(unitBrushId) ?? unitAssets[0];
  const doodadBrushAsset = resolveDoodadAsset(doodadBrushId) ?? DOODAD_ASSETS[0];
  // A base tile's terrain IS its family (grass/stone/water) — base tiles don't carry a
  // separate terrains tag, so resolve through the family that owns the tile id.
  const terrainOfTileId = (id: string | undefined): StudioFamilyId | undefined =>
    id ? studioFamilies.find((fam) => fam.assets.some((asset) => asset.id === id))?.id : undefined;
  const doodadFitsTile = (doodad: DoodadAsset, tileId: string | undefined): boolean => {
    const terrain = terrainOfTileId(tileId);
    return terrain !== undefined && doodad.terrains.includes(terrain);
  };
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
    if (brushKind === 'doodad') {
      // HARD gate: a doodad only lands on a tile of its home terrain. Painting onto bare
      // ground or the wrong terrain is a no-op (the cursor shows it's blocked — see the board).
      if (!doodadFitsTile(doodadBrushAsset, boardCells[`${x},${y}`])) return;
      setBoardDoodads((prev) => ({ ...prev, [`${x},${y}`]: { doodadId: doodadBrushAsset.id } }));
      setLabMode('doodad');
      return;
    }
    setBoardCells((prev) => ({ ...prev, [`${x},${y}`]: brushAsset.id }));
    setLabMode('tile');
  };
  const eraseFrom = <T,>(setter: (updater: (prev: Record<string, T>) => Record<string, T>) => void, x: number, y: number): void =>
    setter((prev) => {
      const key = `${x},${y}`;
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  const eraseCell = (x: number, y: number): void => {
    if (brushKind === 'unit') return eraseFrom(setBoardUnits, x, y);
    if (brushKind === 'doodad') return eraseFrom(setBoardDoodads, x, y);
    return eraseFrom(setBoardCells, x, y);
  };
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
    const seededDoodads: Record<string, { doodadId: string }> = {};
    if ((labMode === 'unit' || labMode === 'doodad') && placed.length) {
      const xs = placed.map((cell) => cell.x + offX);
      const ys = placed.map((cell) => cell.y + offY);
      const x = Math.round((Math.min(...xs) + Math.max(...xs)) / 2);
      const y = Math.round((Math.min(...ys) + Math.max(...ys)) / 2);
      seededUnits[`${x},${y}`] = {
        unitId: unitBrushAsset.id,
        direction: unitBrushDirection,
        faction: unitBrushFaction,
      };
      // Doodad focus: stand the unit IN a doodad so the back/front bracketing is visible.
      if (labMode === 'doodad') seededDoodads[`${x},${y}`] = { doodadId: doodadBrushId };
    }
    setBoardCells(seeded);
    if (viewKind !== 'board' || labMode === 'unit' || labMode === 'doodad') setBoardUnits(seededUnits);
    setBoardDoodads(seededDoodads);
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
      if (route.selectedArtworkName) setSelectedArtworkName(route.selectedArtworkName);
      if (route.selectedGlossaryName) setSelectedGlossaryName(route.selectedGlossaryName);
      if (route.viewerKind) setViewerKind(route.viewerKind);
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
      selectedArtworkName,
      selectedGlossaryName,
      selectedPageName,
      viewerKind,
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
  }, [boardMode, boardScope, boardSeed, boardSize, brushKind, category, familyId, labMode, selectedAsset.id, selectedAssetName, selectedArtworkName, selectedGlossaryName, selectedPageName, viewerKind, selectedPairId, selectedSlotMask, studioMode, tileFilter, unitBrushId, viewHasTarget]);

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
  // The layer the current focus governs — its eye toggle hides that layer on the board.
  const visionLayer: 'tile' | 'unit' | 'doodad' = labMode === 'unit' ? 'unit' : labMode === 'doodad' ? 'doodad' : 'tile';
  const visionLabel = visionLayer === 'unit' ? 'units' : visionLayer === 'doodad' ? 'doodads' : 'tiles';
  const normalizedUnitQuery = catalogQuery.trim().toLowerCase();
  const visibleUnits = normalizedUnitQuery
    ? unitAssets.filter((unit) => [unit.label, unit.badge, unit.family, unit.read, unit.status].join(' ').toLowerCase().includes(normalizedUnitQuery))
    : unitAssets;
  // Slim topbar: a breadcrumb + a quiet count instead of a big titleblock. Keeps
  // the header height constant (the Lab already shares this header — no second
  // row inside the board surface, which is what made the controls rail jump).
  const viewerName = viewerKind === 'artwork' ? selectedArtworkName : viewerKind === 'asset' ? selectedAssetName : viewerKind === 'glossary' ? selectedGlossaryName : viewerKind === 'surface' ? (selectedSurfaceName ?? '') : viewerKind === 'scrollbar' ? (selectedScrollbarName ?? '') : viewerKind === 'slider' ? (selectedSliderName ?? '') : viewerKind === 'page' ? (selectedPageName ?? '') : '';
  const viewerKindLabel = viewerKind === 'artwork' ? 'Artwork' : viewerKind === 'portrait' ? 'Portrait' : viewerKind === 'glossary' ? 'Glossary' : viewerKind === 'surface' ? 'Surface' : viewerKind === 'scrollbar' ? 'Scrollbar' : viewerKind === 'slider' ? 'Slider' : viewerKind === 'page' ? 'Page' : 'Asset';
  const crumbTrail =
    studioMode === 'catalog'
      ? ['Catalog', category === 'units' ? 'Units' : category === 'doodads' ? 'Doodads' : category === 'assets' ? 'Assets' : category === 'artwork' ? 'Artwork' : category === 'glossary' ? 'Glossary' : category === 'surfaces' ? 'Surfaces' : category === 'scrollbars' ? 'Scrollbars' : category === 'sliders' ? 'Sliders' : category === 'pages' ? 'Pages' : 'Tiles']
      : studioMode === 'viewer'
        ? (viewerKind === 'portrait' ? ['Viewer', 'Portrait'] : ['Viewer', viewerKindLabel, viewerName || '—'])
        : ['Lab', labMode === 'unit' ? 'Unit' : labMode === 'tile' ? 'Tile' : labMode === 'doodad' ? 'Doodad' : 'Board'];
  const visibleDoodads = normalizedCatalogQuery
    ? DOODAD_ASSETS.filter((d) => [d.label, d.status, ...d.terrains].join(' ').toLowerCase().includes(normalizedCatalogQuery))
    : DOODAD_ASSETS;
  const crumbMeta =
    studioMode === 'catalog'
      ? category === 'units'
        ? `${visibleUnits.length} unit${visibleUnits.length === 1 ? '' : 's'}`
        : category === 'doodads'
          ? `${visibleDoodads.length} doodad${visibleDoodads.length === 1 ? '' : 's'}`
        : category === 'assets'
          ? `${kitManifest.summary.total} icons`
          : category === 'artwork'
            ? `${artworkManifest.summary.total} artworks`
            : category === 'glossary'
              ? 'reference & process docs'
              : category === 'surfaces'
                ? 'background surfaces'
                : category === 'scrollbars'
                  ? 'scrollbar grips'
                  : category === 'sliders'
                    ? 'slide bars'
                    : category === 'pages'
                      ? `${PAGE_ENTRIES.length} pages`
                      : `${visibleCatalogCount} asset${visibleCatalogCount === 1 ? '' : 's'} · ${selectedCollectionLabel}`
      : studioMode === 'viewer'
        ? (viewerKind === 'artwork' ? 'full-art preview' : viewerKind === 'portrait' ? 'headshot crop editor' : viewerKind === 'glossary' ? 'definition + process doc' : viewerKind === 'surface' ? 'tiled surface preview' : viewerKind === 'scrollbar' ? 'live scroll test' : viewerKind === 'slider' ? 'live drag test' : viewerKind === 'page' ? 'live page preview' : 'preview on backdrops')
        : viewSubtitle;
  const openCatalogMode = (): void => {
    if (tileFilter === 'board') setTileFilter('base');
    setStudioMode('catalog');
  };
  const openViewer = (kind: ViewerKind): void => {
    setViewerKind(kind);
    setStudioMode('viewer');
  };
  const selectUnitInCatalog = (unitId: string): void => {
    setUnitBrushId(unitId);
  };
  const armUnitBrush = (unitId: string): void => {
    // Arm the unit as the active brush (mirrors armBrush for tiles) — do NOT place it.
    // The user paints it by then clicking a board cell; arming must not draw.
    setUnitBrushId(unitId);
    setBrushKind('unit');
    setTool('brush');
    setLabMode('board');
    setStudioMode('lab');
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
  const openDoodadLab = (): void => {
    if (!hasLabTiles) return;
    setLabMode('doodad');
    setStudioMode('lab');
  };
  const selectDoodadInCatalog = (doodadId: string): void => {
    setDoodadBrushId(doodadId);
  };
  // Jump from an inspector property to its full explanation in the Glossary Viewer.
  const openGlossaryTerm = (term: string): void => {
    setSelectedGlossaryName(term);
    setCategory('glossary');
    openViewer('glossary');
  };
  const armDoodadBrush = (doodadId: string): void => {
    // Arm the doodad as the active brush (mirrors armUnitBrush) — do NOT place it. The user
    // paints it onto a matching-terrain tile; the paint itself enforces the hard gate.
    setDoodadBrushId(doodadId);
    setBrushKind('doodad');
    setTool('brush');
    setLabMode('board');
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
    onArm: (u) => armUnitBrush(u.id),
    selectedId: unitBrushId,
    note: 'Select a unit card to place it in the shared lab board.',
  };
  const doodadsCatalogType: CatalogType<DoodadAsset> = {
    id: 'doodads',
    label: 'Doodads',
    assets: DOODAD_ASSETS,
    card: (d) => ({ img: d.front, title: d.label, badge: d.terrains.join(', ') }),
    sections: (visible) => [{ id: 'doodads', label: 'Doodads', assets: [...visible] }],
    query: {
      value: catalogQuery,
      set: setCatalogQuery,
      placeholder: 'doodad, terrain, status...',
      match: (d, q) => [d.label, d.status, ...d.terrains].join(' ').toLowerCase().includes(q),
    },
    zoom: { value: zoom, set: setZoom, min: 0.75, max: 2, step: 0.05, cssVar: '--tile-zoom' },
    filters: [
      {
        id: 'terrain',
        label: 'Home Terrain',
        options: studioFamilies.map((fam) => {
          const n = DOODAD_ASSETS.filter((d) => d.terrains.includes(fam.id)).length;
          return { id: fam.id, label: fam.label, sub: `${n} ${n === 1 ? 'doodad' : 'doodads'}` };
        }),
        memberOf: (d) => d.terrains,
        selected: selectedDoodadTerrains,
        toggle: (id) => setSelectedDoodadTerrains((cur) => (cur.includes(id as StudioFamilyId) ? cur.filter((x) => x !== id) : [...cur, id as StudioFamilyId])),
        selectAll: () => setSelectedDoodadTerrains(studioFamilies.map((fam) => fam.id)),
        clear: () => setSelectedDoodadTerrains([]),
      },
    ],
    onSelect: (d) => selectDoodadInCatalog(d.id),
    onView: (d) => openDoodadLab(),
    onArm: (d) => armDoodadBrush(d.id),
    selectedId: doodadBrushId,
    note: 'Doodads place only on their home terrain. Pick one to arm the brush, then paint a matching tile.',
  };

  // The catalog is one registry, not a chain of `category === …` branches: every
  // category supplies its grid (`main`) and its rail body (`controls`), and the
  // selector tabs / main pane / controls are rendered by mapping or reading the
  // active entry. Adding a category is one entry here — it cannot ship missing a
  // shared control. (docs/studio-control-architecture.md)
  const catalogCategories: { id: StudioCategory; label: string; hint: string; main: ReactElement; controls: ReactElement }[] = [
    {
      id: 'tiles', label: 'Tiles', hint: 'Browse terrain tiles.',
      main: <CatalogGrid type={tilesCatalogType} />,
      controls: <CatalogControls type={tilesCatalogType} />,
    },
    {
      id: 'units', label: 'Units', hint: 'Browse chess-piece units.',
      main: <CatalogGrid type={unitsCatalogType} />,
      controls: <CatalogControls type={unitsCatalogType} />,
    },
    {
      id: 'doodads', label: 'Doodads', hint: 'Browse terrain doodads (placed on matching tiles).',
      main: <CatalogGrid type={doodadsCatalogType} />,
      controls: <CatalogControls type={doodadsCatalogType} />,
    },
    {
      id: 'assets', label: 'Assets', hint: 'Browse the UI-kit asset library.',
      main: <AssetLibraryStudio filters={assetFilters} search={assetSearch} zoom={zoom} selected={selectedAssetName} onSelect={setSelectedAssetName} />,
      controls: (
        <>
          <label className="tileset-catalog-search">
            <span>Search</span>
            <input type="search" value={assetSearch} onChange={(event) => setAssetSearch(event.target.value)} placeholder="asset name…" />
          </label>
          <label className="tileset-catalog-zoom">
            <span>Zoom</span>
            <input type="range" min="0.75" max="2" step="0.05" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} />
          </label>
          <div className="tileset-filter-field">
            <span>Screen</span>
            <div className="tileset-tier-seg" aria-label="Filter by screen">
              {ASSET_TYPE_FACETS.map((opt) => (
                <button key={opt.value} type="button" className={assetFilters.type === opt.value ? 'is-active' : ''} onClick={() => setAssetFilters((s) => ({ ...s, type: opt.value }))}>{opt.label}</button>
              ))}
            </div>
          </div>
          <div className="tileset-filter-field">
            <span>Provenance</span>
            <div className="tileset-tier-seg" aria-label="Filter by provenance">
              {(['all', 'forged', 'original'] as const).map((option) => (
                <button key={option} type="button" className={assetFilters.prov === option ? 'is-active' : ''} onClick={() => setAssetFilters((s) => ({ ...s, prov: option }))}>
                  {option === 'all' ? 'All' : option === 'forged' ? 'Forged' : 'Original'}
                </button>
              ))}
            </div>
          </div>
          <div className="tileset-filter-field">
            <span>Gate</span>
            <div className="tileset-tier-seg" aria-label="Filter by gate result">
              {(['all', 'pass', 'fail'] as const).map((option) => (
                <button key={option} type="button" className={assetFilters.gate === option ? 'is-active' : ''} onClick={() => setAssetFilters((s) => ({ ...s, gate: option }))}>
                  {option === 'all' ? 'All' : option === 'pass' ? 'Pass' : 'Fail'}
                </button>
              ))}
            </div>
          </div>
          <button type="button" className="tileset-view-action" onClick={() => openViewer('asset')}>View Selected</button>
        </>
      ),
    },
    {
      id: 'artwork', label: 'Artwork', hint: 'Browse the artwork library — scenes, portraits, key art, concepts.',
      main: (
        <ArtworkLibraryStudio
          search={artworkSearch}
          zoom={zoom}
          selected={selectedArtworkName}
          onSelect={setSelectedArtworkName}
          onView={(id) => { setSelectedArtworkName(id); openViewer('artwork'); }}
          onEditPortrait={() => openViewer('portrait')}
        />
      ),
      controls: (
        <>
          <label className="tileset-catalog-search">
            <span>Search</span>
            <input type="search" value={artworkSearch} onChange={(event) => setArtworkSearch(event.target.value)} placeholder="artwork name…" />
          </label>
          <label className="tileset-catalog-zoom">
            <span>Zoom</span>
            <input type="range" min="0.75" max="2" step="0.05" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} />
          </label>
          <button type="button" className="tileset-view-action" onClick={() => openViewer('artwork')}>View Selected</button>
        </>
      ),
    },
    {
      id: 'glossary', label: 'Glossary', hint: 'Vocabulary + the agreed process docs (how chrome renders, etc.).',
      main: (
        <GlossaryLibraryStudio
          search={glossarySearch}
          selected={selectedGlossaryName}
          onSelect={setSelectedGlossaryName}
          onView={(term) => { setSelectedGlossaryName(term); openViewer('glossary'); }}
        />
      ),
      controls: (
        <>
          <label className="tileset-catalog-search">
            <span>Search</span>
            <input type="search" value={glossarySearch} onChange={(event) => setGlossarySearch(event.target.value)} placeholder="term…" />
          </label>
          <button type="button" className="tileset-view-action" onClick={() => openViewer('glossary')}>View Selected</button>
        </>
      ),
    },
    {
      id: 'surfaces', label: 'Surfaces', hint: 'Browse accepted background surfaces — seamless, tileable pixel-art tiles.',
      main: <SurfaceLibraryStudio search={surfaceSearch} zoom={zoom} selected={selectedSurfaceName} onSelect={setSelectedSurfaceName} />,
      controls: (
        <>
          <label className="tileset-catalog-search">
            <span>Search</span>
            <input type="search" value={surfaceSearch} onChange={(event) => setSurfaceSearch(event.target.value)} placeholder="surface, material…" />
          </label>
          <label className="tileset-catalog-zoom">
            <span>Zoom</span>
            <input type="range" min="0.75" max="2" step="0.05" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} />
          </label>
          <button type="button" className="tileset-view-action" onClick={() => openViewer('surface')}>View Selected</button>
        </>
      ),
    },
    {
      id: 'scrollbars', label: 'Scrollbars', hint: 'Scrollbar-grip candidates — carved wooden elements. PixelLab is the current preferred default.',
      main: <ScrollbarLibraryStudio search={scrollbarSearch} zoom={zoom} selected={selectedScrollbarName} onSelect={setSelectedScrollbarName} />,
      controls: (
        <>
          <label className="tileset-catalog-search">
            <span>Search</span>
            <input type="search" value={scrollbarSearch} onChange={(event) => setScrollbarSearch(event.target.value)} placeholder="scrollbar, approach…" />
          </label>
          <label className="tileset-catalog-zoom">
            <span>Zoom</span>
            <input type="range" min="0.75" max="2" step="0.05" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} />
          </label>
          <button type="button" className="tileset-view-action" onClick={() => openViewer('scrollbar')}>View Selected</button>
        </>
      ),
    },
    {
      id: 'sliders', label: 'Sliders', hint: 'Slide-bar candidates — CSS-skinned native sliders. Bronze/stone (ADR-0025) is the current default; forged stone/wood material is pending.',
      main: <SliderLibraryStudio search={sliderSearch} zoom={zoom} selected={selectedSliderName} onSelect={setSelectedSliderName} />,
      controls: (
        <>
          <label className="tileset-catalog-search">
            <span>Search</span>
            <input type="search" value={sliderSearch} onChange={(event) => setSliderSearch(event.target.value)} placeholder="slider, material…" />
          </label>
          <label className="tileset-catalog-zoom">
            <span>Zoom</span>
            <input type="range" min="0.75" max="2" step="0.05" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} />
          </label>
          <button type="button" className="tileset-view-action" onClick={() => openViewer('slider')}>View Selected</button>
        </>
      ),
    },
    {
      id: 'pages', label: 'Pages', hint: 'Browse the app screens — inspect each live page; tune the Main Menu in place.',
      main: <PagesLibraryStudio search={pageSearch} selected={selectedPageName} onSelect={setSelectedPageName} />,
      controls: (
        <>
          <label className="tileset-catalog-search">
            <span>Search</span>
            <input type="search" value={pageSearch} onChange={(event) => setPageSearch(event.target.value)} placeholder="page name…" />
          </label>
          <button type="button" className="tileset-view-action" onClick={() => openViewer('page')}>View Selected</button>
        </>
      ),
    },
  ];
  const activeCatalog = catalogCategories.find((entry) => entry.id === category) ?? catalogCategories[0];

  // The Viewer's kind selector — which item type the Viewer shows. A dropdown, not a button
  // strip: eight kinds can't fit the 260px controls rail without clipping each label to its
  // initials, and a <select> mirrors the Catalog's category control. Injected as each Viewer
  // surface's header.
  const viewerKindSelect = (
    <label className="tileset-category-select" title="Which kind of item the Viewer shows.">
      <span>Viewer</span>
      <select value={viewerKind} onChange={(event) => setViewerKind(event.target.value as ViewerKind)} aria-label="Viewer kind">
        <option value="asset">Asset</option>
        <option value="artwork">Artwork</option>
        <option value="portrait">Portrait</option>
        <option value="glossary">Glossary</option>
        <option value="surface">Surface</option>
        <option value="scrollbar">Scrollbar</option>
        <option value="slider">Slider</option>
        <option value="page">Page</option>
      </select>
    </label>
  );

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
          <span className="tileset-mode-tabs" aria-label="Workspace">
            <button type="button" className={studioMode === 'catalog' ? 'is-active' : ''} onClick={openCatalogMode} title="Browse the catalogs.">
              Catalog
            </button>
            <button type="button" className={studioMode === 'lab' ? 'is-active' : ''} onClick={openBoardLab} title="The board workbench — place and edit tiles and units.">
              Lab
            </button>
            <button type="button" className={studioMode === 'viewer' ? 'is-active' : ''} onClick={() => setStudioMode('viewer')} title="View one finished asset or artwork.">
              Viewer
            </button>
          </span>
          <a href="/settings">Settings</a>
        </nav>
      </header>

      <section className={`tileset-studio-shell is-${studioMode} ${category === 'units' ? 'is-units' : ''} ${category === 'artwork' ? 'is-artwork' : ''}`} aria-label="Tileset browser">
        {studioMode === 'catalog' ? (
        <>
        {activeCatalog.main}
        <aside className="tileset-view-controls tileset-catalog-controls" aria-label="Catalog controls">
          <section className="tileset-inspector-section">
            <h2>Controls</h2>
            <div className="tileset-control-stack">
              <label className="tileset-category-select" title={activeCatalog.hint}>
                <span>Category</span>
                <select value={category} onChange={(event) => setCategory(event.target.value as StudioCategory)} aria-label="Catalog category">
                  {catalogCategories.map((entry) => (
                    <option key={entry.id} value={entry.id}>{entry.label}</option>
                  ))}
                </select>
              </label>
              {activeCatalog.controls}
            </div>
          </section>
        </aside>
        </>
        ) : studioMode === 'viewer' ? (
          viewerKind === 'portrait'
            ? <PortraitLab header={viewerKindSelect} />
            : viewerKind === 'artwork'
              ? <ArtworkLab name={selectedArtworkName} header={viewerKindSelect} />
              : viewerKind === 'glossary'
                ? <GlossaryLab name={selectedGlossaryName} header={viewerKindSelect} />
                : viewerKind === 'surface'
                  ? <SurfaceViewer name={selectedSurfaceName} header={viewerKindSelect} />
                  : viewerKind === 'scrollbar'
                    ? <ScrollbarViewer name={selectedScrollbarName} header={viewerKindSelect} />
                    : viewerKind === 'slider'
                      ? <SliderViewer name={selectedSliderName} header={viewerKindSelect} />
                      : viewerKind === 'page'
                        ? <PagesViewer name={selectedPageName} header={viewerKindSelect} />
                        : <AssetLab name={selectedAssetName} header={viewerKindSelect} />
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
                  doodads={boardDoodads}
                  resolveAsset={resolveStudioAsset}
                  resolveUnit={resolveUnitAsset}
                  resolveDoodad={resolveDoodadAsset}
                  tool={tool}
                  selectedCell={selectedCell}
                  showFootprint={showFootprint}
                  boardZoom={viewZoom}
                  boardPan={viewPan}
                  animationFrame={animationFrame}
                  onPaint={paintCell}
                  onErase={eraseCell}
                  onSelect={selectBoardCell}
                  hidden={hiddenLayers}
                />
              </div>
            </ViewPane>
            </section>

            <aside className="tileset-view-controls tileset-catalog-controls" aria-label="Lab controls">
              <section className="tileset-inspector-section">
                <h2>Controls</h2>
                <div className="tileset-control-stack">
              <div className="tileset-tier-seg" aria-label="Component view">
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
                <button
                  type="button"
                  className={labMode === 'doodad' ? 'is-active' : ''}
                  onClick={openDoodadLab}
                  disabled={!hasLabTiles}
                  title={hasLabTiles ? 'Inspect a doodad on the loaded board.' : 'Load a board first.'}
                >
                  Doodad
                </button>
              </div>
                      <button
                        type="button"
                        className={`tileset-vision-toggle ${hiddenLayers[visionLayer] ? 'is-hidden' : ''}`.trim()}
                        onClick={() => setHiddenLayers((h) => ({ ...h, [visionLayer]: !h[visionLayer] }))}
                        aria-pressed={hiddenLayers[visionLayer]}
                        title={`${hiddenLayers[visionLayer] ? 'Show' : 'Hide'} all ${visionLabel} on the board`}
                      >
                        {hiddenLayers[visionLayer] ? (
                          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M2 8 C4 4.5 12 4.5 14 8 C12 11.5 4 11.5 2 8 Z" fill="none" stroke="currentColor" strokeWidth="1.3" /><circle cx="8" cy="8" r="2.1" fill="currentColor" /><line x1="3" y1="13" x2="13" y2="3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
                        ) : (
                          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M2 8 C4 4.5 12 4.5 14 8 C12 11.5 4 11.5 2 8 Z" fill="none" stroke="currentColor" strokeWidth="1.3" /><circle cx="8" cy="8" r="2.1" fill="currentColor" /></svg>
                        )}
                        {hiddenLayers[visionLayer] ? `${visionLabel} hidden` : `Hide ${visionLabel}`}
                      </button>
                      <div className="tileset-tier-seg tileset-tools" aria-label="Board tool">
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
                      <div className="tileset-tier-seg" aria-label="Placeable brush type">
                        <button type="button" className={brushKind === 'tile' ? 'is-active' : ''} onClick={() => setBrushKind('tile')} title="Paint terrain tiles.">
                          Tile
                        </button>
                        <button type="button" className={brushKind === 'unit' ? 'is-active' : ''} onClick={() => setBrushKind('unit')} title="Place chess units on top of tiles.">
                          Unit
                        </button>
                        <button type="button" className={brushKind === 'doodad' ? 'is-active' : ''} onClick={() => setBrushKind('doodad')} title="Place terrain doodads — only land on a tile of their home terrain.">
                          Doodad
                        </button>
                      </div>
                      <button
                        type="button"
                        className="tileset-brush-display"
                        onClick={() => {
                          setCategory(brushKind === 'unit' ? 'units' : brushKind === 'doodad' ? 'doodads' : 'tiles');
                          setStudioMode('catalog');
                        }}
                        title={brushKind === 'unit' ? 'Pick a different unit from the unit catalog' : brushKind === 'doodad' ? 'Pick a different doodad from the doodad catalog' : 'Pick a different tile from the tile catalog'}
                        aria-label={`Active brush: ${brushKind === 'unit' ? unitBrushAsset.label : brushKind === 'doodad' ? doodadBrushAsset.label : brushAsset.label}. Pick a different ${brushKind}.`}
                      >
                        <img src={brushKind === 'unit' ? unitBrushAsset.preview : brushKind === 'doodad' ? doodadBrushAsset.front : brushAsset.src} alt="" draggable={false} />
                        <span className="tileset-brush-label">{brushKind === 'unit' ? unitBrushAsset.label : brushKind === 'doodad' ? doodadBrushAsset.label : brushAsset.label}</span>
                        <span className="tileset-brush-change">Pick in catalog ›</span>
                      </button>
                      {brushKind === 'unit' ? (
                        <div className="tileset-tier-seg tileset-unit-facing" aria-label="Unit facing">
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
                          <div className="tileset-tier-seg" aria-label="Terrain scope">
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
                {labMode === 'doodad' ? (
                  <dl>
                    <InspectorRow label="Doodad">{doodadBrushAsset.label}</InspectorRow>
                    <InspectorRow label="Home Terrain">{doodadBrushAsset.terrains.join(', ') || '—'}</InspectorRow>
                    <InspectorRow label="Layering">
                      <button type="button" className="tileset-inline-link" onClick={() => openGlossaryTerm('split-layer doodad')}>
                        Split-layer doodad →
                      </button>
                    </InspectorRow>
                    <InspectorRow label="Status">{doodadBrushAsset.status}</InspectorRow>
                  </dl>
                ) : labMode === 'unit' ? (
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
                <p>{labMode === 'doodad' ? 'A split-layer prop the unit stands inside; placeable only on its home terrain. See the Layering link for how the split works.' : labMode === 'unit' ? unitBrushAsset.read : viewTransitionSlot ? viewTransitionAsset?.notes ?? 'This transition slot is required but has no production tile assigned yet.' : selectedAsset.notes}</p>
              </section>
            </aside>
          </>
        )}
      </section>
    </main>
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
const leAllTiles = studioFamilies.flatMap((family) => family.assets);
const leFamilyOfTile = (id: string): StudioFamily | undefined => studioFamilies.find((family) => family.assets.some((asset) => asset.id === id));
const leSeedBoard = (): Record<string, string> => {
  const cells: Record<string, string> = {};
  for (let y = 0; y < LE_ROWS; y += 1) for (let x = 0; x < LE_COLS; x += 1) cells[`${x},${y}`] = leDefaultTile.id;
  return cells;
};
const LE_FACING: Direction[] = ['south', 'east', 'north', 'west'];
const LE_SIDE_FACTION = { player: 'navy-blue', enemy: 'crimson' } as const;

export function LevelEditor(): ReactElement {
  const animationFrame = useAnimationClock(true, 8, 150);
  const [boardCells, setBoardCells] = useState<Record<string, string>>(leSeedBoard);
  const [tool, setTool] = useState<'select' | 'brush' | 'erase'>('brush');
  const [brushId, setBrushId] = useState<string>(leDefaultTile.id);
  const [selectedCell, setSelectedCell] = useState<{ x: number; y: number } | null>(null);
  const [showFootprint, setShowFootprint] = useState(true);
  const [viewZoom, setViewZoom] = useState(1);
  const [viewPan, setViewPan] = useState({ x: 0, y: 0 });
  const [brushKind, setBrushKind] = useState<'tile' | 'unit'>('tile');
  const [boardUnits, setBoardUnits] = useState<Record<string, BoardUnitPlacement>>({});
  const [unitBrushId, setUnitBrushId] = useState<string>(unitAssets[0].id);
  const [unitBrushDirection, setUnitBrushDirection] = useState<Direction>('south');
  const [unitSide, setUnitSide] = useState<'player' | 'enemy'>('player');

  // Go full-bleed like Skirmish: hide the static global .topbar (index.html) so the
  // editor shows only its OWN title bar, not stacked under the app's global header.
  useEffect(() => {
    const shell = document.querySelector('.shell');
    shell?.classList.add('is-immersive');
    return () => shell?.classList.remove('is-immersive');
  }, []);

  const resolveAsset = (id: string): StudioAsset | undefined => leAllTiles.find((asset) => asset.id === id);
  const brushAsset = resolveAsset(brushId) ?? leDefaultTile;
  const resolveUnitAsset = (id: string): UnitAsset | undefined => unitAssets.find((unit) => unit.id === id);
  const unitBrushAsset = resolveUnitAsset(unitBrushId) ?? unitAssets[0];
  const unitFaction: Faction = LE_SIDE_FACTION[unitSide];

  const eraseKey = <T,>(setter: (updater: (prev: Record<string, T>) => Record<string, T>) => void, key: string): void =>
    setter((prev) => { if (!(key in prev)) return prev; const next = { ...prev }; delete next[key]; return next; });
  const paintCell = (x: number, y: number): void => {
    const key = `${x},${y}`;
    if (brushKind === 'unit') {
      setBoardUnits((prev) => ({ ...prev, [key]: { unitId: unitBrushAsset.id, direction: unitBrushDirection, faction: unitFaction } }));
      return;
    }
    setBoardCells((prev) => ({ ...prev, [key]: brushAsset.id }));
  };
  const eraseCell = (x: number, y: number): void => {
    const key = `${x},${y}`;
    if (brushKind === 'unit') return eraseKey(setBoardUnits, key);
    eraseKey(setBoardCells, key);
  };
  const clearBoard = (): void => { setBoardCells({}); setBoardUnits({}); setSelectedCell(null); };
  const fillBoard = (mode: 'empty' | 'all'): void =>
    setBoardCells((prev) => {
      const next: Record<string, string> = mode === 'all' ? {} : { ...prev };
      for (let y = 0; y < LE_ROWS; y += 1) for (let x = 0; x < LE_COLS; x += 1) {
        const key = `${x},${y}`;
        if (mode === 'all' || !(key in next)) next[key] = brushAsset.id;
      }
      return next;
    });
  const selectCell = (x: number, y: number): void => setSelectedCell({ x, y });
  const adjustZoom = (delta: number): void => setViewZoom((z) => Math.min(4, Math.max(0.4, Number((z + delta).toFixed(2)))));

  const paintedCount = Object.keys(boardCells).length;
  const unitCount = Object.keys(boardUnits).length;
  const selectedTileId = selectedCell ? boardCells[`${selectedCell.x},${selectedCell.y}`] : undefined;
  const selectedAsset = selectedTileId ? resolveAsset(selectedTileId) : undefined;
  const selectedUnit = selectedCell ? boardUnits[`${selectedCell.x},${selectedCell.y}`] : undefined;
  const selectedUnitAsset = selectedUnit ? resolveUnitAsset(selectedUnit.unitId) : undefined;
  const screenStyle = { '--skirmish-world-bg': `url("${DEFAULT_BACKGROUND_SET.world}")` } as CSSProperties;

  return (
    <div className="skirmish-screen level-editor-screen" data-testid="level-editor" style={screenStyle}>
        <header className="app-titlebar le-topbar" aria-label="Level editor">
          <BrandLockup screenName="Level Editor" />
          <div className="le-topbar-stats" aria-label="Level status">
            <span className="le-level-name">Untitled level</span>
            <span className="le-save-state is-dirty">Unsaved</span>
          </div>
          <nav className="le-topbar-actions" aria-label="Editor actions">
            <button type="button" className="app-header-button" disabled title="Validation arrives once the editor is hosted.">Test</button>
            <button type="button" className="app-header-button app-header-button-active" disabled title="Saving unlocks once the editor is hosted.">Save</button>
            <a className="app-header-button" href="/settings">Settings</a>
          </nav>
        </header>

        <div className="skirmish-field">
          <div className="skirmish-board-frame">
            <ViewPane kind="board" ariaLabel="Level editor board" zoom={viewZoom} pan={viewPan} minZoom={0.4} maxZoom={4} onZoomChange={setViewZoom} onPanChange={setViewPan}>
              <div className="tileset-view-board-content is-board">
                <StudioEditableBoard
                  cols={LE_COLS}
                  rows={LE_ROWS}
                  cells={boardCells}
                  units={boardUnits}
                  doodads={{}}
                  resolveAsset={resolveAsset}
                  resolveUnit={resolveUnitAsset}
                  resolveDoodad={() => undefined}
                  tool={tool}
                  selectedCell={selectedCell}
                  showFootprint={showFootprint}
                  boardZoom={viewZoom}
                  boardPan={viewPan}
                  animationFrame={animationFrame}
                  onPaint={paintCell}
                  onErase={eraseCell}
                  onSelect={selectCell}
                />
              </div>
            </ViewPane>
          </div>
        </div>

      <aside className="skirmish-hud" aria-label="Editor controls">
        <section className="skirmish-card">
          <h2>Layer</h2>
          <div className="le-seg">
            <button type="button" className="le-seg-btn" disabled>Board</button>
            <button type="button" className={`le-seg-btn ${brushKind === 'tile' ? 'active' : ''}`.trim()} onClick={() => { setBrushKind('tile'); setTool('brush'); }}>Tile</button>
            <button type="button" className={`le-seg-btn ${brushKind === 'unit' ? 'active' : ''}`.trim()} onClick={() => { setBrushKind('unit'); setTool('brush'); }}>Unit</button>
            <button type="button" className="le-seg-btn" disabled>Doodad</button>
          </div>
        </section>

        <section className="skirmish-card">
          <h2>Tool</h2>
          <div className="le-seg">
            <button type="button" className={`le-seg-btn ${tool === 'select' ? 'active' : ''}`.trim()} onClick={() => setTool('select')}><span className="le-ico ic-eyedropper" aria-hidden="true" />Select</button>
            <button type="button" className={`le-seg-btn ${tool === 'brush' ? 'active' : ''}`.trim()} onClick={() => setTool('brush')}><span className="le-ico ic-brush" aria-hidden="true" />Brush</button>
            <button type="button" className={`le-seg-btn ${tool === 'erase' ? 'active' : ''}`.trim()} onClick={() => setTool('erase')}><span className="le-ico ic-eraser" aria-hidden="true" />Erase</button>
          </div>
          <div className="le-brush-pick">
            <span className="le-brush-thumb">
              {brushKind === 'unit'
                ? <img src={unitBrushAsset.sprite(unitFaction, 'south')} alt="" draggable={false} />
                : <img src={brushAsset.src} alt="" draggable={false} />}
            </span>
            <span className="le-brush-meta">
              <strong>{brushKind === 'unit' ? unitBrushAsset.label : brushAsset.label}</strong>
              <span>Active brush · {brushKind === 'unit' ? `unit · ${unitSide}` : 'tile'}</span>
            </span>
          </div>
        </section>

        {brushKind === 'unit' ? (
          <section className="skirmish-card le-brush-panel">
            <KitScroll className="le-palette-scroll">
            <h2>Side</h2>
            <div className="le-seg">
              <button type="button" className={`le-seg-btn ${unitSide === 'player' ? 'active' : ''}`.trim()} onClick={() => setUnitSide('player')}>Player</button>
              <button type="button" className={`le-seg-btn ${unitSide === 'enemy' ? 'active' : ''}`.trim()} onClick={() => setUnitSide('enemy')}>Enemy</button>
            </div>
            <h2 className="le-card-subhead">Facing</h2>
            <div className="le-seg">
              {LE_FACING.map((dir) => (
                <button type="button" key={dir} className={`le-seg-btn ${unitBrushDirection === dir ? 'active' : ''}`.trim()} onClick={() => setUnitBrushDirection(dir)} title={dir}>{dir.charAt(0).toUpperCase()}</button>
              ))}
            </div>
            <h2 className="le-card-subhead">Units</h2>
            <div className="le-swatches">
              {unitAssets.map((unit) => (
                <button
                  type="button"
                  key={unit.id}
                  className={`le-swatch ${unitBrushId === unit.id && tool !== 'erase' ? 'active' : ''}`.trim()}
                  title={unit.label}
                  onClick={() => { setUnitBrushId(unit.id); setBrushKind('unit'); setTool('brush'); }}
                >
                  <img src={unit.sprite(unitFaction, 'south')} alt="" draggable={false} />
                  <small>{unit.label}</small>
                </button>
              ))}
            </div>
            </KitScroll>
          </section>
        ) : (
          <section className="skirmish-card le-brush-panel">
            <h2>Palette</h2>
            <KitScroll className="le-palette-scroll">
              {leTileGroups.map(({ family, tiles }) => (
                <div className="le-pal-group" key={family.id}>
                  <span className="le-pal-grouplabel">{family.label}</span>
                  <div className="le-swatches">
                    {tiles.map((tile) => (
                      <button
                        type="button"
                        key={tile.id}
                        className={`le-swatch ${brushId === tile.id && tool !== 'erase' ? 'active' : ''}`.trim()}
                        title={tile.label}
                        onClick={() => { setBrushId(tile.id); setTool('brush'); }}
                      >
                        <img src={tile.src} alt="" draggable={false} />
                        <small>{tile.label}</small>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </KitScroll>
          </section>
        )}

        <section className="skirmish-card">
          <h2>Fill</h2>
          <div className="le-seg">
            <button type="button" className="le-seg-btn" onClick={() => fillBoard('empty')} title="Fill blank cells with the current brush.">Empty</button>
            <button type="button" className="le-seg-btn" onClick={() => fillBoard('all')} title="Fill the whole board with the current brush.">Whole</button>
            <button type="button" className="le-seg-btn" onClick={clearBoard} title="Remove every tile from the board.">Clear</button>
          </div>
        </section>

        <section className="skirmish-card">
          <h2>View</h2>
          <button type="button" className={`le-toggle ${showFootprint ? 'on' : ''}`.trim()} onClick={() => setShowFootprint((value) => !value)}><span className="pip" aria-hidden="true" />Footprint</button>
          <div className="le-zoom">
            <button type="button" className="le-iconbtn" title="Zoom out" onClick={() => adjustZoom(-0.2)}><span className="le-ico ic-down" aria-hidden="true" /></button>
            <span className="le-zoom-read">Zoom {Math.round(viewZoom * 100)}%</span>
            <button type="button" className="le-iconbtn" title="Zoom in" onClick={() => adjustZoom(0.2)}><span className="le-ico ic-up" aria-hidden="true" /></button>
          </div>
        </section>

        <section className="skirmish-card le-details">
          <h2>Details · {selectedUnitAsset ? 'Unit' : selectedAsset ? 'Tile' : selectedCell ? 'Cell' : 'Board'}</h2>
          {selectedUnitAsset && selectedUnit ? (
            <dl>
              <div><dt>Piece</dt><dd>{selectedUnitAsset.label}</dd></div>
              <div><dt>Side</dt><dd>{selectedUnit.faction === 'crimson' ? 'Enemy' : 'Player'}</dd></div>
              <div><dt>Facing</dt><dd>{selectedUnit.direction}</dd></div>
            </dl>
          ) : selectedAsset ? (
            <dl>
              <div><dt>Type</dt><dd>{leFamilyOfTile(selectedAsset.id)?.label ?? '—'}</dd></div>
              <div><dt>Source</dt><dd>{selectedAsset.id}</dd></div>
              <div><dt>Cell</dt><dd>{selectedCell?.x}, {selectedCell?.y}</dd></div>
            </dl>
          ) : (
            <dl>
              <div><dt>Tiles</dt><dd>{paintedCount}</dd></div>
              <div><dt>Units</dt><dd>{unitCount}</dd></div>
            </dl>
          )}
        </section>

        <div className="le-statusline">
          {selectedCell ? <>Cell <b>{selectedCell.x},{selectedCell.y}</b> · </> : null}<b>{paintedCount}</b> tiles · <b>{unitCount}</b> units · {LE_COLS}×{LE_ROWS}
        </div>
      </aside>
    </div>
  );
}
