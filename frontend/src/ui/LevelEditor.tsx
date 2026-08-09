// The standalone Level Editor (/editor/level; legacy aliases /level-editor, /edit). Split out of TilePreview.tsx so
// it ships its own small lazy chunk instead of dragging the entire design Studio:
// the heavy library studios + manifests live in TilePreview.tsx and are never
// imported here. Shared board core (tile families, the animation clock, the facing
// compass, the per-frame src) comes from ./studioBoard.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type Dispatch, type ReactElement, type ReactNode, type SetStateAction } from 'react';
import { BOARD_CAMERA_TECHNICAL_MINIMUM_ZOOM, boardBackgroundMode, boardBounds, cameraToContainBounds, defaultBoardCameraBounds, defaultSubterrainMaterial, isVersionedPredrawnBoardSurface, MAX_FLOATING_ARTWORK_PIXEL, mergeSharedLevel, MAXIMUM_AUTHORED_CAMERA_ZOOM_IN, normalizeBoardCameraBounds, normalizeCameraZoomIn, predrawnEnvironmentGeometryFingerprintInputV2, predrawnRenderSurface, predrawnVisualFootprintClipStyleForCell, resolvedBoardCameraBounds, resolveTerrainSideExposure, resolveTerrainSideFaces, subterrainMaterials, subterrainFaceKey, subterrainMaterialSrc, worldViewportForCamera, type BoardBackgroundMode, type BoardCameraBounds, type BoardCameraSnapMode, type PredrawnGenerationFrame, type SubterrainMaterial, type SubterrainPlacementMap, type TerrainSideMaterials, type VersionedPredrawnBoardSurface } from '@chess-tactics/board-render';
import { boardLabCellPosition, boardLabMetrics, immutableBoardLabTerrainSrc } from '../render/BoardLabBoard';
import { projectBoardPoint, unprojectBoardPoint, type BoardForest, type BoardForestSection, type BoardForestTree, type BoardTown, type BoardTownSection } from '@chess-tactics/board-render';
import { TILE_TEMPLATE } from '../art/tileTemplate';
import { PropSprite, propHalfSrc } from '../render/BoardStructure';
import { PROP_DEFS, defaultPropDef, propCells, propDef, type PropDef, type PropKind } from '../core/props';
import {
  STRUCTURE_ART_ASSETS,
  structureArtAsset,
  structureArtDirectionHalfSrc,
  structureArtDirectionSprite,
  structureArtDirections,
  structureArtHasCompleteTurntable,
} from '../core/structureArt';
import {
  FOREST_SCATTER_DEFAULTS,
  groundPointToPixel,
  hashUnit,
  isForestMember,
  scatterForest,
  sortFloatingArtworkByDepth,
  type ForestGridArea,
  type ForestScatterParams,
  type ForestSpeciesGeometry,
} from '../core/forestScatter';
import {
  generatorAreasBounds,
  generatorAreasCellCount,
  generatorAreasContainCell,
  normalizeGeneratorAreas,
} from '../core/generatorAreas';
import { composeGeneratorSections, type GeneratorSectionRelationship } from '../core/generatorComposition';
import {
  TOWN_FIT_LABELS,
  TOWN_FIT_NOTES,
  TOWN_FIT_POLICIES,
  TOWN_PLAN_DEFAULTS,
  TOWN_PLAN_KINDS,
  TOWN_PLAN_LABELS,
  TOWN_PLAN_NOTES,
  DEFAULT_TOWN_SECTION,
  isTownMember,
  pixelsInTilesAcross,
  townBoundsCentre,
  planTown,
  snapGridPoint,
  type TownBounds,
  type TownFitPolicy,
  type TownPlanKind,
} from '../core/townPlan';
import { BoardSceneLayer } from '../render/BoardSceneLayer';
import { PredrawnOcclusionSeedLayer } from '../render/PredrawnOcclusion';
import {
  FENCE_ART_REVIEW_ID,
  transformFenceArtReviewOps,
} from './fenceArtReview';
import {
  cycleFenceArtKit,
  fenceArtKit,
  fenceArtKits as projectFenceArtKits,
  fenceArtworkBackendReview,
  type FenceArtKit,
} from './fenceCandidateProfiles';
import { TileGrid, type TileGridCell } from '../render/TileGrid';
import { BoardGridLayer } from '../render/BoardGridLayer';
import { PredrawnMoveHighlightPaint } from '../render/PredrawnMoveHighlightPaint';
import { BoardTerrainLayer, terrainCanvasMacroTiles, type TerrainCanvasCell } from '../render/BoardTerrainLayer';
import {
  decorativeTerrainApronCells,
  decorativeTerrainApronCoordinates,
  extendDecorativeTerrainApron,
  scenicTerrainRenderCells,
  scenicTerrainValueAt,
  withDecorativeTerrainFeatures,
  type DecorativeTerrainSide,
  type DecorativeTerrainExtents,
} from '../render/decorativeTerrainApron';
import { studioTerrainCanvasCell } from '../render/StudioReadOnlyBoard';
import { ViewPane, type ViewPaneViewportSize } from './shared/ViewPane';
import { useBoardCameraFraming } from './shared/BoardViewFraming';
import { CameraBoundaryOverlay } from './shared/CameraBoundaryOverlay';
import { useConfirm } from './shared/ConfirmDialog';
import { useDeleteKeyAction } from './shared/deleteKeyAction';
import { TitleBarControlContribution, type TitleBarControlSpec } from './shell/TitleBarControls';
import { Stepper } from './shared/Stepper';
import { Toggle } from './shared/Toggle';
import { PaletteSelect } from './shared/PaletteSelect';
import { HouseSelect, type HouseSelectOption } from './shared/HouseSelect';
import { CyclePicker } from './shared/CyclePicker';
import { AssetSwatchList } from './shared/AssetSwatchList';
import { GeneratorRecipePresetList } from './shared/GeneratorRecipePresetList';
import { GeneratorSeedControl } from './shared/GeneratorSeedControl';
import { ArtworkSelectionSurface } from './ArtworkSelectionSurface';
import {
  FOREST_ART_PRESETS,
  forestPresetConfiguration,
  type ForestApproachConfiguration,
} from './forestArtPresets';
import {
  TOWN_PRESETS,
  townPresetConfiguration,
  type TownApproachConfiguration,
} from './townPresets';
import { generatorSeedForRun, MAX_GENERATOR_SEED, randomGeneratorSeed } from './generatorSeed';
import { BoardSizePanel, type BoardResizeSide } from './shared/BoardSizePanel';
import {
  MAX_SCENIC_TERRAIN_EXTENT,
  PLAYABLE_GRID_MOVE_DIRECTIONS,
  PLAYABLE_GRID_MOVE_PLATE_STEP,
  movePlayableGrid,
  playableGridMoveAvailability,
  type PlayableGridMoveDirection,
} from './levelEditorPlayableGridMove';
import { DEFAULT_LEVEL_NAME, LEVEL_NAME_MAX, normalizeLevelName } from './shared/levelNamePolicy';
import {
  levelEditorHrefWithRouteState,
  isLevelEditorRoutePath,
  isPlacedArtBrushKind,
  levelEditorRouteBrushKind,
  readLevelEditorRouteState,
  type LevelEditorBrushKind,
  type LevelArtworkWorkspace,
  type LevelEditorEventsTab,
  type LevelEditorLayerKey,
  type PlacedArtBrushKind,
} from './levelEditorRoute';
import { navigateApp, registerAppNavigationBlocker, replaceAppHistoryState, subscribeAppLocation } from './navigation';
import { levelEditorWallFaceGeometry } from './levelEditorWallFace';
import { levelEditorExitAction } from './levelEditorExit';
import { currentDoodadAssets, defaultDoodadAsset, doodadAsset, DOODAD_ASSETS, type DoodadAsset } from './doodadCatalog';
import { defaultGroundCoverAsset, GROUND_COVER_ASSETS, GroundCoverPreview, groundCoverAsset, type GroundCoverId } from './groundCoverCatalog';
import { WallArtPreview } from './WallArtLab';
import { readBoardParam, encodeBoard, zoneCellMapFromEntries, zoneEntriesFromCellMap, type BoardFactionDirections, type BoardGeneratedRegion, type BoardGeneratedRegionSection, type EditorBoard, type EditorZoneEntry, type FeatureCell, type FloatingArtworkPlacement, type PredrawnBoardSurface } from './boardCode';
import { paintTerrainArea } from './levelEditorTerrainEditing';
import {
  canTargetPlacedArtCell,
  isPlayableBoardCoordinate,
  isPropFootprintOnAuthoredSurface,
} from './placedArtPolicy';
import {
  fillScenicTerrainViewportTargets,
  scenicTerrainTargetsForViewport,
} from './levelEditorViewportTerrain';
import {
  PredrawnBoardLayer,
  predrawnBoardCoverPolygon,
  predrawnBoardPlateForEditorReview,
  predrawnReviewGridCells,
  predrawnBoardPreviewRegistration,
  predrawnBoardPreviewSrc,
  serializePredrawnBoardPreviewRegistration,
  storedPredrawnBoardRegistration,
  type PredrawnBoardCornerRegistration,
  type PredrawnBoardPlate,
} from '../render/PredrawnBoardLayer';
import { PredrawnCornerPicker } from './PredrawnCornerPicker';
import { PredrawnBackgroundVersionsPanel } from './PredrawnBackgroundVersionsPanel';
import { PredrawnSourceArtworkPanel } from './PredrawnSourceArtworkPanel';
import { PredrawnGenerationFramePicker } from './PredrawnGenerationFramePicker';
import { predrawnGenerationFrameStatus } from './predrawnGenerationFrameStatus';
import { isPredrawnLockedLayer, predrawnEditorHrefAfterPicker, preservesPredrawnBakedArt, sharesPredrawnSelection } from './predrawnEditorPolicy';
import { predrawnReferenceHref } from './PredrawnReference';
import {
  listPredrawnBackgroundVersions,
  type PredrawnGenerationAttemptWorkspaceMutationResult,
} from '../net/predrawnBackgroundVersions';
import {
  legacyPredrawnEnvironmentGeometrySha256V1,
  predrawnEnvironmentGeometrySha256,
} from '../render/predrawnBackgroundProcessing';
import {
  predrawnSelectionIsDrawable,
  predrawnSelectionNeedsRevalidation,
  predrawnSelectionReadFailure,
  predrawnSelectionReadShouldRetry,
  predrawnSelectionSeed,
  predrawnSelectionValidity as resolvePredrawnSelectionValidity,
  type PredrawnSelectionCheck,
} from './predrawnSelectionValidity';
import { removeZoneEntriesReferencedOnlyByRemovedEvents } from './eventZoneCleanup';
import { LevelDeploymentEditor, type DeploymentZoneOption } from './LevelDeploymentEditor';
import {
  authoredDeploymentForSide,
  eventsWithoutDeployment,
  mergeOtherEvents,
  replaceSideDeployment,
} from './levelDeployment';
import {
  currentBoardTestHref,
  readLevelEventsParam,
  readTimeControlParams,
  readVictoryRulesParam,
} from './playtestRoute';
import {
  acknowledgeScopedLevelEditorRecoveryConflict,
  clearLevelEditorDraft,
  clearPreservedScopedLevelEditorRecovery,
  clearScopedLevelEditorDraft,
  claimLevelEditorClientIdentity,
  isPreservedScopedLevelEditorRecoveryForwarded,
  levelEditorDraftKey,
  listPreservedScopedLevelEditorRecoveries,
  markPreservedScopedLevelEditorRecoveryForwarded,
  preserveScopedLevelEditorRecovery,
  readLevelEditorDraft,
  readScopedLevelEditorDraft,
  serializeLevelEditorDraft,
  retireLevelEditorClientIdentity,
  scopedLevelEditorDraftKey,
  writeLevelEditorDraft,
  writeScopedLevelEditorDraft,
  type LevelEditorDraft,
  type LevelEditorClientIdentity,
  type PreservedScopedLevelEditorRecovery,
  type ScopedLevelEditorDraftIdentity,
} from './levelEditorDraft';
import {
  levelEditorClientLabel,
} from './levelEditorSessionPresentation';
import { levelEditorLevelSignature, normalizedLevelEditorSignature } from './levelEditorSignature';
import { levelEditorRouteIdentity } from './levelEditorRouteIdentity';
import {
  editorDocumentWorkspaceForLevelId,
  isInterruptedByCloudSignOut,
  levelEditorHrefForDocument,
  preservedEditorRecoveryIsRedundant,
  provisionalEditorRecoveryIsRedundant,
  shouldAdoptPreservedEditorBranch,
  shouldOfferPreservedEditorBranch,
  shouldResumeInterruptedCloudSync,
  shouldRestoreLocalEditorRecovery,
} from './levelEditorPersistence';
import { ArtRouteChrome } from './shell/ArtRouteChrome';
import { useSceneParticipant } from './shell/SceneBoundary';
import { loadingMark } from '../diagnostics/loadingTimeline';
import { HomepageBackdrop } from './HomepageBackdrop';
import { useInstalledChromeCss } from './useInstalledChromeCss';
import {
  LevelEditorControlsPanel,
  LevelEditorEventsWorkspace,
  type LevelEditorToolKey,
} from './LevelEditorChromeConsumers';
import {
  brushIconProductionCandidate,
  LEVEL_EDITOR_BRUSH_ICON_SCALED_PRODUCTION_STAGE,
} from './brushIconLiveMedia';
import { InnerChromeBox, ShellControlsPanel, ShellViewportSwap, ShellWorkspace } from './shared/ChromeBox';
import { chromeUnitClassNames } from './chromeUnitRegistry';
import { useWars } from '../war/store';
import { HIS_GRACE_VALUE, expectedWarValue, type ExpectedBattleValue } from '../run/expectedValue';
import {
  directionCompassCells,
  hasDirectionSprite,
  productionUnitAssets,
  rookDirectionLabel,
  rookDirections,
  unitAssets,
  unitAssetById,
  unitArtForId,
  unitFamilyForId,
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
import { featureFrameSrc, featureThumbSrc, fencePostThumbSrc, fenceThumbSrc, tileTopSrc, wallThumbSrc } from '../art/tileset';
import { resolveFeatureOverlays, resolveFencePosts, fenceVertexKey as canonicalFenceVertexKey, roadEdgeKey, isNorthWestBoundaryWallEdge, FEATURE_DIRS, featureMaterials, fenceMaterials, wallMaterials, defaultFenceMaterial, defaultWallMaterial, defaultFeatureMaterial, featureMaterialLabel, fenceMaterialLabel, wallMaterialLabel, type FeatureKind, type FeatureMaterial, type FeatureEdge, type FenceMaterial, type WallMaterial } from '../core/featureAutotile';
import { wallArt, wallArtAtEdge, wallArtBadge, wallArtIdOrDefault, wallArtItems, wallArtLabel, wallArtPlacementSpanAtEdge, wallArtSpanEdges, wallArtSpanForId, type WallArtId } from '../core/wallArt';
import { defaultTerrainFamily, socketEdges, terrainFamiliesForRole, terrainFamilyRecords, type EdgeName, type TileFamilyId } from '../core/tileSockets';
import { generateSocketBoard, solveSocketBoard } from '../core/tileBoardGenerator';
import { playableBorderFenceEdges, playableBorderRoadKeys } from '../core/playableBorder';
import { coverNoise, scatterTerrainDetailed } from '../core/terrainScatter';
import { isPassableTerrain } from '../core/terrain';
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
import { SliderRow, ctlReset } from './dressing/SliderRow';
import { objectBaseZIndex, structureFrontZIndex } from '../render/sceneDepth';
import { groundCoverSet, LEGACY_GROUND_COVER_SEED, type GroundCoverDensity } from '../core/groundCover';
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
import { goSignIn, signInHref } from '../net/auth';
import { refreshAuthSession, reportAuthSessionFailure, useAuthSession } from '../net/authSession';
import { fetchAdminLiveMediaCatalog, type AdminLiveMediaCatalog } from '../net/liveMediaAdmin';
import {
  autosaveEditorDocument,
  autosaveEditorDocumentOnPageHide,
  closeEditorDocumentEditSession,
  createEditorDocument,
  discardEditorDocumentChanges,
  editorDocumentHasDiscardTarget,
  heartbeatEditorDocumentEditSession,
  isEditorDocumentBaselineConflict,
  isEditorDocumentConflict,
  listEditorDocumentRevisions,
  isEditorDocumentEditSessionError,
  loadEditorDocument,
  loadEditorDocumentEditPresence,
  openEditorDocumentEditSession,
  resolveEditorDocument,
  restoreEditorDocumentRevision,
  saveEditorDocument,
  type EditorDocument,
  type EditorDocumentRevisionSummary,
  type EditorDocumentEditFence,
  type EditorDocumentEditPresence,
  type EditorDocumentEditSession,
  type EditorDocumentEditSessionResult,
} from '../net/editorDocuments';
import { consumeNewBuildReloadIntent } from '../net/appUpdate';
import { LEVEL_BATTLE_CARDS_DEALT_DEFAULT, LEVEL_BATTLE_CARDS_DEALT_MAX, LEVEL_BATTLE_CARDS_DEALT_MIN, OBJECTIVE_TYPES, ZONE_COLORS, zoneEntriesOnLevel, type CastleEventAction, type ChessDrawsEventAction, type ConditionSide, type Level, type LevelEvent, type LevelEventAction, type LevelEvents, type ObjectiveType, type VictoryRules, type War, type ZoneColor, type ZoneType } from '../core/level';

import { computeCastleTemplatePairs, type CastleTemplateUnit } from './castlingTemplate';
import { MODE_NAME, DEFAULT_SURVIVE_TURNS, victoryRulesForObjective, kingSideOf } from '../core/objectives';
import { CLOCK_INCREMENT_SECONDS, CLOCK_INITIAL_SECONDS, DEFAULT_TIME_CONTROL, formatClockSeconds, parseClockSeconds, stepLadder } from '../core/clock';
import { validatePlayability, validateWarBattlePlayability } from '../core/playability';
import { PLAYABLE_PIECE_TYPES, type PlayablePieceType } from '../core/pieces';
import { effectiveLevelEvents, normalizeLevelEvents } from '../core/levelEvents';
import { battleSettingsForSave, guardRulesSeed, levelRulesSeed, seededBaselineLevel, type AuthoredRulesField, type LevelRulesSeed } from './levelEditorRulesSeed';
import { ChromeButton, ChromeNavButton } from './shared/ChromeButton';

type BoardUnitPlacement = {
  unitId: string;
  direction: Direction;
  faction: Faction;
};

type MoveSubject =
  | { kind: 'unit'; x: number; y: number }
  | { kind: 'prop'; x: number; y: number; propId: string };

// The authored Deployment deal is a whole card count inside the schema's bounds — the stepper's
// keys and its typed field both land here, so neither can write a level the validator rejects.
const clampCardsDealt = (value: number): number => Math.min(
  LEVEL_BATTLE_CARDS_DEALT_MAX,
  Math.max(LEVEL_BATTLE_CARDS_DEALT_MIN, Math.round(value)),
);
const parseCardsDealt = (raw: string): number | null => {
  const parsed = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(parsed) ? parsed : null;
};

type FencePaintTarget = 'rail' | 'post';
type FenceVertexCorner = 'back' | 'right' | 'front' | 'left';
type LevelEditorAuthorityState = 'not-applicable' | 'checking' | 'writer' | 'follower' | 'displaced' | 'reviewer' | 'error';

type LevelEditorLocalFallbackSnapshot = {
  source: 'browser' | 'route';
  draft: LevelEditorDraft;
  level: Level;
  cloudRevision: number;
  recoveryId?: string;
  recoveryCount: number;
  cleanupIdentity?: ScopedLevelEditorDraftIdentity;
  cleanupRecoveryId?: string;
  cleanupDraftIdentity?: ScopedLevelEditorDraftIdentity;
};

// Bounded, only while an open document is waiting for its owner to sign back in. It covers a
// sign-in completed in another tab, which produces no focus or online event in this one.
const EDITOR_SIGNED_OUT_REPROBE_MS = 20_000;
const EDIT_SESSION_HEARTBEAT_MS = 20_000;
const EDITOR_SHARED_SYNC_POLL_MS = 1_000;
const OFFLINE_LEVEL_EDITOR_OWNER = 'offline-browser@local.invalid';

const SCENIC_TERRAIN_EXTENT_BY_BOARD_EDGE = {
  north: 'top',
  east: 'right',
  south: 'bottom',
  west: 'left',
} as const satisfies Record<EdgeName, keyof DecorativeTerrainExtents>;

const SCENIC_TERRAIN_SIDES: readonly DecorativeTerrainSide[] = socketEdges.map(
  (edge) => SCENIC_TERRAIN_EXTENT_BY_BOARD_EDGE[edge],
);
const MAX_SCENIC_TERRAIN_GENERATION_AREA = 250_000;
type ScenicTerrainGenerationMode = 'match-reference' | 'grass';
const SCENIC_TERRAIN_GENERATION_OPTIONS: ReadonlyArray<{ value: ScenicTerrainGenerationMode; label: string }> = [
  { value: 'match-reference', label: 'Match reference tile' },
  { value: 'grass', label: 'Grass' },
];

const FENCE_VERTEX_CORNERS: ReadonlyArray<{
  id: FenceVertexCorner;
  label: string;
  dx: 0 | 1;
  dy: 0 | 1;
  unitX: 0 | 0.5 | 1;
  unitY: 0 | 0.5 | 1;
  hintTop: string;
}> = [
  { id: 'back', label: 'Back', dx: 0, dy: 0, unitX: 0.5, unitY: 0, hintTop: 'var(--iso-tile-surface-top)' },
  { id: 'right', label: 'Right', dx: 1, dy: 0, unitX: 1, unitY: 0.5, hintTop: 'calc(var(--iso-tile-surface-top) + var(--iso-tile-height) / 2)' },
  { id: 'front', label: 'Front', dx: 1, dy: 1, unitX: 0.5, unitY: 1, hintTop: 'calc(var(--iso-tile-surface-top) + var(--iso-tile-height))' },
  { id: 'left', label: 'Left', dx: 0, dy: 1, unitX: 0, unitY: 0.5, hintTop: 'calc(var(--iso-tile-surface-top) + var(--iso-tile-height) / 2)' },
];

const fenceVertexKey = (x: number, y: number, corner: FenceVertexCorner): string => {
  const target = FENCE_VERTEX_CORNERS.find((candidate) => candidate.id === corner)!;
  return canonicalFenceVertexKey(x + target.dx, y + target.dy);
};

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
  floatingArtwork: placedFloatingArtwork = [],
  macroTiles: placedMacroTiles = [],
  features: placedFeatures = {},
  fences: placedFences = {},
  fencePosts: placedFencePosts = {},
  fenceArtwork,
  walls: placedWalls = {},
  subterrain: placedSubterrain = {},
  wallArt: placedWallArt = {},
  wallArtBrushId,
  cover: placedCover = {},
  coverTypes: placedCoverTypes = {},
  coverSeed = 1234,
  fenceTool = false,
  fencePaintTarget = 'rail',
  wallTool = false,
  subterrainTool = false,
  wallArtTool = false,
  onPaintEdge,
  onEraseEdge,
  onPaintPost,
  onErasePost,
  onPaintWallEdge,
  onEraseWallEdge,
  onPaintSubterrainFace,
  onEraseSubterrainFace,
  onPaintWallArtEdge,
  onEraseWallArtEdge,
  zones: placedZones = {},
  resolveAsset,
  resolveUnit,
  resolveDoodad,
  resolveProp,
  tool,
  selectedCell,
  selectedArtworkId,
  selectedArtworkIds,
  boardZoom,
  boardPan,
  gridScope = 'off',
  cameraBoundary,
  cameraBoundaryEditable = false,
  onCameraBoundaryCommit,
  predrawnOcclusionEnabled = true,
  showPredrawnOcclusionSeed = false,
  predrawnPlate,
  predrawnBackgroundActive = Boolean(predrawnPlate),
  tacticalPreview,
  animationFrame,
  onPaint,
  onErase,
  onSelect,
  onMoveArtwork,
  onMove,
  canMoveTo,
  propBrush,
  artworkEditing = false,
  macroTileBrush,
  hidden,
  regionCells,
  onRegionStart,
  decorativeApron,
  decorativeCells = {},
  decorativeFootprint = [],
  decorativeFences = {}, decorativeFencePosts = {}, decorativeWalls = {},
  allowDecorativeEditing = false,
  onTerrainFirstFrame,
  onSceneFirstFrame,
  onFrameError,
}: {
  cols: number;
  rows: number;
  cells: Record<string, string>;
  units: Record<string, BoardUnitPlacement>;
  doodads: Record<string, { doodadId: string }>;
  /** Multi-cell props keyed by ANCHOR cell "x,y" -> {propId}. */
  props?: Record<string, { propId: string }>;
  floatingArtwork?: readonly FloatingArtworkPlacement[];
  /** Opaque multi-cell terrain tops that replace the covered 1x1 top sprites. */
  macroTiles?: readonly MacroTilePlacement[];
  /** Linear-feature overlays (roads + rivers) keyed by "x,y" -> {kind, material, mask}. */
  features?: Record<string, { kind: FeatureKind; material: FeatureMaterial; mask: number }>;
  /** Edge fences keyed by shared-edge key (roadEdgeKey) -> fence material — drawn as edge rails. */
  fences?: Record<string, FenceMaterial>;
  /** Positive authored fence posts keyed by logical grid vertex "x,y" -> material. */
  fencePosts?: Record<string, FenceMaterial>;
  /** Exact route-gated artwork kit; geometry remains ordinary wood/stone board data. */
  fenceArtwork?: FenceArtKit;
  /** Edge walls keyed by shared-edge key (roadEdgeKey) -> material; valid only on the north/west map perimeter. */
  walls?: Record<string, WallMaterial>;
  subterrain?: SubterrainPlacementMap;
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
  /** Which fence primitive the fence brush targets: a diamond edge rail or a logical grid vertex post. */
  fencePaintTarget?: FencePaintTarget;
  /** When true, the brush paints EDGES (walls) not cells: hover picks the nearest diamond edge. */
  wallTool?: boolean;
  subterrainTool?: boolean;
  /** When true, the brush paints EDGES (wall art) not cells: hover picks the nearest diamond edge. */
  wallArtTool?: boolean;
  /** Add a fence on an edge; boundary edges use one off-board endpoint. */
  onPaintEdge?: (edgeKey: string) => void;
  /** Remove a fence from an edge. */
  onEraseEdge?: (edgeKey: string) => void;
  /** Add an authored post at a logical grid vertex. */
  onPaintPost?: (vertexKey: string) => void;
  /** Remove only the authored post at a vertex; an automatic open-end post may remain. */
  onErasePost?: (vertexKey: string) => void;
  /** Add a wall on an edge; only the northmost and westmost map edges render. */
  onPaintWallEdge?: (edgeKey: string) => void;
  /** Remove a wall from an edge. */
  onEraseWallEdge?: (edgeKey: string) => void;
  onPaintSubterrainFace?: (x: number, y: number, face: 'south' | 'east') => void;
  onEraseSubterrainFace?: (x: number, y: number, face: 'south' | 'east') => void;
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
  selectedArtworkId?: string | null;
  /** Every selected Scene Art instance. Each one outlines, and the Move tool drags them together. */
  selectedArtworkIds?: readonly string[];
  boardZoom: number;
  boardPan: { x: number; y: number };
  gridScope?: 'off' | 'playable' | 'whole';
  cameraBoundary?: BoardCameraBounds | null;
  cameraBoundaryEditable?: boolean;
  onCameraBoundaryCommit?: (bounds: BoardCameraBounds) => void;
  /** Before/after proof switch for the automatic plate occlusion pass. */
  predrawnOcclusionEnabled?: boolean;
  /** Review the deterministic fence/prop/wall alpha proposal over a registered plate. */
  showPredrawnOcclusionSeed?: boolean;
  /** Complete board illustration; when present the baked terrain/prop/barrier pixels are not drawn. */
  predrawnPlate?: PredrawnBoardPlate;
  /** The saved AI mode suppresses legacy environment pixels even when its artwork is unavailable. */
  predrawnBackgroundActive?: boolean;
  tacticalPreview?: BoardTacticalPreview;
  animationFrame: number;
  onPaint: (x: number, y: number) => void;
  onErase: (x: number, y: number) => void;
  onSelect: (x: number, y: number) => void;
  onMoveArtwork?: (id: string, to: { pixelX: number; pixelY: number }) => void;
  /** Move tool: drag a placed unit or prop to another cell (drop cancelled if omitted). */
  onMove?: (subject: MoveSubject, to: { x: number; y: number }) => void;
  /** Move tool: whether a held object may drop on (x,y) — drives the destination ring's colour. */
  canMoveTo?: (subject: MoveSubject, to: { x: number; y: number }) => boolean;
  /** When the prop brush is armed: its def + a placeability test, used for the footprint hover. */
  propBrush?: { def: PropDef; canPlaceAt: (ax: number, ay: number) => boolean } | null;
  /** Artwork-layer interaction is object-only; tile, prop, and doodad targets stand down. */
  artworkEditing?: boolean;
  /** When a composite terrain brush is armed, preview its full footprint at the hovered anchor. */
  macroTileBrush?: MacroTileAsset | null;
  /** Per-layer visibility — a true value hides that layer's elements on the board. */
  hidden?: { tile: boolean; unit: boolean; doodad: boolean };
  /** Cells currently selected ("x,y" keys) — drawn as a tinted diamond overlay. */
  regionCells?: Set<string>;
  /** Region tool: click a tile to select its whole connected same-terrain patch. */
  onRegionStart?: (x: number, y: number) => void;
  /** Draw visual-only terrain beyond the tactical grid for art handoff. */
  decorativeApron: DecorativeTerrainExtents;
  decorativeCells?: Record<string, string>;
  decorativeFootprint?: readonly string[];
  decorativeFences?: Record<string, FenceMaterial>;
  decorativeFencePosts?: Record<string, FenceMaterial>;
  decorativeWalls?: Record<string, WallMaterial>;
  allowDecorativeEditing?: boolean;
  onTerrainFirstFrame?: () => void;
  onSceneFirstFrame?: () => void;
  onFrameError?: (error: unknown) => void;
}): ReactElement {
  const paintingRef = useRef(false);
  const [hoverCell, setHoverCell] = useState<{ x: number; y: number } | null>(null);
  // The unit/prop picked up under the Move tool, held while the pointer drags to a destination.
  // It's state (not a ref) so source/target highlights re-render as you drag.
  const [movingFrom, setMovingFrom] = useState<MoveSubject | null>(null);
  // Fence painting previews either the nearest diamond side (rail) or nearest logical corner
  // (post). A shared corner canonicalizes to one vertex key from every adjoining tile.
  const [hoverEdge, setHoverEdge] = useState<{ x: number; y: number; edge: FeatureEdge } | null>(null);
  const [hoverPost, setHoverPost] = useState<{ x: number; y: number; corner: FenceVertexCorner } | null>(null);
  const [artworkDrag, setArtworkDrag] = useState<{
    id: string;
    pointerId: number;
    startClientX: number;
    startClientY: number;
    origin: { pixelX: number; pixelY: number };
    point: { pixelX: number; pixelY: number };
  } | null>(null);
  const fencePostTool = fenceTool && fencePaintTarget === 'post';
  const placementTargetTool = fenceTool || wallTool || wallArtTool || subterrainTool;
  useEffect(() => {
    setHoverEdge(null);
    setHoverPost(null);
  }, [fencePaintTarget]);
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
  // Normalize against the hit diamond before comparing distances. Its rendered frame is wider
  // than it is tall, so raw screen-pixel distance would make Back/Front swallow the side corners.
  const vertexAtPointer = (e: { currentTarget: Element; clientX: number; clientY: number }): FenceVertexCorner => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - rect.left) / (rect.width || 1);
    const py = (e.clientY - rect.top) / (rect.height || 1);
    let nearest = FENCE_VERTEX_CORNERS[0];
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const candidate of FENCE_VERTEX_CORNERS) {
      const dx = px - candidate.unitX;
      const dy = py - candidate.unitY;
      const distance = dx * dx + dy * dy;
      if (distance < nearestDistance) {
        nearest = candidate;
        nearestDistance = distance;
      }
    }
    return nearest.id;
  };
  // Toggle an edge barrier on the diamond edge under the cursor (Brush adds; Erase removes).
  const applyBarrierAt = (x: number, y: number, edge: FeatureEdge, erasing: boolean): void => {
    if (subterrainTool) {
      if (edge !== 'E' && edge !== 'S') return;
      const face = edge === 'E' ? 'east' : 'south';
      if (erasing) onEraseSubterrainFace?.(x, y, face);
      else onPaintSubterrainFace?.(x, y, face);
      return;
    }
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
  const applyFencePostAt = (x: number, y: number, corner: FenceVertexCorner, erasing: boolean): void => {
    const key = fenceVertexKey(x, y, corner);
    if (erasing) onErasePost?.(key);
    else onPaintPost?.(key);
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
    setHoverPost(null);
    const { key } = edgeTarget(x, y, edge);
    if ((wallTool || wallArtTool) && !isNorthWestBoundaryWallEdge(key, { cols, rows })) {
      setHoverEdge(null);
      return;
    }
    if (subterrainTool && edge !== 'E' && edge !== 'S') { setHoverEdge(null); return; }
    setHoverEdge({ x, y, edge });
  };
  const hoverFencePost = (x: number, y: number, corner: FenceVertexCorner): void => {
    setHoverEdge(null);
    setHoverPost({ x, y, corner });
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
  const scenicCoordinates = decorativeTerrainApronCoordinates(
    cols,
    rows,
    decorativeApron,
    decorativeFootprint,
  );
  const scenicCoordinateKeys = new Set(scenicCoordinates.map(({ x, y }) => `${x},${y}`));
  const scenicContains = (x: number, y: number): boolean => scenicCoordinateKeys.has(`${x},${y}`);
  const visibleTerrainAssetIdAt = (x: number, y: number): string | undefined => {
    if (!scenicContains(x, y)) return undefined;
    return scenicTerrainValueAt(
      x,
      y,
      cols,
      rows,
      (sourceX, sourceY) => {
        const id = placed[`${sourceX},${sourceY}`];
        return id && resolveAsset(id) ? id : undefined;
      },
      (authoredX, authoredY) => {
        const id = decorativeCells[`${authoredX},${authoredY}`];
        return id && resolveAsset(id) ? id : undefined;
      },
    );
  };
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const key = `${x},${y}`;
      const assetId = placed[key];
      const asset = assetId ? resolveAsset(assetId) : undefined;
      const sideExposure = resolveTerrainSideExposure(
        { x, y },
        (nextX, nextY) => scenicContains(nextX, nextY) && (nextX < 0 || nextX >= cols || nextY < 0 || nextY >= rows)
          ? Boolean(visibleTerrainAssetIdAt(nextX, nextY))
          : occupiedTiles.has(`${nextX},${nextY}`),
      );
      const sideMaterials = Object.fromEntries((['south', 'east'] as const).flatMap((face) => {
        const material = placedSubterrain[subterrainFaceKey(x, y, face)];
        return material ? [[face, subterrainMaterialSrc(material)]] : [];
      }));
      terrainCells.push(studioTerrainCanvasCell({
        key,
        x,
        y,
        tileAsset: asset,
        feature: placedFeatures[key],
        animationFrame,
        hidden,
        sideExposure,
        sideMaterials,
      }));
      const isSelected = !artworkEditing && selectedCell?.x === x && selectedCell?.y === y;
      // Move-tool feedback reuses the built-in diamond tile-ring (not an axis-aligned box): the
      // picked-up object's footprint, plus the cell under the cursor tinted by whether a drop is legal.
      const movingCells = movingFootprintCells(movingFrom);
      const isMoveFrom = tool === 'move' && movingCells.has(key);
      const isMoveTo = tool === 'move' && !!movingFrom && !isMoveFrom && hoverCell?.x === x && hoverCell?.y === y;
      const moveDroppable = isMoveTo && movingFrom ? (canMoveTo ? canMoveTo(movingFrom, { x, y }) : true) : false;
      const fenceHere = placementTargetTool && !fencePostTool && hoverEdge?.x === x && hoverEdge?.y === y ? hoverEdge.edge : null;
      const postHere = fencePostTool && hoverPost?.x === x && hoverPost?.y === y
        ? FENCE_VERTEX_CORNERS.find((corner) => corner.id === hoverPost.corner) ?? null
        : null;
      const tacticalState = !artworkEditing && tacticalPreview ? [
        tacticalPreview.promotionZoneSet.has(key) ? 'is-promotion-zone' : '',
        tacticalPreview.moveSet.has(key) ? 'is-move' : '',
        tacticalPreview.threatSet.has(key) ? 'is-threat' : '',
        tacticalPreview.blockedSet.has(key) ? 'is-blocked-candidate' : '',
        tacticalPreview.focusKey === key ? 'is-focused-piece' : '',
      ].filter(Boolean).join(' ') : '';
      const visualFootprintStyle = predrawnBackgroundActive
        ? predrawnVisualFootprintClipStyleForCell(predrawnPlate?.surface, key)
        : undefined;
      cells.push({
        key,
        x,
        y,
        className: `tileset-placement-cell ${asset ? '' : 'is-empty'} ${isSelected ? 'is-selected' : ''}`.trim(),
        style: visualFootprintStyle as CSSProperties | undefined,
        children: (
          <>
            {/* Zone tint: a translucent diamond seated on the tile EQUATOR — it reuses the exact
                seating of the selection ring (top: --iso-tile-surface-top + the diamond clip-path),
                which is the fix for the recurring "overlay sits at iso-tile-height/2, not y69" bug. */}
            {!artworkEditing && placedZones[key] ? <span className={`le-zone-cell le-zone-${placedZones[key]}`} aria-hidden="true" /> : null}
            {/* Fence edge hint: highlight the diamond side under the cursor so you see where the rail
                lands before clicking. The SVG is seated exactly like the hit diamond (surface-top). */}
            {fenceHere ? (
              <svg className="le-fence-edge-hint" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                <line x1={EDGE_LINE[fenceHere][0]} y1={EDGE_LINE[fenceHere][1]} x2={EDGE_LINE[fenceHere][2]} y2={EDGE_LINE[fenceHere][3]} />
              </svg>
            ) : null}
            {postHere ? (
              <span
                className="le-fence-post-hint"
                style={{ left: `${postHere.unitX * 100}%`, top: postHere.hintTop }}
                aria-hidden="true"
              />
            ) : null}
            {tacticalState ? (
              <span
                className={`le-tactical-cell ${tacticalState}`}
                style={visualFootprintStyle as CSSProperties | undefined}
                aria-hidden="true"
              >
                <PredrawnMoveHighlightPaint />
              </span>
            ) : null}
            {isSelected ? <span className="tileset-cell-ring" aria-hidden="true" /> : null}
            {isMoveFrom ? <span className="tileset-cell-ring is-move-from" aria-hidden="true" /> : null}
            {isMoveTo ? <span className={`tileset-cell-ring ${moveDroppable ? 'is-move-ok' : 'is-move-blocked'}`} aria-hidden="true" /> : null}
            <span
              className="tileset-cell-hit"
              style={artworkEditing ? { pointerEvents: 'none' } : undefined}
              onPointerDown={(event) => {
                if (event.button !== 0) return; // non-primary input belongs to ViewPane panning
                event.stopPropagation(); // don't let the ViewPane start a pan while editing
                if (placementTargetTool && (tool === 'brush' || tool === 'erase')) {
                  if (fencePostTool) applyFencePostAt(x, y, vertexAtPointer(event), tool === 'erase');
                  else applyBarrierAt(x, y, edgeAtPointer(event), tool === 'erase');
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
              onPointerEnter={() => { setHoverCell({ x, y }); if (!placementTargetTool && paintingRef.current) applyTool(x, y); }}
              onPointerMove={placementTargetTool ? (event) => {
                if (fencePostTool) hoverFencePost(x, y, vertexAtPointer(event));
                else hoverBarrierEdge(x, y, edgeAtPointer(event));
              } : undefined}
              onPointerUp={(event) => {
                if (tool === 'move' && movingFrom) {
                  event.stopPropagation();
                  finishMoveAt({ x, y });
                }
              }}
            />
          </>
        ),
      });
    }
  }

  // Scenic and playable terrain share one depth order. Freeze the combined review surface so a
  // large authored rectangle remains a stable, inexpensive art-handoff frame.
  const authoredApron = new Map<string, TerrainCanvasCell>();
  for (const [key, assetId] of Object.entries(decorativeCells)) {
    const [x, y] = key.split(',').map(Number);
    const asset = resolveAsset(assetId);
    if (!asset || !scenicContains(x, y) || (x >= 0 && x < cols && y >= 0 && y < rows)) continue;
    authoredApron.set(key, {
      ...studioTerrainCanvasCell({ key: `decorative:${key}`, x, y, tileAsset: asset, feature: placedFeatures[key], animationFrame: 0, hidden, sideExposure: resolveTerrainSideExposure({ x, y }, () => true) }),
      animate: false,
    });
  }
  const apronTerrainCellsWithoutSides = withDecorativeTerrainFeatures(
    decorativeTerrainApronCells(terrainCells, cols, rows, decorativeApron, authoredApron, decorativeFootprint),
    placedFeatures,
    (feature) => featureFrameSrc(feature.kind, feature.material, feature.mask),
  );
  const renderedTerrainKeys = new Set([
    ...terrainCells.filter((cell) => cell.topSrc).map((cell) => `${cell.x},${cell.y}`),
    ...apronTerrainCellsWithoutSides.filter((cell) => cell.topSrc).map((cell) => `${cell.x},${cell.y}`),
  ]);
  const apronTerrainCells = apronTerrainCellsWithoutSides.map((cell) => ({
    ...cell,
    sideFaces: resolveTerrainSideFaces(
      resolveTerrainSideExposure(cell, (nextX, nextY) => renderedTerrainKeys.has(`${nextX},${nextY}`)),
      Object.fromEntries((['south', 'east'] as const).flatMap((face) => {
        const material = placedSubterrain[subterrainFaceKey(cell.x, cell.y, face)];
        return material ? [[face, subterrainMaterialSrc(material)]] : [];
      })) as TerrainSideMaterials<string>,
    ),
  }));
  const scenicTerrainCells = scenicTerrainRenderCells(terrainCells, apronTerrainCells);
  for (const coordinate of scenicCoordinates) {
    const key = `${coordinate.x},${coordinate.y}`;
    const fenceHere = placementTargetTool && !fencePostTool && hoverEdge?.x === coordinate.x && hoverEdge?.y === coordinate.y ? hoverEdge.edge : null;
    const postHere = fencePostTool && hoverPost?.x === coordinate.x && hoverPost?.y === coordinate.y
      ? FENCE_VERTEX_CORNERS.find((corner) => corner.id === hoverPost.corner) ?? null
      : null;
    // Props live out here too, so scenic cells carry the same move-tool feedback as playable ones:
    // the held object's footprint, plus the drop cell tinted by whether the drop is legal.
    const scenicMovingCells = movingFootprintCells(movingFrom);
    const isScenicMoveFrom = tool === 'move' && scenicMovingCells.has(key);
    const isScenicMoveTo = tool === 'move' && !!movingFrom && !isScenicMoveFrom
      && hoverCell?.x === coordinate.x && hoverCell?.y === coordinate.y;
    const scenicMoveDroppable = isScenicMoveTo && movingFrom
      ? (canMoveTo ? canMoveTo(movingFrom, { x: coordinate.x, y: coordinate.y }) : true)
      : false;
    cells.push({
      key: `decorative-hit:${key}`,
      x: coordinate.x,
      y: coordinate.y,
      className: 'tileset-placement-cell is-decorative',
      data: { 'data-board-x': coordinate.x, 'data-board-y': coordinate.y, 'data-decorative-cell': 'true' },
      children: (
        <>
          {isScenicMoveFrom ? <span className="tileset-cell-ring is-move-from" aria-hidden="true" /> : null}
          {isScenicMoveTo ? <span className={`tileset-cell-ring ${scenicMoveDroppable ? 'is-move-ok' : 'is-move-blocked'}`} aria-hidden="true" /> : null}
          {fenceHere ? (
            <svg className="le-fence-edge-hint" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <line x1={EDGE_LINE[fenceHere][0]} y1={EDGE_LINE[fenceHere][1]} x2={EDGE_LINE[fenceHere][2]} y2={EDGE_LINE[fenceHere][3]} />
            </svg>
          ) : null}
          {postHere ? (
            <span
              className="le-fence-post-hint"
              style={{ left: `${postHere.unitX * 100}%`, top: postHere.hintTop }}
              aria-hidden="true"
            />
          ) : null}
          {tool === 'region' || tool === 'move' || allowDecorativeEditing ? (
            <span
              className="tileset-cell-hit"
              style={artworkEditing ? { pointerEvents: 'none' } : undefined}
              onPointerDown={(event) => {
                if (event.button !== 0) return;
                event.stopPropagation();
                if (tool === 'region') onRegionStart?.(coordinate.x, coordinate.y);
                else if (placementTargetTool && (tool === 'brush' || tool === 'erase')) {
                  if (fencePostTool) { applyFencePostAt(coordinate.x, coordinate.y, vertexAtPointer(event), tool === 'erase'); return; }
                  const edge = edgeAtPointer(event);
                  if (wallTool && edge !== 'N' && edge !== 'W') return;
                  applyBarrierAt(coordinate.x, coordinate.y, edge, tool === 'erase');
                } else if (tool === 'move') {
                  // Scenic cells hold props too, so the Move tool picks one up out here exactly as
                  // it does on the playable board. Units never leave the playable rectangle.
                  const prop = propAtCell(coordinate.x, coordinate.y);
                  if (prop) setMovingFrom(prop);
                  setHoverCell({ x: coordinate.x, y: coordinate.y });
                } else if (tool === 'brush') {
                  paintingRef.current = true;
                  onPaint(coordinate.x, coordinate.y);
                }
                else if (tool === 'erase') { paintingRef.current = true; onErase(coordinate.x, coordinate.y); }
              }}
              onPointerEnter={() => {
                // The prop brush ghosts its footprint at the hovered cell, so scenic cells report
                // hover the same way playable ones do.
                setHoverCell({ x: coordinate.x, y: coordinate.y });
                if (placementTargetTool || !paintingRef.current) return;
                if (tool === 'brush') onPaint(coordinate.x, coordinate.y);
                else if (tool === 'erase') onErase(coordinate.x, coordinate.y);
              }}
              onPointerMove={placementTargetTool ? (event) => {
                if (fencePostTool) hoverFencePost(coordinate.x, coordinate.y, vertexAtPointer(event));
                else hoverBarrierEdge(coordinate.x, coordinate.y, edgeAtPointer(event));
              } : undefined}
              onPointerUp={(event) => {
                if (tool === 'move' && movingFrom) {
                  event.stopPropagation();
                  finishMoveAt({ x: coordinate.x, y: coordinate.y });
                  return;
                }
                paintingRef.current = false;
              }}
            />
          ) : null}
        </>
      ),
    });
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
            if (event.button !== 0) return;
            event.preventDefault();
            event.stopPropagation();
            apply(tool === 'erase');
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            apply(tool === 'erase');
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
          style={{ position: 'absolute', left, top, zIndex: objectBaseZIndex({ x: cx, y: cy }) + 2, width: 54, height: 88, transform: 'translate(-50%, -75%)', pointerEvents: artworkEditing || tool === 'brush' || tool === 'move' || movingFrom ? 'none' : 'auto' }}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.stopPropagation();
            if (tool !== 'select') paintingRef.current = true;
            applyTool(cx, cy);
          }}
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
          pointerEvents: artworkEditing || tool === 'brush' || movingFrom ? 'none' : 'auto',
        }}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.stopPropagation();
          if (tool === 'move') {
            setMovingFrom({ kind: 'prop', x: ax, y: ay, propId: placement.propId });
            setHoverCell({ x: ax, y: ay });
            return;
          }
          if (tool !== 'select') paintingRef.current = true;
          applyTool(ax, ay);
        }}
      />,
    );
  }

  if (artworkEditing) {
    for (const [index, placement] of placedFloatingArtwork.entries()) {
      const selected = selectedArtworkIds
        ? selectedArtworkIds.includes(placement.id)
        : placement.id === selectedArtworkId;
      const canMove = tool === 'move' && selected;
      const interactive = canMove;
      const sourceSprite = structureArtDirectionSprite(placement.sourceArtId, placement.direction);
      const sourceScale = sourceSprite ? sourceSprite.scale * placement.scale : 1;
      const hitWidth = sourceSprite ? Math.max(54, sourceSprite.w * sourceScale) : 54;
      const hitHeight = sourceSprite ? Math.max(88, sourceSprite.h * sourceScale) : 88;
      overlaySprites.push(
        <span
          key={`artwork-hit-${placement.id}`}
          role={interactive ? 'button' : undefined}
          tabIndex={interactive ? 0 : undefined}
          className={`tileset-doodad-hit le-floating-artwork-hit${selected ? ' is-selected' : ''}`}
          aria-pressed={selected}
          aria-label={interactive
            ? `Move ${structureArtAsset(placement.sourceArtId)?.label ?? placement.sourceArtId}`
            : undefined}
          // The object-sized target draws only the selected-instance outline. It carries no tile,
          // footprint, contact marker, or board-depth meaning.
          style={{
            position: 'absolute',
            left: placement.pixelX,
            top: placement.pixelY,
            width: hitWidth,
            height: hitHeight,
            padding: 0,
            border: 0,
            background: 'transparent',
            transform: 'translate(-50%, -50%)',
            pointerEvents: interactive ? 'auto' : 'none',
            cursor: canMove ? 'grab' : 'default',
            touchAction: 'none',
            zIndex: 1_100_000 + index,
          }}
          onPointerDown={(event) => {
            if (event.button !== 0 || !interactive) return;
            event.preventDefault();
            event.stopPropagation();
            event.currentTarget.setPointerCapture(event.pointerId);
            setArtworkDrag({
              id: placement.id,
              pointerId: event.pointerId,
              startClientX: event.clientX,
              startClientY: event.clientY,
              origin: { pixelX: placement.pixelX, pixelY: placement.pixelY },
              point: { pixelX: placement.pixelX, pixelY: placement.pixelY },
            });
          }}
          onPointerMove={(event) => {
            if (!artworkDrag || artworkDrag.id !== placement.id || artworkDrag.pointerId !== event.pointerId) return;
            event.stopPropagation();
            setArtworkDrag({
              ...artworkDrag,
              point: {
                pixelX: Math.round(artworkDrag.origin.pixelX + (event.clientX - artworkDrag.startClientX) / boardZoom),
                pixelY: Math.round(artworkDrag.origin.pixelY + (event.clientY - artworkDrag.startClientY) / boardZoom),
              },
            });
          }}
          onPointerUp={(event) => {
            if (!artworkDrag || artworkDrag.id !== placement.id || artworkDrag.pointerId !== event.pointerId) return;
            event.preventDefault();
            event.stopPropagation();
            event.currentTarget.releasePointerCapture(event.pointerId);
            onMoveArtwork?.(placement.id, artworkDrag.point);
            setArtworkDrag(null);
          }}
          onPointerCancel={() => setArtworkDrag(null)}
        />
      );
    }
  }

  // Footprint hover preview for the prop brush: outline every cell the prop would occupy under the
  // cursor (placeable vs blocked), and ghost the PropSprite at the anchor so the author sees both
  // where it lands and what it looks like before committing.
  if (propBrush && tool === 'brush' && hoverCell) {
    const { def } = propBrush;
    const placeable = propBrush.canPlaceAt(hoverCell.x, hoverCell.y);
    for (const c of propCells(hoverCell.x, hoverCell.y, def)) {
      // Outline every footprint cell that has authored ground under it — playable or scenic. A cell
      // past the scenic rectangle has no tile to outline; `placeable` is already false there.
      const onBoard = c.x >= 0 && c.x < cols && c.y >= 0 && c.y < rows;
      if (!onBoard && !scenicContains(c.x, c.y)) continue;
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
            ...(predrawnBackgroundActive
              ? predrawnVisualFootprintClipStyleForCell(
                  predrawnPlate?.surface,
                  `${c.x},${c.y}`,
                ) as CSSProperties | undefined
              : undefined),
            // Match the tile's top-face diamond (stepX/stepY*2), centred on the projected
            // equator point — same shape/seating as the prop-lab guide and the zone/selection
            // overlays. A rectangle here (the old 96×55 box + outline) reads as "off the grid".
            width: TILE_TEMPLATE.stepX * 2,
            height: TILE_TEMPLATE.stepY * 2,
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
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
                ...(predrawnBackgroundActive
                  ? predrawnVisualFootprintClipStyleForCell(
                      predrawnPlate?.surface,
                      `${x},${y}`,
                    ) as CSSProperties | undefined
                  : undefined),
                width: TILE_TEMPLATE.stepX * 2,
                height: TILE_TEMPLATE.stepY * 2,
                transform: 'translate(-50%, -50%)',
                pointerEvents: 'none',
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

  // Registration is defined against the tactical grid. A scenic apron may coexist in persisted
  // editor data, but it must not change the plate's alignment or add rows to its review overlay.
  const playableGridCells = cells.filter(
    (cell) => cell.x >= 0 && cell.x < cols && cell.y >= 0 && cell.y < rows,
  );
  const predrawnGridCells = predrawnPlate ? playableGridCells : cells;

  const sceneBoard: EditorBoard = {
    cols,
    rows,
    decorativeApron,
    decorativeCells,
    decorativeFootprint: [...decorativeFootprint],
    decorativeFences,
    decorativeFencePosts,
    decorativeWalls,
    cells: placed,
    surface: predrawnPlate?.surface && ('slot' in predrawnPlate.surface || 'schemaVersion' in predrawnPlate.surface)
      ? predrawnPlate.surface as PredrawnBoardSurface
      : undefined,
    macroTiles: [...placedMacroTiles],
    units: placedUnits,
    doodads: placedDoodads,
    props: placedProps,
    // Live drag preview. Dragging one member of a selection previews the whole selection sliding
    // by the same offset, so what the author releases is what they watched move.
    floatingArtwork: placedFloatingArtwork.map((placement) => {
      if (!artworkDrag) return placement;
      const dx = artworkDrag.point.pixelX - artworkDrag.origin.pixelX;
      const dy = artworkDrag.point.pixelY - artworkDrag.origin.pixelY;
      if (artworkDrag.id === placement.id) return { ...placement, ...artworkDrag.point };
      const grouped = selectedArtworkIds?.includes(artworkDrag.id)
        && selectedArtworkIds.includes(placement.id);
      return grouped
        ? { ...placement, pixelX: placement.pixelX + dx, pixelY: placement.pixelY + dy }
        : placement;
    }),
    cover: placedCover,
    coverTypes: placedCoverTypes,
    features: placedFeatures as EditorBoard['features'],
    fences: placedFences,
    fencePosts: placedFencePosts,
    walls: placedWalls,
    wallArt: placedWallArt,
    subterrain: placedSubterrain,
    featureCuts: {},
    featureExits: {},
    zones: {},
  };
  return (
    <TileGrid
      cells={cells}
      originCells={playableGridCells}
      className={`tileset-placement-board is-tool-${tool}`}
      ariaLabel="Editable tile board"
      boardZoom={boardZoom}
      boardPan={boardPan}
      renderCellOverlay={regionCells && regionCells.size > 0
        ? (cell) => {
          const key = `${cell.x},${cell.y}`;
          return regionCells.has(key)
            ? (
              <span
                className="le-region-cell"
                aria-hidden="true"
              />
            )
            : null;
        }
        : undefined}
      backgroundLayer={(
        <>
          {predrawnPlate && predrawnBackgroundActive && !hidden?.tile
            ? <PredrawnBoardLayer plate={predrawnPlate} cells={predrawnGridCells} />
            : !predrawnBackgroundActive
              ? <BoardTerrainLayer
                  cells={scenicTerrainCells}
                  macroTiles={hidden?.tile ? [] : terrainCanvasMacroTiles(placedMacroTiles)}
                  onFirstFrame={onTerrainFirstFrame}
                  onFrameError={onFrameError}
                />
              : null}
          <BoardSceneLayer
            board={sceneBoard}
            hidden={hidden}
            coverSeed={coverSeed}
            ambientCover={false}
            omitTerrain
            predrawnBackgroundActive={predrawnBackgroundActive}
            predrawnOcclusion={predrawnOcclusionEnabled}
            transformOps={fenceArtwork ? ((ops, board) => transformFenceArtReviewOps(ops, board, fenceArtwork)) : undefined}
            onFirstFrame={onSceneFirstFrame}
            onFrameError={onFrameError}
          />
          {predrawnPlate && showPredrawnOcclusionSeed
            ? <PredrawnOcclusionSeedLayer board={sceneBoard} />
            : null}
        </>
      )}
      onPointerUp={endInteraction}
      onPointerLeave={() => { setMovingFrom(null); paintingRef.current = false; setHoverCell(null); setHoverEdge(null); setHoverPost(null); }}
    >
      {predrawnPlate && gridScope !== 'off'
        ? <BoardGridLayer cells={predrawnReviewGridCells(predrawnGridCells, predrawnPlate.registration)} />
        : gridScope === 'playable'
          ? <BoardGridLayer cells={terrainCells} />
          : gridScope === 'whole'
            ? <BoardGridLayer cells={cells} />
            : null}
      {overlaySprites}
      {cameraBoundary ? (
        <CameraBoundaryOverlay
          board={{ cols, rows }}
          bounds={cameraBoundary}
          editorZoom={boardZoom}
          editable={cameraBoundaryEditable}
          onCommit={onCameraBoundaryCommit ?? (() => undefined)}
        />
      ) : null}
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
const leTileGroups = () => studioFamilies.map((family) => ({ family, tiles: family.assets.filter((asset) => asset.kind === 'tile') }));
const leTileAssets = () => leTileGroups().flatMap(({ tiles }) => tiles);
const leFamilyAssets = () => studioFamilies.reduce((acc, family) => {
  acc[family.id] = family.assets.filter((asset) => asset.kind === 'tile');
  return acc;
}, {} as Record<TileFamilyId, readonly StudioAsset[]>);
const leAllTiles = () => studioFamilies.flatMap((family) => family.assets);
const leDefaultTile = (): StudioAsset => {
  const family = studioFamilies.find((candidate) => candidate.id === defaultTerrainFamily().id);
  const tile = family?.assets.find((asset) => asset.kind === 'tile') ?? family?.assets[0];
  if (!tile) throw new Error('drawable catalog has no terrain surfaces');
  return tile;
};
const leFamilyOfTile = (id: string): StudioFamily | undefined => studioFamilies.find((family) => family.assets.some((asset) => asset.id === id));
const leMacroTileFootprints = (): string[] => [...new Set(macroTileAssets.map((asset) => `${asset.columns}x${asset.rows}`))];
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
const leScatterFamilies = () => terrainFamiliesForRole('level-editor-scatter');
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
const defaultScatterRows = (): ScatterRow[] => {
  const defaults = terrainFamilyRecords().filter((family) => typeof family.scatterDefaultShare === 'number' && family.scatterDefaultShare > 0);
  if (!defaults.length || defaults.reduce((sum, family) => sum + family.scatterDefaultShare!, 0) !== 100) {
    throw new Error('drawable catalog requires terrain scatter defaults totaling 100');
  }
  return defaults.map((family, index) => ({
    id: index,
    terrain: family.id,
    share: family.scatterDefaultShare!,
    locked: false,
    covers: family.defaultGroundCoverId && isGroundCoverId(family.defaultGroundCoverId)
      ? [{ id: index + 1, type: family.defaultGroundCoverId, expanded: false, knobs: { ...DEFAULT_COVER } }]
      : [],
    macroTileDensity: DEFAULT_MACRO_TILE_DENSITY,
    macroTileBreakup: DEFAULT_MACRO_TILE_BREAKUP,
  }));
};
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
/**
 * Every patch of ground a saved Town or Forest occupies.
 *
 * Instances saved before shift-drag existed carry only `bounds`, which IS the one-rectangle case,
 * so there is nothing to migrate — the fallback is the old meaning stated explicitly.
 */
const generatorInstanceAreas = (
  instance: { bounds: TownBounds; areas?: readonly TownBounds[] },
): readonly TownBounds[] => (instance.areas?.length ? instance.areas : [instance.bounds]);
/** A live Town/Forest drag: the rectangle under the pointer, and whether it EXTENDS the selection. */
type PlacementDrag = { area: TownBounds; additive: boolean };
type PlacementDragOrigin = { pointerId: number; cellX: number; cellY: number; additive: boolean };
/**
 * The saved `bounds`/`areas` pair for a new ground union.
 *
 * `bounds` is derived from the patches rather than authored, so it can never disagree with them,
 * and a single patch stays a plain rectangle — the shape every instance placed before shift-drag
 * existed already has.
 */
const generatorAreaChange = (
  areas: readonly TownBounds[],
): { bounds: TownBounds; areas?: TownBounds[] } => {
  const kept = normalizeGeneratorAreas([...areas]);
  return { bounds: generatorAreasBounds(kept), areas: kept.length > 1 ? kept : undefined };
};
/**
 * How much ground an instance holds, in the terms the author dragged it out in.
 *
 * A single rectangle keeps reading as its two sides, because that is the shape it is. Several
 * patches have no width and height worth quoting — the bounding box would name ground the town
 * does not own — so they report how many patches and how many tiles those actually cover.
 */
const placementGroundLabel = (areas: readonly TownBounds[]): string => {
  if (areas.length === 1) {
    const [area] = areas;
    return `${Math.abs(area.maxX - area.minX)}×${Math.abs(area.maxY - area.minY)} tiles`;
  }
  return `${areas.length} areas · ${generatorAreasCellCount(areas)} tiles`;
};
/** True when a saved instance's ground touches a dragged rectangle, for erase hit-testing. */
const placementAreasOverlap = (
  areas: readonly TownBounds[],
  rect: TownBounds,
): boolean => areas.some((area) => (
  area.minX <= rect.maxX && area.maxX >= rect.minX
  && area.minY <= rect.maxY && area.maxY >= rect.minY
));
// A terrain's own cover set (grass tufts / water reeds / sand), or null — the default cover a region
// picks up when it uses that terrain (the author can then change it to anything).
const defaultCoverType = (terrain: TileFamilyId): GroundCoverId | null => {
  const id = terrainFamilyRecords().find((family) => family.id === terrain)?.defaultGroundCoverId;
  return id && isGroundCoverId(id) ? id : null;
};
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
  for (let y = 0; y < LE_ROWS; y += 1) for (let x = 0; x < LE_COLS; x += 1) cells[`${x},${y}`] = leDefaultTile().id;
  return cells;
};

/**
 * The authored terrain closest to (x, y), searched in rings so a square added at any edge inherits
 * the ground it was added NEXT to. Returns undefined only for a board with no authored terrain at
 * all, which the caller answers with the catalog default.
 */
const nearestAuthoredTileId = (
  cells: Readonly<Record<string, string>>,
  x: number,
  y: number,
): string | undefined => {
  const authored = Object.keys(cells);
  if (!authored.length) return undefined;
  let best: string | undefined;
  let bestDistance = Infinity;
  for (const key of authored) {
    const [cx, cy] = key.split(',').map(Number);
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) continue;
    // Chebyshev distance, tie-broken by key order, so the result is deterministic for a given
    // board rather than dependent on object-insertion history.
    const distance = Math.max(Math.abs(cx - x), Math.abs(cy - y));
    if (distance < bestDistance) {
      bestDistance = distance;
      best = cells[key];
    }
  }
  return best;
};
const LE_FACTION_LABELS = UNIT_PALETTE_LABELS;
// A board that has not authored its own sides opens on the classic chess pairing: the player is
// White, the CPU is Black. Only a NEW board adopts the player half automatically — an existing
// level that never authored a player faction keeps it unset rather than being claimed on load.
const DEFAULT_EDITOR_PLAYER_FACTION: UnitPalette = 'white';
const DEFAULT_EDITOR_CPU_FACTION: UnitPalette = 'black';
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
  const player = playerFaction ?? DEFAULT_EDITOR_PLAYER_FACTION;
  if (side === 'player') return player;
  const authoredEnemy = Object.values(units).find((unit) => unit.faction !== player)?.faction;
  if (isUnitPalette(authoredEnemy)) return authoredEnemy;
  if (playerFaction && playerFaction !== DEFAULT_EDITOR_CPU_FACTION) return DEFAULT_EDITOR_CPU_FACTION;
  return UNIT_PALETTES.find((faction) => faction !== player) ?? DEFAULT_EDITOR_CPU_FACTION;
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
/** Points read at a tenth. An average market buys fractions of a card, so a whole number here is
 * a real whole number rather than a rounded one. */
const formatPoints = (value: number): string => (
  Math.abs(value - Math.round(value)) < 0.05 ? String(Math.round(value)) : value.toFixed(1)
);
const formatAdvantage = (value: number): string => (
  Math.abs(value) < 0.05
    ? 'Even'
    : value > 0
      ? `Player ahead by ${formatPoints(value)}`
      : `Enemy ahead by ${formatPoints(-value)}`
);
const materialPointsForUnitId = (unitId: string): number => {
  const type = unitFamilyForId(unitId);
  return type ? CHESS_MATERIAL_POINT_VALUE[type] : 0;
};

// Authored zones are named tile regions. Legacy semantic types stay in the schema for import and
// back-compat, but new editor-authored behavior belongs in events/rules.
const DEFAULT_ZONE_TYPE: ZoneType = 'region';
// The piece types that own a dedicated deployment zone, and can therefore be broken off the
// general Player Deployment pool (ADR-0367).
const LE_BREAKABLE_DEPLOYMENT_TYPES = [
  { pieceType: 'king', label: 'King' },
] as const satisfies ReadonlyArray<{ pieceType: PlayablePieceType; label: string }>;
const DEFAULT_ZONE_COLOR: ZoneColor = 'teal';
const LEGACY_ZONE_COLOR: Record<ZoneType, ZoneColor> = {
  region: 'teal',
  'player-spawn': 'blue',
  'player-king-spawn': 'gold',
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
  battle: base.battle,
  notes: base.notes,
  difficulty: base.difficulty,
  economy: base.economy,
  theme: base.theme,
  previousTerrain: base.layers.terrain,
});

const EDITOR_REVISION_REASON_LABELS: Record<EditorDocumentRevisionSummary['reason'], string> = {
  migration: 'History enabled',
  resolve: 'Working copy created',
  create: 'New level created',
  autosave: 'Autosave',
  save: 'Saved position',
  discard: 'Discarded to saved position',
  restore: 'Restored revision',
  'generation-attempt-archive': 'Archived AI artwork slot',
  'canonical-refresh': 'Updated from saved position',
};

function downloadJsonArtifact(fileName: string, value: unknown): void {
  const blob = new Blob([`${JSON.stringify(value, null, 2)}\n`], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function editorRecoveryFileStem(levelName: string, documentId: string): string {
  const safeName = levelName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'level';
  const safeDocument = documentId.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${safeName}-${safeDocument}`;
}

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

function LevelEventsEditor({ value, zones, onChange, templates }: {
  value: LevelEvents;
  zones: EventZoneOption[];
  onChange: (next: LevelEvents, removedEvents?: readonly LevelEvent[]) => void;
  templates?: ReactNode;
}): ReactElement {
  const [sel, setSel] = useState(0);
  const selected = value.length ? Math.min(sel, value.length - 1) : -1;
  const event = selected >= 0 ? value[selected] : null;
  const castleAction = event?.do.find((action): action is CastleEventAction => action.kind === 'castle') ?? null;
  const chessDrawsAction = event?.do.find((action): action is ChessDrawsEventAction => action.kind === 'chess-draws') ?? null;
  const promotionTrigger = event?.trigger.kind === 'unit-enters-zone' ? event.trigger : null;
  const promotesTriggeringUnit = Boolean(event?.do.some((action) => action.kind === 'promote' && action.target.kind === 'triggering-unit'));
  const firstZone = zones[0]?.id ?? '';
  const zoneSelectOptions: HouseSelectOption<string>[] = zones.length > 0
    ? zones.map((zone) => ({ value: zone.id, label: zone.label }))
    : [{ value: '', label: 'No zones painted' }];
  const setEvent = (index: number, next: LevelEvent): void => onChange(value.map((item, i) => (i === index ? next : item)));
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
  useDeleteKeyAction(event ? () => removeEvent(selected) : null);

  return (
    <div className="le-md le-events-other">
      <div className="le-md-list">
        {templates}
        <h3 className="le-victory-head">Events</h3>
        {value.length === 0 ? <p className="le-board-warning">No events yet.</p> : null}
        <div className="le-md-rules">
          {value.map((item, index) => (
            <ChromeButton unit="inner-list-row" key={index} className={chromeUnitClassNames('inner-list-row', 'le-md-item', index === selected && 'active')} onClick={() => setSel(index)}>
              <span className="le-md-item-name">{eventName(item, index)}</span>
              <span className="le-md-item-out">{primaryEventAction(item)?.kind ?? 'event'}</span>
            </ChromeButton>
          ))}
        </div>
        <div className="le-cond-add le-rule-add">
          <ChromeButton unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', 'le-add-event')} onClick={addPromotion}>+ Promotion</ChromeButton>
        </div>
      </div>
      <div className="le-md-detail">
        {event && promotionTrigger && promotesTriggeringUnit ? (
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
              <HouseSelect<'player' | 'enemy' | 'any'>
                value={promotionTrigger.unit.side ?? 'any'}
                options={[
                  { value: 'player', label: 'Player pawn' },
                  { value: 'enemy', label: 'Enemy pawn' },
                  { value: 'any', label: 'Any pawn' },
                ]}
                ariaLabel="Promotion faction"
                onChange={(choice) => {
                  const side = choice === 'any' ? undefined : choice;
                  setEvent(selected, { ...event, trigger: { kind: 'unit-enters-zone', unit: { type: 'pawn', side }, zoneId: promotionTrigger.zoneId } });
                }}
              />
            </div>
            <div className="le-ctrlrow">
              <span className="le-ctrllabel">Zone</span>
              <HouseSelect<string>
                value={promotionTrigger.zoneId}
                options={zoneSelectOptions}
                ariaLabel="Promotion zone"
                disabled={zones.length === 0}
                onChange={(zoneId) => setEvent(selected, { ...event, trigger: { kind: 'unit-enters-zone', unit: promotionTrigger.unit, zoneId } })}
              />
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
              <ChromeButton unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', 'danger', 'le-rule-remove')} onClick={() => removeEvent(selected)}>Remove event</ChromeButton>
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
              <ChromeButton unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', 'danger', 'le-rule-remove')} onClick={() => removeEvent(selected)}>Remove event</ChromeButton>
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
              <ChromeButton unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', 'danger', 'le-rule-remove')} onClick={() => removeEvent(selected)}>Remove event</ChromeButton>
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
      <ChromeButton unit="inner-tool-square"
        className={chromeUnitClassNames('inner-tool-square', 'le-direction-trigger')}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {rookDirectionLabel[value]}
      </ChromeButton>
      {open ? (
        <div className="le-direction-menu" role="radiogroup" aria-label={label}>
          {directionCompassCells.map((cell) =>
            cell === 'center' ? (
              <span key="center" className="unit-facing-cell le-direction-cell is-empty" aria-hidden="true" />
            ) : (
              <ChromeButton unit="inner-tool-square"
                key={cell}
                className={chromeUnitClassNames('inner-tool-square', 'unit-facing-cell', 'le-direction-cell', value === cell && 'is-active')}
                role="radio"
                aria-checked={value === cell}
                title={`Face ${cell}`}
                onClick={() => choose(cell)}
              >
                {rookDirectionLabel[cell]}
              </ChromeButton>
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
  posts,
  onPaint,
  onErase,
  onPaintPost,
  onErasePost,
}: {
  cell: { x: number; y: number };
  cols: number;
  rows: number;
  fences: Record<string, FenceMaterial>;
  posts: Record<string, FenceMaterial>;
  onPaint: (edge: string) => void;
  onErase: (edge: string) => void;
  onPaintPost: (vertex: string) => void;
  onErasePost: (vertex: string) => void;
}): ReactElement {
  const V = { apex: [64, 14], right: [114, 48], bottom: [64, 82], left: [14, 48] } as const;
  const EDGE_GEO: Record<string, readonly [readonly [number, number], readonly [number, number]]> = {
    N: [V.apex, V.right],
    E: [V.right, V.bottom],
    S: [V.bottom, V.left],
    W: [V.left, V.apex],
  };
  const VERTEX_GEO: Record<FenceVertexCorner, readonly [number, number]> = {
    back: V.apex,
    right: V.right,
    front: V.bottom,
    left: V.left,
  };
  const resolvedPosts = resolveFencePosts(fences, posts);
  return (
    <svg className="le-roadconn" viewBox="0 0 128 96" role="group" aria-label="Fence rails and posts for the selected tile">
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
          ? `Remove ${fenceMaterialLabel(material)} fence from ${dir.edge} edge`
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
      {FENCE_VERTEX_CORNERS.map((corner) => {
        const vertex = fenceVertexKey(cell.x, cell.y, corner.id);
        const explicitMaterial = posts[vertex];
        const resolved = resolvedPosts.get(vertex);
        const state = explicitMaterial ? 'explicit' : resolved?.source === 'automatic' ? 'automatic' : 'none';
        const material = explicitMaterial ?? resolved?.material;
        const [cx, cy] = VERTEX_GEO[corner.id];
        const toggle = (): void => (explicitMaterial ? onErasePost(vertex) : onPaintPost(vertex));
        const label = explicitMaterial
          ? `Remove authored ${fenceMaterialLabel(explicitMaterial)} post from ${corner.label} vertex`
          : resolved?.source === 'automatic'
          ? `Author a post at ${corner.label} vertex; an automatic ${fenceMaterialLabel(resolved.material)} open-end post is already present`
          : `Add post to ${corner.label} vertex`;
        return (
          <g
            key={`post-${corner.id}`}
            className={`le-fenceconn-post is-${state}${material ? ` is-${material}` : ''}`}
            role="button"
            aria-label={label}
            aria-pressed={Boolean(explicitMaterial)}
            tabIndex={0}
            onClick={toggle}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } }}
          >
            <circle cx={cx} cy={cy} r="13" fill="transparent" />
            <circle className="le-fenceconn-post-mark" cx={cx} cy={cy} r={state === 'explicit' ? 6 : 5} />
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
          ? `Remove ${wallMaterialLabel(material)} wall from ${dir.edge} edge`
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
  { id: 'camera', label: 'Camera' },
  { id: 'level-artwork', label: 'Level Artwork' },
  { id: 'tile', label: 'Tile' },
  { id: 'generate', label: 'Generate' },
  { id: 'paths', label: 'Paths' },
  { id: 'fence', label: 'Fence' },
  { id: 'wall', label: 'Wall' },
  { id: 'subterrain', label: 'Subterrain' },
  { id: 'wallart', label: 'Wall Art' },
  { id: 'unit', label: 'Unit' },
  { id: 'placed-art', label: 'Placed Art' },
  { id: 'cover', label: 'Cover' },
  { id: 'zone', label: 'Zone' },
  { id: 'rules', label: 'Rules' },
  { id: 'war', label: 'War' },
  { id: 'status', label: 'Status' },
  { id: 'history', label: 'History' },
];
const isLayerOptionDisabled = (_layer: LayerKey): boolean => false;
const LEVEL_EDITOR_LAYER_SELECT_OPTIONS = LEVEL_EDITOR_LAYER_OPTIONS.map((option) => ({
  ...option,
  disabled: isLayerOptionDisabled(option.id),
}));
const defaultLevelEditorLayer = (): LayerKey => LEVEL_EDITOR_LAYER_OPTIONS.find((option) => !isLayerOptionDisabled(option.id))?.id ?? LEVEL_EDITOR_LAYER_OPTIONS[0].id;
function isWallMaterialId(value: string | undefined): value is WallMaterial {
  return !!value && wallMaterials().includes(value);
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
// Workspace/rules/status/history pages and Generate are non-painting layers → select tool.
const toolForLayer = (layer: LayerKey): 'select' | 'brush' => (
  layer === 'board'
  || layer === 'camera'
  || layer === 'status'
  || layer === 'history'
  || layer === 'rules'
  || layer === 'war'
  || layer === 'generate'
  || layer === 'level-artwork'
) ? 'select' : 'brush';
const brushKindForInitialLayer = (layer: LayerKey): BrushKind => {
  if (layer === 'paths') return 'road';
  if (layer === 'placed-art') return 'artwork';
  if (layer === 'board' || layer === 'camera' || layer === 'status' || layer === 'history' || layer === 'rules' || layer === 'war' || layer === 'generate' || layer === 'level-artwork') return 'tile';
  return layer as BrushKind;
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
type LevelEditorPredrawnSelectionValidity = PredrawnSelectionCheck;
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
  // ?layer=<id> deep-link opens straight on any panel (rules, status, zone, ...), while
  // ?eventsEditor=1 opens the full Events workspace on Rules; ?eventsTab selects Deployment or
  // Other Events. All are validated by the canonical route-state parser.
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
      eventsEditor: routeState.eventsEditor,
      eventsTab: routeState.eventsTab,
      levelArtworkWorkspace: routeState.levelArtworkWorkspace,
    };
  }, []);
  const cameFromStudio = studioArm.fromStudio;
  // An explicit ?layer= wins over ?kind= (which is really brush-arming), then the default.
  const initialLayer: LayerKey = studioArm.layer ?? defaultLevelEditorLayer();
  const initialBrushKind = brushKindForRouteState(initialLayer, studioArm.kind);
  const initialEventsOpen = initialLayer === 'rules' && studioArm.eventsEditor;
  const initialEventsTab: LevelEditorEventsTab = studioArm.eventsTab ?? 'victory';
  const initialLevelArtworkWorkspace = initialLayer === 'level-artwork'
    ? studioArm.levelArtworkWorkspace
    : undefined;
  // The campaign path deep-links here with ?campaignId&levelId (&returnTo): which level to
  // edit, and where "Back" returns after a save. Read once at mount; absent ⇒ a standalone
  // (board-link / blank) board with no campaign target.
  const routeParams = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const rawDocumentRevision = Number(params.get('docRev'));
    const legacyMapId = params.get('map') ?? undefined;
    return {
      campaignId: params.get('campaignId') ?? undefined,
      warId: params.get('warId') ?? undefined,
      levelId: params.get('levelId') ?? undefined,
      documentId: params.get('document') ?? (legacyMapId ? `legacy-${legacyMapId}` : undefined),
      documentRevision: Number.isSafeInteger(rawDocumentRevision) && rawDocumentRevision >= 1 ? rawDocumentRevision : undefined,
      returnTo: params.get('returnTo') ?? undefined,
      boardCode: params.get('board') ?? undefined,
    };
  }, []);
  // A level-only URL does not know its durable document id yet, but it still needs a page-unique
  // recovery address before any editable fallback can mount. Duplicated tabs must prove exclusive
  // ownership of this provisional identity before either one can read or write browser recovery.
  const provisionalClientScope = useMemo(
    () => routeParams.documentId ?? `pending-level-editor:${routeParams.levelId ?? 'new-level'}`,
    [routeParams.documentId, routeParams.levelId],
  );
  // Optional `?board=<code>` deep-link: decode a whole board to start from (see boardCode.ts).
  // It takes precedence over a campaign level (it's the explicit "inspect this exact board").
  const loadedBoard = useMemo(() => readBoardParam(), []);
  const urlParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const [editorClientIdentity, setEditorClientIdentity] = useState<LevelEditorClientIdentity | null>(null);
  const editorClientLabel = useMemo(
    () => `Level Editor · ${window.location.host} · ${levelEditorClientLabel(window.navigator.userAgent)}`,
    [],
  );
  const isChromeLabPreview = useMemo(() => urlParams.get('chromeLab') === '1', [urlParams]);
  const installedChromeCss = useInstalledChromeCss(!isChromeLabPreview);
  const fenceArtReviewRequested = urlParams.get('artReview') === FENCE_ART_REVIEW_ID;
  const brushIconReviewVersionId = urlParams.get('brushIconReviewVersion')?.trim() ?? '';
  const [fenceArtReviewDismissed, setFenceArtReviewDismissed] = useState(false);
  const fenceArtReviewEnabled = fenceArtReviewRequested && !fenceArtReviewDismissed;
  const initialFenceArtworkId = urlParams.get('fenceArt') ?? '';
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
  const initialCampaignAssignmentId = routeParams.warId ? '' : draftHasCampaignAssignment
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
  const [editorTerrainPainted, setEditorTerrainPainted] = useState(false);
  const [editorScenePainted, setEditorScenePainted] = useState(false);
  const [editorFrameError, setEditorFrameError] = useState<Error | null>(null);
  const acknowledgeEditorTerrain = useCallback(() => {
    if (editorReady) setEditorTerrainPainted(true);
  }, [editorReady]);
  const acknowledgeEditorScene = useCallback(() => {
    if (editorReady) setEditorScenePainted(true);
  }, [editorReady]);
  const failEditorFrame = useCallback((error: unknown) => {
    if (editorReady) setEditorFrameError(error instanceof Error ? error : new Error(String(error)));
  }, [editorReady]);
  useEffect(() => {
    if (!editorReady) return undefined;
    const frame = requestAnimationFrame(() => loadingMark('editor', 'chrome-first-ready-frame'));
    return () => cancelAnimationFrame(frame);
  }, [editorReady]);
  const [targetBaselineResolved, setTargetBaselineResolved] = useState(!routeParams.levelId || Boolean(initialTargetLevel));
  const [editorDocument, setEditorDocument] = useState<EditorDocument | null>(null);
  const [editorLoadError, setEditorLoadError] = useState<{ title: string; detail: string; signIn?: boolean; retry?: boolean } | null>(null);
  const [editAuthorityState, setEditAuthorityState] = useState<LevelEditorAuthorityState>('checking');
  const [editSession, setEditSession] = useState<EditorDocumentEditSession | null>(null);
  const [editPresence, setEditPresence] = useState<EditorDocumentEditPresence | null>(null);
  const followerRefreshSequenceRef = useRef(0);
  const editSessionRef = useRef<EditorDocumentEditSession | null>(null);
  const editPresenceRef = useRef<EditorDocumentEditPresence | null>(null);
  const editSessionOpenPromiseRef = useRef<Promise<EditorDocumentEditSessionResult> | null>(null);
  const editorClientIdentityRef = useRef(editorClientIdentity);
  const pendingDraftIdentityRef = useRef<ScopedLevelEditorDraftIdentity | null>(null);
  // `signed-out` is deliberately distinct from `error`: the working copy and its browser recovery
  // are intact and the only missing thing is an account session, so the editor stays mounted,
  // keeps buffering, and resumes automatically when the same owner signs back in.
  const [cloudSaveState, setCloudSaveState] = useState<'loading' | 'local' | 'pending' | 'saving' | 'saved' | 'error' | 'conflict' | 'signed-out'>('loading');
  const [preservedBranchOffer, setPreservedBranchOffer] = useState<LevelEditorLocalFallbackSnapshot | null>(null);
  const [cloudSaveDetail, setCloudSaveDetail] = useState<string | null>(null);
  const [localBackupAvailable, setLocalBackupAvailable] = useState<boolean | null>(null);
  const [revisionHistory, setRevisionHistory] = useState<EditorDocumentRevisionSummary[]>([]);
  const [revisionHistoryState, setRevisionHistoryState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [revisionHistoryDetail, setRevisionHistoryDetail] = useState<string | null>(null);
  const [revisionHistoryRefresh, setRevisionHistoryRefresh] = useState(0);
  const [revisionHistoryExpanded, setRevisionHistoryExpanded] = useState(false);
  const sharedAuthStatus = useAuthSession((session) => session.status);
  const authResolutionKey = sharedAuthStatus
    ? `${sharedAuthStatus.reachable}:${sharedAuthStatus.user.signed_in}:${sharedAuthStatus.user.email ?? ''}`
    : null;
  const me = sharedAuthStatus?.reachable ? sharedAuthStatus.user : null;
  const authReachable = sharedAuthStatus?.reachable ?? null;
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
  const [boardSurface, setBoardSurface] = useState<PredrawnBoardSurface | undefined>(() => initialBoard?.surface);
  const [boardPredrawnGridDetached, setBoardPredrawnGridDetached] = useState<boolean>(
    () => initialBoard?.predrawnGridDetached === true,
  );
  const [boardPredrawnPlateOffset, setBoardPredrawnPlateOffset] = useState<{ left: number; top: number } | undefined>(
    () => initialBoard?.predrawnPlateOffset,
  );
  const [boardBackgroundModeState, setBoardBackgroundModeState] = useState<BoardBackgroundMode>(
    () => boardBackgroundMode(initialBoard ?? {}),
  );
  const [predrawnSelectionValidation, setPredrawnSelectionValidation] = useState<LevelEditorPredrawnSelectionValidity>(
    () => predrawnSelectionSeed(initialBoard?.surface),
  );
  // Bumped to ask the server again after a read that failed for a reason that can pass. Nothing
  // else re-runs the check: its other inputs are the board's own geometry and identity, which a
  // lost backend or an expired cookie does not touch.
  const [predrawnValidationAttempt, setPredrawnValidationAttempt] = useState(0);
  /** Held so one failure episode reports one 401 to the shared session owner, however often it retries. */
  const predrawnUnauthorizedReportedRef = useRef(false);
  const [boardPredrawnGenerationFrame, setBoardPredrawnGenerationFrame] = useState<PredrawnGenerationFrame | undefined>(
    () => initialBoard?.predrawnGenerationFrame,
  );
  const [predrawnReviewSearch, setPredrawnReviewSearch] = useState(() => window.location.search);
  useEffect(() => {
    const sync = (): void => setPredrawnReviewSearch(window.location.search);
    return subscribeAppLocation(sync);
  }, []);
  const predrawnPreview = useMemo(
    () => predrawnBoardPreviewSrc(predrawnReviewSearch, window.location.origin),
    [predrawnReviewSearch],
  );
  const predrawnRegistration = useMemo(
    () => predrawnPreview
      ? storedPredrawnBoardRegistration(predrawnPreview)
        ?? predrawnBoardPreviewRegistration(predrawnReviewSearch)
      : predrawnBoardPreviewRegistration(predrawnReviewSearch),
    [predrawnPreview, predrawnReviewSearch],
  );
  const editorPredrawnPlate = useMemo<PredrawnBoardPlate | undefined>(() => {
    // Drawn through the shared render seam so the editor plate, gameplay, and both thumbnail
    // renderers place the owner's artwork identically.
    const activeSurface = boardBackgroundModeState === 'ai'
      && predrawnSelectionIsDrawable(predrawnSelectionValidation)
      ? predrawnRenderSurface({ surface: boardSurface, predrawnPlateOffset: boardPredrawnPlateOffset })
      : undefined;
    return predrawnBoardPlateForEditorReview(activeSurface, predrawnPreview, predrawnRegistration);
  }, [boardBackgroundModeState, boardPredrawnPlateOffset, boardSurface, predrawnPreview, predrawnRegistration, predrawnSelectionValidation.kind]);
  const isPredrawnBoard = boardBackgroundModeState === 'ai' || editorPredrawnPlate !== undefined;
  const editorRouteError = useMemo(
    () => editorFrameError ?? (editorLoadError
      ? new Error(`${editorLoadError.title}: ${editorLoadError.detail}`)
      : null),
    [editorFrameError, editorLoadError],
  );
  const editorFramePainted = (
    editorReady
    && (isPredrawnBoard || editorTerrainPainted)
    && editorScenePainted
  );
  // The three authorities the editor's frame is made of, registered separately rather than
  // collapsed into one participant (ADR-0369): each can fail on its own, and the loading
  // timeline names which one an unresolved wait belongs to instead of reporting
  // `level-editor` for all three. `level-editor` remains the paint owner over them.
  useSceneParticipant(
    'document',
    editorRouteError ? 'error' : editorReady ? 'painted' : 'loading',
    editorRouteError,
  );
  useSceneParticipant(
    'board-compositors',
    editorRouteError ? 'error' : (isPredrawnBoard || editorTerrainPainted) ? 'painted' : 'loading',
    editorRouteError,
  );
  useSceneParticipant(
    'visible-editor-chrome',
    editorRouteError ? 'error' : editorScenePainted ? 'painted' : 'loading',
    editorRouteError,
  );
  useSceneParticipant(
    'level-editor',
    editorRouteError
      ? 'error'
      : editorFramePainted
        ? 'painted'
        : 'loading',
    editorRouteError,
  );
  const isPredrawnReviewOnly = editorPredrawnPlate !== undefined && Boolean(predrawnPreview);
  const [boardMacroTiles, setBoardMacroTiles] = useState<MacroTilePlacement[]>(() => initialBoard ? validMacroTilesForBoard(initialBoard) : []);
  const [boardCols, setBoardCols] = useState(initialBoard?.cols ?? LE_COLS);
  const [boardRows, setBoardRows] = useState(initialBoard?.rows ?? LE_ROWS);
  const [boardCameraBounds, setBoardCameraBounds] = useState<BoardCameraBounds | undefined>(initialBoard?.cameraBounds);
  const [decorativeApron, setDecorativeApron] = useState<DecorativeTerrainExtents>(() =>
    initialBoard?.decorativeApron ?? { top: 0, right: 0, bottom: 0, left: 0 });
  const [decorativeCells, setDecorativeCells] = useState<Record<string, string>>(() => initialBoard?.decorativeCells ?? {});
  const [decorativeFootprint, setDecorativeFootprint] = useState<string[]>(() => initialBoard?.decorativeFootprint ?? []);
  const scenicTerrainCoordinates = useMemo(
    () => decorativeTerrainApronCoordinates(
      boardCols,
      boardRows,
      decorativeApron,
      decorativeFootprint,
    ),
    [boardCols, boardRows, decorativeApron, decorativeFootprint],
  );
  const scenicTerrainCoordinateKeys = useMemo(
    () => new Set(scenicTerrainCoordinates.map(({ x, y }) => `${x},${y}`)),
    [scenicTerrainCoordinates],
  );
  const [scenicTerrainGenerationMode, setScenicTerrainGenerationMode] = useState<ScenicTerrainGenerationMode>('match-reference');
  const [decorativeFeatures, setDecorativeFeatures] = useState<Record<string, FeatureCell>>(() => initialBoard?.decorativeFeatures ?? {});
  const [decorativeFences, setDecorativeFences] = useState<Record<string, FenceMaterial>>(() => initialBoard?.decorativeFences ?? {});
  const [decorativeFencePosts, setDecorativeFencePosts] = useState<Record<string, FenceMaterial>>(() => initialBoard?.decorativeFencePosts ?? {});
  const [decorativeWalls, setDecorativeWalls] = useState<Record<string, WallMaterial>>(() => initialBoard?.decorativeWalls ?? {});
  const [playerFaction, setPlayerFaction] = useState<UnitPalette | null>(() => {
    const authored = initialBoard?.playerFaction;
    if (authored && (UNIT_PALETTES as readonly string[]).includes(authored)) return authored as UnitPalette;
    // A brand-new board opens already assigned to White. A board that LOADED without a player
    // faction keeps it unset, so opening an old level never silently claims a side for it.
    return initialBoard ? null : DEFAULT_EDITOR_PLAYER_FACTION;
  });
  const [boardFactionDirections, setBoardFactionDirections] = useState<FactionDirections>(() => initialFactionDirections);
  const [tool, setTool] = useState<'select' | 'brush' | 'erase' | 'move' | 'region'>(
    initialLayer === 'placed-art' && initialBrushKind === 'artwork'
      ? 'select'
      : toolForLayer(initialLayer),
  );
  const [brushId, setBrushId] = useState<string>(studioArm.kind === 'tile' && studioArm.brush ? studioArm.brush : leDefaultTile().id);
  const [macroTileBrushId, setMacroTileBrushId] = useState<string | null>(null);
  const [macroTileFootprint, setMacroTileFootprint] = useState(leMacroTileFootprints()[0] ?? '2x2');
  const [selectedCell, setSelectedCell] = useState<{ x: number; y: number } | null>(null);
  // Scene Art selection is a LIST: one click picks one instance, a dragged rectangle picks every
  // instance it touches. `selectedArtworkId` stays as the PRIMARY member — the last one picked —
  // because Details, Facing, X/Y and Scale each edit exactly one object and must not go blank the
  // moment a second instance joins the selection. Selection-wide verbs (Delete, Move) read the list.
  const [selectedArtworkIds, setSelectedArtworkIds] = useState<readonly string[]>([]);
  const selectedArtworkId = selectedArtworkIds.length ? selectedArtworkIds[selectedArtworkIds.length - 1] : null;
  const setSelectedArtworkId = (id: string | null): void => setSelectedArtworkIds(id === null ? [] : [id]);
  const [artworkSelectionActive, setArtworkSelectionActive] = useState(false);
  // Connected terrain-area selection shared by Generate and raw Tile Fill. "x,y" cell keys.
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
  const [viewMinZoom, setViewMinZoom] = useState(BOARD_CAMERA_TECHNICAL_MINIMUM_ZOOM);
  const viewMaxZoom = Math.max(4, viewMinZoom);
  const [viewPan, setViewPan] = useState({ x: 0, y: 0 });
  const [viewViewportSize, setViewViewportSize] = useState<ViewPaneViewportSize | null>(null);
  const predrawnCoverCells = useMemo(
    () => Array.from({ length: boardRows }, (_, y) =>
      Array.from({ length: boardCols }, (__, x) => ({ x, y }))).flat(),
    [boardCols, boardRows],
  );
  const artworkBoardOrigin = useMemo(
    () => boardLabMetrics(predrawnCoverCells),
    [predrawnCoverCells],
  );
  const predrawnCoverPolygon = useMemo(
    () => editorPredrawnPlate
      ? predrawnBoardCoverPolygon(editorPredrawnPlate, predrawnCoverCells)
      : undefined,
    [editorPredrawnPlate, predrawnCoverCells],
  );
  const resolvedCameraBoundary = useMemo(
    () => resolvedBoardCameraBounds({
      cols: boardCols,
      rows: boardRows,
      cameraBounds: boardCameraBounds,
    }),
    [boardCameraBounds, boardCols, boardRows],
  );
  const {
    markViewInteraction: markBoardViewInteraction,
    resetView: resetFramedBoardView,
  } = useBoardCameraFraming({
    board: { cols: boardCols, rows: boardRows },
    viewKey: provisionalClientScope,
    viewport: viewViewportSize,
    minimumZoom: viewMinZoom,
    maximumZoom: viewMaxZoom,
    zoom: viewZoom,
    setZoom: setViewZoom,
    setPan: setViewPan,
  });
  type CameraBoundaryInteractionMode = 'view' | 'edit';
  const [cameraBoundaryInteractionMode, setCameraBoundaryInteractionMode] = useState<CameraBoundaryInteractionMode>('edit');
  const [cameraSnapMode, setCameraSnapMode] = useState<BoardCameraSnapMode>('balanced');
  const frameCameraBoundary = (bounds: BoardCameraBounds): void => {
    if (!viewViewportSize) return;
    const revealPadding = Math.max(bounds.width, bounds.height) * 0.025;
    const camera = cameraToContainBounds({
      viewport: viewViewportSize,
      bounds: {
        minX: bounds.minX - revealPadding,
        minY: bounds.minY - revealPadding,
        width: bounds.width + revealPadding * 2,
        height: bounds.height + revealPadding * 2,
      },
      minZoom: viewMinZoom,
      maxZoom: viewMaxZoom,
    });
    markBoardViewInteraction();
    setViewZoom(camera.zoom);
    setViewPan(camera.pan);
  };
  const [gridScope, setGridScope] = useState<'off' | 'playable' | 'whole'>('off');
  const toggleRegisteredGrid = (): void => setGridScope((value) => value === 'off' ? 'whole' : 'off');
  const [predrawnOcclusionEnabled, setPredrawnOcclusionEnabled] = useState(
    () => new URL(window.location.href).searchParams.get('predrawnOcclusion') !== '0',
  );
  const [showPredrawnOcclusionSeed, setShowPredrawnOcclusionSeed] = useState(
    () => new URL(window.location.href).searchParams.get('predrawnOcclusionSeed') === '1',
  );
  const togglePredrawnOcclusion = (): void => {
    const next = !predrawnOcclusionEnabled;
    const url = new URL(window.location.href);
    if (next) url.searchParams.delete('predrawnOcclusion');
    else url.searchParams.set('predrawnOcclusion', '0');
    setPredrawnOcclusionEnabled(next);
    navigateApp(`${url.pathname}${url.search}${url.hash}`, { replace: true, scroll: false });
  };
  const togglePredrawnOcclusionSeed = (): void => {
    const next = !showPredrawnOcclusionSeed;
    const url = new URL(window.location.href);
    if (next) url.searchParams.set('predrawnOcclusionSeed', '1');
    else url.searchParams.delete('predrawnOcclusionSeed');
    setShowPredrawnOcclusionSeed(next);
    navigateApp(`${url.pathname}${url.search}${url.hash}`, { replace: true, scroll: false });
  };
  const [predrawnPickerOpen, setPredrawnPickerOpen] = useState(
    () => new URL(window.location.href).searchParams.get('predrawnPicker') === '1',
  );
  const [predrawnGenerationFrameOpen, setPredrawnGenerationFrameOpen] = useState(
    () => new URL(window.location.href).searchParams.get('generationFrame') === '1',
  );
  const savePredrawnRegistration = (registration: PredrawnBoardCornerRegistration): void => {
    const url = new URL(window.location.href);
    url.searchParams.set('predrawnCorners', serializePredrawnBoardPreviewRegistration(registration));
    setGridScope('whole');
    setPredrawnReviewSearch(url.search);
    navigateApp(`${url.pathname}${url.search}${url.hash}`, { replace: true, scroll: false });
  };
  const closePredrawnPicker = (): void => {
    const href = predrawnEditorHrefAfterPicker(window.location.href);
    setPredrawnPickerOpen(false);
    setPredrawnReviewSearch(new URL(href, window.location.origin).search);
    navigateApp(href, { replace: true, scroll: false });
  };
  const openPredrawnGenerationFrame = (): void => {
    if (!editorSessionCanWrite) {
      reportStatus(
        'Viewing pane is read-only.',
        'warning',
        'This review page is read-only.',
      );
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.set('generationFrame', '1');
    setPredrawnGenerationFrameOpen(true);
    navigateApp(`${url.pathname}${url.search}${url.hash}`, { replace: true, scroll: false });
  };
  const closePredrawnGenerationFrame = (): void => {
    const url = new URL(window.location.href);
    url.searchParams.delete('generationFrame');
    setPredrawnGenerationFrameOpen(false);
    navigateApp(`${url.pathname}${url.search}${url.hash}`, { replace: true, scroll: false });
  };
  const [showMoves, setShowMoves] = useState(true);
  const [showEnemyAttacks, setShowEnemyAttacks] = useState(true);
  const [showBlocked, setShowBlocked] = useState(false);
  const [showPromotionZones, setShowPromotionZones] = useState(false);
  const [brushKind, setBrushKind] = useState<BrushKind>(initialBrushKind);
  const [placedArtKind, setPlacedArtKind] = useState<PlacedArtBrushKind>(
    isPlacedArtBrushKind(initialBrushKind) ? initialBrushKind : 'artwork',
  );
  const [layer, setLayer] = useState<LayerKey>(initialLayer);
  const cameraLayerEntryFramedRef = useRef(false);
  useEffect(() => {
    if (layer !== 'camera') {
      cameraLayerEntryFramedRef.current = false;
      return;
    }
    if (cameraLayerEntryFramedRef.current || !viewViewportSize) return;
    cameraLayerEntryFramedRef.current = true;
    frameCameraBoundary(resolvedCameraBoundary);
  }, [
    layer,
    resolvedCameraBoundary.height,
    resolvedCameraBoundary.minX,
    resolvedCameraBoundary.minY,
    resolvedCameraBoundary.width,
    viewViewportSize?.height,
    viewViewportSize?.width,
  ]);
  const layerSelectOptions = useMemo(() => LEVEL_EDITOR_LAYER_SELECT_OPTIONS.map((option) => ({
    ...option,
    // A pre-drawn plate locks Placed Art because those pixels are already baked into the
    // selected background. Level Artwork remains available to manage that background.
    disabled: option.disabled || (isPredrawnBoard && isPredrawnLockedLayer(option.id)),
  })), [isPredrawnBoard]);
  useEffect(() => {
    if (!isPredrawnBoard || !isPredrawnLockedLayer(layer)) return;
    setLayer('board');
    setTool('select');
  }, [isPredrawnBoard, layer]);
  const [boardUnits, setBoardUnits] = useState<Record<string, BoardUnitPlacement>>((initialBoard?.units as Record<string, BoardUnitPlacement>) ?? {});
  const [boardDoodads, setBoardDoodads] = useState<Record<string, { doodadId: string }>>(initialBoard?.doodads ?? {});
  // Multi-cell props (trees/houses), keyed by ANCHOR cell. Seeded from a loaded board, else empty.
  const [boardProps, setBoardProps] = useState<Record<string, { propId: string }>>(initialBoard?.props ?? {});
  // A prop link is only worth sending if it arrives with that prop in hand. `?brush=` was
  // honoured for every other placed-art kind and silently ignored for props, so every prop link
  // landed on the default oak and made the recipient go find the thing it named.
  const [propBrushId, setPropBrushId] = useState<string>(() => (
    studioArm.kind === 'prop' && studioArm.brush && propDef(studioArm.brush)
      ? studioArm.brush
      : defaultPropDef().id
  ));
  const [boardFloatingArtwork, setBoardFloatingArtwork] = useState<FloatingArtworkPlacement[]>(initialBoard?.floatingArtwork ?? []);
  const artworkAssets = STRUCTURE_ART_ASSETS.filter((asset) => structureArtHasCompleteTurntable(asset.id));
  const [artworkBrushId, setArtworkBrushId] = useState<string>(() => (
    studioArm.kind === 'artwork'
      && studioArm.brush
      && artworkAssets.some((asset) => asset.id === studioArm.brush)
      ? studioArm.brush
      : artworkAssets[0]?.id ?? ''
  ));
  const [artworkBrushDirection, setArtworkBrushDirection] = useState<Direction>('south');
  // The Forest brush scatters ordinary Scene Art from a few knobs. The species list is the live
  // catalog's NATURAL scenery — trees first, then the undergrowth an author wants between them.
  // Built structures are deliberately excluded; they are not forest, whatever their art kind.
  const forestSpeciesCatalog = useMemo(() => {
    const built = /castle|windmill|mill|cottage|cabin|lodge|house|tower|keep/;
    // Sources that bake their own patch of ground into the sprite. Scattered across authored
    // terrain they stamp a visible disc of foreign soil under every instance, so they are not
    // forest material however good the tree on top is. Checked by eye against the whole tree
    // catalogue: rootbound-majesty-tree is the only current offender (a scan of a dead tree
    // sitting on a mound of earth and roots). Re-check the same way when tree art is added —
    // silhouette width and base fill density both fail to separate a mound from a conifer's
    // dense lower skirt.
    const bakedGround = /^(rootbound-majesty-tree)$/;
    const natural = /tree|forest|mushroom|cactus|fern|flower|rock|boulder|shrub|bush|stump|log/;
    const rank = (asset: typeof artworkAssets[number]): number => (
      asset.kind === 'tree' || asset.propKind === 'tree' || /tree/.test(asset.id) ? 0 : 1
    );
    return artworkAssets
      .filter((asset) => !built.test(asset.id) && !bakedGround.test(asset.id))
      .filter((asset) => (
        asset.kind === 'tree' || asset.kind === 'doodad'
        || asset.propKind === 'tree' || asset.propKind === 'rock'
        || natural.test(asset.id)
      ))
      .sort((left, right) => rank(left) - rank(right));
  }, [artworkAssets]);
  const initialForestSourceId = studioArm.kind === 'forest'
    && studioArm.brush
    && forestSpeciesCatalog.some((asset) => asset.id === studioArm.brush)
    ? studioArm.brush
    : null;
  /** Saved Forest instances. Each owns its area, weighted art recipe, settings, and generated output. */
  const [boardForests, setBoardForests] = useState<BoardForest[]>(initialBoard?.forests ?? []);
  const [selectedForestId, setSelectedForestId] = useState<string | null>(null);
  /** Open art chooser: null entryId appends; a concrete id replaces that recipe entry. */
  const [forestPicker, setForestPicker] = useState<{ sectionId: string; entryId: string | null } | null>(null);
  const [expandedForestSections, setExpandedForestSections] = useState<Set<string>>(() => new Set());
  const [expandedForestTrees, setExpandedForestTrees] = useState<Set<string>>(() => new Set());
  const [forestGenerationResult, setForestGenerationResult] = useState<{ forestId: string; count: number } | null>(null);
  /** The live Forest drag in the same snapped logical cells used by Town. */
  const [forestDrag, setForestDrag] = useState<PlacementDrag | null>(null);
  const forestDragRef = useRef<PlacementDragOrigin | null>(null);
  useEffect(() => {
    if (!boardForests.length) {
      if (selectedForestId !== null) setSelectedForestId(null);
      return;
    }
    if (!boardForests.some((forest) => forest.id === selectedForestId)) setSelectedForestId(boardForests[0].id);
  }, [boardForests, selectedForestId]);
  const selectedForest = boardForests.find((forest) => forest.id === selectedForestId) ?? null;
  const forestAreas = useMemo(
    () => (selectedForest ? generatorInstanceAreas(selectedForest) : []),
    [selectedForest],
  );
  const selectedForestGenerated = selectedForest
    ? boardFloatingArtwork.some((placement) => isForestMember(placement, selectedForest.id))
      || forestGenerationResult?.forestId === selectedForest.id
    : false;
  const updateForest = (id: string, change: Partial<BoardForest>): void => {
    setBoardForests((current) => current.map((forest) => (forest.id === id ? { ...forest, ...change } : forest)));
  };
  const updateForestSection = (forestId: string, sectionId: string, change: Partial<BoardForestSection>): void => {
    setBoardForests((current) => current.map((forest) => (forest.id === forestId
      ? { ...forest, sections: forest.sections.map((section) => section.id === sectionId ? { ...section, ...change } : section) }
      : forest)));
  };
  const forestSectionOpen = (section: BoardForestSection): boolean => expandedForestSections.has(section.id);
  const newForestSection = (relationship: GeneratorSectionRelationship = 'distinct'): BoardForestSection => ({
    id: `s${Math.random().toString(36).slice(2, 8)}`,
    relationship,
    trees: [],
    density: FOREST_SCATTER_DEFAULTS.density,
    jitter: FOREST_SCATTER_DEFAULTS.jitter,
    scaleMin: FOREST_SCATTER_DEFAULTS.scaleMin,
    scaleMax: FOREST_SCATTER_DEFAULTS.scaleMax,
    randomFacing: FOREST_SCATTER_DEFAULTS.randomFacing,
    facing: FOREST_SCATTER_DEFAULTS.facing,
    spacing: FOREST_SCATTER_DEFAULTS.spacing,
    clumping: FOREST_SCATTER_DEFAULTS.clumping,
    falloff: FOREST_SCATTER_DEFAULTS.falloff,
  });
  const materializeForestApproach = (
    configuration: ForestApproachConfiguration,
    relationship: GeneratorSectionRelationship,
  ): BoardForestSection => ({
    id: newForestSection(relationship).id,
    relationship,
    ...configuration,
    trees: configuration.trees.map((tree) => ({
      id: `tr${Math.random().toString(36).slice(2, 8)}`,
      ...tree,
    })),
  });
  // A town is sited, not painted: click to place its centre, then tune and regenerate in place.
  // Buildings are the built structures the forest list deliberately excludes.
  const townBuildingCatalog = useMemo(() => {
    const built = /cottage|cabin|lodge|house|castle|windmill|mill|tower|keep|hut|barn|farm/;
    return artworkAssets.filter((asset) => asset.kind === 'house' || built.test(asset.id));
  }, [artworkAssets]);
  // Focal structures: the one landmark a town is built around.
  const townLandmarkCatalog = useMemo(
    () => townBuildingCatalog.filter((asset) => /castle|windmill|mill|tower|keep/.test(asset.id)),
    [townBuildingCatalog],
  );
  /** Saved town instances. A board carries as many as the author places. */
  const [boardTowns, setBoardTowns] = useState<BoardTown[]>(initialBoard?.towns ?? []);
  /**
   * The open building picker: which section, and which entry it will fill. A null entryId means
   * the pick appends a new one. Picking closes it, so the grid is only ever up while choosing.
   */
  const [townPicker, setTownPicker] = useState<{ sectionId: string; entryId: string | null } | null>(null);
  /**
   * Which sections and building entries are open. Follows the cover entries' convention: something
   * you just added opens expanded because you are about to tune it, and anything loaded from a
   * saved town starts collapsed so a town of five sections is not a wall of sliders.
   */
  const [expandedTownSections, setExpandedTownSections] = useState<Set<string>>(() => new Set());
  /** Disclosure is author-controlled. Recipe validity belongs to Generate, not the Section header. */
  const townSectionOpen = (section: BoardTownSection): boolean => expandedTownSections.has(section.id);
  const toggleTownSectionExpand = (sectionId: string): void => {
    setExpandedTownSections((current) => {
      const next = new Set(current);
      if (next.has(sectionId)) next.delete(sectionId); else next.add(sectionId);
      return next;
    });
  };
  const [expandedTownBuildings, setExpandedTownBuildings] = useState<Set<string>>(() => new Set());
  /**
   * Which size bound is being shown on the board, if any. A number like "0.75x" says nothing about
   * how big a house that is next to a tile; this stands one on the board so the number has a
   * referent. Deliberately not automatic — it is a thing you ask for and dismiss.
   */
  const [townSizePreview, setTownSizePreview] = useState<
    { sectionId: string; bound: 'min' | 'max' } | null>(null);
  const toggleTownSizePreview = (sectionId: string, bound: 'min' | 'max'): void => {
    setTownSizePreview((current) => (
      current && current.sectionId === sectionId && current.bound === bound
        ? null
        : { sectionId, bound }
    ));
  };
  const toggleTownBuildingExpand = (entryId: string): void => {
    setExpandedTownBuildings((current) => {
      const next = new Set(current);
      if (next.has(entryId)) next.delete(entryId); else next.add(entryId);
      return next;
    });
  };
  const newTownSection = (relationship: GeneratorSectionRelationship = 'distinct'): BoardTownSection => ({
    id: `s${Math.random().toString(36).slice(2, 8)}`,
    relationship,
    plan: TOWN_PLAN_DEFAULTS.plan,
    size: TOWN_PLAN_DEFAULTS.size,
    buildings: [],
    scaleMean: 1,
    scaleMin: 0.75,
    scaleMax: 1.35,
    plotWidth: DEFAULT_TOWN_SECTION.plotWidth,
    landmarkIds: [],
    setback: TOWN_PLAN_DEFAULTS.setback,
    looseness: TOWN_PLAN_DEFAULTS.looseness,
    facingWobble: TOWN_PLAN_DEFAULTS.facingWobble,
    spacing: TOWN_PLAN_DEFAULTS.spacing,
    fit: TOWN_PLAN_DEFAULTS.fit,
  });
  const materializeTownApproach = (
    configuration: TownApproachConfiguration,
    relationship: GeneratorSectionRelationship,
  ): BoardTownSection => ({
    id: newTownSection(relationship).id,
    relationship,
    ...configuration,
    buildings: configuration.buildings.map((building) => ({
      id: `b${Math.random().toString(36).slice(2, 8)}`,
      ...building,
    })),
  });
  const [selectedTownId, setSelectedTownId] = useState<string | null>(null);
  /** The live selection in grid cells, snapped, so the preview shows exactly what will be used. */
  const [townDrag, setTownDrag] = useState<PlacementDrag | null>(null);
  const townDragRef = useRef<PlacementDragOrigin | null>(null);
  const [townSited, setTownSited] = useState<
    { placed: number; target: number; spacing: number; outside: number; offered: number } | null>(null);
  // Keep the selection on a town that exists. Without this the dropdown opens empty on a board
  // that already has towns, and lands on empty again whenever the selected one is removed.
  useEffect(() => {
    if (!boardTowns.length) {
      if (selectedTownId !== null) setSelectedTownId(null);
      return;
    }
    if (!boardTowns.some((town) => town.id === selectedTownId)) setSelectedTownId(boardTowns[0].id);
  }, [boardTowns, selectedTownId]);
  const selectedTown = boardTowns.find((town) => town.id === selectedTownId) ?? null;
  const townAreas = useMemo(
    () => (selectedTown ? generatorInstanceAreas(selectedTown) : []),
    [selectedTown],
  );
  const selectedTownGenerated = selectedTown
    ? boardFloatingArtwork.some((placement) => isTownMember(placement, selectedTown.id))
    : false;
  // Knob edits live in React state and are written into the document by Regenerate, the same way
  // the Generate panel holds its scatter rows until you press Generate.
  const updateTown = (id: string, change: Partial<BoardTown>): void => {
    setBoardTowns((current) => current.map((town) => (town.id === id ? { ...town, ...change } : town)));
  };
  const updateTownSection = (townId: string, sectionId: string, change: Partial<BoardTownSection>): void => {
    setBoardTowns((current) => current.map((town) => (town.id === townId
      ? { ...town, sections: town.sections.map((sec) => (sec.id === sectionId ? { ...sec, ...change } : sec)) }
      : town)));
  };
  // Ground cover is a per-tile FEATURE (density), not a doodad: which tiles grow vegetation
  // and how thick. Tufts are rolled deterministically from this density (see core/groundCover).
  const [boardCover, setBoardCover] = useState<Record<string, GroundCoverDensity>>(initialBoard?.cover ?? {});
  // Per-cell cover-set overrides (decoupling cover from terrain — e.g. grass tufts on stone). A cell
  // absent here uses its own tile terrain's cover.
  const [boardCoverTypes, setBoardCoverTypes] = useState<Record<string, TileFamilyId>>(initialBoard?.coverTypes ?? {});
  /** The seed each painted cover cell was rolled with, baked when it was painted. */
  const [boardCoverSeeds, setBoardCoverSeeds] = useState<Record<string, number>>(initialBoard?.coverSeeds ?? {});
  const [coverBrushDensity, setCoverBrushDensity] = useState<GroundCoverDensity>('sparse');
  const [coverBrushType, setCoverBrushType] = useState<GroundCoverId>(() => studioArm.kind === 'cover'
    ? groundCoverAsset(studioArm.brush).id
    : defaultGroundCoverAsset().id);
  // The seed NEW cover is painted with. Starts random like the other generators. It is baked into
  // each cell as it is painted, so changing it never touches cover already on the board.
  const [coverBrushSeed, setCoverBrushSeed] = useState(randomGeneratorSeed);
  // Render fallback for cells with no baked seed — every board authored before baking. Fixed, so
  // those boards keep rendering exactly as they always did.
  const coverSeed = LEGACY_GROUND_COVER_SEED;
  // Roads and rivers are LINEAR features (ribbons you draw), not per-cell terrain materials:
  // store each painted cell's {kind, material}, then derive its connection mask from its
  // SAME-KIND neighbours so the renderer picks straight/corner/T/cross. One unified layer —
  // roads connect to roads, rivers to rivers, never to each other. See core/featureAutotile.ts.
  const [boardFeatures, setBoardFeatures] = useState<Record<string, FeatureCell>>(initialBoard?.features ?? {});
  // Edge fences (ADR): a wall on the boundary between two tiles, keyed by the shared-edge key
  // (roadEdgeKey) -> material. Painted per-edge, not per-cell; blocks crossing that edge in play.
  const [boardFences, setBoardFences] = useState<Record<string, FenceMaterial>>(initialBoard?.fences ?? {});
  // Positive authored posts live at logical grid vertices. Automatic degree-one open-end posts are
  // still derived from the rails; these entries only add/override posts and may stand alone.
  const [boardFencePosts, setBoardFencePosts] = useState<Record<string, FenceMaterial>>(initialBoard?.fencePosts ?? {});
  const [brushIconReviewCatalog, setBrushIconReviewCatalog] = useState<AdminLiveMediaCatalog | null>(null);
  const [brushIconReviewError, setBrushIconReviewError] = useState<string | null>(null);
  const brushIconReviewCandidate = useMemo(
    () => brushIconReviewCatalog && brushIconReviewVersionId
      ? brushIconProductionCandidate(brushIconReviewCatalog, brushIconReviewVersionId)
      : null,
    [brushIconReviewCatalog, brushIconReviewVersionId],
  );
  const brushIconReviewStatus = brushIconReviewVersionId
    ? brushIconReviewError
      ? `Brush icon review unavailable: ${brushIconReviewError}`
      : brushIconReviewCandidate
        ? brushIconReviewCandidate.metadata.productionStage === LEVEL_EDITOR_BRUSH_ICON_SCALED_PRODUCTION_STAGE
          ? 'The exact owner-selected Option 01 pixels are mounted in the Brush tool with no added padding or crop.'
          : 'Exact private 18×18 Option 01 production pixels are mounted in the Brush tool.'
        : brushIconReviewCatalog
          ? 'The requested native Brush candidate is unavailable.'
          : 'Loading the private native Brush candidate…'
    : undefined;
  useEffect(() => {
    if (!brushIconReviewVersionId) return undefined;
    let cancelled = false;
    void fetchAdminLiveMediaCatalog().then((catalog) => {
      if (cancelled) return;
      setBrushIconReviewCatalog(catalog);
      setBrushIconReviewError(null);
    }).catch((error: unknown) => {
      if (cancelled) return;
      setBrushIconReviewCatalog(null);
      setBrushIconReviewError(error instanceof Error ? error.message : String(error));
    });
    return () => { cancelled = true; };
  }, [brushIconReviewVersionId]);
  const [fenceAdminCatalog, setFenceAdminCatalog] = useState<AdminLiveMediaCatalog | null>(null);
  const [fenceCatalogError, setFenceCatalogError] = useState<string | null>(null);
  const fenceArtCatalog = useMemo(() => projectFenceArtKits(fenceAdminCatalog), [fenceAdminCatalog]);
  const [selectedFenceArtworkId, setSelectedFenceArtworkId] = useState(initialFenceArtworkId);
  const activeFenceArtwork = fenceArtReviewEnabled
    ? fenceArtKit(fenceArtCatalog, selectedFenceArtworkId)
    : undefined;
  const activeFenceArtworkReview = activeFenceArtwork ? fenceArtworkBackendReview(activeFenceArtwork) : undefined;
  const fenceReviewCatalogMessage = fenceCatalogError
    ?? (fenceAdminCatalog ? 'No actionable E/S fence review kit exists in the backend catalog.' : 'Loading backend fence review media…');
  const [fenceBrushMaterial, setFenceBrushMaterial] = useState<FenceMaterial>(() => defaultFenceMaterial());
  const [fencePaintTarget, setFencePaintTarget] = useState<FencePaintTarget>('rail');
  useEffect(() => {
    if (!fenceArtReviewEnabled) return undefined;
    let cancelled = false;
    void fetchAdminLiveMediaCatalog().then((catalog) => {
      if (cancelled) return;
      setFenceAdminCatalog(catalog);
      setFenceCatalogError(null);
    }).catch((error: unknown) => {
      if (cancelled) return;
      setFenceAdminCatalog(null);
      setFenceCatalogError(error instanceof Error ? error.message : String(error));
    });
    return () => { cancelled = true; };
  }, [fenceArtReviewEnabled]);
  useEffect(() => {
    if (!activeFenceArtwork) return;
    setSelectedFenceArtworkId(activeFenceArtwork.id);
    setFenceBrushMaterial(activeFenceArtwork.material);
    if (!activeFenceArtwork.post) setFencePaintTarget('rail');
  }, [activeFenceArtwork]);
  useEffect(() => {
    if (!fenceArtReviewEnabled || !fenceAdminCatalog || activeFenceArtwork) return;
    const url = new URL(window.location.href);
    url.searchParams.delete('artReview');
    url.searchParams.delete('fenceArt');
    setFenceArtReviewDismissed(true);
    navigateApp(`${url.pathname}${url.search}${url.hash}`, { replace: true, scroll: false });
  }, [activeFenceArtwork, fenceAdminCatalog, fenceArtReviewEnabled]);
  // Edge walls use fence-style edge keys, but the editor accepts only the map's northmost
  // and westmost perimeter edges.
  const [boardWalls, setBoardWalls] = useState<Record<string, WallMaterial>>(() =>
    perimeterWalls(initialBoard?.walls, initialBoard?.cols ?? LE_COLS, initialBoard?.rows ?? LE_ROWS));
  const [wallBrushMaterial, setWallBrushMaterial] = useState<WallMaterial>(() => {
    const brush = studioArm.kind === 'wall' ? studioArm.brush : undefined;
    return isWallMaterialId(brush) ? brush : defaultWallMaterial();
  });
  const [boardSubterrain, setBoardSubterrain] = useState<SubterrainPlacementMap>(() => initialBoard?.subterrain ?? {});
  const subterrainCatalog = subterrainMaterials();
  const [subterrainBrushMaterial, setSubterrainBrushMaterial] = useState<SubterrainMaterial>(() => defaultSubterrainMaterial());
  const subterrainBrushAsset = subterrainCatalog.find((asset) => asset.id === subterrainBrushMaterial);
  const [boardWallArt, setBoardWallArt] = useState<Record<string, WallArtId>>(() =>
    perimeterWallArt(initialBoard?.wallArt, initialBoard?.cols ?? LE_COLS, initialBoard?.rows ?? LE_ROWS));
  const [wallArtBrushId, setWallArtBrushId] = useState<WallArtId>(() =>
    wallArtIdOrDefault(studioArm.kind === 'wallart' ? studioArm.brush : undefined));
  const [wallArtPlacementFeedback, setWallArtPlacementFeedback] = useState<{ tone: 'ready' | 'blocked'; message: string } | null>(null);
  const wallArtBrush = wallArt(wallArtBrushId);
  if (!wallArtBrush) throw new Error(`Selected wall art "${wallArtBrushId}" is unavailable`);
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
  const subterrainTool = brushKind === 'subterrain';
  const wallArtTool = brushKind === 'wallart';
  const [unitBrushId, setUnitBrushId] = useState<string>(() => studioArm.kind === 'unit' && studioArm.brush ? studioArm.brush : 'pawn');
  const [doodadBrushId, setDoodadBrushId] = useState<string>(() => studioArm.kind === 'doodad' && studioArm.brush ? studioArm.brush : defaultDoodadAsset().id);
  // The brush opens on the side you are authoring FOR — the board's player faction, or White on
  // a board that has not named one — so the first pieces painted land on the player's side.
  const initialUnitFaction = playerFaction ?? DEFAULT_EDITOR_PLAYER_FACTION;
  const [unitBrushDirection, setUnitBrushDirection] = useState<Direction>(() => factionDefaultDirection(initialUnitFaction, initialFactionDirections));
  const [unitFaction, setUnitFactionState] = useState<UnitPalette>(initialUnitFaction);
  const [undoStack, setUndoStack] = useState<EditorBoard[]>([]);
  const [redoStack, setRedoStack] = useState<EditorBoard[]>([]);
  // Gameplay zones: an authored list of named region entries. `boardZones` below is the legacy
  // per-cell overlay map derived from this list for board rendering and old board-code compatibility.
  const [boardZoneEntries, setBoardZoneEntries] = useState<EditorZoneEntry[]>(() => zoneEntriesForBoard(initialBoard ?? { cols: boardCols, rows: boardRows, cells: {}, units: {}, doodads: {}, props: {}, cover: {}, features: {}, featureCuts: {}, featureExits: {}, zones: {} }));
  // `?kind=zone&brush=<zoneId>` opens the Zones layer with that exact zone armed, so a review
  // link can land on the zone being discussed instead of whichever one sorts first.
  const [selectedZoneIndex, setSelectedZoneIndex] = useState(() => {
    if (studioArm.kind !== 'zone' || !studioArm.brush) return 0;
    const entries = zoneEntriesForBoard(initialBoard ?? { cols: boardCols, rows: boardRows, cells: {}, units: {}, doodads: {}, props: {}, cover: {}, features: {}, featureCuts: {}, featureExits: {}, zones: {} });
    return Math.max(0, entries.findIndex((entry) => entry.id === studioArm.brush));
  });
  const boardZones = useMemo(() => zoneCellMapFromEntries(boardZoneEntries), [boardZoneEntries]);
  // Indices of the zones that are ON the level. A dedicated zone whose type is not broken off is
  // retained but hidden: it cannot be selected, cycled, painted or seen (ADR-0367).
  const visibleZoneIndices = useMemo(() => {
    const onLevel = new Set(zoneEntriesOnLevel(boardZoneEntries));
    return boardZoneEntries.flatMap((entry, index) => onLevel.has(entry) ? [index] : []);
  }, [boardZoneEntries]);
  const activeZone = visibleZoneIndices.includes(selectedZoneIndex) ? boardZoneEntries[selectedZoneIndex] ?? null : null;
  const activeZoneName = activeZone ? zoneDisplayName(activeZone, selectedZoneIndex) : '';
  const activeZoneNameValue = activeZone ? activeZone.name ?? activeZoneName : '';
  const activeZoneColor = activeZone ? zoneDisplayColor(activeZone) : DEFAULT_ZONE_COLOR;
  const activeZoneColorLabel = LE_ZONE_COLOR_OPTIONS.find((option) => option.color === activeZoneColor)?.label ?? activeZoneColor;
  const activeZoneOverlay = useMemo(() => activeZone ? zoneCellColorMapFromEntries([activeZone]) : {}, [activeZone]);
  const visibleZones = brushKind === 'zone' ? activeZoneOverlay : {};
  useEffect(() => {
    if (visibleZoneIndices.includes(selectedZoneIndex)) return;
    setSelectedZoneIndex(visibleZoneIndices[0] ?? 0);
  }, [visibleZoneIndices, selectedZoneIndex]);

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
  // The Deployment deal this War Battle authors — how many cards the player is dealt to field an
  // army on THIS board. Off by default: the level then defers to the Run's own progression. Seeded
  // like the clock, a restored draft ahead of the campaign level.
  const [battleCardsDealt, setBattleCardsDealtState] = useState<number>(
    localDraft?.cardsDealt ?? initialCampaignLevel?.battle?.cardsDealt ?? LEVEL_BATTLE_CARDS_DEALT_DEFAULT,
  );
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
  // The victory-events editor replaces the board inside the shell-owned workspace. The title bar
  // and right controls stay put; the workspace supplies the room the rules instrument needs.
  const [eventsOpen, setEventsOpen] = useState(initialEventsOpen);
  // The template dropdown choices append event rows; Clear is the explicit page-local reset.
  const [templateChoice, setTemplateChoiceState] = useState<ObjectiveType>(objective);
  const [otherTemplateChoice, setOtherTemplateChoice] = useState<OtherEventTemplateId>('pawn-promotion');
  // The Events workspace separates victory rules, initial-force deployment, and other events.
  const [eventsTab, setEventsTab] = useState<LevelEditorEventsTab>(initialEventsTab);
  // Level Artwork is a normal side-controls layer. Its two roomier instruments are explicit,
  // route-addressable center workspaces, so merely selecting the layer never hides the board.
  const [levelArtworkWorkspace, setLevelArtworkWorkspace] = useState<LevelArtworkWorkspace | undefined>(
    initialLevelArtworkWorkspace,
  );

  // The level being edited (campaign path). `levelId` is the store key the Save writes back
  // through; `editingId` may differ once a cold board is saved (Phase 3). The name is edited in
  // Status, beside the save workflow; `savedSig` is the level signature at last save, the dirty basis.
  const [editingId, setEditingId] = useState<string | undefined>(routeParams.levelId ?? localDraft?.editingId);
  const [levelName, setLevelNameState] = useState<string>(localDraft?.levelName ?? initialCampaignLevel?.name ?? urlLevelName ?? DEFAULT_LEVEL_NAME);
  const levelNameForSave = useMemo(() => normalizeLevelName(levelName), [levelName]);
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
  const setBattleCardsDealt = authorRulesField('battleDeal', setBattleCardsDealtState);
  const [quietDraftRestore] = useState(() => consumeNewBuildReloadIntent());
  const [statusLog, setStatusLog] = useState<StatusLogEntry[]>([]);
  const statusLogSeq = useRef(0);
  const [saving, setSaving] = useState(false);
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
  const eventsOpenRef = useRef(eventsOpen);
  eventsOpenRef.current = eventsOpen;
  const eventsOpenButtonRef = useRef<HTMLButtonElement>(null);
  const editorRecoveryOverviewRef = useRef<HTMLElement>(null);
  const pendingRulesExitActionRef = useRef<(() => void) | null>(null);
  const departureFlushSigRef = useRef<string | null>(null);
  const signInHandoffPendingRef = useRef(false);
  const navigationReleaseInFlightRef = useRef(false);
  const navigationReleaseCompleteRef = useRef(false);
  const sameDocumentRemountRef = useRef(false);

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
      // The armed zone rides the same stamp, so a copied Zones URL reopens on the zone the author
      // was painting rather than on whichever entry sorts first.
      brush: brushKind === 'wallart' ? wallArtBrushId : brushKind === 'zone' ? (activeZone?.id ?? null) : null,
      levelArtworkWorkspace: layer === 'level-artwork' ? levelArtworkWorkspace : null,
    });
    navigateApp(nextHref, { replace: true, scroll: false });
  }, [levelArtworkWorkspace, brushKind, layer, wallArtBrushId, activeZone?.id]);

  useEffect(() => {
    const syncFromRoute = (): void => {
      if (!isLevelEditorRoutePath(window.location.pathname)) return;
      const rawRouteState = readLevelEditorRouteState(window.location.search);
      const routeState = rawRouteState.brushKind === 'wall' && wallArt(rawRouteState.brush)
        ? { ...rawRouteState, layer: 'wallart' as const, brushKind: 'wallart' as const }
        : rawRouteState;
      const nextLayer = routeState.layer ?? defaultLevelEditorLayer();
      const routeSearchParams = new URLSearchParams(window.location.search);
      if (
        isLayerOptionDisabled(nextLayer)
        || (isPredrawnBoard && isPredrawnLockedLayer(nextLayer))
      ) return;
      setLayer(nextLayer);
      const nextBrushKind = brushKindForRouteState(nextLayer, routeState.brushKind);
      setTool(nextLayer === 'placed-art' && nextBrushKind === 'artwork' ? 'select' : toolForLayer(nextLayer));
      setArtworkSelectionActive(false);
      setBrushKind(nextBrushKind);
      if (isPlacedArtBrushKind(nextBrushKind)) setPlacedArtKind(nextBrushKind);
      setLevelArtworkWorkspace(
        nextLayer === 'level-artwork' ? routeState.levelArtworkWorkspace : undefined,
      );
      if (routeState.brushKind === 'wallart') {
        setWallArtBrushId(wallArtIdOrDefault(routeState.brush));
      }
      const nextEventsOpen = nextLayer === 'rules' && routeState.eventsEditor;
      const nextEventsTab: LevelEditorEventsTab = routeState.eventsTab ?? 'victory';
      const wasEventsOpen = eventsOpenRef.current;
      eventsOpenRef.current = nextEventsOpen;
      setEventsOpen(nextEventsOpen);
      setEventsTab(nextEventsTab);
      const pendingExitAction = pendingRulesExitActionRef.current;
      if (!nextEventsOpen && pendingExitAction) {
        pendingRulesExitActionRef.current = null;
        pendingExitAction();
      } else if (wasEventsOpen && !nextEventsOpen) {
        window.requestAnimationFrame(() => eventsOpenButtonRef.current?.focus());
      }
      if (routeSearchParams.get('artReview') === FENCE_ART_REVIEW_ID) {
        const nextArtwork = fenceArtKit(fenceArtCatalog, routeSearchParams.get('fenceArt'));
        if (nextArtwork) {
          setSelectedFenceArtworkId(nextArtwork.id);
          setFenceBrushMaterial(nextArtwork.material);
          if (!nextArtwork.post) setFencePaintTarget('rail');
        }
      }
    };
    return subscribeAppLocation(syncFromRoute);
  }, [fenceArtCatalog, isPredrawnBoard]);

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
    if (guarded.apply.battleDeal) {
      setBattleCardsDealtState(seed.battleDeal);
    }
    if (guarded.apply.victory) setVictoryState(seed.victory);
    if (guarded.apply.events) setEventsState(seed.events);
    if (guarded.apply.name) setLevelNameState(seed.name);
    seedSkewRef.current = mode === 'seed' && guarded.skippedAuthored ? seed : null;
  };

  // Every route that hydrates an EditorBoard must use this complete field mapping. Keeping the
  // document-load and undo/redo paths on one primitive prevents newly persisted visual channels
  // (such as explicit Subterrain or generation framing) from being silently reset and autosaved.
  const applyEditorBoard = (board: EditorBoard): void => {
    setBoardCols(board.cols);
    setBoardRows(board.rows);
    setBoardCameraBounds(board.cameraBounds);
    setDecorativeApron(board.decorativeApron ?? { top: 0, right: 0, bottom: 0, left: 0 });
    setDecorativeCells(board.decorativeCells ?? {});
    setDecorativeFootprint(board.decorativeFootprint ?? []);
    setDecorativeFeatures(board.decorativeFeatures ?? {});
    setDecorativeFences(board.decorativeFences ?? {});
    setDecorativeFencePosts(board.decorativeFencePosts ?? {});
    setDecorativeWalls(board.decorativeWalls ?? {});
    setBoardCells(board.cells);
    setBoardSurface(board.surface);
    setBoardPredrawnGridDetached(board.predrawnGridDetached === true);
    setBoardPredrawnPlateOffset(board.predrawnPlateOffset);
    setBoardBackgroundModeState(boardBackgroundMode(board));
    setBoardPredrawnGenerationFrame(board.predrawnGenerationFrame);
    setBoardMacroTiles(validMacroTilesForBoard(board));
    setBoardUnits(board.units as Record<string, BoardUnitPlacement>);
    setBoardDoodads(board.doodads);
    setBoardProps(board.props);
    setBoardFloatingArtwork(board.floatingArtwork ?? []);
    setBoardForests(board.forests ?? []);
    setBoardCover(board.cover);
    setBoardTowns(board.towns ?? []);
    setBoardCoverSeeds(board.coverSeeds ?? {});
    setBoardCoverTypes(board.coverTypes ?? {});
    setBoardFeatures(board.features);
    setBoardFences(board.fences ?? {});
    setBoardFencePosts(board.fencePosts ?? {});
    setBoardWalls(perimeterWalls(board.walls, board.cols, board.rows));
    setBoardWallArt(perimeterWallArt(board.wallArt, board.cols, board.rows));
    setBoardSubterrain(board.subterrain ?? {});
    setFeatureCuts(board.featureCuts);
    setFeatureExits(board.featureExits);
    setBoardZoneEntries(zoneEntriesForBoard(board));
    setGeneratedRegions(board.generatedRegions ?? []);
    setPlayerFaction((board.playerFaction && (UNIT_PALETTES as readonly string[]).includes(board.playerFaction)) ? board.playerFaction as UnitPalette : null);
    setBoardFactionDirections(normalizeFactionDirections(board.factionDirections));
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

  const resolveAsset = (id: string): StudioAsset | undefined => leAllTiles().find((asset) => asset.id === id);
  // The current painted board as a single EditorBoard — the one shape both the transient
  // play-test URL and the level save serialize from, so they can never describe different boards.
  const currentEditorBoard = useMemo<EditorBoard>(
    () => ({ cols: boardCols, rows: boardRows, cameraBounds: boardCameraBounds, decorativeApron, decorativeCells, decorativeFootprint, decorativeFeatures, decorativeFences, decorativeFencePosts, decorativeWalls, playerFaction, factionDirections: boardFactionDirections, cells: boardCells, backgroundMode: boardBackgroundModeState, surface: boardSurface, predrawnGridDetached: boardPredrawnGridDetached, predrawnPlateOffset: boardPredrawnPlateOffset, predrawnGenerationFrame: boardPredrawnGenerationFrame, macroTiles: boardMacroTiles, units: boardUnits, doodads: boardDoodads, props: boardProps, floatingArtwork: boardFloatingArtwork, cover: boardCover, coverTypes: boardCoverTypes, coverSeeds: boardCoverSeeds, features: boardFeatures, fences: boardFences, fencePosts: boardFencePosts, walls: boardWalls, wallArt: boardWallArt, subterrain: boardSubterrain, featureCuts, featureExits, zoneEntries: boardZoneEntries, zones: boardZones, generatedRegions, towns: boardTowns, forests: boardForests }),
    [boardCols, boardRows, boardCameraBounds, decorativeApron, decorativeCells, decorativeFootprint, decorativeFeatures, decorativeFences, decorativeFencePosts, decorativeWalls, playerFaction, boardFactionDirections, boardCells, boardBackgroundModeState, boardSurface, boardPredrawnGridDetached, boardPredrawnPlateOffset, boardPredrawnGenerationFrame, boardMacroTiles, boardUnits, boardDoodads, boardProps, boardFloatingArtwork, boardCover, boardCoverTypes, boardCoverSeeds, boardFeatures, boardFences, boardFencePosts, boardWalls, boardWallArt, boardSubterrain, featureCuts, featureExits, boardZoneEntries, boardZones, generatedRegions, boardTowns, boardForests],
  );
  const predrawnVersionCells = useMemo(
    () => Array.from({ length: boardRows }, (_, y) => (
      Array.from({ length: boardCols }, (__, x) => ({ x, y }))
    )).flat(),
    [boardCols, boardRows],
  );
  const currentVersionedPredrawnSurface = boardSurface && isVersionedPredrawnBoardSurface(boardSurface)
    ? boardSurface
    : undefined;
  // Keyed on the WHOLE remembered surface, not just a versioned one: swapping between two plates,
  // or clearing one, has to re-seed the check exactly as a version swap does.
  const currentPredrawnSurfaceKey = boardSurface ? JSON.stringify(boardSurface) : '';
  const currentEnvironmentGeometryFingerprintV2 = useMemo(
    () => predrawnEnvironmentGeometryFingerprintInputV2(currentEditorBoard),
    [currentEditorBoard],
  );
  useEffect(() => {
    // Only a versioned selection has a list to prove. A plate settles here without a read at all,
    // and an absent surface settles as `missing` — neither reaches the server.
    if (!currentVersionedPredrawnSurface) {
      setPredrawnSelectionValidation(predrawnSelectionSeed(boardSurface));
      return undefined;
    }
    if (!editorDocument) {
      setPredrawnSelectionValidation({
        kind: 'error',
        message: 'The immutable artwork selection cannot be checked without its editor document.',
      });
      return undefined;
    }
    let cancelled = false;
    setPredrawnSelectionValidation({ kind: 'checking' });
    void Promise.all([
      listPredrawnBackgroundVersions(editorDocument.document_id),
      legacyPredrawnEnvironmentGeometrySha256V1(currentEditorBoard),
      predrawnEnvironmentGeometrySha256(currentEditorBoard),
    ]).then(([versions, v1, v2]) => {
      if (cancelled) return;
      setPredrawnSelectionValidation(resolvePredrawnSelectionValidity(
        currentVersionedPredrawnSurface,
        versions,
        { v1, v2 },
        currentEditorBoard,
      ));
    }).catch((cause) => {
      if (cancelled) return;
      // A 401 here is the shared sign-in expiring under an open document, not a bad selection.
      // Hand it to ADR-0306's authoritative owner so the whole shell — including ADR-0519's pause
      // — agrees about what happened, instead of this one screen inventing its own verdict.
      //
      // Only until the owner has once AGREED this is a 401, though. ADR-0519's probe answers a 401
      // it disagrees with by restoring the session, which this screen reads as "signed back in" and
      // retries; reporting the identical 401 again would flip identity straight back and spin the
      // two against each other. A failure it has not yet called a 401 is always reported, so a
      // transport error that later becomes a real 401 still reaches the owner. The latch clears as
      // soon as the check settles into anything but an unread list.
      const signedOut = predrawnUnauthorizedReportedRef.current || reportAuthSessionFailure(cause);
      predrawnUnauthorizedReportedRef.current = signedOut;
      setPredrawnSelectionValidation(predrawnSelectionReadFailure(cause, signedOut));
    });
    return () => { cancelled = true; };
  }, [
    currentEnvironmentGeometryFingerprintV2,
    currentPredrawnSurfaceKey,
    editorDocument?.document_id,
    predrawnValidationAttempt,
  ]);
  const currentEditorBoardRef = useRef(currentEditorBoard);
  useEffect(() => { currentEditorBoardRef.current = currentEditorBoard; }, [currentEditorBoard]);
  const applyEditorBoardWithSelectionSafety = (board: EditorBoard): void => {
    applyEditorBoard(board);
    const nextGeneratedRegions = board.generatedRegions ?? [];
    if (activeGeneratedRegionId && !nextGeneratedRegions.some((region) => region.id === activeGeneratedRegionId)) {
      setActiveGeneratedRegionId(null);
      setRegionSelection(new Set());
    }
    const nextForests = board.forests ?? [];
    if (selectedForestId && !nextForests.some((forest) => forest.id === selectedForestId)) {
      setSelectedForestId(null);
      setForestGenerationResult(null);
    }
  };
  // A Level load and an undo/import restore must hydrate the exact same complete EditorBoard.
  // Keeping a second list of board setters previously omitted subterrain and turned opening a
  // document into a destructive autosave. The one primitive above is the hydration authority.
  const applyLevelDocument = (level: Level, options: { editingId?: string; clean?: boolean; seed?: boolean } = {}): void => {
    const board = levelToEditorBoard(level);
    if (predrawnSelectionNeedsRevalidation(currentEditorBoardRef.current, board)) {
      setPredrawnSelectionValidation(predrawnSelectionSeed(board.surface));
    }
    applyEditorBoard(board);
    setActiveGeneratedRegionId(null);
    setRegionSelection(new Set());
    setUndoStack([]);
    setRedoStack([]);
    applyLevelRules(level, options.seed ? 'seed' : 'load');
    setEditingId(options.editingId);
    if (options.clean !== false) {
      setSavedSig(normalizedLevelEditorSignature(level));
      needsBaselineRef.current = true;
    }
  };
  const commitEditorBoard = (
    next: EditorBoard,
    selection?: { x: number; y: number } | null,
    options: { playableWindow?: boolean } = {},
  ): boolean => {
    const current = currentEditorBoardRef.current;
    const normalized = { ...next, macroTiles: validMacroTilesForBoard(next) };
    // The baked-art guard stops an EDIT from silently contradicting pixels the plate already owns.
    // Resizing the grid and sliding it across the artwork are not that: they declare themselves,
    // they change no depicted family on purpose, and rebasing or pruning coordinates is the
    // mechanical consequence the owner asked for. They pass `playableWindow` and are let through.
    if (isPredrawnBoard && !options.playableWindow && !preservesPredrawnBakedArt(current, normalized)) {
      return false;
    }
    if (boardSignature(normalized) === boardSignature(current)) return false;
    if (predrawnSelectionNeedsRevalidation(current, normalized)) {
      setPredrawnSelectionValidation(predrawnSelectionSeed(normalized.surface));
    }
    setUndoStack((prev) => [...prev, cloneEditorBoard(current)].slice(-HISTORY_LIMIT));
    setRedoStack([]);
    currentEditorBoardRef.current = normalized;
    applyEditorBoardWithSelectionSafety(normalized);
    if (selection !== undefined) setSelectedCell(selection);
    return true;
  };
  const authoredCameraZoomIn = normalizeCameraZoomIn(currentEditorBoard.cameraZoomIn);
  const commitCameraZoomIn = (zoom: number | undefined): void => {
    if (!editorSessionCanWrite) {
      reportStatus(
        'Camera zoom limit is read-only.',
        'warning',
        'Reload an owner editing page to reconnect live sync.',
      );
      return;
    }
    const current = currentEditorBoardRef.current;
    const cameraZoomIn = normalizeCameraZoomIn(zoom);
    if (commitEditorBoard({ ...cloneEditorBoard(current), cameraZoomIn })) {
      reportStatus(
        cameraZoomIn ? `Zoom-in limit set to ${cameraZoomIn}×.` : 'Zoom-in limit back to automatic.',
        'success',
        cameraZoomIn
          ? 'Play lets a player zoom in this far on this level and no further.'
          : 'Play derives the limit from this level’s own zoom floor again.',
      );
    }
  };
  /**
   * Whether the whole camera boundary is currently on screen.
   *
   * A boundary larger than the canvas draws entirely outside it, handles and all, which looks
   * exactly like no boundary at all. The panel says so, and offers the way back.
   */
  const cameraBoundaryVisibility = ((): 'unknown' | 'visible' | 'off-screen' => {
    if (!viewViewportSize) return 'unknown';
    const seen = worldViewportForCamera({
      viewport: viewViewportSize,
      camera: { zoom: viewZoom, pan: viewPan },
    });
    const box = resolvedCameraBoundary;
    return seen.minX <= box.minX
      && seen.minY <= box.minY
      && seen.minX + seen.width >= box.minX + box.width
      && seen.minY + seen.height >= box.minY + box.height
      ? 'visible'
      : 'off-screen';
  })();
  const showCameraBoundary = (): void => frameCameraBoundary(resolvedCameraBoundary);
  /** Author the limit by SHOWING it: zoom the canvas to the tightest a player should get. */
  const setCameraZoomInFromView = (): void => {
    commitCameraZoomIn(viewZoom);
  };
  /** And read it back the same way, so a stated limit is always something you can look at. */
  const showCameraZoomIn = (): void => {
    if (!authoredCameraZoomIn) return;
    markBoardViewInteraction();
    setViewZoom(Math.min(viewMaxZoom, Math.max(viewMinZoom, authoredCameraZoomIn)));
  };
  const commitCameraBoundary = (bounds: BoardCameraBounds): void => {
    if (!editorSessionCanWrite) {
      reportStatus(
        'Camera boundary is read-only.',
        'warning',
        'Reload an owner editing page to reconnect live sync.',
      );
      return;
    }
    const current = currentEditorBoardRef.current;
    const normalized = normalizeBoardCameraBounds(bounds, current);
    if (!normalized) return;
    if (commitEditorBoard({ ...cloneEditorBoard(current), cameraBounds: normalized })) {
      reportStatus(
        'Camera boundary updated.',
        'success',
        'Play now derives its zoom-out and pan limits from this box.',
      );
    }
  };
  const snapCameraBoundary = (): void => {
    const bounds = defaultBoardCameraBounds(
      { cols: boardCols, rows: boardRows },
      cameraSnapMode,
    );
    commitCameraBoundary(bounds);
    setCameraBoundaryInteractionMode('edit');
    frameCameraBoundary(bounds);
  };
  const setCameraBoundaryFromView = (): void => {
    if (!viewViewportSize) {
      reportStatus(
        'The current view is not ready yet.',
        'warning',
        'Wait for the canvas to finish measuring, then try again.',
      );
      return;
    }
    const current = currentEditorBoardRef.current;
    const visibleBounds = worldViewportForCamera({
      viewport: viewViewportSize,
      camera: { zoom: viewZoom, pan: viewPan },
    });
    const normalized = normalizeBoardCameraBounds(visibleBounds, current);
    if (!normalized) return;
    commitCameraBoundary(visibleBounds);
    setCameraBoundaryInteractionMode('edit');
    const expandedForOpeningFrame = normalized.minX !== visibleBounds.minX
      || normalized.minY !== visibleBounds.minY
      || normalized.width !== visibleBounds.width
      || normalized.height !== visibleBounds.height;
    reportStatus(
      'Camera boundary set from the current view.',
      'success',
      expandedForOpeningFrame
        ? 'The boundary was expanded just enough to retain the required opening board frame.'
        : 'Play now uses this visible rectangle as its zoom-out and pan limit.',
    );
  };
  const setPredrawnVersionSurface = (surface: VersionedPredrawnBoardSurface): void => {
    if (!editorSessionCanWrite) {
      reportStatus(
        'AI artwork selection is read-only.',
        'warning',
        'This review page is read-only.',
      );
      return;
    }
    const current = currentEditorBoardRef.current;
    // Newly set artwork was generated FROM the geometry on screen, so it arrives bound to it again:
    // the detachment and the hand placement both belong to the selection they were made against.
    const next = {
      ...cloneEditorBoard(current),
      surface,
      predrawnGridDetached: false,
      predrawnPlateOffset: undefined,
    };
    if (boardSignature(next) === boardSignature(current)) return;
    setPredrawnSelectionValidation({ kind: 'checking' });
    setUndoStack((previous) => [...previous, cloneEditorBoard(current)].slice(-HISTORY_LIMIT));
    setRedoStack([]);
    currentEditorBoardRef.current = next;
    applyEditorBoardWithSelectionSafety(next);
    reportStatus(
      'AI artwork selection updated.',
      'success',
      boardBackgroundMode(next) === 'ai'
        ? 'The selected version is visible now and is being autosaved to the working copy.'
        : 'The level remains in Legacy tileset mode. Switch to AI artwork when you want this remembered version to render.',
    );
  };
  const setLevelBackgroundMode = (mode: BoardBackgroundMode): void => {
    if (!editorSessionCanWrite) {
      reportStatus(
        'Level background is read-only.',
        'warning',
        'This review page is read-only.',
      );
      return;
    }
    const current = currentEditorBoardRef.current;
    if (mode === 'ai' && !predrawnSelectionIsDrawable(predrawnSelectionValidation)) {
      const detail = predrawnSelectionValidation.kind === 'stale'
        ? 'The remembered artwork belongs to an earlier terrain or scenery layout. Set matching artwork from a new attempt before activating AI mode.'
        : predrawnSelectionValidation.kind === 'checking'
          ? 'Wait for the remembered artwork selection to finish validating.'
          : predrawnSelectionValidation.kind === 'unreachable'
            ? 'The remembered artwork could not be read, so it cannot be activated yet. This retries on its own; sign in again if your session expired.'
            : 'Open the Board Art Pipeline and Set a complete artwork version for this level first.';
      reportStatus(
        'AI artwork is unavailable.',
        'warning',
        detail,
      );
      return;
    }
    const changed = commitEditorBoard({
      ...cloneEditorBoard(current),
      backgroundMode: mode,
    });
    if (!changed) return;
    reportStatus(
      mode === 'ai' ? 'AI artwork is now the level background.' : 'Legacy tileset is now the level background.',
      'success',
      mode === 'ai'
        ? 'This changes the saved level appearance. Your selected AI version remains editable through the pipeline.'
        : 'Terrain and scenery editing is available again. The selected AI artwork is remembered and was not discarded.',
    );
  };
  const applyPredrawnGenerationFrame = (frame: PredrawnGenerationFrame): void => {
    if (!editorSessionCanWrite) {
      reportStatus(
        'Viewing pane is read-only.',
        'warning',
        'This review page is read-only.',
      );
      return;
    }
    const changed = commitEditorBoard({
      ...cloneEditorBoard(currentEditorBoardRef.current),
      predrawnGenerationFrame: frame,
    });
    if (changed) {
      reportStatus(
        'Generation frame applied in this editor.',
        'success',
        'It is being autosaved to the working copy. Publishing or saving the level remains a separate action.',
      );
    }
  };
  const fillVisibleScenicTerrain = (): void => {
    if (!viewViewportSize) {
      reportStatus('Visible terrain fill is not ready yet.', 'info', 'The board viewport is still being measured.');
      return;
    }
    const targetResult = scenicTerrainTargetsForViewport({
      cols: boardCols,
      rows: boardRows,
      viewport: viewViewportSize,
      zoom: viewZoom,
      pan: viewPan,
      activeScenicCellKeys: scenicTerrainCoordinateKeys,
    });
    if (targetResult.status === 'invalid-input') {
      reportStatus('Visible terrain fill could not read this view.', 'warning', 'Reset the board view, then try again.');
      return;
    }
    if (targetResult.status === 'limit-reached') {
      reportStatus(
        'Visible terrain fill is too large.',
        'warning',
        `Zoom in until the view needs fewer than ${targetResult.limit.toLocaleString()} new tiles. Nothing was changed.`,
      );
      return;
    }
    if (targetResult.targets.length === 0) {
      reportStatus('The visible area is already filled.', 'info');
      return;
    }
    const current = currentEditorBoardRef.current;
    const beforeFootprint = new Set(current.decorativeFootprint ?? []);
    const next = fillScenicTerrainViewportTargets(
      current,
      targetResult.targets,
      scenicTerrainGenerationMode === 'grass'
        ? { kind: 'grass', tileId: leDefaultTile().id }
        : { kind: 'match-reference' },
    );
    const addedKeys = (next.decorativeFootprint ?? []).filter((key) => !beforeFootprint.has(key));
    const addedCount = addedKeys.length;
    const blankCount = addedKeys.filter(
      (key) => !Object.prototype.hasOwnProperty.call(next.decorativeCells ?? {}, key),
    ).length;
    if (addedCount <= 0 || !commitEditorBoard(next)) return;
    reportStatus(
      `Filled ${addedCount.toLocaleString()} visible scenic cell${addedCount === 1 ? '' : 's'}.`,
      'success',
      `Only tile diamonds touching the current view were added. Undo restores the whole fill.${blankCount > 0 ? ` ${blankCount.toLocaleString()} aligned reference${blankCount === 1 ? ' was' : 's were'} empty, so those cells remain blank.` : ''}`,
    );
  };
  const extendScenicTerrain = (sides: readonly DecorativeTerrainSide[]): void => {
    const current = currentEditorBoardRef.current;
    const growthMode = scenicTerrainGenerationMode === 'grass'
      ? { kind: 'fill' as const, value: leDefaultTile().id }
      : { kind: 'match-reference' as const };
    let extension = {
      extents: current.decorativeApron ?? { top: 0, right: 0, bottom: 0, left: 0 },
      authored: current.decorativeCells ?? {},
    };
    let changed = false;
    for (const side of sides) {
      if (extension.extents[side] >= MAX_SCENIC_TERRAIN_EXTENT) continue;
      extension = extendDecorativeTerrainApron<string>(
        current.cols,
        current.rows,
        extension.extents,
        extension.authored,
        side,
        growthMode,
      );
      changed = true;
    }
    if (!changed) return;
    const next = cloneEditorBoard(current);
    next.decorativeApron = extension.extents;
    next.decorativeCells = extension.authored;
    commitEditorBoard(next);
  };
  const stepScenicTerrainExtents = (sides: readonly DecorativeTerrainSide[], delta: -1 | 1): void => {
    if (delta > 0) {
      extendScenicTerrain(sides);
      return;
    }
    const current = currentEditorBoardRef.current;
    const extents = current.decorativeApron ?? { top: 0, right: 0, bottom: 0, left: 0 };
    const reducedExtents = { ...extents };
    let changed = false;
    for (const side of sides) {
      if (reducedExtents[side] <= 0) continue;
      reducedExtents[side] -= 1;
      changed = true;
    }
    if (!changed) return;
    const next = cloneEditorBoard(current);
    next.decorativeApron = reducedExtents;
    commitEditorBoard(next);
  };
  const stepScenicTerrainExtent = (side: DecorativeTerrainSide, delta: -1 | 1): void => {
    stepScenicTerrainExtents([side], delta);
  };
  // In both directions the DEPARTING board must be snapshotted BEFORE queueing the stack
  // update: React runs the updater after this handler has already repointed
  // currentEditorBoardRef at the restored board, so reading the ref inside the updater
  // captures the wrong side of the swap (redo would "restore" the board already shown).
  const undoBoard = (): void => {
    const prev = undoStack[undoStack.length - 1];
    if (!prev) return;
    if (isPredrawnBoard && !sharesPredrawnSelection(currentEditorBoardRef.current, prev)) return;
    const departing = cloneEditorBoard(currentEditorBoardRef.current);
    setRedoStack((next) => [departing, ...next].slice(0, HISTORY_LIMIT));
    setUndoStack((next) => next.slice(0, -1));
    const restored = cloneEditorBoard(prev);
    setPredrawnSelectionValidation(predrawnSelectionSeed(restored.surface));
    currentEditorBoardRef.current = restored;
    applyEditorBoardWithSelectionSafety(restored);
    setForestDrag(null);
    setForestGenerationResult(null);
    setSelectedCell(null);
    setSelectedArtworkId(null);
  };
  const redoBoard = (): void => {
    const next = redoStack[0];
    if (!next) return;
    if (isPredrawnBoard && !sharesPredrawnSelection(currentEditorBoardRef.current, next)) return;
    const departing = cloneEditorBoard(currentEditorBoardRef.current);
    setUndoStack((prev) => [...prev, departing].slice(-HISTORY_LIMIT));
    setRedoStack((prev) => prev.slice(1));
    const restored = cloneEditorBoard(next);
    setPredrawnSelectionValidation(predrawnSelectionSeed(restored.surface));
    currentEditorBoardRef.current = restored;
    applyEditorBoardWithSelectionSafety(restored);
    setForestDrag(null);
    setForestGenerationResult(null);
    setSelectedCell(null);
    setSelectedArtworkId(null);
  };
  const setPlayerFactionWithHistory = (faction: UnitPalette | null): void => {
    if (playerFaction === faction) return;
    const next = cloneEditorBoard(currentEditorBoardRef.current);
    next.playerFaction = faction;
    commitEditorBoard(next);
  };
  const brushAsset = resolveAsset(brushId);
  if (!brushAsset) throw new Error(`Selected terrain surface "${brushId}" is unavailable`);
  const macroTileBrushAsset = macroTileBrushId ? macroTileAsset(macroTileBrushId) : undefined;
  const resolveUnitAsset = (id: string): UnitAsset | undefined => unitArtForId(id);
  const unitBrushAsset = resolveUnitAsset(unitBrushId);
  if (!unitBrushAsset) throw new Error(`Selected unit art "${unitBrushId}" is unavailable`);
  const directionForFaction = (faction: UnitPalette): Direction => factionDefaultDirection(faction, boardFactionDirections);
  const setUnitFaction = (faction: UnitPalette): void => {
    setUnitFactionState(faction);
    const dir = directionForFaction(faction);
    setUnitBrushDirection(hasDirectionSprite(unitBrushAsset, dir) ? dir : 'south');
  };
  // Recolour a whole faction in place: every unit wearing `from` changes to `to`, and the
  // faction's authored identity travels with it (who the player controls, its default facing,
  // the paint brush if it was armed with that colour). Only a palette nothing else on the board
  // wears is offered, so this can never silently MERGE two sides into one.
  const recolorFaction = (from: UnitPalette, to: UnitPalette): void => {
    if (from === to) return;
    const next = cloneEditorBoard(currentEditorBoardRef.current);
    for (const [key, unit] of Object.entries(next.units)) {
      if (unit.faction === from) next.units[key] = { ...unit, faction: to };
    }
    const directions = normalizeFactionDirections(next.factionDirections);
    if (directions[from] !== undefined) {
      const carried = directions[from];
      delete directions[from];
      // An authored facing that happens to equal the new colour's own default stays implicit,
      // so a recolour cannot introduce a redundant override the editor would have omitted.
      if (carried !== DEFAULT_FACTION_DIRECTIONS[to]) directions[to] = carried;
    }
    next.factionDirections = directions;
    if (next.playerFaction === from) next.playerFaction = to;
    commitEditorBoard(next);
    if (unitFaction === from) setUnitFaction(to);
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
  const doodadBrushAsset = resolveDoodadAsset(doodadBrushId);
  if (!doodadBrushAsset) throw new Error(`Selected doodad "${doodadBrushId}" is unavailable`);
  const coverBrushAsset = groundCoverAsset(coverBrushType);
  // HARD terrain gate (mirrors the Studio): a doodad only lands on a tile of its home terrain.
  const doodadFitsTile = (doodad: DoodadAsset, tileId: string | undefined): boolean => {
    const terrain = tileId ? leFamilyOfTile(tileId)?.id : undefined;
    return terrain !== undefined && doodad.terrains.includes(terrain);
  };
  const resolvePropDef = (id: string): PropDef | undefined => propDef(id);
  const propBrushDef = resolvePropDef(propBrushId);
  if (!propBrushDef) throw new Error(`Selected prop "${propBrushId}" is unavailable`);
  const artworkBrushAsset = artworkBrushId ? structureArtAsset(artworkBrushId) : undefined;
  const artworkBrushDirections = artworkBrushId ? structureArtDirections(artworkBrushId) : [];
  const authoredCellTileId = (x: number, y: number): string | undefined => {
    const key = `${x},${y}`;
    if (!cellWithinScenicSurface(key)) return undefined;
    return scenicTerrainValueAt(
      x,
      y,
      boardCols,
      boardRows,
      (sourceX, sourceY) => boardCells[`${sourceX},${sourceY}`],
      (authoredX, authoredY) => decorativeCells[`${authoredX},${authoredY}`],
    );
  };
  // A prop sits on authored GROUND, and the authored board extends past the playable rectangle into
  // the scenic apron (ADR-0098/ADR-0365): every footprint cell must be an authored surface cell —
  // playable or scenic — whose tile family accepts the prop, and the footprint must be wholly on
  // one side of the playable edge. The terrain gate is what bounds an off-board prop: past the
  // apron there is no tile, so there is nothing to stand on. Only playable props project into
  // layers.props, so an off-board prop is scenery with no collider — which is exactly why a
  // straddling footprint is refused. Scene Art still owns free pixel placement off the terrain.
  const propFitsBoard = (def: PropDef, ax: number, ay: number): boolean => {
    const footprint = propCells(ax, ay, def);
    if (!isPropFootprintOnAuthoredSurface(footprint, boardCols, boardRows, (x, y) => cellWithinScenicSurface(`${x},${y}`))) return false;
    return footprint.every((c) => {
      const tileId = authoredCellTileId(c.x, c.y);
      const fam = tileId ? leFamilyOfTile(tileId)?.id : undefined;
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
    return resolveFeatureOverlays({ ...boardFeatures, ...decorativeFeatures }, isSevered, isExit);
  }, [boardFeatures, decorativeFeatures, featureCuts, featureExits]);
  const borderRoadKeys = useMemo(() => playableBorderRoadKeys(boardCols, boardRows), [boardCols, boardRows]);
  const borderFenceEdges = useMemo(() => playableBorderFenceEdges(boardCols, boardRows), [boardCols, boardRows]);
  const hasPlayablePathBorder = Boolean(featureKind) && borderRoadKeys.every((key) =>
    (boardFeatures[key] ?? decorativeFeatures[key])?.kind === featureKind,
  );
  const hasPlayableFenceBorder = borderFenceEdges.every((edge) =>
    edge in boardFences || edge in decorativeFences,
  );

  const ensureBorderApron = (board: EditorBoard): void => {
    const apron = board.decorativeApron ?? { top: 0, right: 0, bottom: 0, left: 0 };
    board.decorativeApron = {
      top: Math.max(1, apron.top),
      right: Math.max(1, apron.right),
      bottom: Math.max(1, apron.bottom),
      left: Math.max(1, apron.left),
    };
  };
  const setPlayablePathBorder = (enabled: boolean): void => {
    if (!featureKind) return;
    const next = cloneEditorBoard(currentEditorBoardRef.current);
    const features = { ...(next.decorativeFeatures ?? {}), ...(next.features ?? {}) };
    for (const key of borderRoadKeys) {
      if (enabled) features[key] = { kind: featureKind, material: featureBrushMaterial[featureKind] };
      else if (features[key]?.kind === featureKind) delete features[key];
    }
    next.features = features;
    next.decorativeFeatures = {};
    if (enabled) ensureBorderApron(next);
    commitEditorBoard(next);
  };
  const setPlayableFenceBorder = (enabled: boolean): void => {
    const next = cloneEditorBoard(currentEditorBoardRef.current);
    const fences = { ...(next.decorativeFences ?? {}), ...(next.fences ?? {}) };
    for (const edge of borderFenceEdges) {
      if (enabled) fences[edge] = fenceBrushMaterial;
      else delete fences[edge];
    }
    next.fences = fences;
    next.decorativeFences = {};
    if (enabled) ensureBorderApron(next);
    commitEditorBoard(next);
  };

  const normalizeFloatingArtworkPoint = (
    point: { pixelX: number; pixelY: number },
    fallback: { pixelX: number; pixelY: number } = { pixelX: 0, pixelY: 0 },
  ): { pixelX: number; pixelY: number } => {
    const pixelX = Number.isFinite(point.pixelX) ? point.pixelX : fallback.pixelX;
    const pixelY = Number.isFinite(point.pixelY) ? point.pixelY : fallback.pixelY;
    return {
      pixelX: Math.max(-MAX_FLOATING_ARTWORK_PIXEL, Math.min(MAX_FLOATING_ARTWORK_PIXEL, Math.round(pixelX))),
      pixelY: Math.max(-MAX_FLOATING_ARTWORK_PIXEL, Math.min(MAX_FLOATING_ARTWORK_PIXEL, Math.round(pixelY))),
    };
  };

  const placeFloatingArtwork = (point: { pixelX: number; pixelY: number }): void => {
    const directions = structureArtDirections(artworkBrushId);
    const direction = directions.includes(artworkBrushDirection)
      ? artworkBrushDirection
      : directions.includes('south')
        ? 'south'
        : directions[0];
    if (!artworkBrushId || !direction) return;
    const placement: FloatingArtworkPlacement = {
      id: `art-${crypto.randomUUID()}`,
      sourceArtId: artworkBrushId,
      ...normalizeFloatingArtworkPoint(point),
      direction,
      scale: 1,
    };
    const next = cloneEditorBoard(currentEditorBoardRef.current);
    next.floatingArtwork = [...(next.floatingArtwork ?? []), placement];
    if (commitEditorBoard(next, null)) setSelectedArtworkId(placement.id);
  };

  /** Viewport pointer -> scene pixels, the space `FloatingArtworkPlacement` stores. */
  const placementScenePoint = (clientX: number, clientY: number, rect: DOMRect): { x: number; y: number } => ({
    x: (clientX - (rect.left + rect.width / 2) - viewPan.x) / viewZoom - artworkBoardOrigin.originLeft,
    y: (clientY - (rect.top + rect.height / 2) - viewPan.y) / viewZoom - artworkBoardOrigin.originTop,
  });

  /** Viewport pointer -> the logical board cell under it. Town and Forest share this grid. */
  const placementCellAt = (clientX: number, clientY: number, rect: DOMRect): { x: number; y: number } => {
    const scene = placementScenePoint(clientX, clientY, rect);
    return snapGridPoint(unprojectBoardPoint({ left: scene.x, top: scene.y }));
  };

  /** Scene pixels -> pixels inside the placement surface. Inverse of placementScenePoint. */
  const placementSurfacePoint = (
    scene: { x: number; y: number },
    rect: { width: number; height: number },
  ): { x: number; y: number } => ({
    x: (scene.x + artworkBoardOrigin.originLeft) * viewZoom + viewPan.x + rect.width / 2,
    y: (scene.y + artworkBoardOrigin.originTop) * viewZoom + viewPan.y + rect.height / 2,
  });

  /**
   * A placement selection as highlighted TILES, derived from the same projection as the board.
   *
   * Drawn here rather than through the board's renderCellOverlay because that only runs for
   * playable cells, while Town and Forest both belong in the scenic apron too.
   *
   * Takes the instance's whole ground — one rectangle, or the union of several — and outlines
   * only the cells actually in it, so an author who shift-dragged a second patch on sees the
   * shape the generator will fill rather than the box it happens to fit inside.
   */
  const placementGridHighlight = useCallback((areas: readonly TownBounds[] | null) => {
    if (!areas?.length || !viewViewportSize) return null;
    const bounds = generatorAreasBounds(areas);
    const across = bounds.maxX - bounds.minX;
    const down = bounds.maxY - bounds.minY;
    // A selection this large is a mis-drag; drawing every tile would stall the editor.
    if ((across + 1) * (down + 1) > 4096) return null;
    const halfWidth = (TILE_TEMPLATE.topWidth / 2) * viewZoom;
    const halfHeight = (TILE_TEMPLATE.topHeight / 2) * viewZoom;
    // One diamond per tile, as explicit points. Drawing them as clipped boxes leaves the border
    // as four corner fragments — clip-path cuts an inset ring that follows the RECTANGLE — which
    // is invisible over bright terrain.
    const cells: Array<{ key: string; points: string }> = [];
    for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
      for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
        if (!generatorAreasContainCell(areas, x, y)) continue;
        const seat = projectBoardPoint({ x, y });
        const point = placementSurfacePoint({ x: seat.left, y: seat.top }, viewViewportSize);
        cells.push({
          key: `${x},${y}`,
          points: [
            `${point.x},${point.y - halfHeight}`,
            `${point.x + halfWidth},${point.y}`,
            `${point.x},${point.y + halfHeight}`,
            `${point.x - halfWidth},${point.y}`,
          ].join(' '),
        });
      }
    }
    const corner = placementSurfacePoint(
      (() => {
        const seat = projectBoardPoint({ x: bounds.minX, y: bounds.minY });
        return { x: seat.left, y: seat.top };
      })(),
      viewViewportSize,
    );
    return {
      cells,
      across,
      down,
      cellCountAcross: across + 1,
      cellCountDown: down + 1,
      areaCount: areas.length,
      cellCount: cells.length,
      labelX: corner.x - halfWidth,
      labelY: corner.y - halfHeight * 2,
    };
  }, [viewViewportSize, viewZoom, viewPan.x, viewPan.y,
    artworkBoardOrigin.originLeft, artworkBoardOrigin.originTop]);
  /**
   * What a drag is about to leave behind. A shift-drag EXTENDS the selected instance, so its
   * preview has to show the ground already owned alongside the pending patch — otherwise the
   * outline collapses to the new rectangle mid-drag and reads as "this replaces everything".
   */
  const placementDragAreas = (
    drag: { area: TownBounds; additive: boolean } | null,
    saved: readonly TownBounds[],
  ): readonly TownBounds[] | null => {
    if (!drag) return saved.length ? saved : null;
    return drag.additive ? [...saved, drag.area] : [drag.area];
  };
  const townHighlight = useMemo(
    () => placementGridHighlight(placementDragAreas(townDrag, townAreas)),
    [placementGridHighlight, townDrag, townAreas],
  );
  const forestHighlight = useMemo(
    () => placementGridHighlight(placementDragAreas(forestDrag, forestAreas)),
    [placementGridHighlight, forestDrag, forestAreas],
  );

  /**
   * The example building for the size bound being previewed, stood in the middle of the playable
   * board. A scale like "0.75x" means nothing on its own; standing one next to the tiles is the
   * only way to know what size you are asking for.
   */
  const townSizeExample = useMemo(() => {
    if (!townSizePreview || !selectedTown || !viewViewportSize) return null;
    const section = selectedTown.sections.find((entry) => entry.id === townSizePreview.sectionId);
    const source = section?.buildings.find((entry) => entry.weight > 0) ?? section?.buildings[0];
    if (!section || !source) return null;
    const sprite = structureArtDirectionSprite(source.sourceArtId, 'south');
    if (!sprite) return null;
    const scale = townSizePreview.bound === 'min' ? section.scaleMin : section.scaleMax;
    const drawnWidth = sprite.w * sprite.scale * scale;
    const drawnHeight = sprite.h * sprite.scale * scale;
    // Stand it on the middle of the playable board, where there are tiles to judge it against.
    const seat = projectBoardPoint({ x: (boardCols - 1) / 2, y: (boardRows - 1) / 2 });
    const centre = groundPointToPixel({ x: seat.left, y: seat.top }, sprite, scale);
    const corner = placementSurfacePoint(
      { x: centre.pixelX - drawnWidth / 2, y: centre.pixelY - drawnHeight / 2 },
      viewViewportSize,
    );
    return {
      src: structureArtDirectionHalfSrc(source.sourceArtId, 'south', 'front'),
      label: `${townBuildingCatalog.find((asset) => asset.id === source.sourceArtId)?.label ?? source.sourceArtId} · ${scale.toFixed(2)}×`,
      left: corner.x,
      top: corner.y,
      width: drawnWidth * viewZoom,
      height: drawnHeight * viewZoom,
    };
  }, [townSizePreview, selectedTown, viewViewportSize, viewZoom, viewPan.x, viewPan.y,
    artworkBoardOrigin.originLeft, artworkBoardOrigin.originTop, boardCols, boardRows, townBuildingCatalog]);

  // Source geometry for the scatter, read from the same live catalog the renderer draws from.
  const forestGeometry = useMemo<ForestSpeciesGeometry>(() => ({
    directions: (id) => structureArtDirections(id),
    sprite: (id, direction) => structureArtDirectionSprite(id, direction),
  }), []);

  const sectionSeed = (seed: number, index: number): number => (
    Math.max(1, Math.floor(hashUnit(index + 1, 0, seed, 0x4a17) * 0xffffffff))
  );

  const forestParams = (section: BoardForestSection, seed: number): ForestScatterParams => ({
    trees: section.trees,
    density: section.density,
    jitter: section.jitter,
    scaleMin: section.scaleMin,
    scaleMax: section.scaleMax,
    randomFacing: section.randomFacing,
    facing: section.facing,
    spacing: section.spacing,
    clumping: section.clumping,
    falloff: section.falloff,
    seed,
  });

  /** Rebuild exactly one saved Forest, replacing only the Scene Art owned by that instance. */
  const generateForest = (forest: BoardForest, forestsOverride?: BoardForest[]): void => {
    if (!forest.sections.some((section) => section.trees.some((tree) => tree.weight > 0))) return;
    const seed = generatorSeedForRun(forest.seed, forest.fixedSeed === true);
    const generatedForest = seed === forest.seed ? forest : { ...forest, seed };
    const forests = (forestsOverride ?? boardForests)
      .map((entry) => (entry.id === forest.id ? generatedForest : entry));
    const current = currentEditorBoardRef.current;
    const existing = current.floatingArtwork ?? [];
    const preserved = existing.filter((placement) => !isForestMember(placement, forest.id));
    const groups = composeGeneratorSections(generatedForest.bounds, generatedForest.sections, generatedForest.seed);
    const grown: FloatingArtworkPlacement[] = [];
    for (const group of groups) {
      for (const sectionId of group.sectionIds) {
        const section = generatedForest.sections.find((candidate) => candidate.id === sectionId);
        if (!section?.trees.some((tree) => tree.weight > 0)) continue;
        const index = generatedForest.sections.indexOf(section);
        grown.push(...scatterForest({
          forestId: forest.id,
          scopeId: section.id,
          area: group.bounds,
          areas: generatorInstanceAreas(generatedForest),
          params: forestParams(section, sectionSeed(generatedForest.seed, index)),
          geometry: forestGeometry,
          existing: [...preserved, ...grown],
        }));
      }
    }
    const next = cloneEditorBoard(current);
    next.forests = forests;
    // Canonical rendering derives visible depth from ground contact. Keep the stored collection
    // sorted as deterministic content and as a stable tie-breaker for identical contacts.
    next.floatingArtwork = sortFloatingArtworkByDepth([...preserved, ...grown], forestGeometry);
    setBoardForests(forests);
    setForestGenerationResult({ forestId: forest.id, count: grown.length });
    commitEditorBoard(next, null);
  };

  /** Drop saved Forest instances and only the generated Scene Art they own. */
  const removeForests = (forestIds: ReadonlySet<string>): void => {
    if (!forestIds.size) return;
    const current = currentEditorBoardRef.current;
    const forests = boardForests.filter((forest) => !forestIds.has(forest.id));
    const next = cloneEditorBoard(current);
    next.forests = forests;
    next.floatingArtwork = (current.floatingArtwork ?? []).filter(
      (placement) => ![...forestIds].some((id) => isForestMember(placement, id)),
    );
    setBoardForests(forests);
    setSelectedForestId((id) => (id && forestIds.has(id) ? null : id));
    setForestGenerationResult(null);
    commitEditorBoard(next, null);
  };
  const removeForest = (forest: BoardForest): void => removeForests(new Set([forest.id]));

  /** A view-centred grid area shared by the Town and Forest no-drag entry points. */
  const placementAreaAtView = (half: { x: number; y: number }): ForestGridArea => {
    const centre = unprojectBoardPoint({
      left: -viewPan.x / viewZoom - artworkBoardOrigin.originLeft,
      top: -viewPan.y / viewZoom - artworkBoardOrigin.originTop,
    });
    const cell = snapGridPoint(centre);
    const terrain = {
      minX: -(decorativeApron?.left ?? 0),
      maxX: boardCols - 1 + (decorativeApron?.right ?? 0),
      minY: -(decorativeApron?.top ?? 0),
      maxY: boardRows - 1 + (decorativeApron?.bottom ?? 0),
    };
    const width = Math.min(half.x * 2, terrain.maxX - terrain.minX);
    const height = Math.min(half.y * 2, terrain.maxY - terrain.minY);
    const minX = Math.max(terrain.minX, Math.min(cell.x - Math.round(width / 2), terrain.maxX - width));
    const minY = Math.max(terrain.minY, Math.min(cell.y - Math.round(height / 2), terrain.maxY - height));
    return { minX, minY, maxX: minX + width, maxY: minY + height };
  };

  /** Save a newly selected Forest area and recipe without materializing any trees. */
  const createForest = (bounds: ForestGridArea): void => {
    const template = selectedForest;
    const sections = template?.sections.map((section, index) => ({
      ...section,
      id: `s${Math.random().toString(36).slice(2, 8)}`,
      relationship: index === 0 ? 'distinct' as const : section.relationship,
      trees: section.trees.map((tree) => ({
        ...tree,
        id: `tr${Math.random().toString(36).slice(2, 8)}`,
      })),
    })) ?? [{
      ...newForestSection(),
      trees: initialForestSourceId ? [{
        id: `tr${Math.random().toString(36).slice(2, 8)}`,
        sourceArtId: initialForestSourceId,
        weight: 1,
      }] : [],
    }];
    const forest: BoardForest = {
      id: `f${Math.random().toString(36).slice(2, 8)}`,
      name: `Forest ${boardForests.length + 1}`,
      bounds,
      sections,
      seed: randomGeneratorSeed(),
    };
    const forests = [...boardForests, forest];
    const next = cloneEditorBoard(currentEditorBoardRef.current);
    next.forests = forests;
    setBoardForests(forests);
    setSelectedForestId(forest.id);
    setExpandedForestSections(new Set(sections.map((section) => section.id)));
    setForestGenerationResult(null);
    setForestPicker(sections[0].trees.length ? null : { sectionId: sections[0].id, entryId: null });
    commitEditorBoard(next, null);
  };
  const addForestAtView = (): void => createForest(placementAreaAtView({ x: 6, y: 6 }));

  /**
   * Extend the selected Forest's ground with another patch, or take the last one back.
   *
   * The ground is the whole of what changes; the recipe, seed and trees already standing stay
   * put until Generate is pressed again, which is the same interaction boundary every other
   * generator setting sits behind.
   */
  const addForestArea = (forest: BoardForest, area: ForestGridArea): void => {
    updateForest(forest.id, generatorAreaChange([...generatorInstanceAreas(forest), area]));
    setForestGenerationResult(null);
  };
  const dropLastForestArea = (forest: BoardForest): void => {
    const areas = generatorInstanceAreas(forest);
    if (areas.length < 2) return;
    updateForest(forest.id, generatorAreaChange(areas.slice(0, -1)));
    setForestGenerationResult(null);
  };

  const resetForestParams = (): void => {
    if (!selectedForest) return;
    updateForest(selectedForest.id, {
      sections: selectedForest.sections.map((section) => ({
        ...section,
        density: FOREST_SCATTER_DEFAULTS.density,
        jitter: FOREST_SCATTER_DEFAULTS.jitter,
        scaleMin: FOREST_SCATTER_DEFAULTS.scaleMin,
        scaleMax: FOREST_SCATTER_DEFAULTS.scaleMax,
        randomFacing: FOREST_SCATTER_DEFAULTS.randomFacing,
        facing: FOREST_SCATTER_DEFAULTS.facing,
        spacing: FOREST_SCATTER_DEFAULTS.spacing,
        clumping: FOREST_SCATTER_DEFAULTS.clumping,
        falloff: FOREST_SCATTER_DEFAULTS.falloff,
      })),
      seed: FOREST_SCATTER_DEFAULTS.seed,
      fixedSeed: false,
    });
  };

  /**
   * Site or re-site a town. A town's id prefix comes from its centre, so regenerating replaces
   * the buildings already standing there instead of stacking a second town on top of them.
   */
  /** Rebuild one town in place from its saved settings. */
  const generateTown = (town: BoardTown, townsOverride?: BoardTown[]): void => {
    if (!town.sections.some((section) => section.buildings.some((building) => building.weight > 0))) return;
    const seed = generatorSeedForRun(town.seed, town.fixedSeed === true);
    const generatedTown = seed === town.seed ? town : { ...town, seed };
    const towns = (townsOverride ?? boardTowns)
      .map((entry) => (entry.id === town.id ? generatedTown : entry));
    const current = currentEditorBoardRef.current;
    const all = current.floatingArtwork ?? [];
    const others = all.filter((placement) => !isTownMember(placement, town.id));
    const groups = composeGeneratorSections(generatedTown.bounds, generatedTown.sections, generatedTown.seed);
    const placements: FloatingArtworkPlacement[] = [];
    let offered = 0;
    let rejectedSpacing = 0;
    let rejectedOutside = 0;
    let target = 0;
    for (const group of groups) {
      for (const sectionId of group.sectionIds) {
        const section = generatedTown.sections.find((candidate) => candidate.id === sectionId);
        if (!section?.buildings.some((building) => building.weight > 0)) continue;
        const index = generatedTown.sections.indexOf(section);
        target += section.size;
        const result = planTown({
          townId: town.id,
          scopeId: section.id,
          bounds: group.bounds,
          areas: generatorInstanceAreas(generatedTown),
          params: {
            sections: [{ ...section, share: 1 }],
            blend: 0,
            landmarkIds: section.landmarkIds,
            plan: section.plan as TownPlanKind,
            size: section.size,
            setback: section.setback,
            looseness: section.looseness,
            facingWobble: section.facingWobble,
            spacing: section.spacing,
            fit: section.fit as TownFitPolicy,
            seed: sectionSeed(generatedTown.seed, index),
          },
          geometry: forestGeometry,
          existing: [...others, ...placements],
        });
        placements.push(...result.placements);
        offered += result.plotsOffered;
        rejectedSpacing += result.rejectedSpacing;
        rejectedOutside += result.rejectedOutside;
      }
    }
    setTownSited({
      placed: placements.length,
      target,
      spacing: rejectedSpacing,
      outside: rejectedOutside,
      offered,
    });
    const next = cloneEditorBoard(current);
    // The town list rides the committed board, like generatedRegions. Writing placements without
    // it would hand back a board still carrying the old list and wipe the town that made them.
    next.towns = towns;
    next.floatingArtwork = sortFloatingArtworkByDepth([...others, ...placements], forestGeometry);
    setBoardTowns(towns);
    commitEditorBoard(next, null);
  };

  /** Drop a town: its buildings AND the saved instance. */
  const removeTown = (town: BoardTown): void => {
    const current = currentEditorBoardRef.current;
    const all = current.floatingArtwork ?? [];
    const kept = all.filter((placement) => !isTownMember(placement, town.id));
    const towns = boardTowns.filter((entry) => entry.id !== town.id);
    setBoardTowns(towns);
    setSelectedTownId((id) => (id === town.id ? null : id));
    setTownSited(null);
    const next = cloneEditorBoard(current);
    next.towns = towns;
    next.floatingArtwork = kept;
    commitEditorBoard(next, null);
  };

  /**
   * A town on default ground in the middle of the current view, for authors who have not found
   * the drag. Dragging is the precise way to place one; this is the way that does not require
   * knowing that.
   */
  const addTownAtView = (): void => {
    // Keep the town on TERRAIN and where the author is looking. The shared helper fits the
    // default inside small authored surfaces instead of shifting it onto projected void.
    createTown(placementAreaAtView({ x: 9, y: 7 }));
  };

  /** A fresh town on newly dragged ground. Each drag is its own instance, never a replacement. */
  const createTown = (bounds: TownBounds): void => {
    const template = selectedTown;
    const town: BoardTown = {
      id: `t${Math.random().toString(36).slice(2, 8)}`,
      name: `Town ${boardTowns.length + 1}`,
      bounds,
      // Carry the last town's recipe forward so placing a second one does not start from nothing.
      sections: (template?.sections ?? [newTownSection()])
        .map((section, index) => ({
          ...section,
          buildings: section.buildings.map((entry) => ({ ...entry })),
          id: newTownSection().id,
          relationship: index === 0 ? 'distinct' : section.relationship,
        })),
      seed: randomGeneratorSeed(),
    };
    setExpandedTownSections((current) => {
      const next = new Set(current);
      for (const section of town.sections) next.add(section.id);
      return next;
    });
    const towns = [...boardTowns, town];
    setBoardTowns(towns);
    setSelectedTownId(town.id);
    setTownSited(null);
    // The area and recipe are now selected, but no buildings materialize until Generate. This is
    // intentionally the same interaction boundary used by every settings-backed generator.
    const current = currentEditorBoardRef.current;
    const next = cloneEditorBoard(current);
    next.towns = towns;
    commitEditorBoard(next, null);
  };

  /**
   * Extend the selected town's ground with another patch, or take the last one back.
   *
   * This is what lets a town stop being a rectangle: it can bend around a corner, wrap a lake, or
   * carry on past the edge of one screenful of board. Buildings already standing are left alone
   * until Regenerate, like every other town setting.
   */
  const addTownArea = (town: BoardTown, area: TownBounds): void => {
    updateTown(town.id, generatorAreaChange([...generatorInstanceAreas(town), area]));
    setTownSited(null);
  };
  const dropLastTownArea = (town: BoardTown): void => {
    const areas = generatorInstanceAreas(town);
    if (areas.length < 2) return;
    updateTown(town.id, generatorAreaChange(areas.slice(0, -1)));
    setTownSited(null);
  };

  const resetTownParams = (): void => {
    if (!selectedTown) return;
    updateTown(selectedTown.id, {
      sections: selectedTown.sections.map((section) => ({
        ...section,
        plan: TOWN_PLAN_DEFAULTS.plan,
        size: TOWN_PLAN_DEFAULTS.size,
        setback: TOWN_PLAN_DEFAULTS.setback,
        looseness: TOWN_PLAN_DEFAULTS.looseness,
        facingWobble: TOWN_PLAN_DEFAULTS.facingWobble,
        spacing: TOWN_PLAN_DEFAULTS.spacing,
        fit: TOWN_PLAN_DEFAULTS.fit,
      })),
      fixedSeed: false,
    });
  };

  const paintCell = (x: number, y: number): void => {
    // Floating artwork has its own viewport-level placement surface. It must never fall through
    // into this tile/cell painter, even if a stale pointer event arrives during a tool change.
    if (brushKind === 'artwork' || brushKind === 'forest' || brushKind === 'town') return;
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
      // Doodads are board art, not scenic art: they stay playable and terrain-compatible.
      if (!canTargetPlacedArtCell('doodad', x, y, boardCols, boardRows)) return;
      if (!doodadFitsTile(doodadBrushAsset, authoredCellTileId(x, y))) return;
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
      const tileId = authoredCellTileId(x, y);
      if (!tileId || !groundCoverSet(coverBrushType)) return;
      const terrain = leFamilyOfTile(tileId)?.id;
      next.cover[key] = coverBrushDensity;
      // Bake the roll into the cell. The brush seed shapes what is painted NEXT; it never
      // restyles grass that is already down, and the game renders exactly what is authored here.
      next.coverSeeds = { ...(next.coverSeeds ?? {}), [key]: coverBrushSeed };
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
      const familyTiles = leFamilyAssets()[macroTileBrushAsset.family];
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
    if (cellWithinBoard(key)) {
      next.macroTiles = breakMacroTilesAtCell(next.macroTiles, x, y);
      next.cells[key] = brushAsset.id;
    } else {
      next.decorativeCells = { ...(next.decorativeCells ?? {}), [key]: brushAsset.id };
    }
    commitEditorBoard(next);
  };
  const eraseCell = (x: number, y: number): void => {
    const key = `${x},${y}`;
    const next = cloneEditorBoard(currentEditorBoardRef.current);
    if (featureKind) {
      delete next.features[key];
      delete next.decorativeFeatures?.[key];
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
    if (brushKind === 'artwork') return;
    if (brushKind === 'cover') {
      delete next.cover[key];
      if (next.coverTypes) delete next.coverTypes[key];
      if (next.coverSeeds) delete next.coverSeeds[key];
      commitEditorBoard(next);
      return;
    }
    if (brushKind === 'zone') {
      const entries = zoneEntriesForBoard(next);
      const target = entries[selectedZoneIndex];
      if (!target?.tiles.includes(key)) return;
      const updated = entries.map((entry, index) => index === selectedZoneIndex ? { ...entry, tiles: entry.tiles.filter((tile) => tile !== key) } : entry);
      commitEditorBoard(withZoneEntries(next, updated));
      return;
    }
    if (cellWithinBoard(key)) {
      next.macroTiles = breakMacroTilesAtCell(next.macroTiles, x, y);
      delete next.cells[key];
    } else {
      delete next.decorativeCells?.[key];
      next.decorativeFootprint = (next.decorativeFootprint ?? []).filter((coordinate) => coordinate !== key);
    }
    commitEditorBoard(next);
  };
  const selectFenceArtwork = (id: string): void => {
    const artwork = fenceArtKit(fenceArtCatalog, id);
    if (!artwork) return;
    setSelectedFenceArtworkId(artwork.id);
    setFenceBrushMaterial(artwork.material);
    if (!artwork.post) setFencePaintTarget('rail');
    setBrushKind('fence');
    setLayer('fence');
    setTool('brush');
    const url = new URL(window.location.href);
    url.searchParams.set('artReview', FENCE_ART_REVIEW_ID);
    url.searchParams.set('fenceArt', artwork.id);
    navigateApp(`${url.pathname}${url.search}${url.hash}`, { replace: true, scroll: false });
  };
  const stepFenceArtwork = (delta: -1 | 1): void => {
    const artwork = cycleFenceArtKit(fenceArtCatalog, selectedFenceArtworkId, delta);
    if (artwork) selectFenceArtwork(artwork.id);
  };

  // Edge-fence paint/erase — the fence tool targets the shared edge under the cursor (roadEdgeKey),
  // not a cell. Add stamps the current brush material; erase drops the edge. Both ride undo/redo.
  const paintFenceEdge = (edgeKey: string): void => {
    const next = cloneEditorBoard(currentEditorBoardRef.current);
    next.fences = { ...(next.decorativeFences ?? {}), ...(next.fences ?? {}), [edgeKey]: fenceBrushMaterial };
    next.decorativeFences = {};
    commitEditorBoard(next);
  };
  const eraseFenceEdge = (edgeKey: string): void => {
    const current = { ...(currentEditorBoardRef.current.decorativeFences ?? {}), ...(currentEditorBoardRef.current.fences ?? {}) };
    if (!(edgeKey in current)) return;
    const next = cloneEditorBoard(currentEditorBoardRef.current);
    const fences = { ...(next.decorativeFences ?? {}), ...(next.fences ?? {}) };
    delete fences[edgeKey];
    next.fences = fences;
    next.decorativeFences = {};
    commitEditorBoard(next);
  };
  const paintFencePost = (vertexKey: string): void => {
    const [vx, vy] = vertexKey.split(',').map(Number);
    if (!Number.isInteger(vx) || !Number.isInteger(vy)) return;
    const next = cloneEditorBoard(currentEditorBoardRef.current);
    next.fencePosts = { ...(next.decorativeFencePosts ?? {}), ...(next.fencePosts ?? {}), [vertexKey]: fenceBrushMaterial };
    next.decorativeFencePosts = {};
    commitEditorBoard(next);
  };
  const eraseFencePost = (vertexKey: string): void => {
    const [vx, vy] = vertexKey.split(',').map(Number);
    const current = { ...(currentEditorBoardRef.current.decorativeFencePosts ?? {}), ...(currentEditorBoardRef.current.fencePosts ?? {}) };
    if (!(vertexKey in current)) return;
    const next = cloneEditorBoard(currentEditorBoardRef.current);
    const posts = { ...(next.decorativeFencePosts ?? {}), ...(next.fencePosts ?? {}) };
    delete posts[vertexKey];
    next.fencePosts = posts;
    next.decorativeFencePosts = {};
    commitEditorBoard(next);
  };
  const wallEdgeCanRender = (edgeKey: string): boolean =>
    isNorthWestBoundaryWallEdge(edgeKey, { cols: boardCols, rows: boardRows })
    || edgeKey.split('|').some((key) => !cellWithinBoard(key));
  const paintWallEdge = (edgeKey: string): void => {
    if (!wallEdgeCanRender(edgeKey)) return;
    const next = cloneEditorBoard(currentEditorBoardRef.current);
    const walls = { ...(next.decorativeWalls ?? {}), ...(next.walls ?? {}) };
    walls[edgeKey] = wallBrushMaterial;
    next.walls = walls;
    next.decorativeWalls = {};
    commitEditorBoard(next);
  };
  const eraseWallEdge = (edgeKey: string): void => {
    const current = { ...(currentEditorBoardRef.current.decorativeWalls ?? {}), ...(currentEditorBoardRef.current.walls ?? {}) };
    if (!(edgeKey in current)) return;
    const next = cloneEditorBoard(currentEditorBoardRef.current);
    const walls = { ...(next.decorativeWalls ?? {}), ...(next.walls ?? {}) };
    delete walls[edgeKey];
    next.walls = walls;
    next.decorativeWalls = {};
    const currentArt = next.wallArt ?? {};
    const hit = wallArtAtEdge(edgeKey, currentArt, { cols: boardCols, rows: boardRows });
    if (hit) {
      const wallArtPlacements = { ...currentArt };
      delete wallArtPlacements[hit.anchorEdge];
      next.wallArt = wallArtPlacements;
    }
    commitEditorBoard(next);
  };
  const paintSubterrainFace = (x: number, y: number, face: 'south' | 'east'): void => {
    if (!subterrainBrushAsset) return;
    const board = currentEditorBoardRef.current;
    const terrainSurface = new Set(Object.keys(board.cells));
    for (const coordinate of decorativeTerrainApronCoordinates(
      board.cols,
      board.rows,
      board.decorativeApron ?? { top: 0, right: 0, bottom: 0, left: 0 },
      board.decorativeFootprint,
    )) terrainSurface.add(`${coordinate.x},${coordinate.y}`);
    if (!terrainSurface.has(`${x},${y}`)) return;
    const neighbor = face === 'south' ? `${x},${y + 1}` : `${x + 1},${y}`;
    if (terrainSurface.has(neighbor)) return;
    const next = cloneEditorBoard(board);
    next.subterrain = { ...(next.subterrain ?? {}), [subterrainFaceKey(x, y, face)]: subterrainBrushAsset.id };
    commitEditorBoard(next);
  };
  const eraseSubterrainFace = (x: number, y: number, face: 'south' | 'east'): void => {
    const key = subterrainFaceKey(x, y, face);
    if (!currentEditorBoardRef.current.subterrain?.[key]) return;
    const next = cloneEditorBoard(currentEditorBoardRef.current);
    const placements = { ...(next.subterrain ?? {}) };
    delete placements[key];
    next.subterrain = placements;
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
    commitEditorBoard({ ...cloneEditorBoard(currentEditorBoardRef.current), cells: {}, decorativeCells: {}, decorativeFootprint: [], decorativeFeatures: {}, decorativeFences: {}, decorativeFencePosts: {}, decorativeWalls: {}, macroTiles: [], units: {}, doodads: {}, props: {}, floatingArtwork: [], cover: {}, coverTypes: {}, features: {}, fences: {}, fencePosts: {}, walls: {}, wallArt: {}, subterrain: {}, featureCuts: {}, featureExits: {}, zoneEntries: [], zones: {}, generatedRegions: [], towns: [], forests: [] }, null);
    setSelectedArtworkId(null);
    setActiveGeneratedRegionId(null);
    setRegionSelection(new Set());
    setSelectedForestId(null);
    setForestGenerationResult(null);
  };
  const clearActiveLayer = (): void => {
    const next = cloneEditorBoard(currentEditorBoardRef.current);
    if (brushKind === 'tile') { next.cells = {}; next.macroTiles = []; }
    else if (brushKind === 'unit') next.units = {};
    else if (brushKind === 'doodad') next.doodads = {};
    else if (brushKind === 'prop') next.props = {};
    else if (brushKind === 'artwork') next.floatingArtwork = [];
    else if (brushKind === 'forest') {
      const forestIds = new Set((next.forests ?? []).map((forest) => forest.id));
      next.floatingArtwork = (next.floatingArtwork ?? []).filter(
        (placement) => ![...forestIds].some((id) => isForestMember(placement, id)),
      );
      next.forests = [];
    }
    else if (brushKind === 'town') {
      const townIds = new Set((next.towns ?? []).map((town) => town.id));
      next.floatingArtwork = (next.floatingArtwork ?? []).filter(
        (placement) => ![...townIds].some((id) => isTownMember(placement, id)),
      );
      next.towns = [];
    }
    else if (brushKind === 'cover') { next.cover = {}; next.coverTypes = {}; }
    else if (brushKind === 'zone') {
      const entries = zoneEntriesForBoard(next);
      if (entries[selectedZoneIndex]) {
        const updated = entries.map((entry, index) => index === selectedZoneIndex ? { ...entry, tiles: [] } : entry);
        Object.assign(next, withZoneEntries(next, updated));
      }
    }
    else if (brushKind === 'fence') { next.fences = {}; next.fencePosts = {}; }
    else if (brushKind === 'wall') { next.walls = {}; next.wallArt = {}; }
    else if (brushKind === 'subterrain') next.subterrain = {};
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
    if (brushKind === 'artwork') setSelectedArtworkId(null);
    if (brushKind === 'forest') {
      setSelectedForestId(null);
      setForestGenerationResult(null);
    }
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
  const fillSelectedTileArea = (): void => {
    if (regionSelection.size === 0) return;
    const next = paintTerrainArea(currentEditorBoardRef.current, regionSelection, brushAsset.id);
    commitEditorBoard(next);
  };
  const randomizeBoardTiles = (): void => {
    const seed = (Date.now() ^ (boardCols * 73856093) ^ (boardRows * 19349663)) >>> 0;
    const generated = generateSocketBoard({
      assets: leTileAssets(),
      seed,
      columns: boardCols,
      rows: boardRows,
      familyAssets: leFamilyAssets(),
    });
    const next = cloneEditorBoard(currentEditorBoardRef.current);
    next.cells = Object.fromEntries(generated.cells.map((cell) => [`${cell.x},${cell.y}`, cell.asset?.id ?? leDefaultTile().id]));
    next.macroTiles = [];
    commitEditorBoard(next, null);
  };
  const activeGeneratedRegion = useMemo(
    () => generatedRegions.find((region) => region.id === activeGeneratedRegionId) ?? null,
    [activeGeneratedRegionId, generatedRegions],
  );
  const cellWithinBoard = (key: string, cols = boardCols, rows = boardRows): boolean => {
    const [x, y] = key.split(',').map(Number);
    return isPlayableBoardCoordinate(x, y, cols, rows);
  };
  const cellWithinScenicSurface = (key: string): boolean => {
    const [x, y] = key.split(',').map(Number);
    if (!Number.isInteger(x) || !Number.isInteger(y)) return false;
    return (x >= 0 && x < boardCols && y >= 0 && y < boardRows)
      || scenicTerrainCoordinateKeys.has(key);
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
    const cells = sortRegionCells(region.cells.filter((key) => cellWithinScenicSurface(key)));
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
  // Area selection is shared by Generate and raw Tile Fill. Clicking one cell flood-fills its
  // orthogonally connected same-terrain-family patch (empty matches empty), including the scenic
  // rectangle's resolved terrain. Generate may save that area as a rerunnable region; Tile keeps
  // the selection transient and paints it in one edit.
  const terrainPatchCellsAt = (x: number, y: number): string[] => {
    const familyAt = (cx: number, cy: number): string => {
      const id = authoredCellTileId(cx, cy);
      return id ? (leFamilyOfTile(id)?.id ?? '?') : '';
    };
    const target = familyAt(x, y);
    const found = new Set<string>();
    const stack: Array<[number, number]> = [[x, y]];
    while (stack.length > 0) {
      const [cx, cy] = stack.pop()!;
      const key = `${cx},${cy}`;
      if (!cellWithinScenicSurface(key) || found.has(key) || familyAt(cx, cy) !== target) continue;
      found.add(key);
      stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
    }
    return sortRegionCells(found);
  };
  const selectTerrainArea = (x: number, y: number): void => {
    const cells = terrainPatchCellsAt(x, y);
    if (layer !== 'generate') {
      setActiveGeneratedRegionId(null);
      setRegionSelection(new Set(cells));
      setTool('brush');
      return;
    }
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
  const scopeCells = regionSelection.size > 0
    ? regionSelection.size
    : boardCols * boardRows + scenicTerrainCoordinates.length;
  const setSectionShare = (id: number, value: number): void => setScatterSections((prev) => rebalanceShares(prev, id, value, scatterBuffer));
  const setSectionTerrain = (id: number, terrain: TileFamilyId): void => setScatterSections((prev) => prev.map((s) => (s.id === id ? { ...s, terrain } : s)));
  const toggleSectionLock = (id: number): void => setScatterSections((prev) => prev.map((s) => (s.id === id ? { ...s, locked: !s.locked } : s)));
  const addSection = (): void => setScatterSections((prev) => {
    const total = 100 - scatterBuffer;
    const share = prev.length > 0 ? Math.max(1, Math.round(total / (prev.length + 1))) : total;
    const used = new Set(prev.map((s) => s.terrain));
    const terrain = leScatterFamilies().find((family) => !used.has(family.id))?.id ?? defaultTerrainFamily().id;
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
    const selectedRegionCells = sortRegionCells([...regionSelection].filter((key) => cellWithinScenicSurface(key)));
    const seed = Date.now() >>> 0; // a fresh layout each press; the committed board is the artifact
    const cols = boardCols;
    const rows = boardRows;
    const wholeSurfaceCells = [
      ...Array.from({ length: rows }, (_, y) => Array.from({ length: cols }, (__, x) => `${x},${y}`)).flat(),
      ...scenicTerrainCoordinates.map(({ x, y }) => `${x},${y}`),
    ];
    const targetCells = selectedRegionCells.length > 0 ? selectedRegionCells : wholeSurfaceCells;
    const surfaceCoordinates = wholeSurfaceCells.map((key) => {
      const [x, y] = key.split(',').map(Number);
      return { x, y };
    });
    const minX = Math.min(...surfaceCoordinates.map(({ x }) => x));
    const maxX = Math.max(...surfaceCoordinates.map(({ x }) => x));
    const minY = Math.min(...surfaceCoordinates.map(({ y }) => y));
    const maxY = Math.max(...surfaceCoordinates.map(({ y }) => y));
    const offsetX = -minX;
    const offsetY = -minY;
    const generationCols = maxX - minX + 1;
    const generationRows = maxY - minY + 1;
    if (generationCols * generationRows > MAX_SCENIC_TERRAIN_GENERATION_AREA) {
      reportStatus(
        'This terrain surface is too spread out to generate safely.',
        'warning',
        'Select a smaller connected area before running Generate.',
      );
      return;
    }
    const generateApron = scenicTerrainCoordinates.length > 0;
    const baseMap: (TileFamilyId | undefined)[] = Array.from({ length: generationCols * generationRows }, (_, i) => {
      const x = (i % generationCols) - offsetX;
      const y = ((i / generationCols) | 0) - offsetY;
      const id = authoredCellTileId(x, y);
      return id ? (leFamilyOfTile(id)?.id as TileFamilyId | undefined) : undefined;
    });
    const region = new Set(
      targetCells.map((key) => {
        const [x, y] = key.split(',').map(Number);
        return (y + offsetY) * generationCols + x + offsetX;
      }),
    );
    const generatedScatter = scatterTerrainDetailed({
      columns: generationCols,
      rows: generationRows,
      sections,
      randomnessBuffer: scatterBuffer,
      wiggle: scatterWiggle,
      seed,
      region,
      baseMap,
    });
    const fullSolved = solveSocketBoard({ assets: leTileAssets(), terrainMap: generatedScatter.terrain, seed, columns: generationCols, rows: generationRows, familyAssets: leFamilyAssets() });
    const terrainMap: TileFamilyId[] = [];
    const sectionOf = new Int32Array(cols * rows);
    const solvedCells = [] as typeof fullSolved.cells;
    for (let y = 0; y < rows; y += 1) for (let x = 0; x < cols; x += 1) {
      const fullIndex = (y + offsetY) * generationCols + x + offsetX;
      terrainMap.push(generatedScatter.terrain[fullIndex]);
      sectionOf[y * cols + x] = generatedScatter.sectionOf[fullIndex];
      const cell = fullSolved.cells[fullIndex];
      solvedCells.push({ ...cell, x, y });
    }
    const solved = { ...fullSolved, cells: solvedCells };
    const next = cloneEditorBoard(currentEditorBoardRef.current);
    if (generateApron) {
      if (!next.decorativeCells) next.decorativeCells = {};
      for (const cell of fullSolved.cells) {
        const x = cell.x - offsetX;
        const y = cell.y - offsetY;
        if (x >= 0 && x < cols && y >= 0 && y < rows) continue;
        const fullIndex = cell.y * generationCols + cell.x;
        if (!region.has(fullIndex)) continue;
        next.decorativeCells[`${x},${y}`] = cell.asset?.id ?? leDefaultTile().id;
      }
    }
    const playableRegion = selectedRegionCells.length > 0
      ? new Set(selectedRegionCells.flatMap((key) => {
          const [x, y] = key.split(',').map(Number);
          return x >= 0 && x < cols && y >= 0 && y < rows ? [y * cols + x] : [];
        }))
      : undefined;
    const generatedMacroTiles = generateMacroTiles({
      terrainMap,
      columns: cols,
      rows,
      seed,
      sectionOf,
      densityBySection: scatterSections.map((section) => section.macroTileDensity),
      breakupBySection: scatterSections.map((section) => section.macroTileBreakup),
      region: playableRegion,
    });
    const rewrittenCells = playableRegion ?? new Set(Array.from({ length: cols * rows }, (_, index) => index));
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
      if (playableRegion && !playableRegion.has(idx)) continue; // scoped: only rewrite selected playable cells
      const key = `${cell.x},${cell.y}`;
      next.cells[key] = cell.asset?.id ?? leDefaultTile().id;
      const s = sectionOf[idx];
      const covers = s >= 0 ? scatterSections[s].covers : [];
      let placed = false;
      for (const c of covers) {
        const coverage = clamp01(c.knobs.amount + (coverNoise(cell.x, cell.y, (seed ^ c.id) >>> 0) - 0.5) * 2 * c.knobs.amountRandom);
        if (coverRng.next() >= coverage) continue;
        const filledChance = clamp01(c.knobs.density + (coverNoise(cell.x, cell.y, (seed ^ 0x2545f491 ^ c.id) >>> 0) - 0.5) * 2 * c.knobs.densityRandom);
        next.cover[key] = coverRng.next() < filledChance ? 'filled' : 'sparse';
        next.coverTypes[key] = c.type;
        next.coverSeeds = { ...(next.coverSeeds ?? {}), [key]: seed >>> 0 };
        placed = true;
        break;
      }
      if (!placed) {
        delete next.cover[key];
        delete next.coverTypes[key];
        if (next.coverSeeds) delete next.coverSeeds[key];
      }
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
  // The Battle block a Save writes: the document's own (the War editor's Loot flag, which this
  // editor only carries through) with this panel's authored Deployment deal folded in.
  // A War Battle always authors its Deployment deal; nothing else is ever dealt cards, so nothing
  // else may pick the field up merely by being opened here.
  const isWarBattle = Boolean(routeParams.warId);
  const battleForSave = useMemo(
    () => battleSettingsForSave(candidateMetadataSource?.battle, isWarBattle ? battleCardsDealt : null),
    [candidateMetadataSource, isWarBattle, battleCardsDealt],
  );
  const candidateLevel = useMemo(
    () => editorBoardToLevel(currentEditorBoard, {
      id: editingId ?? 'draft',
      name: levelNameForSave,
      ...modeMeta,
      notes: candidateMetadataSource?.notes,
      difficulty: candidateMetadataSource?.difficulty,
      economy: candidateMetadataSource?.economy,
      theme: candidateMetadataSource?.theme,
      battle: battleForSave,
      previousTerrain: candidateMetadataSource?.layers.terrain,
    }),
    [candidateMetadataSource, battleForSave, currentEditorBoard, editingId, levelNameForSave, modeMeta],
  );
  // Live playability (ADR-0050): the plain-language violation list the panel shows, and the gate on
  // Save. Recomputed from the candidate Level so it always matches what would persist. Pure.
  const playability = useMemo(
    () => isWarBattle ? validateWarBattlePlayability(candidateLevel) : validatePlayability(candidateLevel),
    [candidateLevel, isWarBattle],
  );
  // The War this Battle sits in, and the economy that reaches it. The whole War is walked because
  // a Battle's expected force is the sum of every earlier Battle's reward: change an enemy Rook
  // three Battles back and this one is fought with less. The Battle being edited substitutes the
  // LIVE candidate for its stored Level, so painting a piece moves the numbers immediately.
  const warBattleLevels = useCampaigns((state) => state.levels);
  const editorWar = useWars((state) => state.wars.find((candidate) => candidate.id === routeParams.warId));
  const warEconomy = useMemo<{ war: War; curve: ExpectedBattleValue[]; index: number } | null>(() => {
    if (!isWarBattle || !editorWar) return null;
    const ordered = [...editorWar.battles].sort((left, right) => left.ordinal - right.ordinal);
    const index = ordered.findIndex((battle) => battle.levelId === routeParams.levelId);
    const levels = ordered.map((battle, position) => (
      position === index ? candidateLevel : warBattleLevels[battle.levelId]
    ));
    if (index < 0 || levels.some((level) => !level)) return null;
    return { war: editorWar, curve: expectedWarValue(levels as Level[]), index };
  }, [candidateLevel, editorWar, isWarBattle, routeParams.levelId, warBattleLevels]);
  const warValueHere = warEconomy?.curve[warEconomy.index] ?? null;
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
  const canonicalEditorBoard = useMemo(
    () => targetLevel ? levelToEditorBoard(targetLevel) : undefined,
    [targetLevel],
  );
  const workingCopyEditorBoard = useMemo(
    () => editorDocument ? levelToEditorBoard(editorDocument.level) : undefined,
    [editorDocument],
  );
  const workingCopyLevelSignature = useMemo(
    () => editorDocument ? normalizedLevelEditorSignature(editorDocument.level) : undefined,
    [editorDocument],
  );
  const workingDocumentPredrawnGenerationFrame = workingCopyEditorBoard?.predrawnGenerationFrame;
  const canonicalPredrawnGenerationFrame = canonicalEditorBoard?.predrawnGenerationFrame;
  const canonicalBoardSurface = canonicalEditorBoard?.surface;
  const canonicalVersionedPredrawnSurface = canonicalBoardSurface && isVersionedPredrawnBoardSurface(canonicalBoardSurface)
    ? canonicalBoardSurface
    : undefined;
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
  const campaignSelectOptions: HouseSelectOption<string>[] = [
    { value: '', label: 'Unassigned' },
    ...officialCampaignOptions.map((campaign) => ({
      value: campaign.id,
      label: campaign.name,
      group: 'Official campaigns',
    })),
    ...privateCampaignOptions.map((campaign) => ({
      value: campaign.id,
      label: campaign.name,
      group: 'Your campaigns',
    })),
  ];
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
    ? editorDocument.dirty || currentSig !== normalizedLevelEditorSignature(editorDocument.level)
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
  const editAuthorityStateRef = useRef(editAuthorityState);
  editAuthorityStateRef.current = editAuthorityState;
  editSessionRef.current = editSession;
  editPresenceRef.current = editPresence;
  editorClientIdentityRef.current = editorClientIdentity;
  const applyLevelDocumentRef = useRef(applyLevelDocument);
  applyLevelDocumentRef.current = applyLevelDocument;
  const reportStatusRef = useRef(reportStatus);
  reportStatusRef.current = reportStatus;
  const signedInRef = useRef(Boolean(me?.signed_in));
  signedInRef.current = Boolean(me?.signed_in);
  const ownerEmailRef = useRef(me?.email ?? '');
  ownerEmailRef.current = me?.email ?? '';
  // The owner this document was resolved for. It deliberately survives a lost sign-in: the browser
  // recovery address is keyed by account, so dropping it mid-session would stop buffering exactly
  // when buffering is the only thing holding the owner's work.
  const documentOwnerEmailRef = useRef<string>('');
  // Set while an open document is waiting for the same owner to sign back in.
  const signedOutInterruptionRef = useRef<string | null>(null);
  /** The account email that owns the mounted document, whether or not a session is currently live. */
  const activeOwnerEmail = (): string => (
    me?.email?.trim().toLowerCase() || documentOwnerEmailRef.current || ''
  );
  const currentEditFence = (): EditorDocumentEditFence | null => {
    const session = editSessionRef.current;
    const identity = editorClientIdentityRef.current;
    if (
      !session
      || !identity
      || identity.sessionId !== session.session_id
      || session.state === 'observing'
      || session.state === 'closed'
    ) return null;
    return {
      edit_session_id: session.session_id,
      edit_session_key: identity.sessionKey,
      edit_generation: session.edit_generation,
    };
  };
  const preserveAuthorityLoss = useCallback((_session?: unknown): void => {
    // Owner pages no longer lose authority to sibling tabs. The browser draft
    // remains the bounded retry buffer if the page session itself fails.
  }, []);
  /**
   * Enter the paused-for-sign-in state without disturbing the mounted working copy. Nothing is
   * unloaded, no recovery is archived and the page identity is kept, so the scoped browser draft
   * keeps receiving every subsequent edit and a later sign-in resumes exactly where this left off.
   */
  const enterCloudSignOut = useCallback((): void => {
    const alreadyInterrupted = signedOutInterruptionRef.current !== null;
    signedOutInterruptionRef.current = documentOwnerEmailRef.current || ownerEmailRef.current || null;
    setCloudSaveState('signed-out');
    setCloudSaveDetail('Your sign-in expired, so cloud autosave paused. This tab still holds every edit and keeps writing a browser recovery copy; sign in again to resume syncing.');
    if (alreadyInterrupted) return;
    reportStatusRef.current(
      'Signed out — autosave paused.',
      'warning',
      'Nothing was lost. Sign in again from this tab and your edits since the sign-out will sync automatically.',
    );
  }, []);
  /**
   * Resume the SAME mounted document after the same owner signs back in.
   *
   * This deliberately reopens the page session and re-reads the server body instead of re-entering
   * document resolution: resolution would call applyLevelDocument, and any gate that declined to
   * restore the browser branch would then paint the pre-sign-out body over the live editor — the
   * exact loss this whole path exists to prevent. Reconnecting leaves the on-screen board alone and
   * lets the ordinary compare-and-swap autosave carry the edits made while signed out.
   */
  const resumeInterruptedCloudSync = useCallback(async (): Promise<void> => {
    const doc = editorDocumentRef.current;
    const identity = editorClientIdentityRef.current;
    if (!doc || !identity) return;
    setCloudSaveDetail('Signed in again. Reconnecting this working copy…');
    try {
      const opened = await openEditorDocumentEditSession(doc.document_id, {
        session_id: identity.sessionId,
        session_key: identity.sessionKey,
        device_id: identity.deviceId,
        client_label: editorClientLabel,
      });
      editSessionRef.current = opened.session;
      editPresenceRef.current = opened.presence;
      setEditSession(opened.session);
      setEditPresence(opened.presence);
      setEditAuthorityState('writer');
      // Another device may have advanced the shared working copy while this page was signed out.
      // Rebasing onto the acknowledged revision keeps the resumed autosave a normal CAS, so a real
      // divergence surfaces through the existing conflict/merge path rather than overwriting.
      const server = await loadEditorDocument(doc.document_id);
      editorDocumentRef.current = server;
      setEditorDocument(server);
      documentRevisionRef.current = server.revision;
      lastCloudSyncedSigRef.current = normalizedLevelEditorSignature(server.level);
      documentConflictRef.current = server.baseline_conflict;
      documentConflictKindRef.current = server.baseline_conflict ? 'baseline' : null;
      signedOutInterruptionRef.current = null;
      setCloudSaveState(server.baseline_conflict ? 'conflict' : 'pending');
      setCloudSaveDetail(server.baseline_conflict
        ? 'The saved level changed while you were signed out. Your editor was preserved and autosave stays paused until you resolve it.'
        : 'Signed in again. Syncing the edits you made while signed out…');
      reportStatusRef.current(
        'Autosave resumed.',
        'success',
        'Edits made while signed out are syncing into your cloud working copy.',
      );
    } catch (error) {
      if (reportAuthSessionFailure(error)) {
        enterCloudSignOut();
        return;
      }
      setCloudSaveState('error');
      setCloudSaveDetail('Reconnecting after sign-in failed. Your work remains in this tab and in its browser recovery copy; retry when connected.');
      reportStatusRef.current('Could not reconnect after sign-in.', 'warning', (error as Error).message);
    }
  }, [editorClientLabel, enterCloudSignOut]);
  const mountAcknowledgedWorkingCopy = useCallback((latest: EditorDocument): void => {
    const latestSignature = levelEditorLevelSignature(latest.level);
    // The departure flush reads refs rather than React state. Replace its candidate and signature
    // in the same synchronous acknowledgement that advances the document revision, so closing or
    // navigating before React's next render cannot resend the displaced body at the new revision.
    currentCandidateRef.current = latest.level;
    currentSigRef.current = latestSignature;
    currentEditorBoardRef.current = levelToEditorBoard(latest.level);
    documentRevisionRef.current = latest.revision;
    lastCloudSyncedSigRef.current = latestSignature;
    documentConflictRef.current = latest.baseline_conflict;
    documentConflictKindRef.current = latest.baseline_conflict ? 'baseline' : null;
    editorDocumentRef.current = latest;
    setEditorDocument(latest);
    applyLevelDocumentRef.current(latest.level, { editingId: latest.level_id, clean: false });
    setCloudSaveState(latest.baseline_conflict ? 'conflict' : 'saved');
  }, []);
  const mountAcknowledgedPredrawnWorkspaceMutation = useCallback((
    result: PredrawnGenerationAttemptWorkspaceMutationResult,
  ): void => {
    if (result.workspace_revision !== null) {
      if (result.document.workspace_kind === 'official') {
        useCampaigns.getState().setOfficialWorkspaceRevision(result.workspace_revision);
      } else {
        useCampaigns.getState().setUserWorkspaceRevision(result.workspace_revision);
      }
    }
    if (result.canonical_level) {
      useCampaigns.getState().replaceLevel(result.canonical_level);
      setSavedSig(normalizedLevelEditorSignature(result.canonical_level));
      setTargetBaselineResolved(true);
    }
    mountAcknowledgedWorkingCopy(result.document);
  }, [mountAcknowledgedWorkingCopy]);
  const handlePredrawnVersionMutationError = useCallback((error: unknown): boolean => {
    if (isEditorDocumentConflict(error)) {
      mountAcknowledgedWorkingCopy(error.document);
      reportStatusRef.current(
        'Artwork operation stopped because the cloud working copy changed.',
        'warning',
        'The acknowledged cloud copy is now mounted. Review it, then try the artwork operation again.',
      );
      return true;
    }
    if (!isEditorDocumentEditSessionError(error)) return false;
    preserveAuthorityLoss(error.session ?? editSessionRef.current);
    if (error.document) mountAcknowledgedWorkingCopy(error.document);
    if (error.session) {
      editSessionRef.current = error.session;
      setEditSession(error.session);
    }
    if (error.presence) {
      editPresenceRef.current = error.presence;
      setEditPresence(error.presence);
    }
    setEditAuthorityState(error.code === 'editor_document_session_displaced' ? 'displaced' : 'follower');
    setCloudSaveDetail('Background-version editing stopped because this page session could not sync. Reload to reconnect.');
    reportStatusRef.current(
      'Background-version editing stopped.',
      'warning',
      'This page is now read-only; its local crash fallback remains available while the shared working copy reloads.',
    );
    return true;
  }, [mountAcknowledgedWorkingCopy, preserveAuthorityLoss]);
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
    if (editorDocument && editAuthorityState !== 'writer') return;
    const pendingDraftIdentity = editorDocument ? null : pendingDraftIdentityRef.current;
    const existingRecovery = editorDocument
      ? null
      : pendingDraftIdentity
      ? readScopedLevelEditorDraft(pendingDraftIdentity)
      : readLevelEditorDraft(draftKey);
    // An open document keeps buffering under the owner it was resolved for even after the sign-in
    // expires. Falling back to the live session email here would silently stop recovery writes at
    // the exact moment they become the only copy of the owner's work.
    const ownerEmail = editorDocument
      ? activeOwnerEmail() || undefined
      : pendingDraftIdentity?.ownerEmail?.trim().toLowerCase() ?? existingRecovery?.ownerEmail;
    if (editorDocument) {
      if (!ownerEmail || !editorClientIdentity) return;
      const expectedKey = scopedLevelEditorDraftKey({
        documentId: editorDocument.document_id,
        ownerEmail,
        clientSessionId: editorClientIdentity.sessionId,
      });
      if (draftKey !== expectedKey) return;
    }
    const savedAt = Date.now();
    const draft: LevelEditorDraft = {
      savedAt,
      savedSig: savedSig ?? standaloneBaselineSigRef.current ?? '',
      documentId: editorDocument?.document_id ?? pendingDraftIdentity?.documentId ?? existingRecovery?.documentId,
      ownerEmail,
      clientSessionId: editorDocument
        ? editorClientIdentity?.sessionId
        : pendingDraftIdentity?.clientSessionId ?? existingRecovery?.clientSessionId,
      documentRevision: editorDocument
        ? documentRevisionRef.current ?? undefined
        : existingRecovery?.documentRevision,
      editGeneration: editorDocument
        ? editSessionRef.current?.edit_generation
        : existingRecovery?.editGeneration,
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
      cardsDealt: battleForSave?.cardsDealt,
      victory: victoryForSave,
      events: eventsForSave,
    };
    const wrote = editorDocument && ownerEmail
      ? writeScopedLevelEditorDraft({
          documentId: editorDocument.document_id,
          ownerEmail,
          clientSessionId: editorClientIdentity?.sessionId,
        }, draft)
      : pendingDraftIdentity
      ? writeScopedLevelEditorDraft(pendingDraftIdentity, draft)
      : writeLevelEditorDraft(draftKey, draft);
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
  }, [campaignAssignmentId, clockEnabled, clockIncrementSeconds, clockInitialSeconds, currentEditorBoard, draftKey, editAuthorityState, editorClientIdentity, editorDocument, editorLoadError, editorReady, eventsForSave, levelNameForSave, me?.email, objective, savedSig, surviveTurns, targetLevelId, victoryForSave]);

  const eventsEditorHref = (open: boolean, tab: LevelEditorEventsTab = eventsTab): string => (
    levelEditorHrefWithRouteState(window.location.href, {
      layer: 'rules',
      eventsEditor: open,
      eventsTab: open ? tab : null,
    })
  );

  const selectEventsTab = (tab: LevelEditorEventsTab): void => {
    if (!eventsOpenRef.current) return;
    const nextHref = eventsEditorHref(true, tab);
    if (!navigateApp(nextHref, { replace: true, scroll: false })) return;
    setEventsTab(tab);
  };

  const openEventsEditor = (tab: LevelEditorEventsTab = 'victory'): void => {
    if (eventsOpenRef.current) {
      selectEventsTab(tab);
      return;
    }
    const baseHref = eventsEditorHref(false, tab);
    const openHref = levelEditorHrefWithRouteState(baseHref, {
      layer: 'rules',
      eventsEditor: true,
      eventsTab: tab,
    });
    if (!navigateApp(openHref, { scroll: false })) return;
    const state = window.history.state && typeof window.history.state === 'object'
      ? window.history.state as Record<string, unknown>
      : {};
    replaceAppHistoryState({
      ...state,
      levelEditorEventsEntry: true,
      levelEditorEventsBaseHref: baseHref,
    }, openHref);
    eventsOpenRef.current = true;
    setEventsTab(tab);
    setEventsOpen(true);
  };

  const closeEventsEditor = (restoreTriggerFocus = true): void => {
    const closedHref = eventsEditorHref(false);
    const state = window.history.state && typeof window.history.state === 'object'
      ? window.history.state as Record<string, unknown>
      : {};
    const canReturnToBase = state.levelEditorEventsEntry === true
      && state.levelEditorEventsBaseHref === closedHref;
    eventsOpenRef.current = false;
    setEventsOpen(false);
    if (canReturnToBase) {
      window.history.back();
    } else {
      navigateApp(closedHref, { replace: true, scroll: false });
    }
    if (restoreTriggerFocus) {
      window.requestAnimationFrame(() => eventsOpenButtonRef.current?.focus());
    }
  };

  const levelArtworkWorkspaceHref = (workspace?: LevelArtworkWorkspace): string => (
    levelEditorHrefWithRouteState(window.location.href, {
      layer: 'level-artwork',
      levelArtworkWorkspace: workspace ?? null,
    })
  );

  const openLevelArtworkWorkspace = (workspace: LevelArtworkWorkspace): void => {
    const nextHref = levelArtworkWorkspaceHref(workspace);
    if (!navigateApp(nextHref, { scroll: false })) return;
    setLayer('level-artwork');
    setTool('select');
    setLevelArtworkWorkspace(workspace);
  };

  const closeLevelArtworkWorkspace = (): void => {
    const nextHref = levelArtworkWorkspaceHref();
    setLevelArtworkWorkspace(undefined);
    navigateApp(nextHref, { replace: true, scroll: false });
  };

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
    if (!sharedAuthStatus) return undefined;
    // A sign-in that expires under an open document must not re-enter document resolution: that
    // path answers "sign in to open this editor document", which would block the board, stop the
    // browser buffer, and strand every edit made since the expiry in RAM until the sign-in
    // navigation discards it. Pause instead, and keep everything mounted.
    if (isInterruptedByCloudSignOut({
      documentOpen: Boolean(editorDocumentRef.current),
      reachable: sharedAuthStatus.reachable,
      signedIn: sharedAuthStatus.user.signed_in,
    })) {
      enterCloudSignOut();
      return undefined;
    }
    // The same owner signing back in reconnects the document already on screen. A DIFFERENT owner
    // falls through to normal resolution, so one account can never inherit another's mounted
    // working copy or its browser buffer.
    if (shouldResumeInterruptedCloudSync({
      interruptedOwnerEmail: signedOutInterruptionRef.current,
      reachable: sharedAuthStatus.reachable,
      signedIn: sharedAuthStatus.user.signed_in,
      email: sharedAuthStatus.user.email,
    })) {
      void resumeInterruptedCloudSync();
      return undefined;
    }
    let active = true;
    void (async () => {
      editSessionRef.current = null;
      editPresenceRef.current = null;
      setEditSession(null);
      setEditPresence(null);
      setEditAuthorityState('checking');
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
      let hydrationTimer: number | undefined;
      await Promise.race([
        hydration,
        new Promise<void>((resolve) => {
          hydrationTimer = window.setTimeout(resolve, EDITOR_HYDRATION_WAIT_MS);
        }),
      ]);
      if (hydrationTimer !== undefined) window.clearTimeout(hydrationTimer);
      const auth = sharedAuthStatus;
      const user = auth.user;
      if (!active) return;
      if (user.signed_in) signInHandoffPendingRef.current = false;

      let provisionalIdentity: LevelEditorClientIdentity | null = null;
      let provisionalDraftIdentity: ScopedLevelEditorDraftIdentity | null = null;
      let provisionalDraft: LevelEditorDraft | null = null;
      let offlineProvisionalDraftIdentity: ScopedLevelEditorDraftIdentity | null = null;
      let offlineProvisionalDraft: LevelEditorDraft | null = null;
      let provisionalPreservedRecoveries: Array<{
        sourceIdentity: ScopedLevelEditorDraftIdentity;
        recovery: PreservedScopedLevelEditorRecovery;
        sourceIsCurrentDraft?: boolean;
      }> = [];
      const needsPageRecoveryIdentity = user.signed_in || !routeParams.documentId;
      if (needsPageRecoveryIdentity) {
        const ownerEmail = user.signed_in
          ? user.email?.trim().toLowerCase() ?? ''
          : OFFLINE_LEVEL_EDITOR_OWNER;
        provisionalIdentity = await claimLevelEditorClientIdentity(provisionalClientScope);
        if (!active) return;
        if (!provisionalIdentity || !ownerEmail) {
          pendingDraftIdentityRef.current = null;
          editorClientIdentityRef.current = null;
          setEditorClientIdentity(null);
          setEditAuthorityState('error');
          setEditorLoadError({
            title: 'Safe editing identity unavailable',
            detail: 'This page could not establish its own protected editor identity. Editing is blocked so another tab\'s recovery cannot be reused or overwritten.',
            retry: true,
          });
          setCloudSaveState('error');
          setCloudSaveDetail('No browser recovery was read or written without a page-unique identity.');
          setTargetBaselineResolved(false);
          setEditorReady(true);
          return;
        }
        provisionalDraftIdentity = {
          documentId: provisionalClientScope,
          ownerEmail,
          clientSessionId: provisionalIdentity.sessionId,
        };
        pendingDraftIdentityRef.current = provisionalDraftIdentity;
        provisionalDraft = readScopedLevelEditorDraft(provisionalDraftIdentity);
        // A dead or duplicated page owns a different session key. Never mount that branch as this
        // page's authority, but enumerate it now so it can be re-homed into the resolved document's
        // explicit recovery list instead of becoming unreachable under the provisional level key.
        provisionalPreservedRecoveries = routeParams.documentId
          ? []
          : listPreservedScopedLevelEditorRecoveries(provisionalDraftIdentity)
              .map((recovery) => ({ sourceIdentity: provisionalDraftIdentity!, recovery }));
        if (user.signed_in && !routeParams.documentId) {
          offlineProvisionalDraftIdentity = {
            documentId: provisionalClientScope,
            ownerEmail: OFFLINE_LEVEL_EDITOR_OWNER,
            clientSessionId: provisionalIdentity.sessionId,
          };
          offlineProvisionalDraft = readScopedLevelEditorDraft(offlineProvisionalDraftIdentity);
          provisionalPreservedRecoveries.push(
            ...listPreservedScopedLevelEditorRecoveries(offlineProvisionalDraftIdentity)
              .map((recovery) => ({ sourceIdentity: offlineProvisionalDraftIdentity!, recovery })),
          );
        }
        const provisionalDraftKey = scopedLevelEditorDraftKey(provisionalDraftIdentity);
        if (provisionalDraftKey) setDraftKey(provisionalDraftKey);
        if (routeParams.documentId) {
          editorClientIdentityRef.current = provisionalIdentity;
          setEditorClientIdentity(provisionalIdentity);
        }
      }

      const requestedLevelId = routeParams.levelId;
      const canonical = requestedLevelId ? useCampaigns.getState().levels[requestedLevelId] : undefined;
      if (canonical) {
        setSavedSig(normalizedLevelEditorSignature(canonical));
        setTargetBaselineResolved(true);
      }
      const legacyUnscopedDraft = readLevelEditorDraft(initialDraftKey) ?? unscopedLocalDraft;
      const provisionalCurrentCandidates = [
        provisionalDraft && provisionalDraftIdentity
          ? { draft: provisionalDraft, sourceIdentity: provisionalDraftIdentity }
          : null,
        offlineProvisionalDraft && offlineProvisionalDraftIdentity
          ? { draft: offlineProvisionalDraft, sourceIdentity: offlineProvisionalDraftIdentity }
          : null,
      ]
        .filter((candidate): candidate is { draft: LevelEditorDraft; sourceIdentity: ScopedLevelEditorDraftIdentity } => Boolean(candidate))
        .sort((left, right) => right.draft.savedAt - left.draft.savedAt);
      const provisionalCurrentCandidate = provisionalCurrentCandidates[0] ?? null;
      if (!routeParams.documentId) {
        provisionalPreservedRecoveries.push(...provisionalCurrentCandidates.slice(1).map((candidate) => ({
          sourceIdentity: candidate.sourceIdentity,
          sourceIsCurrentDraft: true,
          recovery: {
            recoveryId: `session:${candidate.sourceIdentity.clientSessionId}`,
            source: 'edit-session' as const,
            clientSessionId: candidate.sourceIdentity.clientSessionId ?? undefined,
            draft: candidate.draft,
          },
        })));
      }
      const currentUnscopedDraft = provisionalCurrentCandidate?.draft ?? legacyUnscopedDraft;
      const recoveryIntent = user.signed_in && !routeParams.documentId
        ? readEditorSignInRecoveryIntent()
        : null;
      const claimedLegacyDraft = recoveryIntent
        && recoveryIntent.draftKey === initialDraftKey
        && legacyUnscopedDraft
        && recoveryIntent.savedAt === legacyUnscopedDraft.savedAt
        ? legacyUnscopedDraft
        : null;
      const claimedUnscopedDraft = !routeParams.documentId && provisionalCurrentCandidate
        ? provisionalCurrentCandidate.draft
        : claimedLegacyDraft;
      const claimedDraftSourceIdentity = claimedUnscopedDraft === provisionalCurrentCandidate?.draft
        ? provisionalCurrentCandidate?.sourceIdentity ?? null
        : null;
      const claimedDraftIsProvisional = Boolean(claimedDraftSourceIdentity);

      if (!auth.reachable) {
        setEditAuthorityState('error');
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
        setEditAuthorityState('not-applicable');
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

      if (claimedLegacyDraft) preserveUnscopedRecoveryIntentRef.current = true;
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

        const documentClientIdentity = routeParams.documentId
          ? provisionalIdentity
          : await claimLevelEditorClientIdentity(doc.document_id);
        if (!active) {
          if (documentClientIdentity && !routeParams.documentId) retireLevelEditorClientIdentity(doc.document_id);
          return;
        }
        if (!documentClientIdentity) throw new Error('This browser could not create the page identity required for safe editing.');
        const ownerEmail = user.email?.trim().toLowerCase() ?? '';
        // Remember the resolved owner so a later session expiry cannot orphan this document's
        // browser recovery address, and clear any interruption this load has just resolved.
        documentOwnerEmailRef.current = ownerEmail;
        signedOutInterruptionRef.current = null;
        const scopedDraftIdentity: ScopedLevelEditorDraftIdentity = {
          documentId: doc.document_id,
          ownerEmail,
          clientSessionId: documentClientIdentity.sessionId,
        };
        pendingDraftIdentityRef.current = scopedDraftIdentity;
        let provisionalScopeRetired = false;
        const retireProvisionalScope = (): void => {
          if (provisionalScopeRetired || provisionalClientScope === doc.document_id) return;
          provisionalScopeRetired = true;
          retireLevelEditorClientIdentity(provisionalClientScope);
        };
        const clearClaimedDraftSource = (): void => {
          if (claimedDraftIsProvisional && claimedDraftSourceIdentity) {
            clearScopedLevelEditorDraft(claimedDraftSourceIdentity);
          } else if (claimedLegacyDraft) {
            clearLevelEditorDraft(initialDraftKey);
          }
          preserveUnscopedRecoveryIntentRef.current = false;
          clearEditorSignInRecoveryIntent();
        };
        editorDocumentRef.current = doc;
        editorClientIdentityRef.current = documentClientIdentity;
        setEditorClientIdentity(documentClientIdentity);
        let ownerEditSession = false;
        let openedAsWriter = false;
        try {
          const openingSession = openEditorDocumentEditSession(doc.document_id, {
            session_id: documentClientIdentity.sessionId,
            session_key: documentClientIdentity.sessionKey,
            device_id: documentClientIdentity.deviceId,
            client_label: editorClientLabel,
          });
          editSessionOpenPromiseRef.current = openingSession;
          let opened;
          try {
            opened = await openingSession;
          } finally {
            if (editSessionOpenPromiseRef.current === openingSession) editSessionOpenPromiseRef.current = null;
          }
          if (!active) {
            await closeEditorDocumentEditSession(doc.document_id, opened.session.session_id, documentClientIdentity.sessionKey).catch(() => undefined);
            retireLevelEditorClientIdentity(doc.document_id);
            return;
          }
          ownerEditSession = true;
          // Every authenticated owner page edits the same cloud working copy. The page session
          // supplies attribution and a secret, never exclusive writer ownership.
          openedAsWriter = true;
          editSessionRef.current = opened.session;
          editPresenceRef.current = opened.presence;
          setEditSession(opened.session);
          setEditPresence(opened.presence);
          setEditAuthorityState('writer');
        } catch (sessionError) {
          const status = (sessionError as { status?: number }).status;
          // ADR-0132 exact-link admin review deliberately has no session or presence. The
          // owner-scoped session endpoint returns not found even though the direct document read
          // above is allowed, so the reviewer remains visibly read-only without blocking anyone.
          if (routeParams.documentId && user.is_admin && (status === 403 || status === 404)) {
            setEditAuthorityState('reviewer');
          } else {
            throw sessionError;
          }
        }

        const scopedDraftKey = scopedLevelEditorDraftKey(scopedDraftIdentity);
        // The editor works on a projected Level. Compare cloud content through that same
        // projection so merely opening a legacy or non-normalized saved Level cannot manufacture
        // a different working-copy revision. Keep the source signature for the recovery rebase
        // guard, which must still identify the exact body the browser draft branched from.
        const documentSourceSig = levelEditorLevelSignature(doc.level);
        const documentSig = normalizedLevelEditorSignature(doc.level);
        let provisionalPreservedHandoffReady = true;
        let failedProvisionalSource: {
          sourceIdentity: ScopedLevelEditorDraftIdentity;
          recovery: PreservedScopedLevelEditorRecovery;
          sourceIsCurrentDraft?: boolean;
        } | null = null;
        if (provisionalClientScope !== doc.document_id && provisionalPreservedRecoveries.length) {
          for (const { sourceIdentity, recovery: sourceRecovery, sourceIsCurrentDraft } of provisionalPreservedRecoveries) {
            if (sourceRecovery.draft.editingId && sourceRecovery.draft.editingId !== doc.level_id) continue;
            if (isPreservedScopedLevelEditorRecoveryForwarded(sourceIdentity, sourceRecovery, doc.document_id)) continue;
            const sourceLevel = levelFromDraft(sourceRecovery.draft, doc.level);
            if (levelEditorLevelSignature(sourceLevel) === documentSig) {
              if (!markPreservedScopedLevelEditorRecoveryForwarded(sourceIdentity, sourceRecovery, doc.document_id)) {
                provisionalPreservedHandoffReady = false;
              }
              continue;
            }
            const archived = preserveScopedLevelEditorRecovery(scopedDraftIdentity, {
              ...sourceRecovery.draft,
              documentId: doc.document_id,
              ownerEmail,
              clientSessionId: documentClientIdentity.sessionId,
              recoveryConflict: true,
              editingId: doc.level_id,
            });
            if (!archived) {
              provisionalPreservedHandoffReady = false;
              if (!failedProvisionalSource || sourceRecovery.draft.savedAt > failedProvisionalSource.recovery.draft.savedAt) {
                failedProvisionalSource = { sourceIdentity, recovery: sourceRecovery, sourceIsCurrentDraft };
              }
              continue;
            }
            if (!markPreservedScopedLevelEditorRecoveryForwarded(sourceIdentity, sourceRecovery, doc.document_id)) {
              provisionalPreservedHandoffReady = false;
            }
          }
        }
        const rawScopedDraft = ownerEditSession ? readScopedLevelEditorDraft(scopedDraftIdentity) : null;
        const scopedDraft = rawScopedDraft?.editingId === doc.level_id
          ? rawScopedDraft
          : null;
        let shadowedClaimedDraftHandled = false;
        if (scopedDraft && claimedUnscopedDraft) {
          let archivedAndMarked = false;
          if (claimedDraftSourceIdentity) {
            const sourceRecovery: PreservedScopedLevelEditorRecovery = {
              recoveryId: `session:${claimedDraftSourceIdentity.clientSessionId}`,
              source: 'edit-session',
              clientSessionId: claimedDraftSourceIdentity.clientSessionId ?? undefined,
              draft: claimedUnscopedDraft,
            };
            archivedAndMarked = isPreservedScopedLevelEditorRecoveryForwarded(
              claimedDraftSourceIdentity,
              sourceRecovery,
              doc.document_id,
            );
            if (!archivedAndMarked) {
              const archived = preserveScopedLevelEditorRecovery(scopedDraftIdentity, {
                ...claimedUnscopedDraft,
                documentId: doc.document_id,
                ownerEmail,
                clientSessionId: documentClientIdentity.sessionId,
                recoveryConflict: true,
                editingId: doc.level_id,
              });
              archivedAndMarked = Boolean(archived) && markPreservedScopedLevelEditorRecoveryForwarded(
                claimedDraftSourceIdentity,
                sourceRecovery,
                doc.document_id,
              );
            }
          } else {
            archivedAndMarked = Boolean(preserveScopedLevelEditorRecovery(scopedDraftIdentity, {
              ...claimedUnscopedDraft,
              documentId: doc.document_id,
              ownerEmail,
              clientSessionId: documentClientIdentity.sessionId,
              recoveryConflict: true,
              editingId: doc.level_id,
            }));
          }
          if (archivedAndMarked) {
            clearClaimedDraftSource();
            shadowedClaimedDraftHandled = true;
          }
        }
        const preservedScopedRecoveries = ownerEditSession
          ? listPreservedScopedLevelEditorRecoveries(scopedDraftIdentity)
              .filter((entry) => !entry.draft.editingId || entry.draft.editingId === doc.level_id)
              .sort((left, right) => right.draft.savedAt - left.draft.savedAt)
          : [];
        const recoveryDraft = scopedDraft ?? claimedUnscopedDraft;
        const recoveryDraftIsClaimed = Boolean(!scopedDraft && claimedUnscopedDraft && recoveryDraft === claimedUnscopedDraft);
        if (recoveryDraft?.campaignId !== undefined) {
          recoveredCampaignAssignmentRef.current = true;
          setCampaignAssignmentId(recoveryDraft.campaignId ?? '');
        }
        const localLevel = recoveryDraft
          ? levelFromDraft(recoveryDraft, doc.level)
          : sessionRecoveryLevel
          ? { ...sessionRecoveryLevel, id: doc.level_id }
          : null;
        const preservedRecoveryCandidates = preservedScopedRecoveries.map((recovery) => {
          const level = levelFromDraft(recovery.draft, doc.level);
          return { recovery, level, signature: levelEditorLevelSignature(level) };
        });
        const newestDivergentPreservedRecovery = preservedRecoveryCandidates
          .find((candidate) => candidate.signature !== documentSig) ?? null;
        const newestPreservedRecovery = newestDivergentPreservedRecovery?.recovery ?? null;
        const preservedRecoveryLevel = newestDivergentPreservedRecovery?.level ?? null;
        const localSig = localLevel ? levelEditorLevelSignature(localLevel) : undefined;
        const failedProvisionalRecoveryLevel = failedProvisionalSource
          ? levelFromDraft(failedProvisionalSource.recovery.draft, doc.level)
          : null;
        const failedProvisionalRecoveryDiverged = Boolean(
          failedProvisionalRecoveryLevel
          && levelEditorLevelSignature(failedProvisionalRecoveryLevel) !== documentSig,
        );
        const initialLevel = { ...initialCandidateRef.current, id: doc.level_id };
        const initialSig = levelEditorLevelSignature(initialLevel);
        const restoreClaimedDraft = Boolean(
          recoveryDraftIsClaimed
          && claimedUnscopedDraft
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
        const scopedDraftMatchesGeneration = Boolean(
          scopedDraft
          && scopedDraft.editGeneration !== undefined
          && scopedDraft.editGeneration === editSessionRef.current?.edit_generation,
        );
        const restoreLocal = openedAsWriter && (restoreClaimedDraft || restoreOfflineSession || Boolean(scopedDraft && scopedDraftMatchesGeneration && localLevel && shouldRestoreLocalEditorRecovery({
          localSignature: localSig,
          documentSignature: documentSig,
          localSavedAt: scopedDraft.savedAt,
          documentUpdatedAt: doc.updated_at,
          localDocumentRevision: scopedDraft.documentRevision,
          documentRevision: doc.revision,
          localCloudSignature: scopedDraft.cloudSignature,
          documentSourceSignature: documentSourceSig,
          localRecoveryConflict: scopedDraft.recoveryConflict,
        })));
        const localDiverged = Boolean(localLevel && localSig !== documentSig);
        const preservedRecoveryDiverged = Boolean(newestDivergentPreservedRecovery);
        const routeSnapshotDiverged = Boolean(loadedBoard && initialSig !== documentSig);
        const routeSnapshotSafe = !routeParams.documentId || routeParams.documentRevision === doc.revision;
        const restoreRouteSnapshot = openedAsWriter && routeSnapshotDiverged && routeSnapshotSafe;
        const restorePreservedBranch = shouldAdoptPreservedEditorBranch({
          openedAsWriter,
          preservedBranchDiverged: preservedRecoveryDiverged,
          documentDirty: doc.dirty,
          restoringLocalRecovery: restoreLocal,
          restoringRouteSnapshot: restoreRouteSnapshot,
        });
        const routeSnapshotRecovery: LevelEditorLocalFallbackSnapshot | null = routeSnapshotDiverged && !restoreRouteSnapshot
          ? (() => {
              const draft = {
                savedAt: Date.now(),
                savedSig: normalizedLevelEditorSignature(doc.level),
                documentId: doc.document_id,
                ownerEmail,
                clientSessionId: documentClientIdentity.sessionId,
                documentRevision: routeParams.documentRevision ?? doc.revision,
                editGeneration: editSessionRef.current?.edit_generation,
                cloudSignature: documentSig,
                recoveryConflict: true,
                editingId: doc.level_id,
                board: levelToEditorBoard(initialLevel),
                levelName: initialLevel.name,
                campaignId: recoveryDraft?.campaignId,
                objective: initialLevel.objective,
                surviveTurns: initialLevel.surviveTurns ?? DEFAULT_SURVIVE_TURNS,
                timeControl: initialLevel.timeControl,
                victory: initialLevel.victory,
                events: initialLevel.events,
              } satisfies LevelEditorDraft;
              const archived = preserveScopedLevelEditorRecovery(scopedDraftIdentity, draft);
              const recoveryCount = archived
                ? Math.max(1, listPreservedScopedLevelEditorRecoveries(scopedDraftIdentity).length)
                : 1;
              return {
                source: 'route' as const,
                draft: archived?.draft ?? draft,
                level: initialLevel,
                cloudRevision: doc.revision,
                recoveryId: archived?.recoveryId,
                recoveryCount,
              };
            })()
          : null;
        const recoveryConflict = doc.baseline_conflict;
        const recoveredLevel = restoreRouteSnapshot
          ? initialLevel
          : restoreLocal && localLevel
          ? localLevel
          : restorePreservedBranch && preservedRecoveryLevel
          ? preservedRecoveryLevel
          : doc.level;
        const shouldRecover = restoreLocal || restoreRouteSnapshot || restorePreservedBranch;
        let unsafeLocalRecoveryPreserved = true;
        let claimedDraftHandoffReady = !claimedUnscopedDraft || shadowedClaimedDraftHandled;
        let unsafeLocalRecovery: LevelEditorLocalFallbackSnapshot | null = null;
        if (localDiverged && !restoreLocal && localLevel) {
          const unsafeDraft: LevelEditorDraft = {
            ...(recoveryDraft ?? {}),
            savedAt: recoveryDraft?.savedAt ?? Date.now(),
            savedSig: recoveryDraft?.savedSig
              ?? offlineRecoverySavedSigRef.current
              ?? normalizedLevelEditorSignature(doc.level),
            documentId: doc.document_id,
            ownerEmail,
            clientSessionId: documentClientIdentity.sessionId,
            documentRevision: doc.revision,
            editGeneration: editSessionRef.current?.edit_generation,
            cloudSignature: documentSig,
            recoveryConflict: true,
            editingId: doc.level_id,
            board: levelToEditorBoard(localLevel),
            levelName: localLevel.name,
            campaignId: recoveryDraft?.campaignId,
            objective: localLevel.objective,
            surviveTurns: localLevel.surviveTurns ?? DEFAULT_SURVIVE_TURNS,
            timeControl: localLevel.timeControl,
            victory: localLevel.victory,
            events: localLevel.events,
          };
          const archived = preserveScopedLevelEditorRecovery(scopedDraftIdentity, unsafeDraft);
          unsafeLocalRecoveryPreserved = Boolean(archived);
          if (archived) {
            if (scopedDraft) clearScopedLevelEditorDraft(scopedDraftIdentity);
            if (recoveryDraftIsClaimed) {
              clearClaimedDraftSource();
              claimedDraftHandoffReady = true;
            }
          }
          unsafeLocalRecovery = {
            source: 'browser',
            draft: archived?.draft ?? unsafeDraft,
            level: localLevel,
            cloudRevision: doc.revision,
            recoveryId: archived?.recoveryId,
            cleanupDraftIdentity: !archived
              ? recoveryDraftIsClaimed
                ? claimedDraftSourceIdentity ?? undefined
                : scopedDraft
                  ? scopedDraftIdentity
                  : undefined
              : undefined,
            recoveryCount: Math.max(
              1,
              listPreservedScopedLevelEditorRecoveries(scopedDraftIdentity).length,
            ),
          };
        }
        documentRevisionRef.current = doc.revision;
        lastCloudSyncedSigRef.current = documentSig;
        documentConflictRef.current = recoveryConflict;
        documentConflictKindRef.current = doc.baseline_conflict ? 'baseline' : null;
        // Old per-tab branches are not part of the shared-document model, so they are cleared
        // rather than offered as a take-over flow. Clearing one whose content already equals the
        // acknowledged body loses nothing. A DIVERGENT branch is unsent work and is kept: an
        // adopted one self-clears on the next mount once autosave has carried it into the
        // document, so this stays a bounded buffer instead of a growing cleanup queue.
        for (const candidate of preservedRecoveryCandidates) {
          if (!preservedEditorRecoveryIsRedundant({
            recoverySignature: candidate.signature,
            documentSignature: documentSig,
          })) continue;
          clearPreservedScopedLevelEditorRecovery(scopedDraftIdentity, candidate.recovery.recoveryId);
        }
        for (const candidate of provisionalPreservedRecoveries) {
          if (!provisionalEditorRecoveryIsRedundant({
            isCurrentPageDraft: Boolean(candidate.sourceIsCurrentDraft),
            // The forwarding step above marks a source only after its content was archived under
            // the resolved document, or already matched the acknowledged body.
            forwardedIntoDocument: isPreservedScopedLevelEditorRecoveryForwarded(
              candidate.sourceIdentity,
              candidate.recovery,
              doc.document_id,
            ),
          })) continue;
          clearPreservedScopedLevelEditorRecovery(candidate.sourceIdentity, candidate.recovery.recoveryId);
        }
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

        // Every branch above that decides NOT to adopt an unsent local candidate archives it and
        // then went no further, which left real work addressable only from storage. Surface the
        // newest one so the owner can put it back, export it, or discard it deliberately.
        const offeredBranch: LevelEditorLocalFallbackSnapshot | null = unsafeLocalRecovery
          ?? routeSnapshotRecovery
          ?? (newestDivergentPreservedRecovery && !restorePreservedBranch
            ? {
                source: 'browser' as const,
                draft: newestDivergentPreservedRecovery.recovery.draft,
                level: newestDivergentPreservedRecovery.level,
                cloudRevision: doc.revision,
                recoveryId: newestDivergentPreservedRecovery.recovery.recoveryId,
                recoveryCount: Math.max(1, preservedScopedRecoveries.length),
              }
            : null);
        const mountedSignature = levelEditorLevelSignature(shouldRecover ? recoveredLevel : doc.level);
        const branchAlreadyMounted = Boolean(
          offeredBranch && levelEditorLevelSignature(offeredBranch.level) === mountedSignature,
        );
        setPreservedBranchOffer(shouldOfferPreservedEditorBranch({
          openedAsWriter,
          branchDiverged: Boolean(offeredBranch),
          adoptedIntoEditor: branchAlreadyMounted,
        }) ? offeredBranch : null);

        // A reconnect-only RAM candidate has no route envelope and may not have reached the
        // session-scoped layout writer before canonicalization remounts this component. Hand it
        // across synchronously under the already-claimed document/session identity first. This
        // serializes the whole EditorBoard (including explicit Subterrain), so the new instance
        // cannot mount an older cloud body and silently erase those faces.
        let offlineSessionHandoffReady = true;
        if (restoreOfflineSession && localLevel) {
          const offlineSessionHandoffDraft: LevelEditorDraft = {
            savedAt: Date.now(),
            savedSig: offlineRecoverySavedSigRef.current ?? normalizedLevelEditorSignature(doc.level),
            documentId: doc.document_id,
            ownerEmail,
            clientSessionId: documentClientIdentity.sessionId,
            documentRevision: doc.revision,
            editGeneration: editSessionRef.current?.edit_generation,
            cloudSignature: documentSig,
            editingId: doc.level_id,
            board: levelToEditorBoard(recoveredLevel),
            levelName: recoveredLevel.name,
            campaignId: recoveryDraft?.campaignId,
            objective: recoveredLevel.objective,
            surviveTurns: recoveredLevel.surviveTurns ?? DEFAULT_SURVIVE_TURNS,
            timeControl: recoveredLevel.timeControl,
            victory: recoveredLevel.victory,
            events: recoveredLevel.events,
          };
          offlineSessionHandoffReady = writeScopedLevelEditorDraft(
            scopedDraftIdentity,
            offlineSessionHandoffDraft,
          );
          if (!offlineSessionHandoffReady) {
            reportStatus(
              'Reconnect recovery remains in this tab.',
              'warning',
              'Browser storage rejected the document handoff, so this editor will stay mounted and autosave the recovered board here.',
            );
          }
        }

        if (scopedDraftKey && scopedDraftKey !== draftKey) setDraftKey(scopedDraftKey);
        if (claimedUnscopedDraft && recoveryDraftIsClaimed && !unsafeLocalRecovery && scopedDraftKey && ownerEmail) {
          const migrated = writeScopedLevelEditorDraft(scopedDraftIdentity, {
            ...claimedUnscopedDraft,
            documentId: doc.document_id,
            ownerEmail,
            documentRevision: doc.revision,
            editGeneration: editSessionRef.current?.edit_generation,
            cloudSignature: documentSig,
            recoveryConflict: recoveryConflict || undefined,
            editingId: doc.level_id,
          });
          if (migrated) {
            clearClaimedDraftSource();
            claimedDraftHandoffReady = true;
          }
        }
        const recoveryHandoffReady = offlineSessionHandoffReady
          && unsafeLocalRecoveryPreserved
          && claimedDraftHandoffReady
          && provisionalPreservedHandoffReady;
        if (recoveryHandoffReady) {
          retireProvisionalScope();
          offlineRecoveryLevelRef.current = null;
          offlineRecoverySavedSigRef.current = null;
        }
        const canonicalEditorHref = levelEditorHrefForDocument(window.location.href, {
          levelId: doc.level_id,
          documentId: doc.document_id,
        }, { keepRecoverySnapshot: shouldRecover || Boolean(routeSnapshotRecovery && !routeSnapshotRecovery.recoveryId) });
        const canonicalEditorUrl = new URL(canonicalEditorHref, window.location.href);
        if (recoveryHandoffReady) {
          sameDocumentRemountRef.current = levelEditorRouteIdentity(window.location.search)
            !== levelEditorRouteIdentity(canonicalEditorUrl.search);
          navigateApp(canonicalEditorHref, { replace: true, scroll: false });
        }

        setCloudSaveState(recoveryConflict ? 'conflict' : shouldRecover ? 'pending' : 'saved');
        setCloudSaveDetail(recoveryConflict
          ? 'The saved level changed after this working copy branched. Your progress is preserved; autosave is paused until you discard or resolve it.'
          : shouldRecover
            ? 'Recovered browser edits are syncing into the shared working copy.'
            : null);
        setEditorReady(true);
        reportStatus(
          doc.baseline_conflict
            ? 'Saved-position conflict preserved.'
            : shouldRecover
              ? 'Recovered newer browser edits.'
              : 'Working copy loaded.',
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
        setEditAuthorityState('error');
        if (routeParams.documentId) {
          const status = (error as { status?: number }).status;
          const failedDocumentDraftIdentity = provisionalDraftIdentity;
          const failedDocumentDraftKey = failedDocumentDraftIdentity
            ? scopedLevelEditorDraftKey(failedDocumentDraftIdentity)
            : null;
          const scopedRecovery = provisionalDraft
            ?? (failedDocumentDraftIdentity ? readScopedLevelEditorDraft(failedDocumentDraftIdentity) : null);
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
  }, [authResolutionKey, documentLoadAttempt]);

  useEffect(() => {
    if (layer !== 'history' || !revisionHistoryExpanded || !editorDocument || !me?.signed_in) return undefined;
    let active = true;
    setRevisionHistoryState('loading');
    setRevisionHistoryDetail(null);
    void listEditorDocumentRevisions(editorDocument.document_id, { limit: 50 })
      .then((result) => {
        if (!active) return;
        setRevisionHistory(result.revisions);
        setRevisionHistoryState('ready');
      })
      .catch((error: unknown) => {
        if (!active) return;
        setRevisionHistory([]);
        setRevisionHistoryState('error');
        setRevisionHistoryDetail(error instanceof Error ? error.message : String(error));
      });
    return () => { active = false; };
  }, [editorDocument?.document_id, editorDocument?.revision, layer, me?.signed_in, revisionHistoryExpanded, revisionHistoryRefresh]);

  // Every owner page edits the same cloud working copy. Polling is the cross-process notification
  // path; stale local changes are structurally merged onto the latest acknowledged revision and
  // immediately autosaved, while page heartbeats remain attribution only.
  useEffect(() => {
    if (!editorDocument || !me?.signed_in || !editSession || !editorClientIdentity) return undefined;
    if (editAuthorityState === 'reviewer' || editAuthorityState === 'error' || editSession.state === 'observing') return undefined;
    const documentId = editorDocument.document_id;
    const sessionId = editSession.session_id;
    const sessionKey = editorClientIdentity.sessionKey;
    let live = true;
    let lastHeartbeatAt = 0;
    const refresh = async (): Promise<void> => {
      const refreshSequence = ++followerRefreshSequenceRef.current;
      try {
        const heartbeat = Date.now() - lastHeartbeatAt >= EDIT_SESSION_HEARTBEAT_MS
          ? heartbeatEditorDocumentEditSession(documentId, sessionId, sessionKey)
          : null;
        if (heartbeat) lastHeartbeatAt = Date.now();
        const [result, latest] = await Promise.all([
          heartbeat,
          loadEditorDocument(documentId),
        ]);
        if (!live || refreshSequence !== followerRefreshSequenceRef.current) return;
        if (result) {
          editSessionRef.current = result.session;
          editPresenceRef.current = result.presence;
          setEditSession(result.session);
          setEditPresence(result.presence);
        }
        setEditAuthorityState('writer');

        const base = editorDocumentRef.current;
        const observedRevision = documentRevisionRef.current;
        if (!base || observedRevision === null || latest.revision <= observedRevision) return;
        const local = currentCandidateRef.current;
        const baseSignature = normalizedLevelEditorSignature(base.level);
        const localChanged = currentSigRef.current !== baseSignature;
        if (!localChanged) {
          mountAcknowledgedWorkingCopy(latest);
          return;
        }

        const merged = mergeSharedLevel(base.level, local, latest.level);
        const mergedSignature = normalizedLevelEditorSignature(merged);
        const latestSignature = normalizedLevelEditorSignature(latest.level);
        currentCandidateRef.current = merged;
        currentSigRef.current = mergedSignature;
        currentEditorBoardRef.current = levelToEditorBoard(merged);
        documentRevisionRef.current = latest.revision;
        lastCloudSyncedSigRef.current = latestSignature;
        documentConflictRef.current = latest.baseline_conflict;
        documentConflictKindRef.current = latest.baseline_conflict ? 'baseline' : null;
        editorDocumentRef.current = latest;
        setEditorDocument(latest);
        applyLevelDocumentRef.current(merged, { editingId: latest.level_id, clean: false });
        setCloudSaveState(latest.baseline_conflict ? 'conflict' : 'pending');
        setCloudSaveDetail(latest.baseline_conflict
          ? 'The canonical saved level changed. The shared unpublished working copy remains intact.'
          : 'Changes from another open editor were merged here. Syncing the combined working copy…');
      } catch (error) {
        if (!live || refreshSequence !== followerRefreshSequenceRef.current) return;
        setCloudSaveDetail('Live sync is reconnecting. This editor remains open and will retry automatically.');
      }
    };
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, EDITOR_SHARED_SYNC_POLL_MS);
    const onFocus = (): void => { void refresh(); };
    window.addEventListener('focus', onFocus);
    return () => {
      live = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [editAuthorityState, editSession?.session_id, editorClientIdentity?.sessionKey, editorDocument?.document_id, me?.signed_in, mountAcknowledgedWorkingCopy]);

  const editorSessionCanWrite = !me?.signed_in
    || !editorDocument
    || editAuthorityState === 'writer';
  const editorSessionCanAuthor = editorSessionCanWrite;

  const retryCloudDocument = (): void => {
    if (editorDocument && editAuthorityState === 'error') {
      setEditorReady(false);
      setCloudSaveState('loading');
      setCloudSaveDetail(null);
      setDocumentLoadAttempt((attempt) => attempt + 1);
      return;
    }
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

  /**
   * Sign in again without risking the edits made since the sign-out. With a browser recovery in
   * place a same-tab navigation is safe — the returning page restores it. Without one, the live
   * board is the only copy, so authenticate beside the editor and let the re-probe resume in place.
   */
  const signInToResumeCloudSync = (): void => {
    if (localBackupAvailable === false) {
      const signInWindow = window.open(signInHref('/editor'), '_blank', 'noopener,noreferrer');
      if (!signInWindow) {
        reportStatus(
          'Sign-in tab was blocked.',
          'warning',
          'Allow pop-ups, or use Download browser copy before signing in — this browser has no recovery copy.',
        );
        return;
      }
      reportStatus('Sign-in opened in another tab.', 'info', 'Keep this editor open; autosave resumes here automatically once you are signed in.');
      return;
    }
    goSignIn();
  };

  const keepRecoveredWorkingCopy = (): void => {
    if (!editorDocument || documentConflictKindRef.current !== 'recovery') return;
    if (!editorSessionCanWrite || !currentEditFence()) {
      preserveAuthorityLoss(editSessionRef.current);
      setEditAuthorityState('follower');
      reportStatus('This page is read-only.', 'warning', 'Reload an owner editing page to reconnect live sync.');
      return;
    }
    const ownerEmail = me?.email?.trim().toLowerCase() ?? '';
    const documentRevision = documentRevisionRef.current;
    const cloudSignature = lastCloudSyncedSigRef.current;
    if (!ownerEmail || documentRevision === null || !cloudSignature) {
      reportStatus('Recovery could not resume autosave.', 'error', 'The cloud document identity is incomplete; the recovered editor remains open.');
      return;
    }
    const acknowledged = acknowledgeScopedLevelEditorRecoveryConflict({
      documentId: editorDocument.document_id,
      ownerEmail,
    }, {
      expectedDocumentRevision: documentRevision,
      expectedCloudSignature: cloudSignature,
    });
    if (!acknowledged) {
      reportStatus('Recovery could not resume autosave.', 'error', 'The browser copy no longer matches the cloud revision on screen. Nothing was overwritten.');
      return;
    }
    documentConflictRef.current = false;
    documentConflictKindRef.current = null;
    setLocalBackupAvailable(true);
    setCloudSaveDetail('Writing the recovered version to your cloud working copy…');
    setCloudSaveState('pending');
    reportStatus('Recovered work selected.', 'success', 'Autosave is resuming; the saved campaign position is unchanged until you choose Save.');
  };

  /** The scoped identity of this page's recovery, valid even while the sign-in is expired. */
  const scopedRecoveryIdentity = (): ScopedLevelEditorDraftIdentity | null => {
    const doc = editorDocumentRef.current;
    const ownerEmail = activeOwnerEmail();
    return doc && ownerEmail
      ? {
          documentId: doc.document_id,
          ownerEmail,
          clientSessionId: editorClientIdentityRef.current?.sessionId,
        }
      : null;
  };

  /**
   * Put an unadopted browser branch back on the board. Autosave then carries it into the working
   * copy through the ordinary compare-and-swap, so this never writes over the server behind a
   * conflict and never publishes anything.
   */
  const restorePreservedBranchOffer = (): void => {
    const offer = preservedBranchOffer;
    const doc = editorDocumentRef.current;
    if (!offer || !doc) return;
    if (!editorSessionCanWrite) {
      reportStatus('This page is read-only.', 'warning', 'Reload an owner editing page before restoring recovered edits.');
      return;
    }
    applyLevelDocument(offer.level, { editingId: doc.level_id, clean: false });
    const identity = scopedRecoveryIdentity();
    if (identity && offer.recoveryId) clearPreservedScopedLevelEditorRecovery(identity, offer.recoveryId);
    setPreservedBranchOffer(null);
    if (cloudSaveState !== 'signed-out' && !documentConflictRef.current) {
      setCloudSaveState('pending');
      setCloudSaveDetail('Restoring the recovered edits into your cloud working copy…');
    }
    reportStatus(
      'Recovered edits restored.',
      'success',
      'They are on the board now and autosave will carry them into your working copy. The saved level is unchanged until you choose Save.',
    );
  };

  const discardPreservedBranchOffer = (): void => {
    const offer = preservedBranchOffer;
    if (!offer) return;
    const identity = scopedRecoveryIdentity();
    if (identity && offer.recoveryId) clearPreservedScopedLevelEditorRecovery(identity, offer.recoveryId);
    setPreservedBranchOffer(null);
    reportStatus('Recovered edits discarded.', 'info', 'The board on screen is unchanged; only the unsent browser copy was removed.');
  };

  const downloadBrowserRecovery = (): void => {
    if (!editorDocument) {
      reportStatus('Browser recovery export is unavailable.', 'warning', 'The cloud document identity has not loaded yet.');
      return;
    }
    const ownerEmail = activeOwnerEmail();
    // A recovery whose page session has been retired is exactly the copy most worth exporting, so
    // fall back to the offered branch rather than reporting that no recovery exists.
    const draft = readScopedLevelEditorDraft({
      documentId: editorDocument.document_id,
      ownerEmail,
      clientSessionId: editorClientIdentity?.sessionId,
    }) ?? preservedBranchOffer?.draft ?? null;
    if (!draft) {
      reportStatus('Browser recovery export is unavailable.', 'warning', 'No valid browser recovery exists for this account and document.');
      return;
    }
    const storedDraft = JSON.parse(serializeLevelEditorDraft(draft)) as unknown;
    const stem = editorRecoveryFileStem(draft.levelName, editorDocument.document_id);
    downloadJsonArtifact(`${stem}-browser-recovery.json`, {
      schema_version: 1,
      kind: 'level-editor-browser-recovery',
      exported_at: new Date().toISOString(),
      origin: window.location.origin,
      draft: storedDraft,
    });
    reportStatus('Browser recovery downloaded.', 'success', 'The file contains the exact browser board and its cloud revision binding.');
  };

  const downloadCloudWorkingCopy = (): void => {
    if (!editorDocument) {
      reportStatus('Cloud working-copy export is unavailable.', 'warning', 'Reconnect and load the document first.');
      return;
    }
    const stem = editorRecoveryFileStem(editorDocument.level.name, editorDocument.document_id);
    downloadJsonArtifact(`${stem}-cloud-revision-${editorDocument.revision}.json`, {
      schema_version: 1,
      kind: 'level-editor-cloud-working-copy',
      exported_at: new Date().toISOString(),
      document: editorDocument,
    });
    reportStatus('Cloud working copy downloaded.', 'success', `Revision ${editorDocument.revision} was exported without publishing it.`);
  };

  const restoreWorkingCopyRevision = async (target: EditorDocumentRevisionSummary): Promise<void> => {
    if (!editorDocument || !me?.signed_in || saving) return;
    if (!editorSessionCanWrite) {
      reportStatus('This page is read-only.', 'warning', 'Reload an owner editing page to reconnect live sync.');
      return;
    }
    if (documentConflictRef.current || cloudSaveState === 'error' || cloudSaveState === 'signed-out') {
      reportStatus(
        'Revision restore is paused.',
        'warning',
        cloudSaveState === 'signed-out'
          ? 'Sign in again first. Download the browser and cloud copies before choosing either side.'
          : 'Resolve the current persistence interruption first. Download the browser and cloud copies before choosing either side.',
      );
      return;
    }
    if (!(await ask({
      title: `Restore revision ${target.revision}?`,
      message: `Restore ${target.name || 'this level'} from ${target.created_at ? new Date(target.created_at).toLocaleString() : 'the selected checkpoint'} as a new cloud working-copy revision? The current cloud version remains in history.`,
      confirmLabel: 'Restore revision',
      cancelLabel: 'Keep current',
    }))) return;

    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    setSaving(true);
    try {
      if (autosavePromiseRef.current) await autosavePromiseRef.current;
      if (documentConflictRef.current) throw new Error('The working copy changed before the restore began.');
      let revision = documentRevisionRef.current;
      if (revision === null) throw new Error('working copy revision unavailable');
      const fence = currentEditFence();
      if (!fence) {
        preserveAuthorityLoss(editSessionRef.current);
        setEditAuthorityState('follower');
        reportStatus('Revision restore stopped because this tab is read-only.', 'warning', 'Editing control changed while the confirmation was open. Nothing was restored.');
        return;
      }

      // Preserve any edit still inside the former debounce window as its own server
      // revision before applying history. The restore can therefore never erase the
      // current editor merely because the user clicked during an autosave delay.
      if (lastCloudSyncedSigRef.current !== currentSigRef.current) {
        const synced = await autosaveEditorDocument(
          editorDocument.document_id,
          currentCandidateRef.current,
          revision,
          editorDocumentRef.current?.level ?? editorDocument.level,
          fence,
        );
        revision = synced.revision;
        documentRevisionRef.current = revision;
        lastCloudSyncedSigRef.current = currentSigRef.current;
        setEditorDocument(synced);
        if (synced.baseline_conflict) {
          documentConflictRef.current = true;
          documentConflictKindRef.current = 'baseline';
          setCloudSaveState('conflict');
          setCloudSaveDetail('The saved level changed outside this working copy. Revision restore remains paused.');
          return;
        }
      }

      const doc = await restoreEditorDocumentRevision(
        editorDocument.document_id,
        revision,
        target.revision,
        fence,
      );
      documentRevisionRef.current = doc.revision;
      documentConflictRef.current = false;
      documentConflictKindRef.current = null;
      lastCloudSyncedSigRef.current = normalizedLevelEditorSignature(doc.level);
      setEditorDocument(doc);
      setCloudSaveState('saved');
      setCloudSaveDetail(null);
      const canonical = useCampaigns.getState().levels[doc.level_id];
      if (canonical) setSavedSig(normalizedLevelEditorSignature(canonical));
      else if (!doc.dirty && doc.has_saved_baseline) setSavedSig(normalizedLevelEditorSignature(doc.level));
      applyLevelDocument(doc.level, { editingId: doc.level_id, clean: false, seed: true });
      setRevisionHistoryRefresh((value) => value + 1);
      reportStatus(
        `Restored revision ${target.revision}.`,
        'success',
        `It is now cloud working-copy revision ${doc.revision}. The canonical saved position was not changed.`,
      );
    } catch (error) {
      if (isEditorDocumentEditSessionError(error)) {
        preserveAuthorityLoss(error.session ?? editSessionRef.current);
        if (error.session) { editSessionRef.current = error.session; setEditSession(error.session); }
        if (error.presence) { editPresenceRef.current = error.presence; setEditPresence(error.presence); }
        setEditAuthorityState(error.code === 'editor_document_session_displaced' ? 'displaced' : 'follower');
        try {
          mountAcknowledgedWorkingCopy(error.document ?? await loadEditorDocument(editorDocument.document_id));
        } catch { /* The frozen branch stays available while cloud reload retries. */ }
        reportStatus('Revision restore stopped because this tab is read-only.', 'warning', 'The active editor is identified in Status; nothing was restored.');
        return;
      }
      if (isEditorDocumentConflict(error)) {
        documentRevisionRef.current = error.document.revision;
        documentConflictRef.current = true;
        documentConflictKindRef.current = isEditorDocumentBaselineConflict(error) ? 'baseline' : 'revision';
        setEditorDocument(error.document);
        setCloudSaveState('conflict');
        setCloudSaveDetail('The cloud working copy advanced before the revision restore. Nothing was overwritten.');
      }
      reportStatus('Revision restore failed.', 'error', error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  // Debounced, serialized compare-and-swap autosave. A conflict never overwrites either side:
  // the current board stays in memory/local recovery and the server's newer revision is surfaced.
  useEffect(() => {
    if (!editorReady || !editorDocument || !me?.signed_in || saving) return undefined;
    if (!editorSessionCanWrite) return undefined;
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
      const fence = currentEditFence();
      if (!fence) {
        preserveAuthorityLoss(editSessionRef.current);
        setEditAuthorityState('follower');
        return;
      }
      const signatureAtSave = currentSig;
      const levelAtSave = candidateLevel;
      const baseAtSave = editorDocumentRef.current?.level ?? editorDocument.level;
      autosaveInFlightRef.current = true;
      setCloudSaveState('saving');
      const request = autosaveEditorDocument(
        editorDocument.document_id,
        levelAtSave,
        revision,
        baseAtSave,
        fence,
      )
        .then((doc) => {
          const acknowledgedSignature = normalizedLevelEditorSignature(doc.level);
          documentRevisionRef.current = doc.revision;
          lastCloudSyncedSigRef.current = acknowledgedSignature;
          editorDocumentRef.current = doc;
          setEditorDocument(doc);
          if (currentSigRef.current === signatureAtSave) {
            currentCandidateRef.current = doc.level;
            currentSigRef.current = acknowledgedSignature;
            currentEditorBoardRef.current = levelToEditorBoard(doc.level);
            applyLevelDocumentRef.current(doc.level, { editingId: doc.level_id, clean: false });
          } else {
            const merged = mergeSharedLevel(levelAtSave, currentCandidateRef.current, doc.level);
            currentCandidateRef.current = merged;
            currentSigRef.current = normalizedLevelEditorSignature(merged);
            currentEditorBoardRef.current = levelToEditorBoard(merged);
            applyLevelDocumentRef.current(merged, { editingId: doc.level_id, clean: false });
          }
          if (doc.baseline_conflict) {
            documentConflictRef.current = true;
            documentConflictKindRef.current = 'baseline';
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
          setCloudSaveDetail(null);
          setCloudSaveState(currentSigRef.current === acknowledgedSignature ? 'saved' : 'pending');
        })
        .catch((error: unknown) => {
          // A 401 is the account session expiring underneath an intact working copy, not a failed
          // write. The shared session owner classifies it (ADR-0306); naming it here keeps the shell
          // honest about being signed out and routes the owner to the one action that fixes it,
          // instead of a generic "autosave failed" they cannot act on.
          if (reportAuthSessionFailure(error)) {
            enterCloudSignOut();
            return;
          }
          if (isEditorDocumentEditSessionError(error)) {
            if (error.session) {
              editSessionRef.current = error.session;
              setEditSession(error.session);
            }
            if (error.presence) {
              editPresenceRef.current = error.presence;
              setEditPresence(error.presence);
            }
            setCloudSaveState('error');
            setCloudSaveDetail('This page session could not sync. Reloading reconnects it to the shared working copy.');
            return;
          }
          if (isEditorDocumentConflict(error)) {
            const latest = error.document;
            const merged = mergeSharedLevel(baseAtSave, currentCandidateRef.current, latest.level);
            documentRevisionRef.current = latest.revision;
            lastCloudSyncedSigRef.current = normalizedLevelEditorSignature(latest.level);
            editorDocumentRef.current = latest;
            setEditorDocument(latest);
            currentCandidateRef.current = merged;
            currentSigRef.current = normalizedLevelEditorSignature(merged);
            currentEditorBoardRef.current = levelToEditorBoard(merged);
            applyLevelDocumentRef.current(merged, { editingId: latest.level_id, clean: false });
            documentConflictRef.current = latest.baseline_conflict;
            documentConflictKindRef.current = latest.baseline_conflict ? 'baseline' : null;
            setCloudSaveState(latest.baseline_conflict ? 'conflict' : 'pending');
            setCloudSaveDetail(latest.baseline_conflict
              ? 'The canonical saved level changed. The shared unpublished working copy remains intact.'
              : 'Changes from another editor were merged. Syncing the combined working copy…');
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
  }, [candidateLevel, cloudSaveState, currentSig, editorDocument, editorReady, editorSessionCanWrite, me?.signed_in, mountAcknowledgedWorkingCopy, preserveAuthorityLoss, saving]);

  // Ordinary same-tab SPA navigation closes its attributed page session before the destination
  // mounts. Final autosave is acknowledged first, then a later Test return gets a fresh page
  // identity instead of reusing a terminal one.
  useEffect(() => registerAppNavigationBlocker((attempt) => {
    if (eventsOpenRef.current) return false;
    const targetUrl = new URL(attempt.href, window.location.href);
    const currentDocument = editorDocumentRef.current;
    const staysOnSameEditorDocument = Boolean(
      currentDocument
      && isLevelEditorRoutePath(attempt.path)
      && targetUrl.searchParams.get('document') === currentDocument.document_id,
    );
    if (staysOnSameEditorDocument) return false;
    if (navigationReleaseCompleteRef.current) return false;
    if (navigationReleaseInFlightRef.current) return true;
    const initialDocument = editorDocumentRef.current;
    const initialSession = editSessionRef.current;
    const initialIdentity = editorClientIdentityRef.current;
    const pendingOpen = editSessionOpenPromiseRef.current;
    if (
      !initialDocument
      || !initialIdentity
      || (!pendingOpen && (!initialSession || initialSession.session_id !== initialIdentity.sessionId))
    ) return false;

    navigationReleaseInFlightRef.current = true;
    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    void (async () => {
      try {
        await pendingOpen?.catch(() => undefined);
        await autosavePromiseRef.current?.catch(() => undefined);
        const doc = editorDocumentRef.current;
        const session = editSessionRef.current;
        const identity = editorClientIdentityRef.current;
        const revision = documentRevisionRef.current;
        const signature = currentSigRef.current;
        const writablePageHere = Boolean(
          doc
          && session
          && identity
          && revision !== null
          && session.session_id === identity.sessionId
          && session.state !== 'observing'
          && session.state !== 'closed',
        );
        if (
          writablePageHere
          && doc
          && session
          && identity
          && revision !== null
          && !documentConflictRef.current
          && lastCloudSyncedSigRef.current !== null
          && signature !== lastCloudSyncedSigRef.current
        ) {
          try {
            const acknowledged = await autosaveEditorDocument(
              doc.document_id,
              currentCandidateRef.current,
              revision,
              doc.level,
              {
                edit_session_id: session.session_id,
                edit_session_key: identity.sessionKey,
                edit_generation: session.edit_generation,
              },
            );
            documentRevisionRef.current = acknowledged.revision;
            lastCloudSyncedSigRef.current = normalizedLevelEditorSignature(acknowledged.level);
            editorDocumentRef.current = acknowledged;
          } catch {
            // The synchronous page-scoped browser draft remains a crash fallback if final CAS fails.
          }
        }

        const closingDocument = editorDocumentRef.current ?? initialDocument;
        const closingSession = editSessionRef.current ?? initialSession;
        const closingIdentity = editorClientIdentityRef.current ?? initialIdentity;
        if (closingSession) {
          try {
            const closed = await closeEditorDocumentEditSession(
              closingDocument.document_id,
              closingSession.session_id,
              closingIdentity.sessionKey,
            );
            editSessionRef.current = closed.session;
            editPresenceRef.current = closed.presence;
          } catch {
            // Navigation remains recoverable through browser storage; the abandoned page session
            // is harmless because sessions no longer own exclusive editing authority.
            editSessionRef.current = null;
            editPresenceRef.current = null;
          }
        }
        retireLevelEditorClientIdentity(closingDocument.document_id);
      } finally {
        navigationReleaseCompleteRef.current = true;
        navigationReleaseInFlightRef.current = false;
        attempt.retry();
      }
    })();
    return true;
  }), []);

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

  // While an open document is paused for sign-in, re-read the authoritative session so signing in
  // — here or in another tab — resumes autosave without the owner having to reload and hope the
  // browser recovery is picked back up. The probe also self-heals a spurious 401: if the session
  // was in fact still valid, the very first read restores it.
  useEffect(() => {
    if (cloudSaveState !== 'signed-out') return undefined;
    const probe = (): void => { void refreshAuthSession(); };
    const probeWhenVisible = (): void => { if (!document.hidden) probe(); };
    const timer = window.setInterval(probeWhenVisible, EDITOR_SIGNED_OUT_REPROBE_MS);
    window.addEventListener('focus', probe);
    document.addEventListener('visibilitychange', probeWhenVisible);
    probe();
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', probe);
      document.removeEventListener('visibilitychange', probeWhenVisible);
    };
  }, [cloudSaveState]);

  // The artwork check is account-gated, so it dies with the session AND with the backend — and it
  // is the only thing standing between a level's remembered plate and the board. Left latched it
  // hides artwork the level still holds, on every layer, with terrain suppressed and nothing said:
  // a few seconds of backend restart used to blank a pre-drawn board until the page was reloaded.
  // Retry it on the same signals ADR-0519 re-probes identity on, so the plate comes back by itself.
  const predrawnSelectionCheckRef = useRef(predrawnSelectionValidation);
  predrawnSelectionCheckRef.current = predrawnSelectionValidation;
  const predrawnReadFailureAnnouncedRef = useRef(false);
  // Every retry passes back through `checking`, so the FAILURE EPISODE is the unit here, not the
  // instantaneous state. Keying the listeners on the state itself tore them down for the length of
  // each attempt, and a recovery signal landing in that window fell on the floor — which is the
  // same "it never came back" this whole effect exists to prevent. This latch is only ever read to
  // hold the episode open across its own retries; nothing renders from it.
  const predrawnReadFailurePending = predrawnSelectionReadShouldRetry(predrawnSelectionValidation)
    || (predrawnSelectionValidation.kind === 'checking' && predrawnReadFailureAnnouncedRef.current);
  useEffect(() => {
    if (!predrawnReadFailurePending) {
      predrawnReadFailureAnnouncedRef.current = false;
      predrawnUnauthorizedReportedRef.current = false;
      return undefined;
    }
    if (!predrawnReadFailureAnnouncedRef.current) {
      predrawnReadFailureAnnouncedRef.current = true;
      const check = predrawnSelectionCheckRef.current;
      // Level Artwork is one panel out of eighteen, and this state is reported nowhere else. An
      // unannounced blank board is exactly how this was last mistaken for lost artwork.
      reportStatusRef.current(
        'AI artwork hidden — its version list could not be read.',
        'warning',
        check.kind === 'unreachable' && check.signedOut
          ? 'Your sign-in expired. The level still holds this artwork; it reappears once you sign in again.'
          : 'The level still holds this artwork. It reappears as soon as the check succeeds, and this retries on its own.',
      );
    }
    const retry = (): void => setPredrawnValidationAttempt((attempt) => attempt + 1);
    const retryWhenVisible = (): void => { if (!document.hidden) retry(); };
    const timer = window.setInterval(retryWhenVisible, EDITOR_SIGNED_OUT_REPROBE_MS);
    window.addEventListener('online', retry);
    window.addEventListener('focus', retry);
    document.addEventListener('visibilitychange', retryWhenVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('online', retry);
      window.removeEventListener('focus', retry);
      document.removeEventListener('visibilitychange', retryWhenVisible);
    };
  }, [predrawnReadFailurePending]);

  // A sign-in noticed here or in another tab repaints the artwork without waiting for the tick
  // above. Keyed on the session snapshot ALONE and reading the check through a ref: depending on
  // the check's own state would re-fire on every retry this causes, which is an unbounded loop.
  useEffect(() => {
    if (!sharedAuthStatus?.reachable || !sharedAuthStatus.user.signed_in) return;
    if (!predrawnSelectionReadShouldRetry(predrawnSelectionCheckRef.current)) return;
    setPredrawnValidationAttempt((attempt) => attempt + 1);
  }, [sharedAuthStatus]);

  // A route change must not manufacture a 700 ms loss window. Normal autosaves themselves use
  // keepalive, and this departure flush sends the latest unsent snapshot. If an older write is
  // already in flight during an in-app unmount, the latest write is chained after its CAS ack.
  useEffect(() => {
    const flushLatest = (pageHiding: boolean): void => {
      const doc = editorDocumentRef.current;
      const revision = documentRevisionRef.current;
      const signature = currentSigRef.current;
      const fence = currentEditFence();
      if (
        !doc
        || !signedInRef.current
        || !fence
        || revision === null
        || documentConflictRef.current
        || signature === lastCloudSyncedSigRef.current
        || signature === departureFlushSigRef.current
      ) return;
      departureFlushSigRef.current = signature;
      if (pageHiding) {
        autosaveEditorDocumentOnPageHide(doc.document_id, currentCandidateRef.current, revision, doc.level, fence);
      } else {
        void autosaveEditorDocument(doc.document_id, currentCandidateRef.current, revision, doc.level, fence).catch(() => undefined);
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
          const serverSignature = normalizedLevelEditorSignature(serverDocument.level);
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
      // Canonicalizing levelId -> opaque document deliberately remounts the authority-owning
      // component. The new instance reuses the held page identity and owns recovery/autosave;
      // firing a competing teardown write here would race the same revision and create a false
      // conflict. Real route departure still takes the flush path.
      if (!sameDocumentRemountRef.current) flushAfterCurrentWrite(false);
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
  // The colours a faction may move to: the ones no unit on the board is wearing. Offering a
  // colour already in use would fold two factions into one, which is a different act than
  // recolouring and is not what this control is for.
  const unassignedFactions = useMemo(
    () => UNIT_PALETTES.filter((faction) => boardFactionCounts[faction] === 0),
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
  const onFactionControlChange = (faction: UnitPalette) => (control: FactionControl): void => {
    setFactionControl(faction, control);
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
      // An expired sign-in over a mounted document has its own resume path, which protects the
      // edits made since the expiry instead of treating this as a first sign-in.
      if (cloudSaveState === 'signed-out') {
        signInToResumeCloudSync();
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
      battle: existing?.battle,
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
      const fence = currentEditFence();
      if (!fence) {
        preserveAuthorityLoss(editSessionRef.current);
        setEditAuthorityState('follower');
        reportStatus('This page is read-only.', 'warning', 'Reload an owner editing page to reconnect live sync.');
        return;
      }
      const saved = await saveEditorDocument(
        editorDocument.document_id,
        revision,
        level,
        campaignAssignmentId || null,
        fence,
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
      lastCloudSyncedSigRef.current = normalizedLevelEditorSignature(doc.level);
      setEditorDocument(doc);
      const acknowledgedSig = normalizedLevelEditorSignature(doc.level);
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
      if (isEditorDocumentEditSessionError(e)) {
        preserveAuthorityLoss(e.session ?? editSessionRef.current);
        if (e.session) { editSessionRef.current = e.session; setEditSession(e.session); }
        if (e.presence) { editPresenceRef.current = e.presence; setEditPresence(e.presence); }
        setEditAuthorityState(e.code === 'editor_document_session_displaced' ? 'displaced' : 'follower');
        try {
          mountAcknowledgedWorkingCopy(e.document ?? await loadEditorDocument(editorDocument.document_id));
        } catch { /* The frozen branch stays available while cloud reload retries. */ }
        reportStatus('Save stopped because this tab is read-only.', 'warning', 'The active editor is identified in Status; no canonical data was changed.');
        return;
      }
      if (isEditorDocumentConflict(e)) {
        documentRevisionRef.current = e.document.revision;
        documentConflictRef.current = true;
        documentConflictKindRef.current = isEditorDocumentBaselineConflict(e) ? 'baseline' : 'revision';
        setEditorDocument(e.document);
        setCloudSaveState('conflict');
        setCloudSaveDetail(isEditorDocumentBaselineConflict(e)
          ? 'The canonical saved position changed. Your working progress was preserved and nothing was overwritten.'
          : 'The server returned an unexpected newer working-copy revision. No live editor identity was inferred, and no canonical data was overwritten.');
        reportStatus(
          isEditorDocumentBaselineConflict(e) ? 'Save stopped because the saved position changed.' : 'Save stopped by a revision conflict.',
          'warning',
          `Your current editor remains open. ${browserRecoverySafetyDetail}`,
        );
        return;
      }
      const mapped = mapSaveError(e);
      if ('action' in mapped) { reportAuthSessionFailure(e); signInForEditor(); return; }
      reportStatus(mapped.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const discardChanges = async (): Promise<void> => {
    if (!editorDocument || !targetLevelId || !editorDocumentHasDiscardTarget(editorDocument)) return;
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
      const fence = currentEditFence();
      if (!fence) {
        preserveAuthorityLoss(editSessionRef.current);
        setEditAuthorityState('follower');
        reportStatus('This page is read-only.', 'warning', 'Reload an owner editing page to reconnect live sync.');
        return;
      }
      const doc = await discardEditorDocumentChanges(
        editorDocument.document_id,
        revision,
        fence,
      );
      documentRevisionRef.current = doc.revision;
      documentConflictRef.current = false;
      documentConflictKindRef.current = null;
      lastCloudSyncedSigRef.current = normalizedLevelEditorSignature(doc.level);
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
      if (isEditorDocumentEditSessionError(error)) {
        preserveAuthorityLoss(error.session ?? editSessionRef.current);
        if (error.session) { editSessionRef.current = error.session; setEditSession(error.session); }
        if (error.presence) { editPresenceRef.current = error.presence; setEditPresence(error.presence); }
        setEditAuthorityState(error.code === 'editor_document_session_displaced' ? 'displaced' : 'follower');
        try {
          mountAcknowledgedWorkingCopy(error.document ?? await loadEditorDocument(editorDocument.document_id));
        } catch { /* The frozen branch stays available while cloud reload retries. */ }
        reportStatus('Discard stopped because this tab is read-only.', 'warning', 'The active editor is identified in Status; nothing was discarded.');
        return;
      }
      if (isEditorDocumentConflict(error)) {
        documentRevisionRef.current = error.document.revision;
        documentConflictRef.current = true;
        setEditorDocument(error.document);
        setCloudSaveState('conflict');
        setCloudSaveDetail('The working copy revision changed unexpectedly. Session identity is shown separately above; review and choose Discard changes again.');
        reportStatus('Discard stopped by a revision conflict.', 'warning', 'Nothing was discarded.');
      } else {
        reportStatus('Discard failed.', 'error', (error as Error).message);
      }
    } finally {
      setSaving(false);
    }
  };

  const applyLayerSelection = (nextLayer: LayerKey): void => {
    setLayer(nextLayer);
    setTool(toolForLayer(nextLayer));
    setArtworkSelectionActive(false);
    if (nextLayer !== 'level-artwork') setLevelArtworkWorkspace(undefined);
    if (nextLayer === 'paths') {
      // Keep whichever path kind is already armed (road/river); default to road.
      setBrushKind((kind) => (kind === 'road' || kind === 'river' ? kind : 'road'));
      return;
    }
    if (nextLayer === 'placed-art') {
      setBrushKind(placedArtKind);
      setTool(placedArtKind === 'artwork' ? 'select' : 'brush');
      return;
    }
    if (
      nextLayer !== 'board'
      && nextLayer !== 'camera'
      && nextLayer !== 'status'
      && nextLayer !== 'history'
      && nextLayer !== 'rules'
      && nextLayer !== 'generate'
      && nextLayer !== 'level-artwork'
    ) setBrushKind(nextLayer as BrushKind);
  };
  const selectLayer = (nextLayer: LayerKey): void => {
    if (
      isLayerOptionDisabled(nextLayer)
      || (isPredrawnBoard && isPredrawnLockedLayer(nextLayer))
    ) return;
    if (eventsOpenRef.current) {
      pendingRulesExitActionRef.current = () => applyLayerSelection(nextLayer);
      closeEventsEditor(false);
      return;
    }
    applyLayerSelection(nextLayer);
  };
  const selectPlacedArtKind = (nextKind: PlacedArtBrushKind): void => {
    setPlacedArtKind(nextKind);
    setLayer('placed-art');
    setBrushKind(nextKind);
    setArtworkSelectionActive(false);
    setLevelArtworkWorkspace(undefined);
    setTool(nextKind === 'artwork' ? 'select' : 'brush');
  };
  const selectCell = (x: number, y: number): void => {
    // Artwork selection is deliberately object-only. A blank-board click must not silently clear
    // the locked instance; authors use the explicit None option when they want no artwork selected.
    if (brushKind === 'artwork') return;
    setSelectedArtworkId(null);
    setSelectedCell({ x, y });
  };
  const selectArtwork = (id: string): void => {
    const placement = boardFloatingArtwork.find((candidate) => candidate.id === id);
    if (!placement) return;
    setSelectedCell(null);
    setSelectedArtworkId(id);
    setArtworkBrushDirection(placement.direction);
  };
  /**
   * The catch of one dragged rectangle. `additive` (Shift held) folds it into the live selection
   * so several sweeps can build one group; an empty catch from a plain drag clears the selection,
   * which is how dragging over blank scene means "nothing".
   */
  const selectArtworkMany = (ids: readonly string[], additive: boolean): void => {
    const present = new Set(boardFloatingArtwork.map((placement) => placement.id));
    const caught = ids.filter((id) => present.has(id));
    setSelectedCell(null);
    setSelectedArtworkIds((selected) => {
      const merged = additive
        ? [...selected.filter((id) => present.has(id) && !caught.includes(id)), ...caught]
        : caught;
      return merged;
    });
  };
  // A single-object edit keeps whatever else is selected — the author is tuning the primary, not
  // dropping the group they just swept up.
  const keepArtworkSelected = (id: string): void => setSelectedArtworkIds(
    (selected) => selected.includes(id) ? selected : [id],
  );
  const updateArtwork = (
    id: string,
    update: (placement: FloatingArtworkPlacement) => FloatingArtworkPlacement,
  ): void => {
    const next = cloneEditorBoard(currentEditorBoardRef.current);
    const index = (next.floatingArtwork ?? []).findIndex((placement) => placement.id === id);
    if (index < 0) return;
    const placements = [...(next.floatingArtwork ?? [])];
    placements[index] = update(placements[index]);
    next.floatingArtwork = placements;
    commitEditorBoard(next, null);
    keepArtworkSelected(id);
  };
  const moveArtwork = (id: string, point: { pixelX: number; pixelY: number }): void => {
    const source = (currentEditorBoardRef.current.floatingArtwork ?? []).find((placement) => placement.id === id);
    if (!source) return;
    const normalized = normalizeFloatingArtworkPoint(point, source);
    updateArtwork(id, (placement) => ({ ...placement, ...normalized }));
  };
  /**
   * Dragging one member of a selection drags the whole selection, by the same offset. Anything
   * else would make a swept-up group unmovable except one piece at a time, which is the reason to
   * sweep it up in the first place.
   */
  const moveArtworkGroup = (id: string, point: { pixelX: number; pixelY: number }): void => {
    const board = currentEditorBoardRef.current;
    const source = (board.floatingArtwork ?? []).find((placement) => placement.id === id);
    if (!source) return;
    const moving = selectedArtworkIds.includes(id) ? selectedArtworkIds : [id];
    if (moving.length <= 1) {
      moveArtwork(id, point);
      return;
    }
    const anchor = normalizeFloatingArtworkPoint(point, source);
    const dx = anchor.pixelX - source.pixelX;
    const dy = anchor.pixelY - source.pixelY;
    if (dx === 0 && dy === 0) return;
    const next = cloneEditorBoard(board);
    next.floatingArtwork = (next.floatingArtwork ?? []).map((placement) => moving.includes(placement.id)
      ? {
        ...placement,
        ...normalizeFloatingArtworkPoint(
          { pixelX: placement.pixelX + dx, pixelY: placement.pixelY + dy },
          placement,
        ),
      }
      : placement);
    commitEditorBoard(next, null);
  };
  /** The Delete button, the erase slot, and the Delete key all remove the WHOLE selection. */
  const deleteSelectedArtwork = (): void => {
    if (!selectedArtworkIds.length) return;
    const doomed = new Set(selectedArtworkIds);
    const next = cloneEditorBoard(currentEditorBoardRef.current);
    const placements = (next.floatingArtwork ?? []).filter((placement) => !doomed.has(placement.id));
    if (placements.length === (next.floatingArtwork ?? []).length) return;
    next.floatingArtwork = placements;
    if (commitEditorBoard(next, null)) setSelectedArtworkIds([]);
  };
  const changeEditorTool = (nextTool: LevelEditorToolKey): void => {
    if (brushKind === 'artwork' && nextTool === 'erase') {
      deleteSelectedArtwork();
      return;
    }
    if (brushKind === 'artwork' && nextTool === 'select') {
      if (artworkSelectionActive) {
        setArtworkSelectionActive(false);
        setSelectedArtworkId(null);
      } else {
        setArtworkSelectionActive(true);
        setTool('select');
      }
      return;
    }
    if (brushKind === 'artwork') setArtworkSelectionActive(false);
    setTool(nextTool);
  };
  const duplicateArtwork = (id: string): void => {
    const source = (currentEditorBoardRef.current.floatingArtwork ?? []).find((placement) => placement.id === id);
    if (!source) return;
    const offset = normalizeFloatingArtworkPoint({ pixelX: source.pixelX + 24, pixelY: source.pixelY + 24 });
    const duplicate = { ...source, ...offset, id: `art-${crypto.randomUUID()}` };
    const next = cloneEditorBoard(currentEditorBoardRef.current);
    next.floatingArtwork = [...(next.floatingArtwork ?? []), duplicate];
    if (commitEditorBoard(next, null)) setSelectedArtworkId(duplicate.id);
  };
  const eventZoneOptions = useMemo<EventZoneOption[]>(
    () => boardZoneEntries.map((entry, index) => ({ id: entry.id, label: zoneDisplayName(entry, index) })),
    [boardZoneEntries],
  );
  const otherEvents = useMemo(() => eventsWithoutDeployment(events), [events]);
  const deploymentZoneOptions = useMemo<DeploymentZoneOption[]>(() => {
    const blocked = new Set(candidateLevel.layers.units.map((unit) => `${unit.x},${unit.y}`));
    for (const cell of candidateLevel.layers.terrain) {
      if (!isPassableTerrain(cell.terrain)) blocked.add(`${cell.x},${cell.y}`);
    }
    for (const placed of candidateLevel.layers.props ?? []) {
      const def = propDef(placed.propId);
      if (!def?.blocking) continue;
      for (const cell of propCells(placed.x, placed.y, def)) blocked.add(`${cell.x},${cell.y}`);
    }
    return boardZoneEntries.map((entry, index) => ({
      id: entry.id,
      label: zoneDisplayName(entry, index),
      type: entry.type,
      excludedPieceTypes: entry.excludedPieceTypes ?? [],
      paintedTiles: entry.tiles.length,
      usableTileKeys: [...new Set(entry.tiles.filter((tile) => {
        const [x, y] = tile.split(',').map(Number);
        return Number.isInteger(x) && Number.isInteger(y)
          && x >= 0 && y >= 0 && x < candidateLevel.board.cols && y < candidateLevel.board.rows
          && !blocked.has(tile);
      }))],
    }));
  }, [boardZoneEntries, candidateLevel]);
  const removeZonesForRemovedEvents = (removedEvents: readonly LevelEvent[], remainingEvents: readonly LevelEvent[]): void => {
    const board = cloneEditorBoard(currentEditorBoardRef.current);
    const entries = zoneEntriesForBoard(board);
    const updated = removeZoneEntriesReferencedOnlyByRemovedEvents(entries, removedEvents, remainingEvents);
    if (!updated) return;
    commitEditorBoard(withZoneEntries(board, updated), null);
  };
  const setOtherEventsWithZoneCleanup = (nextOtherEvents: LevelEvents, removedEvents: readonly LevelEvent[] = []): void => {
    const normalizedNextEvents = normalizeLevelEvents(mergeOtherEvents(events, nextOtherEvents));
    setEvents(normalizedNextEvents);
    if (removedEvents.length) removeZonesForRemovedEvents(removedEvents, normalizedNextEvents);
  };
  const clearOtherEvents = (): void => setOtherEventsWithZoneCleanup([], otherEvents);
  const createDeploymentZone = (side: ConditionSide): void => {
    const board = cloneEditorBoard(currentEditorBoardRef.current);
    const entries = zoneEntriesForBoard(board).map((entry) => ({ ...entry, tiles: [...entry.tiles] }));
    const zoneType = side === 'player' ? 'player-spawn' : 'enemy-spawn';
    // One zone per deployment type, always (ADR-0367). Creating an existing one opens it.
    const existingIndex = entries.findIndex((entry) => entry.type === zoneType);
    if (existingIndex >= 0) {
      setSelectedZoneIndex(existingIndex);
      selectLayer('zone');
      return;
    }
    const baseName = side === 'player' ? 'Player Deployment' : 'Enemy Deployment';
    const id = nextZoneEntryId(entries);
    entries.push({
      id,
      name: uniqueZoneEntryName(baseName, entries),
      color: side === 'player' ? 'blue' : 'red',
      type: zoneType,
      tiles: [],
    });
    setSelectedZoneIndex(entries.length - 1);
    commitEditorBoard(withZoneEntries(board, entries), null);
    const deployment = authoredDeploymentForSide(events, side);
    if (deployment.enabled && !(isWarBattle && side === 'player')) {
      setEvents(replaceSideDeployment(events, side, {
        roster: deployment.roster,
        zoneIds: [id],
      }));
    }
    selectLayer('zone');
  };
  const editDeploymentZone = (zoneId: string): void => {
    selectZoneEntry(zoneId);
    selectLayer('zone');
  };
  // Switching a piece type into its own deployment zone is ONE command (ADR-0367): it bars the type
  // from the general Player Deployment zone and, on the same click, gives it a zone to stand in.
  // Switching back off retains the painted squares — the entry stays in the editor's store and
  // simply stops being part of the Level — so switching on again returns the zone the author had.
  const setDedicatedDeploymentZone = (pieceType: 'pawn' | 'king', on: boolean): void => {
    const board = cloneEditorBoard(currentEditorBoardRef.current);
    const entries = zoneEntriesForBoard(board).map((entry) => ({ ...entry, tiles: [...entry.tiles] }));
    const generalIndex = entries.findIndex((entry) => entry.type === 'player-spawn');
    if (generalIndex < 0) {
      reportStatus('Create the Player starting zone first.', 'error', 'A piece type is broken off the shared deployment pool, so that pool has to exist before a type can leave it.');
      return;
    }
    const general = entries[generalIndex];
    const excluded = new Set(general.excludedPieceTypes ?? []);
    if (on) excluded.add(pieceType);
    else excluded.delete(pieceType);
    const nextExcluded = PLAYABLE_PIECE_TYPES.filter((type) => excluded.has(type));
    entries[generalIndex] = { ...general, excludedPieceTypes: nextExcluded.length ? nextExcluded : undefined };

    const zoneType = 'player-king-spawn';
    let zoneIndex = entries.findIndex((entry) => entry.type === zoneType);
    if (on && zoneIndex < 0) {
      entries.push({
        id: nextZoneEntryId(entries),
        name: uniqueZoneEntryName('King Deployment', entries),
        color: 'gold',
        type: zoneType,
        tiles: [],
      });
      zoneIndex = entries.length - 1;
    }
    if (on && zoneIndex >= 0) setSelectedZoneIndex(zoneIndex);
    commitEditorBoard(withZoneEntries(board, entries), null);
  };
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
      const type = unitFamilyForId(placement.unitId);
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
  const adjustZoom = (delta: number): void => {
    markBoardViewInteraction();
    setViewZoom((z) => Math.min(viewMaxZoom, Math.max(viewMinZoom, Number((z + delta).toFixed(2)))));
  };
  const resetBoardView = (): void => {
    resetFramedBoardView();
  };
  // Resize the board. Growing exposes new empty (paintable) cells; shrinking prunes any
  // tiles/units — and a now-offboard selection — whose coordinates fall outside the new
  // bounds, so nothing keeps rendering or counting off the edge of the board.
  const resizeBoard = (nextCols: number, nextRows: number, side: BoardResizeSide): void => {
    const dx = side === 'left' ? nextCols - boardCols : 0;
    const dy = side === 'top' ? nextRows - boardRows : 0;
    const shiftKey = (key: string): string => {
      const [x, y] = key.split(',').map(Number);
      return `${x + dx},${y + dy}`;
    };
    const shiftMap = <T,>(map: Record<string, T> | undefined): Record<string, T> =>
      Object.fromEntries(Object.entries(map ?? {}).map(([key, value]) => [shiftKey(key), value]));
    const shiftEdges = <T,>(map: Record<string, T> | undefined): Record<string, T> =>
      Object.fromEntries(Object.entries(map ?? {}).map(([edge, value]) => [edge.split('|').map(shiftKey).join('|'), value]));
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
    if (dx || dy) {
      nextBoard.cells = shiftMap(nextBoard.cells);
      nextBoard.units = shiftMap(nextBoard.units);
      nextBoard.doodads = shiftMap(nextBoard.doodads);
      nextBoard.props = shiftMap(nextBoard.props);
      nextBoard.cover = shiftMap(nextBoard.cover);
      nextBoard.coverTypes = shiftMap(nextBoard.coverTypes);
      nextBoard.features = shiftMap(nextBoard.features);
      nextBoard.zones = shiftMap(nextBoard.zones);
      nextBoard.fencePosts = shiftMap(nextBoard.fencePosts);
      nextBoard.fences = shiftEdges(nextBoard.fences);
      nextBoard.walls = shiftEdges(nextBoard.walls);
      nextBoard.wallArt = shiftEdges(nextBoard.wallArt);
      nextBoard.featureCuts = shiftEdges(nextBoard.featureCuts);
      nextBoard.featureExits = shiftEdges(nextBoard.featureExits);
      nextBoard.macroTiles = (nextBoard.macroTiles ?? []).map((placement) => ({ ...placement, x: placement.x + dx, y: placement.y + dy }));
      nextBoard.zoneEntries = zoneEntriesForBoard(nextBoard).map((entry) => ({ ...entry, tiles: entry.tiles.map(shiftKey) }));
      nextBoard.generatedRegions = (nextBoard.generatedRegions ?? []).map((region) => ({ ...region, cells: region.cells.map(shiftKey) }));
    }
    nextBoard.cells = prune(nextBoard.cells);
    nextBoard.units = prune(nextBoard.units);
    nextBoard.doodads = prune(nextBoard.doodads);
    // Props are FOOTPRINT-aware and may stand on the scenic apron (ADR-0365), so the resize rule is
    // "does every footprint cell still have authored ground under the NEW dimensions" — playable or
    // scenic. A prop only disappears when the shrink pulls the ground out from under it.
    {
      const survivingScenicKeys = new Set(
        decorativeTerrainApronCoordinates(
          nextCols,
          nextRows,
          nextBoard.decorativeApron ?? decorativeApron,
          nextBoard.decorativeFootprint ?? [],
        ).map(({ x, y }) => `${x},${y}`),
      );
      const onAuthoredSurface = (x: number, y: number): boolean =>
        (x >= 0 && y >= 0 && x < nextCols && y < nextRows) || survivingScenicKeys.has(`${x},${y}`);
      const next: Record<string, { propId: string }> = {};
      let dropped = false;
      for (const [key, placement] of Object.entries(nextBoard.props)) {
        const def = resolvePropDef(placement.propId);
        const [ax, ay] = key.split(',').map(Number);
        const fits = def
          // Same rule the brush applies: authored ground under every cell, and wholly playable or
          // wholly scenic — a grow that would straddle a prop across the new edge drops it.
          ? isPropFootprintOnAuthoredSurface(propCells(ax, ay, def), nextCols, nextRows, onAuthoredSurface)
          : onAuthoredSurface(ax, ay); // unknown id: fall back to the anchor-only check
        if (fits) next[key] = placement;
        else dropped = true;
      }
      if (dropped) nextBoard.props = next;
    }
    nextBoard.cover = prune(nextBoard.cover);
    nextBoard.coverTypes = prune(nextBoard.coverTypes ?? {});
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
    // Posts live on grid VERTICES, whose valid domain includes the far outer boundary
    // (0..cols, 0..rows). This deliberately differs from the half-open cell bounds above.
    {
      const next: Record<string, FenceMaterial> = {};
      let dropped = false;
      for (const [vertex, material] of Object.entries(nextBoard.fencePosts ?? {})) {
        const [vx, vy] = vertex.split(',').map(Number);
        if (Number.isInteger(vx) && Number.isInteger(vy) && vx >= 0 && vy >= 0 && vx <= nextCols && vy <= nextRows) next[vertex] = material;
        else dropped = true;
      }
      if (dropped) nextBoard.fencePosts = next;
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
    // A square with no terrain entry is already open ground to the rules (see canTraverse), but it
    // is not a square the EDITOR can show or hit-test: the grid and its targets are built from the
    // terrain map. Seed the squares a grow just created so they exist, are traversable, and can be
    // given an obstacle later. They inherit their nearest neighbour so a grow reads as more of the
    // same ground rather than a differently-coloured band.
    for (let y = 0; y < nextRows; y += 1) {
      for (let x = 0; x < nextCols; x += 1) {
        const key = `${x},${y}`;
        if (nextBoard.cells[key] !== undefined) continue;
        nextBoard.cells[key] = nearestAuthoredTileId(nextBoard.cells, x, y) ?? leDefaultTile().id;
      }
    }
    if (isPredrawnBoard) nextBoard.predrawnGridDetached = true;
    const shiftedSelection = selectedCell ? { x: selectedCell.x + dx, y: selectedCell.y + dy } : null;
    commitEditorBoard(
      nextBoard,
      shiftedSelection && (shiftedSelection.x < 0 || shiftedSelection.y < 0 || shiftedSelection.x >= nextCols || shiftedSelection.y >= nextRows) ? null : shiftedSelection,
      { playableWindow: true },
    );
    if (selectedArtworkIds.length) {
      const surviving = new Set((nextBoard.floatingArtwork ?? []).map((placement) => placement.id));
      setSelectedArtworkIds((selected) => selected.filter((id) => surviving.has(id)));
    }
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

  /**
   * Slide the grid one square across an AI plate.
   *
   * The legacy move rebases the whole authored scene inside its scenic rectangle, which is the
   * right answer when the environment IS that scene. Here the environment is a picture pinned in
   * projected space, so the same intent is served by moving the picture the other way instead:
   * nothing is rebased, nothing is dropped, no scenic apron has to exist first, and the terrain
   * under the grid — which is now pure movement rules — keeps the coordinates it always had.
   */
  const movePlateUnderGrid = (direction: PlayableGridMoveDirection): void => {
    if (!editorSessionCanWrite) {
      reportStatus(
        'Grid placement is read-only.',
        'warning',
        'This review page is read-only.',
      );
      return;
    }
    const current = currentEditorBoardRef.current;
    const step = PLAYABLE_GRID_MOVE_PLATE_STEP[direction];
    const offset = current.predrawnPlateOffset ?? { left: 0, top: 0 };
    const projected = projectBoardPoint({ x: step.x, y: step.y });
    const moved = commitEditorBoard(
      {
        ...cloneEditorBoard(current),
        predrawnGridDetached: true,
        predrawnPlateOffset: {
          left: offset.left + projected.left,
          top: offset.top + projected.top,
        },
      },
      undefined,
      { playableWindow: true },
    );
    if (!moved) return;
    reportStatus(
      `Moved the grid one square ${direction}.`,
      'success',
      'The artwork stays where it is and the grid slides across it. Reset artwork placement returns it.',
    );
  };

  /** Whether the owner has moved the artwork away from its own registration. */
  const platePlacementMoved = Boolean(
    boardPredrawnPlateOffset
    && (boardPredrawnPlateOffset.left !== 0 || boardPredrawnPlateOffset.top !== 0),
  );

  /**
   * Return the artwork to the placement its own registration gives it (ADR-0057: reset means the
   * committed baseline, not zeroed-out state — for a plate those are the same thing, because its
   * baseline placement IS its recorded world bounds).
   *
   * The grid stays detached: a resize may also have taken it off the artwork's geometry, and the
   * two are separate decisions.
   */
  const resetPlatePlacement = (): void => {
    if (!editorSessionCanWrite) {
      reportStatus(
        'Artwork placement is read-only.',
        'warning',
        'This review page is read-only.',
      );
      return;
    }
    if (!platePlacementMoved) return;
    const committed = commitEditorBoard(
      { ...cloneEditorBoard(currentEditorBoardRef.current), predrawnPlateOffset: undefined },
      undefined,
      { playableWindow: true },
    );
    if (!committed) return;
    reportStatus(
      'Artwork placement reset.',
      'success',
      'The picture is back at its own registration. The grid size is unchanged.',
    );
  };

  const moveGrid = (direction: PlayableGridMoveDirection): void => {
    if (isPredrawnBoard) {
      movePlateUnderGrid(direction);
      return;
    }
    const result = movePlayableGrid(currentEditorBoardRef.current, direction);
    if (!result) {
      const availability = playableGridMoveAvailability(currentEditorBoardRef.current, direction);
      reportStatus(
        `Could not move the playable grid ${direction}.`,
        'warning',
        availability.reason ?? 'The authored scene has no room in that direction.',
      );
      return;
    }

    const { x: dx, y: dy } = result.contentDelta;
    const shiftedKey = (key: string): string | undefined => {
      const match = /^(-?\d+),(-?\d+)$/.exec(key);
      if (!match) return undefined;
      return `${Number(match[1]) + dx},${Number(match[2]) + dy}`;
    };
    const authoredScenicKeys = new Set(
      decorativeTerrainApronCoordinates(
        result.board.cols,
        result.board.rows,
        result.board.decorativeApron ?? { top: 0, right: 0, bottom: 0, left: 0 },
        result.board.decorativeFootprint ?? [],
      ).map(({ x, y }) => `${x},${y}`),
    );
    const onAuthoredSurface = (key: string): boolean => {
      const [x, y] = key.split(',').map(Number);
      return (x >= 0 && x < result.board.cols && y >= 0 && y < result.board.rows)
        || authoredScenicKeys.has(key);
    };
    const shiftedSelection = selectedCell
      ? { x: selectedCell.x + dx, y: selectedCell.y + dy }
      : null;
    const selectedKey = shiftedSelection ? `${shiftedSelection.x},${shiftedSelection.y}` : '';
    if (!commitEditorBoard(
      result.board,
      shiftedSelection && onAuthoredSurface(selectedKey) ? shiftedSelection : null,
    )) return;

    if (activeGeneratedRegionId) {
      const activeRegion = result.board.generatedRegions?.find((region) => region.id === activeGeneratedRegionId);
      setRegionSelection(new Set(activeRegion?.cells ?? []));
    } else {
      setRegionSelection((current) => new Set(
        [...current]
          .map(shiftedKey)
          .filter((key): key is string => key !== undefined && onAuthoredSurface(key)),
      ));
    }

    const label = direction[0].toUpperCase() + direction.slice(1);
    reportStatus(
      `Moved the playable grid ${label}.`,
      result.dropped.total ? 'warning' : 'success',
      result.dropped.total
        ? `${result.dropped.total} gameplay placement${result.dropped.total === 1 ? '' : 's'} left the playable rectangle and ${result.dropped.total === 1 ? 'was' : 'were'} removed.`
        : 'The authored scene stayed aligned. Undo restores the previous grid position.',
    );
  };

  const paintedCount = Object.keys(boardCells).length;
  const unitCount = Object.keys(boardUnits).length;
  const doodadCount = Object.keys(boardDoodads).length;
  const propCount = Object.keys(boardProps).length;
  const artworkCount = boardFloatingArtwork.length;
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
  const selectedArtwork = selectedArtworkId
    ? boardFloatingArtwork.find((placement) => placement.id === selectedArtworkId)
    : undefined;
  // Scene Art keeps its explicit selection while authors visit another destination, but its
  // transform controls belong only to Placed Art. Do not let that remembered selection leak into
  // Zone (or any other layer) through the shared Details card.
  const selectedArtworkForDetails = layer === 'placed-art' && brushKind === 'artwork'
    ? selectedArtwork
    : undefined;
  const selectedArtworkAsset = selectedArtwork ? structureArtAsset(selectedArtwork.sourceArtId) : undefined;
  const selectedArtworkDirections = selectedArtwork ? structureArtDirections(selectedArtwork.sourceArtId) : [];
  const artworkFacingDirections = selectedArtwork ? selectedArtworkDirections : artworkBrushDirections;
  const artworkFacingDirection = selectedArtwork?.direction ?? artworkBrushDirection;
  const artworkSceneBounds = boardBounds({ ...currentEditorBoard, floatingArtwork: [] });
  const artworkXRange = {
    min: Math.max(
      -MAX_FLOATING_ARTWORK_PIXEL,
      Math.floor(Math.min(artworkSceneBounds.minX - 512, selectedArtwork?.pixelX ?? artworkSceneBounds.minX)),
    ),
    max: Math.min(
      MAX_FLOATING_ARTWORK_PIXEL,
      Math.ceil(Math.max(artworkSceneBounds.minX + artworkSceneBounds.width + 512, selectedArtwork?.pixelX ?? artworkSceneBounds.minX)),
    ),
  };
  const artworkYRange = {
    min: Math.max(
      -MAX_FLOATING_ARTWORK_PIXEL,
      Math.floor(Math.min(artworkSceneBounds.minY - 512, selectedArtwork?.pixelY ?? artworkSceneBounds.minY)),
    ),
    max: Math.min(
      MAX_FLOATING_ARTWORK_PIXEL,
      Math.ceil(Math.max(artworkSceneBounds.minY + artworkSceneBounds.height + 512, selectedArtwork?.pixelY ?? artworkSceneBounds.minY)),
    ),
  };
  const setArtworkFacing = (direction: Direction): void => {
    if (!artworkFacingDirections.includes(direction)) return;
    setArtworkBrushDirection(direction);
    if (selectedArtwork) {
      updateArtwork(selectedArtwork.id, (placement) => ({ ...placement, direction }));
    }
  };
  const rotateArtworkFacing = (): void => {
    if (!artworkFacingDirections.length) return;
    const index = artworkFacingDirections.indexOf(artworkFacingDirection);
    setArtworkFacing(artworkFacingDirections[(Math.max(index, 0) + 1) % artworkFacingDirections.length]);
  };
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
    if (index >= 0 && visibleZoneIndices.includes(index)) setSelectedZoneIndex(index);
  };
  const stepZoneEntry = (delta: -1 | 1): void => {
    const count = visibleZoneIndices.length;
    if (!count) return;
    setSelectedZoneIndex((current) => {
      const at = Math.max(0, visibleZoneIndices.indexOf(current));
      return visibleZoneIndices[(at + delta + count) % count];
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
  const generationFrameStatus = predrawnGenerationFrameStatus({
    frame: currentEditorBoard.predrawnGenerationFrame,
    cloudFrame: workingDocumentPredrawnGenerationFrame,
    canonicalFrame: canonicalPredrawnGenerationFrame,
    cloudState: cloudSaveState,
    promotionVerb: isOfficialTarget ? 'publish' : 'save',
  });
  const saveLabel = isOfficialTarget ? 'Publish to all players' : 'Save';
  const cloudDocumentAvailable = Boolean(me?.signed_in && editorDocument && targetLevelId && targetBaselineResolved);
  const targetSaveUnavailable = !cloudDocumentAvailable;
  // Save (user save AND official publish) is gated on ZERO playability violations (ADR-0050) — the
  // editor gives full freedom to mess the board up, but blocks persisting a rule-breaking level —
  // AND on main's conditions: hydrated workspace/association context, something to save (dirty),
  // no in-flight save, and (campaign levels) a resolved Player faction.
  const persistenceHydration = isOfficialTarget ? officialWorkspaceHydration : userWorkspaceHydration;
  const saveContextReady = persistenceHydration === 'ready' && campaignAssignmentHydrated;
  const canSave = editorSessionCanWrite && saveContextReady && !saving && !targetSaveUnavailable && !documentConflictRef.current && dirty && !needsPlayerFaction && playability.ok;
  const saveBlockedMessage = saving
    ? 'Save is already in progress.'
    : me?.signed_in && editorDocument && !editorSessionCanWrite
    ? editAuthorityState === 'reviewer'
      ? 'This document is open for administrator review only.'
      : 'Live sync is reconnecting before this page can save.'
    : !me?.signed_in && authReachable === false
    ? 'Reconnect to save this level.'
    : !me?.signed_in
    ? 'Sign in to save this level.'
    : documentConflictRef.current
    ? 'Save is paused by a working-copy content conflict; this does not by itself identify another editor.'
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
    : me?.signed_in && editorDocument && !editorSessionCanWrite
    ? editAuthorityState === 'reviewer'
      ? 'Cross-owner review does not create presence or grant mutation authority.'
      : 'Every owner tab shares one working copy; this page will resume automatically when sync reconnects.'
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
    : cloudSaveState === 'signed-out'
    ? 'Signed out — autosave paused'
    : cloudSaveState === 'conflict'
    ? 'Autosave paused'
    : 'Cloud autosave interrupted';
  const recoveryConflictVisible = false;
  const persistenceEmergencyVisible = cloudSaveState === 'conflict'
    || cloudSaveState === 'error'
    || cloudSaveState === 'signed-out';
  const hasDiscardableChanges = Boolean(
    editorSessionCanWrite
    && editorDocumentHasDiscardTarget(editorDocument)
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
    const canonicalEditorHref = levelEditorHrefWithRouteState(window.location.href, {
      layer,
      brushKind: levelEditorRouteBrushKind(layer, brushKind),
      brush: brushKind === 'wallart' ? wallArtBrushId : null,
      eventsEditor: eventsOpen,
      eventsTab: eventsOpen ? eventsTab : null,
      levelArtworkWorkspace: layer === 'level-artwork' ? levelArtworkWorkspace : null,
    });
    return currentBoardTestHref({
      boardCode: encodeBoard(currentEditorBoard),
      levelName: levelNameForSave,
      objective,
      surviveTurns,
      timeControl: clockEnabled ? { initialSeconds: clockInitialSeconds, incrementSeconds: clockIncrementSeconds } : undefined,
      events: eventsForSave,
      victory: victoryForSave,
      editorSearch: new URL(canonicalEditorHref, window.location.origin).search,
      campaignId: routeParams.campaignId,
      levelId: targetLevelId,
      documentRevision: editorDocument?.revision,
      editorReturnTo: routeParams.returnTo,
      layer,
    });
  }, [levelArtworkWorkspace, brushKind, clockEnabled, clockIncrementSeconds, clockInitialSeconds, currentEditorBoard, editorDocument?.revision, eventsForSave, eventsOpen, eventsTab, layer, levelNameForSave, objective, playability.ok, routeParams.campaignId, routeParams.returnTo, surviveTurns, targetLevelId, victoryForSave, wallArtBrushId]);
  const canUndoBoard = undoStack.length > 0 && (
    !isPredrawnBoard || sharesPredrawnSelection(currentEditorBoard, undoStack[undoStack.length - 1])
  );
  const canRedoBoard = redoStack.length > 0 && (
    !isPredrawnBoard || sharesPredrawnSelection(currentEditorBoard, redoStack[0])
  );
  const actionToolsDisabled = tool === 'region'
    || Boolean(levelArtworkWorkspace)
    || layer === 'level-artwork'
    || layer === 'camera'
    || eventsOpen;
  // Inactive Scene Art discovery deliberately has no pressed toolbar action, but its actions stay
  // available so Select can activate discovery. Only process workspaces disable the tool buttons.
  const actionToolbarTool: LevelEditorToolKey | null = tool === 'region'
    || actionToolsDisabled
    || (layer === 'placed-art' && brushKind === 'artwork' && tool === 'select' && !artworkSelectionActive)
    ? null
    : tool;

  // Delete removes what is selected in the workspace you are looking at, and nothing else. Each
  // branch is the same call the layer's own remove button makes, so the key can never delete
  // something the button would have refused. It never reaches the level document itself — losing
  // a whole level to a stray keypress is not a trade worth making for a shortcut.
  const deleteKeyAction = !editorSessionCanWrite || eventsOpen
    ? null
    : layer === 'placed-art' && brushKind === 'artwork' && selectedArtworkIds.length
      ? deleteSelectedArtwork
      : layer === 'placed-art' && brushKind === 'forest' && selectedForest
        ? () => removeForest(selectedForest)
        : layer === 'placed-art' && brushKind === 'town' && selectedTown
          ? () => removeTown(selectedTown)
          : layer === 'zone' && activeZone
            ? removeActiveZoneEntry
            : layer === 'generate' && activeGeneratedRegion
              ? () => removeGeneratedRegionUnit(activeGeneratedRegion.id)
              : null;
  useDeleteKeyAction(deleteKeyAction);

  return (
    // The level editor is a homepage-family surface: it shows the ONE shared HomepageBackdrop
    // (menu scene + synced rain), not the battlefield world. The backdrop is a SIBLING of the
    // faded editor chrome (not a child) so it stays continuous across navigation and never
    // re-fades on entrance (ADR-0046 §G) — the same shape CampaignEditor uses. The editor's own
    // ::before battlefield is dropped (.level-editor-screen::before) so the shared scene shows
    // through the transparent chrome; /play keeps that battlefield (its game world).
    <div className="level-editor-root">
      <HomepageBackdrop />
      <ArtRouteChrome
        className="skirmish-screen level-editor-screen"
        data-testid="level-editor"
        data-editor-authority={editorReady ? 'ready' : 'loading'}
        data-editor-terrain={isPredrawnBoard ? 'predrawn' : editorTerrainPainted ? 'painted' : 'loading'}
        data-editor-scene={editorScenePainted ? 'painted' : 'loading'}
        data-editor-frame={editorRouteError ? 'error' : editorFramePainted ? 'painted' : 'loading'}
        ready={editorReady}
      >
        {installedChromeCss ? <style data-level-editor-chrome-family dangerouslySetInnerHTML={{ __html: installedChromeCss }} /> : null}
        {confirmDialog}
        {predrawnPickerOpen && predrawnPreview && editorReady ? (
          <PredrawnCornerPicker
            key={`${predrawnPreview}:${boardCols}x${boardRows}`}
            src={predrawnPreview}
            initialRegistration={predrawnRegistration}
            columns={boardCols}
            rows={boardRows}
            onChange={savePredrawnRegistration}
            onClose={closePredrawnPicker}
            showCodexHandoff={false}
          />
        ) : null}
        {predrawnGenerationFrameOpen && editorReady && editorSessionCanWrite ? (
          <PredrawnGenerationFramePicker
            board={currentEditorBoard}
            initialFrame={currentEditorBoard.predrawnGenerationFrame}
            applicationStatus={generationFrameStatus}
            onApply={applyPredrawnGenerationFrame}
            onClose={closePredrawnGenerationFrame}
          />
        ) : null}
        {/* Ordinary editor status stays in Status. Optional version history has its own layer. */}
        {editorReady ? <TitleBarControlContribution
          ariaLabel="Editor navigation"
          controls={[
            ...(cameFromStudio ? [{
              id: 'level-editor-catalog',
              kind: 'navigation' as const,
              label: '‹ Catalog',
              destination: '/studio',
              title: 'Return to the Studio catalog',
            }] : []),
            ...(routeParams.returnTo ? [{
              id: 'level-editor-back',
              kind: 'navigation' as const,
              presentation: 'return' as const,
              label: '‹ Back',
              destination: routeParams.returnTo,
              title: 'Return to the campaign editor',
            }] : []),
          ] satisfies TitleBarControlSpec[]}
        /> : null}

        <div
          className="skirmish-field"
          inert={!editorReady
            || saving
            || (!editorSessionCanAuthor && !levelArtworkWorkspace)
            ? true
            : undefined}
          aria-busy={!editorReady || saving || undefined}
        >
          <div className="le-persistence-stack">
          {preservedBranchOffer ? (
            <section className="le-persistence-emergency" data-testid="le-preserved-branch-offer" role="status">
              <div>
                <strong>Unsynced edits found in this browser</strong>
                <span>
                  {`Edits from ${new Date(preservedBranchOffer.draft.savedAt).toLocaleString()} never reached the cloud working copy, so the editor opened on the version your account has. Restore puts them back on the board and autosaves them; nothing is published either way.`}
                </span>
              </div>
              <div className="le-persistence-emergency-actions">
                <ChromeButton unit="inner-text-button"
                  className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', 'active')}
                  data-testid="le-restore-preserved-branch"
                  disabled={!editorSessionCanWrite || saving}
                  onClick={restorePreservedBranchOffer}
                >Restore these edits</ChromeButton>
                <ChromeButton unit="inner-text-button"
                  className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
                  data-testid="le-download-preserved-branch"
                  onClick={downloadBrowserRecovery}
                >Download copy</ChromeButton>
                <ChromeButton unit="inner-text-button"
                  className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
                  data-testid="le-discard-preserved-branch"
                  onClick={discardPreservedBranchOffer}
                >Discard</ChromeButton>
              </div>
            </section>
          ) : null}
          {persistenceEmergencyVisible ? (
            <section className="le-persistence-emergency" data-testid="le-persistence-emergency" role="alert">
              <div>
                <strong>{recoveryConflictVisible
                  ? 'Recovered work needs your decision'
                  : cloudSaveState === 'signed-out'
                  ? 'You were signed out — your work is safe here'
                  : cloudSaveState === 'error'
                  ? 'Autosave is interrupted'
                  : 'Autosave is paused'}</strong>
                <span>{cloudSaveDetail ?? 'Your current editor remains open, but progress is not being written to the cloud.'}</span>
              </div>
              <div className="le-persistence-emergency-actions">
                {recoveryConflictVisible ? (
                  <ChromeButton unit="inner-text-button"
                    className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', 'active')}
                    data-testid="le-keep-recovered-work"
                    onClick={keepRecoveredWorkingCopy}
                  >Keep recovered work</ChromeButton>
                ) : null}
                {cloudSaveState === 'signed-out' ? (
                  <ChromeButton unit="inner-text-button"
                    className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', 'active')}
                    data-testid="le-sign-in-resume-banner"
                    onClick={signInToResumeCloudSync}
                  >Sign in and resume</ChromeButton>
                ) : null}
                {cloudSaveState === 'error' ? (
                  <ChromeButton unit="inner-text-button"
                    className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', 'active')}
                    data-testid="le-retry-cloud-sync-banner"
                    onClick={retryCloudDocument}
                  >Retry autosave</ChromeButton>
                ) : null}
                <ChromeButton unit="inner-text-button"
                  className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
                  data-testid="le-download-browser-recovery-banner"
                  onClick={downloadBrowserRecovery}
                >Download browser copy</ChromeButton>
                <ChromeButton unit="inner-text-button"
                  className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
                  data-testid="le-download-cloud-copy-banner"
                  onClick={downloadCloudWorkingCopy}
                >Download cloud copy</ChromeButton>
                <ChromeButton unit="inner-text-button"
                  className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
                  onClick={() => selectLayer(recoveryConflictVisible ? 'history' : 'status')}
                >{recoveryConflictVisible ? 'Review recovery' : 'Review status'}</ChromeButton>
              </div>
            </section>
          ) : null}
          </div>
          <ShellViewportSwap
            className="level-editor-viewport-swap"
            primaryClassName="skirmish-board-frame"
            workspaceOpen={eventsOpen || Boolean(levelArtworkWorkspace)}
            primary={(
              <>
            {activeFenceArtwork ? (
              <div className="le-fence-review-banner" data-testid="fence-candidate-editor-review">
                <strong>Fence artwork drawing · {activeFenceArtwork.label}</strong>
                <span>{activeFenceArtworkReview?.statusLabel} · {activeFenceArtwork.post ? 'draw rails/posts anywhere' : 'rail-only artwork'} · cycle artwork in Fence controls</span>
              </div>
            ) : fenceArtReviewEnabled ? (
              <div className="le-fence-review-banner" data-testid="fence-candidate-editor-review" role="status">
                <strong>Fence review media unavailable</strong>
                <span>{fenceReviewCatalogMessage}</span>
              </div>
            ) : null}
            <ViewPane
              kind="board"
              boardViewportMode="fill"
              ariaLabel="Level editor board"
              zoom={viewZoom}
              pan={viewPan}
              minZoom={BOARD_CAMERA_TECHNICAL_MINIMUM_ZOOM}
              maxZoom={viewMaxZoom}
              onZoomChange={setViewZoom}
              onPanChange={setViewPan}
              // No coverage clamp here. Play must never show past the environment art, but the
              // editor is where that art's extent is DECIDED — against the camera boundary, the
              // grid placement and the artwork's own edges. Clamping to coverage made all of those
              // unreachable: on a level whose boundary is larger than its art, every edge and
              // corner handle of the boundary sits outside the canvas at every zoom the clamp
              // permits, so the box could be neither seen nor grabbed.
              onMinimumZoomChange={setViewMinZoom}
              onViewportSizeChange={setViewViewportSize}
              onViewInteraction={markBoardViewInteraction}
            >
              <div className="tileset-view-board-content is-board" data-art-review={activeFenceArtwork ? FENCE_ART_REVIEW_ID : undefined} data-fence-art={activeFenceArtwork?.id}>
                {editorLoadError ? (
                  <div className="tileset-view-empty" role="status" aria-live="polite">
                    <h2>{editorLoadError.title}</h2>
                    <p>{editorLoadError.detail}</p>
                    {editorLoadError.signIn ? (
                      <ChromeButton unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')} onClick={signInForEditor}>Sign in</ChromeButton>
                    ) : null}
                    {editorLoadError.retry ? (
                      <ChromeButton unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')} onClick={retryCloudDocument}>Retry</ChromeButton>
                    ) : null}
                  </div>
                ) : fenceArtReviewEnabled && !activeFenceArtwork ? (
                  <div className="tileset-view-empty" role="status" aria-live="polite">
                    <h2>Fence review media unavailable</h2>
                    <p>{fenceReviewCatalogMessage}</p>
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
                    floatingArtwork={boardFloatingArtwork}
                    features={featureOverlays}
                    zones={visibleZones}
                    resolveAsset={resolveAsset}
                    resolveUnit={resolveUnitAsset}
                    resolveDoodad={resolveDoodadAsset}
                    resolveProp={resolvePropDef}
                    tool={layer === 'level-artwork' ? 'select' : tool}
                    selectedCell={selectedCell}
                    selectedArtworkId={selectedArtworkId}
                    selectedArtworkIds={selectedArtworkIds}
                    boardZoom={viewZoom}
                    boardPan={viewPan}
                    gridScope={gridScope}
                    cameraBoundary={layer === 'camera' ? resolvedCameraBoundary : null}
                    cameraBoundaryEditable={layer === 'camera' && cameraBoundaryInteractionMode === 'edit' && editorSessionCanWrite}
                    onCameraBoundaryCommit={commitCameraBoundary}
                    predrawnOcclusionEnabled={predrawnOcclusionEnabled}
                    showPredrawnOcclusionSeed={showPredrawnOcclusionSeed}
                    predrawnPlate={editorPredrawnPlate}
                    predrawnBackgroundActive={boardBackgroundModeState === 'ai' || Boolean(predrawnPreview)}
                    tacticalPreview={tacticalPreview}
                    animationFrame={animationFrame}
                    onPaint={paintCell}
                    onErase={eraseCell}
                    onSelect={selectCell}
                    onMoveArtwork={moveArtworkGroup}
                    onMove={moveObject}
                    canMoveTo={canMoveObjectTo}
                    fences={boardFences}
                    fencePosts={boardFencePosts}
                    fenceArtwork={activeFenceArtwork}
                    cover={boardCover}
                    coverTypes={boardCoverTypes}
                    coverSeed={coverSeed}
                    fenceTool={fenceTool}
                    fencePaintTarget={fencePaintTarget}
                    onPaintEdge={paintFenceEdge}
                    onEraseEdge={eraseFenceEdge}
                    onPaintPost={paintFencePost}
                    onErasePost={eraseFencePost}
                    walls={boardWalls}
                    subterrain={boardSubterrain}
                    wallTool={wallTool}
                    subterrainTool={subterrainTool}
                    onPaintWallEdge={paintWallEdge}
                    onEraseWallEdge={eraseWallEdge}
                    onPaintSubterrainFace={paintSubterrainFace}
                    onEraseSubterrainFace={eraseSubterrainFace}
                    wallArt={boardWallArt}
                    wallArtBrushId={wallArtBrushId}
                    wallArtTool={wallArtTool}
                    onPaintWallArtEdge={paintWallArtEdge}
                    onEraseWallArtEdge={eraseWallArtEdge}
                    propBrush={layer === 'placed-art' && brushKind === 'prop' ? { def: propBrushDef, canPlaceAt: (ax, ay) => canPlaceProp(propBrushDef, ax, ay) } : null}
                    artworkEditing={layer === 'placed-art' && brushKind === 'artwork'}
                    macroTileBrush={brushKind === 'tile' ? macroTileBrushAsset : null}
                    regionCells={regionSelection}
                    onRegionStart={selectTerrainArea}
                    decorativeApron={decorativeApron}
                    decorativeCells={decorativeCells}
                    decorativeFootprint={decorativeFootprint}
                    decorativeFences={decorativeFences}
                    decorativeFencePosts={decorativeFencePosts}
                    decorativeWalls={decorativeWalls}
                    allowDecorativeEditing={['tile', 'cover', 'road', 'river', 'fence', 'wall', 'subterrain', 'prop'].includes(brushKind)
                      || (tool === 'erase' && brushKind === 'doodad')}
                    onTerrainFirstFrame={acknowledgeEditorTerrain}
                    onSceneFirstFrame={acknowledgeEditorScene}
                    onFrameError={failEditorFrame}
                  />
                )}
                {editorReady && !saving && !editorLoadError && layer === 'placed-art' && brushKind === 'town'
                  && (tool === 'brush' || tool === 'erase') ? (
                  <div
                    className="le-artwork-free-placement-surface le-town-placement-surface"
                    data-testid="town-placement-surface"
                    aria-label={tool === 'erase'
                      ? 'Drag over a town to remove it'
                      : 'Drag out the area the town fills, or shift-drag to add another area to the selected town'}
                    onPointerDown={(event) => {
                      if (event.button !== 0) return;
                      event.preventDefault();
                      event.stopPropagation();
                      const surface = event.currentTarget;
                      surface.setPointerCapture(event.pointerId);
                      const cell = placementCellAt(event.clientX, event.clientY, surface.getBoundingClientRect());
                      // Shift EXTENDS the selected town rather than starting another one. Decided at
                      // the press, so letting the key go mid-drag cannot change what the drag was.
                      const additive = event.shiftKey && Boolean(selectedTown);
                      townDragRef.current = { pointerId: event.pointerId, cellX: cell.x, cellY: cell.y, additive };
                      setTownDrag({ area: { minX: cell.x, minY: cell.y, maxX: cell.x, maxY: cell.y }, additive });
                    }}
                    onPointerMove={(event) => {
                      const drag = townDragRef.current;
                      if (!drag || drag.pointerId !== event.pointerId) return;
                      const cell = placementCellAt(
                        event.clientX, event.clientY, event.currentTarget.getBoundingClientRect(),
                      );
                      setTownDrag({
                        area: {
                          minX: Math.min(drag.cellX, cell.x), minY: Math.min(drag.cellY, cell.y),
                          maxX: Math.max(drag.cellX, cell.x), maxY: Math.max(drag.cellY, cell.y),
                        },
                        additive: drag.additive,
                      });
                    }}
                    onPointerUp={(event) => {
                      const drag = townDragRef.current;
                      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                        event.currentTarget.releasePointerCapture(event.pointerId);
                      }
                      townDragRef.current = null;
                      setTownDrag(null);
                      if (!drag || drag.pointerId !== event.pointerId) return;
                      const cell = placementCellAt(
                        event.clientX, event.clientY, event.currentTarget.getBoundingClientRect(),
                      );
                      const area: TownBounds = {
                        minX: Math.min(drag.cellX, cell.x), minY: Math.min(drag.cellY, cell.y),
                        maxX: Math.max(drag.cellX, cell.x), maxY: Math.max(drag.cellY, cell.y),
                      };
                      if (tool === 'erase') {
                        // Erase drops every town any of whose patches the stroke covers.
                        const overlapped = boardTowns.filter(
                          (town) => placementAreasOverlap(generatorInstanceAreas(town), area),
                        );
                        overlapped.forEach(removeTown);
                        return;
                      }
                      // Extending is a correction as often as an extension, so a single shift-click
                      // adds its one cell. A NEW town still needs real ground: a stray click is not
                      // a town, though a thin strip is — dragging along a screen diagonal runs along
                      // ONE grid axis, and an 8x1 selection is exactly the roadside row plan.
                      if (drag.additive && selectedTown) {
                        addTownArea(selectedTown, area);
                        return;
                      }
                      if (area.maxX - area.minX < 1 && area.maxY - area.minY < 1) return;
                      createTown(area);
                    }}
                    onPointerCancel={() => {
                      townDragRef.current = null; setTownDrag(null);
                    }}
                  >
                    {/* The committed selection stays outlined once the drag ends: Regenerate and
                        Remove act on it, so it must remain visible. The live drag wins while one
                        is in progress. */}
                    {townSizeExample ? (
                      <>
                        <img
                          className="le-town-size-example"
                          src={townSizeExample.src}
                          alt=""
                          draggable={false}
                          style={{
                            left: `${townSizeExample.left}px`,
                            top: `${townSizeExample.top}px`,
                            width: `${townSizeExample.width}px`,
                            height: `${townSizeExample.height}px`,
                          }}
                        />
                        <span
                          className="le-town-drag-size"
                          aria-hidden="true"
                          style={{
                            left: `${townSizeExample.left}px`,
                            top: `${townSizeExample.top + townSizeExample.height}px`,
                          }}
                        >{townSizeExample.label}</span>
                      </>
                    ) : null}
                    {townHighlight ? (
                      <>
                        <svg
                          className={`le-town-cells${townDrag ? '' : ' is-settled'}`}
                          aria-hidden="true"
                        >
                          {townHighlight.cells.map((cell) => (
                            <polygon
                              key={cell.key}
                              points={cell.points}
                              fill="rgba(255, 214, 92, 0.16)"
                              stroke="rgba(255, 226, 138, 0.85)"
                              strokeWidth="1"
                              vectorEffect="non-scaling-stroke"
                            />
                          ))}
                        </svg>
                        <span
                          className="le-town-drag-size"
                          aria-hidden="true"
                          style={{ left: `${townHighlight.labelX}px`, top: `${townHighlight.labelY}px` }}
                        >{townHighlight.areaCount > 1
                          ? `${townHighlight.areaCount} areas · ${townHighlight.cellCount} tiles`
                          : `${townHighlight.across} × ${townHighlight.down} tiles`}</span>
                      </>
                    ) : null}
                  </div>
                ) : null}
                {editorReady && !saving && !editorLoadError && layer === 'placed-art' && brushKind === 'forest'
                  && (tool === 'brush' || tool === 'erase') ? (
                  <div
                    className="le-artwork-free-placement-surface le-forest-placement-surface"
                    data-testid="forest-placement-surface"
                    aria-label={tool === 'erase'
                      ? 'Drag out grid cells to remove saved Forests'
                      : 'Drag out the grid cells for a new Forest, or shift-drag to add another area to the selected Forest'}
                    onPointerDown={(event) => {
                      if (event.button !== 0) return;
                      event.preventDefault();
                      event.stopPropagation();
                      const surface = event.currentTarget;
                      surface.setPointerCapture(event.pointerId);
                      const cell = placementCellAt(
                        event.clientX, event.clientY, surface.getBoundingClientRect(),
                      );
                      // Shift EXTENDS the selected Forest rather than starting another one.
                      const additive = event.shiftKey && Boolean(selectedForest);
                      forestDragRef.current = {
                        pointerId: event.pointerId, cellX: cell.x, cellY: cell.y, additive,
                      };
                      setForestDrag({
                        area: { minX: cell.x, minY: cell.y, maxX: cell.x, maxY: cell.y },
                        additive,
                      });
                    }}
                    onPointerMove={(event) => {
                      const drag = forestDragRef.current;
                      if (!drag || drag.pointerId !== event.pointerId) return;
                      const cell = placementCellAt(
                        event.clientX, event.clientY, event.currentTarget.getBoundingClientRect(),
                      );
                      setForestDrag({
                        area: {
                          minX: Math.min(drag.cellX, cell.x), minY: Math.min(drag.cellY, cell.y),
                          maxX: Math.max(drag.cellX, cell.x), maxY: Math.max(drag.cellY, cell.y),
                        },
                        additive: drag.additive,
                      });
                    }}
                    onPointerUp={(event) => {
                      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                        event.currentTarget.releasePointerCapture(event.pointerId);
                      }
                      const drag = forestDragRef.current;
                      forestDragRef.current = null;
                      setForestDrag(null);
                      if (!drag || drag.pointerId !== event.pointerId) return;
                      const cell = placementCellAt(
                        event.clientX, event.clientY, event.currentTarget.getBoundingClientRect(),
                      );
                      const area: ForestGridArea = {
                        minX: Math.min(drag.cellX, cell.x), minY: Math.min(drag.cellY, cell.y),
                        maxX: Math.max(drag.cellX, cell.x), maxY: Math.max(drag.cellY, cell.y),
                      };
                      if (tool === 'erase') {
                        const overlapped = boardForests.filter(
                          (forest) => placementAreasOverlap(generatorInstanceAreas(forest), area),
                        );
                        removeForests(new Set(overlapped.map((forest) => forest.id)));
                        return;
                      }
                      if (drag.additive && selectedForest) {
                        addForestArea(selectedForest, area);
                        return;
                      }
                      createForest(area);
                    }}
                    onPointerCancel={() => {
                      forestDragRef.current = null;
                      setForestDrag(null);
                    }}
                  >
                    {forestHighlight ? (
                      <svg
                        className={`le-forest-cells${forestDrag ? '' : ' is-settled'}`}
                        aria-hidden="true"
                      >
                        {forestHighlight.cells.map((cell) => (
                          <polygon
                            key={cell.key}
                            points={cell.points}
                            fill="rgba(74, 196, 126, 0.16)"
                            stroke="rgba(126, 232, 168, 0.9)"
                            strokeWidth="1"
                            vectorEffect="non-scaling-stroke"
                          />
                        ))}
                      </svg>
                    ) : null}
                    {forestHighlight ? (
                      <span
                        className="le-forest-drag-size"
                        aria-hidden="true"
                        style={{ left: `${forestHighlight.labelX}px`, top: `${forestHighlight.labelY}px` }}
                      >{forestHighlight.areaCount > 1
                        ? `${forestHighlight.areaCount} areas · ${forestHighlight.cellCount} grid cells`
                        : `${forestHighlight.cellCountAcross} × ${forestHighlight.cellCountDown} grid cells`}</span>
                    ) : null}
                  </div>
                ) : null}
                {editorReady && !saving && !editorLoadError && layer === 'placed-art' && brushKind === 'artwork' && tool === 'brush' ? (
                  <div
                    className="le-artwork-free-placement-surface"
                    data-testid="artwork-free-placement-surface"
                    aria-label={`Place ${artworkBrushAsset?.label ?? 'scene art'} freely`}
                    onPointerDown={(event) => {
                      if (event.button !== 0) return;
                      event.preventDefault();
                      event.stopPropagation();
                      const rect = event.currentTarget.getBoundingClientRect();
                      placeFloatingArtwork({
                        pixelX: (
                          event.clientX - (rect.left + rect.width / 2) - viewPan.x
                        ) / viewZoom - artworkBoardOrigin.originLeft,
                        pixelY: (
                          event.clientY - (rect.top + rect.height / 2) - viewPan.y
                        ) / viewZoom - artworkBoardOrigin.originTop,
                      });
                    }}
                  />
                ) : null}
                {editorReady && !saving && !editorLoadError && layer === 'placed-art' && brushKind === 'artwork'
                  && tool === 'select' && artworkSelectionActive ? (
                  <ArtworkSelectionSurface
                    placements={boardFloatingArtwork}
                    selectedArtworkId={selectedArtworkId}
                    selectedArtworkIds={selectedArtworkIds}
                    origin={{ left: artworkBoardOrigin.originLeft, top: artworkBoardOrigin.originTop }}
                    zoom={viewZoom}
                    pan={viewPan}
                    onSelect={selectArtwork}
                    onSelectMany={selectArtworkMany}
                  />
                ) : null}
              </div>
            </ViewPane>
              </>
            )}
          >
          {layer === 'level-artwork' && levelArtworkWorkspace && !eventsOpen ? (
            <ShellWorkspace
              className="le-artwork-workspace"
              bodyClassName="le-artwork-workspace-content"
              data-testid="level-artwork-workspace"
              aria-labelledby="level-artwork-workspace-title"
              data-artwork-workspace={levelArtworkWorkspace}
            >
              <header className="le-artwork-workspace-head">
                <div>
                  <span className="skirmish-eyebrow">Level Artwork</span>
                  <h2 id="level-artwork-workspace-title">
                    {levelArtworkWorkspace === 'source' ? 'AI Generation References' : 'Board Art Pipeline'}
                  </h2>
                  <p>
                    {levelArtworkWorkspace === 'source'
                      ? 'Save and copy exact level-derived pictures to hand to the AI model.'
                      : 'Use the unchanged AI-painted board immediately. Grid correction and occlusion are optional tools you can apply later.'}
                  </p>
                </div>
                <ChromeButton unit="inner-text-button"
                  className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
                  onClick={closeLevelArtworkWorkspace}
                >Done</ChromeButton>
              </header>
              {targetLevelId && editorDocument ? (
                <div className="le-artwork-workspace-scroll">
                  {levelArtworkWorkspace === 'source' ? (
                    <>
                      <section className="le-artwork-frame-card" aria-labelledby="level-artwork-frame-title">
                        <div className="le-artwork-frame-copy">
                          <span className="skirmish-eyebrow">Generation input</span>
                          <h3 id="level-artwork-frame-title">Viewing pane</h3>
                          <p>This 16:9 frame is the exact scene crop saved as an AI generation reference.</p>
                        </div>
                        <div className="le-artwork-frame-actions">
                          <ChromeButton unit="inner-text-button"
                            className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', currentEditorBoard.predrawnGenerationFrame && 'active')}
                            data-testid="open-predrawn-generation-frame"
                            aria-pressed={currentEditorBoard.predrawnGenerationFrame !== undefined}
                            disabled={!editorSessionCanWrite}
                            title={editorSessionCanWrite
                              ? 'Choose the exact 16:9 scene crop saved as an AI generation reference.'
                              : 'This review page is read-only.'}
                            onClick={openPredrawnGenerationFrame}
                          >{currentEditorBoard.predrawnGenerationFrame ? 'Edit viewing pane' : 'Choose viewing pane'}</ChromeButton>
                          <ChromeNavButton unit="inner-text-button"
                            to={() => predrawnReferenceHref(
                              targetLevelId,
                              levelEditorHrefForDocument(window.location.href, {
                                levelId: editorDocument.level_id,
                                documentId: editorDocument.document_id,
                              }),
                              editorDocument.document_id,
                            )}
                            className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
                            data-testid="open-predrawn-reference"
                          >Preview current input</ChromeNavButton>
                        </div>
                        <div
                          className={`le-status-current${generationFrameStatus.tone === 'ready' ? ' is-ready' : generationFrameStatus.tone === 'blocked' ? ' is-blocked' : ''}`}
                          data-testid="predrawn-generation-frame-status"
                          data-state={generationFrameStatus.kind}
                          role="status"
                          aria-live="polite"
                        >
                          <strong>{generationFrameStatus.title}</strong>
                          <span>{generationFrameStatus.detail}</span>
                        </div>
                      </section>
                      <PredrawnSourceArtworkPanel
                        documentId={editorDocument.document_id}
                        levelId={editorDocument.level_id}
                        workingCopyBoard={currentEditorBoard}
                        workingCopyLevelSignature={currentSig}
                        workingCopyRevision={editorDocument.revision}
                        workingCopyReady={Boolean(
                          cloudSaveState === 'saved'
                          && workingCopyLevelSignature === currentSig
                          && (
                            generationFrameStatus.kind === 'working-copy'
                            || generationFrameStatus.kind === 'canonical'
                          )
                        )}
                        canWrite={editorSessionCanWrite && !saving}
                        getEditFence={currentEditFence}
                        onMutationError={handlePredrawnVersionMutationError}
                        onStatus={reportStatus}
                      />
                    </>
                  ) : (
                    <PredrawnBackgroundVersionsPanel
                      documentId={editorDocument.document_id}
                      levelId={editorDocument.level_id}
                      board={currentEditorBoard}
                      cells={predrawnVersionCells}
                      generationFrame={currentEditorBoard.predrawnGenerationFrame}
                      initialSourceSrc={predrawnPreview ?? (currentVersionedPredrawnSurface ? undefined : editorPredrawnPlate?.src)}
                      initialRegistration={predrawnRegistration}
                      documentRevision={editorDocument.revision}
                      workingBackgroundMode={boardBackgroundMode(currentEditorBoard)}
                      currentSurface={currentVersionedPredrawnSurface}
                      canonicalBackgroundMode={canonicalEditorBoard
                        ? boardBackgroundMode(canonicalEditorBoard)
                        : undefined}
                      canonicalSurface={canonicalVersionedPredrawnSurface}
                      canonicalActionLabel={isOfficialTarget ? 'Publish' : 'Save'}
                      workingCopySyncState={cloudSaveState}
                      canWrite={editorSessionCanWrite && !saving}
                      getEditFence={currentEditFence}
                      onSetSurface={setPredrawnVersionSurface}
                      onDocumentUpdated={mountAcknowledgedPredrawnWorkspaceMutation}
                      onOpenCanonicalAction={() => selectLayer('status')}
                      onMutationError={handlePredrawnVersionMutationError}
                      onStatus={reportStatus}
                    />
                  )}
                </div>
              ) : (
                <div className="le-predrawn-artifact-empty" role="status">
                  <strong>Save this level before creating artwork versions</strong>
                  <span>The artwork pipeline needs the level’s durable editor document.</span>
                </div>
              )}
            </ShellWorkspace>
          ) : null}
          {eventsOpen ? (
            <LevelEditorEventsWorkspace
              tab={eventsTab}
              onTabChange={selectEventsTab}
              onDone={closeEventsEditor}
              victoryContent={(
                <VictoryConditionsEditor
                  value={victory}
                  factions={victoryFactions}
                  onChange={setVictory}
                  templates={(
                    <div className="le-events-templates">
                      <h3 className="le-victory-head">Template</h3>
                      <p className="le-board-note">Add a victory template. Existing events stay in place; use Clear first when you want a clean replacement.</p>
                      <div className="le-template-apply">
                        <HouseSelect<ObjectiveType>
                          className="le-template-select-wrap"
                          ariaLabel="Victory template"
                          title={MODE_DESCRIPTION[templateChoice]}
                          value={templateChoice}
                          options={OBJECTIVE_TYPES.map((mode) => ({ value: mode, label: MODE_NAME[mode] }))}
                          onChange={setTemplateChoice}
                        />
                        <ChromeButton unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')} onClick={() => {
                          const seedUnits = candidateLevel.layers.units.map((u) => ({ ...u, id: '', alive: true, startY: u.y }));
                          const templateRules = victoryRulesForObjective(templateChoice, { surviveTurns, kingSide: kingSideOf(seedUnits) });
                          setVictory((prev) => appendRules(prev, templateRules));
                        }}>Add template</ChromeButton>
                        <ChromeButton unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', 'danger')} disabled={victory.length === 0} onClick={() => setVictory([])}>Clear rules</ChromeButton>
                      </div>
                      <p className="le-board-note">Events run top-to-bottom, first match decides. To save, every faction on the board needs a way to win and a way to lose.</p>
                    </div>
                  )}
                />
              )}
              deploymentContent={(
                <LevelDeploymentEditor
                  events={events}
                  zones={deploymentZoneOptions}
                  fixedPlayerCount={candidateLevel.layers.units.filter((unit) => unit.side === 'player').length}
                  fixedEnemyCount={candidateLevel.layers.units.filter((unit) => unit.side === 'enemy').length}
                  isWarBattle={isWarBattle}
                  onEventsChange={setEvents}
                  onCreateZone={createDeploymentZone}
                  onEditZone={editDeploymentZone}
                  onDedicatedZoneChange={setDedicatedDeploymentZone}
                />
              )}
              otherContent={(
                <LevelEventsEditor
                  value={otherEvents}
                  zones={eventZoneOptions}
                  onChange={setOtherEventsWithZoneCleanup}
                  templates={(
                    <div className="le-events-templates">
                      <h3 className="le-victory-head">Template</h3>
                      <p className="le-board-note">Add a non-victory event template. Existing events stay in place; use Clear first when you want a clean replacement.</p>
                      <div className="le-template-apply">
                        <HouseSelect<OtherEventTemplateId>
                          className="le-template-select-wrap"
                          ariaLabel="Other event template"
                          value={otherTemplateChoice}
                          options={OTHER_EVENT_TEMPLATES.map((template) => ({ value: template.id, label: template.label }))}
                          onChange={setOtherTemplateChoice}
                        />
                        <ChromeButton unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')} onClick={addOtherEventTemplate}>Add template</ChromeButton>
                        <ChromeButton unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', 'danger')} disabled={otherEvents.length === 0} onClick={clearOtherEvents}>Clear events</ChromeButton>
                      </div>
                      <p className="le-board-note">Clear affects only this events list and any zones used only by those events.</p>
                    </div>
                  )}
                />
              )}
            />
          ) : null}
          </ShellViewportSwap>
        </div>

      {/* The real editor and Chrome Audit consume this one canonical outer-panel hierarchy.
          The editor supplies live state and content; the shared component owns chrome,
          title/actions structure, divider, and the sole scroll boundary. */}
      {editorLoadError ? (
      <ShellControlsPanel
        aria-label="Editor document access"
        inert={!editorReady || saving ? true : undefined}
        titleClassName="le-status-card"
        titleContent={(
          <>
          <h2>Document</h2>
          <div className="le-status-current is-blocked">
            <strong>{editorLoadError.title}</strong>
            <span>{editorLoadError.detail}</span>
          </div>
          {editorLoadError.signIn ? (
            <ChromeButton unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')} style={{ width: '100%' }} onClick={signInForEditor}>Sign in</ChromeButton>
          ) : null}
          {editorLoadError.retry ? (
            <ChromeButton unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')} style={{ width: '100%' }} onClick={retryCloudDocument}>Retry</ChromeButton>
          ) : null}
          </>
        )}
      />
      ) : (
      <LevelEditorControlsPanel
        layer={layer}
        layerOptions={layerSelectOptions}
        onLayerChange={selectLayer}
        tool={actionToolbarTool}
        toolsDisabled={actionToolsDisabled}
        brushIconUrl={brushIconReviewCandidate?.media?.url}
        brushIconReviewStatus={brushIconReviewStatus}
        onToolChange={changeEditorTool}
        eraseLabel={layer === 'placed-art' && brushKind === 'artwork' ? 'Delete selected scene art' : 'Erase'}
        eraseDisabled={layer === 'placed-art' && brushKind === 'artwork' && !selectedArtwork}
        canUndo={editorSessionCanWrite && canUndoBoard}
        canRedo={editorSessionCanWrite && canRedoBoard}
        onUndo={() => { if (editorSessionCanWrite) undoBoard(); }}
        onRedo={() => { if (editorSessionCanWrite) redoBoard(); }}
        playBoardHref={testHref}
        inert={!editorReady || saving}
        ariaBusy={!editorReady || saving}
      >
        <div className="le-editor-authoring-controls" inert={!editorSessionCanAuthor ? true : undefined}>
        {layer === 'history' ? (
          <>
            <section
              ref={editorRecoveryOverviewRef}
              tabIndex={-1}
              className="skirmish-card le-status-card le-recovery-overview"
              aria-live="polite"
              data-testid="le-history-overview"
            >
              <h2>Shared working copy</h2>
              <div className="le-status-current is-ready">
                <strong>{cloudSaveState === 'saved' ? 'Synced' : 'Shared editing is active'}</strong>
                <span>Every open editor uses this working copy. Changes made in another tab appear here automatically.</span>
              </div>
              {recoveryConflictVisible ? (
                <div className="le-board-actions le-recovery-actions">
                  <ChromeButton unit="inner-text-button"
                    className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', 'active')}
                    data-testid="le-keep-recovered-work-recovery"
                    disabled={saving}
                    onClick={keepRecoveredWorkingCopy}
                  >Keep recovered work</ChromeButton>
                </div>
              ) : null}
            </section>
            {editorDocument ? (
              <section className="skirmish-card le-status-card">
                <div className="le-revision-history" aria-labelledby="le-revision-history-title">
                  <div className="le-revision-history-head">
                    <div>
                      <h3 id="le-revision-history-title">Working-copy history</h3>
                      <span>Optional version history. Restore never publishes.</span>
                    </div>
                    <div className="le-board-actions">
                      {revisionHistoryExpanded ? (
                        <ChromeButton unit="inner-text-button"
                          className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
                          disabled={revisionHistoryState === 'loading' || saving}
                          onClick={() => setRevisionHistoryRefresh((value) => value + 1)}
                        >Refresh</ChromeButton>
                      ) : null}
                      <ChromeButton unit="inner-text-button"
                        className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
                        aria-expanded={revisionHistoryExpanded}
                        aria-controls="le-revision-history-content"
                        onClick={() => setRevisionHistoryExpanded((expanded) => !expanded)}
                      >{revisionHistoryExpanded ? 'Hide history' : 'Show history'}</ChromeButton>
                    </div>
                  </div>
                  {revisionHistoryExpanded ? <div id="le-revision-history-content">
                  {revisionHistoryState === 'loading' || revisionHistoryState === 'idle' ? (
                    <p className="le-board-note">Loading retained revisions…</p>
                  ) : revisionHistoryState === 'error' ? (
                    <p className="le-board-note is-error">History is unavailable. {revisionHistoryDetail}</p>
                  ) : revisionHistory.length ? (
                    <ol className="le-revision-history-list">
                      {revisionHistory.map((entry) => {
                        const isCurrentRevision = entry.revision === editorDocument.revision;
                        const restoreBlocked = saving || !editorSessionCanWrite || isCurrentRevision || documentConflictRef.current || cloudSaveState === 'error' || cloudSaveState === 'signed-out';
                        return (
                          <li key={entry.revision} data-testid={`le-revision-${entry.revision}`}>
                            <div>
                              <strong>Revision {entry.revision}</strong>
                              <span>{EDITOR_REVISION_REASON_LABELS[entry.reason]}</span>
                              {entry.restored_from_revision !== null ? <span>from revision {entry.restored_from_revision}</span> : null}
                            </div>
                            <div className="le-revision-history-meta">
                              <span>{entry.name || 'Untitled level'}</span>
                              <time dateTime={entry.created_at ?? undefined}>
                                {entry.created_at ? new Date(entry.created_at).toLocaleString() : 'Time unavailable'}
                              </time>
                              <span>{Math.max(1, Math.ceil(entry.body_bytes / 1024))} KB</span>
                            </div>
                            <ChromeButton unit="inner-text-button"
                              className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
                              disabled={restoreBlocked}
                              title={
                                isCurrentRevision
                                  ? 'This is the current cloud working revision.'
                                  : !editorSessionCanWrite
                                  ? 'Live sync must reconnect before restoring history.'
                                  : cloudSaveState === 'signed-out'
                                  ? 'Sign in again before restoring history.'
                                  : documentConflictRef.current || cloudSaveState === 'error'
                                  ? 'Resolve the persistence interruption before restoring history.'
                                  : `Restore revision ${entry.revision} as a new working copy revision.`
                              }
                              onClick={() => void restoreWorkingCopyRevision(entry)}
                            >{isCurrentRevision ? 'Current' : 'Restore'}</ChromeButton>
                          </li>
                        );
                      })}
                    </ol>
                  ) : (
                    <p className="le-board-note">No retained revisions are available yet.</p>
                  )}
                  </div> : null}
                </div>
              </section>
            ) : null}
          </>
        ) : layer === 'status' ? (
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
                      <ChromeButton unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', 'le-violation-action')} onClick={clearUnits}>Clear pieces</ChromeButton>
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
                  placeholder={DEFAULT_LEVEL_NAME}
                  maxLength={LEVEL_NAME_MAX}
                  onChange={(event) => setLevelName(event.target.value)}
                  onBlur={() => setLevelNameState(levelNameForSave)}
                />
              </label>
              {isOfficialTarget && isAdmin ? <span className="le-official-tag">OFFICIAL</span> : null}
            </div>
            {isAdmin && !isWarBattle ? (
              <div className="le-status-name-field le-status-campaign-field">
                <span className="le-settings-label">Campaign</span>
                <HouseSelect<string>
                  value={campaignAssignmentId}
                  options={campaignSelectOptions}
                  ariaLabel="Campaign"
                  disabled={!campaignAssignmentHydrated || saving}
                  testId="le-campaign-select"
                  onChange={setCampaignAssignmentId}
                />
                <span className="le-board-note">Admin only · Save or publish to apply this assignment.</span>
              </div>
            ) : isWarBattle ? (
              <p className="le-board-note">This level belongs exclusively to a War. Battle order and Loot are managed in the War editor.</p>
            ) : null}
            <div className={`le-status-current ${cloudSaveState === 'error' || cloudSaveState === 'conflict' || cloudSaveState === 'signed-out' ? 'is-blocked' : 'is-ready'}`}>
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
              {cloudSaveState === 'signed-out' ? (
                <ChromeButton unit="inner-text-button"
                  className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
                  data-testid="le-sign-in-resume"
                  disabled={saving}
                  onClick={signInToResumeCloudSync}
                >Sign in and resume</ChromeButton>
              ) : null}
              {cloudSaveState === 'error' ? (
                <ChromeButton unit="inner-text-button"
                  className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
                  data-testid="le-retry-cloud-sync"
                  disabled={saving}
                  onClick={retryCloudDocument}
                >Retry cloud sync</ChromeButton>
              ) : null}
              {editorDocumentHasDiscardTarget(editorDocument) ? (
                <ChromeButton unit="inner-text-button"
                  className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
                  data-testid="le-discard-changes"
                  disabled={!hasDiscardableChanges || saving || !editorSessionCanWrite}
                  title={hasDiscardableChanges ? 'Revert the working copy to the last saved position.' : 'The working copy already matches the saved position.'}
                  onClick={() => void discardChanges()}
                >Discard changes</ChromeButton>
              ) : null}
              <ChromeButton unit="inner-text-button"
                className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', canSave ? 'active' : 'is-blocked')}
                data-testid="le-save"
                aria-label={canSave ? saveLabel : `${saveButtonLabel}: ${saveBlockedMessage}`}
                title={canSave ? (isOfficialTarget ? 'Publish this level to every player (admin-gated).' : 'Save this level to your workspace.') : `${saveBlockedMessage} ${saveBlockedDetail}`.trim()}
                onClick={() => { if (canSave || !me?.signed_in) void saveLevel(); else explainBlockedSave(); }}
              >{saveButtonLabel}</ChromeButton>
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
        ) : levelArtworkWorkspace ? (
          <section className="skirmish-card le-artwork-rail-summary">
            <h2>Level Artwork</h2>
            <p className="le-board-note">
              {levelArtworkWorkspace === 'source'
                ? 'Generation References is open in the center workspace.'
                : 'The Board Art Pipeline is open in the center workspace.'}
            </p>
            <ChromeButton unit="inner-text-button"
              className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
              onClick={closeLevelArtworkWorkspace}
            >Back to board editing</ChromeButton>
          </section>
        ) : layer === 'board' ? (
          <>
          <section className="skirmish-card">
            <h2>Board</h2>
            {isPredrawnBoard ? (
              <div className="le-predrawn-lock" role="status" data-testid="predrawn-board-lock">
                <strong>{isPredrawnReviewOnly ? 'Registered pre-drawn review' : 'Pre-drawn board'} · {boardCols}×{boardRows}</strong>
                <span>The artwork paints the environment, so terrain, Subterrain, paths, props, fences, walls, doodads, lighting, and particles are suppressed. The grid size and its placement over the artwork stay yours to set; ground cover, units, and tactical overlays remain live.</span>
                {isPredrawnReviewOnly ? <span>The candidate is mounted for this development review only; it is not an accepted runtime media pointer.</span> : null}
              </div>
            ) : null}
            {isPredrawnBoard && isPredrawnReviewOnly ? null : (
              <>
                <BoardSizePanel cols={boardCols} rows={boardRows} onResize={resizeBoard} />
                <p className="le-board-note">{isPredrawnBoard
                  ? 'Choose the side, then add or remove columns and rows there. The artwork does not move or rescale — the grid grows over it. New squares arrive as open ground and shrinking drops content outside the new bounds.'
                  : 'Choose the side, then add or remove columns and rows there. Shrinking drops content outside the new bounds.'}</p>
                <h3>{isPredrawnBoard ? 'Move grid over artwork' : 'Move playable grid'}</h3>
                <div className="le-grid-nudge" aria-label="Move playable grid one tile">
                  {PLAYABLE_GRID_MOVE_DIRECTIONS.map((direction) => {
                    // Over a plate the grid always has somewhere to go: the picture is pinned in
                    // projected space and slides under it, so no scenic apron has to exist first.
                    const availability = isPredrawnBoard
                      ? { allowed: true, reason: undefined }
                      : playableGridMoveAvailability(currentEditorBoard, direction);
                    const label = direction[0].toUpperCase();
                    const fullLabel = direction[0].toUpperCase() + direction.slice(1);
                    return (
                      <ChromeButton unit="inner-text-button"
                        key={direction}
                        className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', `is-${direction}`)}
                        data-testid={`le-move-grid-${direction}`}
                        aria-label={`Move playable grid ${fullLabel}`}
                        title={availability.reason ?? `Move the playable grid one tile ${direction}.`}
                        disabled={!availability.allowed}
                        onClick={() => moveGrid(direction)}
                      >{label}</ChromeButton>
                    );
                  })}
                  <span className="le-grid-nudge-centre" aria-hidden="true">Grid</span>
                </div>
                {isPredrawnBoard ? (
                  <>
                    <p className="le-board-note">Slide the grid one square at a time across the artwork. The picture stays exactly where it is and nothing on the board is moved or dropped.</p>
                    <div className="le-ctrlrow">
                      <span className="le-ctrllabel">Artwork placement</span>
                      <ChromeButton unit="inner-text-button"
                        className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
                        data-testid="le-reset-plate-offset"
                        disabled={!platePlacementMoved}
                        title={platePlacementMoved
                          ? 'Put the artwork back where its own registration places it.'
                          : 'The artwork already sits at its own registration.'}
                        onClick={resetPlatePlacement}
                      >Reset</ChromeButton>
                    </div>
                  </>
                ) : null}
                {isPredrawnBoard ? null : (<>
                <p className="le-board-note">Move one tile into existing scenic terrain while keeping the authored scene aligned. Gameplay-only placements pushed outside the grid are removed.</p>
                <h3>Scenic terrain rectangle</h3>
                <div className="le-ctrlrow">
                  <span className="le-ctrllabel">Generation</span>
                  <HouseSelect<ScenicTerrainGenerationMode>
                    value={scenicTerrainGenerationMode}
                    onChange={setScenicTerrainGenerationMode}
                    ariaLabel="Scenic terrain generation mode"
                    options={SCENIC_TERRAIN_GENERATION_OPTIONS}
                  />
                </div>
                {socketEdges.map((edge) => {
                  const side = SCENIC_TERRAIN_EXTENT_BY_BOARD_EDGE[edge];
                  const cardinalLabel = edge[0].toUpperCase() + edge.slice(1);
                  return (
                    <div className="le-ctrlrow" key={edge}>
                      <span className="le-ctrllabel">{cardinalLabel}</span>
                      <Stepper
                        value={decorativeApron[side]}
                        suffix=" tiles"
                        decreaseLabel={`Reduce scenic terrain beyond the ${edge} edge`}
                        increaseLabel={`Extend scenic terrain beyond the ${edge} edge`}
                        onDecrease={() => stepScenicTerrainExtent(side, -1)}
                        onIncrease={() => stepScenicTerrainExtent(side, 1)}
                      />
                    </div>
                  );
                })}
                <div className="le-ctrlrow">
                  <span className="le-ctrllabel">All directions</span>
                  <Stepper
                    value={1}
                    suffix=" tile"
                    decreaseLabel="Reduce scenic terrain one tile in all four directions"
                    increaseLabel="Extend scenic terrain one tile in all four directions"
                    onDecrease={() => stepScenicTerrainExtents(SCENIC_TERRAIN_SIDES, -1)}
                    onIncrease={() => stepScenicTerrainExtents(SCENIC_TERRAIN_SIDES, 1)}
                  />
                </div>
                <div className="le-ctrlrow">
                  <span className="le-ctrllabel">Visible area</span>
                  <ChromeButton unit="inner-text-button"
                    className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
                    disabled={!viewViewportSize}
                    onClick={fillVisibleScenicTerrain}
                    title="Add only scenic tile diamonds that touch the currently visible board viewport."
                  >Fill visible area</ChromeButton>
                </div>
                <p className="le-board-note">Use the cardinal steppers for a complete art-handoff rectangle, or fill only the current view without adding its off-screen diamond tips. Scenic tiles never change legal moves.</p>
                <div className="le-board-actions">
                  <ChromeButton unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')} onClick={randomizeBoardTiles} title="Replace every tile with a generated mix of production terrain.">Randomize</ChromeButton>
                  <ChromeButton unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', 'danger')} onClick={clearBoard} title="Remove every tile, unit, doodad, prop, cover patch, path, fence rail, post, wall, and wall artwork from the board.">Clear</ChromeButton>
                </div>
                </>)}
              </>
            )}
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
                      <div className="le-faction-fields">
                        <HouseSelect<FactionControl>
                          value={playerFaction === faction ? 'player' : 'cpu'}
                          ariaLabel={`${LE_FACTION_LABELS[faction]} control`}
                          onChange={onFactionControlChange(faction)}
                          options={controlOptions}
                        />
                        <PaletteSelect
                          className="le-faction-color-select"
                          value={faction}
                          options={unassignedFactions}
                          ariaLabel={`${LE_FACTION_LABELS[faction]} colour`}
                          disabled={!unassignedFactions.length}
                          title={unassignedFactions.length
                            ? 'Repaint every unit of this faction in another colour.'
                            : 'Every colour is already in use by a faction on this board.'}
                          onChange={(next) => recolorFaction(faction, next)}
                        />
                        <DirectionPopover
                          value={directionForFaction(faction)}
                          label={`${LE_FACTION_LABELS[faction]} default facing`}
                          onChange={(direction) => setFactionDefaultDirection(faction, direction)}
                        />
                      </div>
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
        ) : layer === 'camera' ? (
          <>
          <section className="skirmish-card" aria-label="Camera boundary" data-testid="le-camera-controls">
            <h2>Camera</h2>
            <p className="le-board-note">
              Every player viewport stays inside this persistent level boundary while zoom and pan vary within it.
            </p>
            <div className="le-ctrlrow">
              <span className="le-ctrllabel">Mode</span>
              <HouseSelect<CameraBoundaryInteractionMode>
                value={editorSessionCanWrite ? cameraBoundaryInteractionMode : 'view'}
                options={[
                  { value: 'view', label: 'View boundary' },
                  { value: 'edit', label: 'Edit boundary', disabled: !editorSessionCanWrite },
                ]}
                onChange={setCameraBoundaryInteractionMode}
                ariaLabel="Camera boundary interaction mode"
              />
            </div>
            <dl className="le-settings-list">
              <div>
                <dt>Origin</dt>
                <dd>{Math.round(resolvedCameraBoundary.minX)}, {Math.round(resolvedCameraBoundary.minY)}</dd>
              </div>
              <div>
                <dt>Size</dt>
                <dd>{Math.round(resolvedCameraBoundary.width)} × {Math.round(resolvedCameraBoundary.height)} world px</dd>
              </div>
            </dl>
            <div className="skirmish-view-row">
              <ChromeButton
                unit="inner-text-button"
                className={chromeUnitClassNames(
                  'inner-text-button',
                  'le-seg-btn',
                  cameraBoundaryVisibility === 'off-screen' && 'active',
                )}
                onClick={showCameraBoundary}
                disabled={!viewViewportSize}
                title="Move the canvas until the whole boundary and all its handles are on screen."
              >Show boundary</ChromeButton>
              <span className="le-board-note" data-testid="le-camera-boundary-visibility">
                {cameraBoundaryVisibility === 'off-screen'
                  ? 'Extends past this view — nothing to grab until you show it.'
                  : cameraBoundaryVisibility === 'visible'
                    ? 'Fully on screen.'
                    : 'Measuring the canvas…'}
              </span>
            </div>
            {!editorSessionCanWrite ? (
              <p className="le-board-note">Edit is unavailable until this session owns the editor lease.</p>
            ) : cameraBoundaryInteractionMode === 'view' ? (
              <p className="le-board-note">View keeps the boundary visible without exposing its mutation handles.</p>
            ) : (
              <p className="le-board-note">Drag anywhere inside the box to move it, or drag an edge or corner handle to resize it. Arrow keys move the focused control by 4 world pixels; hold Shift for 24.</p>
            )}
          </section>
          <section className="skirmish-card skirmish-view-card" aria-label="Camera zoom-in limit" data-testid="le-camera-zoom-in">
            <h2>Zoom in limit</h2>
            <p className="le-board-note">
              How far a player may zoom in here. Automatic only knows this level’s zoom floor — it
              cannot tell how much detail the artwork actually holds, so state it yourself.
            </p>
            <div className="skirmish-view-row">
              <ChromeButton
                unit="inner-text-button"
                className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
                onClick={setCameraZoomInFromView}
                disabled={!editorSessionCanWrite}
                title="Make the canvas as close as a player should ever get, then capture exactly that."
              >Set from view</ChromeButton>
              <ChromeButton
                unit="inner-text-button"
                className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
                onClick={showCameraZoomIn}
                disabled={!authoredCameraZoomIn}
                title="Move the canvas to the stated limit so you can see what a player would see."
              >Show limit</ChromeButton>
            </div>
            <p className="le-board-note">
              Zoom the canvas to the closest a player should get, then Set from view. Show limit
              puts you back on it. The slider is only for nudging afterwards.
            </p>
            <SliderRow
              label={authoredCameraZoomIn ? `Limit · ${authoredCameraZoomIn.toFixed(2)}×` : 'Limit · automatic'}
              value={authoredCameraZoomIn ?? 0}
              set={(value) => commitCameraZoomIn(value > 0 ? value : undefined)}
              min={0}
              max={MAXIMUM_AUTHORED_CAMERA_ZOOM_IN}
              step={0.05}
              nudge={0.25}
              dflt={0}
            />
            <p className="le-board-note">Zero is automatic. The level’s zoom floor always wins over a limit set below it.</p>
          </section>
          <section className="skirmish-card skirmish-view-card" aria-label="Set camera boundary from current view">
            <h2>Current view</h2>
            <ChromeButton
              unit="inner-text-button"
              className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
              onClick={setCameraBoundaryFromView}
              disabled={!editorSessionCanWrite || !viewViewportSize}
              title="Replace the camera boundary with the world-space rectangle visible in the editor canvas."
            >Set from view</ChromeButton>
            <p className="le-board-note">Zoom and pan the canvas first, then capture exactly that visible area. The required opening board frame is always retained.</p>
          </section>
          <section className="skirmish-card skirmish-view-card" aria-label="Camera boundary snap">
            <h2>Snap boundary</h2>
            <div className="skirmish-view-row">
              <HouseSelect<BoardCameraSnapMode>
                value={cameraSnapMode}
                options={[
                  { value: 'balanced', label: 'Balanced · 10% + minimum', title: 'Use ten percent padding, with a two-tile-step minimum.' },
                  { value: 'proportional', label: 'Proportional · 10%', title: 'Use ten percent of the projected level bounds on every side.' },
                  { value: 'fixed', label: 'Fixed · 2 tile steps', title: 'Use two projected tile steps of padding on every side.' },
                ]}
                onChange={setCameraSnapMode}
                ariaLabel="Camera boundary snap preset"
                className="le-camera-snap-select"
              />
              <ChromeButton
                unit="inner-text-button"
                className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
                onClick={snapCameraBoundary}
                disabled={!editorSessionCanWrite}
                title="Replace the camera boundary with this level-derived preset."
              >Snap</ChromeButton>
            </div>
            <p className="le-board-note">Balanced is the default: ten percent padding with a two projected-tile-step minimum per axis.</p>
          </section>
          </>
        ) : layer === 'generate' ? (<>
          <section className="skirmish-card le-generate">
            <h2>Generate terrain</h2>
            <p className="le-board-note">Carve a saved region — or the whole board — into terrain regions. Add regions and dial each one's share (they rebalance to 100 − buffer); each becomes one contiguous area. Then Generate.</p>
            <div className="le-gen-unit-row">
              <div className="le-gen-unit-select">
                <span>Region</span>
                <HouseSelect<string>
                  value={activeGeneratedRegionId ?? ''}
                  onChange={selectGeneratedRegionUnit}
                  ariaLabel="Saved generated region"
                  options={[
                    { value: '', label: 'New selection' },
                    ...generatedRegions.map((region) => ({ value: region.id, label: `${region.name} · ${region.cells.length}` })),
                  ]}
                />
              </div>
              {activeGeneratedRegion ? (
                <ChromeButton unit="inner-tool-square"
                  className={chromeUnitClassNames('inner-tool-square', 'le-gen-icon', 'danger')}
                  onClick={() => removeGeneratedRegionUnit(activeGeneratedRegion.id)}
                  title={`Remove ${activeGeneratedRegion.name}`}
                  aria-label={`Remove ${activeGeneratedRegion.name}`}
                >×</ChromeButton>
              ) : null}
            </div>
            <div className="le-gen-scope">
              <ChromeButton unit="inner-text-button"
                className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', tool === 'region' && 'active')}
                onClick={() => setTool(tool === 'region' ? 'select' : 'region')}
                title="Click an already-drawn clump to select its whole same-terrain patch. Click this button again to stop."
              >{tool === 'region' ? 'Selecting…' : 'Select region'}</ChromeButton>
              <span className="le-gen-scope-label">{regionSelection.size > 0 ? `${activeGeneratedRegion?.name ?? 'Selection'} · ${regionSelection.size} cells` : 'Whole board'}</span>
              {regionSelection.size > 0 ? <ChromeButton unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')} onClick={clearRegion} title="Clear the selection — Generate will cover the whole board.">Clear</ChromeButton> : null}
            </div>
            {tool === 'region' ? <p className="le-board-note">Click a drawn clump to select its whole same-terrain patch. Generate fills the selection; everything outside it stays put.</p> : null}
            <div className="le-gen-regions" role="group" aria-label="Terrain regions">
              {scatterSections.map((sec, sectionIndex) => (
                <div className="le-gen-region-group" key={sec.id}>
                  <div className="le-gen-region">
                    <HouseSelect<TileFamilyId>
                      className="le-gen-region-select"
                      value={sec.terrain}
                      onChange={(terrain) => setSectionTerrain(sec.id, terrain)}
                      ariaLabel={`Region ${sectionIndex + 1} terrain`}
                      options={leScatterFamilies().map((family) => ({ value: family.id, label: family.label }))}
                    />
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
                    <ChromeButton unit="inner-tool-square" className={chromeUnitClassNames('inner-tool-square', 'le-gen-icon', sec.locked && 'active')} onClick={() => toggleSectionLock(sec.id)} aria-pressed={sec.locked} title={sec.locked ? 'Unlock — let this region rebalance' : 'Lock — keep this region fixed while others move'}>{sec.locked ? '🔒' : '🔓'}</ChromeButton>
                    <ChromeButton unit="inner-tool-square" className={chromeUnitClassNames('inner-tool-square', 'le-gen-icon', 'danger')} onClick={() => removeSection(sec.id)} disabled={scatterSections.length <= 1} title="Remove this region">×</ChromeButton>
                  </div>
                  {macroTileAssets.some((asset) => asset.family === sec.terrain) ? (
                    <div className="le-gen-macro">
                      <SliderRow label={`Composite coverage · ${Math.round(sec.macroTileDensity * 100)}%`} value={sec.macroTileDensity} set={(value) => setSectionMacroTileDensity(sec.id, value)} min={0} max={1} step={0.05} nudge={0.05} dflt={DEFAULT_MACRO_TILE_DENSITY} />
                      <SliderRow label={`Breakup randomness · ${Math.round(sec.macroTileBreakup * 100)}%`} value={sec.macroTileBreakup} set={(value) => setSectionMacroTileBreakup(sec.id, value)} min={0} max={1} step={0.05} nudge={0.05} dflt={DEFAULT_MACRO_TILE_BREAKUP} />
                    </div>
                  ) : null}
                  <div className="le-gen-cover">
                    {sec.covers.map((c, coverIndex) => (
                      <div className="le-gen-cover-entry" key={c.id}>
                        <div className="le-gen-cover-head">
                          <ChromeButton unit="inner-tool-square" className={chromeUnitClassNames('inner-tool-square', 'settings-chrome-button', 'settings-chrome-button-neutral', 'le-gen-cover-caret-btn', c.expanded && 'active')} onClick={() => toggleCoverEntryExpand(sec.id, c.id)} aria-expanded={c.expanded} aria-label={c.expanded ? 'Collapse cover settings' : 'Expand cover settings'}>
                            <span className="le-gen-cover-caret" aria-hidden="true">{c.expanded ? '▾' : '▸'}</span>
                          </ChromeButton>
                          <HouseSelect<GroundCoverId>
                            className="le-gen-cover-select"
                            value={c.type}
                            onChange={(type) => setCoverType(sec.id, c.id, type)}
                            ariaLabel={`Region ${sectionIndex + 1} cover ${coverIndex + 1} set`}
                            options={LE_COVER_TYPES.map((type) => ({ value: type.id, label: type.label }))}
                          />
                          <ChromeButton unit="inner-tool-square" className={chromeUnitClassNames('inner-tool-square', 'le-gen-icon', 'danger')} onClick={() => removeCover(sec.id, c.id)} title="Remove this cover">×</ChromeButton>
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
                    <ChromeButton unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'le-gen-cover-add')} onClick={() => addCover(sec.id)} title="Add a cover set to this region.">+ Add cover</ChromeButton>
                  </div>
                </div>
              ))}
            </div>
            <ChromeButton unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', 'le-gen-add')} onClick={addSection} title="Add another terrain region and rebalance the shares.">+ Add terrain region</ChromeButton>
            <SliderRow label={`Randomness buffer · ${scatterBuffer}%`} value={scatterBuffer} set={setScatterBufferBalanced} min={0} max={60} step={1} nudge={1} dflt={0} />
            <SliderRow label="Edge roughness" value={scatterWiggle} set={setScatterWiggle} min={0} max={1} step={0.05} nudge={0.05} dflt={0.5} />
            <ChromeButton unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', 'le-gen-run')} style={{ width: '100%', marginTop: 8 }} onClick={generateScatter} title="Roll a fresh layout into the selection (or the whole board) and autotile it.">Generate</ChromeButton>
          </section>
        </>) : layer === 'rules' ? (<>
          <section className="skirmish-card">
            <h2>Victory events</h2>
            {/* ADR-0144: the right rail is only the entry point. Rule authoring occupies the
                shell-owned board workspace while this control rail stays in place. */}
            <p className="le-board-note">How this level is won, lost, deployed, and promoted. {victory.length} victory event{victory.length === 1 ? '' : 's'} and {otherEvents.length} other event{otherEvents.length === 1 ? '' : 's'} set.</p>
            <ChromeButton unit="inner-text-button" ref={eventsOpenButtonRef} className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', 'le-events-open')} disabled={eventsOpen} onClick={() => openEventsEditor(isWarBattle ? 'deployment' : 'victory')}>Open rules editor</ChromeButton>
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
        </>) : layer === 'war' ? (<>
          {/* War mode. Only a War Battle is dealt cards or reached by a Run economy — a Campaign
              or standalone level is entered with its authored army — so this panel says that
              plainly elsewhere rather than offering controls that would be inert. */}
          {!isWarBattle ? (
            <section className="skirmish-card">
              <h2>War</h2>
              <p className="le-board-note">This level is not a War Battle. Nothing deals it cards and no Run economy reaches it, so it has no deal to author and no expected force to balance against. Add it to a War first.</p>
              <ChromeNavButton unit="inner-text-button" to="/editor/wars" className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}>Open the War editor</ChromeNavButton>
            </section>
          ) : (<>
            {/* Every Battle carries a count: there is no off, and Save is blocked until this
                level has one. */}
            <section className="skirmish-card">
              <h2>Deployment deal</h2>
              <div className="le-ctrlrow">
                <span className="le-ctrllabel">Cards dealt</span>
                <Stepper
                  suffix=""
                  decreaseLabel="Deal fewer cards on this Battle"
                  increaseLabel="Deal more cards on this Battle"
                  onDecrease={() => setBattleCardsDealt((v) => clampCardsDealt(v - 1))}
                  onIncrease={() => setBattleCardsDealt((v) => clampCardsDealt(v + 1))}
                  edit={{
                    value: battleCardsDealt,
                    min: LEVEL_BATTLE_CARDS_DEALT_MIN,
                    format: (v) => String(v),
                    parse: parseCardsDealt,
                    onCommit: (v) => setBattleCardsDealt(clampCardsDealt(v)),
                    ariaLabel: 'Cards dealt at Deployment',
                  }}
                />
              </div>
              <p className="le-board-note">
                {`This Battle deals ${battleCardsDealt} card${battleCardsDealt === 1 ? '' : 's'} from the player’s collection, and they field only the units those cards carry. His Grace is always the first one dealt, so a deal of 1 sends the King in alone. Nothing else decides this — the counts across a War are the whole curve. From ${LEVEL_BATTLE_CARDS_DEALT_MIN} to ${LEVEL_BATTLE_CARDS_DEALT_MAX}.`}
              </p>
            </section>

            {/* How much force this Battle will actually meet, beside the force it puts up. The
                player side is postulated at the ceiling — perfect play, everything bought,
                nothing lost — because a Battle balanced against the best case is balanced. */}
            <section className="skirmish-card le-war-value" aria-live="polite">
              <h2>Expected player value</h2>
              {warValueHere ? (<>
                <InnerChromeBox className="le-war-balance">
                  <dl>
                    <div>
                      <dt>Player fields</dt>
                      <dd>{formatPoints(warValueHere.playerValue)}</dd>
                    </div>
                    <div>
                      <dt>Enemy on board</dt>
                      <dd>{formatPoints(warValueHere.enemy.value)}</dd>
                    </div>
                  </dl>
                  <p className={`le-war-verdict ${warValueHere.advantage < -0.05 ? 'is-behind' : warValueHere.advantage > 0.05 ? 'is-ahead' : 'is-even'}`}>
                    {formatAdvantage(warValueHere.advantage)}
                  </p>
                </InnerChromeBox>
                <dl className="le-war-inputs">
                  <div>
                    <dt>Battle</dt>
                    <dd>{warValueHere.battleIndex + 1} of {warEconomy?.curve.length}</dd>
                  </div>
                  <div>
                    <dt>Deal</dt>
                    <dd>His Grace + {formatPoints(warValueHere.ordinaryCardsDealt)}</dd>
                  </div>
                  <div>
                    <dt>Avg card value</dt>
                    <dd>{formatPoints(warValueHere.meanCardValue)}</dd>
                  </div>
                  <div>
                    <dt>Deck by now</dt>
                    <dd>{formatPoints(warValueHere.cardsHeld)} cards · {formatPoints(warValueHere.deckValue)} pts</dd>
                  </div>
                  <div>
                    <dt>Gold unspent</dt>
                    <dd>{formatPoints(warValueHere.goldUnspent)}</dd>
                  </div>
                  <div>
                    <dt>Enemy force</dt>
                    <dd>{warValueHere.enemy.units} piece{warValueHere.enemy.units === 1 ? '' : 's'}{warValueHere.enemy.kings ? ` · ${warValueHere.enemy.kings} King` : ''}</dd>
                  </div>
                  <div>
                    <dt>Pays on victory</dt>
                    <dd>{formatPoints(warValueHere.victoryGold)} gold</dd>
                  </div>
                </dl>
                <p className="le-board-note">
                  {`Player value is the ceiling: the perfect player buys every card the market offers, loses nothing, and pays for no retry or reroll. Cards cost exactly what they are worth, so a Battle's reward converts one-for-one into the material the NEXT Battle can bring. What they field here is His Grace (${formatPoints(HIS_GRACE_VALUE)} pts) plus ${formatPoints(warValueHere.ordinaryCardsDealt)} more card${warValueHere.ordinaryCardsDealt === 1 ? '' : 's'} at the deck's average of ${formatPoints(warValueHere.meanCardValue)}. Board bounties, lipsanon gold and the Quartermaster's fourth offer are left out — every one of them only pushes it higher. Kings count 0 on both sides.`}
                </p>
              </>) : (
                <p className="le-board-note">This War's Battles have not all loaded, so the economy that reaches this one cannot be walked yet.</p>
              )}
            </section>

            {warEconomy && warEconomy.curve.length > 1 ? (
              <section className="skirmish-card">
                <h2>Across the War</h2>
                <ol className="le-war-curve">
                  <li className="le-war-curve-head" aria-hidden="true">
                    <span>#</span>
                    <span>Deal</span>
                    <span>Player</span>
                    <span>Enemy</span>
                    <span>Δ</span>
                  </li>
                  {warEconomy.curve.map((point) => (
                    <li
                      key={point.levelId || point.battleIndex}
                      className={point.battleIndex === warEconomy.index ? 'is-current' : ''}
                      aria-current={point.battleIndex === warEconomy.index ? 'true' : undefined}
                    >
                      <span>{point.battleIndex + 1}</span>
                      <span>{point.cardsDealt}</span>
                      <span>{formatPoints(point.playerValue)}</span>
                      <span>{formatPoints(point.enemy.value)}</span>
                      <span className={point.advantage < -0.05 ? 'is-behind' : point.advantage > 0.05 ? 'is-ahead' : 'is-even'}>
                        {Math.abs(point.advantage) < 0.05 ? '0' : `${point.advantage > 0 ? '+' : '−'}${formatPoints(Math.abs(point.advantage))}`}
                      </span>
                    </li>
                  ))}
                </ol>
                <p className="le-board-note">Every Battle in {warEconomy.war.name}, in order. Player value only climbs where a Battle deals more cards — the deck keeps growing, but the deal is what reaches the board.</p>
              </section>
            ) : null}
          </>)}
        </>) : layer === 'level-artwork' ? (
          <section className="skirmish-card le-artwork-controls" data-testid="ai-artwork-controls">
            <h2>Level Artwork</h2>
            <p className="le-board-note">Choose the background this level actually uses, or open one of the larger artwork workspaces.</p>
            <h3>Level background</h3>
            <div className="le-artwork-background-mode" role="group" aria-label="Saved level background">
              <ChromeButton unit="inner-text-button"
                className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', boardBackgroundModeState === 'legacy' && 'active')}
                aria-pressed={boardBackgroundModeState === 'legacy'}
                disabled={!editorSessionCanWrite}
                onClick={() => setLevelBackgroundMode('legacy')}
              >Legacy tileset</ChromeButton>
              <ChromeButton unit="inner-text-button"
                className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', boardBackgroundModeState === 'ai' && 'active')}
                aria-pressed={boardBackgroundModeState === 'ai'}
                disabled={!editorSessionCanWrite || !predrawnSelectionIsDrawable(predrawnSelectionValidation)}
                title={!editorSessionCanWrite
                  ? 'This review page is read-only.'
                  : predrawnSelectionValidation.kind === 'plate'
                    ? 'Use this level’s installed board plate as its background.'
                    : predrawnSelectionValidation.kind === 'valid'
                    ? 'Use the remembered AI artwork as this level background.'
                    : predrawnSelectionValidation.kind === 'stale'
                      ? 'This artwork belongs to an earlier terrain or scenery layout. Set matching artwork from a new attempt.'
                      : predrawnSelectionValidation.kind === 'checking'
                        ? 'The remembered AI artwork is still being checked.'
                        : predrawnSelectionValidation.kind === 'unreachable'
                          ? 'The remembered AI artwork could not be read. It is still this level’s artwork; this retries on its own.'
                          : 'Set a complete artwork version in the Board Art Pipeline first.'}
                onClick={() => setLevelBackgroundMode('ai')}
              >AI artwork</ChromeButton>
            </div>
            <div
              className="le-artwork-mode-status"
              role="status"
              data-selection-validity={predrawnSelectionValidation.kind}
            >
              <strong>
                {boardBackgroundModeState === 'ai'
                  ? predrawnSelectionValidation.kind === 'plate'
                    ? 'Board plate is active'
                    : predrawnSelectionValidation.kind === 'valid'
                    ? 'AI artwork is active'
                    // "Unavailable" would be a verdict about the artwork. Nothing is wrong with it;
                    // the check simply could not be made, and it is still the level's selection.
                    : predrawnSelectionValidation.kind === 'unreachable'
                      ? 'AI artwork could not be checked'
                      : 'AI artwork is unavailable'
                  : 'Legacy tileset is active'}
              </strong>
              <span>
                {predrawnSelectionValidation.kind === 'plate'
                  ? boardBackgroundModeState === 'ai'
                    ? 'This level uses an installed board plate, painted before the version pipeline. It has no version lineage to check.'
                    : 'The installed board plate is remembered while terrain and scenery remain editable.'
                  : predrawnSelectionValidation.kind === 'valid'
                  ? boardBackgroundModeState === 'ai'
                    ? 'The selected AI version is the level background. Units and live Cover render over it.'
                    : 'The selected AI version is valid and remembered while terrain and scenery remain editable.'
                  : predrawnSelectionValidation.kind === 'stale'
                    ? 'The remembered AI version belongs to an earlier terrain or scenery layout and cannot be activated.'
                    : predrawnSelectionValidation.kind === 'checking'
                      ? 'Checking the remembered AI version and its environment geometry…'
                      : predrawnSelectionValidation.kind === 'unreachable'
                        ? predrawnSelectionValidation.signedOut
                          ? `Your sign-in expired, so the remembered AI version could not be read. It is still this level’s artwork and returns once you sign in again. ${predrawnSelectionValidation.message}`
                          : `The remembered AI version could not be read, so it is hidden until the check succeeds. Nothing about the selection changed, and this retries automatically. ${predrawnSelectionValidation.message}`
                        : predrawnSelectionValidation.kind === 'error'
                          ? `The remembered AI version could not be validated. ${predrawnSelectionValidation.message}`
                          : predrawnSelectionValidation.kind === 'unavailable'
                          ? 'The remembered AI selection is missing, incomplete, archived, or no longer matches its immutable version.'
                          : 'No AI artwork version is selected yet.'}
              </span>
              {currentVersionedPredrawnSurface ? (
                <small>
                  Selected version · {currentVersionedPredrawnSurface.occlusionVersionId?.slice(0, 8) ?? currentVersionedPredrawnSurface.backgroundVersionId.slice(0, 8)}
                  {' · '}
                  {predrawnSelectionValidation.kind === 'valid'
                    ? 'Valid'
                    : predrawnSelectionValidation.kind === 'stale'
                      ? 'Stale'
                      : predrawnSelectionValidation.kind === 'checking'
                        ? 'Checking'
                        : predrawnSelectionValidation.kind === 'unreachable'
                          ? 'Unread — retrying'
                          : 'Unavailable'}
                </small>
              ) : null}
            </div>
            <div className="le-artwork-nav-actions">
              <ChromeButton unit="inner-text-button"
                className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
                onClick={() => openLevelArtworkWorkspace('source')}
              >
                <strong>Generation References</strong>
                <span>Save and copy level-derived pictures handed to the AI model.</span>
              </ChromeButton>
              <ChromeButton unit="inner-text-button"
                className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
                onClick={() => openLevelArtworkWorkspace('pipeline')}
              >
                <strong>Board Art Pipeline</strong>
                <span>Paste raw AI-painted boards, then warp and apply occlusion.</span>
              </ChromeButton>
            </div>
          </section>
        ) : (<>

        {layer === 'placed-art' ? (
          <section className="skirmish-card le-placed-art-controls" data-testid="placed-art-controls">
            <h2>Placed Art</h2>
            <div className="le-seg" role="group" aria-label="Placed art type">
              {([
                ['artwork', 'Scene Art'],
                ['forest', 'Forest'],
                ['town', 'Town'],
                ['doodad', 'Doodads'],
                ['prop', 'Props'],
              ] as const).map(([kind, label]) => (
                <ChromeButton unit="inner-text-button"
                  key={kind}
                  className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', placedArtKind === kind && 'active')}
                  aria-pressed={placedArtKind === kind}
                  onClick={() => selectPlacedArtKind(kind)}
                >{label}</ChromeButton>
              ))}
            </div>
            <p className="le-board-note">
              {placedArtKind === 'artwork'
                ? 'Scene Art can be placed anywhere in the scene and never affects movement.'
                : placedArtKind === 'forest'
                  ? 'Forest fills a tile-aligned area with Scene Art trees and never affects movement.'
                : placedArtKind === 'town'
                  ? 'Town lays out Scene Art buildings along streets and never affects movement.'
                : placedArtKind === 'doodad'
                  ? 'Doodads stay inside the playable board and never block movement.'
                  : 'Props stay inside the playable board and block movement.'}
            </p>
          </section>
        ) : null}

        <section className="skirmish-card">
          <h2>Brush</h2>
          {tool === 'move' ? <p className="le-board-note">Drag a placed unit or prop to a new cell. Units keep their piece, side and facing; props keep their footprint and terrain rules.</p> : null}
          <div className="le-brush-pick">
            <span
              data-chrome-unit="inner-box"
              className={chromeUnitClassNames('inner-box', 'le-brush-thumb')}
            >
              <span className="le-brush-thumb-viewport">
                {brushKind === 'unit'
                  ? <img src={unitBrushAsset.sprite(unitFaction, unitBrushDirection) ?? undefined} alt="" draggable={false} />
                  : brushKind === 'doodad'
                  ? <img src={doodadBrushAsset.front} alt="" draggable={false} />
                  : brushKind === 'prop'
                  ? <img src={propHalfSrc(propBrushDef.spriteId, 'front')} alt="" draggable={false} />
                  : brushKind === 'artwork'
                  ? artworkBrushDirection
                    ? <img src={structureArtDirectionHalfSrc(artworkBrushId, artworkBrushDirection, 'front')} alt="" draggable={false} />
                    : null
                  : brushKind === 'cover'
                  ? <GroundCoverPreview asset={coverBrushAsset} />
                  : brushKind === 'zone'
                  ? <span className={`le-brush-thumb-zone le-zone-${activeZoneColor}`} aria-hidden="true" />
                  : wallTool
                  ? <img src={wallThumbSrc(wallBrushMaterial)} alt="" draggable={false} />
                  : wallArtTool
                  ? wallArtBrush ? <WallArtPreview art={wallArtBrush} zoom={0.46} /> : null
                  : fenceTool
                  ? <img src={activeFenceArtwork
                    ? (fencePaintTarget === 'post' ? (activeFenceArtwork.post ?? activeFenceArtwork.railE) : activeFenceArtwork.railE)
                    : (fencePaintTarget === 'post' ? fencePostThumbSrc(fenceBrushMaterial) : fenceThumbSrc(fenceBrushMaterial))} alt="" draggable={false} />
                  : featureKind
                  ? <img src={featureThumbSrc(featureKind, featureBrushMaterial[featureKind])} alt="" draggable={false} />
                  : macroTileBrushAsset
                  ? <img className="le-thumb-macro" src={macroTileBrushAsset.src} alt="" draggable={false} />
                  : <img className="le-thumb-tile" src={tileTopSrc(brushAsset)} alt="" draggable={false} />}
              </span>
            </span>
            <span className="le-brush-meta">
              <strong>{brushKind === 'unit' ? unitBrushAsset.label : brushKind === 'doodad' ? doodadBrushAsset.label : brushKind === 'prop' ? propBrushDef.label : brushKind === 'artwork' ? (artworkBrushAsset?.label ?? 'No scene art') : brushKind === 'cover' ? `${coverBrushDensity} ${coverBrushAsset.label}` : brushKind === 'zone' ? (activeZone ? activeZoneName : 'No zones') : subterrainTool ? (subterrainBrushAsset?.label ?? 'No Subterrain assets') : wallTool ? `${wallMaterialLabel(wallBrushMaterial)} Wall` : wallArtTool ? wallArtLabel(wallArtBrushId) : fenceTool ? `${activeFenceArtwork?.label ?? fenceMaterialLabel(fenceBrushMaterial)} · ${fencePaintTarget}` : featureKind ? `${featureMaterialLabel(featureBrushMaterial[featureKind], featureKind)} ${featureKind}` : macroTileBrushAsset?.label ?? brushAsset.label}</strong>
              <span>Active brush · {brushKind === 'unit' ? `unit · ${LE_FACTION_LABELS[unitFaction]}` : brushKind === 'doodad' ? 'doodad' : brushKind === 'prop' ? `prop · ${propBrushDef.w}×${propBrushDef.h}` : brushKind === 'artwork' ? 'scene art' : brushKind === 'cover' ? 'ground cover' : brushKind === 'zone' ? 'zone' : subterrainTool ? 'subterrain · exposed face' : wallTool ? 'wall · edge · material' : wallArtTool ? `wall art · edge · ${wallArtBadge(wallArtBrushId)}` : fenceTool ? `fence · ${fencePaintTarget === 'post' ? 'vertex' : 'edge'}` : featureKind ? `feature · ${featureKind}` : macroTileBrushAsset ? `composite tile · ${macroTileBrushAsset.columns}×${macroTileBrushAsset.rows}` : 'tile'}</span>
            </span>
          </div>
        </section>

        {brushKind === 'cover' ? (
          <section className="skirmish-card">
            <h2>Ground cover</h2>
            <AssetSwatchList
              className="le-swatches le-cover-swatches"
              ariaLabel="Ground cover"
              items={LE_COVER_TYPES.map((cover) => ({
                id: cover.id,
                label: cover.label,
                title: `${cover.label} · ${cover.terrainLabel}`,
                className: 'le-cover-swatch',
                selected: coverBrushType === cover.id && tool !== 'erase',
                onSelect: () => { setCoverBrushType(cover.id); setBrushKind('cover'); setTool('brush'); },
                content: <>
                  <GroundCoverPreview asset={cover} zoom={0.72} />
                  <small>{cover.label}</small>
                </>,
              }))}
            />
            <div className="le-seg">
              <ChromeButton unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', coverBrushDensity === 'sparse' && 'active')} onClick={() => setCoverBrushDensity('sparse')}>Sparse</ChromeButton>
              <ChromeButton unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', coverBrushDensity === 'filled' && 'active')} onClick={() => setCoverBrushDensity('filled')}>Filled</ChromeButton>
            </div>
            <p className="le-board-note">Brush paints {coverBrushDensity} {coverBrushAsset.label} on any tile; Erase clears a tile. The cover scatters from the density.</p>
            <div className="le-ctrlrow">
              <span className="le-ctrllabel">Scatter seed</span>
              <ChromeButton unit="inner-text-button"
                className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
                onClick={() => setCoverBrushSeed(randomGeneratorSeed())}
              >Random</ChromeButton>
            </div>
            <SliderRow
              label={`Seed · ${coverBrushSeed}`}
              value={coverBrushSeed}
              set={(value) => setCoverBrushSeed(Math.round(value))}
              min={1}
              max={MAX_GENERATOR_SEED}
              step={1}
              nudge={1}
              dflt={LEGACY_GROUND_COVER_SEED}
            />
            <p className="le-board-note">The seed shapes cover painted from now on. Cover already on the board keeps the arrangement it was painted with, and the game renders exactly that.</p>
            <p className="le-board-note">{coverCount} tile{coverCount === 1 ? '' : 's'} with cover.</p>
          </section>
        ) : null}

        {brushKind === 'zone' ? (
          <section className="skirmish-card le-brush-panel le-zone-panel">
            <h2>Zone</h2>
            <div className="le-ctrlrow le-zone-selection-row">
              <span className="le-ctrllabel">Zone</span>
              <div className="le-zone-select-controls">
                <CyclePicker
                  className="le-zone-cycle"
                  buttonClassName="le-zone-stepper-button"
                  previousLabel="Previous zone"
                  nextLabel="Next zone"
                  previousDisabled={visibleZoneIndices.length <= 1}
                  nextDisabled={visibleZoneIndices.length <= 1}
                  onPrevious={() => stepZoneEntry(-1)}
                  onNext={() => stepZoneEntry(1)}
                >
                  <HouseSelect<string>
                    value={activeZone?.id ?? ''}
                    options={[
                      ...(activeZone ? [] : [{ value: '', label: 'None' }]),
                      ...visibleZoneIndices.map((index) => ({ value: boardZoneEntries[index].id, label: zoneDisplayName(boardZoneEntries[index], index) })),
                    ]}
                    disabled={!activeZone}
                    ariaLabel="Selected zone"
                    onChange={selectZoneEntry}
                  />
                </CyclePicker>
                <ChromeButton unit="inner-minus-key" className={chromeUnitClassNames('inner-minus-key', 'settings-chrome-button', 'settings-chrome-button-neutral', 'le-zone-stepper-button')} aria-label="Remove selected zone" title="Remove selected zone" disabled={!activeZone} onClick={removeActiveZoneEntry}>
                  <span><span className="stepper-glyph stepper-minus" aria-hidden="true" /></span>
                </ChromeButton>
                <ChromeButton unit="inner-plus-key" className={chromeUnitClassNames('inner-plus-key', 'settings-chrome-button', 'settings-chrome-button-neutral', 'le-zone-stepper-button')} aria-label="Add zone" title="Add zone" onClick={addZoneEntry}>
                  <span><span className="stepper-glyph stepper-plus" aria-hidden="true" /></span>
                </ChromeButton>
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
              <HouseSelect<ZoneColor>
                className="le-zone-color-select"
                value={activeZoneColor}
                options={LE_ZONE_COLOR_OPTIONS.map((option) => ({
                  value: option.color,
                  label: (
                    <span className="le-zone-color-choice">
                      <span className={`le-zone-dot le-zone-${option.color}`} aria-hidden="true" />
                      <span className="le-zone-color-choice-label">{option.label}</span>
                    </span>
                  ),
                }))}
                disabled={!activeZone}
                ariaLabel={`Zone color, selected ${activeZoneColorLabel}`}
                onChange={setActiveZoneColor}
              />
            </div>
            <p className="le-board-note">
              {activeZone?.type === 'player-spawn'
                ? activeZone.excludedPieceTypes?.length
                  ? `Player Deployment. Automatic placement puts every piece except ${LE_BREAKABLE_DEPLOYMENT_TYPES.filter(({ pieceType }) => activeZone.excludedPieceTypes?.includes(pieceType)).map(({ label }) => `${label}s`).join(' and ')} here; an Adlected unit may still be placed here by hand.`
                  : 'Player Deployment. The Run army starts on these squares.'
                : activeZone?.type === 'player-king-spawn'
                ? 'King Deployment. The King may start here, and takes its square before any other unit.'
                : activeZone?.type === 'enemy-spawn'
                ? 'Enemy Deployment. The randomized enemy roster starts on these squares.'
                : 'Brush paints cells into the selected zone. Events decide what that zone does.'}
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
            <AssetSwatchList
              ariaLabel="Units"
              items={leUnitAssets.map((unit) => ({
                id: unit.id,
                label: unit.label,
                title: unit.label,
                selected: unitBrushId === unit.id && tool !== 'erase',
                onSelect: () => { setUnitBrushId(unit.id); setBrushKind('unit'); setTool('brush'); },
                content: <>
                  <img
                    src={unit.sprite(unitFaction, hasDirectionSprite(unit, unitBrushDirection) ? unitBrushDirection : 'south') ?? undefined}
                    alt=""
                    draggable={false}
                  />
                  <small>{unit.label}</small>
                </>,
              }))}
            />
          </section>
        ) : brushKind === 'doodad' ? (
          <section className="skirmish-card le-brush-panel">
            <h2>Doodads</h2>
              <AssetSwatchList
                ariaLabel="Doodads"
                items={doodadAssets.map((doodad) => ({
                    id: doodad.id,
                    label: doodad.label,
                    title: `${doodad.label} · ${doodad.terrains.join(', ')}`,
                    selected: doodadBrushId === doodad.id && tool !== 'erase',
                    onSelect: () => {
                      setDoodadBrushId(doodad.id);
                      setPlacedArtKind('doodad');
                      setBrushKind('doodad');
                      setTool('brush');
                    },
                    content: <>
                    <img src={doodad.front} alt="" draggable={false} />
                    <small>{doodad.label}</small>
                    </>,
                }))}
              />
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
                  <AssetSwatchList
                    ariaLabel={`${kind} props`}
                    items={group.map((def) => ({
                        id: def.id,
                        label: def.label,
                        title: `${def.label} · ${def.w}×${def.h} · ${def.terrains.join(', ')}${def.blocking ? ' · blocks' : ''}`,
                        selected: propBrushId === def.id && tool !== 'erase',
                        onSelect: () => {
                          setPropBrushId(def.id);
                          setPlacedArtKind('prop');
                          setBrushKind('prop');
                          setLayer('placed-art');
                          setTool('brush');
                        },
                        content: <>
                        <img src={propHalfSrc(def.spriteId, 'front')} alt="" draggable={false} />
                        <small>{def.label}</small>
                        </>,
                    }))}
                  />
                </div>
              );
            })}
            <p className="le-board-note">This prop spans {propBrushDef.w}×{propBrushDef.h} tile{propBrushDef.w * propBrushDef.h > 1 ? 's' : ''}, anchored at the clicked cell. Props only land where every footprint tile is one of their terrains and no unit or other prop is in the way. Blocking props (trees, houses, rocks) become impassable in play.</p>
          </section>
        ) : brushKind === 'town' ? (
          <section className="skirmish-card le-brush-panel le-town-panel" data-testid="town-controls">
            <h2>Towns</h2>
            <p className="le-board-note">Drag out the grid cells the town will use, or press Add town for an area in the middle of the view. Tune its settings, then press Generate. Every town is kept so you can select, retune, and regenerate it. Buildings are Scene Art: visual only, never on the playable grid, no collision.</p>
            {/* Same shape the Generate panel uses for its saved regions: one dropdown of saved
                instances, with a danger icon to drop the active one. */}
            <div className="le-gen-unit-row">
              <div className="le-gen-unit-select">
                <span>Town</span>
                <HouseSelect<string>
                  value={selectedTownId ?? ''}
                  onChange={(id) => setSelectedTownId(id || null)}
                  ariaLabel="Saved town"
                  options={boardTowns.length
                    ? boardTowns.map((town) => ({
                      value: town.id,
                      label: `${town.name} · ${placementGroundLabel(generatorInstanceAreas(town))}`,
                    }))
                    : [{ value: '', label: 'No towns yet' }]}
                />
              </div>
              {selectedTown ? (
                <ChromeButton unit="inner-tool-square"
                  className={chromeUnitClassNames('inner-tool-square', 'le-gen-icon', 'danger')}
                  onClick={() => removeTown(selectedTown)}
                  title={`Remove ${selectedTown.name}`}
                  aria-label={`Remove ${selectedTown.name}`}
                >×</ChromeButton>
              ) : null}
            </div>
            <ChromeButton unit="inner-text-button"
              className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
              style={{ width: '100%' }}
              onClick={addTownAtView}
              title="Place a town in the middle of the current view. Drag on the board to choose the ground yourself."
            >+ Add town</ChromeButton>
            {boardTowns.length ? null : (
              <p className="le-board-note">Or drag out an area on the board to choose the ground yourself.</p>
            )}
            {selectedTown ? (
              <div className="le-gen-scope">
                <span className="le-gen-scope-label">Ground · {placementGroundLabel(townAreas)}</span>
                {townAreas.length > 1 ? (
                  <ChromeButton unit="inner-text-button"
                    className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
                    onClick={() => dropLastTownArea(selectedTown)}
                    title={`Take the last area back off ${selectedTown.name}. Regenerate to rebuild it on the smaller ground.`}
                  >Undo last area</ChromeButton>
                ) : null}
              </div>
            ) : null}
            {selectedTown ? (
              <p className="le-board-note">Shift-drag on the board to add another area to {selectedTown.name}, so it need not be one rectangle — bend it around a corner, or pan and carry it on past the edge of the view. Regenerate to rebuild it across the whole ground.</p>
            ) : null}
            {selectedTown ? (<>
              <h2 className="le-card-subhead">Sections</h2>
              <p className="le-board-note">You define each approach; the generator decides where it belongs inside the selected patch. A mixed Section shares the preceding Section's generated territory. A distinct Section receives another automatically generated territory.</p>
              <GeneratorRecipePresetList
                label="Town presets"
                ariaLabel="Town presets"
                presets={TOWN_PRESETS.map((preset) => {
                  const configured = townPresetConfiguration(preset.id, townBuildingCatalog);
                  return {
                    id: preset.id,
                    label: preset.label,
                    description: preset.description,
                    disabled: !configured,
                    title: `${preset.description} Replaces this Town's complete Section collection without generating.`,
                    onSelect: () => {
                      if (!configured) return;
                      const sections = configured.sections.map(({ relationship, ...approach }) => (
                        materializeTownApproach(approach, relationship)
                      ));
                      updateTown(selectedTown.id, { sections });
                      setExpandedTownSections(new Set());
                      setExpandedTownBuildings(new Set());
                      setTownPicker(null);
                      setTownSited(null);
                    },
                  };
                })}
                note="A preset replaces this Town's complete Section collection. Every resulting Section remains explicit and editable; the outer patch and generated output stay unchanged until Generate."
              />
              {selectedTown.sections.map((section, index) => (
                <div className="le-town-section le-gen-region-group" key={section.id}>
                  <div className="le-ctrlrow le-town-section-head">
                    <ChromeButton unit="inner-tool-square"
                      className={chromeUnitClassNames('inner-tool-square', 'settings-chrome-button', 'settings-chrome-button-neutral', 'le-gen-cover-caret-btn', townSectionOpen(section) && 'active')}
                      onClick={() => toggleTownSectionExpand(section.id)}
                      aria-expanded={townSectionOpen(section)}
                      aria-label={townSectionOpen(section) ? `Collapse Section ${index + 1}` : `Expand Section ${index + 1}`}
                    >
                      <span className="le-gen-cover-caret" aria-hidden="true">{townSectionOpen(section) ? '▾' : '▸'}</span>
                    </ChromeButton>
                    <h2 className="le-card-subhead le-town-section-title">Section {index + 1}</h2>
                    <span className="le-ctrllabel le-town-section-summary">
                      {section.buildings.length
                        ? `${section.buildings.length} kind${section.buildings.length === 1 ? '' : 's'} · ${section.scaleMean.toFixed(2)}×`
                        : 'add a building below'}
                    </span>
                    <ChromeButton unit="inner-tool-square"
                      className={chromeUnitClassNames('inner-tool-square', 'le-gen-icon', 'danger')}
                      onClick={() => {
                        setExpandedTownSections((current) => {
                          const next = new Set(current);
                          next.delete(section.id);
                          return next;
                        });
                        if (townPicker?.sectionId === section.id) setTownPicker(null);
                        updateTown(selectedTown.id, {
                          sections: selectedTown.sections.filter((entry) => entry.id !== section.id),
                        });
                      }}
                      title={`Remove Section ${index + 1}`}
                      aria-label={`Remove Section ${index + 1}`}
                    >×</ChromeButton>
                  </div>
                  {townSectionOpen(section) ? (<>
                  {index > 0 ? (
                    <div className="le-ctrlrow">
                      <span className="le-ctrllabel">How it joins</span>
                      <div className="le-seg" role="group" aria-label={`Section ${index + 1} relationship`}>
                        {([['mixed', 'Mixed'], ['distinct', 'Distinct']] as const).map(([relationship, label]) => (
                          <ChromeButton unit="inner-text-button"
                            key={relationship}
                            className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', section.relationship === relationship && 'active')}
                            aria-pressed={section.relationship === relationship}
                            title={relationship === 'mixed'
                              ? 'Share the preceding Section’s automatically chosen territory.'
                              : 'Receive another automatically chosen territory inside the Town patch.'}
                            onClick={() => updateTownSection(selectedTown.id, section.id, { relationship })}
                          >{label}</ChromeButton>
                        ))}
                      </div>
                    </div>
                  ) : <p className="le-board-note">This first Section starts the composition and uses the full patch unless another distinct Section is added.</p>}
                  <span className="le-pal-grouplabel">Plan</span>
                  <div className="le-seg le-town-plan-seg" role="group" aria-label={`Section ${index + 1} plan`}>
                    {TOWN_PLAN_KINDS.map((kind) => (
                      <ChromeButton unit="inner-text-button"
                        key={kind}
                        className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', section.plan === kind && 'active')}
                        aria-pressed={section.plan === kind}
                        title={TOWN_PLAN_NOTES[kind]}
                        onClick={() => updateTownSection(selectedTown.id, section.id, { plan: kind })}
                      >{TOWN_PLAN_LABELS[kind]}</ChromeButton>
                    ))}
                  </div>
                  <p className="le-board-note">{TOWN_PLAN_NOTES[section.plan as TownPlanKind]}</p>
                  <span className="le-pal-grouplabel">Buildings</span>
                  {/* Buildings are entries you add, exactly like the Generate panel's cover sets:
                      each names itself in a dropdown and carries its own weight. A swatch grid
                      hid which buildings were in, because the only signal was a selected border. */}
                  <div className="le-gen-cover">
                    {section.buildings.map((entry, entryIndex) => (
                      <div className="le-gen-cover-entry" key={entry.id}>
                        <div className="le-gen-cover-head">
                          <ChromeButton unit="inner-tool-square"
                            className={chromeUnitClassNames('inner-tool-square', 'settings-chrome-button', 'settings-chrome-button-neutral', 'le-gen-cover-caret-btn', expandedTownBuildings.has(entry.id) && 'active')}
                            onClick={() => toggleTownBuildingExpand(entry.id)}
                            aria-expanded={expandedTownBuildings.has(entry.id)}
                            aria-label={expandedTownBuildings.has(entry.id) ? 'Collapse building settings' : 'Expand building settings'}
                          >
                            <span className="le-gen-cover-caret" aria-hidden="true">{expandedTownBuildings.has(entry.id) ? '▾' : '▸'}</span>
                          </ChromeButton>
                          {/* The entry shows the art itself and opens the picker when clicked. A
                              prose dropdown made you read names to choose a picture. */}
                          <ChromeButton unit="inner-text-button"
                            className={chromeUnitClassNames('inner-text-button', 'le-town-building-pick', townPicker?.entryId === entry.id && 'active')}
                            aria-expanded={townPicker?.entryId === entry.id}
                            aria-label={`Section ${index + 1} building ${entryIndex + 1}`}
                            title="Choose a different building"
                            onClick={() => setTownPicker((current) => (
                              current?.entryId === entry.id ? null : { sectionId: section.id, entryId: entry.id }
                            ))}
                          >
                            {townBuildingCatalog.some((asset) => asset.id === entry.sourceArtId) ? (
                              <img src={structureArtDirectionHalfSrc(entry.sourceArtId, 'south', 'front')} alt="" draggable={false} />
                            ) : null}
                            <span>{townBuildingCatalog.find((asset) => asset.id === entry.sourceArtId)?.label ?? 'Pick a building'}</span>
                          </ChromeButton>
                          <ChromeButton unit="inner-tool-square"
                            className={chromeUnitClassNames('inner-tool-square', 'le-gen-icon', 'danger')}
                            onClick={() => updateTownSection(selectedTown.id, section.id, {
                              buildings: section.buildings.filter((other) => other.id !== entry.id),
                            })}
                            title="Remove this building"
                            aria-label="Remove this building"
                          >×</ChromeButton>
                        </div>
                        {expandedTownBuildings.has(entry.id) ? (
                          <div className="le-gen-cover-knobs">
                            <SliderRow
                              label={`How often · ${entry.weight.toFixed(1)}`}
                              value={entry.weight}
                              set={(weight) => updateTownSection(selectedTown.id, section.id, {
                                buildings: section.buildings.map((other) => (
                                  other.id === entry.id ? { ...other, weight } : other)),
                              })}
                              min={0} max={5} step={0.1} nudge={0.1} dflt={1}
                            />
                          </div>
                        ) : null}
                      </div>
                    ))}
                    <ChromeButton unit="inner-text-button"
                      className={chromeUnitClassNames('inner-text-button', 'le-gen-cover-add', townPicker?.sectionId === section.id && townPicker.entryId === null && 'active')}
                      aria-expanded={townPicker?.sectionId === section.id && townPicker.entryId === null}
                      onClick={() => setTownPicker((current) => (
                        current?.sectionId === section.id && current.entryId === null
                          ? null
                          : { sectionId: section.id, entryId: null }
                      ))}
                      title="Add a building kind to this District."
                    >+ Add building</ChromeButton>
                    {townPicker?.sectionId === section.id ? (
                      <div className="le-town-building-picker">
                        <span className="le-pal-grouplabel">Choose an individual building</span>
                        <AssetSwatchList
                          ariaLabel={townPicker.entryId ? 'Choose a building' : 'Add a building'}
                          items={townBuildingCatalog.map((asset) => ({
                            id: `town-pick-${section.id}-${asset.id}`,
                            label: asset.label,
                            title: asset.label,
                            selected: townPicker.entryId
                              ? section.buildings.some((other) => other.id === townPicker.entryId && other.sourceArtId === asset.id)
                              : false,
                            onSelect: () => {
                              // Picking is the whole interaction: fill the entry, then close.
                              const addedBuildingId = `b${Math.random().toString(36).slice(2, 8)}`;
                              updateTownSection(selectedTown.id, section.id, townPicker.entryId
                                ? {
                                  buildings: section.buildings.map((other) => (
                                    other.id === townPicker.entryId ? { ...other, sourceArtId: asset.id } : other)),
                                }
                                : {
                                  buildings: [...section.buildings, {
                                    id: addedBuildingId,
                                    sourceArtId: asset.id,
                                    weight: 1,
                                  }],
                                });
                              if (!townPicker.entryId) {
                                setExpandedTownBuildings((current) => new Set(current).add(addedBuildingId));
                              }
                              setTownPicker(null);
                            },
                            content: <>
                              <img src={structureArtDirectionHalfSrc(asset.id, 'south', 'front')} alt="" draggable={false} />
                              <small>{asset.label}</small>
                            </>,
                          }))}
                        />
                      </div>
                    ) : null}
                  </div>
                  {/* These belong to the DISTRICT, not to a building. Without a label of their own
                      they read as more knobs on the last building entry. */}
                  <span className="le-pal-grouplabel">This Section</span>
                  <SliderRow label={`Buildings · ${section.size}`} value={section.size} set={(value) => updateTownSection(selectedTown.id, section.id, { size: Math.round(value) })} min={2} max={80} step={1} nudge={1} dflt={TOWN_PLAN_DEFAULTS.size} />
                  <SliderRow label={`Average building · ${section.scaleMean.toFixed(2)}×`} value={section.scaleMean} set={(value) => updateTownSection(selectedTown.id, section.id, { scaleMean: value })} min={0.3} max={2.5} step={0.05} nudge={0.05} dflt={1} />
                  <SliderRow label={`Smallest · ${section.scaleMin.toFixed(2)}×`} value={section.scaleMin} set={(value) => updateTownSection(selectedTown.id, section.id, { scaleMin: value })} min={0.2} max={2.5} step={0.05} nudge={0.05} dflt={0.75} />
                  <SliderRow label={`Largest · ${section.scaleMax.toFixed(2)}×`} value={section.scaleMax} set={(value) => updateTownSection(selectedTown.id, section.id, { scaleMax: value })} min={0.2} max={3} step={0.05} nudge={0.05} dflt={1.35} />
                  {/* Mutually exclusive, and each turns itself off when pressed again. Showing an
                      example is something you ask for while judging a number, not a mode to be in. */}
                  <div className="le-ctrlrow le-town-size-preview">
                    <span className="le-ctrllabel">Show on board</span>
                    {([['min', 'Smallest'], ['max', 'Largest']] as const).map(([bound, label]) => {
                      const on = townSizePreview?.sectionId === section.id && townSizePreview.bound === bound;
                      return (
                        <ChromeButton unit="inner-text-button"
                          key={bound}
                          className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', on && 'active')}
                          aria-pressed={on}
                          disabled={!section.buildings.length}
                          title={section.buildings.length
                            ? `Stand one ${label.toLowerCase()} building on the board for scale`
                            : 'Add a building to this section first'}
                          onClick={() => toggleTownSizePreview(section.id, bound)}
                        >{label}</ChromeButton>
                      );
                    })}
                  </div>
                  <SliderRow label={`Frontage each · ${pixelsInTilesAcross(section.plotWidth).toFixed(1)} tiles`} value={section.plotWidth} set={(value) => updateTownSection(selectedTown.id, section.id, { plotWidth: value })} min={40} max={300} step={5} nudge={5} dflt={DEFAULT_TOWN_SECTION.plotWidth} />
                  <SliderRow label={`Street setback · ${pixelsInTilesAcross(section.setback).toFixed(1)} tiles`} value={section.setback} set={(value) => updateTownSection(selectedTown.id, section.id, { setback: value })} min={20} max={260} step={2} nudge={2} dflt={TOWN_PLAN_DEFAULTS.setback} />
                  <SliderRow label={`Gap between buildings · ${pixelsInTilesAcross(section.spacing).toFixed(1)} tiles`} value={section.spacing} set={(value) => updateTownSection(selectedTown.id, section.id, { spacing: value })} min={0} max={200} step={2} nudge={2} dflt={TOWN_PLAN_DEFAULTS.spacing} />
                  <span className="le-pal-grouplabel">When a building will not fit</span>
                  <div className="le-seg" role="group" aria-label={`Section ${index + 1} fit policy`}>
                    {TOWN_FIT_POLICIES.map((policy) => (
                      <ChromeButton unit="inner-text-button"
                        key={policy}
                        className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', section.fit === policy && 'active')}
                        aria-pressed={section.fit === policy}
                        title={TOWN_FIT_NOTES[policy]}
                        onClick={() => updateTownSection(selectedTown.id, section.id, { fit: policy })}
                      >{TOWN_FIT_LABELS[policy]}</ChromeButton>
                    ))}
                  </div>
                  <p className="le-board-note">{TOWN_FIT_NOTES[section.fit as TownFitPolicy]} Buildings never overlap each other and never overhang the generated territory.</p>
                  <span className="le-pal-grouplabel">Acceptable variation</span>
                  <SliderRow label={`Looseness · ${Math.round(section.looseness * 100)}%`} value={section.looseness} set={(value) => updateTownSection(selectedTown.id, section.id, { looseness: value })} min={0} max={1} step={0.05} nudge={0.05} dflt={TOWN_PLAN_DEFAULTS.looseness} />
                  <SliderRow label={`Off-axis buildings · ${Math.round(section.facingWobble * 100)}%`} value={section.facingWobble} set={(value) => updateTownSection(selectedTown.id, section.id, { facingWobble: value })} min={0} max={1} step={0.05} nudge={0.05} dflt={TOWN_PLAN_DEFAULTS.facingWobble} />
                  </>) : null}
                </div>
              ))}
              {!selectedTown.sections.length ? (
                <p className="le-board-note">No Sections yet. Add one to define what this Town can generate.</p>
              ) : null}
              <ChromeButton unit="inner-text-button"
                className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
                onClick={() => {
                  const added = newTownSection(selectedTown.sections.length ? 'mixed' : 'distinct');
                  setExpandedTownSections((current) => new Set(current).add(added.id));
                  updateTown(selectedTown.id, { sections: [...selectedTown.sections, added] });
                }}
              >{selectedTown.sections.length ? '+ Add mixed Section' : '+ Add Section'}</ChromeButton>
              {selectedTown.sections.length ? (
                <ChromeButton unit="inner-text-button"
                  className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
                  onClick={() => {
                    const added = newTownSection('distinct');
                    setExpandedTownSections((current) => new Set(current).add(added.id));
                    updateTown(selectedTown.id, { sections: [...selectedTown.sections, added] });
                  }}
                >+ Add distinct Section</ChromeButton>
              ) : null}
              <p className="le-board-note">Mixed Sections share generated ground. Distinct Sections receive separate generator-chosen ground inside the same Town patch; you never draw internal areas.</p>
              {/* Counts and placement settings live inside each Section. */}
              <h2 className="le-card-subhead">Placement</h2>
              <GeneratorSeedControl
                generatorName="this Town"
                seedLabel="Layout seed"
                fixed={selectedTown.fixedSeed === true}
                seed={selectedTown.seed}
                defaultSeed={TOWN_PLAN_DEFAULTS.seed}
                onFixedChange={(fixedSeed) => updateTown(selectedTown.id, { fixedSeed })}
                onSeedChange={(seed) => updateTown(selectedTown.id, { seed })}
              />
              <div className="le-ctrlrow">
                <ChromeButton unit="inner-text-button"
                  className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
                  disabled={selectedTown.sections.every((section) => !section.buildings.some((building) => building.weight > 0))}
                  title={selectedTown.sections.every((section) => !section.buildings.some((building) => building.weight > 0))
                    ? selectedTown.sections.length
                      ? 'Add a building to a Section first — there is nothing to build yet.'
                      : 'Add a Section first — there is nothing to build yet.'
                    : selectedTownGenerated
                      ? 'Rebuild this town from its current settings.'
                      : 'Build this town from its current settings.'}
                  onClick={() => generateTown(selectedTown)}
                >{selectedTownGenerated ? 'Regenerate' : 'Generate'}</ChromeButton>
                <ChromeButton unit="inner-text-button"
                  className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
                  onClick={resetTownParams}
                >Reset settings</ChromeButton>
              </div>
              {selectedTown.sections.every((section) => !section.buildings.some((building) => building.weight > 0))
                ? null
                : townSited && townSited.placed < townSited.target ? (
                <p className="le-board-note">
                  Placed {townSited.placed} of {townSited.target}.{' '}
                  {townSited.outside >= Math.max(1, townSited.spacing)
                      ? `${townSited.outside} building${townSited.outside === 1 ? '' : 's'} would have overhung the area — drag a bigger area, or build smaller.`
                      : townSited.spacing > 0
                        ? `${townSited.spacing === 1 ? '1 building had' : `${townSited.spacing} buildings had`} no room beside the neighbours — lower Gap between buildings, or build smaller.`
                        : 'The area ran out of street frontage — drag a bigger area or lower Frontage per building.'}
                </p>
              ) : townSited ? <p className="le-board-note">Placed {townSited.placed} buildings.</p> : null}
              {selectedTown.sections.every((section) => !section.buildings.some((building) => building.weight > 0))
                ? <p className="le-board-note">{selectedTown.sections.length ? 'Pick at least one building for a Section' : 'Add a Section and pick at least one building'}, then press Generate.</p>
                : null}
            </>) : null}
          </section>
        ) : brushKind === 'forest' ? (
          <section className="skirmish-card le-brush-panel le-forest-panel" data-testid="forest-controls">
            <h2>Forest</h2>
            <p className="le-board-note">Drag out the grid cells for a saved Forest, including cells in the scenic apron, or add one in the middle of the view. Choose its contents and settings, then press Generate. Every Forest remains selectable, editable, and rerunnable.</p>
            <div className="le-gen-unit-row">
              <div className="le-gen-unit-select">
                <span>Forest</span>
                <HouseSelect<string>
                  value={selectedForestId ?? ''}
                  onChange={(id) => {
                    setSelectedForestId(id || null);
                    setForestPicker(null);
                    setForestGenerationResult(null);
                  }}
                  ariaLabel="Saved Forest"
                  options={boardForests.length
                    ? boardForests.map((forest) => ({
                      value: forest.id,
                      label: `${forest.name} · ${placementGroundLabel(generatorInstanceAreas(forest))}`,
                    }))
                    : [{ value: '', label: 'No Forests yet' }]}
                />
              </div>
              {selectedForest ? (
                <ChromeButton unit="inner-tool-square"
                  className={chromeUnitClassNames('inner-tool-square', 'le-gen-icon', 'danger')}
                  onClick={() => removeForest(selectedForest)}
                  title={`Remove ${selectedForest.name}`}
                  aria-label={`Remove ${selectedForest.name}`}
                >×</ChromeButton>
              ) : null}
            </div>
            <ChromeButton unit="inner-text-button"
              className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
              style={{ width: '100%' }}
              onClick={addForestAtView}
              title="Place a saved Forest in the middle of the current view. Drag on the board to choose the ground yourself."
            >+ Add Forest</ChromeButton>
            {boardForests.length ? null : (
              <p className="le-board-note">Or drag out an area on the board to choose the ground yourself. Nothing is generated until you press Generate.</p>
            )}
            {selectedForest ? (
              <div className="le-gen-scope">
                <span className="le-gen-scope-label">Ground · {placementGroundLabel(forestAreas)}</span>
                {forestAreas.length > 1 ? (
                  <ChromeButton unit="inner-text-button"
                    className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
                    onClick={() => dropLastForestArea(selectedForest)}
                    title={`Take the last area back off ${selectedForest.name}. Generate to rebuild it on the smaller ground.`}
                  >Undo last area</ChromeButton>
                ) : null}
              </div>
            ) : null}
            {selectedForest ? (
              <p className="le-board-note">Shift-drag on the board to add another area to {selectedForest.name}, so it need not be one rectangle — wrap it around a lake, or pan and carry it on past the edge of the view. Generate to rebuild it across the whole ground.</p>
            ) : null}
            {selectedForest ? (<>
              <h2 className="le-card-subhead">Sections</h2>
              <p className="le-board-note">You define each Forest approach; the generator decides where it belongs inside the selected patch. Mixed Sections share generated ground, while distinct Sections receive separate generated ground.</p>
              <GeneratorRecipePresetList
                label="Forest presets"
                ariaLabel="Forest presets"
                presets={FOREST_ART_PRESETS.map((preset) => {
                  const configured = forestPresetConfiguration(preset.id, forestSpeciesCatalog);
                  return {
                    id: preset.id,
                    label: preset.label,
                    description: preset.description,
                    disabled: !configured,
                    title: `${preset.description} Replaces this Forest's complete Section collection without generating.`,
                    onSelect: () => {
                      if (!configured) return;
                      const sections = configured.sections.map(({ relationship, ...approach }) => (
                        materializeForestApproach(approach, relationship)
                      ));
                      updateForest(selectedForest.id, { sections });
                      setExpandedForestSections(new Set());
                      setExpandedForestTrees(new Set());
                      setForestPicker(null);
                      setForestGenerationResult(null);
                    },
                  };
                })}
                note="A preset replaces this Forest's complete Section collection. Every resulting Section remains explicit and editable; the outer patch and generated output stay unchanged until Generate."
              />
              {selectedForest.sections.map((section, sectionIndex) => (
                <div className="le-town-section le-gen-region-group" key={section.id}>
                  <div className="le-ctrlrow le-town-section-head">
                    <ChromeButton unit="inner-tool-square"
                      className={chromeUnitClassNames('inner-tool-square', 'settings-chrome-button', 'settings-chrome-button-neutral', 'le-gen-cover-caret-btn', forestSectionOpen(section) && 'active')}
                      onClick={() => setExpandedForestSections((current) => {
                        const next = new Set(current);
                        if (next.has(section.id)) next.delete(section.id); else next.add(section.id);
                        return next;
                      })}
                      aria-expanded={forestSectionOpen(section)}
                      aria-label={forestSectionOpen(section) ? `Collapse Forest Section ${sectionIndex + 1}` : `Expand Forest Section ${sectionIndex + 1}`}
                    ><span className="le-gen-cover-caret" aria-hidden="true">{forestSectionOpen(section) ? '▾' : '▸'}</span></ChromeButton>
                    <h2 className="le-card-subhead le-town-section-title">Section {sectionIndex + 1}</h2>
                    <span className="le-ctrllabel le-town-section-summary">{section.trees.length ? `${section.trees.length} kind${section.trees.length === 1 ? '' : 's'} · ${section.density.toFixed(1)}/tile` : 'add Forest art below'}</span>
                    <ChromeButton unit="inner-tool-square"
                      className={chromeUnitClassNames('inner-tool-square', 'le-gen-icon', 'danger')}
                      onClick={() => {
                        setExpandedForestSections((current) => {
                          const next = new Set(current);
                          next.delete(section.id);
                          return next;
                        });
                        if (forestPicker?.sectionId === section.id) setForestPicker(null);
                        updateForest(selectedForest.id, { sections: selectedForest.sections.filter((candidate) => candidate.id !== section.id) });
                      }}
                      title={`Remove Forest Section ${sectionIndex + 1}`}
                      aria-label={`Remove Forest Section ${sectionIndex + 1}`}
                    >×</ChromeButton>
                  </div>
                  {forestSectionOpen(section) ? (<>
                  {sectionIndex > 0 ? (
                    <div className="le-ctrlrow">
                      <span className="le-ctrllabel">How it joins</span>
                      <div className="le-seg" role="group" aria-label={`Forest Section ${sectionIndex + 1} relationship`}>
                        {([['mixed', 'Mixed'], ['distinct', 'Distinct']] as const).map(([relationship, label]) => (
                          <ChromeButton unit="inner-text-button"
                            key={relationship}
                            className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', section.relationship === relationship && 'active')}
                            aria-pressed={section.relationship === relationship}
                            onClick={() => updateForestSection(selectedForest.id, section.id, { relationship })}
                          >{label}</ChromeButton>
                        ))}
                      </div>
                    </div>
                  ) : <p className="le-board-note">This first Section starts the composition and uses the full patch unless another distinct Section is added.</p>}
              <h2 className="le-card-subhead">Contents</h2>
              <p className="le-board-note">Each entry names exactly what this Section can place. “How often” controls its weight relative to the other entries.</p>
              <div className="le-gen-cover">
                {section.trees.map((tree, treeIndex) => {
                  const asset = forestSpeciesCatalog.find((candidate) => candidate.id === tree.sourceArtId);
                  const expanded = expandedForestTrees.has(tree.id);
                  return (
                    <div className="le-gen-cover-entry" key={tree.id}>
                      <div className="le-gen-cover-head">
                        <ChromeButton unit="inner-tool-square"
                          className={chromeUnitClassNames('inner-tool-square', 'settings-chrome-button', 'settings-chrome-button-neutral', 'le-gen-cover-caret-btn', expanded && 'active')}
                          onClick={() => setExpandedForestTrees((current) => {
                            const next = new Set(current);
                            if (next.has(tree.id)) next.delete(tree.id); else next.add(tree.id);
                            return next;
                          })}
                          aria-expanded={expanded}
                          aria-label={expanded ? 'Collapse Forest art settings' : 'Expand Forest art settings'}
                        ><span className="le-gen-cover-caret" aria-hidden="true">{expanded ? '▾' : '▸'}</span></ChromeButton>
                        <ChromeButton unit="inner-text-button"
                          className={chromeUnitClassNames('inner-text-button', 'le-generator-art-pick', forestPicker?.sectionId === section.id && forestPicker.entryId === tree.id && 'active')}
                          aria-expanded={forestPicker?.sectionId === section.id && forestPicker.entryId === tree.id}
                          aria-label={`Forest Section ${sectionIndex + 1} art ${treeIndex + 1}`}
                          title="Choose different Forest art"
                          onClick={() => setForestPicker((current) => (
                            current?.sectionId === section.id && current.entryId === tree.id ? null : { sectionId: section.id, entryId: tree.id }
                          ))}
                        >
                          {asset ? <img src={structureArtDirectionHalfSrc(asset.id, 'south', 'front')} alt="" draggable={false} /> : null}
                          <span>{asset?.label ?? tree.sourceArtId}</span>
                        </ChromeButton>
                        <ChromeButton unit="inner-tool-square"
                          className={chromeUnitClassNames('inner-tool-square', 'le-gen-icon', 'danger')}
                          onClick={() => {
                            updateForestSection(selectedForest.id, section.id, { trees: section.trees.filter((other) => other.id !== tree.id) });
                            if (forestPicker?.sectionId === section.id && forestPicker.entryId === tree.id) setForestPicker(null);
                          }}
                          title="Remove this Forest art entry"
                          aria-label="Remove this Forest art entry"
                        >×</ChromeButton>
                      </div>
                      {expanded ? (
                        <div className="le-gen-cover-knobs">
                          <SliderRow
                            label={`How often · ${tree.weight.toFixed(1)}`}
                            value={tree.weight}
                            set={(weight) => updateForestSection(selectedForest.id, section.id, {
                              trees: section.trees.map((other) => other.id === tree.id ? { ...other, weight } : other),
                            })}
                            min={0}
                            max={10}
                            step={0.1}
                            nudge={0.1}
                            dflt={1}
                          />
                        </div>
                      ) : null}
                    </div>
                  );
                })}
                <ChromeButton unit="inner-text-button"
                  className={chromeUnitClassNames('inner-text-button', 'le-gen-cover-add', forestPicker?.sectionId === section.id && forestPicker.entryId === null && 'active')}
                  aria-expanded={forestPicker?.sectionId === section.id && forestPicker.entryId === null}
                  onClick={() => setForestPicker((current) => current?.sectionId === section.id && current.entryId === null ? null : { sectionId: section.id, entryId: null })}
                  title="Add a tree, understory plant, rock, or other natural Scene Art entry."
                >+ Add Forest art</ChromeButton>
                {forestPicker?.sectionId === section.id ? (
                  <div className="le-generator-art-picker">
                    <span className="le-pal-grouplabel">Choose individual art</span>
                    <AssetSwatchList
                      ariaLabel={forestPicker.entryId ? 'Choose Forest art' : 'Add Forest art'}
                      items={forestSpeciesCatalog.map((asset) => ({
                        id: `forest-pick-${selectedForest.id}-${asset.id}`,
                        label: asset.label,
                        title: asset.label,
                        selected: forestPicker.entryId
                          ? section.trees.some((tree) => tree.id === forestPicker.entryId && tree.sourceArtId === asset.id)
                          : false,
                        onSelect: () => {
                          const addedTreeId = `tr${Math.random().toString(36).slice(2, 8)}`;
                          const trees: BoardForestTree[] = forestPicker.entryId
                            ? section.trees.map((tree) => tree.id === forestPicker.entryId ? { ...tree, sourceArtId: asset.id } : tree)
                            : [...section.trees, { id: addedTreeId, sourceArtId: asset.id, weight: 1 }];
                          updateForestSection(selectedForest.id, section.id, { trees });
                          if (!forestPicker.entryId) setExpandedForestTrees((current) => new Set(current).add(addedTreeId));
                          setForestPicker(null);
                        },
                        content: <>
                          <img src={structureArtDirectionHalfSrc(asset.id, 'south', 'front')} alt="" draggable={false} />
                          <small>{asset.label}</small>
                        </>,
                      }))}
                    />
                  </div>
                ) : null}
              </div>
              <h2 className="le-card-subhead">Shape</h2>
              <SliderRow label={`Density · ${section.density.toFixed(1)} per tile`} value={section.density} set={(density) => updateForestSection(selectedForest.id, section.id, { density })} min={0.2} max={6} step={0.1} nudge={0.1} dflt={FOREST_SCATTER_DEFAULTS.density} />
              <SliderRow label={`Within-cell randomness · ${Math.round(section.jitter * 100)}%`} value={section.jitter} set={(jitter) => updateForestSection(selectedForest.id, section.id, { jitter })} min={0} max={1} step={0.05} nudge={0.05} dflt={FOREST_SCATTER_DEFAULTS.jitter} />
              <SliderRow label={`Minimum spacing · ${section.spacing}px`} value={section.spacing} set={(spacing) => updateForestSection(selectedForest.id, section.id, { spacing })} min={0} max={120} step={2} nudge={2} dflt={FOREST_SCATTER_DEFAULTS.spacing} />
              <SliderRow label={`Clumping · ${Math.round(section.clumping * 100)}%`} value={section.clumping} set={(clumping) => updateForestSection(selectedForest.id, section.id, { clumping })} min={0} max={1} step={0.05} nudge={0.05} dflt={FOREST_SCATTER_DEFAULTS.clumping} />
              <SliderRow label={`Edge feathering · ${Math.round(section.falloff * 100)}%`} value={section.falloff} set={(falloff) => updateForestSection(selectedForest.id, section.id, { falloff })} min={0} max={1} step={0.05} nudge={0.05} dflt={FOREST_SCATTER_DEFAULTS.falloff} />
              <h2 className="le-card-subhead">Variation</h2>
              <SliderRow label={`Smallest · ${section.scaleMin.toFixed(2)}×`} value={section.scaleMin} set={(scaleMin) => updateForestSection(selectedForest.id, section.id, { scaleMin })} min={0.2} max={3} step={0.05} nudge={0.05} dflt={FOREST_SCATTER_DEFAULTS.scaleMin} />
              <SliderRow label={`Largest · ${section.scaleMax.toFixed(2)}×`} value={section.scaleMax} set={(scaleMax) => updateForestSection(selectedForest.id, section.id, { scaleMax })} min={0.2} max={3} step={0.05} nudge={0.05} dflt={FOREST_SCATTER_DEFAULTS.scaleMax} />
              <div className="le-ctrlrow">
                <span className="le-ctrllabel">Orientation</span>
                <div className="le-seg" role="group" aria-label="Forest orientation">
                  {([[true, 'Random'], [false, 'Fixed']] as const).map(([random, label]) => (
                    <ChromeButton unit="inner-text-button"
                      key={label}
                      className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', section.randomFacing === random && 'active')}
                      aria-pressed={section.randomFacing === random}
                      onClick={() => updateForestSection(selectedForest.id, section.id, { randomFacing: random })}
                    >{label}</ChromeButton>
                  ))}
                </div>
                {ctlReset(() => updateForestSection(selectedForest.id, section.id, { randomFacing: FOREST_SCATTER_DEFAULTS.randomFacing }))}
              </div>
              {section.randomFacing ? null : (
                <FacingCompass
                  direction={section.facing}
                  onSelect={(facing) => updateForestSection(selectedForest.id, section.id, { facing })}
                  onRotate={() => updateForestSection(selectedForest.id, section.id, {
                    facing: rookDirections[(rookDirections.indexOf(section.facing) + 1) % rookDirections.length],
                  })}
                  available={() => true}
                  ariaLabel="Forest facing"
                />
              )}
                  </>) : null}
                </div>
              ))}
              {!selectedForest.sections.length ? (
                <p className="le-board-note">No Sections yet. Add one to define what this Forest can generate.</p>
              ) : null}
              <ChromeButton unit="inner-text-button"
                className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
                onClick={() => {
                  const added = newForestSection(selectedForest.sections.length ? 'mixed' : 'distinct');
                  setExpandedForestSections((current) => new Set(current).add(added.id));
                  updateForest(selectedForest.id, { sections: [...selectedForest.sections, added] });
                }}
              >{selectedForest.sections.length ? '+ Add mixed Section' : '+ Add Section'}</ChromeButton>
              {selectedForest.sections.length ? (
                <ChromeButton unit="inner-text-button"
                  className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
                  onClick={() => {
                    const added = newForestSection('distinct');
                    setExpandedForestSections((current) => new Set(current).add(added.id));
                    updateForest(selectedForest.id, { sections: [...selectedForest.sections, added] });
                  }}
                >+ Add distinct Section</ChromeButton>
              ) : null}
              <p className="le-board-note">The generator assigns every internal territory. You only choose whether a new Section mixes with the current territory or starts another one.</p>
              <h2 className="le-card-subhead">Placement</h2>
              <GeneratorSeedControl
                generatorName="this Forest"
                seedLabel="Forest seed"
                fixed={selectedForest.fixedSeed === true}
                seed={selectedForest.seed}
                defaultSeed={FOREST_SCATTER_DEFAULTS.seed}
                onFixedChange={(fixedSeed) => updateForest(selectedForest.id, { fixedSeed })}
                onSeedChange={(seed) => updateForest(selectedForest.id, { seed })}
              />
              <div className="le-ctrlrow">
                <ChromeButton unit="inner-text-button"
                  className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
                  disabled={!selectedForest.sections.some((section) => section.trees.some((tree) => tree.weight > 0))}
                  title={selectedForest.sections.some((section) => section.trees.some((tree) => tree.weight > 0))
                    ? selectedForestGenerated
                      ? 'Rebuild this saved Forest from its current recipe and settings.'
                      : 'Generate this saved Forest from its current recipe and settings.'
                    : selectedForest.sections.length
                      ? 'Add Forest art with a positive How often value first.'
                      : 'Add a Section first — there is nothing to generate yet.'}
                  onClick={() => generateForest(selectedForest)}
                >{selectedForestGenerated ? 'Regenerate' : 'Generate'}</ChromeButton>
                <ChromeButton unit="inner-text-button"
                  className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
                  onClick={resetForestParams}
                >Reset forest settings</ChromeButton>
              </div>
              {!selectedForest.sections.some((section) => section.trees.some((tree) => tree.weight > 0)) ? (
                <p className="le-board-note">{selectedForest.sections.length ? 'Add at least one Forest art entry with a positive “How often” value to a Section' : 'Add a Section and at least one Forest art entry'}, then press Generate.</p>
              ) : forestGenerationResult?.forestId === selectedForest.id ? (
                <p className="le-board-note">Generated {forestGenerationResult.count} placement{forestGenerationResult.count === 1 ? '' : 's'}.</p>
              ) : (
                <p className="le-board-note">Area and recipe saved. Tune the settings, then press {selectedForestGenerated ? 'Regenerate' : 'Generate'}.</p>
              )}
            </>) : null}
          </section>
        ) : brushKind === 'artwork' ? (
          <section className="skirmish-card le-brush-panel">
            <h2>Scene Art</h2>
            <div className="le-ctrlrow le-artwork-selection-row">
              <span className="le-ctrllabel">Selected</span>
              <span className="le-artwork-current" data-testid="selected-artwork-readout">
                {selectedArtworkIds.length > 1
                  ? `${selectedArtworkIds.length} selected · editing ${selectedArtworkAsset?.label ?? selectedArtwork?.sourceArtId}`
                  : selectedArtwork
                    ? `${selectedArtworkAsset?.label ?? selectedArtwork.sourceArtId} · X ${selectedArtwork.pixelX}, Y ${selectedArtwork.pixelY}`
                    : 'None'}
              </span>
              <ChromeButton
                unit="inner-text-button"
                className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
                disabled={!selectedArtwork}
                onClick={() => {
                  setSelectedCell(null);
                  setSelectedArtworkId(null);
                }}
              >Clear</ChromeButton>
            </div>
            <h2 className="le-card-subhead">Facing</h2>
            <FacingCompass
              direction={artworkFacingDirection}
              onSelect={setArtworkFacing}
              onRotate={rotateArtworkFacing}
              available={(direction) => artworkFacingDirections.includes(direction)}
              ariaLabel="Artwork facing"
            />
            {(['tree', 'house', 'rock', 'doodad', 'landmark'] as const).map((kind) => {
              const group = artworkAssets.filter((asset) => asset.kind === kind);
              if (!group.length) return null;
              return (
                <div className="le-pal-group" key={`artwork-${kind}`}>
                  <span className="le-pal-grouplabel">{kind === 'tree'
                    ? 'Trees'
                    : kind === 'house'
                      ? 'Buildings'
                      : kind === 'rock'
                        ? 'Rocks'
                        : kind === 'landmark'
                          ? 'Landmarks'
                          : 'Details'}</span>
                  <AssetSwatchList
                    ariaLabel={`${kind} artwork`}
                    items={group.flatMap((asset) => {
                      const directions = structureArtDirections(asset.id);
                      const previewDirection = directions.includes(artworkBrushDirection)
                        ? artworkBrushDirection
                        : directions.includes('south')
                          ? 'south'
                          : directions[0];
                      if (!previewDirection) return [];
                      return [{
                          id: `artwork-${asset.id}`,
                          label: asset.label,
                          selected: artworkBrushId === asset.id && tool === 'brush',
                          title: `${asset.label} · visual only`,
                          onSelect: () => {
                            const disarming = artworkBrushId === asset.id && tool === 'brush';
                            setArtworkBrushId(asset.id);
                            setArtworkBrushDirection((current) => (
                              directions.includes(current)
                                ? current
                                : directions.includes('south')
                                  ? 'south'
                                  : directions[0]
                            ));
                            setPlacedArtKind('artwork');
                            setBrushKind('artwork');
                            setLayer('placed-art');
                            setArtworkSelectionActive(false);
                            setTool(disarming ? 'select' : 'brush');
                          },
                          content: <>
                          <img src={structureArtDirectionHalfSrc(asset.id, previewDirection, 'front')} alt="" draggable={false} />
                          <small>{asset.label}</small>
                          </>,
                      }];
                    })}
                  />
                </div>
              );
            })}
            <p className="le-board-note">Click a source once to arm its free-placement brush; click it again to disarm. Facing controls the next placement and rotates the currently selected artwork. Place it anywhere in the scene with no tile, footprint, terrain rule, or collision; its installed ground anchor automatically resolves overlap with walls and other scene objects. Select follows the visible art under the pointer without outlining the whole scene. Click again in the same overlap to cycle through it. Move drags only the current artwork, and Details keeps its exact pixel X/Y and scale controls.</p>
          </section>
        ) : subterrainTool ? (
          <section className="skirmish-card le-brush-panel">
            <h2>Subterrain</h2>
            <div className="le-pal-group">
              <span className="le-pal-grouplabel">Vertical surface</span>
              <AssetSwatchList
                ariaLabel="Subterrain surfaces"
                items={subterrainCatalog.map((asset) => ({
                    id: asset.id,
                    label: asset.label,
                    title: asset.label,
                    selected: subterrainBrushMaterial === asset.id && tool !== 'erase',
                    onSelect: () => { setSubterrainBrushMaterial(asset.id); setBrushKind('subterrain'); setLayer('subterrain'); setTool('brush'); },
                    content: <>
                    <img src={asset.media.surface?.media.immutableUrl} alt="" draggable={false} />
                    <small>{asset.label}</small>
                    </>,
                }))}
              />
            </div>
            <p className="le-board-note">Opt-in only. Paint a visible south or east face; unpainted terrain has no vertical surface. Repainting a tile never changes subterrain.</p>
          </section>
        ) : wallTool ? (
          <section className="skirmish-card le-brush-panel">
            <h2>Wall</h2>
            <p className="le-board-note">When on, decorative tiles accept north and west wall faces only. These walls never block play.</p>
            <div className="le-pal-group">
              <span className="le-pal-grouplabel">Back edge</span>
              <AssetSwatchList
                ariaLabel="Wall materials"
                items={wallMaterials().map((mat) => ({
                    id: `wall-${mat}`,
                    label: wallMaterialLabel(mat),
                    title: wallMaterialLabel(mat),
                    selected: wallBrushMaterial === mat && tool !== 'erase',
                    onSelect: () => { setWallBrushMaterial(mat); setBrushKind('wall'); setLayer('wall'); setTool('brush'); },
                    content: <>
                    <img src={wallThumbSrc(mat)} alt="" draggable={false} />
                    <small>{wallMaterialLabel(mat)}</small>
                    </>,
                }))}
              />
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
              <AssetSwatchList
                className="le-swatches le-wall-asset-swatches"
                ariaLabel="Wall artwork"
                items={wallArtItems().map((art) => ({
                    id: art.id,
                    label: art.label,
                    className: 'le-wall-asset-swatch',
                    selected: wallArtBrushId === art.id && tool !== 'erase',
                    title: `${art.label} - spans ${art.span} wall${art.span === 1 ? '' : 's'}`,
                    onSelect: () => { setWallArtBrushId(art.id); setWallArtPlacementFeedback(null); setBrushKind('wallart'); setLayer('wallart'); setTool('brush'); },
                    content: <>
                    <WallArtPreview art={art} zoom={0.46} />
                    <small>{art.label}</small>
                    </>,
                }))}
              />
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
            <div className="le-ctrlrow">
              <span className="le-ctrllabel">Playable border</span>
              <Toggle checked={hasPlayableFenceBorder} label="Surround the playable grid with a fence" onChange={setPlayableFenceBorder} />
            </div>
            {activeFenceArtwork ? (
              <div className="le-pal-group le-fence-artwork-picker">
                <span className="le-pal-grouplabel">Artwork</span>
                <CyclePicker
                  className="le-fence-artwork-cycle"
                  buttonClassName="le-zone-stepper-button"
                  previousLabel="Previous fence artwork"
                  nextLabel="Next fence artwork"
                  onPrevious={() => stepFenceArtwork(-1)}
                  onNext={() => stepFenceArtwork(1)}
                >
                  <HouseSelect<string>
                    value={activeFenceArtwork.id}
                    options={fenceArtCatalog.map((artwork) => ({ value: artwork.id, label: artwork.label }))}
                    ariaLabel="Fence artwork"
                    onChange={selectFenceArtwork}
                  />
                </CyclePicker>
                <div className={`le-fence-artwork-preview ${activeFenceArtwork.post ? '' : 'is-rail-only'}`.trim()} data-fence-artwork={activeFenceArtwork.id}>
                  <img src={activeFenceArtwork.railE} alt="East rail" draggable={false} />
                  <img src={activeFenceArtwork.railS} alt="South rail" draggable={false} />
                  {activeFenceArtwork.post ? <img src={activeFenceArtwork.post} alt="Post" draggable={false} /> : null}
                </div>
                <div className={`le-fence-artwork-status is-${activeFenceArtworkReview?.status ?? 'unavailable'}`}>
                  <strong>{activeFenceArtworkReview?.statusLabel}</strong>
                  <span>{activeFenceArtworkReview?.note}</span>
                </div>
              </div>
            ) : null}
            <div className="le-pal-group">
              <span className="le-pal-grouplabel">Place</span>
              <div className="le-seg" role="group" aria-label="Fence paint target">
                <ChromeButton unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', fencePaintTarget === 'rail' && 'active')} aria-pressed={fencePaintTarget === 'rail'} onClick={() => { setFencePaintTarget('rail'); setTool('brush'); }}>Rails</ChromeButton>
                <ChromeButton unit="inner-text-button"
                  className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', fencePaintTarget === 'post' && 'active')}
                  aria-pressed={fencePaintTarget === 'post'}
                  disabled={Boolean(activeFenceArtwork && !activeFenceArtwork.post)}
                  title={activeFenceArtwork && !activeFenceArtwork.post ? 'This artwork is intentionally rail-only.' : undefined}
                  onClick={() => { setFencePaintTarget('post'); setTool('brush'); }}
                >Posts</ChromeButton>
              </div>
            </div>
            {activeFenceArtwork ? (
              <div className="le-fence-material-readout">
                <span>New-stroke geometry</span>
                <strong>{fenceMaterialLabel(activeFenceArtwork.material)}</strong>
              </div>
            ) : (
              <div className="le-pal-group">
                <span className="le-pal-grouplabel">Material</span>
                <AssetSwatchList
                  ariaLabel="Fence materials"
                  items={fenceMaterials().map((mat) => ({
                      id: `fence-${mat}`,
                      label: fenceMaterialLabel(mat),
                      title: fenceMaterialLabel(mat),
                      selected: fenceBrushMaterial === mat && tool !== 'erase',
                      onSelect: () => { setFenceBrushMaterial(mat); setBrushKind('fence'); setLayer('fence'); setTool('brush'); },
                      content: <>
                      <img src={fencePaintTarget === 'post' ? fencePostThumbSrc(mat) : fenceThumbSrc(mat)} alt="" draggable={false} />
                      <small>{fenceMaterialLabel(mat)}</small>
                      </>,
                  }))}
                />
              </div>
            )}
            <p className="le-board-note">
              {fencePaintTarget === 'rail' ? <>
                Hover a tile and the nearest <strong>edge</strong> highlights; click to drop a rail on that edge
                (select Erase, then click to remove it). Boundary rails are visual; a fenced edge between
                two board tiles can&rsquo;t be crossed — both tiles stay walkable, and knights hop it (like water).
              </> : <>
                Hover a tile and the nearest <strong>corner</strong> highlights; click to author a post at that shared
                grid vertex. Posts may stand alone. Select Erase, then click to remove only the authored post; an automatic
                post still appears wherever exactly one rail ends.
              </>}
            </p>
            {activeFenceArtwork ? (
              <p className="le-board-note">
                {activeFenceArtwork.post
                  ? 'Artwork cycling restyles the same authored rails and posts without changing their saved collision geometry or production status.'
                  : 'This backend review kit is rail-only. Saved post geometry is left unchanged but intentionally hidden, and post authoring is unavailable while this kit is selected.'}
              </p>
            ) : null}
          </section>
        ) : featureKind ? (
          <section className="skirmish-card le-brush-panel">
            <h2>Path surface</h2>
            <div className="le-ctrlrow">
              <span className="le-ctrllabel">Playable border</span>
              <Toggle checked={hasPlayablePathBorder} label={`Surround the playable grid with ${featureKind === 'river' ? 'water' : 'a road'}`} onChange={setPlayablePathBorder} />
            </div>
            <div className="le-pal-group">
              <span className="le-pal-grouplabel">Roads</span>
              <AssetSwatchList
                ariaLabel="Road materials"
                items={featureMaterials('road').map((mat) => ({
                    id: `road-${mat}`,
                    label: featureMaterialLabel(mat, 'road'),
                    title: featureMaterialLabel(mat, 'road'),
                    selected: brushKind === 'road' && featureBrushMaterial.road === mat && tool !== 'erase',
                    onSelect: () => { setFeatureBrushMaterial((prev) => ({ ...prev, road: mat })); setBrushKind('road'); setLayer('paths'); setTool('brush'); },
                    content: <>
                    <img src={featureThumbSrc('road', mat)} alt="" draggable={false} />
                    <small>{featureMaterialLabel(mat, 'road')}</small>
                    </>,
                }))}
              />
            </div>
            <div className="le-pal-group">
              <span className="le-pal-grouplabel">River</span>
              <AssetSwatchList
                ariaLabel="River materials"
                items={featureMaterials('river').map((mat) => ({
                    id: `river-${mat}`,
                    label: featureMaterialLabel(mat, 'river'),
                    title: featureMaterialLabel(mat, 'river'),
                    selected: brushKind === 'river' && featureBrushMaterial.river === mat && tool !== 'erase',
                    onSelect: () => { setFeatureBrushMaterial((prev) => ({ ...prev, river: mat })); setBrushKind('river'); setLayer('paths'); setTool('brush'); },
                    content: <>
                    <img src={featureThumbSrc('river', mat)} alt="" draggable={false} />
                    <small>{featureMaterialLabel(mat, 'river')}</small>
                    </>,
                }))}
              />
            </div>
            <p className="le-board-note">
              Drag to draw a path; each tile picks its own piece (straight, corner, junction) from its like neighbours. Roads connect to roads and rivers to rivers — never to each other. Erase to cut; the ends re-cap.
            </p>
          </section>
        ) : brushKind === 'tile' ? (
          <section className="skirmish-card le-brush-panel">
            <h2>Composite terrain</h2>
            <HouseSelect<string>
              ariaLabel="Composite terrain footprint"
              value={macroTileFootprint}
              options={leMacroTileFootprints().map((footprint) => ({ value: footprint, label: footprint }))}
              onChange={(footprint) => {
                setMacroTileFootprint(footprint);
                setMacroTileBrushId(null);
              }}
            />
            {studioFamilies.map((family) => {
              const assets = leMacroTilesFor(family.id, macroTileFootprint);
              if (!assets.length) return null;
              return (
                <div className="le-pal-group" key={`macro-${family.id}`}>
                  <span className="le-pal-grouplabel">{family.label}</span>
                  <AssetSwatchList
                    ariaLabel={`${family.label} composite terrain`}
                    items={assets.map((asset) => ({
                        id: asset.id,
                        label: asset.label,
                        className: 'le-macro-swatch',
                        selected: macroTileBrushId === asset.id && tool !== 'erase',
                        title: `${asset.label} · ${asset.columns}×${asset.rows}`,
                        onSelect: () => { setMacroTileBrushId(asset.id); setTool('brush'); },
                        content: <>
                        <img src={asset.src} alt="" draggable={false} />
                        <small>{asset.label.replace(` ${asset.columns}x${asset.rows}`, '')}</small>
                        </>,
                    }))}
                  />
                </div>
              );
            })}
            <h2 className="le-card-subhead">Single tiles</h2>
              {leTileGroups().map(({ family, tiles }) => (
                <div className="le-pal-group" key={family.id}>
                  <span className="le-pal-grouplabel">{family.label}</span>
                  <AssetSwatchList
                    ariaLabel={`${family.label} single tiles`}
                    items={tiles.map((tile) => ({
                        id: tile.id,
                        label: tile.label,
                        title: tile.label,
                        selected: macroTileBrushId === null && brushId === tile.id && tool !== 'erase',
                        onSelect: () => { setMacroTileBrushId(null); setBrushId(tile.id); setTool('brush'); },
                        content: <>
                        <img src={tile.src} alt="" draggable={false} />
                        <small>{tile.label}</small>
                        </>,
                    }))}
                  />
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
            <h2>Fence layout</h2>
            <FenceConnections cell={selectedCell} cols={boardCols} rows={boardRows} fences={boardFences} posts={boardFencePosts} onPaint={paintFenceEdge} onErase={eraseFenceEdge} onPaintPost={paintFencePost} onErasePost={eraseFencePost} />
            <p className="le-board-note">Click an edge to toggle its rail or a corner dot to toggle an authored post. Dashed corner dots are automatic open ends; removing an authored post falls back to automatic behavior.</p>
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
            <div className="le-gen-scope">
              <ChromeButton unit="inner-text-button"
                className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', tool === 'region' && 'active')}
                onClick={() => setTool(tool === 'region' ? 'brush' : 'region')}
                title="Click a terrain patch to select its complete connected area. Click this button again to stop."
              >{tool === 'region' ? 'Selecting…' : 'Select area'}</ChromeButton>
              <span className="le-gen-scope-label">{regionSelection.size > 0 ? `${regionSelection.size} cells` : 'No area selected'}</span>
              {regionSelection.size > 0 ? (
                <ChromeButton unit="inner-text-button"
                  className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
                  onClick={clearRegion}
                  title="Clear the selected tile-fill area."
                >Clear</ChromeButton>
              ) : null}
            </div>
            {tool === 'region' ? <p className="le-board-note">Click a terrain patch to select its complete connected area. The selected tile can then fill that area in one edit.</p> : null}
            <ChromeButton unit="inner-text-button"
              className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
              style={{ width: '100%', marginTop: 8 }}
              disabled={regionSelection.size === 0}
              onClick={fillSelectedTileArea}
              title="Paint the exact selected tile across the selected area."
            >Fill selected area</ChromeButton>
            <div className="le-seg">
              <ChromeButton unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')} onClick={() => fillBoard('empty')} title="Fill blank terrain cells with the current tile brush.">Empty</ChromeButton>
              <ChromeButton unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')} onClick={() => fillBoard('all')} title="Fill the whole terrain layer with the current tile brush.">Whole</ChromeButton>
            </div>
          </section>
        ) : null}

        {brushKind !== 'tile' ? (
          <section className="skirmish-card">
            <h2>Layer Actions</h2>
            <ChromeButton unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', 'danger')} style={{ width: '100%' }} onClick={clearActiveLayer} title={brushKind === 'zone' ? 'Clear the selected zone entry.' : brushKind === 'fence' ? 'Clear every fence rail and authored post from this board.' : `Clear every ${brushKind === 'wallart' ? 'wall art' : brushKind} placement from this board.`}>Clear {brushKind === 'zone' ? 'active zone' : brushKind === 'wallart' ? 'wall art' : brushKind === 'fence' ? 'fences & posts' : brushKind}</ChromeButton>
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
              <ChromeButton unit="inner-minus-key" className={chromeUnitClassNames('inner-minus-key', 'le-seg-btn', 'le-icon-btn')} disabled={viewZoom <= viewMinZoom} onClick={() => adjustZoom(-0.1)} aria-label="Zoom out">−</ChromeButton>
              <span className="skirmish-zoom-readout">{Math.round(viewZoom * 100)}%</span>
              <ChromeButton unit="inner-plus-key" className={chromeUnitClassNames('inner-plus-key', 'le-seg-btn', 'le-icon-btn')} onClick={() => adjustZoom(0.1)} aria-label="Zoom in">+</ChromeButton>
              <ChromeButton unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')} onClick={resetBoardView}>Reset</ChromeButton>
            </div>
          </div>
          <div className="skirmish-view-group">
            <span className="skirmish-eyebrow">Overlays</span>
            <div className="skirmish-view-row">
              <ChromeButton unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', showMoves && 'active')} onClick={() => setShowMoves((value) => !value)} aria-pressed={showMoves}>Moves</ChromeButton>
              <ChromeButton unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', showEnemyAttacks && 'active')} onClick={() => setShowEnemyAttacks((value) => !value)} aria-pressed={showEnemyAttacks}>Attacks</ChromeButton>
              <ChromeButton unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', showBlocked && 'active')} onClick={() => setShowBlocked((value) => !value)} aria-pressed={showBlocked}>Blocks</ChromeButton>
              <ChromeButton unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', showPromotionZones && 'active')} onClick={() => setShowPromotionZones((value) => !value)} aria-pressed={showPromotionZones}>Promotion</ChromeButton>
              {isPredrawnBoard ? (
                <>
                  <ChromeButton unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', gridScope !== 'off' && 'active')} onClick={toggleRegisteredGrid} aria-pressed={gridScope !== 'off'}>Registered grid</ChromeButton>
                  {currentVersionedPredrawnSurface?.occlusionVersionId ? (
                    <ChromeButton unit="inner-text-button"
                      className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', predrawnOcclusionEnabled && 'active')}
                      onClick={togglePredrawnOcclusion}
                      aria-pressed={predrawnOcclusionEnabled}
                      title="Toggle the selected persisted depth mask against the live units on this board."
                    >Unit occlusion</ChromeButton>
                  ) : null}
                  <ChromeButton unit="inner-text-button"
                    className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', showPredrawnOcclusionSeed && 'active')}
                    onClick={togglePredrawnOcclusionSeed}
                    aria-pressed={showPredrawnOcclusionSeed}
                    title="Overlay the canonical raised geometry used to generate an occlusion candidate."
                  >Occlusion source</ChromeButton>
                </>
              ) : (
                <>
                  <ChromeButton unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', gridScope === 'playable' && 'active')} onClick={() => setGridScope((value) => value === 'playable' ? 'off' : 'playable')} aria-pressed={gridScope === 'playable'}>Playable grid</ChromeButton>
                  <ChromeButton unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', gridScope === 'whole' && 'active')} onClick={() => setGridScope((value) => value === 'whole' ? 'off' : 'whole')} aria-pressed={gridScope === 'whole'}>Whole grid</ChromeButton>
                </>
              )}
            </div>
          </div>
        </section>
        ) : null}

        {layer !== 'camera' && layer !== 'status' && layer !== 'history' && (selectedArtworkForDetails || selectedUnitAsset || selectedDoodadAsset || selectedProp || selectedAsset || selectedCell) ? (
        <section className="skirmish-card le-details">
          <h2>Details · {selectedArtworkForDetails ? 'Artwork' : selectedUnitAsset ? 'Unit' : selectedDoodadAsset ? 'Doodad' : selectedProp ? 'Prop' : selectedAsset ? 'Tile' : 'Cell'}</h2>
          {selectedArtworkForDetails ? (
            <>
              <dl>
                <div><dt>Source</dt><dd>{selectedArtworkAsset?.label ?? selectedArtworkForDetails.sourceArtId}</dd></div>
                <div><dt>Role</dt><dd>Floating overlay · no tile or gameplay object</dd></div>
              </dl>
              <div className="le-artwork-transform-grid">
                <label className="le-artwork-transform-row">
                  <span>X px</span>
                  <input
                    type="range"
                    aria-label="Artwork X pixel position"
                    min={artworkXRange.min}
                    max={artworkXRange.max}
                    step="1"
                    value={selectedArtworkForDetails.pixelX}
                    onChange={(event) => moveArtwork(selectedArtworkForDetails.id, { pixelX: Number(event.target.value), pixelY: selectedArtworkForDetails.pixelY })}
                  />
                  <input
                    className="le-text-input"
                    type="number"
                    aria-label="Artwork X pixel position value"
                    min={-MAX_FLOATING_ARTWORK_PIXEL}
                    max={MAX_FLOATING_ARTWORK_PIXEL}
                    step="1"
                    value={selectedArtworkForDetails.pixelX}
                    onChange={(event) => moveArtwork(selectedArtworkForDetails.id, { pixelX: Number(event.target.value), pixelY: selectedArtworkForDetails.pixelY })}
                  />
                </label>
                <label className="le-artwork-transform-row">
                  <span>Y px</span>
                  <input
                    type="range"
                    aria-label="Artwork Y pixel position"
                    min={artworkYRange.min}
                    max={artworkYRange.max}
                    step="1"
                    value={selectedArtworkForDetails.pixelY}
                    onChange={(event) => moveArtwork(selectedArtworkForDetails.id, { pixelX: selectedArtworkForDetails.pixelX, pixelY: Number(event.target.value) })}
                  />
                  <input
                    className="le-text-input"
                    type="number"
                    aria-label="Artwork Y pixel position value"
                    min={-MAX_FLOATING_ARTWORK_PIXEL}
                    max={MAX_FLOATING_ARTWORK_PIXEL}
                    step="1"
                    value={selectedArtworkForDetails.pixelY}
                    onChange={(event) => moveArtwork(selectedArtworkForDetails.id, { pixelX: selectedArtworkForDetails.pixelX, pixelY: Number(event.target.value) })}
                  />
                </label>
                <label className="le-artwork-transform-row">
                  <span>Scale</span>
                  <input
                    type="range"
                    aria-label="Artwork scale"
                    min="0.1"
                    max="8"
                    step="0.05"
                    value={selectedArtworkForDetails.scale}
                    onChange={(event) => updateArtwork(selectedArtworkForDetails.id, (placement) => ({
                      ...placement,
                      scale: Number.isFinite(Number(event.target.value))
                        ? Math.max(0.1, Math.min(8, Number(event.target.value)))
                        : placement.scale,
                    }))}
                  />
                  <input
                    className="le-text-input"
                    type="number"
                    aria-label="Artwork scale value"
                    min="0.1"
                    max="8"
                    step="0.05"
                    value={selectedArtworkForDetails.scale}
                    onChange={(event) => updateArtwork(selectedArtworkForDetails.id, (placement) => ({
                      ...placement,
                      scale: Number.isFinite(Number(event.target.value))
                        ? Math.max(0.1, Math.min(8, Number(event.target.value)))
                        : placement.scale,
                    }))}
                  />
                </label>
              </div>
              <div className="le-seg le-artwork-actions">
                <ChromeButton unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')} onClick={() => duplicateArtwork(selectedArtworkForDetails.id)}>Duplicate</ChromeButton>
                <ChromeButton unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', 'danger')} onClick={deleteSelectedArtwork}>{selectedArtworkIds.length > 1 ? `Delete ${selectedArtworkIds.length}` : 'Delete'}</ChromeButton>
              </div>
            </>
          ) : selectedUnitAsset && selectedUnit ? (
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
              <div><dt>Artwork</dt><dd>{artworkCount}</dd></div>
              <div><dt>Zones</dt><dd>{zoneCount}</dd></div>
            </dl>
          )}
        </section>
        ) : null}

        {/* Board-composition tally lives on the Board page only (it's a whole-board readout, not a
            per-layer control). The Details card above still surfaces the same counts contextually. */}
        {layer === 'board' ? (
        <div className="le-statusline">
          {selectedCell ? <>Cell <b>{selectedCell.x},{selectedCell.y}</b> · </> : null}<b>{paintedCount}</b> tiles · <b>{unitCount}</b> units · <b>{doodadCount}</b> doodads · <b>{propCount}</b> props · <b>{artworkCount}</b> artwork · <b>{zoneCount}</b> zones · <b>{zonedTileCount}</b> zoned tiles · {boardCols}×{boardRows}
        </div>
        ) : null}
        </div>
      </LevelEditorControlsPanel>
      )}
      </ArtRouteChrome>
    </div>
  );
}
