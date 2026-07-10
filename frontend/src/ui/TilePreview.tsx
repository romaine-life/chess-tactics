// This file implements the Studio. It MUST follow the control architecture spec in
// docs/studio-control-architecture.md — read it before adding a mode, category, or surface.
// Invariants: ONE persistent surface (the board); Board/Tile/Unit/Doodad are *focuses*
// (control sets that share that board), NOT separate views; the frame never moves; a new
// board-placeable thing is a catalogCategories entry + a focus, never a bespoke view or a
// `category === '…'` branch.
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import { tileFamilies, edgeTiles, wallThumbSrc } from '../art/tileset';
import { WALL_MATERIALS, WALL_MATERIAL_LABELS, type WallMaterial } from '../core/featureAutotile';
import { nonProductionTileAssets, nonProductionTileFamilyOf } from '../art/nonProductionTiles';
import {
  terrainLabels,
  transitionPairs,
  transitionPairById,
  transitionPairsForFamily,
  transitionSlotsForPair,
  type TileAssetKind,
  type TileFamilyId,
  type TileSocketAsset,
  type TerrainPairId,
} from '../core/tileSockets';
import { CatalogGrid, CatalogControls, CatalogFilters, type CatalogType, type CatalogFilterDim } from './studio/Catalog';
import { AssetLibraryStudio, AssetLab, ASSET_TYPE_FACETS, type AssetFilters } from './design/AssetLibraryStudio';
import { DividerLab } from './DividerViewer';
import { ArtworkLibraryStudio, ArtworkLab, ARTWORK_GROUPS } from './design/ArtworkLibraryStudio';
import { CroppedView, loadCrops, type Piece as PortraitPiece } from './PortraitEditor';
import { PORTRAIT_METHODS, PORTRAIT_PIECES, portraitMasterSrc, type PortraitMethod } from './portraitCandidates';
import { GlossaryLibraryStudio, GlossaryLab } from './design/GlossaryLibraryStudio';
import { SurfaceLibraryStudio, SurfaceViewer } from './SurfaceLibraryStudio';
import { TileSidesViewer } from './TileSidesViewer';
import { TILE_SIDE_ITEMS, tileSideFamilyCount, type TileSideItem } from './tileSideCatalog';
import { ScrollbarLibraryStudio, ScrollbarViewer } from './ScrollbarLibraryStudio';
import { PagesLibraryStudio, PagesViewer } from './PagesLibraryStudio';
import { GameLabCatalog, GameLabViewer } from './GameLab';
import { GymCatalog, GymViewer, type GymMode } from './Gym';
import { SolveCatalog, SolveViewer } from './SolveRuns';
import { PAGE_ENTRIES } from './pagesCatalog';
import { SliderRow } from './dressing/SliderRow';
import { SliderLibraryStudio, SliderViewer } from './SliderLibraryStudio';
import { SfxLibraryStudio, SfxViewer } from './SfxLibraryStudio';
import { UnitArtLab } from './UnitArtLab';
import { PortraitLab } from './PortraitEditor';
import { NineSliceLab, DEFAULT_NINE_SLICE_ASSET } from './NineSliceEditor';
import { PropSeatLab, type StructureEditorDraft } from './PropSeatLab';
import { PROP_DEFS, type PropDef, type PropKind } from '../core/props';
import { TileCompareLab, COMPARE_TILES, COMPARE_TILE_FAMILIES, compareTileCap, type CompareTile } from './TileCompareLab';
import { SurfaceTilesLab, SURFACE_TILE_FAMILIES, surfaceTileCap } from './SurfaceTilesLab';
import { GROUND_COVER_ASSETS, GroundCoverPreview, groundCoverAsset, type GroundCoverCatalogAsset, type GroundCoverId } from './groundCoverCatalog';
import { WALL_DECOR_ASSETS, WALL_DECOR_KIND_LABELS, WALL_DECOR_KINDS, WallDecorLab, WallDecorPreview, wallDecorAsset, type WallDecorAsset, type WallDecorKind } from './wallDecorCatalog';
import { wallArt, wallArtBadge, wallArtItems, type WallArt } from '../core/wallArt';
import { WallArtLab, WallArtPreview } from './WallArtLab';
import { SceneAnimLab, SceneRegionPicker, SCENE_ANIM_REGIONS, SCENE_ANIM_SCENES, SceneRegionThumb, type SceneRegion, type SceneAnimScene } from './SceneAnimLab';
import { ArtworkCompareLab } from './ArtworkCompareLab';
import { currentDoodadAssets, DOODAD_ASSETS, type DoodadAsset } from './doodadCatalog';
import { structureSourceHalfSrc } from '../render/BoardStructure';
import kitManifest from './design/kitManifest.json';
import artworkManifest from './design/artworkManifest.json';
import { navigateApp } from './navigation';
import { TitleBarSlot } from './shell/TitleBarSlot';
import { TitleBarActions, TitleBarButton, TitleBarIconButton } from './shell/TitleBarControls';
import {
  activeUnitFamilies,
  familyLabels,
  hasDirectionSprite,
  rookDirections,
  unitAssets,
  unitAssetById,
  UNIT_METHOD_OPTIONS,
  type Direction,
  type PieceId,
  type UnitAsset,
} from './unitCatalog';
import {
  useAnimationClock,
  FacingCompass,
  assetFrameSrc,
  studioFamilies,
  type StudioAsset,
  type StudioFamily,
  type StudioFamilyId,
} from './studioBoard';





// The studio has two persistent destinations (tier-1), both always reachable and
// decoupled from the catalog category: 'catalog' browses a grid; 'viewer' is the
// read-only stage for one finished, non-manipulable thing (an asset or an artwork).
// Board editing lives in the standalone Level Editor (/level-editor), which the
// catalog cards and the "Lab" tab route to. See docs/studio-control-architecture.md.
type StudioMode = 'catalog' | 'viewer';

// The catalog's kinds-of-thing. Category governs only what the Catalog shows; it
// does not decide which destination tab you can reach.
type StudioCategory = 'tiles' | 'tilesides' | 'units' | 'doodads' | 'props' | 'groundcover' | 'walldecor' | 'wallart' | 'tilecompare' | 'surfacetiles' | 'sceneanim' | 'animscenes' | 'assets' | 'artwork' | 'portraits' | 'glossary' | 'surfaces' | 'fences' | 'walls' | 'scrollbars' | 'sliders' | 'pages' | 'sfx' | 'gamelab' | 'gym' | 'solver';

// What the Viewer is currently holding. Assets and artwork feed read-only stages;
// 'portrait' is the embedded portrait crop editor and 'nineslice' the embedded
// 9-slice frame editor (the two in-studio editing kinds); 'glossary' reads one term
// in full (definition + any long-form process doc). This records the active kind.
type ViewerKind = 'asset' | 'artwork' | 'unitart' | 'portrait' | 'nineslice' | 'divider' | 'propseat' | 'tilecompare' | 'surfacetiles' | 'sceneanim' | 'animscene' | 'artworkcompare' | 'glossary' | 'surface' | 'scrollbar' | 'slider' | 'page' | 'tileside' | 'walldecor' | 'wallart' | 'sfx' | 'gamelab' | 'gym' | 'solver';

// Every prop KIND present in the catalog, in definition order — DERIVED from PROP_DEFS so a new
// kind (e.g. 'rock') is a filter facet automatically. Hardcoding ['tree','house'] here silently
// dropped rocks from the Props catalog even though they were valid props.
const ALL_PROP_KINDS: PropKind[] = [...new Set(PROP_DEFS.map((p) => p.kind))];

const CopyFromIcon = (): ReactElement => (
  <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
    <rect x="2.2" y="4.8" width="7.5" height="8.8" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.3" />
    <rect x="6.3" y="2.2" width="7.5" height="8.8" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.3" />
    <path d="M5.9 9.2 H9.7 M7.8 7.3 V11.1" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
  </svg>
);

const sourceFromDoodad = (doodad: DoodadAsset) => doodad.parts?.[0]?.source ?? doodad.source ?? { kind: 'asset' as const, id: doodad.id };
const sourceFromProp = (prop: PropDef) => prop.spriteParts?.[0]?.source ?? prop.spriteSource ?? { kind: 'asset' as const, id: prop.spriteId };

// Default selection for the Artwork viewer, so the Viewer shows a real piece
// instead of an empty stage before anything is opened.
const FIRST_ARTWORK_ID: string = artworkManifest.groups[0]?.items[0]?.id ?? '';
const compareByLabel = <T extends { label: string }>(a: T, b: T): number => (
  a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })
);

// The Portraits catalog's assets: every piece × every bake-off method (navy only). A
// dedicated top-level category so portraits get their own Unit + Treatment filters,
// rendered through the accepted per-piece crop. Method labels come from the registry.
type PortraitCandidateAsset = { id: string; piece: PortraitPiece; method: PortraitMethod; methodLabel: string; methodSub: string };
const PORTRAIT_CANDIDATE_ASSETS: PortraitCandidateAsset[] = PORTRAIT_PIECES.flatMap((piece) =>
  PORTRAIT_METHODS.map((m) => ({ id: `${piece}-${m.key}`, piece, method: m.key, methodLabel: m.label, methodSub: m.sub })));
type WallCatalogAsset = { id: string; material: WallMaterial; label: string; badge: string; method: string; notes: string };
const WALL_CATALOG_META: Record<WallMaterial, { method: string; notes: string }> = {
  stone: {
    method: 'Photoscan material + runtime geometry',
    notes: 'Photoscanned wall texture from the staged wall pack, projected into the shipped north/west perimeter geometry.',
  },
  brick: {
    method: 'Codex img2img material + runtime geometry',
    notes: 'Method-gated Codex img2img brick material, projected into the same shipped north/west perimeter geometry.',
  },
  mossy: {
    method: 'PixelLab material + runtime geometry',
    notes: 'PixelLab tiles_pro mossy-stone material candidate, projected into the same shipped north/west perimeter geometry.',
  },
  basalt: {
    method: 'PixelLab material + runtime geometry',
    notes: 'PixelLab tiles_pro basalt material candidate, projected into the same shipped north/west perimeter geometry.',
  },
  palisade: {
    method: 'PixelLab material + runtime geometry',
    notes: 'PixelLab tiles_pro palisade-plank material candidate, projected into the same shipped north/west perimeter geometry.',
  },
};
const WALL_CATALOG_ASSETS: WallCatalogAsset[] = WALL_MATERIALS.map((material) => ({
  id: `wall-${material}`,
  material,
  label: `${WALL_MATERIAL_LABELS[material]} wall`,
  badge: 'edge blocker',
  method: WALL_CATALOG_META[material].method,
  notes: WALL_CATALOG_META[material].notes,
}));
type TileFilter = 'base' | 'board';
type LabMode = 'board' | 'tile' | 'unit' | 'doodad';
type CollectionFilter = Exclude<TileFilter, 'board'>;
type TransitionViewMode = 'tile' | 'proof' | 'sample';


