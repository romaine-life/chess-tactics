// PURE, DOM-free render plan for a Level — bundled to CJS (frontend/scripts/build-server-render.mjs
// → backend/generated/board-render.cjs) so the Express backend can composite a board thumbnail in
// Node with @napi-rs/canvas and NO browser (backend/boardThumbnail.js). It re-exports only the pure
// geometry from bakeBoardThumbnail.ts; that module's browser bits (loadImage/new Image,
// createCanvas/OffscreenCanvas, bakeBoardThumbnail) live in functions this entry never references,
// so esbuild tree-shakes them out — and even if any survived, they only run when called.
//
// Contract: the ops carry origin-absolute sprite srcs ('/assets/...'); the Node compositor maps
// those to on-disk paths under the served frontend dir. Geometry (positions, z-order, the unit
// contain-fit box) is the SINGLE source of truth here, shared with the live editor — no drift.

import type { Level } from '../core/level';
import { levelToEditorBoard } from '../core/levelBoard';
import { boardDrawOps, boardBounds, boardContentHash } from './bakeBoardThumbnail';

export interface ServerDrawOp {
  src: string;
  dx: number;
  dy: number;
  dw: number;
  dh: number;
  z: number;
  /** When true, object-fit:contain the natural image into (dw,dh), centred (unit sprites). */
  contain?: boolean;
}

export interface ServerRenderPlan {
  ops: ServerDrawOp[];
  bounds: { minX: number; minY: number; width: number; height: number };
  contentHash: string;
}

/** The full draw plan for a level's board, at native tile-pixel size, z-sorted like the editor. */
export function levelRenderPlan(level: Level): ServerRenderPlan {
  const board = levelToEditorBoard(level);
  return {
    ops: boardDrawOps(board) as ServerDrawOp[],
    bounds: boardBounds(board),
    contentHash: boardContentHash(board),
  };
}

/** Stable content hash of a level's board pixels — the thumbnail cache key / og:image ?v=. */
export function boardHashForLevel(level: Level): string {
  return boardContentHash(levelToEditorBoard(level));
}
