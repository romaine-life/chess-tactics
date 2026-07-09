import type { Level } from './core/level';
import { DEFAULT_BACKGROUND_SET } from './art/backgroundSets';
import { levelToEditorBoard } from './core/levelBoard';
import { applyLiveSeats, resetLiveSeats, type PropSeatMap } from './core/props';
import { boardBounds, boardContentHash, boardDrawOps, type BakeBounds, type BoardDrawOp } from './render/renderPlan';

export type ServerDrawOp = BoardDrawOp;

export interface ServerRenderPlan {
  ops: ServerDrawOp[];
  bounds: BakeBounds;
  contentHash: string;
}

export function levelRenderPlan(level: Level): ServerRenderPlan {
  const board = levelToEditorBoard(level);
  return {
    ops: boardDrawOps(board),
    bounds: boardBounds(board),
    contentHash: boardContentHash(board),
  };
}

export function boardHashForLevel(level: Level): string {
  return boardContentHash(levelToEditorBoard(level));
}

export function applyPropSeatOverrides(overrides: PropSeatMap | null | undefined): boolean {
  if (!overrides || Object.keys(overrides).length === 0) return resetLiveSeats();
  return applyLiveSeats(overrides);
}

export function worldBackgroundSrc(): string {
  return DEFAULT_BACKGROUND_SET.world;
}

export * from './art/backgroundSets';
export * from './art/projectionContract';
export * from './art/tileset';
export * from './art/tileTemplate';
export * from './core/featureAutotile';
export * from './core/groundCover';
export * from './core/level';
export * from './core/levelBoard';
export * from './core/pieces';
export * from './core/props';
export * from './core/structureArt';
export * from './core/tileSockets';
export * from './core/types';
export * from './core/wallArt';
export * from './core/wallDecor';
export * from './render/boardProjection';
export * from './render/fenceOverlayDepth';
export * from './render/renderPlan';
export * from './render/structureGeometry';
export * from './ui/boardCode';
export * from './ui/doodadCatalog';
export * from './ui/studioBoard';
export * from './ui/unitCatalog';