interface TilesetStudioRouteState {
  familyId: StudioFamilyId;
  studioMode: StudioMode;
  category?: StudioCategory;
  selectedAssetName?: string;
  selectedArtworkName?: string;
  selectedGlossaryName?: string;
  selectedPageName?: string;
  selectedGameLabLevelId?: string;
  selectedGymLevelId?: string;
  selectedSolverLevelId?: string;
  /** Which Board Solver surface is open (Stepper / cluster Run / Help / Glossary) — the `stab=` param. */
  solverTab?: 'step' | 'run' | 'help' | 'glossary';
  selectedTileSideId?: string;
  selectedFrameName?: string;
  selectedPropName?: string;
  selectedTileCompareId?: string;
  selectedGroundCoverId?: string;
  selectedWallDecorId?: string;
  selectedWallArtId?: string;
  selectedSurfaceFamily?: string;
  selectedRegionId?: string;
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


const transitionAssets: StudioAsset[] = [];


// Non-production reference tiles (legacy textured, codex→filter, rejected bake-off methods).
// Injected into the Tiles CATALOG only (below) — deliberately NOT in studioFamilies, so they
// never reach board generation or the Level Editor brush. See art/nonProductionTiles.ts.
const nonProductionStudioTiles: StudioAsset[] = nonProductionTileAssets.map((asset): StudioAsset => ({ ...asset }));

const familyCounts = (family: StudioFamily): string => {
  const variants = family.assets.filter((asset) => asset.kind === 'tile').length;
  return `${variants} ${variants === 1 ? 'tile' : 'tiles'}`;
};

const familySample = (family: StudioFamily): StudioAsset => family.assets.find((asset) => asset.kind === 'tile') ?? family.assets[0];

const studioFamilyById = (familyId: StudioFamilyId): StudioFamily =>
  studioFamilies.find((item) => item.id === familyId) ?? studioFamilies[0];

const isStudioFamilyId = (value: string | null): value is StudioFamilyId => value === 'grass' || value === 'stone' || value === 'water';

const isStudioMode = (value: string | null): value is StudioMode => value === 'catalog' || value === 'viewer';
const isStudioCategory = (value: string | null): value is StudioCategory => value === 'tiles' || value === 'tilesides' || value === 'units' || value === 'doodads' || value === 'props' || value === 'groundcover' || value === 'walldecor' || value === 'wallart' || value === 'tilecompare' || value === 'surfacetiles' || value === 'sceneanim' || value === 'animscenes' || value === 'assets' || value === 'artwork' || value === 'portraits' || value === 'glossary' || value === 'surfaces' || value === 'fences' || value === 'walls' || value === 'scrollbars' || value === 'sliders' || value === 'pages' || value === 'sfx' || value === 'gamelab' || value === 'gym' || value === 'solver';
const isLabMode = (value: string | null): value is LabMode => value === 'board' || value === 'tile' || value === 'unit' || value === 'doodad';

const isTileFilter = (value: string | null): value is TileFilter => value === 'base' || value === 'transitions' || value === 'references' || value === 'board';

const isTerrainPairId = (value: string | null): value is TerrainPairId => value === 'grass-stone' || value === 'grass-water' || value === 'stone-water';
const isUnitAssetId = (value: string | null): value is string => Boolean(
  value && (unitAssetById(value) || /^candidate:[0-9a-f-]{36}$/i.test(value)),
);

const readTilesetStudioRoute = (): TilesetStudioRouteState => {
  const params = new URLSearchParams(window.location.search);
  const family = params.get('family');
  const mode = params.get('mode');
  const cat = params.get('cat');
  const normalizedCat = cat === 'wallassets' ? 'wallart' : cat;
  const kit = params.get('kit');
  const art = params.get('art');
  const gloss = params.get('gloss');
  const page = params.get('page');
  const glvl = params.get('glvl');
  const gymlvl = params.get('gymlvl');
  const slvl = params.get('slvl');
  const stab = params.get('stab');
  const side = params.get('side');
  const vk = params.get('vk');
  const normalizedVk = vk === 'wallasset' ? 'wallart' : vk;
  const lab = params.get('lab');
  const view = params.get('view');
  const collection = params.get('collection');
  const pair = params.get('pair');
  const asset = params.get('asset');
  const unit = params.get('unit');
  const slot = Number(params.get('slot'));
  const seed = Number(params.get('seed'));
  // /unit-studio is a deep-link alias into the embedded Unit Art editor.
  const isUnitStudioAlias = window.location.pathname === '/unit-studio';
  // /nine-slice-editor is a deep-link ALIAS into this one studio (like /unit-studio):
  // it opens the embedded 9-slice surface (Assets category, Viewer mode, 'nineslice'
  // kind) with ?asset=<frame>. The studio's own route writer then canonicalises the
  // URL to /studio?…&frame=<frame>. No separate route, no page chrome.
  const isNineSliceAlias = window.location.pathname === '/nine-slice-editor';
  // /prop-lab is a deep-link ALIAS into this one studio (like /nine-slice-editor): it opens
  // the embedded prop-seat surface (Props category, Viewer mode, 'propseat' kind) with
  // ?prop=<id>. The route writer then canonicalises the URL to /studio. No separate
  // route, no bespoke toolbar (docs/studio-control-architecture.md, ADR-0058).
  const isPropLabAlias = window.location.pathname === '/prop-lab';
  // /tile-compare is another deep-link alias into the studio (ADR-0058): the Tile Pipeline
  // category, Viewer mode, 'tilecompare' kind, ?tile=<id>.
  const isTileCompareAlias = window.location.pathname === '/tile-compare';
  // /surface-lab: alias into the Tileset Surfaces category, 'surfacetiles' viewer, ?sfamily=<f>.
  const isSurfaceLabAlias = window.location.pathname === '/surface-lab';
  // /scene-anim-lab: alias into the Scene Animations category, 'sceneanim' viewer, ?region=<id>.
  const isSceneAnimAlias = window.location.pathname === '/scene-anim-lab';
  // /doodad-editor: legacy alias into the Doodads category, opening the shared structure editor.
  const isDoodadEditorAlias = window.location.pathname === '/doodad-editor';
  // /artwork-compare: alias into the 'artworkcompare' viewer (reached from Pages). It reads its
  // own ?opts/l/r/lcss/rcss on mount, so those deep links still load.
  const isArtworkCompareAlias = window.location.pathname === '/artwork-compare';
  const prop = params.get('prop') || (isPropLabAlias ? params.get('prop') : null);
  const tile = params.get('tile');
  const cover = params.get('cover');
  const wdecor = params.get('wdecor');
  const wart = params.get('wart') ?? params.get('wasset');
  const sfamily = params.get('sfamily');
  const regionParam = params.get('region');
  const frame = params.get('frame') || (isNineSliceAlias ? asset : null);
  // Destination is decoupled from category — any mode is valid with any category,
  // so the URL is taken at face value (no normalization).
  const studioMode = isUnitStudioAlias || isNineSliceAlias || isPropLabAlias || isTileCompareAlias || isSurfaceLabAlias || isSceneAnimAlias || isDoodadEditorAlias || isArtworkCompareAlias ? 'viewer' : isStudioMode(mode) ? mode : studioDefaults.studioMode;
  const routeCategory = isUnitStudioAlias ? 'units' : isNineSliceAlias ? 'assets' : isPropLabAlias ? 'props' : isTileCompareAlias ? 'tilecompare' : isSurfaceLabAlias ? 'surfacetiles' : isSceneAnimAlias ? 'sceneanim' : isDoodadEditorAlias ? 'doodads' : isArtworkCompareAlias ? 'pages' : isStudioCategory(normalizedCat) ? normalizedCat : undefined;
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
    selectedGameLabLevelId: glvl || undefined,
    selectedGymLevelId: gymlvl || undefined,
    selectedSolverLevelId: slvl || undefined,
    solverTab: stab === 'run' ? 'run' : stab === 'help' ? 'help' : stab === 'glossary' ? 'glossary' : stab === 'step' ? 'step' : undefined,
    selectedTileSideId: side || undefined,
    selectedFrameName: frame || undefined,
    selectedPropName: prop || undefined,
    selectedTileCompareId: tile || undefined,
    selectedGroundCoverId: GROUND_COVER_ASSETS.some((asset) => asset.id === cover) ? cover ?? undefined : undefined,
    selectedWallDecorId: WALL_DECOR_ASSETS.some((asset) => asset.id === wdecor) ? wdecor ?? undefined : undefined,
    selectedWallArtId: wallArt(wart ?? undefined)?.id,
    selectedSurfaceFamily: sfamily || undefined,
    selectedRegionId: regionParam || undefined,
    viewerKind: isUnitStudioAlias ? 'unitart' : isNineSliceAlias ? 'nineslice' : isPropLabAlias || isDoodadEditorAlias ? 'propseat' : isTileCompareAlias ? 'tilecompare' : isSurfaceLabAlias ? 'surfacetiles' : isSceneAnimAlias ? 'sceneanim' : isArtworkCompareAlias ? 'artworkcompare'
      : normalizedVk === 'asset' || normalizedVk === 'artwork' || normalizedVk === 'unitart' || normalizedVk === 'portrait' || normalizedVk === 'nineslice' || normalizedVk === 'divider' || normalizedVk === 'propseat' || normalizedVk === 'tilecompare' || normalizedVk === 'surfacetiles' || normalizedVk === 'sceneanim' || normalizedVk === 'animscene' || normalizedVk === 'artworkcompare' || normalizedVk === 'glossary' || normalizedVk === 'surface' || normalizedVk === 'scrollbar' || normalizedVk === 'slider' || normalizedVk === 'page' || normalizedVk === 'tileside' || normalizedVk === 'walldecor' || normalizedVk === 'wallart' || normalizedVk === 'sfx' || normalizedVk === 'gamelab' || normalizedVk === 'gym' || normalizedVk === 'solver' ? normalizedVk : undefined,
    labMode: routeLabMode,
    tileFilter: effectiveTileFilter,
    selectedPairId: isTerrainPairId(pair) ? pair : studioDefaults.selectedPairId,
    selectedAssetId: isNineSliceAlias ? undefined : asset || undefined,
    selectedSlotMask: Number.isInteger(slot) && slot >= 1 && slot <= 14 ? slot : undefined,
    boardMode: params.get('board') === 'concept' ? 'concept' : studioDefaults.boardMode,
    boardScope: params.get('scope') === 'mixed' ? 'mixed' : studioDefaults.boardScope,
    boardSize: params.get('size') === 'wide' ? 'wide' : studioDefaults.boardSize,
    boardSeed: Number.isFinite(seed) && seed > 0 ? Math.floor(seed) : studioDefaults.boardSeed,
    brushKind,
    selectedUnitId: isUnitAssetId(unit) ? unit : undefined,
  };
};

const STUDIO_PATH = '/studio';

