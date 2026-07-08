// PURE, DOM-free render plan for a Level. Bundled to CJS by
// frontend/scripts/build-server-render.mjs so Express can composite social-card
// board thumbnails in Node without a browser.

import type { Level } from '../core/level';
import { levelToEditorBoard } from '../core/levelBoard';
import { boardDrawOps, boardBounds, boardContentHash } from './bakeBoardThumbnail';
import { DEFAULT_BACKGROUND_SET } from '../art/backgroundSets';
import { applyLiveSeats, resetLiveSeats, type PropSeatMap } from '../core/props';

export interface ServerDrawOp {
  src: string;
  dx: number;
  dy: number;
  dw: number;
  dh: number;
  z: number;
  contain?: boolean;
  sx?: number;
  sy?: number;
  sw?: number;
  sh?: number;
}

export interface ServerRenderPlan {
  ops: ServerDrawOp[];
  bounds: { minX: number; minY: number; width: number; height: number };
  contentHash: string;
}

export function levelRenderPlan(level: Level): ServerRenderPlan {
  const board = levelToEditorBoard(level);
  return {
    ops: boardDrawOps(board) as ServerDrawOp[],
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
