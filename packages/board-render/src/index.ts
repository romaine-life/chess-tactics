import type { Level } from './core/level';
import { assertInstalledPresentationCatalog, defaultBackgroundSet } from './art/backgroundSets';
import { levelToEditorBoard } from './core/levelBoard';
import { applyPropSeats, currentSeats, type PropSeatMap } from './core/props';
import {
  applyLiveMediaCatalog,
  assertCriticalLiveMediaAvailable,
  type LiveMediaCatalog,
} from './art/liveMediaCatalog';
import { applyLiveUnitCatalog, type LiveUnitCatalog } from './ui/unitCatalog';
import { applyDrawableCatalog, type DrawableCatalog } from './art/drawableCatalog';
import { applyGroundCoverCatalog } from './core/groundCover';
import { applyWallDecorCatalog } from './core/wallDecor';
import { applyWallArtCatalog } from './core/wallArt';
import {
  boardBounds,
  boardContentHash,
  boardDrawOps,
  boardPreviewFramingBounds,
  isPredrawnBackgroundActive,
  type BakeBounds,
  type BoardDrawOp,
} from './render/renderPlan';
import { predrawnOcclusionMaskOps } from './render/predrawnOcclusion';
import { predrawnOcclusionDepthMapForSurface, type PredrawnOcclusionDepthMap } from './render/predrawnOcclusionDepth';
import { isVersionedPredrawnBoardSurface, predrawnRenderSurface } from './ui/boardCode';

export type ServerDrawOp = BoardDrawOp;

export interface PredrawnBackgroundRasterRequirement {
  src: string;
  frameWidth: number;
  frameHeight: number;
}

export interface ServerRenderPlan {
  ops: ServerDrawOp[];
  occlusionMasks: ServerDrawOp[];
  predrawnBackgroundRaster?: PredrawnBackgroundRasterRequirement;
  occlusionDepthMap?: PredrawnOcclusionDepthMap;
  bounds: BakeBounds;
  framingBounds: BakeBounds;
  contentHash: string;
}

export function levelRenderPlan(level: Level): ServerRenderPlan {
  currentSeats();
  const board = levelToEditorBoard(level);
  const predrawnBackgroundActive = isPredrawnBackgroundActive(board);
  const versionedSurface = predrawnBackgroundActive
    && board.surface?.kind === 'predrawn'
    && isVersionedPredrawnBoardSurface(board.surface)
    ? board.surface
    : undefined;
  return {
    ops: boardDrawOps(board),
    occlusionMasks: predrawnBackgroundActive
      && board.surface?.kind === 'predrawn'
      && !isVersionedPredrawnBoardSurface(board.surface)
      ? predrawnOcclusionMaskOps(board)
      : [],
    ...(versionedSurface ? {
      predrawnBackgroundRaster: {
        src: `/api/background-versions/${encodeURIComponent(versionedSurface.backgroundVersionId)}/content`,
        frameWidth: versionedSurface.frameWidth,
        frameHeight: versionedSurface.frameHeight,
      },
    } : {}),
    occlusionDepthMap: predrawnBackgroundActive
      ? predrawnOcclusionDepthMapForSurface(predrawnRenderSurface(board))
      : undefined,
    bounds: boardBounds(board),
    framingBounds: boardPreviewFramingBounds(board),
    contentHash: boardContentHash(board),
  };
}

export function boardHashForLevel(level: Level): string {
  currentSeats();
  return boardContentHash(levelToEditorBoard(level));
}

export function hydratePropSeats(seats: PropSeatMap): boolean {
  return applyPropSeats(seats);
}

export interface ServerRenderSnapshot {
  mediaCatalog: LiveMediaCatalog;
  drawableCatalog: DrawableCatalog;
  propSeats: PropSeatMap;
  unitCatalog: LiveUnitCatalog;
}

/**
 * Install and validate every availability-critical renderer authority.
 *
 * The backend calls this only while holding its renderer critical section.
 * Keeping the projection in board-render makes readiness and thumbnails use
 * the same ground-cover, Chrome, prop-raster, and Unit Art validators as the
 * browser rather than maintaining a weaker server-only checklist.
 */