const writeTilesetStudioRoute = (route: TilesetStudioRouteState): void => {
  // Canonicalise to /studio even when entered via the /nine-slice-editor
  // alias, so the alias is a pure entry point and all subsequent state rides the
  // one studio URL (the embedded 9-slice surface is not its own route).
  if (window.location.pathname !== STUDIO_PATH && window.location.pathname !== '/unit-studio' && window.location.pathname !== '/nine-slice-editor' && window.location.pathname !== '/prop-lab' && window.location.pathname !== '/tile-compare' && window.location.pathname !== '/surface-lab' && window.location.pathname !== '/scene-anim-lab' && window.location.pathname !== '/doodad-editor' && window.location.pathname !== '/artwork-compare') return;
  if (route.studioMode === 'catalog') {
    // Tiles is the default, so it stays a clean bare URL; Units/Assets get a
    // ?cat= so the chosen catalog survives a reload and is directly linkable.
    const catalogParams = new URLSearchParams();
    if (route.category && route.category !== 'tiles') catalogParams.set('cat', route.category);
    // Keep the catalog URL clean: persist only the active category's own selection.
    if (route.category === 'assets' && route.selectedAssetName) catalogParams.set('kit', route.selectedAssetName);
    if (route.category === 'artwork' && route.selectedArtworkName) catalogParams.set('art', route.selectedArtworkName);
    if (route.category === 'glossary' && route.selectedGlossaryName) catalogParams.set('gloss', route.selectedGlossaryName);
    if (route.category === 'tilesides' && route.selectedTileSideId) catalogParams.set('side', route.selectedTileSideId);
  if (route.category === 'groundcover' && route.selectedGroundCoverId) catalogParams.set('cover', route.selectedGroundCoverId);
  if (route.category === 'walldecor' && route.selectedWallDecorId) catalogParams.set('wdecor', route.selectedWallDecorId);
  if (route.category === 'wallart' && route.selectedWallArtId) catalogParams.set('wart', route.selectedWallArtId);
    if (route.category === 'gamelab' && route.selectedGameLabLevelId) catalogParams.set('glvl', route.selectedGameLabLevelId);
    if (route.category === 'gym' && route.selectedGymLevelId) catalogParams.set('gymlvl', route.selectedGymLevelId);
    if (route.category === 'solver' && route.selectedSolverLevelId) catalogParams.set('slvl', route.selectedSolverLevelId);
    const catalogQuery = catalogParams.toString();
    const nextHref = catalogQuery ? `${STUDIO_PATH}?${catalogQuery}` : STUDIO_PATH;
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
    // The Viewer persists which kind it last held and, for the named kinds, the item.
    // Portrait state lives in localStorage; 'nineslice' persists the frame being edited.
    params.set('vk', route.viewerKind ?? 'artwork');
    if (route.viewerKind === 'asset' && route.selectedAssetName) params.set('kit', route.selectedAssetName);
    else if (route.viewerKind === 'artwork' && route.selectedArtworkName) params.set('art', route.selectedArtworkName);
    else if (route.viewerKind === 'glossary' && route.selectedGlossaryName) params.set('gloss', route.selectedGlossaryName);
    else if (route.viewerKind === 'page' && route.selectedPageName) params.set('page', route.selectedPageName);
    else if (route.viewerKind === 'gamelab' && route.selectedGameLabLevelId) params.set('glvl', route.selectedGameLabLevelId);
    else if (route.viewerKind === 'gym' && route.selectedGymLevelId) params.set('gymlvl', route.selectedGymLevelId);
    else if (route.viewerKind === 'solver' && route.selectedSolverLevelId) params.set('slvl', route.selectedSolverLevelId);
    else if (route.viewerKind === 'tileside' && route.selectedTileSideId) params.set('side', route.selectedTileSideId);
    else if (route.viewerKind === 'nineslice' && route.selectedFrameName) params.set('frame', route.selectedFrameName);
    else if (route.viewerKind === 'propseat' && route.selectedPropName) params.set('prop', route.selectedPropName);
    else if (route.viewerKind === 'tilecompare' && route.selectedTileCompareId) params.set('tile', route.selectedTileCompareId);
    else if (route.viewerKind === 'surfacetiles' && route.selectedSurfaceFamily) params.set('sfamily', route.selectedSurfaceFamily);
    else if (route.viewerKind === 'sceneanim' && route.selectedRegionId) params.set('region', route.selectedRegionId);
    else if (route.viewerKind === 'walldecor' && route.selectedWallDecorId) params.set('wdecor', route.selectedWallDecorId);
    else if (route.viewerKind === 'wallart' && route.selectedWallArtId) params.set('wart', route.selectedWallArtId);
    // The solver's open surface (Stepper is the default, so only non-default tabs are
    // written) — rides beside slvl so a solver deep link restores both the level AND the tab.
    if (route.viewerKind === 'solver' && route.solverTab && route.solverTab !== 'step') params.set('stab', route.solverTab);
  }
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
  const nextHref = `${STUDIO_PATH}?${params.toString()}`;
  const currentHref = `${window.location.pathname}${window.location.search}`;
  if (nextHref !== currentHref) {
    window.history.replaceState({}, '', nextHref);
  }
};

const defaultViewZoom = (kind: 'tile' | 'transition' | 'board'): number => {
  if (kind === 'tile') return 1.35;
  if (kind === 'transition') return 1.15;
  return 0.95;
};

const defaultTransitionViewModeForRoute = (route: TilesetStudioRouteState): TransitionViewMode => {
  return route.selectedAssetId && transitionAssets.some((asset) => asset.id === route.selectedAssetId) ? 'tile' : 'proof';
};




