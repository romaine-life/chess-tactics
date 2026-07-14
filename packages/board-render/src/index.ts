import type { Level } from './core/level';
import { DEFAULT_BACKGROUND_SET } from './art/backgroundSets';
import { levelToEditorBoard } from './core/levelBoard';
import { applyPropSeats, currentSeats, type PropSeatMap } from './core/props';
import {
  applyLiveMediaCatalog,
  assertCriticalLiveMediaAvailable,
  assertInstalledChromeLiveMediaAvailable,
  type LiveMediaCatalog,
} from './art/liveMediaCatalog';
import { applyLiveUnitCatalog, type LiveUnitCatalog } from './ui/unitCatalog';
import { boardBounds, boardContentHash, boardDrawOps, boardSocialFramingBounds, type BakeBounds, type BoardDrawOp } from './render/renderPlan';

export type ServerDrawOp = BoardDrawOp;

export interface ServerRenderPlan {
  ops: ServerDrawOp[];
  bounds: BakeBounds;
  framingBounds: BakeBounds;
  contentHash: string;
}

export function levelRenderPlan(level: Level): ServerRenderPlan {
  currentSeats();
  const board = levelToEditorBoard(level);
  return {
    ops: boardDrawOps(board),
    bounds: boardBounds(board),
    framingBounds: boardSocialFramingBounds(board),
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
  assertCriticalLiveMediaAvailable();
  assertInstalledChromeLiveMediaAvailable();
  applyPropSeats(snapshot.propSeats);
  applyLiveUnitCatalog(snapshot.unitCatalog);
}

export function worldBackgroundSrc(): string {
  return DEFAULT_BACKGROUND_SET.world;
}

export * from './art/backgroundSets';
export * from './art/liveMediaCatalog';
export * from './art/projectionContract';
export * from './art/tileset';
export * from './art/tileTemplate';
export * from './core/featureAutotile';
export * from './core/groundCover';
export * from './core/level';
export * from './core/levelBoard';
export * from './core/pieces';
export * from './core/unitSpriteRegistry';
export * from './core/playRoutePresentation';
export * from './core/props';
export * from './core/structureArt';
export * from './core/macroTiles';
export * from './core/tileSockets';
export * from './core/types';
export * from './core/wallArt';
export * from './core/wallDecor';
export * from './render/boardProjection';
export * from './render/fenceOverlayDepth';
export * from './render/mirrorReflection';
export * from './render/predrawnBoard';
export * from './render/renderPlan';
export * from './render/sceneDepth';
export * from './render/structureGeometry';
export * from './render/terrainSides';
export * from './ui/boardCode';
export * from './ui/doodadCatalog';
export * from './ui/studioBoard';
export * from './ui/unitCatalog';