export function applyServerRenderSnapshot(snapshot: ServerRenderSnapshot): void {
  applyLiveMediaCatalog(snapshot.mediaCatalog);
  applyDrawableCatalog(snapshot.drawableCatalog);
  applyGroundCoverCatalog();
  applyWallDecorCatalog();
  applyWallArtCatalog();
  assertInstalledPresentationCatalog();
  assertCriticalLiveMediaAvailable();
  applyPropSeats(snapshot.propSeats);
  applyLiveUnitCatalog(snapshot.unitCatalog);
}

/**
 * Install the bounded authorities needed by board pixels only.
 *
 * A compact level derivative must not depend on shell chrome, menu backgrounds, or
 * other unrelated application media. The render plan remains fail-closed when it
 * actually resolves a missing board resource through the typed catalogs.
 */
export function applyServerThumbnailSnapshot(snapshot: ServerRenderSnapshot): void {
  applyLiveMediaCatalog(snapshot.mediaCatalog);
  applyDrawableCatalog(snapshot.drawableCatalog);
  applyGroundCoverCatalog();
  applyWallDecorCatalog();
  assertCriticalLiveMediaAvailable();
  applyPropSeats(snapshot.propSeats);
  applyLiveUnitCatalog(snapshot.unitCatalog);
}

export function worldBackgroundSrc(): string {
  return defaultBackgroundSet().world;
}

export * from './art/backgroundSets';
export * from './art/drawableCatalog';
export * from './art/liveMediaCatalog';
export * from './art/projectionContract';
export * from './art/tileset';
export * from './art/tileTemplate';
export * from './core/featureAutotile';
export * from './core/groundCover';
export * from './core/level';
export * from './core/levelMigration';
export * from './core/levelBoard';
export * from './core/sharedLevelMerge';
export * from './core/sourceArtGroundContact';
export * from './core/predrawnLevel';
export * from './core/predrawnGeneration';
export * from './core/projectedGroundFootprint';
// Canonical persistence shape for the owner-authored Image 1 crop.
export * from './core/predrawnGenerationFrame';
export * from './core/pieces';
export * from './core/unitSpriteRegistry';
export * from './core/playRoutePresentation';
export * from './core/props';
export * from './core/runLipsana';
export * from './core/scenicTerrain';
export * from './core/structureArt';
export * from './core/macroTiles';
export * from './core/tileSockets';
export * from './core/types';
export * from './core/wallArt';
export * from './core/subterrain';
export * from './core/wallDecor';
export * from './render/boardProjection';
export * from './render/boardFraming';
export * from './render/boardCameraBounds';
export * from './render/fenceOverlayDepth';
export * from './render/mirrorReflection';
export * from './render/predrawnBoard';
export * from './render/predrawnGenerationFrame';
export * from './render/predrawnOcclusion';
export * from './render/predrawnOcclusionDepth';
export * from './render/predrawnMoveHighlight';
export * from './render/predrawnRegistration';
export * from './render/renderPlan';
export * from './render/sceneDepth';
export * from './render/structureGeometry';
export * from './render/terrainSides';
export * from './ui/boardCode';
export * from './core/generatorComposition';
export * from './ui/doodadCatalog';
export * from './ui/studioBoard';
export * from './ui/unitCatalog';

// The Run model. It lives here — not in the frontend — because the server crafts Runs with the
// same transitions the game plays, so there is one implementation of pricing, rosters and
// deployment rather than two that can drift (ADR-0346).
// Only the crafter is exported here: the model and deployment modules keep names that already
// belong to core/pieces (PIECE_LABEL), and consumers of those reach them by subpath.
export * from './run/craft';
export {
  CURRENT_RUN_SAVE_VERSION,
  RUN_CARD_BY_ID,
  RUN_CARD_DECK,
  RUN_OPENING_CARD_OFFER_COUNT,
  RUN_OPENING_CARD_VALUE_MAX,
  RUN_OPENING_CARD_VALUE_MIN,
  RUN_STARTER_CARD_BY_ID,
  RUN_LIPSANON_IMMEDIATE_GOLD,
  cardExpunctioPriceTenths,
  lipsanonImmediateGoldTenths,
  performAdlectio,
  performExpunctio,
  runSectioCardOfferCount,
  sectioCardOffersAtCursor,
  sectioCardPile,
  snapshotWar,
  takeVacantiaCard,
  type RunDocument,
  type RunSaveVersion,
  type RunVacantiaState,
  type RunWarSnapshot,
} from './run/model';