export function TilesetStudio({ initialCategory = 'tiles' }: { initialCategory?: StudioCategory } = {}): ReactElement {
  const initialRoute = useMemo(() => readTilesetStudioRoute(), []);
  const [unitCatalogEpoch, setUnitCatalogEpoch] = useState(0);
  const handleUnitCatalogChanged = useCallback(() => setUnitCatalogEpoch((value) => value + 1), []);
  const initialHasViewTarget = Boolean(initialRoute.selectedAssetId || initialRoute.selectedSlotMask || initialRoute.tileFilter === 'board');
  const [familyId, setFamilyId] = useState<StudioFamilyId>(initialRoute.familyId);
  const [studioMode, setStudioMode] = useState<StudioMode>(initialRoute.studioMode);
  const [category, setCategory] = useState<StudioCategory>(initialRoute.category ?? initialCategory);
  const [labMode, setLabMode] = useState<LabMode>(initialRoute.labMode);
  const [doodadBrushId, setDoodadBrushId] = useState<string>(DOODAD_ASSETS[0].id);
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
  const [wallDecorSearch, setWallDecorSearch] = useState('');
  const [wallArtSearch, setWallArtSearch] = useState('');
  const [selectedArtworkGroups, setSelectedArtworkGroups] = useState<string[]>(ARTWORK_GROUPS.map((g) => g.id));
  const [selectedPortraitPieces, setSelectedPortraitPieces] = useState<PortraitPiece[]>([...PORTRAIT_PIECES]);
  const [selectedPortraitMethods, setSelectedPortraitMethods] = useState<PortraitMethod[]>(PORTRAIT_METHODS.map((m) => m.key));
  const [selectedPortraitId, setSelectedPortraitId] = useState<string | undefined>(undefined);
  const [surfaceSearch, setSurfaceSearch] = useState('');
  const [scrollbarSearch, setScrollbarSearch] = useState('');
  const [selectedScrollbarName, setSelectedScrollbarName] = useState<string | undefined>(undefined);
  const [selectedSurfaceName, setSelectedSurfaceName] = useState<string | undefined>(undefined);
  const [tileSideSearch, setTileSideSearch] = useState('');
  const [selectedTileSideId, setSelectedTileSideId] = useState<string | undefined>(initialRoute.selectedTileSideId);
  const [selectedSideFamilies, setSelectedSideFamilies] = useState<TileFamilyId[]>(studioFamilies.map((fam) => fam.id));
  const [sliderSearch, setSliderSearch] = useState('');
  const [selectedSliderName, setSelectedSliderName] = useState<string | undefined>(undefined);
  const [sfxSearch, setSfxSearch] = useState('');
  const [selectedSfxName, setSelectedSfxName] = useState<string | undefined>(undefined);
  const [pageSearch, setPageSearch] = useState('');
  const [selectedPageName, setSelectedPageName] = useState<string | undefined>(initialRoute.selectedPageName);
  // Viewer-wide zoom — a meta-control (in the shared Viewer header) that scales the WHOLE preview.
  // 1 = full size (roam it with the panel scrollbars); the dressing-room (iframe) viewers consume it.
  const [viewerZoom, setViewerZoom] = useState(1);
  const [gameLabSearch, setGameLabSearch] = useState('');
  const [selectedGameLabLevelId, setSelectedGameLabLevelId] = useState<string | undefined>(initialRoute.selectedGameLabLevelId);
  const [gymSearch, setGymSearch] = useState('');
  const [selectedGymLevelId, setSelectedGymLevelId] = useState<string | undefined>(initialRoute.selectedGymLevelId);
  const [solverSearch, setSolverSearch] = useState('');
  const [selectedSolverLevelId, setSelectedSolverLevelId] = useState<string | undefined>(initialRoute.selectedSolverLevelId);
  const [solverTab, setSolverTab] = useState<'step' | 'run' | 'help' | 'glossary'>(initialRoute.solverTab ?? 'step');
  // The Gym's open surface from the URL (`gymtab=`), read once at mount so a deep link
  // lands INSIDE a mode (e.g. Piece values) instead of on the Gym's default tab.
  const [initialGymTab] = useState<GymMode | undefined>(() => {
    const v = new URLSearchParams(window.location.search).get('gymtab');
    return v === 'book' || v === 'train' || v === 'cluster' || v === 'values' ? v : undefined;
  });
  const [glossarySearch, setGlossarySearch] = useState('');
  // Assets and artwork each own their own selection — never one shared field
  // (that's how an Assets id like 'gear' used to leak into the Artwork stage).
  const [selectedAssetName, setSelectedAssetName] = useState(initialRoute.selectedAssetName ?? 'gear');
  const [selectedArtworkName, setSelectedArtworkName] = useState(initialRoute.selectedArtworkName ?? FIRST_ARTWORK_ID);
  const [selectedGlossaryName, setSelectedGlossaryName] = useState(initialRoute.selectedGlossaryName ?? '9-slice');
  // Which kit frame the embedded 9-slice editor (Viewer 'nineslice' kind) is aligning.
  const [selectedFrameName, setSelectedFrameName] = useState(initialRoute.selectedFrameName ?? DEFAULT_NINE_SLICE_ASSET);
  // Which prop the embedded prop-seat editor (Viewer 'propseat' kind) is tuning.
  const [selectedPropName, setSelectedPropName] = useState(initialRoute.selectedPropName ?? PROP_DEFS[0].id);
  // Which pipeline tile the embedded Tile Pipeline compare (Viewer 'tilecompare' kind) shows.
  const [selectedTileCompareId, setSelectedTileCompareId] = useState(initialRoute.selectedTileCompareId ?? COMPARE_TILES[0].id);
  const [selectedGroundCoverId, setSelectedGroundCoverId] = useState<GroundCoverId>(groundCoverAsset(initialRoute.selectedGroundCoverId).id);
  const [selectedWallDecorId, setSelectedWallDecorId] = useState<string>(wallDecorAsset(initialRoute.selectedWallDecorId).id);
  const [selectedWallArtId, setSelectedWallArtId] = useState<string>(wallArt(initialRoute.selectedWallArtId)?.id ?? wallArtItems()[0].id);
  const [wallArtDraftSourceId, setWallArtDraftSourceId] = useState<string | null>(null);
  const [selectedWallId, setSelectedWallId] = useState<string>(WALL_CATALOG_ASSETS[0].id);
  // Which family the embedded Tileset Surfaces inspector (Viewer 'surfacetiles' kind) opens on.
  const [selectedSurfaceFamily, setSelectedSurfaceFamily] = useState(initialRoute.selectedSurfaceFamily ?? SURFACE_TILE_FAMILIES[0]);
  // Which menu region the embedded Scene Animations inspector (Viewer 'sceneanim' kind) shows.
  const [selectedRegionId, setSelectedRegionId] = useState(initialRoute.selectedRegionId ?? SCENE_ANIM_REGIONS[0].id);
  const [selectedSceneId, setSelectedSceneId] = useState(SCENE_ANIM_SCENES[0].id);
  const [structureDraft, setStructureDraft] = useState<StructureEditorDraft | null>(window.location.pathname === '/doodad-editor' ? { target: 'doodad' } : null);
  // Which item the Viewer is showing (independent of the catalog category).
  const [viewerKind, setViewerKind] = useState<ViewerKind>(initialRoute.viewerKind ?? 'artwork');
  const [selectedUnitFamilies, setSelectedUnitFamilies] = useState<PieceId[]>(activeUnitFamilies);
  const [selectedUnitMethods, setSelectedUnitMethods] = useState<string[]>(UNIT_METHOD_OPTIONS.map((m) => m.id));
  const knownUnitMethodsRef = useRef(new Set(UNIT_METHOD_OPTIONS.map((method) => method.id)));
  useEffect(() => {
    const available = UNIT_METHOD_OPTIONS.map((method) => method.id);
    const added = available.filter((method) => !knownUnitMethodsRef.current.has(method));
    knownUnitMethodsRef.current = new Set(available);
    if (added.length) setSelectedUnitMethods((current) => [...new Set([...current, ...added])]);
  }, [unitCatalogEpoch]);
  // Facing for the Units catalog preview — the compass in the rail rotates every unit card.
  const [catalogFacing, setCatalogFacing] = useState<Direction>('south');
  const rotateCatalogFacingCw = (): void => {
    const i = rookDirections.indexOf(catalogFacing);
    setCatalogFacing(rookDirections[(i + 1) % rookDirections.length] ?? 'south');
  };
  const [selectedDoodadTerrains, setSelectedDoodadTerrains] = useState<StudioFamilyId[]>(studioFamilies.map((fam) => fam.id));
  const [selectedPropKinds, setSelectedPropKinds] = useState<PropKind[]>([...ALL_PROP_KINDS]);
  const [selectedCompareFamilies, setSelectedCompareFamilies] = useState<string[]>([...COMPARE_TILE_FAMILIES]);
  const [selectedGroundCoverTerrains, setSelectedGroundCoverTerrains] = useState<GroundCoverId[]>(GROUND_COVER_ASSETS.map((asset) => asset.id));
  const [selectedWallDecorKinds, setSelectedWallDecorKinds] = useState<WallDecorKind[]>([...WALL_DECOR_KINDS]);
  const [selectedPairId, setSelectedPairId] = useState<TerrainPairId>(initialRoute.selectedPairId);
  const [zoom, setZoom] = useState(1);
  const [, setViewZoom] = useState(1);
  const [, setViewPan] = useState({ x: 0, y: 0 });
  const [transitionViewMode, setTransitionViewMode] = useState<TransitionViewMode>(() => defaultTransitionViewModeForRoute(initialRoute));
  const [boardMode, setBoardMode] = useState<'generated' | 'concept'>(initialRoute.boardMode);
  const [boardScope, setBoardScope] = useState<'family' | 'mixed'>(initialRoute.boardScope);
  const [boardSize, setBoardSize] = useState<'small' | 'wide'>(initialRoute.boardSize);
  const [boardSeed, setBoardSeed] = useState(initialRoute.boardSeed);
  const [animationPlaying] = useState(true);
  const [manualAnimationFrame, setManualAnimationFrame] = useState(0);
  // Unified editable board (temporary, in-memory only — re-seeds when a new view loads).
  const [, setTool] = useState<'select' | 'brush' | 'erase'>(initialRoute.brushKind === 'unit' ? 'brush' : 'select');
  const [brushKind, setBrushKind] = useState<'tile' | 'unit' | 'doodad'>(initialRoute.brushKind);
  const [unitBrushId, setUnitBrushId] = useState<string>(initialRoute.selectedUnitId ?? unitAssets[0].id);

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
  const resolveUnitAsset = (id: string): UnitAsset | undefined => unitAssetById(id);
  const unitBrushAsset = resolveUnitAsset(unitBrushId) ?? unitAssets[0];
  const catalogBaseAssets = activeFamilies.flatMap((item) => item.assets.filter((asset) => asset.kind === 'tile'));
  const normalizedCatalogQuery = catalogQuery.trim().toLowerCase();
  const matchesCatalogQuery = (asset: StudioAsset): boolean => {
    if (!normalizedCatalogQuery) return true;
    return [asset.label, asset.role, asset.source, asset.notes, asset.pairId ?? '', ...(asset.terrains ?? [])]
      .join(' ')
      .toLowerCase()
      .includes(normalizedCatalogQuery);
  };
  const visibleCatalogBaseAssets = catalogBaseAssets.filter(matchesCatalogQuery);
  const visibleCatalogCount = selectedCollectionFilters.includes('base') ? visibleCatalogBaseAssets.length : 0;
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
      if (route.selectedTileSideId) setSelectedTileSideId(route.selectedTileSideId);
      if (route.selectedGroundCoverId) setSelectedGroundCoverId(groundCoverAsset(route.selectedGroundCoverId).id);
      if (route.selectedWallDecorId) setSelectedWallDecorId(wallDecorAsset(route.selectedWallDecorId).id);
      if (route.selectedWallArtId) setSelectedWallArtId(wallArt(route.selectedWallArtId)?.id ?? wallArtItems()[0].id);
      if (route.selectedGameLabLevelId) setSelectedGameLabLevelId(route.selectedGameLabLevelId);
      if (route.selectedGymLevelId) setSelectedGymLevelId(route.selectedGymLevelId);
      if (route.selectedSolverLevelId) setSelectedSolverLevelId(route.selectedSolverLevelId);
      // No-param means the default Stepper tab — browser-Back from ?stab=run must actually
      // leave the Run tab, so this resets rather than only setting when present.
      setSolverTab(route.solverTab ?? 'step');
      if (route.selectedFrameName) setSelectedFrameName(route.selectedFrameName);
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
      selectedGameLabLevelId,
      selectedGymLevelId,
      selectedSolverLevelId,
      solverTab,
      selectedTileSideId,
      selectedFrameName,
      selectedPropName,
      selectedTileCompareId,
      selectedGroundCoverId,
      selectedWallDecorId,
      selectedWallArtId,
      selectedSurfaceFamily,
      selectedRegionId,
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
  }, [boardMode, boardScope, boardSeed, boardSize, brushKind, category, familyId, labMode, selectedAsset.id, selectedAssetName, selectedArtworkName, selectedGlossaryName, selectedPageName, selectedGameLabLevelId, selectedGymLevelId, selectedSolverLevelId, solverTab, selectedTileSideId, selectedFrameName, selectedPropName, selectedTileCompareId, selectedGroundCoverId, selectedWallDecorId, selectedWallArtId, selectedSurfaceFamily, selectedRegionId, viewerKind, selectedPairId, selectedSlotMask, studioMode, tileFilter, unitBrushId, viewHasTarget]);

  // Returning to the Catalog (from the Viewer/Lab, or a deep-link) must land you on
  // the card you came from — not the top of the grid. The selection is already kept
  // (the card is highlighted); here we scroll that highlighted card into view inside
  // the catalog's scroll pane. Fires when you (re)enter Catalog mode; the active
  // category's grid is mounted by then. Not keyed on category, so a manual category
  // switch while browsing doesn't yank the scroll.
  useEffect(() => {
    if (studioMode !== 'catalog') return;
    const raf = window.requestAnimationFrame(() => {
      const card = document.querySelector('.tileset-studio-shell .tileset-studio-tab-panel .tileset-studio-card.is-selected');
      card?.scrollIntoView({ block: 'center', inline: 'nearest' });
    });
    return () => window.cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studioMode]);

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

  // Every catalog card (tile/unit/doodad/cover, paintbrush + inspect) now opens the standalone
  // Level Editor with that asset pre-armed as the brush — the in-studio board lab is retired.
  const openInLevelEditor = (kind: 'tile' | 'unit' | 'doodad' | 'cover' | 'wall' | 'wallart', id: string): void => {
    navigateApp(`/editor/level?from=studio&kind=${kind}&brush=${encodeURIComponent(id)}`);
  };

  const viewSubtitle =
    labMode === 'unit'
      ? `${unitBrushAsset.family} unit · ${selectedAsset.label} tile`
      : viewKind === 'board'
      ? `${boardScope === 'family' ? selectedFamilyLabel : 'Mixed terrain'} · seed ${boardSeed}`
      : viewKind === 'transition'
        ? `${viewTransitionPair?.label ?? 'Transition'} · mask ${viewTransitionSlot?.code ?? selectedAsset.socketMask ?? ''}`
        : `${family.label} · ${selectedAsset.role}`;
  const normalizedUnitQuery = catalogQuery.trim().toLowerCase();
  const visibleUnits = normalizedUnitQuery
    ? unitAssets.filter((unit) => [unit.label, unit.badge, unit.family, unit.read, unit.status].join(' ').toLowerCase().includes(normalizedUnitQuery))
    : unitAssets;
  const openCatalogMode = (): void => {
    if (tileFilter === 'board') setTileFilter('base');
    setStudioMode('catalog');
  };
  const openViewer = (kind: ViewerKind): void => {
    setViewerKind(kind);
    setStudioMode('viewer');
  };
  const openStructureDraft = (next: StructureEditorDraft): void => {
    setStructureDraft(next);
    if (next.source?.kind === 'prop') setSelectedPropName(next.source.id);
    setViewerKind('propseat');
    setStudioMode('viewer');
  };
  const openWallArtDraftFromSource = (sourceId: string): void => {
    setSelectedWallDecorId(wallDecorAsset(sourceId).id);
    setWallArtDraftSourceId(wallDecorAsset(sourceId).id);
    setViewerKind('wallart');
    setStudioMode('viewer');
  };
  const selectUnitInCatalog = (unitId: string): void => {
    setUnitBrushId(unitId);
  };
  const selectDoodadInCatalog = (doodadId: string): void => {
    setDoodadBrushId(doodadId);
  };
  // Catalog asset-type descriptors. The generic <CatalogGrid>/<CatalogControls>
  // render either of these; a new asset type is just another descriptor.
  const tileFamilyOf = new Map<string, StudioFamilyId>();
  for (const fam of studioFamilies) for (const a of fam.assets) tileFamilyOf.set(a.id, fam.id);
  for (const a of nonProductionStudioTiles) tileFamilyOf.set(a.id, nonProductionTileFamilyOf.get(a.id) ?? 'grass');
  const tilesCatalogType: CatalogType<StudioAsset> = {
    id: 'tiles',
    label: 'Tiles',
    assets: [...studioFamilies.flatMap((fam) => fam.assets), ...nonProductionStudioTiles],
    card: (a) => ({ img: assetFrameSrc(a, animationFrame), title: a.label, badge: a.role }),
    sections: (visible) => {
      const tiles = visible.filter((a) => a.kind === 'tile');
      const prod = tiles.filter((a) => !a.speculative);
      const spec = tiles.filter((a) => a.speculative);
      const out: { id: string; label: string; assets: StudioAsset[] }[] = [];
      if (prod.length) out.push({ id: 'base', label: 'Base Tiles', assets: prod });
      if (spec.length) out.push({ id: 'non-production', label: 'Non-production — reference & rejected bake-off methods', assets: spec });
      return out;
    },
    query: {
      value: catalogQuery,
      set: setCatalogQuery,
      placeholder: 'label, source, socket...',
      match: (a, q) => [a.label, a.role, a.source, a.notes, a.method ?? '', a.speculative ? 'non-production speculative' : '', ...(a.terrains ?? [])].join(' ').toLowerCase().includes(q),
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
    onView: (a) => openInLevelEditor('tile', a.id),
    onArm: (a) => openInLevelEditor('tile', a.id),
    selectedId: selectedAssetId,
  };
  const unitFamilyCount = (family: PieceId) => unitAssets.filter((u) => u.family === family).length;
  const unitsCatalogType: CatalogType<UnitAsset> = {
    id: 'units',
    label: 'Units',
    assets: unitAssets,
    card: (u) => ({ img: hasDirectionSprite(u, catalogFacing) ? u.sprite('navy-blue', catalogFacing) : u.preview, title: u.label, badge: u.badge, isUnit: true }),
    sections: (visible) => {
      const prod = visible.filter((u) => !u.speculative);
      const spec = visible.filter((u) => u.speculative);
      const out: { id: string; label: string; assets: UnitAsset[] }[] = [];
      if (prod.length) out.push({ id: 'production', label: 'Production Units', assets: prod });
      if (spec.length) out.push({ id: 'speculative', label: 'Candidates', assets: spec });
      return out;
    },
    query: {
      value: catalogQuery,
      set: setCatalogQuery,
      placeholder: 'piece, read...',
      match: (u, q) => [u.label, u.badge, u.family, u.read, u.status, u.method ?? '', u.speculative ? 'speculative' : 'production'].join(' ').toLowerCase().includes(q),
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
      ...(UNIT_METHOD_OPTIONS.length > 1 ? [{
        id: 'method',
        label: 'Library',
        options: UNIT_METHOD_OPTIONS.map((m) => {
          const n = unitAssets.filter((u) => (u.method ?? 'Production') === m.id).length;
          return { id: m.id, label: m.label, sub: `${m.sub} · ${n}` };
        }),
        memberOf: (u: UnitAsset) => [u.method ?? 'Production'],
        selected: selectedUnitMethods,
        toggle: (id: string) => setSelectedUnitMethods((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id])),
        selectAll: () => setSelectedUnitMethods(UNIT_METHOD_OPTIONS.map((m) => m.id)),
        clear: () => setSelectedUnitMethods([]),
      }] : []),
    ],
    onSelect: (u) => selectUnitInCatalog(u.id),
    onView: (u) => { setUnitBrushId(u.id); openViewer('unitart'); },
    onArm: (u) => openInLevelEditor('unit', u.speculative ? u.family : u.id),
    selectedId: unitBrushId,
    extra: (
      <div className="tileset-catalog-facing">
        <span>Facing</span>
        <FacingCompass direction={catalogFacing} onSelect={setCatalogFacing} onRotate={rotateCatalogFacingCw} />
      </div>
    ),
    note: 'Select a unit.',
  };
  const doodadAssets = currentDoodadAssets();
  const doodadsCatalogType: CatalogType<DoodadAsset> = {
    id: 'doodads',
    label: 'Doodads',
    assets: doodadAssets,
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
          const n = doodadAssets.filter((d) => d.terrains.includes(fam.id)).length;
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
    onView: (d) => openStructureDraft({ target: 'doodad', editId: d.id }),
    onArm: (d) => openInLevelEditor('doodad', d.id),
    cardActions: (d) => [{
      label: `Copy from ${d.label}`,
      title: `Create a new doodad or prop from ${d.label}`,
      icon: <CopyFromIcon />,
      run: () => openStructureDraft({ target: 'doodad', copyFrom: { target: 'doodad', id: d.id } }),
    }],
    onCreate: () => {
      const sourceDoodad = doodadAssets.find((d) => d.id === doodadBrushId) ?? doodadAssets[0];
      openStructureDraft({ target: 'doodad', source: sourceFromDoodad(sourceDoodad) });
    },
    createLabel: 'New doodad',
    selectedId: doodadBrushId,
    note: 'Doodads place only on their home terrain. Pick one to arm the brush, then paint a matching tile.',
  };

  // Props (multi-cell trees/houses). Inspect opens the embedded prop-seat editor (Viewer
  // 'propseat' kind) — how a prop SITS on its tiles is the thing you tune here. Mirrors the
  // doodads descriptor; a kind filter is the natural axis (trees vs houses).
  const PROP_KIND_LABEL: Record<PropKind, string> = { tree: 'Trees', house: 'Houses', rock: 'Rocks' };
  const propsCatalogType: CatalogType<PropDef> = {
    id: 'props',
    label: 'Props',
    assets: PROP_DEFS,
    card: (p) => ({ img: structureSourceHalfSrc(p.spriteSource ?? { kind: 'prop', id: p.spriteId }, 'front'), title: p.label, badge: p.terrains.join(', ') }),
    sections: (visible) => [{ id: 'props', label: 'Props', assets: [...visible] }],
    query: {
      value: catalogQuery,
      set: setCatalogQuery,
      placeholder: 'prop, terrain, kind...',
      match: (p, q) => [p.label, p.kind, ...p.terrains].join(' ').toLowerCase().includes(q),
    },
    zoom: { value: zoom, set: setZoom, min: 0.75, max: 2, step: 0.05, cssVar: '--tile-zoom' },
    filters: [
      {
        id: 'kind',
        label: 'Kind',
        options: ALL_PROP_KINDS.map((k) => {
          const n = PROP_DEFS.filter((p) => p.kind === k).length;
          return { id: k, label: PROP_KIND_LABEL[k], sub: `${n}` };
        }),
        memberOf: (p) => [p.kind],
        selected: selectedPropKinds,
        toggle: (id) => setSelectedPropKinds((cur) => (cur.includes(id as PropKind) ? cur.filter((x) => x !== id) : [...cur, id as PropKind])),
        selectAll: () => setSelectedPropKinds([...ALL_PROP_KINDS]),
        clear: () => setSelectedPropKinds([]),
      },
    ],
    onSelect: (p) => setSelectedPropName(p.id),
    onView: (p) => { setStructureDraft(null); setSelectedPropName(p.id); openViewer('propseat'); },
    cardActions: (p) => [{
      label: `Copy from ${p.label}`,
      title: `Create a new prop or doodad from ${p.label}`,
      icon: <CopyFromIcon />,
      run: () => openStructureDraft({ target: 'prop', copyFrom: { target: 'prop', id: p.id } }),
    }],
    onCreate: () => {
      const sourceProp = PROP_DEFS.find((p) => p.id === selectedPropName) ?? PROP_DEFS[0];
      openStructureDraft({ target: 'prop', source: sourceFromProp(sourceProp) });
    },
    createLabel: 'New prop',
    selectedId: selectedPropName,
    note: 'Inspect a prop to tune how it sits on its tiles, then Save.',
  };

  // Ground Cover — board-placeable ambient cover sets (grass tufts, reeds, sand). Descriptor
  // path keeps ADR-0029's Search + terrain filter + Zoom + View-Selected contract structural.
  const groundCoverCatalogType: CatalogType<GroundCoverCatalogAsset> = {
    id: 'groundcover',
    label: 'Ground Cover',
    assets: GROUND_COVER_ASSETS,
    card: (cover) => ({ img: `${cover.set.basePath}/v${cover.set.variants[0]?.id ?? 0}.png`, title: cover.label, badge: cover.badge }),
    cardMedia: (cover) => <GroundCoverPreview asset={cover} zoom={zoom} />,
    sections: (visible) => [{ id: 'groundcover', label: 'Ground Cover', assets: [...visible] }],
    query: {
      value: catalogQuery,
      set: setCatalogQuery,
      placeholder: 'cover, terrain...',
      match: (cover, q) => [cover.label, cover.id, cover.terrainLabel, cover.badge, cover.notes].join(' ').toLowerCase().includes(q),
    },
    zoom: { value: zoom, set: setZoom, min: 0.75, max: 2, step: 0.05, cssVar: '--tile-zoom' },
    filters: [
      {
        id: 'terrain',
        label: 'Home Terrain',
        options: GROUND_COVER_ASSETS.map((cover) => ({ id: cover.id, label: cover.terrainLabel, sub: cover.badge })),
        memberOf: (cover) => [cover.id],
        selected: selectedGroundCoverTerrains,
        toggle: (id) => setSelectedGroundCoverTerrains((cur) => (cur.includes(id as GroundCoverId) ? cur.filter((x) => x !== id) : [...cur, id as GroundCoverId])),
        selectAll: () => setSelectedGroundCoverTerrains(GROUND_COVER_ASSETS.map((cover) => cover.id)),
        clear: () => setSelectedGroundCoverTerrains([]),
      },
    ],
    onSelect: (cover) => setSelectedGroundCoverId(cover.id),
    onView: (cover) => openInLevelEditor('cover', cover.id),
    onArm: (cover) => openInLevelEditor('cover', cover.id),
    selectedId: selectedGroundCoverId,
    note: 'Ground cover paints density onto tiles; the chosen cover set is stored separately when it differs from the tile terrain.',
  };

  const wallDecorCatalogType: CatalogType<WallDecorAsset> = {
    id: 'walldecor',
    label: 'Wall Art Sources',
    assets: WALL_DECOR_ASSETS,
    card: (decor) => ({ img: decor.src, title: decor.label, badge: decor.badge }),
    cardMedia: (decor) => <WallDecorPreview asset={decor} zoom={zoom} />,
    sections: (visible) => [{ id: 'walldecor', label: 'Wall Art Sources', assets: [...visible] }],
    query: {
      value: wallDecorSearch,
      set: setWallDecorSearch,
      placeholder: 'banner, relief, lantern...',
      match: (decor, q) => [decor.label, decor.kind, decor.badge, decor.method, decor.notes].join(' ').toLowerCase().includes(q),
    },
    zoom: { value: zoom, set: setZoom, min: 0.75, max: 1.6, step: 0.05, cssVar: '--tile-zoom' },
    filters: [
      {
        id: 'kind',
        label: 'Kind',
        options: WALL_DECOR_KINDS.map((kind) => ({ id: kind, label: WALL_DECOR_KIND_LABELS[kind], sub: `${WALL_DECOR_ASSETS.filter((decor) => decor.kind === kind).length}` })),
        memberOf: (decor) => [decor.kind],
        selected: selectedWallDecorKinds,
        toggle: (id) => setSelectedWallDecorKinds((cur) => (cur.includes(id as WallDecorKind) ? cur.filter((x) => x !== id) : [...cur, id as WallDecorKind])),
        selectAll: () => setSelectedWallDecorKinds([...WALL_DECOR_KINDS]),
        clear: () => setSelectedWallDecorKinds([]),
      },
    ],
    onSelect: (decor) => setSelectedWallDecorId(decor.id),
    onView: (decor) => { setSelectedWallDecorId(decor.id); openViewer('walldecor'); },
    cardActions: (decor) => [{
      label: `Create wall art from ${decor.label}`,
      title: `Create a new wall art definition from ${decor.label}`,
      icon: <CopyFromIcon />,
      run: () => openWallArtDraftFromSource(decor.id),
    }],
    onCreate: () => openWallArtDraftFromSource(selectedWallDecorId),
    createLabel: 'New wall art from source',
    selectedId: selectedWallDecorId,
    note: 'Transparent generated source sprites used inside placeable wall art.',
  };

  const wallArtList = wallArtItems();
  const wallArtCatalogType: CatalogType<WallArt> = {
    id: 'wallart',
    label: 'Wall Art',
    assets: wallArtList,
    card: (art) => ({ img: wallThumbSrc('stone'), title: art.label, badge: wallArtBadge(art.id) }),
    cardMedia: (art) => <WallArtPreview art={art} zoom={zoom} />,
    sections: (visible) => [{ id: 'wallart', label: 'Wall Art', assets: [...visible] }],
    query: {
      value: wallArtSearch,
      set: setWallArtSearch,
      placeholder: 'banner, relief, lantern...',
      match: (art, q) => [art.label, art.id, art.span, ...art.slots.map((slot) => slot.sourceId)].join(' ').toLowerCase().includes(q),
    },
    zoom: { value: zoom, set: setZoom, min: 0.75, max: 1.6, step: 0.05, cssVar: '--tile-zoom' },
    onSelect: (art) => setSelectedWallArtId(art.id),
    onView: (art) => { setWallArtDraftSourceId(null); setSelectedWallArtId(art.id); openViewer('wallart'); },
    onArm: (art) => openInLevelEditor('wallart', art.id),
    onCreate: () => openWallArtDraftFromSource(selectedWallDecorId),
    createLabel: 'New wall art',
    selectedId: selectedWallArtId,
    note: 'Placeable wall art mounts on existing wall segments and may span multiple wall tiles.',
  };

  const wallsCatalogType: CatalogType<WallCatalogAsset> = {
    id: 'walls',
    label: 'Walls',
    assets: WALL_CATALOG_ASSETS,
    card: (wall) => ({ img: wallThumbSrc(wall.material), title: wall.label, badge: wall.badge }),
    sections: (visible) => [{ id: 'walls', label: 'Walls', assets: [...visible] }],
    query: {
      value: catalogQuery,
      set: setCatalogQuery,
      placeholder: 'wall, material, method...',
      match: (wall, q) => [wall.label, wall.material, wall.badge, wall.method, wall.notes].join(' ').toLowerCase().includes(q),
    },
    zoom: { value: zoom, set: setZoom, min: 0.75, max: 2, step: 0.05, cssVar: '--tile-zoom' },
    onSelect: (wall) => setSelectedWallId(wall.id),
    onView: (wall) => openInLevelEditor('wall', wall.material),
    onArm: (wall) => openInLevelEditor('wall', wall.material),
    selectedId: selectedWallId,
    note: 'Walls are tall blockers for the map north and west perimeter edges.',
  };

  // Tile Pipeline — the 36 QA tiles (raw PixelLab vs snapped-to-grid). Read-only; Inspect
  // opens the before/after compare (Viewer 'tilecompare' kind). A distinct QA asset set, NOT
  // the shipped Tiles catalog — so it never leaks into board generation or the brush.
  const tileCompareCatalogType: CatalogType<CompareTile> = {
    id: 'tilecompare',
    label: 'Tile Pipeline',
    assets: COMPARE_TILES,
    card: (t) => ({ img: t.proc, title: t.label, badge: t.id }),
    sections: (visible) => [{ id: 'tilecompare', label: 'Pipeline tiles', assets: [...visible] }],
    query: {
      value: catalogQuery,
      set: setCatalogQuery,
      placeholder: 'tile, family...',
      match: (t, q) => [t.label, t.family, t.id].join(' ').toLowerCase().includes(q),
    },
    zoom: { value: zoom, set: setZoom, min: 0.75, max: 2, step: 0.05, cssVar: '--tile-zoom' },
    filters: [
      {
        id: 'family',
        label: 'Family',
        options: COMPARE_TILE_FAMILIES.map((f) => ({ id: f, label: compareTileCap(f), sub: `${COMPARE_TILES.filter((t) => t.family === f).length}` })),
        memberOf: (t) => [t.family],
        selected: selectedCompareFamilies,
        toggle: (id) => setSelectedCompareFamilies((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id])),
        selectAll: () => setSelectedCompareFamilies([...COMPARE_TILE_FAMILIES]),
        clear: () => setSelectedCompareFamilies([]),
      },
    ],
    onSelect: (t) => setSelectedTileCompareId(t.id),
    onView: (t) => { setSelectedTileCompareId(t.id); openViewer('tilecompare'); },
    selectedId: selectedTileCompareId,
    note: 'Inspect a tile to see the raw PixelLab vs the snapped-to-grid result side by side.',
  };

  // Tileset Surfaces — the production board tileset by family (distinct from the `surface`
  // UI-texture kind). Inspect opens the board/tiles inspector (Viewer 'surfacetiles' kind).
  const surfaceFamilyAssets = SURFACE_TILE_FAMILIES.map((f) => ({ id: f, label: surfaceTileCap(f) }));
  const surfaceTilesCatalogType: CatalogType<{ id: string; label: string }> = {
    id: 'surfacetiles',
    label: 'Tileset Surfaces',
    assets: surfaceFamilyAssets,
    card: (f) => ({ img: `/assets/tiles/surface/${f.id}-0.png`, title: f.label, badge: 'board tileset' }),
    sections: (visible) => [{ id: 'surfacetiles', label: 'Families', assets: [...visible] }],
    query: {
      value: catalogQuery,
      set: setCatalogQuery,
      placeholder: 'family...',
      match: (f, q) => f.label.toLowerCase().includes(q),
    },
    zoom: { value: zoom, set: setZoom, min: 0.75, max: 2, step: 0.05, cssVar: '--tile-zoom' },
    onSelect: (f) => setSelectedSurfaceFamily(f.id),
    onView: (f) => { setSelectedSurfaceFamily(f.id); openViewer('surfacetiles'); },
    selectedId: selectedSurfaceFamily,
    note: 'Inspect a family to review its board tiles (and their flat top-down surfaces).',
  };

  // Scene Animations — the menu-backdrop waterfall regions. Inspect opens the frame-clock
  // inspector (Viewer 'sceneanim' kind: pause/scrub/tempo/A-B). Pure inspector.
  const sceneAnimCatalogType: CatalogType<SceneRegion> = {
    id: 'sceneanim',
    label: 'Scene Animations',
    assets: SCENE_ANIM_REGIONS,
    card: (r) => ({ img: '', title: r.id, badge: `${r.frames} frames · ${r.frameMs}ms` }),
    cardMedia: (r) => <span className="studio-portrait-crop"><SceneRegionThumb region={r} /></span>,
    sections: (visible) => [{ id: 'sceneanim', label: 'Menu regions', assets: [...visible] }],
    query: {
      value: catalogQuery,
      set: setCatalogQuery,
      placeholder: 'region...',
      match: (r, q) => r.id.toLowerCase().includes(q),
    },
    onSelect: (r) => setSelectedRegionId(r.id),
    onView: (r) => { setSelectedRegionId(r.id); openViewer('sceneanim'); },
    selectedId: selectedRegionId,
    note: 'Inspect a region to step its animation frame-by-frame and watch the wrap.',
  };

  // Animated Scenes — whole backdrops (scene-level, above the per-region Scene Animations). Inspect
  // opens the region picker (Viewer 'animscene'): the full scene with a clickable box over each
  // animated region, each linking to that region's Scene Animations view pane. Descriptor path, so
  // Search + Zoom + View-Selected come free (ADR-0029).
  const animScenesCatalogType: CatalogType<SceneAnimScene> = {
    id: 'animscenes',
    label: 'Animated Scenes',
    assets: SCENE_ANIM_SCENES,
    card: (s) => ({ img: s.url, title: s.label, badge: `${s.regionIds.length} waterfalls` }),
    sections: (visible) => [{ id: 'scenes', label: 'Scenes', assets: [...visible] }],
    query: {
      value: catalogQuery,
      set: setCatalogQuery,
      placeholder: 'scene...',
      match: (s, q) => s.label.toLowerCase().includes(q),
    },
    zoom: { value: zoom, set: setZoom, min: 0.75, max: 2, step: 0.05, cssVar: '--tile-zoom' },
    onSelect: (s) => setSelectedSceneId(s.id),
    onView: (s) => { setSelectedSceneId(s.id); openViewer('animscene'); },
    selectedId: selectedSceneId,
    note: 'Inspect a scene to map its waterfalls — click a box to open that one’s animation.',
  };

  // Artwork browses via a bespoke library component (not a CatalogType), so it wires the
  // shared Filters dropdown directly: one dimension, the manifest Group. memberOf is unused
  // here (CatalogFilters only reads options/selected/toggle); the grid filters in the component.
  const artworkGroupFilter: CatalogFilterDim<{ id: string }> = {
    id: 'group',
    label: 'Group',
    options: ARTWORK_GROUPS.map((g) => ({ id: g.id, label: g.label, sub: `${g.count} ${g.count === 1 ? 'piece' : 'pieces'}` })),
    memberOf: () => [],
    selected: selectedArtworkGroups,
    toggle: (id) => setSelectedArtworkGroups((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id])),
    selectAll: () => setSelectedArtworkGroups(ARTWORK_GROUPS.map((g) => g.id)),
    clear: () => setSelectedArtworkGroups([]),
  };

  // Portraits — the bake-off as its own catalog category, so portraits get their own
  // Unit (piece) and Treatment (method) filters. Cards render through the accepted
  // per-piece crop (loadCrops + CroppedView via cardMedia), navy-only, held out of game.
  const portraitCatalogCrops = loadCrops();
  const portraitsCatalogType: CatalogType<PortraitCandidateAsset> = {
    id: 'portraits',
    label: 'Portraits',
    assets: PORTRAIT_CANDIDATE_ASSETS,
    card: (a) => ({ img: portraitMasterSrc(a.piece, 'navy-blue', a.method), title: a.methodLabel, badge: a.methodSub }),
    cardMedia: (a) => (
      <span className="studio-portrait-crop">
        <CroppedView src={portraitMasterSrc(a.piece, 'navy-blue', a.method)} crop={portraitCatalogCrops[a.piece]} />
      </span>
    ),
    sections: (visible) => PORTRAIT_PIECES
      .map((piece) => ({ id: piece, label: familyLabels[piece], assets: visible.filter((a) => a.piece === piece) }))
      .filter((s) => s.assets.length),
    query: {
      value: catalogQuery,
      set: setCatalogQuery,
      placeholder: 'piece, treatment...',
      match: (a, q) => [familyLabels[a.piece], a.methodLabel, a.methodSub, a.method].join(' ').toLowerCase().includes(q),
    },
    zoom: { value: zoom, set: setZoom, min: 0.75, max: 2, step: 0.05, cssVar: '--tile-zoom' },
    filters: [
      {
        id: 'piece',
        label: 'Unit',
        options: PORTRAIT_PIECES.map((piece) => ({ id: piece, label: familyLabels[piece], sub: `${PORTRAIT_METHODS.length} treatments` })),
        memberOf: (a) => [a.piece],
        selected: selectedPortraitPieces,
        toggle: (id) => setSelectedPortraitPieces((cur) => (cur.includes(id as PortraitPiece) ? cur.filter((x) => x !== id) : [...cur, id as PortraitPiece])),
        selectAll: () => setSelectedPortraitPieces([...PORTRAIT_PIECES]),
        clear: () => setSelectedPortraitPieces([]),
      },
      {
        id: 'method',
        label: 'Treatment',
        options: PORTRAIT_METHODS.map((m) => ({ id: m.key, label: m.label, sub: m.sub })),
        memberOf: (a) => [a.method],
        selected: selectedPortraitMethods,
        toggle: (id) => setSelectedPortraitMethods((cur) => (cur.includes(id as PortraitMethod) ? cur.filter((x) => x !== id) : [...cur, id as PortraitMethod])),
        selectAll: () => setSelectedPortraitMethods(PORTRAIT_METHODS.map((m) => m.key)),
        clear: () => setSelectedPortraitMethods([]),
      },
    ],
    onSelect: (a) => setSelectedPortraitId(a.id),
    onView: () => openViewer('portrait'),
    selectedId: selectedPortraitId,
    note: 'Navy-only bake-off. The compare-at-HUD-framing grid is in Viewer › Portrait.',
  };

  // The catalog is one registry, not a chain of `category === …` branches: every
  // category supplies its grid (`main`) and its rail body (`controls`), and the
  // selector tabs / main pane / controls are rendered by mapping or reading the
  // active entry. Adding a category is one entry here — it cannot ship missing a
  // shared control. (docs/studio-control-architecture.md)
  // Tile SIDES — a read-only inspection catalog. Same tiles as the placement catalog (plus the
  // frayed perimeter edges), but routed to the Viewer instead of the Level Editor, and with no
  // 🖌 arm action — it's for scrutinising the cliff/side faces, not painting. Descriptor path,
  // so Search + family filter + Zoom + View-Selected come for free (ADR-0029).
  const tileSideFamilies = Object.keys(tileFamilies) as TileFamilyId[];
  const tileSidesCatalogType: CatalogType<TileSideItem> = {
    id: 'tilesides',
    label: 'Tile Sides',
    assets: TILE_SIDE_ITEMS,
    card: (item) => ({ img: item.src, title: item.label, badge: item.role }),
    sections: (visible) => {
      const edges = visible.filter((item) => item.role === 'edge');
      const base = visible.filter((item) => item.role !== 'edge');
      const out: { id: string; label: string; assets: TileSideItem[] }[] = [];
      if (base.length) out.push({ id: 'tiles', label: 'Tiles', assets: base });
      if (edges.length) out.push({ id: 'edges', label: 'Frayed perimeter edges', assets: edges });
      return out;
    },
    query: {
      value: tileSideSearch,
      set: setTileSideSearch,
      placeholder: 'family, role...',
      match: (item, q) => [item.label, item.family, item.role].join(' ').toLowerCase().includes(q),
    },
    zoom: { value: zoom, set: setZoom, min: 0.75, max: 2, step: 0.05, cssVar: '--tile-zoom' },
    filters: [
      {
        id: 'family',
        label: 'Tile Family',
        options: tileSideFamilies.map((fam) => ({ id: fam, label: terrainLabels[fam], sub: `${tileSideFamilyCount(fam)} tiles` })),
        memberOf: (item) => [item.family],
        selected: selectedSideFamilies,
        toggle: (id) => setSelectedSideFamilies((cur) => (cur.includes(id as TileFamilyId) ? cur.filter((x) => x !== id) : [...cur, id as TileFamilyId])),
        selectAll: () => setSelectedSideFamilies(tileSideFamilies),
        clear: () => setSelectedSideFamilies([]),
      },
    ],
    onSelect: (item) => setSelectedTileSideId(item.id),
    onView: (item) => { setSelectedTileSideId(item.id); openViewer('tileside'); },
    selectedId: selectedTileSideId,
    note: 'Inspect each tile’s cliff/side faces — includes the frayed perimeter edges.',
  };
  const catalogCategories: { id: StudioCategory; label: string; hint: string; main: ReactElement; controls: ReactElement }[] = [
    {
      id: 'tiles', label: 'Tiles', hint: 'Browse terrain tiles.',
      main: <CatalogGrid type={tilesCatalogType} />,
      controls: <CatalogControls type={tilesCatalogType} />,
    },
    {
      id: 'tilesides', label: 'Tile Sides', hint: 'Inspect the cliff/side faces of every tile, including the frayed perimeter edges.',
      main: <CatalogGrid type={tileSidesCatalogType} />,
      controls: <CatalogControls type={tileSidesCatalogType} />,
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
      id: 'props', label: 'Props', hint: 'Browse multi-cell props (trees/houses); Inspect one to tune how it sits on its tiles.',
      main: <CatalogGrid type={propsCatalogType} />,
      controls: <CatalogControls type={propsCatalogType} />,
    },
    {
      id: 'groundcover', label: 'Ground Cover', hint: 'Browse ambient cover sets — grass tufts, shoreline reeds, and sand cover. Paint them in the Level Editor cover layer.',
      main: <CatalogGrid type={groundCoverCatalogType} />,
      controls: <CatalogControls type={groundCoverCatalogType} />,
    },
    {
      id: 'walldecor', label: 'Wall Art Sources', hint: 'Browse generated transparent source sprites used by wall art.',
      main: <CatalogGrid type={wallDecorCatalogType} />,
      controls: <CatalogControls type={wallDecorCatalogType} />,
    },
    {
      id: 'wallart', label: 'Wall Art', hint: 'Create and place artwork that mounts on existing perimeter walls.',
      main: <CatalogGrid type={wallArtCatalogType} />,
      controls: <CatalogControls type={wallArtCatalogType} />,
    },
    {
      id: 'tilecompare', label: 'Tile Pipeline', hint: 'The QA tile set — Inspect one to compare the raw PixelLab tile against the snapped-to-grid result.',
      main: <CatalogGrid type={tileCompareCatalogType} />,
      controls: <CatalogControls type={tileCompareCatalogType} />,
    },
    {
      id: 'surfacetiles', label: 'Tileset Surfaces', hint: 'The production board tileset by family — Inspect one to review its tiles on a board.',
      main: <CatalogGrid type={surfaceTilesCatalogType} />,
      controls: <CatalogControls type={surfaceTilesCatalogType} />,
    },
    {
      id: 'sceneanim', label: 'Scene Animations', hint: 'The menu-backdrop waterfall regions — Inspect one to step its animation frame-by-frame.',
      main: <CatalogGrid type={sceneAnimCatalogType} />,
      controls: <CatalogControls type={sceneAnimCatalogType} />,
    },
    {
      id: 'animscenes', label: 'Animated Scenes', hint: 'Whole animated backdrops — Inspect one to map its waterfalls and click into each.',
      main: <CatalogGrid type={animScenesCatalogType} />,
      controls: <CatalogControls type={animScenesCatalogType} />,
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
            <span>Type</span>
            <div className="tileset-tier-seg" aria-label="Filter by asset type">
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
          groups={selectedArtworkGroups}
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
          <CatalogFilters filters={[artworkGroupFilter]} />
          <button type="button" className="tileset-view-action" onClick={() => openViewer('artwork')}>View Selected</button>
        </>
      ),
    },
    {
      id: 'portraits', label: 'Portraits', hint: 'Browse the unit portrait bake-off — filter by unit and treatment.',
      main: <CatalogGrid type={portraitsCatalogType} />,
      controls: <CatalogControls type={portraitsCatalogType} />,
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
      id: 'fences', label: 'Fences', hint: 'Edge fences — a low rail you paint on a tile edge to make that edge untraversable. Paint them in the Level Editor.',
      main: (
        <div className="al-lab-main" style={{ display: 'grid', placeItems: 'center', padding: 24, overflow: 'auto' }}>
          <div style={{ display: 'flex', gap: 18, alignItems: 'center', maxWidth: 560, background: '#0f1728', border: '1px solid #223350', borderRadius: 10, padding: 20 }}>
            <img src="/assets/tiles/feature/fence-wood-thumb.png" alt="Wooden fence" width={120} height={120} style={{ imageRendering: 'pixelated', flex: 'none' }} draggable={false} />
            <div>
              <h3 style={{ margin: '0 0 6px', color: '#eaf3ff' }}>Edge fences</h3>
              <p style={{ margin: '0 0 12px', color: '#9fb6d6', fontSize: 13, lineHeight: 1.5 }}>A low rail that sits on the boundary between two tiles and blocks a piece from crossing that edge — both tiles stay walkable, and knights hop it. Paint them on tile edges in the Level Editor.</p>
              <button type="button" className="tileset-view-action" onClick={() => navigateApp('/editor/level?from=studio&layer=fence')}>Paint fences in the editor</button>
            </div>
          </div>
        </div>
      ),
      controls: (
        <>
          <p className="tileset-catalog-note" style={{ color: '#9fb6d6', fontSize: 12, lineHeight: 1.5 }}>Fences live on tile edges and block crossing. Paint them in the Level Editor&rsquo;s Fence layer.</p>
          <button type="button" className="tileset-view-action" onClick={() => navigateApp('/editor/level?from=studio&layer=fence')}>Paint fences in the editor</button>
        </>
      ),
    },
    {
      id: 'walls', label: 'Walls', hint: 'Tall blockers for the map north and west perimeter. Paint them in the Level Editor.',
      main: <CatalogGrid type={wallsCatalogType} />,
      controls: <CatalogControls type={wallsCatalogType} />,
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
      id: 'sfx', label: 'Sound Effects', hint: 'Audition the landing sounds — recorded foley (grass/water/sand) + the arrival thump. Played live.',
      main: <SfxLibraryStudio search={sfxSearch} zoom={zoom} selected={selectedSfxName} onSelect={setSelectedSfxName} />,
      controls: (
        <>
          <label className="tileset-catalog-search">
            <span>Search</span>
            <input type="search" value={sfxSearch} onChange={(event) => setSfxSearch(event.target.value)} placeholder="terrain, character…" />
          </label>
          <label className="tileset-catalog-zoom">
            <span>Zoom</span>
            <input type="range" min="0.75" max="2" step="0.05" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} />
          </label>
          <button type="button" className="tileset-view-action" onClick={() => openViewer('sfx')}>Assign sounds…</button>
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
          <button type="button" className="tileset-view-action" onClick={() => openViewer('artworkcompare')} title="Compare a screen against its accepted concept art (art vs live).">Compare to art ▸</button>
        </>
      ),
    },
    {
      id: 'gamelab', label: 'Game Lab', hint: 'Run self-play AI experiments on a level — win rates, per-piece activity, ply-by-ply replay, ablation variants.',
      main: <GameLabCatalog search={gameLabSearch} selected={selectedGameLabLevelId} onSelect={setSelectedGameLabLevelId} />,
      controls: (
        <>
          <label className="tileset-catalog-search">
            <span>Search</span>
            <input type="search" value={gameLabSearch} onChange={(event) => setGameLabSearch(event.target.value)} placeholder="level, mode…" />
          </label>
          <button type="button" className="tileset-view-action" onClick={() => openViewer('gamelab')} disabled={!selectedGameLabLevelId}>Open Game Lab</button>
        </>
      ),
    },
    {
      id: 'gym', label: 'Training Gym', hint: 'Train the AI on a level, stepping at your own pace — tune its eval weights with SPSA, or learn the board’s piece values from scratch by TD self-play and watch the numbers move.',
      main: <GymCatalog search={gymSearch} selected={selectedGymLevelId} onSelect={setSelectedGymLevelId} />,
      controls: (
        <>
          <label className="tileset-catalog-search">
            <span>Search</span>
            <input type="search" value={gymSearch} onChange={(event) => setGymSearch(event.target.value)} placeholder="level, mode…" />
          </label>
          <button type="button" className="tileset-view-action" onClick={() => openViewer('gym')} disabled={!selectedGymLevelId}>Open Gym</button>
        </>
      ),
    },
    {
      id: 'solver', label: 'Board Solver', hint: 'Solve a board exactly and watch it think — step the retrograde/search phases live, watch the value spread from the terminals onto the board, or launch a bounded cluster solve; feasibility read + honest per-piece values.',
      main: <SolveCatalog search={solverSearch} selected={selectedSolverLevelId} onSelect={setSelectedSolverLevelId} />,
      controls: (
        <>
          <label className="tileset-catalog-search">
            <span>Search</span>
            <input type="search" value={solverSearch} onChange={(event) => setSolverSearch(event.target.value)} placeholder="level, mode…" />
          </label>
          <button type="button" className="tileset-view-action" onClick={() => openViewer('solver')} disabled={!selectedSolverLevelId}>Open Solver</button>
        </>
      ),
    },
  ];
  const activeCatalog = catalogCategories.find((entry) => entry.id === category) ?? catalogCategories[0];
  const catalogCategoryOptions = [...catalogCategories].sort(compareByLabel);

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
        <option value="unitart">Unit Art</option>
        <option value="portrait">Portrait</option>
        <option value="nineslice">9-Slice</option>
        <option value="propseat">Prop Seat</option>
        <option value="tilecompare">Tile Pipeline</option>
        <option value="surfacetiles">Tileset Surfaces</option>
        <option value="sceneanim">Scene Animation</option>
        <option value="animscene">Animated Scene</option>
        <option value="artworkcompare">Art Compare</option>
        <option value="glossary">Glossary</option>
        <option value="surface">Surface</option>
        <option value="scrollbar">Scrollbar</option>
        <option value="slider">Slider</option>
        <option value="sfx">Sound Assignments</option>
        <option value="page">Page</option>
        <option value="gamelab">Game Lab</option>
        <option value="gym">Training Gym</option>
        <option value="solver">Board Solver</option>
        <option value="tileside">Tile Sides</option>
        <option value="walldecor">Wall Art Sources</option>
        <option value="wallart">Wall Art</option>
      </select>
    </label>
  );

  // The studio workspace switcher (Catalog / Lab / Viewer) — three icon buttons that ride
  // the persistent title bar's actions slot (just before the account cluster), portaled in
  // via <TitleBarSlot> below. It moved OFF the control rail so switching workspaces no longer
  // costs every Viewer's controls a row of word-tabs. The glyphs are forged kit icons —
  // indie pixel-art of period objects (~0–1750 AD): an open illuminated codex (Catalog), an
  // alchemist's flask (Lab), a hand lens (Viewer) — made by scripts/forge-studio-switcher-icons.mjs
  // (codex img-gen → 64×64 kit canvas). Catalog & Viewer toggle in place; Lab hops to the Level Editor.
  const studioModeNav = (
    <>
      <TitleBarIconButton active={studioMode === 'catalog'} aria-pressed={studioMode === 'catalog'} onClick={openCatalogMode} label="Catalog" title="Catalog — browse the catalogs." iconSrc="/assets/ui/kit/icons/studio-catalog.png" />
      <TitleBarIconButton to="/editor/level?from=studio" label="Lab" title="Lab — open the Level Editor to paint tiles and units and set the board size." iconSrc="/assets/ui/kit/icons/studio-lab.png" />
      <TitleBarIconButton active={studioMode === 'viewer'} aria-pressed={studioMode === 'viewer'} onClick={() => setStudioMode('viewer')} label="Viewer" title="Viewer — view one finished asset or artwork." iconSrc="/assets/ui/kit/icons/studio-viewer.png" />
    </>
  );
  // "‹ Scene" back: from the per-waterfall inspector (the 'sceneanim' Viewer) return to the
  // Animated Scenes picker for THAT region's scene. Lives in the title-bar actions slot beside the
  // studio's own workspace nav. The title-bar control primitive owns its frame and spacing; this is
  // an in-app state flip (the studio owns its own URL), not a ?returnTo.
  const backToSceneMap = (): void => {
    const scene = SCENE_ANIM_SCENES.find((s) => s.regionIds.includes(selectedRegionId)) ?? SCENE_ANIM_SCENES[0];
    setSelectedSceneId(scene.id);
    openViewer('animscene');
  };
  const sceneBackNav = studioMode === 'viewer' && viewerKind === 'sceneanim' ? (
    <TitleBarButton onClick={backToSceneMap} aria-label="Back to the animated scene" title="Back to the animated scene map">‹ Scene</TitleBarButton>
  ) : null;
  // Viewer labs render their controls through a `header` slot: the preview-kind select plus the
  // viewer-wide Zoom meta-control. Zoom scales the WHOLE preview (100% = full size; scroll the panel
  // to roam it) — it rides the header so it shows for every Viewer kind; the dressing-room (iframe)
  // viewers consume it today. The workspace switcher moved out of the rail onto the title bar (above).
  const studioViewerHeader = (
    <>
      {viewerKindSelect}
      <SliderRow
        label={<>Zoom · {Math.round(viewerZoom * 100)}%{viewerZoom === 1 ? ' · full size' : ''}</>}
        value={viewerZoom}
        set={setViewerZoom}
        min={0.25}
        max={2}
        step={0.05}
        nudge={0.05}
        dflt={1}
      />
    </>
  );

  return (
    <main className="tileset-studio-page app-shell-bar-pad">
      <TitleBarSlot region="actions"><TitleBarActions aria-label="Studio workspace">{sceneBackNav}{studioModeNav}</TitleBarActions></TitleBarSlot>
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
                  {catalogCategoryOptions.map((entry) => (
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
          viewerKind === 'unitart'
            ? <UnitArtLab
                selectedUnit={unitBrushAsset}
                direction={catalogFacing}
                zoom={viewerZoom}
                onDirection={setCatalogFacing}
                onZoom={setViewerZoom}
                onSelectUnit={setUnitBrushId}
                onCatalogChanged={handleUnitCatalogChanged}
                header={studioViewerHeader}
              />
            : viewerKind === 'portrait'
            ? <PortraitLab header={studioViewerHeader} />
            : viewerKind === 'divider'
            ? <DividerLab header={studioViewerHeader} />
            : viewerKind === 'nineslice'
            ? <NineSliceLab assetId={selectedFrameName} onAssetId={setSelectedFrameName} header={studioViewerHeader} />
            : viewerKind === 'propseat'
            ? <PropSeatLab propId={selectedPropName} onPropId={setSelectedPropName} header={studioViewerHeader} draft={structureDraft} onDraftChange={setStructureDraft} />
            : viewerKind === 'tilecompare'
            ? <TileCompareLab tileId={selectedTileCompareId} onTileId={setSelectedTileCompareId} header={studioViewerHeader} />
            : viewerKind === 'surfacetiles'
            ? <SurfaceTilesLab family={selectedSurfaceFamily} onFamily={setSelectedSurfaceFamily} header={studioViewerHeader} />
            : viewerKind === 'animscene'
            ? <SceneRegionPicker sceneId={selectedSceneId} onSceneId={setSelectedSceneId} onPickRegion={(id) => { setSelectedRegionId(id); openViewer('sceneanim'); }} header={studioViewerHeader} />
            : viewerKind === 'sceneanim'
            ? <SceneAnimLab regionId={selectedRegionId} onRegionId={setSelectedRegionId} header={studioViewerHeader} />
            : viewerKind === 'artworkcompare'
            ? <ArtworkCompareLab header={studioViewerHeader} />
            : viewerKind === 'artwork'
              ? <ArtworkLab name={selectedArtworkName} header={studioViewerHeader} />
              : viewerKind === 'glossary'
                ? <GlossaryLab name={selectedGlossaryName} header={studioViewerHeader} />
                : viewerKind === 'surface'
                  ? <SurfaceViewer name={selectedSurfaceName} header={studioViewerHeader} />
                  : viewerKind === 'scrollbar'
                    ? <ScrollbarViewer name={selectedScrollbarName} header={studioViewerHeader} />
                    : viewerKind === 'slider'
                      ? <SliderViewer name={selectedSliderName} header={studioViewerHeader} />
                      : viewerKind === 'page'
                        ? <PagesViewer name={selectedPageName} header={studioViewerHeader} zoom={viewerZoom} />
                        : viewerKind === 'gamelab'
                        ? <GameLabViewer levelId={selectedGameLabLevelId} header={studioViewerHeader} />
                        : viewerKind === 'gym'
                        ? <GymViewer levelId={selectedGymLevelId} header={studioViewerHeader} initialMode={initialGymTab} />
                        : viewerKind === 'solver'
                        ? <SolveViewer levelId={selectedSolverLevelId} header={studioViewerHeader} tab={solverTab} onTabChange={setSolverTab} />
                        : viewerKind === 'tileside'
                          ? <TileSidesViewer name={selectedTileSideId} header={studioViewerHeader} />
                          : viewerKind === 'walldecor'
                            ? <WallDecorLab assetId={selectedWallDecorId} header={studioViewerHeader} />
                          : viewerKind === 'wallart'
                            ? <WallArtLab
                                artId={selectedWallArtId}
                                onArtId={setSelectedWallArtId}
                                header={studioViewerHeader}
                                draftSourceId={wallArtDraftSourceId}
                                onDraftSourceConsumed={() => setWallArtDraftSourceId(null)}
                              />
                          : viewerKind === 'sfx'
                            ? <SfxViewer header={studioViewerHeader} />
                            : <AssetLab name={selectedAssetName} header={studioViewerHeader} onEditFrame={(id) => { setSelectedFrameName(id); openViewer('nineslice'); }} onOpenDivider={() => openViewer('divider')} />
        ) : null}
      </section>
    </main>
  );
}
